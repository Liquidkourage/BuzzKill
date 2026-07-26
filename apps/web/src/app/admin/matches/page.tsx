import Link from "next/link";

export const dynamic = "force-dynamic";

interface Match {
  id: string;
  code: string;
  status: string;
  scoreA: number;
  scoreB: number;
  overtime: boolean;
  createdAt: string;
}

async function fetchMatches() {
  const base = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
  try {
    const res = await fetch(`${base}/admin/matches?limit=50`, { cache: "no-store" });
    if (!res.ok) return { matches: [], error: `Failed to load (${res.status})` };
    const data = await res.json();
    return { matches: Array.isArray(data?.matches) ? data.matches : [], error: null };
  } catch (e: unknown) {
    return { matches: [], error: e instanceof Error ? e.message : "Failed to load matches" };
  }
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default async function AdminMatchesPage() {
  const { matches, error } = await fetchMatches();
  return (
    <main className="shell-light px-6 py-10 max-w-4xl mx-auto flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Link href="/" className="mono text-xs tracking-[0.18em] uppercase text-[color:var(--muted)]">
            BuzzKill
          </Link>
          <h1 className="display text-5xl mt-2">History</h1>
        </div>
        <Link className="btn btn-ghost" href="/">
          Home
        </Link>
      </div>
      {error ? <p className="m-0 text-sm text-[color:var(--buzz)]">{error}</p> : null}
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="mono text-left text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)] border-b border-[color:var(--line)]">
              <th className="py-3 pr-3 font-medium">Code</th>
              <th className="py-3 pr-3 font-medium">Status</th>
              <th className="py-3 pr-3 font-medium">Score</th>
              <th className="py-3 pr-3 font-medium">OT</th>
              <th className="py-3 pr-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m: Match) => (
              <tr key={m.id} className="border-b border-[color:var(--line)]">
                <td className="py-3 pr-3">
                  <Link className="font-semibold underline underline-offset-2" href={`/admin/matches/${m.id}`}>
                    {m.code}
                  </Link>
                </td>
                <td className="py-3 pr-3">{m.status}</td>
                <td className="py-3 pr-3 mono">
                  <span className="team-a">{m.scoreA}</span>
                  <span className="opacity-40 mx-1">–</span>
                  <span className="team-b">{m.scoreB}</span>
                </td>
                <td className="py-3 pr-3">{m.overtime ? "yes" : "—"}</td>
                <td className="py-3 pr-3 text-[color:var(--muted)]">{formatDate(m.createdAt)}</td>
              </tr>
            ))}
            {matches.length === 0 && (
              <tr>
                <td className="py-8 text-[color:var(--muted)]" colSpan={5}>
                  No matches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
