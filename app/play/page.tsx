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

  // No character yet — show a simple redirect page
  if (characterResult.rows.length === 0) {
    return (
      <main className="min-h-screen bg-gray-950 text-white">
        <nav className="border-b border-white/10">
          <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
            <div className="text-xl font-bold tracking-[0.25em]">
              FEATHER QUEST
            </div>
            <div className="text-sm text-gray-400">
              {user.username}
            </div>
          </div>
        </nav>

        <section className="max-w-4xl mx-auto px-6 py-24 text-center">
          <p className="text-sm tracking-[0.35em] text-indigo-400 mb-4">
            CREATE YOUR CHARACTER
          </p>

          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Who will you become?
          </h1>

          <p className="text-gray-400 text-lg max-w-xl mx-auto mb-10">
            Every story begins with a name. Choose the name your
            character will carry throughout the world of Feather Quest.
          </p>

          <a
            href="/play/create"
            className="px-8 py-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 transition font-semibold inline-block"
          >
            BEGIN CHARACTER CREATION
          </a>
        </section>

        <footer className="border-t border-white/10 py-8 text-center text-sm text-gray-600">
          © 2026 Feather Quest
        </footer>
      </main>
    );
  }

  // Character exists — render the game client
  return <GameClient />;
}
