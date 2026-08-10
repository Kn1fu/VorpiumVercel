import { NextRequest, NextResponse } from "next/server";
import { createLinkTicket, createSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "lib/session";
import pool from "lib/db";

export const dynamic = "force-dynamic";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL || "https://vorpium.vercel.app"}/connect`,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return NextResponse.json({ error: tokenData.error_description || tokenData.error }, { status: 400 });
    }

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userRes.json();

    if (userData.error) {
      return NextResponse.json({ error: "Failed to fetch user info" }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO users (discord_id, username, avatar, created_at, last_login)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (discord_id) DO UPDATE SET
         username = EXCLUDED.username,
         avatar = EXCLUDED.avatar`,
      [userData.id, userData.username, userData.avatar || null]
    );

    const linkTicket = createLinkTicket(userData.id);

    const response = NextResponse.json({
      id: userData.id,
      username: userData.username,
      avatar: userData.avatar,
      discriminator: userData.discriminator,
      link_ticket: linkTicket,
    });

    response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(userData.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });

    return response;
  } catch (error) {
    console.error("Discord OAuth exchange failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
