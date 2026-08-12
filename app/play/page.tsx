import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import pool from "lib/db";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "lib/session";
import GameClient from "./GameClient";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const cookieStore = await cookies();

  const sessionToken = cookieStore.get(
    SESSION_COOKIE_NAME
  )?.value;

  const discordId = verifySessionToken(sessionToken);

  // Player isn't logged in.
  if (!discordId) {
    redirect("/");
  }

  // Find their Vorpium account.
  const userResult = await pool.query(
    `
      SELECT id, discord_id, username, avatar
      FROM users
      WHERE discord_id = $1
      LIMIT 1
    `,
    [discordId]
  );

  if (userResult.rows.length === 0) {
    redirect("/");
  }

  const user = userResult.rows[0];

  // Check if they already created a character.
  const characterResult = await pool.query(
    `
      SELECT id, name
      FROM characters
      WHERE user_id = $1
      LIMIT 1
    `,
    [user.id]
  );

  // No character yet — redirect to character creation
  if (characterResult.rows.length === 0) {
    redirect("/play/create");
  }

  // Character exists — render the game client
  return <GameClient />;
}
