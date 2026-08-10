import { NextRequest, NextResponse } from "next/server";
import pool from "lib/db";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    const discordId = verifySessionToken(token);

    if (!discordId) {
      return NextResponse.json({
        user: null,
      });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          discord_id,
          username,
          avatar,
          created_at,
          last_login
        FROM users
        WHERE discord_id = $1
        LIMIT 1
      `,
      [discordId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        user: null,
      });
    }

    const user = result.rows[0];

    return NextResponse.json({
      user: {
        id: user.id,
        discord_id: String(user.discord_id),
        username: user.username,
        avatar: user.avatar,
        created_at: user.created_at,
        last_login: user.last_login,
      },
    });
  } catch (error) {
    console.error("Session check failed:", error);

    return NextResponse.json(
      { user: null },
      { status: 500 }
    );
  }
}
