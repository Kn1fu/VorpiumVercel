import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import pool from "lib/db";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "lib/session";

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
      SELECT id, name, race, gender
      FROM characters
      WHERE user_id = $1
      LIMIT 1
    `,
    [user.id]
  );

  // Character already exists.
  if (characterResult.rows.length > 0) {
    const character = characterResult.rows[0];

    return (
      <main className="min-h-screen bg-gray-950 text-white">
        <nav className="border-b border-white/10">
          <div className="max-w-6xl mx-auto px-6 py-5">
            <div className="text-xl font-bold tracking-[0.25em]">
              VORPIUM
            </div>
          </div>
        </nav>

        <section className="max-w-4xl mx-auto px-6 py-24 text-center">
          <p className="text-sm tracking-[0.35em] text-indigo-400 mb-4">
            WELCOME BACK
          </p>

          <h1 className="text-5xl font-bold mb-6">
            {character.name}
          </h1>

          <p className="text-gray-400 text-lg mb-10">
            Your story is waiting.
          </p>

          <button className="px-8 py-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 transition font-semibold">
            CONTINUE
          </button>
        </section>
      </main>
    );
  }

  // New player — show character creation.
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="text-xl font-bold tracking-[0.25em]">
            VORPIUM
          </div>

          <div className="text-sm text-gray-400">
            {user.username}
          </div>
        </div>
      </nav>

      <section className="max-w-4xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <p className="text-sm tracking-[0.35em] text-indigo-400 mb-4">
            CHARACTER CREATION
          </p>

          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Who will you become?
          </h1>

          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Every story begins with a name.
            Choose the name your character will carry
            throughout the world of Vorpium.
          </p>
        </div>

        <div className="max-w-xl mx-auto">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 md:p-10">
            <label
              htmlFor="character-name"
              className="block text-sm font-medium text-gray-300 mb-3"
            >
              Character Name
            </label>

            <input
              id="character-name"
              type="text"
              maxLength={24}
              placeholder="Enter your character's name..."
              className="w-full rounded-xl border border-white/10 bg-black/20 px-5 py-4 text-white placeholder:text-gray-600 outline-none focus:border-indigo-400 transition"
            />

            <p className="text-xs text-gray-500 mt-3">
              3–24 characters. This is the name used throughout
              your Vorpium adventure.
            </p>

            <button
              type="button"
              className="w-full mt-8 rounded-xl bg-indigo-500 hover:bg-indigo-600 py-4 font-semibold transition"
            >
              CONTINUE
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-sm text-gray-600">
        © 2026 Vorpium
      </footer>
    </main>
  );
}