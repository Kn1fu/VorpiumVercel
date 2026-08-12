export default function Home() {
  return (
    <main>
      <nav className="navbar">
        <div className="logo">FEATHER QUEST</div>

        <div className="nav-links">
          <a href="#about">About</a>

          <a
            href="https://discord.gg/vAQ2XfGkyk"
            target="_blank"
            rel="noopener noreferrer"
          >
            Discord
          </a>
        </div>
      </nav>

      <section className="hero">
        <p className="eyebrow">YOUR ADVENTURE AWAITS</p>

        <h1>FEATHER QUEST</h1>

        <p className="subtitle">
          A D&D 5e multiplayer RPG shaped by everyone.
          <br />
          Play on the web or through Discord.
        </p>

        <div className="buttons">
          <a
            href="/api/auth/discord"
            className="button primary"
          >
            PLAY NOW
          </a>

          <a
            href="https://discord.gg/vAQ2XfGkyk"
            target="_blank"
            rel="noopener noreferrer"
            className="button secondary"
          >
            PLAY ON DISCORD
          </a>
        </div>
      </section>

      <section id="about" className="about">
        <p className="eyebrow">THE WORLD</p>

        <h2>An epic quest awaits. Will you answer the call?</h2>

        <div className="cards">
          <div className="card">
            <h3>Play Anywhere</h3>
            <p>
              Play on the website or through Discord. Your progress is synced across both.
            </p>
          </div>

          <div className="card">
            <h3>D&D 5e Rules</h3>
            <p>
              Full D&D 5e mechanics — classes, races, spells, combat, and leveling.
            </p>
          </div>

          <div className="card">
            <h3>Multiplayer Quests</h3>
            <p>
              Solo quests, party adventures, and server-wide guild raids.
            </p>
          </div>
        </div>
      </section>

      <footer>
        © 2026 Feather Quest
      </footer>
    </main>
  );
}