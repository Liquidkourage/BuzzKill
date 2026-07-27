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
    "A live team trivia league. Enter the season, show up on camera, and climb the table.";

  return (
    <div className="shell-light">
      <header className="hero">
        <nav className="hero-nav">
          <span className="eyebrow text-[color:var(--muted)]">
            {league?.organizer || "Live team trivia"}
          </span>
          <div className="flex gap-5">
            <Link href="/standings" className="eyebrow text-[color:var(--muted)] hover:text-[color:var(--ink)]">
              Standings
            </Link>
            <Link href="/play" className="eyebrow text-[color:var(--muted)] hover:text-[color:var(--ink)]">
              Match night
            </Link>
            <Link href="/login" className="eyebrow text-[color:var(--muted)] hover:text-[color:var(--ink)]">
              Sign in
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
              <Link href="/standings" className="btn btn-live">
                View standings
              </Link>
            </div>
            {season ? (
              <p className="eyebrow m-0" style={{ color: "rgba(244,246,250,0.5)" }}>
                {season.name}
                <span className="mx-2 opacity-40">·</span>
                {formatFee(season.entryFeeCents)}
                <span className="mx-2 opacity-40">·</span>
                {league?.teamCount ?? 0} teams
              </p>
            ) : null}
          </div>
        </section>
      </header>

      <section className="section">
        <h2>How the league works</h2>
        <p className="max-w-xl text-[color:var(--muted)] text-lg">
          Pay for a season seat, bring your roster on match night, and compete live on video.
        </p>
        <ol className="rule-list max-w-3xl">
          <li>
            <div>
              <strong>Register</strong>
              <p className="m-0 mt-1 text-[color:var(--muted)]">
                Submit your team and captain. Dues stay pending until the organizer confirms payment.
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>Match night</strong>
              <p className="m-0 mt-1 text-[color:var(--muted)]">
                Join with a room code. Four players per side, timed buzzers, live video.
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>Standings</strong>
              <p className="m-0 mt-1 text-[color:var(--muted)]">
                Completed matches update the season table automatically.
              </p>
            </div>
          </li>
        </ol>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/enter" className="btn btn-buzz">
            Enter the season
          </Link>
          <Link href="/host" className="btn btn-ghost">
            Host a match
          </Link>
        </div>
      </section>
    </div>
  );
}
