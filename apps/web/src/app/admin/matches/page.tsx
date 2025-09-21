export const dynamic = "force-dynamic";

async function fetchMatches() {
	const base = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
	try {
		const res = await fetch(`${base}/admin/matches?limit=50`, { cache: "no-store" });
		if (!res.ok) return { matches: [], error: `Failed to load (${res.status})` };
		const data = await res.json();
		return { matches: Array.isArray(data?.matches) ? data.matches : [], error: null };
	} catch (e: any) {
		return { matches: [], error: e?.message || "Failed to load matches" };
	}
}

function formatDate(iso?: string) {
	if (!iso) return "-";
	try {
		const d = new Date(iso);
		return d.toLocaleString();
	} catch { return iso; }
}

export default async function AdminMatchesPage() {
	const { matches, error } = await fetchMatches();
	return (
		<main className="p-6 max-w-4xl mx-auto flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Admin · Matches</h1>
				<a className="btn-secondary" href="/">Home</a>
			</div>
			{error && <div className="text-sm text-red-600">{error}</div>}
			<div className="hud-card p-3 overflow-auto">
				<table className="w-full text-sm">
					<thead className="text-left opacity-80">
						<tr>
							<th className="py-2 pr-3">Code</th>
							<th className="py-2 pr-3">Status</th>
							<th className="py-2 pr-3">Score</th>
							<th className="py-2 pr-3">Overtime</th>
							<th className="py-2 pr-3">Created</th>
						</tr>
					</thead>
					<tbody>
						{matches.map((m: any) => (
							<tr key={m.id} className="border-t border-white/10">
								<td className="py-2 pr-3">
									<a className="text-blue-400 underline" href={`/admin/matches/${m.id}`}>{m.code}</a>
								</td>
								<td className="py-2 pr-3">{m.status}</td>
								<td className="py-2 pr-3">{m.scoreA} - {m.scoreB}</td>
								<td className="py-2 pr-3">{m.overtime ? "yes" : "no"}</td>
								<td className="py-2 pr-3">{formatDate(m.createdAt)}</td>
							</tr>
						))}
						{matches.length === 0 && (
							<tr>
								<td className="py-4 opacity-70" colSpan={5}>No matches yet.</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</main>
	);
}




