import { NextRequest, NextResponse } from "next/server";
import pool from "lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "lib/session";
import { rollDice } from "lib/game/dice";
import { abilityMod, profBonus } from "lib/game/combat";

export const dynamic = "force-dynamic";

async function getCharacter(discordId: string) {
  const result = await pool.query(
    `SELECT c.* FROM characters c WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1) LIMIT 1`,
    [discordId]
  );
  return result.rows[0] || null;
}

/**
 * GET /api/game/world-events — Get active world events
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

    const result = await pool.query(
      `
        SELECT we.*,
               COUNT(ep.character_id) AS participant_count,
               COALESCE(SUM(ep.damage_dealt), 0) AS total_damage
        FROM world_events we
        LEFT JOIN event_participants ep ON we.id = ep.event_id
        WHERE we.is_active = true AND we.expires_at > NOW()
        GROUP BY we.id
        ORDER BY we.created_at DESC
      `
    );

    const events = result.rows.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      eventType: e.event_type,
      difficulty: e.difficulty,
      enemyName: e.enemy_name,
      enemyHp: e.enemy_hp,
      enemyMaxHp: e.enemy_max_hp,
      enemyAc: e.enemy_ac,
      xpReward: e.xp_reward,
      gpReward: e.gp_reward,
      expiresAt: e.expires_at,
      participantCount: parseInt(e.participant_count),
      totalDamage: parseInt(e.total_damage),
    }));

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Get world events failed:", error);
    return NextResponse.json(
      { error: "Failed to get world events" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/game/world-events — Join or attack event
 * Body: { eventId, action: "join" | "attack" }
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
    const { eventId, action } = body;

    if (!eventId || !action) {
      return NextResponse.json(
        { error: "eventId and action are required" },
        { status: 400 }
      );
    }

    // Check event exists and is active
    const eventResult = await pool.query(
      `SELECT * FROM world_events WHERE id = $1`,
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    const event = eventResult.rows[0];

    if (!event.is_active) {
      return NextResponse.json(
        { error: "Event is no longer active" },
        { status: 400 }
      );
    }

    if (new Date(event.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Event has expired" },
        { status: 400 }
      );
    }

    // ============================================================
    // JOIN
    // ============================================================
    if (action === "join") {
      // Check if already joined
      const existing = await pool.query(
        `SELECT * FROM event_participants WHERE event_id = $1 AND character_id = $2`,
        [eventId, char.id]
      );

      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: "Already joined this event" },
          { status: 400 }
        );
      }

      await pool.query(
        `INSERT INTO event_participants (event_id, character_id, damage_dealt) VALUES ($1, $2, 0)`,
        [eventId, char.id]
      );

      return NextResponse.json({
        success: true,
        message: "Joined event",
      });
    }

    // ============================================================
    // ATTACK
    // ============================================================
    if (action === "attack") {
      // Check if joined
      const participant = await pool.query(
        `SELECT * FROM event_participants WHERE event_id = $1 AND character_id = $2`,
        [eventId, char.id]
      );

      if (participant.rows.length === 0) {
        return NextResponse.json(
          { error: "You must join the event before attacking" },
          { status: 400 }
        );
      }

      // Check player is alive
      if (char.current_hp <= 0) {
        return NextResponse.json(
          { error: "You are unconscious! Take a rest first." },
          { status: 400 }
        );
      }

      // Get participant count for scaling
      const participantCount = await pool.query(
        `SELECT COUNT(*)::int AS count FROM event_participants WHERE event_id = $1`,
        [eventId]
      );

      const count = participantCount.rows[0].count;

      // Scale enemy by participant count
      const bonusHp = count * 10;
      const bonusAc = Math.floor(count / 5) * 2;

      // Load enemy from world_state or use event data
      const worldStateResult = await pool.query(
        `SELECT value FROM world_state WHERE key = $1`,
        [`event:${eventId}`]
      );

      let enemy;

      if (worldStateResult.rows.length > 0) {
        enemy = worldStateResult.rows[0].value;
      } else {
        enemy = {
          enemyName: event.enemy_name,
          enemyHp: event.enemy_hp + bonusHp,
          enemyMaxHp: event.enemy_max_hp + bonusHp,
          enemyAc: event.enemy_ac + bonusAc,
        };

        // Store scaled enemy
        await pool.query(
          `INSERT INTO world_state (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = $2`,
          [`event:${eventId}`, JSON.stringify(enemy)]
        );
      }

      // Player attacks
      const charResult = await pool.query(
        `
          SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.ac,
                 cl.name AS class_name, cl.primary_stat,
                 a.str, a.dex, a."con", a.int, a.wis, a.cha
          FROM characters c
          LEFT JOIN classes cl ON c.class_id = cl.id
          LEFT JOIN ability_scores a ON c.id = a.character_id
          WHERE c.id = $1
        `,
        [char.id]
      );

      const charStats = charResult.rows[0];

      // Use primary stat for attack
      let attackMod = 0;
      if (charStats.primary_stat === "STR") {
        attackMod = abilityMod(charStats.str);
      } else if (charStats.primary_stat === "DEX") {
        attackMod = abilityMod(charStats.dex);
      } else if (charStats.primary_stat === "INT") {
        attackMod = abilityMod(charStats.int);
      } else if (charStats.primary_stat === "WIS") {
        attackMod = abilityMod(charStats.wis);
      } else if (charStats.primary_stat === "CHA") {
        attackMod = abilityMod(charStats.cha);
      }

      const prof = profBonus(charStats.level);
      const attackRoll = rollDice("1d20");
      const total = attackRoll.total + attackMod + prof;
      const isCrit = attackRoll.rolls[0] === 20;
      const isFumble = attackRoll.rolls[0] === 1;
      const hit = isCrit || (!isFumble && total >= enemy.enemyAc);

      let damage = 0;

      if (hit) {
        const dmgRoll = rollDice("1d8");
        damage = dmgRoll.total + attackMod;
        if (isCrit) {
          const critRoll = rollDice("1d8");
          damage += critRoll.total;
        }

        enemy.enemyHp = Math.max(0, enemy.enemyHp - damage);

        // Update enemy
        await pool.query(
          `UPDATE world_state SET value = $1 WHERE key = $2`,
          [JSON.stringify(enemy), `event:${eventId}`]
        );

        // Update damage dealt
        await pool.query(
          `UPDATE event_participants SET damage_dealt = damage_dealt + $1 WHERE event_id = $2 AND character_id = $3`,
          [damage, eventId, char.id]
        );
      }

      // Enemy attacks
      let enemyAttack = null;
      if (hit && enemy.enemyHp > 0) {
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

          enemyAttack = {
            roll: enemyRoll.total + 4,
            hit: true,
            damage: enemyDmg.total,
            message: `${enemy.enemyName} strikes for **${enemyDmg.total}** damage!`,
          };
        } else {
          enemyAttack = {
            roll: enemyRoll.total + 4,
            hit: false,
            damage: 0,
            message: `${enemy.enemyName} misses!`,
          };
        }
      }

      // Check for event completion
      let eventComplete = false;
      let xpAward = 0;
      let gpAward = 0;

      if (enemy.enemyHp <= 0) {
        eventComplete = true;

        // Award XP/GP to all participants proportional to damage dealt
        const participants = await pool.query(
          `SELECT character_id, damage_dealt FROM event_participants WHERE event_id = $1`,
          [eventId]
        );

        const totalDamage = participants.rows.reduce(
          (sum, p) => sum + (p.damage_dealt || 0),
          0
        );

        for (const p of participants.rows) {
          const proportion = totalDamage > 0 ? (p.damage_dealt || 0) / totalDamage : 1 / participants.rows.length;
          const xp = Math.floor(event.xp_reward * proportion);
          const gp = Math.floor(event.gp_reward * proportion);

          if (xp > 0 || gp > 0) {
            await pool.query(
              `UPDATE characters SET xp = xp + $1, gold = gold + $2 WHERE id = $3`,
              [xp, gp, p.character_id]
            );
          }

          if (p.character_id === char.id) {
            xpAward = xp;
            gpAward = gp;
          }
        }

        // Mark event inactive
        await pool.query(
          `UPDATE world_events SET is_active = false WHERE id = $1`,
          [eventId]
        );

        // Clean up world state
        await pool.query(
          `DELETE FROM world_state WHERE key = $1`,
          [`event:${eventId}`]
        );
      }

      return NextResponse.json({
        playerAttack: {
          roll: attackRoll.total + attackMod + prof,
          isCrit,
          isFumble,
          hit,
          damage,
        },
        enemyAttack,
        enemy: {
          name: enemy.enemyName,
          hp: enemy.enemyHp,
          maxHp: enemy.enemyMaxHp,
          ac: enemy.enemyAc,
        },
        eventComplete,
        xpAward,
        gpAward,
        playerHp: char.current_hp,
        playerMaxHp: char.max_hp,
      });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("World event action failed:", error);
    return NextResponse.json(
      { error: "Failed to perform event action" },
      { status: 500 }
    );
  }
}
