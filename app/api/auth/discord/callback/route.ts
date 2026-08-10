import { NextRequest, NextResponse } from "next/server";
import pool from "lib/db";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "lib/session";

export const dynamic = "force-dynamic";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://vorpium.vercel.app";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const error = request.nextUrl.searchParams.get("error");

    // User denied Discord authorization
    if (error) {
      return NextResponse.redirect(
        new URL("/?error=discord_denied", SITE_URL)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL("/?error=missing_code", SITE_URL)
      );
    }

    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      console.error("Discord OAuth environment variables are missing.");

      return NextResponse.redirect(
        new URL("/?error=oauth_config", SITE_URL)
      );
    }

    // Exchange Discord authorization code for an access token
    const tokenRes = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: `${SITE_URL}/api/auth/discord/callback`,
        }),
      }
    );

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error("Discord token exchange failed:", tokenData);

      return NextResponse.redirect(
        new URL("/?error=discord_token", SITE_URL)
      );
    }

    // Get the Discord user's information
    const userRes = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    const userData = await userRes.json();

    if (!userRes.ok || userData.error) {
      console.error("Discord user request failed:", userData);

      return NextResponse.redirect(
        new URL("/?error=discord_user", SITE_URL)
      );
    }

    // Create or update the user in PostgreSQL
    await pool.query(
      `
        INSERT INTO users (
          discord_id,
          username,
          avatar,
          created_at,
          last_login
        )
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (discord_id)
        DO UPDATE SET
          username = EXCLUDED.username,
          avatar = EXCLUDED.avatar,
          last_login = NOW()
      `,
      [
        userData.id,
        userData.username,
        userData.avatar || null,
      ]
    );

    // Create the Vorpium login session
    const sessionToken = createSessionToken(userData.id);

    const response = NextResponse.redirect(
      new URL("/play", SITE_URL)
    );

    response.cookies.set(
      SESSION_COOKIE_NAME,
      sessionToken,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
      }
    );

    return response;
  } catch (error) {
    console.error("Discord OAuth callback failed:", error);

    return NextResponse.redirect(
      new URL("/?error=oauth_failed", SITE_URL)
    );
  }
}