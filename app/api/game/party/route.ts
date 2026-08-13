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
 * GET /api/game/party — Get my party with members
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

    // Find the party this character belongs to
    const memberResult = await pool.query(
      `SELECT pm.party_id FROM party_members pm WHERE pm.character_id = $1`,
      [char.id]
    );

    if (memberResult.rows.length === 0) {
      return NextResponse.json({ party: null });
    }

    const partyId = memberResult.rows[0].party_id;

    // Get party details
    const partyResult = await pool.query(
      `SELECT p.* FROM parties p WHERE p.id = $1`,
      [partyId]
    );

    if (partyResult.rows.length === 0) {
      return NextResponse.json({ party: null });
    }

    const party = partyResult.rows[0];

    // Get all members with their stats
    const membersResult = await pool.query(
      `
        SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.location, c.status,
               cl.name AS class_name,
               CASE WHEN p.leader_id = c.id THEN true ELSE false END AS is_leader
        FROM party_members pm
        JOIN characters c ON pm.character_id = c.id
        LEFT JOIN classes cl ON c.class_id = cl.id
        JOIN parties p ON pm.party_id = p.id
        WHERE pm.party_id = $1
        ORDER BY c.name
      `,
      [partyId]
    );

    return NextResponse.json({
      party: {
        id: party.id,
        name: party.name,
        leaderId: party.leader_id,
        maxMembers: party.max_members,
        createdAt: party.created_at,
        members: membersResult.rows.map((m) => ({
          id: m.id,
          name: m.name,
          level: m.level,
          className: m.class_name,
          currentHp: m.current_hp,
          maxHp: m.max_hp,
          location: m.location,
          status: m.status,
          isLeader: m.is_leader,
        })),
      },
    });
  } catch (error) {
    console.error("Get party failed:", error);
    return NextResponse.json(
      { error: "Failed to get party" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/game/party — Create a new party
 * Body: { name }
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

    // Check if already in a party
    const existingParty = await pool.query(
      `SELECT party_id FROM party_members WHERE character_id = $1`,
      [char.id]
    );

    if (existingParty.rows.length > 0) {
      return NextResponse.json(
        { error: "Already in a party" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Party name is required" },
        { status: 400 }
      );
    }

    // Create party
    const partyResult = await pool.query(
      `INSERT INTO parties (name, leader_id) VALUES ($1, $2) RETURNING *`,
      [name.trim(), char.id]
    );

    const party = partyResult.rows[0];

    // Add creator as first member (leader)
    await pool.query(
      `INSERT INTO party_members (character_id, party_id) VALUES ($1, $2)`,
      [char.id, party.id]
    );

    return NextResponse.json({
      party: {
        id: party.id,
        name: party.name,
        leaderId: party.leader_id,
        maxMembers: party.max_members,
        createdAt: party.created_at,
        members: [
          {
            id: char.id,
            name: char.name,
            level: char.level,
            className: null,
            currentHp: char.current_hp,
            maxHp: char.max_hp,
            location: char.location,
            status: char.status,
            isLeader: true,
          },
        ],
      },
    });
  } catch (error) {
    console.error("Create party failed:", error);
    return NextResponse.json(
      { error: "Failed to create party" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/game/party — Party actions
 * Body: { action, partyId?, targetCharId? }
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
    const { action, partyId, targetCharId } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Action is required" },
        { status: 400 }
      );
    }

    // ============================================================
    // JOIN
    // ============================================================
    if (action === "join") {
      if (!partyId) {
        return NextResponse.json(
          { error: "partyId is required" },
          { status: 400 }
        );
      }

      // Check if already in a party
      const existingParty = await pool.query(
        `SELECT party_id FROM party_members WHERE character_id = $1`,
        [char.id]
      );

      if (existingParty.rows.length > 0) {
        return NextResponse.json(
          { error: "Already in a party" },
          { status: 400 }
        );
      }

      // Check party exists and has space
      const partyResult = await pool.query(
        `SELECT * FROM parties WHERE id = $1`,
        [partyId]
      );

      if (partyResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Party not found" },
          { status: 404 }
        );
      }

      const party = partyResult.rows[0];

      // Count current members
      const memberCount = await pool.query(
        `SELECT COUNT(*)::int AS count FROM party_members WHERE party_id = $1`,
        [partyId]
      );

      if (memberCount.rows[0].count >= party.max_members) {
        return NextResponse.json(
          { error: "Party is full" },
          { status: 400 }
        );
      }

      // Join
      await pool.query(
        `INSERT INTO party_members (character_id, party_id) VALUES ($1, $2)`,
        [char.id, partyId]
      );

      return NextResponse.json({
        success: true,
        message: "Joined party",
      });
    }

    // ============================================================
    // LEAVE
    // ============================================================
    if (action === "leave") {
      // Find my party
      const memberResult = await pool.query(
        `SELECT pm.party_id FROM party_members pm WHERE pm.character_id = $1`,
        [char.id]
      );

      if (memberResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Not in a party" },
          { status: 400 }
        );
      }

      const partyId = memberResult.rows[0].party_id;

      // Check if leader
      const partyResult = await pool.query(
        `SELECT * FROM parties WHERE id = $1`,
        [partyId]
      );

      if (partyResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Party not found" },
          { status: 404 }
        );
      }

      const party = partyResult.rows[0];
      const isLeader = party.leader_id === char.id;

      // Count members
      const memberCount = await pool.query(
        `SELECT COUNT(*)::int AS count FROM party_members WHERE party_id = $1`,
        [partyId]
      );

      if (isLeader && memberCount.rows[0].count === 1) {
        // Leader is only member — delete party
        await pool.query(
          `DELETE FROM party_members WHERE party_id = $1`,
          [partyId]
        );
        await pool.query(
          `DELETE FROM parties WHERE id = $1`,
          [partyId]
        );

        return NextResponse.json({
          success: true,
          message: "Party disbanded (you were the only member)",
        });
      }

      if (isLeader) {
        // Transfer leadership to another member
        const nextLeader = await pool.query(
          `SELECT character_id FROM party_members WHERE party_id = $1 AND character_id != $2 ORDER BY joined_at ASC LIMIT 1`,
          [partyId, char.id]
        );

        if (nextLeader.rows.length > 0) {
          await pool.query(
            `UPDATE parties SET leader_id = $1 WHERE id = $2`,
            [nextLeader.rows[0].character_id, partyId]
          );
        }
      }

      // Remove from party
      await pool.query(
        `DELETE FROM party_members WHERE character_id = $1`,
        [char.id]
      );

      return NextResponse.json({
        success: true,
        message: "Left party",
      });
    }

    // ============================================================
    // DISBAND
    // ============================================================
    if (action === "disband") {
      // Find my party
      const memberResult = await pool.query(
        `SELECT pm.party_id FROM party_members pm WHERE pm.character_id = $1`,
        [char.id]
      );

      if (memberResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Not in a party" },
          { status: 400 }
        );
      }

      const partyId = memberResult.rows[0].party_id;

      // Check if leader
      const partyResult = await pool.query(
        `SELECT * FROM parties WHERE id = $1`,
        [partyId]
      );

      if (partyResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Party not found" },
          { status: 404 }
        );
      }

      if (partyResult.rows[0].leader_id !== char.id) {
        return NextResponse.json(
          { error: "Only the party leader can disband the party" },
          { status: 403 }
        );
      }

      // Delete members, then party
      await pool.query(
        `DELETE FROM party_members WHERE party_id = $1`,
        [partyId]
      );
      await pool.query(
        `DELETE FROM parties WHERE id = $1`,
        [partyId]
      );

      return NextResponse.json({
        success: true,
        message: "Party disbanded",
      });
    }

    // ============================================================
    // INVITE
    // ============================================================
    if (action === "invite") {
      if (!targetCharId) {
        return NextResponse.json(
          { error: "targetCharId is required" },
          { status: 400 }
        );
      }

      // Check I'm in a party
      const memberResult = await pool.query(
        `SELECT pm.party_id FROM party_members pm WHERE pm.character_id = $1`,
        [char.id]
      );

      if (memberResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Not in a party" },
          { status: 400 }
        );
      }

      const partyId = memberResult.rows[0].party_id;

      // Check target exists
      const targetResult = await pool.query(
        `SELECT id, name FROM characters WHERE id = $1`,
        [targetCharId]
      );

      if (targetResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Target character not found" },
          { status: 404 }
        );
      }

      // Check target is not already in a party
      const targetParty = await pool.query(
        `SELECT party_id FROM party_members WHERE character_id = $1`,
        [targetCharId]
      );

      if (targetParty.rows.length > 0) {
        return NextResponse.json(
          { error: "Target is already in a party" },
          { status: 400 }
        );
      }

      // Check party has space
      const partyResult = await pool.query(
        `SELECT * FROM parties WHERE id = $1`,
        [partyId]
      );

      if (partyResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Party not found" },
          { status: 404 }
        );
      }

      const memberCount = await pool.query(
        `SELECT COUNT(*)::int AS count FROM party_members WHERE party_id = $1`,
        [partyId]
      );

      if (memberCount.rows[0].count >= partyResult.rows[0].max_members) {
        return NextResponse.json(
          { error: "Party is full" },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Invite ready for ${targetResult.rows[0].name}. They can join with partyId ${partyId}.`,
      });
    }

    // ============================================================
    // KICK
    // ============================================================
    if (action === "kick") {
      if (!targetCharId) {
        return NextResponse.json(
          { error: "targetCharId is required" },
          { status: 400 }
        );
      }

      // Check I'm in a party and am leader
      const memberResult = await pool.query(
        `SELECT pm.party_id FROM party_members pm WHERE pm.character_id = $1`,
        [char.id]
      );

      if (memberResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Not in a party" },
          { status: 400 }
        );
      }

      const partyId = memberResult.rows[0].party_id;

      const partyResult = await pool.query(
        `SELECT * FROM parties WHERE id = $1`,
        [partyId]
      );

      if (partyResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Party not found" },
          { status: 404 }
        );
      }

      if (partyResult.rows[0].leader_id !== char.id) {
        return NextResponse.json(
          { error: "Only the party leader can kick members" },
          { status: 403 }
        );
      }

      // Check target is in the same party
      const targetMember = await pool.query(
        `SELECT party_id FROM party_members WHERE character_id = $1 AND party_id = $2`,
        [targetCharId, partyId]
      );

      if (targetMember.rows.length === 0) {
        return NextResponse.json(
          { error: "Target is not in your party" },
          { status: 400 }
        );
      }

      // Can't kick yourself
      if (targetCharId === char.id) {
        return NextResponse.json(
          { error: "Cannot kick yourself. Use leave instead." },
          { status: 400 }
        );
      }

      // Remove from party
      await pool.query(
        `DELETE FROM party_members WHERE character_id = $1`,
        [targetCharId]
      );

      return NextResponse.json({
        success: true,
        message: "Member kicked from party",
      });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Party action failed:", error);
    return NextResponse.json(
      { error: "Failed to perform party action" },
      { status: 500 }
    );
  }
}
