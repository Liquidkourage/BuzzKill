import Link from "next/link";
import { serverUrl } from "@/lib/league";

export const dynamic = "force-dynamic";

async function loadStandings() {
  try {
    const res = await fetch(`${serverUrl()}/league/standings`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function StandingsPage() {
  const data = await loadStandings();
  const season = data?.season;
  const standings = data?.standings || [];

  return (
    <main className="shell-light px-6 py-10 max-w-4xl mx-auto flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="eyebrow text-[color:var(--muted)]">
            BuzzKill
          </Link>
          <h1 className="display text-5xl mt-2 m-0">Standings</h1>
          <p className="mt-2 text-[color:var(--muted)] m-0">
            {season?.name || "Current season"}
            {season?.status ? ` · ${season.status}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/enter" className="btn btn-buzz">
            Enter team
          </Link>
          <Link href="/play" className="btn btn-ghost">
            Match night
          </Link>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="mono text-left text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)] border-b border-[color:var(--line)]">
              <th className="py-3 pr-3 font-medium">#</th>
              <th className="py-3 pr-3 font-medium">Team</th>
              <th className="py-3 pr-3 font-medium">W</th>
              <th className="py-3 pr-3 font-medium">L</th>
              <th className="py-3 pr-3 font-medium">T</th>
              <th className="py-3 pr-3 font-medium">PF</th>
              <th className="py-3 pr-3 font-medium">PA</th>
              <th className="py-3 pr-3 font-medium">Dues</th>
            </tr>
          </thead>
          <tbody>
            {standings.map(
              (row: {
                rank: number;
                teamName: string;
                wins: number;
                losses: number;
                ties: number;
                pointsFor: number;
                pointsAgainst: number;
                paymentStatus: string;
              }) => (
                <tr key={`${row.rank}-${row.teamName}`} className="border-b border-[color:var(--line)]">
                  <td className="py-3 pr-3 mono">{row.rank}</td>
                  <td className="py-3 pr-3 font-semibold">{row.teamName}</td>
                  <td className="py-3 pr-3 mono">{row.wins}</td>
                  <td className="py-3 pr-3 mono">{row.losses}</td>
                  <td className="py-3 pr-3 mono">{row.ties}</td>
                  <td className="py-3 pr-3 mono">{row.pointsFor}</td>
                  <td className="py-3 pr-3 mono">{row.pointsAgainst}</td>
                  <td className="py-3 pr-3 capitalize text-[color:var(--muted)]">{row.paymentStatus}</td>
                </tr>
              )
            )}
            {standings.length === 0 && (
              <tr>
                <td className="py-10 text-[color:var(--muted)]" colSpan={8}>
                  No teams registered yet.{" "}
                  <Link href="/enter" className="underline underline-offset-2">
                    Be the first
                  </Link>
                  .
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
