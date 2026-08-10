export default function Home() {
  return (
    <main className="home">

      <nav className="navbar">
        <div className="logo">VORPIUM</div>

        <div className="nav-links">
          <a href="#about">About</a>
          <a href="#discord">Discord</a>
        </div>
      </nav>

      <section className="hero">
        <p className="eyebrow">YOUR ADVENTURE AWAITS</p>

        <h1>VORPIUM</h1>

        <p className="subtitle">
          A story shaped by everyone.
          <br />
          Play on the web or through Discord.
        </p>

        <div className="buttons">

          <a href="/api/auth/discord" className="button primary">
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

        <h2>Everyone's story. Help shape it.</h2>

        <div className="cards">

          <div className="card">
            <h3>Story</h3>
            <p>
              Explore a world where everyone's decision shapes it.
            </p>
          </div>

          <div className="card">
            <h3>Choices</h3>
            <p>
              Every decision can change the world and your outcome.
            </p>
          </div>

          <div className="card">
            <h3>Discord</h3>
            <p>
              Continue your adventure through the Vorpium Discord bot.
            </p>
          </div>

        </div>

      <footer>
        © 2026 Vorpium
      </footer>

    </main>
  );
}
