import Link from "next/link";

export const dynamic = "force-dynamic";

interface MatchEvent {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
}

// interface Match {
//   id: string;
//   code: string;
//   status: string;
//   scoreA: number;
//   scoreB: number;
//   overtime: boolean;
//   createdAt: string;
//   events?: MatchEvent[];
// }

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
	if (!iso) return "-";
	try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default async function AdminMatchDetailPage({ params }: { params: { id: string } }) {
	const { match, error } = await fetchMatch(params.id);
	return (
		<main className="p-6 max-w-4xl mx-auto flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Admin · Match</h1>
				<Link className="btn-secondary" href="/admin/matches">Back</Link>
			</div>
			{error && <div className="text-sm text-red-600">{error}</div>}
			{!match ? (
				<div className="hud-card p-3">Not found.</div>
			) : (
				<>
					<div className="hud-card p-3">
						<div className="text-sm opacity-80">Code: <span className="opacity-100">{match.code}</span></div>
						<div className="text-sm opacity-80">Status: <span className="opacity-100">{match.status}</span></div>
						<div className="text-sm opacity-80">Score: <span className="opacity-100">{match.scoreA} - {match.scoreB}</span> {match.overtime ? <span className="ml-2 phase-pill">overtime</span> : null}</div>
						<div className="text-sm opacity-80">Created: <span className="opacity-100">{formatDate(match.createdAt)}</span></div>
					</div>
					<div className="hud-card p-3 overflow-auto">
						<div className="font-semibold mb-2">Events</div>
						<table className="w-full text-sm">
							<thead className="text-left opacity-80">
								<tr>
									<th className="py-2 pr-3">When</th>
									<th className="py-2 pr-3">Type</th>
									<th className="py-2 pr-3">Payload</th>
								</tr>
							</thead>
							<tbody>
								{(match.events || []).map((ev: MatchEvent) => (
									<tr key={ev.id} className="border-t border-white/10">
										<td className="py-2 pr-3 whitespace-nowrap">{formatDate(ev.createdAt)}</td>
										<td className="py-2 pr-3">{ev.type}</td>
										<td className="py-2 pr-3 font-mono text-xs opacity-90"><pre>{JSON.stringify(ev.payload, null, 2)}</pre></td>
									</tr>
								))}
								{(match.events || []).length === 0 && (
									<tr>
										<td className="py-4 opacity-70" colSpan={3}>No events.</td>
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




