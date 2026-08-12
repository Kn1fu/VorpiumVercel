import { NextRequest, NextResponse } from "next/server";
import pool from "lib/db";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "lib/session";
import { rollDice } from "lib/game/dice";
import { abilityMod } from "lib/game/combat";

export const dynamic = "force-dynamic";

/**
 * POST /api/game/rest — Take a short or long rest
 * Body: { type: "short" | "long" }
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const discordId = verifySessionToken(token);

    if (!discordId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const restType = body.type || "short";

    // Get character
    const charResult = await pool.query(
      `
        SELECT c.id, c.name, c.level, c.current_hp, c.max_hp,
               cl.hit_die, a."con"
        FROM characters c
        LEFT JOIN classes cl ON c.class_id = cl.id
        LEFT JOIN ability_scores a ON c.id = a.character_id
        WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1)
        LIMIT 1
      `,
      [discordId]
    );

    if (charResult.rows.length === 0) {
      return NextResponse.json(
        { error: "No character found" },
        { status: 404 }
      );
    }

    const char = charResult.rows[0];

    if (char.current_hp >= char.max_hp) {
      return NextResponse.json(
        { error: "Already at full HP" },
        { status: 400 }
      );
    }

    const conMod = abilityMod(char.con);
    const oldHp = char.current_hp;

    if (restType === "short") {
      // Short rest: roll hit dice
      const hitDiceCount = char.level;
      const diceRoll = rollDice(`${hitDiceCount}d${char.hit_die}`);
      const healing = Math.max(
        1,
        diceRoll.total + conMod * hitDiceCount
      );
      const newHp = Math.min(char.max_hp, char.current_hp + healing);

      await pool.query(
        "UPDATE characters SET current_hp = $1, death_save_successes = 0, death_save_failures = 0 WHERE id = $2",
        [newHp, char.id]
      );

      return NextResponse.json({
        type: "short",
        healed: newHp - oldHp,
        currentHp: newHp,
        maxHp: char.maxHp,
        message: `Short rest: rolled ${hitDiceCount}d${char.hit_die} = ${diceRoll.rolls.join(", ")}. Healed ${newHp - oldHp} HP.`,
      });
    }

    // Long rest: full HP + clear death saves
    await pool.query(
      "UPDATE characters SET current_hp = max_hp, death_save_successes = 0, death_save_failures = 0 WHERE id = $1",
      [char.id]
    );

    return NextResponse.json({
      type: "long",
      healed: char.maxHp - oldHp,
      currentHp: char.maxHp,
      maxHp: char.maxHp,
      message: `Long rest: fully restored to ${char.maxHp} HP.`,
    });
  } catch (error) {
    console.error("Rest failed:", error);
    return NextResponse.json(
      { error: "Failed to rest" },
      { status: 500 }
    );
  }
}
