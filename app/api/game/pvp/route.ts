import { NextRequest, NextResponse } from "next/server";
import pool from "lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "lib/session";
import { rollDice } from "lib/game/dice";

export const dynamic = "force-dynamic";

async function getCharacter(discordId: string) {
  const result = await pool.query(
    `SELECT c.* FROM characters c WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1) LIMIT 1`,
    [discordId]
  );
  return result.rows[0] || null;
}

/**
 * GET /api/game/pvp — Get pending challenges and match history
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const discordId = verifySessionToken(token);

    if (!discordId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const char = await getCharacter(discordId);
    if (!char) {
      return NextResponse.json(
        { error: "No character found" },
        { status: 404 }
      );
    }

    // Get pending challenges (sent and received)
    const pendingResult = await pool.query(
      `
        SELECT pm.*,
               cc.name AS challenger_name,
               dc.name AS defender_name
        FROM pvp_matches pm
        JOIN characters cc ON pm.challenger_id = cc.id
        JOIN characters dc ON pm.defender_id = dc.id
        WHERE (pm.challenger_id = $1 OR pm.defender_id = $1)
          AND pm.status = 'pending'
        ORDER BY pm.created_at DESC
      `,
      [char.id]
    );

    // Get recent match history (last 20)
    const historyResult = await pool.query(
      `
        SELECT pm.*,
               cc.name AS challenger_name,
               dc.name AS defender_name,
               wc.name AS winner_name
        FROM pvp_matches pm
        JOIN characters cc ON pm.challenger_id = cc.id
        JOIN characters dc ON pm.defender_id = dc.id
        LEFT JOIN characters wc ON pm.winner_id = wc.id
        WHERE (pm.challenger_id = $1 OR pm.defender_id = $1)
          AND pm.status IN ('completed', 'declined')
        ORDER BY pm.completed_at DESC
        LIMIT 20
      `,
      [char.id]
    );

    return NextResponse.json({
      pending: pendingResult.rows.map((p) => ({
        id: p.id,
        challengerId: p.challenger_id,
        defenderId: p.defender_id,
        challengerName: p.challenger_name,
        defenderName: p.defender_name,
        status: p.status,
        createdAt: p.created_at,
      })),
      history: historyResult.rows.map((h) => ({
        id: h.id,
        challengerId: h.challenger_id,
        defenderId: h.defender_id,
        challengerName: h.challenger_name,
        defenderName: h.defender_name,
        winnerId: h.winner_id,
        winnerName: h.winner_name,
        status: h.status,
        xpReward: h.xp_reward,
        goldReward: h.gold_reward,
        startedAt: h.started_at,
        completedAt: h.completed_at,
      })),
    });
  } catch (error) {
    console.error("Get PvP failed:", error);
    return NextResponse.json(
      { error: "Failed to get PvP data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/game/pvp — Challenge or respond
 * Body: { targetCharId, action: "challenge" | "respond", accept?: boolean }
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

    const char = await getCharacter(discordId);
    if (!char) {
      return NextResponse.json(
        { error: "No character found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { targetCharId, action, accept } = body;

    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      );
    }

    // ============================================================
    // CHALLENGE
    // ============================================================
    if (action === "challenge") {
      if (!targetCharId) {
        return NextResponse.json(
          { error: "targetCharId is required" },
          { status: 400 }
        );
      }

      // Can't challenge yourself
      if (targetCharId === char.id) {
        return NextResponse.json(
          { error: "Cannot challenge yourself" },
          { status: 400 }
        );
      }

      // Check both are alive
      if (char.current_hp <= 0) {
        return NextResponse.json(
          { error: "You are unconscious and cannot fight" },
          { status: 400 }
        );
      }

      const targetResult = await pool.query(
        `SELECT id, name, current_hp FROM characters WHERE id = $1`,
        [targetCharId]
      );

      if (targetResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Target character not found" },
          { status: 404 }
        );
      }

      if (targetResult.rows[0].current_hp <= 0) {
        return NextResponse.json(
          { error: "Target is unconscious and cannot fight" },
          { status: 400 }
        );
      }

      // Check no active pending challenge between these two
      const existingChallenge = await pool.query(
        `
          SELECT id FROM pvp_matches
          WHERE status = 'pending'
            AND ((challenger_id = $1 AND defender_id = $2) OR (challenger_id = $2 AND defender_id = $1))
        `,
        [char.id, targetCharId]
      );

      if (existingChallenge.rows.length > 0) {
        return NextResponse.json(
          { error: "There is already a pending challenge between you" },
          { status: 400 }
        );
      }

      // Create pending match
      const matchResult = await pool.query(
        `
          INSERT INTO pvp_matches (challenger_id, defender_id, status)
          VALUES ($1, $2, 'pending')
          RETURNING *
        `,
        [char.id, targetCharId]
      );

      return NextResponse.json({
        match: matchResult.rows[0],
        message: `Challenge sent to ${targetResult.rows[0].name}`,
      });
    }

    // ============================================================
    // RESPOND
    // ============================================================
    if (action === "respond") {
      if (!targetCharId) {
        return NextResponse.json(
          { error: "targetCharId (match challenger) is required" },
          { status: 400 }
        );
      }

      if (typeof accept !== "boolean") {
        return NextResponse.json(
          { error: "accept boolean is required" },
          { status: 400 }
        );
      }

      // Find the pending match where I'm the defender
      const matchResult = await pool.query(
        `
          SELECT * FROM pvp_matches
          WHERE defender_id = $1 AND challenger_id = $2 AND status = 'pending'
        `,
        [char.id, targetCharId]
      );

      if (matchResult.rows.length === 0) {
        return NextResponse.json(
          { error: "No pending challenge found" },
          { status: 404 }
        );
      }

      const match = matchResult.rows[0];

      if (!accept) {
        // Decline
        await pool.query(
          `UPDATE pvp_matches SET status = 'declined', completed_at = NOW() WHERE id = $1`,
          [match.id]
        );

        return NextResponse.json({
          success: true,
          message: "Challenge declined",
        });
      }

      // Accept — start combat
      await pool.query(
        `
          UPDATE pvp_matches
          SET status = 'active',
              challenger_hp = (SELECT current_hp FROM characters WHERE id = $1),
              defender_hp = (SELECT current_hp FROM characters WHERE id = $2),
              started_at = NOW()
          WHERE id = $3
        `,
        [match.challenger_id, match.defender_id, match.id]
      );

      // Load both characters for combat
      const challengerResult = await pool.query(
        `
          SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.ac,
                 a.str, a.dex
          FROM characters c
          LEFT JOIN ability_scores a ON c.id = a.character_id
          WHERE c.id = $1
        `,
        [match.challenger_id]
      );

      const defenderResult = await pool.query(
        `
          SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.ac,
                 a.str, a.dex
          FROM characters c
          LEFT JOIN ability_scores a ON c.id = a.character_id
          WHERE c.id = $1
        `,
        [match.defender_id]
      );

      return NextResponse.json({
        success: true,
        match: {
          ...match,
          status: "active",
          challenger_hp: challengerResult.rows[0]?.current_hp,
          defender_hp: defenderResult.rows[0]?.current_hp,
        },
        challenger: challengerResult.rows[0],
        defender: defenderResult.rows[0],
        message: "Combat begins!",
      });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("PvP action failed:", error);
    return NextResponse.json(
      { error: "Failed to perform PvP action" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/game/pvp — Attack in active match
 * Body: { matchId, action: "attack" }
 */
export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const discordId = verifySessionToken(token);

    if (!discordId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const char = await getCharacter(discordId);
    if (!char) {
      return NextResponse.json(
        { error: "No character found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { matchId, action } = body;

    if (!matchId || action !== "attack") {
      return NextResponse.json(
        { error: "matchId and action: 'attack' are required" },
        { status: 400 }
      );
    }

    // Get match
    const matchResult = await pool.query(
      `SELECT * FROM pvp_matches WHERE id = $1`,
      [matchId]
    );

    if (matchResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Match not found" },
        { status: 404 }
      );
    }

    const match = matchResult.rows[0];

    if (match.status !== "active") {
      return NextResponse.json(
        { error: "Match is not active" },
        { status: 400 }
      );
    }

    // Verify player is in this match
    if (match.challenger_id !== char.id && match.defender_id !== char.id) {
      return NextResponse.json(
        { error: "You are not in this match" },
        { status: 403 }
      );
    }

    // Determine attacker and defender
    const isChallenger = match.challenger_id === char.id;
    const attackerHpField = isChallenger ? "challenger_hp" : "defender_hp";
    const defenderHpField = isChallenger ? "defender_hp" : "challenger_hp";
    const attackerCurrentHp = isChallenger ? match.challenger_hp : match.defender_hp;
    const defenderCurrentHp = isChallenger ? match.defender_hp : match.challenger_hp;

    if (attackerCurrentHp <= 0) {
      return NextResponse.json(
        { error: "You are at 0 HP and cannot fight" },
        { status: 400 }
      );
    }

    if (defenderCurrentHp <= 0) {
      return NextResponse.json(
        { error: "Opponent is already at 0 HP" },
        { status: 400 }
      );
    }

    // Load attacker stats
    const attackerResult = await pool.query(
      `
        SELECT c.id, c.name, c.level, c.ac,
               a.str, a.dex
        FROM characters c
        LEFT JOIN ability_scores a ON c.id = a.character_id
        WHERE c.id = $1
      `,
      [char.id]
    );

    const attacker = attackerResult.rows[0];

    // Load defender stats
    const defenderId = isChallenger ? match.defender_id : match.challenger_id;
    const defenderResult = await pool.query(
      `
        SELECT c.id, c.name, c.level, c.ac,
               a.str, a.dex
        FROM characters c
        LEFT JOIN ability_scores a ON c.id = a.character_id
        WHERE c.id = $1
      `,
      [defenderId]
    );

    const defender = defenderResult.rows[0];

    // Attacker rolls
    const attackRoll = rollDice("1d20");
    const attackMod = Math.floor((attacker.str - 10) / 2);
    const prof = Math.ceil(attacker.level / 4) + 1;
    const total = attackRoll.total + attackMod + prof;
    const isCrit = attackRoll.rolls[0] === 20;
    const isFumble = attackRoll.rolls[0] === 1;
    const hit = isCrit || (!isFumble && total >= defender.ac);

    let damage = 0;

    if (hit) {
      const dmgRoll = rollDice("1d8");
      damage = dmgRoll.total + attackMod;
      if (isCrit) {
        const critRoll = rollDice("1d8");
        damage += critRoll.total;
      }
    }

    // Apply damage to defender
    let newDefenderHp = defenderCurrentHp;
    if (hit) {
      newDefenderHp = Math.max(0, defenderCurrentHp - damage);
      await pool.query(
        `UPDATE pvp_matches SET ${defenderHpField} = $1 WHERE id = $2`,
        [newDefenderHp, match.id]
      );
    }

    // Check for winner
    let winner = null;
    let matchComplete = false;

    if (hit && newDefenderHp <= 0) {
      matchComplete = true;
      winner = char;

      const xpReward = match.xp_reward || 50;
      const goldReward = match.gold_reward || 25;

      await pool.query(
        `
          UPDATE pvp_matches
          SET status = 'completed', winner_id = $1, completed_at = NOW()
          WHERE id = $2
        `,
        [char.id, match.id]
      );

      // Award XP/GP to winner
      await pool.query(
        `UPDATE characters SET xp = xp + $1, gold = gold + $2 WHERE id = $3`,
        [xpReward, goldReward, char.id]
      );
    }

    return NextResponse.json({
      attack: {
        roll: attackRoll.total + attackMod + prof,
        isCrit,
        isFumble,
        hit,
        damage,
        breakdown: `${attackRoll.total} + ${attackMod} + ${prof} = ${total}`,
      },
      defender: {
        id: defender.id,
        name: defender.name,
        hp: newDefenderHp,
        maxHp: isChallenger ? match.challenger_hp : match.defender_hp,
      },
      matchComplete,
      winner: winner ? { id: winner.id, name: winner.name } : null,
      xpAward: matchComplete ? match.xp_reward : 0,
      goldAward: matchComplete ? match.gold_reward : 0,
      playerHp: attackerCurrentHp,
    });
  } catch (error) {
    console.error("PvP attack failed:", error);
    return NextResponse.json(
      { error: "Failed to perform PvP attack" },
      { status: 500 }
    );
  }
}
