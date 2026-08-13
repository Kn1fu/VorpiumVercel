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
 * GET /api/game/factions — List factions
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

    // Get all factions with member count
    const factionsResult = await pool.query(
      `
        SELECT f.*,
               COUNT(fm.character_id) AS member_count
        FROM factions f
        LEFT JOIN faction_members fm ON f.id = fm.faction_id
        GROUP BY f.id
        ORDER BY f.name
      `
    );

    // Check if character has a faction
    const myFactionResult = await pool.query(
      `
        SELECT fm.faction_id, fm.role,
               f.name AS faction_name, f.description, f.leader_id, f.max_members
        FROM faction_members fm
        JOIN factions f ON fm.faction_id = f.id
        WHERE fm.character_id = $1
      `,
      [char.id]
    );

    const factions = factionsResult.rows.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      leaderId: f.leader_id,
      maxMembers: f.max_members,
      memberCount: parseInt(f.member_count),
      createdAt: f.created_at,
    }));

    let myFaction = null;
    if (myFactionResult.rows.length > 0) {
      const mf = myFactionResult.rows[0];
      myFaction = {
        factionId: mf.faction_id,
        role: mf.role,
        name: mf.faction_name,
        description: mf.description,
        leaderId: mf.leader_id,
        maxMembers: mf.max_members,
      };
    }

    return NextResponse.json({ factions, myFaction });
  } catch (error) {
    console.error("Get factions failed:", error);
    return NextResponse.json(
      { error: "Failed to get factions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/game/faction — Faction actions
 * Body: { factionId, action: "join" | "leave" | "promote" | "demote", targetCharId? }
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
    const { factionId, action, targetCharId } = body;

    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      );
    }

    // ============================================================
    // JOIN
    // ============================================================
    if (action === "join") {
      if (!factionId) {
        return NextResponse.json(
          { error: "factionId is required" },
          { status: 400 }
        );
      }

      // Check if already in a faction
      const existingFaction = await pool.query(
        `SELECT faction_id FROM faction_members WHERE character_id = $1`,
        [char.id]
      );

      if (existingFaction.rows.length > 0) {
        return NextResponse.json(
          { error: "Already in a faction" },
          { status: 400 }
        );
      }

      // Check faction exists
      const factionResult = await pool.query(
        `SELECT * FROM factions WHERE id = $1`,
        [factionId]
      );

      if (factionResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Faction not found" },
          { status: 404 }
        );
      }

      const faction = factionResult.rows[0];

      // Check faction has space
      const memberCount = await pool.query(
        `SELECT COUNT(*)::int AS count FROM faction_members WHERE faction_id = $1`,
        [factionId]
      );

      if (memberCount.rows[0].count >= faction.max_members) {
        return NextResponse.json(
          { error: "Faction is full" },
          { status: 400 }
        );
      }

      // Join
      await pool.query(
        `INSERT INTO faction_members (character_id, faction_id, role) VALUES ($1, $2, 'member')`,
        [char.id, factionId]
      );

      return NextResponse.json({
        success: true,
        message: `Joined ${faction.name}`,
      });
    }

    // ============================================================
    // LEAVE
    // ============================================================
    if (action === "leave") {
      // Check if in a faction
      const myFaction = await pool.query(
        `SELECT fm.*, f.leader_id, f.name FROM faction_members fm JOIN factions f ON fm.faction_id = f.id WHERE fm.character_id = $1`,
        [char.id]
      );

      if (myFaction.rows.length === 0) {
        return NextResponse.json(
          { error: "Not in a faction" },
          { status: 400 }
        );
      }

      const fm = myFaction.rows[0];

      if (fm.leader_id === char.id) {
        // Leader leaving — check if other members exist
        const otherMembers = await pool.query(
          `SELECT character_id FROM faction_members WHERE faction_id = $1 AND character_id != $2`,
          [fm.faction_id, char.id]
        );

        if (otherMembers.rows.length > 0) {
          // Transfer leadership to another member
          const newLeader = otherMembers.rows[0].character_id;
          await pool.query(
            `UPDATE factions SET leader_id = $1 WHERE id = $2`,
            [newLeader, fm.faction_id]
          );
        }
        // If no other members, leader_id will remain but faction will be empty
      }

      // Remove from faction
      await pool.query(
        `DELETE FROM faction_members WHERE character_id = $1`,
        [char.id]
      );

      return NextResponse.json({
        success: true,
        message: `Left ${fm.name}`,
      });
    }

    // ============================================================
    // PROMOTE
    // ============================================================
    if (action === "promote") {
      if (!targetCharId) {
        return NextResponse.json(
          { error: "targetCharId is required" },
          { status: 400 }
        );
      }

      // Check I'm the leader
      const myFaction = await pool.query(
        `SELECT fm.*, f.leader_id, f.id AS faction_id FROM faction_members fm JOIN factions f ON fm.faction_id = f.id WHERE fm.character_id = $1`,
        [char.id]
      );

      if (myFaction.rows.length === 0) {
        return NextResponse.json(
          { error: "Not in a faction" },
          { status: 400 }
        );
      }

      if (myFaction.rows[0].leader_id !== char.id) {
        return NextResponse.json(
          { error: "Only the faction leader can promote members" },
          { status: 403 }
        );
      }

      // Check target is in the same faction and is a member
      const targetMember = await pool.query(
        `SELECT * FROM faction_members WHERE character_id = $1 AND faction_id = $2`,
        [targetCharId, myFaction.rows[0].faction_id]
      );

      if (targetMember.rows.length === 0) {
        return NextResponse.json(
          { error: "Target is not in your faction" },
          { status: 400 }
        );
      }

      if (targetMember.rows[0].role === "officer") {
        return NextResponse.json(
          { error: "Target is already an officer" },
          { status: 400 }
        );
      }

      await pool.query(
        `UPDATE faction_members SET role = 'officer' WHERE character_id = $1 AND faction_id = $2`,
        [targetCharId, myFaction.rows[0].faction_id]
      );

      return NextResponse.json({
        success: true,
        message: "Member promoted to officer",
      });
    }

    // ============================================================
    // DEMOTE
    // ============================================================
    if (action === "demote") {
      if (!targetCharId) {
        return NextResponse.json(
          { error: "targetCharId is required" },
          { status: 400 }
        );
      }

      // Check I'm the leader
      const myFaction = await pool.query(
        `SELECT fm.*, f.leader_id, f.id AS faction_id FROM faction_members fm JOIN factions f ON fm.faction_id = f.id WHERE fm.character_id = $1`,
        [char.id]
      );

      if (myFaction.rows.length === 0) {
        return NextResponse.json(
          { error: "Not in a faction" },
          { status: 400 }
        );
      }

      if (myFaction.rows[0].leader_id !== char.id) {
        return NextResponse.json(
          { error: "Only the faction leader can demote officers" },
          { status: 403 }
        );
      }

      // Check target is in the same faction and is an officer
      const targetMember = await pool.query(
        `SELECT * FROM faction_members WHERE character_id = $1 AND faction_id = $2`,
        [targetCharId, myFaction.rows[0].faction_id]
      );

      if (targetMember.rows.length === 0) {
        return NextResponse.json(
          { error: "Target is not in your faction" },
          { status: 400 }
        );
      }

      if (targetMember.rows[0].role !== "officer") {
        return NextResponse.json(
          { error: "Target is not an officer" },
          { status: 400 }
        );
      }

      await pool.query(
        `UPDATE faction_members SET role = 'member' WHERE character_id = $1 AND faction_id = $2`,
        [targetCharId, myFaction.rows[0].faction_id]
      );

      return NextResponse.json({
        success: true,
        message: "Officer demoted to member",
      });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Faction action failed:", error);
    return NextResponse.json(
      { error: "Failed to perform faction action" },
      { status: 500 }
    );
  }
}
