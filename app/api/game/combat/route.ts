import { NextRequest, NextResponse } from "next/server";
import pool from "lib/db";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "lib/session";
import { rollDice } from "lib/game/dice";
import { abilityMod, profBonus } from "lib/game/combat";

export const dynamic = "force-dynamic";

/**
 * POST /api/game/combat — Make a combat action
 * Body: { action: "attack" | "flee" | "cast", spellName? }
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
    const { action, spellName } = body;

    // Get character
    const charResult = await pool.query(
      `
        SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.ac,
               c.death_save_successes, c.death_save_failures,
               cl.name AS class_name, cl.primary_stat, cl.hit_die,
               a.str, a.dex, a."con", a.int, a.wis, a.cha
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

    // Get active encounter
    const encounterResult = await pool.query(
      `SELECT value FROM world_state WHERE key = $1`,
      [`encounter:${char.id}`]
    );

    if (encounterResult.rows.length === 0) {
      return NextResponse.json(
        { error: "No active encounter" },
        { status: 400 }
      );
    }

    const encounter = encounterResult.rows[0].value;

    if (encounter.enemyHp <= 0) {
      return NextResponse.json(
        { error: "Combat is already over" },
        { status: 400 }
      );
    }

    // ============================================================
    // ATTACK ACTION
    // ============================================================
    if (action === "attack") {
      const attackMod = abilityMod(char.str);
      const prof = profBonus(char.level);
      const attackRoll = rollDice("1d20");
      const total = attackRoll.total + attackMod + prof;
      const isCrit = attackRoll.rolls[0] === 20;
      const isFumble = attackRoll.rolls[0] === 1;
      const hit =
        isCrit || (!isFumble && total >= encounter.enemyAc);

      let damage = 0;
      let dmgBreakdown = "";

      if (hit) {
        const dmgRoll = rollDice("1d8");
        damage = dmgRoll.total + attackMod;
        if (isCrit) {
          const critRoll = rollDice("1d8");
          damage += critRoll.total;
          dmgBreakdown = `${dmgRoll.total} + ${critRoll.total} (crit) + ${attackMod} = ${damage}`;
        } else {
          dmgBreakdown = `${dmgRoll.total} + ${attackMod} = ${damage}`;
        }

        encounter.enemyHp = Math.max(0, encounter.enemyHp - damage);

        // Update encounter
        await pool.query(
          `UPDATE world_state SET value = $1 WHERE key = $2`,
          [JSON.stringify(encounter), `encounter:${char.id}`]
        );
      }

      // Enemy turn
      let enemyAttack = null;
      if (hit && encounter.enemyHp > 0) {
        const enemyRoll = rollDice("1d20");
        const enemyTotal = enemyRoll.total + 4;
        const enemyHit = enemyTotal >= char.ac;

        if (enemyHit) {
          const enemyDmg = rollDice("1d6");
          const newHp = Math.max(0, char.current_hp - enemyDmg.total);

          await pool.query(
            `UPDATE characters SET current_hp = $1 WHERE id = $2`,
            [newHp, char.id]
          );

          char.current_hp = newHp;
          enemyAttack = {
            roll: enemyRoll.total + 4,
            hit: true,
            damage: enemyDmg.total,
            message: `${encounter.enemyName} strikes for **${enemyDmg.total}** damage!`,
          };
        } else {
          enemyAttack = {
            roll: enemyRoll.total + 4,
            hit: false,
            damage: 0,
            message: `${encounter.enemyName} misses!`,
          };
        }
      }

      // Check for quest completion
      let questComplete = false;
      let xpAward = 0;
      let gpAward = 0;

      if (encounter.enemyHp <= 0) {
        questComplete = true;

        const questResult = await pool.query(
          `SELECT xp_reward, gp_reward FROM quests WHERE id = $1`,
          [encounter.questId]
        );

        if (questResult.rows.length > 0) {
          xpAward = questResult.rows[0].xp_reward;
          gpAward = questResult.rows[0].gp_reward;

          await pool.query(
            `UPDATE characters SET xp = xp + $1, gold = gold + $2 WHERE id = $3`,
            [xpAward, gpAward, char.id]
          );

          await pool.query(
            `UPDATE player_quests SET status = 'completed', progress = 1, completed_at = NOW() WHERE character_id = $1 AND quest_id = $2`,
            [char.id, encounter.questId]
          );
        }

        // Clean up encounter
        await pool.query(
          `DELETE FROM world_state WHERE key = $1`,
          [`encounter:${char.id}`]
        );
      }

      // Death saving throws
      let deathSave = null;
      if (char.current_hp <= 0 && !questComplete) {
        const dsRoll = rollDice("1d20");
        let successes = char.death_save_successes;
        let failures = char.death_save_failures;

        if (dsRoll.total >= 10) {
          successes += 1;
        } else {
          failures += 1;
        }

        await pool.query(
          `UPDATE characters SET death_save_successes = $1, death_save_failures = $2 WHERE id = $3`,
          [successes, failures, char.id]
        );

        deathSave = {
          roll: dsRoll.total,
          success: dsRoll.total >= 10,
          successes,
          failures,
        };

        if (failures >= 3) {
          await pool.query(
            `UPDATE characters SET status = 'dead' WHERE id = $1`,
            [char.id]
          );
        }
      }

      return NextResponse.json({
        playerAttack: {
          roll: attackRoll.total + attackMod + prof,
          isCrit,
          isFumble,
          hit,
          damage,
          breakdown: dmgBreakdown,
        },
        enemyAttack,
        encounter: {
          enemyName: encounter.enemyName,
          enemyHp: encounter.enemyHp,
          enemyMaxHp: encounter.enemyMaxHp,
          enemyAc: encounter.enemyAc,
        },
        questComplete,
        xpAward,
        gpAward,
        deathSave,
        playerHp: char.current_hp,
        playerMaxHp: char.maxHp,
      });
    }

    // ============================================================
    // FLEE ACTION
    // ============================================================
    if (action === "flee") {
      const dexRoll = rollDice("1d20");
      const dexMod = abilityMod(char.dex);
      const success = dexRoll.total + dexMod >= 10;

      if (success) {
        await pool.query(
          `DELETE FROM world_state WHERE key = $1`,
          [`encounter:${char.id}`]
        );

        return NextResponse.json({
          fled: true,
          roll: dexRoll.total + dexMod,
          message: "You escape from combat!",
        });
      } else {
        // Enemy gets an attack of opportunity
        const enemyRoll = rollDice("1d20");
        const enemyTotal = enemyRoll.total + 4;
        let enemyAttack = null;

        if (enemyTotal >= char.ac) {
          const enemyDmg = rollDice("1d6");
          const newHp = Math.max(0, char.current_hp - enemyDmg.total);

          await pool.query(
            `UPDATE characters SET current_hp = $1 WHERE id = $2`,
            [newHp, char.id]
          );

          enemyAttack = {
            damage: enemyDmg.total,
            message: `${encounter.enemyName} attacks of opportunity for **${enemyDmg.total}** damage!`,
          };
        }

        return NextResponse.json({
          fled: false,
          roll: dexRoll.total + dexMod,
          message: "You fail to flee!",
          enemyAttack,
          playerHp: char.current_hp,
          playerMaxHp: char.maxHp,
        });
      }
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Combat failed:", error);
    return NextResponse.json(
      { error: "Combat action failed" },
      { status: 500 }
    );
  }
}
