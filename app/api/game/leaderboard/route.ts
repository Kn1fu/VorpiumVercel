import { NextRequest, NextResponse } from "next/server";
import pool from "lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "lib/session";

export const dynamic = "force-dynamic";

async function getCharacter(discordId: string) {
  const result = await pool.query(
    `SELECT c.* FROM characters c WHERE c.user_id = (SELECT id FROM users WHERE discord_id = $1) LIMIT 1`,
    [discordId]
  );
  return result.rows[0] || null;
}

/**
 * GET /api/game/leaderboard — Get leaderboards
 * Query: { type: "level" | "gold" | "quests" | "xp" }
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

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "level";

    if (!["level", "gold", "quests", "xp"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid leaderboard type" },
        { status: 400 }
      );
    }

    let query = "";
    let statColumn = "";

    if (type === "level") {
      query = `
        SELECT c.id, c.name, c.level, cl.name AS class_name, r.name AS race_name,
               c.level AS stat_value
        FROM characters c
        LEFT JOIN classes cl ON c.class_id = cl.id
        LEFT JOIN races r ON c.race_id = r.id
        ORDER BY c.level DESC, c.xp DESC
        LIMIT 20
      `;
      statColumn = "level";
    } else if (type === "gold") {
      query = `
        SELECT c.id, c.name, c.level, cl.name AS class_name, r.name AS race_name,
               c.gold AS stat_value
        FROM characters c
        LEFT JOIN classes cl ON c.class_id = cl.id
        LEFT JOIN races r ON c.race_id = r.id
        ORDER BY c.gold DESC
        LIMIT 20
      `;
      statColumn = "gold";
    } else if (type === "quests") {
      query = `
        SELECT c.id, c.name, c.level, cl.name AS class_name, r.name AS race_name,
               COUNT(pq.id) AS stat_value
        FROM characters c
        LEFT JOIN classes cl ON c.class_id = cl.id
        LEFT JOIN races r ON c.race_id = r.id
        LEFT JOIN player_quests pq ON c.id = pq.character_id AND pq.status = 'completed'
        GROUP BY c.id, c.name, c.level, cl.name, r.name
        ORDER BY COUNT(pq.id) DESC
        LIMIT 20
      `;
      statColumn = "stat_value";
    } else if (type === "xp") {
      query = `
        SELECT c.id, c.name, c.level, cl.name AS class_name, r.name AS race_name,
               c.xp AS stat_value
        FROM characters c
        LEFT JOIN classes cl ON c.class_id = cl.id
        LEFT JOIN races r ON c.race_id = r.id
        ORDER BY c.xp DESC
        LIMIT 20
      `;
      statColumn = "xp";
    }

    const result = await pool.query(query);

    // Find my rank
    let myRank = null;
    for (let i = 0; i < result.rows.length; i++) {
      if (result.rows[i].id === char.id) {
        myRank = i + 1;
        break;
      }
    }

    // If not in top 20, calculate rank
    if (myRank === null) {
      if (type === "level") {
        const rankResult = await pool.query(
          `SELECT COUNT(*)::int AS rank FROM characters WHERE level > $1 OR (level = $1 AND xp > $2)`,
          [char.level, char.xp]
        );
        myRank = rankResult.rows[0].rank + 1;
      } else if (type === "gold") {
        const rankResult = await pool.query(
          `SELECT COUNT(*)::int AS rank FROM characters WHERE gold > $1`,
          [char.gold]
        );
        myRank = rankResult.rows[0].rank + 1;
      } else if (type === "xp") {
        const rankResult = await pool.query(
          `SELECT COUNT(*)::int AS rank FROM characters WHERE xp > $1`,
          [char.xp]
        );
        myRank = rankResult.rows[0].rank + 1;
      } else if (type === "quests") {
        const rankResult = await pool.query(
          `
            SELECT COUNT(*)::int AS rank FROM (
              SELECT COUNT(*) AS quest_count
              FROM characters c2
              LEFT JOIN player_quests pq2 ON c2.id = pq2.character_id AND pq2.status = 'completed'
              GROUP BY c2.id
              HAVING COUNT(*) > (
                SELECT COUNT(*) FROM player_quests pq3 WHERE pq3.character_id = $1 AND pq3.status = 'completed'
              )
            ) sub
          `,
          [char.id]
        );
        myRank = rankResult.rows[0].rank + 1;
      }
    }

    return NextResponse.json({
      type,
      rankings: result.rows.map((r, i) => ({
        rank: i + 1,
        id: r.id,
        name: r.name,
        level: r.level,
        className: r.class_name,
        raceName: r.race_name,
        value: parseInt(r.stat_value),
      })),
      myRank,
    });
  } catch (error) {
    console.error("Get leaderboard failed:", error);
    return NextResponse.json(
      { error: "Failed to get leaderboard" },
      { status: 500 }
    );
  }
}
