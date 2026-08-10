```tsx
export default function Home() {
  return (
    <main className="min-h-screen bg-[#08080b] text-white">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="text-2xl font-bold tracking-[0.25em]">
          VORPIUM
        </div>

        <div className="hidden md:flex gap-8 text-sm text-gray-400">
          <a href="#" className="hover:text-white transition">
            Home
          </a>

          <a href="#about" className="hover:text-white transition">
            About
          </a>

          <a href="#discord" className="hover:text-white transition">
            Discord
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-[80vh] flex items-center justify-center px-6">
        <div className="text-center max-w-4xl">

          <p className="text-sm uppercase tracking-[0.4em] text-gray-500 mb-6">
            A new adventure awaits
          </p>

          <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-8">
            VORPIUM
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            A story shaped by your choices.
            <br />
            Play your adventure on the web or through Discord.
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-4">

            <a
              href="/play"
              className="px-8 py-4 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition"
            >
              PLAY NOW
            </a>

            <a
              href="#discord"
              className="px-8 py-4 border border-white/20 rounded-lg font-semibold hover:bg-white/10 transition"
            >
              PLAY ON DISCORD
            </a>

          </div>
        </div>
      </section>

      {/* About */}
      <section
        id="about"
        className="border-t border-white/10 py-24 px-6"
      >
        <div className="max-w-5xl mx-auto">

          <div className="text-center mb-16">
            <p className="text-sm uppercase tracking-[0.3em] text-gray-500 mb-4">
              The Game
            </p>

            <h2 className="text-4xl md:text-5xl font-bold">
              Your story. Your choices.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">

            <div className="p-8 rounded-xl border border-white/10 bg-white/[0.02]">
              <h3 className="text-xl font-semibold mb-3">
                Story
              </h3>

              <p className="text-gray-400">
                Explore a world where your decisions shape what happens next.
              </p>
            </div>

            <div className="p-8 rounded-xl border border-white/10 bg-white/[0.02]">
              <h3 className="text-xl font-semibold mb-3">
                Choices
              </h3>

              <p className="text-gray-400">
                Every decision can change your character, relationships,
                and adventure.
              </p>
            </div>

            <div className="p-8 rounded-xl border border-white/10 bg-white/[0.02]">
              <h3 className="text-xl font-semibold mb-3">
                Discord
              </h3>

              <p className="text-gray-400">
                Take your adventure into Discord and play with others.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Discord */}
      <section
        id="discord"
        className="py-24 px-6 text-center"
      >
        <h2 className="text-4xl font-bold mb-4">
          Ready to enter Vorpium?
        </h2>

        <p className="text-gray-400 mb-8">
          Start your adventure today.
        </p>

        <a
          href="#"
          className="inline-block px-8 py-4 bg-white text-black rounded-lg font-semibold hover:bg-gray-200 transition"
        >
          JOIN THE DISCORD
        </a>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center text-gray-500 text-sm">
        © 2026 Vorpium. All rights reserved.
      </footer>
    </main>
  );
}
```
