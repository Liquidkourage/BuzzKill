import Link from "next/link";

export const dynamic = "force-dynamic";

interface MatchEvent {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
}

async function fetchMatch(id: string) {
  const base = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
  try {
    const res = await fetch(`${base}/admin/matches/${id}`, { cache: "no-store" });
    if (!res.ok) return { match: null, error: `Failed to load (${res.status})` };
    const data = await res.json();
    return { match: data?.match ?? null, error: null };
  } catch (e: unknown) {
    return { match: null, error: e instanceof Error ? e.message : "Failed to load match" };
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

export default async function AdminMatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { match, error } = await fetchMatch(id);
  return (
    <main className="shell-light px-6 py-10 max-w-4xl mx-auto flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Link href="/" className="mono text-xs tracking-[0.18em] uppercase text-[color:var(--muted)]">
            BuzzKill
          </Link>
          <h1 className="display text-5xl mt-2">Match</h1>
        </div>
        <Link className="btn btn-ghost" href="/admin/matches">
          Back
        </Link>
      </div>
      {error ? <p className="m-0 text-sm text-[color:var(--buzz)]">{error}</p> : null}
      {!match ? (
        <p className="text-[color:var(--muted)]">Not found.</p>
      ) : (
        <>
          <div className="grid gap-2">
            <div className="display text-4xl tracking-[0.08em]">{match.code}</div>
            <div className="text-[color:var(--muted)]">
              {match.status}
              <span className="mx-2 opacity-40">·</span>
              <span className="team-a mono">{match.scoreA}</span>
              <span className="opacity-40 mx-1">–</span>
              <span className="team-b mono">{match.scoreB}</span>
              {match.overtime ? (
                <>
                  <span className="mx-2 opacity-40">·</span>
                  OT
                </>
              ) : null}
              <span className="mx-2 opacity-40">·</span>
              {formatDate(match.createdAt)}
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="mono text-left text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)] border-b border-[color:var(--line)]">
                  <th className="py-3 pr-3 font-medium">When</th>
                  <th className="py-3 pr-3 font-medium">Type</th>
                  <th className="py-3 pr-3 font-medium">Payload</th>
                </tr>
              </thead>
              <tbody>
                {(match.events || []).map((ev: MatchEvent) => (
                  <tr key={ev.id} className="border-b border-[color:var(--line)] align-top">
                    <td className="py-3 pr-3 whitespace-nowrap text-[color:var(--muted)]">
                      {formatDate(ev.createdAt)}
                    </td>
                    <td className="py-3 pr-3 font-semibold">{ev.type}</td>
                    <td className="py-3 pr-3 mono text-xs opacity-80">
                      <pre className="m-0 whitespace-pre-wrap">{JSON.stringify(ev.payload, null, 2)}</pre>
                    </td>
                  </tr>
                ))}
                {(match.events || []).length === 0 && (
                  <tr>
                    <td className="py-8 text-[color:var(--muted)]" colSpan={3}>
                      No events.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
