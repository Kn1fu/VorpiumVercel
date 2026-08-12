import { NextRequest, NextResponse } from "next/server";
import pool from "lib/db";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/game/quests — Get available and active quests
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

    // Get character level
    const charResult = await pool.query(
      `
        SELECT c.id, c.level, c.current_hp
        FROM characters c
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

    // Get available quests
    const availableResult = await pool.query(
      `
        SELECT id, name, description, min_level, max_level,
               xp_reward, gp_reward, type, difficulty
        FROM quests
        WHERE min_level <= $1 AND max_level >= $1
        ORDER BY min_level ASC
      `,
      [char.level]
    );

    // Get active quests
    const activeResult = await pool.query(
      `
        SELECT pq.id, pq.status, pq.progress, pq.started_at,
               q.id AS quest_id, q.name, q.description,
               q.xp_reward, q.gp_reward, q.difficulty
        FROM player_quests pq
        JOIN quests q ON pq.quest_id = q.id
        WHERE pq.character_id = $1 AND pq.status = 'active'
        ORDER BY pq.started_at DESC
      `,
      [char.id]
    );

    // Get completed quests
    const completedResult = await pool.query(
      `
        SELECT pq.id, pq.completed_at,
               q.id AS quest_id, q.name, q.xp_reward, q.gp_reward
        FROM player_quests pq
        JOIN quests q ON pq.quest_id = q.id
        WHERE pq.character_id = $1 AND pq.status = 'completed'
        ORDER BY pq.completed_at DESC
        LIMIT 10
      `,
      [char.id]
    );

    return NextResponse.json({
      available: availableResult.rows,
      active: activeResult.rows,
      completed: completedResult.rows,
      characterLevel: char.level,
      isDead: char.current_hp <= 0,
    });
  } catch (error) {
    console.error("Get quests failed:", error);
    return NextResponse.json(
      { error: "Failed to get quests" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/game/quests — Start a quest
 * Body: { questId }
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
    const { questId } = body;

    if (!questId) {
      return NextResponse.json(
        { error: "Missing questId" },
        { status: 400 }
      );
    }

    // Get character
    const charResult = await pool.query(
      `
        SELECT c.id, c.level, c.current_hp
        FROM characters c
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

    if (char.current_hp <= 0) {
      return NextResponse.json(
        { error: "You are unconscious! Take a rest first." },
        { status: 400 }
      );
    }

    // Check if quest exists and is available
    const questResult = await pool.query(
      `SELECT * FROM quests WHERE id = $1`,
      [questId]
    );

    if (questResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Quest not found" },
        { status: 404 }
      );
    }

    const quest = questResult.rows[0];

    if (quest.min_level > char.level || quest.max_level < char.level) {
      return NextResponse.json(
        { error: "Quest level requirement not met" },
        { status: 400 }
      );
    }

    // Check if already on this quest
    const existingQuest = await pool.query(
      `SELECT id FROM player_quests WHERE character_id = $1 AND quest_id = $2 AND status = 'active'`,
      [char.id, questId]
    );

    if (existingQuest.rows.length > 0) {
      return NextResponse.json(
        { error: "Already on this quest" },
        { status: 400 }
      );
    }

    // Start the quest
    await pool.query(
      `
        INSERT INTO player_quests (character_id, quest_id, status, progress)
        VALUES ($1, $2, 'active', 0)
      `,
      [char.id, questId]
    );

    // Generate encounter
    const difficultyHP: Record<string, [number, number]> = {
      Easy: [8, 15],
      Normal: [15, 30],
      Hard: [30, 50],
      Deadly: [50, 100],
    };

    const hpRange = difficultyHP[quest.difficulty] || [10, 20];
    const enemyHp =
      Math.floor(Math.random() * (hpRange[1] - hpRange[0])) + hpRange[0];
    const enemyAc = Math.floor(Math.random() * 5) + 10;

    const enemyName = quest.name.includes("Rat")
      ? "Giant Rat"
      : quest.name.includes("Goblin")
        ? "Goblin"
        : quest.name.includes("Bandit")
          ? "Bandit"
          : quest.name.includes("Dragon")
            ? "Ancient Dragon"
            : quest.name.includes("Merchant")
              ? "Suspicious Figure"
              : "Enemy";

    await pool.query(
      `
        INSERT INTO world_state (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = $2
      `,
      [
        `encounter:${char.id}`,
        JSON.stringify({
          questId,
          questName: quest.name,
          enemyHp,
          enemyMaxHp: enemyHp,
          enemyAc,
          enemyName,
        }),
      ]
    );

    return NextResponse.json({
      quest: {
        id: quest.id,
        name: quest.name,
        description: quest.description,
        difficulty: quest.difficulty,
        xpReward: quest.xp_reward,
        gpReward: quest.gp_reward,
      },
      encounter: {
        enemyName,
        enemyHp,
        enemyAc,
      },
    });
  } catch (error) {
    console.error("Start quest failed:", error);
    return NextResponse.json(
      { error: "Failed to start quest" },
      { status: 500 }
    );
  }
}
