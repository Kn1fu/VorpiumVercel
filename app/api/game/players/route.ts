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
 * GET /api/game/players — Get visible players
 * Query: { scope: "nearby" | "online" | "faction" | "party" }
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
    const scope = searchParams.get("scope") || "nearby";

    if (!["nearby", "online", "faction", "party"].includes(scope)) {
      return NextResponse.json(
        { error: "Invalid scope" },
        { status: 400 }
      );
    }

    let query = "";
    const params: (string | number)[] = [];

    if (scope === "nearby") {
      // Players in same location, max 20
      query = `
        SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.location, c.status,
               cl.name AS class_name, r.name AS race_name
        FROM characters c
        LEFT JOIN classes cl ON c.class_id = cl.id
        LEFT JOIN races r ON c.race_id = r.id
        WHERE c.location = $1
          AND c.status = 'alive'
          AND c.id != $2
        ORDER BY c.name
        LIMIT 20
      `;
      params.push(char.location, char.id);
    } else if (scope === "online") {
      // All alive characters, max 50
      query = `
        SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.location, c.status,
               cl.name AS class_name, r.name AS race_name
        FROM characters c
        LEFT JOIN classes cl ON c.class_id = cl.id
        LEFT JOIN races r ON c.race_id = r.id
        WHERE c.status = 'alive'
        ORDER BY c.name
        LIMIT 50
      `;
    } else if (scope === "faction") {
      // My faction members
      query = `
        SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.location, c.status,
               cl.name AS class_name, r.name AS race_name
        FROM characters c
        LEFT JOIN classes cl ON c.class_id = cl.id
        LEFT JOIN races r ON c.race_id = r.id
        WHERE c.id IN (
          SELECT fm.character_id FROM faction_members fm
          WHERE fm.faction_id = (
            SELECT faction_id FROM faction_members WHERE character_id = $1
          )
        )
        AND c.id != $1
        ORDER BY c.name
      `;
      params.push(char.id);
    } else if (scope === "party") {
      // My party members with full stats
      query = `
        SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.location, c.status,
               cl.name AS class_name, r.name AS race_name
        FROM characters c
        LEFT JOIN classes cl ON c.class_id = cl.id
        LEFT JOIN races r ON c.race_id = r.id
        WHERE c.id IN (
          SELECT pm.character_id FROM party_members pm
          WHERE pm.party_id = (
            SELECT party_id FROM party_members WHERE character_id = $1
          )
        )
        AND c.id != $1
        ORDER BY c.name
      `;
      params.push(char.id);
    }

    const result = await pool.query(query, params);

    const players = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      level: r.level,
      className: r.class_name,
      raceName: r.race_name,
      location: r.location,
      status: r.status,
      currentHp: r.current_hp,
      maxHp: r.max_hp,
    }));

    return NextResponse.json({ players, scope });
  } catch (error) {
    console.error("Get players failed:", error);
    return NextResponse.json(
      { error: "Failed to get players" },
      { status: 500 }
    );
  }
}
