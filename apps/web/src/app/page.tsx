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
    "Paid team trivia on live video. Bring a roster, hit the buzzer, try not to get BuzzKilled.";

  return (
    <div className="shell-light">
      <header className="hero">
        <nav className="hero-nav">
          <span className="mono text-xs tracking-[0.2em] uppercase text-[color:var(--muted)]">
            {league?.organizer || "League night, not TED Talk"}
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
                Check the table
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
        <h2>How it works</h2>
        <p className="max-w-xl text-[color:var(--muted)] text-lg">
          Pay for a seat, show up on camera, answer fast. Bragging rights optional — standings are not.
        </p>
        <ol className="rule-list max-w-3xl">
          <li>
            <div>
              <strong>Buy in</strong>
              <p className="m-0 mt-1 text-[color:var(--muted)]">
                Register the team and captain. You stay pending until the organizer marks dues paid.
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>Match night</strong>
              <p className="m-0 mt-1 text-[color:var(--muted)]">
                Room code, four on a side, live video, fifteen seconds on the clock. No essay answers.
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>Climb or cope</strong>
              <p className="m-0 mt-1 text-[color:var(--muted)]">
                Finished matches update the season table. Wins count. Vibes do not.
              </p>
            </div>
          </li>
        </ol>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/enter" className="btn btn-buzz">
            Enter the season
          </Link>
          <Link href="/host" className="btn btn-ghost">
            Run match night
          </Link>
        </div>
      </section>
    </div>
  );
}
