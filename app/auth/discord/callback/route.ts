import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = req.cookies.get("oauth_state")?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/?error=auth", req.url));
  }

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI!,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/?error=token", req.url));
  }
  const tokens = await tokenRes.json();

  // 2) Fetch the Discord user's profile
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const discordUser = await userRes.json();

  await db.query(
    `INSERT INTO users (discord_id, username, avatar, last_login)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (discord_id)
     DO UPDATE SET username = $2, avatar = $3, last_login = CURRENT_TIMESTAMP`,
    [discordUser.id, discordUser.username, discordUser.avatar]
  );

  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  res.cookies.set("session", discordUser.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  res.cookies.delete("oauth_state");
  return res;
}