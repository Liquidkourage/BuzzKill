import Link from "next/link";
import { formatFee, serverUrl } from "@/lib/league";

export const dynamic = "force-dynamic";

async function loadLeague() {
  try {
    const res = await fetch(`${serverUrl()}/league`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function Home() {
  const league = await loadLeague();
  const name = league?.leagueName || "BuzzKill League";
  const season = league?.season;
  const blurb =
    season?.blurb ||
    "A live video trivia league. Teams pay to enter the season, show up on match night, and climb the table.";

  return (
    <div className="shell-light">
      <header className="hero">
        <nav className="hero-nav">
          <span className="mono text-xs tracking-[0.2em] uppercase text-[color:var(--muted)]">
            {league?.organizer || "Organizer-run league"}
          </span>
          <div className="flex gap-4">
            <Link
              href="/standings"
              className="mono text-xs tracking-[0.14em] uppercase text-[color:var(--muted)] hover:text-[color:var(--ink)]"
            >
              Standings
            </Link>
            <Link
              href="/play"
              className="mono text-xs tracking-[0.14em] uppercase text-[color:var(--muted)] hover:text-[color:var(--ink)]"
            >
              Match night
            </Link>
          </div>
        </nav>

        <section className="hero-stage" aria-label={name}>
          <div className="hero-visual" aria-hidden />
          <div className="hero-copy">
            <h1 className="hero-brand">BuzzKill</h1>
            <p className="hero-line">{blurb}</p>
            <div className="hero-cta">
              <Link href="/enter" className="btn btn-buzz">
                Enter your team
              </Link>
              <Link href="/standings" className="btn btn-ink">
                View standings
              </Link>
            </div>
            {season ? (
              <p className="mono text-xs tracking-[0.12em] uppercase text-white/55 m-0">
                {season.name}
                <span className="mx-2 opacity-40">·</span>
                {formatFee(season.entryFeeCents)}
                <span className="mx-2 opacity-40">·</span>
                {league?.teamCount ?? 0} teams in
              </p>
            ) : null}
          </div>
        </section>
      </header>

      <section className="section">
        <h2>How the league works</h2>
        <p className="max-w-xl text-[color:var(--muted)] text-lg">
          You pay the organizer for a season seat. On match night, your roster joins the live room on camera.
        </p>
        <ol className="rule-list max-w-3xl">
          <li>
            <div>
              <strong>Register &amp; pay</strong>
              <p className="m-0 mt-1 text-[color:var(--muted)]">
                Submit your team and captain. Dues stay pending until the organizer confirms payment.
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>Show up for match night</strong>
              <p className="m-0 mt-1 text-[color:var(--muted)]">
                Use the room code from the organizer. Four players per side, live video, timed buzzers.
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>Climb the table</strong>
              <p className="m-0 mt-1 text-[color:var(--muted)]">
                Wins, losses, and points feed the season standings after each completed match.
              </p>
            </div>
          </li>
        </ol>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/enter" className="btn btn-buzz">
            Enter the season
          </Link>
          <Link href="/host" className="btn btn-ghost">
            Organizer: run match
          </Link>
        </div>
      </section>
    </div>
  );
}
