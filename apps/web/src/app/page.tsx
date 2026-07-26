import Link from "next/link";

export default function Home() {
  return (
    <div className="shell-light">
      <header className="hero">
        <nav className="hero-nav">
          <span className="mono text-xs tracking-[0.2em] uppercase text-[color:var(--muted)]">Live match</span>
          <Link href="/admin/matches" className="mono text-xs tracking-[0.14em] uppercase text-[color:var(--muted)] hover:text-[color:var(--ink)]">
            History
          </Link>
        </nav>

        <section className="hero-stage" aria-label="BuzzKill">
          <div className="hero-visual" aria-hidden />
          <div className="hero-copy">
            <h1 className="hero-brand">BuzzKill</h1>
            <p className="hero-line">Two teams. Limited buzzers. Steal the point — or lose one for good.</p>
            <div className="hero-cta">
              <Link href="/host" className="btn btn-buzz">
                Host a match
              </Link>
              <Link href="/play" className="btn btn-ink">
                Join as player
              </Link>
            </div>
          </div>
        </section>
      </header>

      <section className="section">
        <h2>How a round works</h2>
        <p className="max-w-xl text-[color:var(--muted)] text-lg">
          Built for a live host and eight players on camera. No downloads — just a room code.
        </p>
        <ol className="rule-list max-w-3xl">
          <li>
            <div>
              <strong>Open buzzers</strong>
              <p className="m-0 mt-1 text-[color:var(--muted)]">First clean hit locks the board. Everyone else is frozen.</p>
            </div>
          </li>
          <li>
            <div>
              <strong>Grade the answer</strong>
              <p className="m-0 mt-1 text-[color:var(--muted)]">Correct scores a point. Miss it and the other team steals.</p>
            </div>
          </li>
          <li>
            <div>
              <strong>BuzzKill</strong>
              <p className="m-0 mt-1 text-[color:var(--muted)]">Nail the toss-up and snip an opponent&apos;s remaining buzzes.</p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
