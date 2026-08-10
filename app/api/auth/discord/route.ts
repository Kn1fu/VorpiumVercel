import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "lib/session";

export const dynamic = "force-dynamic";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://vorpium.vercel.app";

export async function GET(request: NextRequest) {
  try {
    if (!DISCORD_CLIENT_ID) {
      return NextResponse.json(
        { error: "DISCORD_CLIENT_ID is not configured" },
        { status: 500 }
      );
    }

    const sessionToken = request.cookies.get(
      SESSION_COOKIE_NAME
    )?.value;

    const discordId = verifySessionToken(sessionToken);

    if (discordId) {
      return NextResponse.redirect(
        new URL("/play", SITE_URL)
      );
    }

    const redirectUri =
      `${SITE_URL}/api/auth/discord/callback`;

    const discordUrl =
      "https://discord.com/api/oauth2/authorize" +
      `?client_id=${encodeURIComponent(DISCORD_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=identify`;

    return NextResponse.redirect(discordUrl);
  } catch (error) {
    console.error(
      "Discord OAuth start failed:",
      error
    );

    return NextResponse.json(
      { error: "Failed to start Discord authentication" },
      { status: 500 }
    );
  }
}