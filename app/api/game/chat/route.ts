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
 * GET /api/game/chat — Get chat messages
 * Query: { channel, channelId?, limit?, before? }
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
    const channel = searchParams.get("channel") || "party";
    let channelId = searchParams.get("channelId") || undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 50);
    const before = searchParams.get("before") || undefined;

    if (!["party", "faction", "global"].includes(channel)) {
      return NextResponse.json(
        { error: "Invalid channel" },
        { status: 400 }
      );
    }

    // Auto-resolve channelId from character's party/faction
    if (!channelId) {
      if (channel === "party") {
        const partyResult = await pool.query(
          `SELECT party_id FROM party_members WHERE character_id = $1`,
          [char.id]
        );

        if (partyResult.rows.length === 0) {
          return NextResponse.json(
            { error: "You are not in a party" },
            { status: 400 }
          );
        }

        channelId = String(partyResult.rows[0].party_id);
      } else if (channel === "faction") {
        const factionResult = await pool.query(
          `SELECT faction_id FROM faction_members WHERE character_id = $1`,
          [char.id]
        );

        if (factionResult.rows.length === 0) {
          return NextResponse.json(
            { error: "You are not in a faction" },
            { status: 400 }
          );
        }

        channelId = String(factionResult.rows[0].faction_id);
      } else {
        channelId = "global";
      }
    }

    // Build query
    let query = `
      SELECT cm.id, cm.message, cm.channel, cm.channel_id, cm.created_at,
             c.name AS sender_name, c.id AS sender_id
      FROM chat_messages cm
      JOIN characters c ON cm.sender_id = c.id
      WHERE cm.channel = $1 AND cm.channel_id = $2
    `;
    const params: (string | number)[] = [channel, channelId];
    let paramIdx = 3;

    if (before) {
      query += ` AND cm.created_at < $${paramIdx}`;
      params.push(before);
      paramIdx++;
    }

    query += ` ORDER BY cm.created_at DESC LIMIT $${paramIdx}`;
    params.push(limit);

    const result = await pool.query(query, params);

    return NextResponse.json({
      messages: result.rows.reverse(),
      channel,
      channelId,
      hasMore: result.rows.length === limit,
    });
  } catch (error) {
    console.error("Get chat failed:", error);
    return NextResponse.json(
      { error: "Failed to get chat messages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/game/chat — Send a message
 * Body: { message, channel?, channelId? }
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
    const {
      message,
      channel = "party",
      channelId: inputChannelId,
    } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    if (message.length > 1000) {
      return NextResponse.json(
        { error: "Message too long (max 1000 characters)" },
        { status: 400 }
      );
    }

    if (!["party", "faction", "global"].includes(channel)) {
      return NextResponse.json(
        { error: "Invalid channel" },
        { status: 400 }
      );
    }

    // Resolve channelId
    let channelId = inputChannelId;

    if (!channelId) {
      if (channel === "party") {
        const partyResult = await pool.query(
          `SELECT party_id FROM party_members WHERE character_id = $1`,
          [char.id]
        );

        if (partyResult.rows.length === 0) {
          return NextResponse.json(
            { error: "You are not in a party" },
            { status: 400 }
          );
        }

        channelId = String(partyResult.rows[0].party_id);
      } else if (channel === "faction") {
        const factionResult = await pool.query(
          `SELECT faction_id FROM faction_members WHERE character_id = $1`,
          [char.id]
        );

        if (factionResult.rows.length === 0) {
          return NextResponse.json(
            { error: "You are not in a faction" },
            { status: 400 }
          );
        }

        channelId = String(factionResult.rows[0].faction_id);
      } else {
        channelId = "global";
      }
    }

    // Validate party membership if party channel
    if (channel === "party") {
      const memberCheck = await pool.query(
        `SELECT party_id FROM party_members WHERE character_id = $1 AND party_id = $2`,
        [char.id, channelId]
      );

      if (memberCheck.rows.length === 0) {
        return NextResponse.json(
          { error: "You are not a member of this party" },
          { status: 403 }
        );
      }
    }

    // Validate faction membership if faction channel
    if (channel === "faction") {
      const memberCheck = await pool.query(
        `SELECT faction_id FROM faction_members WHERE character_id = $1 AND faction_id = $2`,
        [char.id, channelId]
      );

      if (memberCheck.rows.length === 0) {
        return NextResponse.json(
          { error: "You are not a member of this faction" },
          { status: 403 }
        );
      }
    }

    // Insert message
    const result = await pool.query(
      `
        INSERT INTO chat_messages (sender_id, channel, channel_id, message)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [char.id, channel, channelId, message.trim()]
    );

    return NextResponse.json({
      message: {
        ...result.rows[0],
        sender_name: char.name,
        sender_id: char.id,
      },
    });
  } catch (error) {
    console.error("Send chat failed:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
