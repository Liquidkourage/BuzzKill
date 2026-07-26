"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { formatFee, serverUrl } from "@/lib/league";

type LeagueInfo = {
  leagueName: string;
  season: {
    name: string;
    entryFeeCents: number;
    entryNote?: string | null;
    status: string;
  };
};

export default function EnterPage() {
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [teamName, setTeamName] = useState("");
  const [captainName, setCaptainName] = useState("");
  const [captainEmail, setCaptainEmail] = useState("");
  const [captainPhone, setCaptainPhone] = useState("");
  const [rosterText, setRosterText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{
    teamName: string;
    entryNote?: string | null;
    entryFeeCents: number;
  } | null>(null);

  useEffect(() => {
    fetch(`${serverUrl()}/league`)
      .then((r) => r.json())
      .then(setLeague)
      .catch(() => setLeague(null));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${serverUrl()}/league/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamName,
          captainName,
          captainEmail,
          captainPhone: captainPhone || undefined,
          rosterText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Registration failed");
      setDone({
        teamName: data.registration.teamName,
        entryNote: data.registration.entryNote,
        entryFeeCents: data.registration.entryFeeCents,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <main className="shell-light px-5 py-10 max-w-lg mx-auto flex flex-col gap-6">
        <Link href="/" className="mono text-xs tracking-[0.18em] uppercase text-[color:var(--muted)]">
          BuzzKill
        </Link>
        <h1 className="display text-5xl m-0">You&apos;re in</h1>
        <p className="text-lg text-[color:var(--muted)] m-0">
          <strong className="text-[color:var(--ink)]">{done.teamName}</strong> is registered.
          Payment status is <strong>pending</strong> until the organizer confirms dues.
        </p>
        <div className="border-y border-[color:var(--line)] py-4">
          <div className="mono text-xs tracking-[0.14em] uppercase text-[color:var(--muted)] mb-2">
            {formatFee(done.entryFeeCents)}
          </div>
          <p className="m-0">{done.entryNote}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/standings" className="btn btn-ink">
            Standings
          </Link>
          <Link href="/" className="btn btn-ghost">
            Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="shell-light px-5 py-10 max-w-lg mx-auto flex flex-col gap-6">
      <div>
        <Link href="/" className="mono text-xs tracking-[0.18em] uppercase text-[color:var(--muted)]">
          BuzzKill
        </Link>
        <h1 className="display text-5xl mt-2 m-0">Enter</h1>
        <p className="mt-3 text-[color:var(--muted)] text-lg m-0">
          {league
            ? `${league.season.name} · ${formatFee(league.season.entryFeeCents)}`
            : "Register your team for the season."}
        </p>
      </div>

      <form className="flex flex-col gap-3" onSubmit={submit}>
        <input
          className="field"
          placeholder="Team name"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          required
        />
        <input
          className="field"
          placeholder="Captain name"
          value={captainName}
          onChange={(e) => setCaptainName(e.target.value)}
          required
        />
        <input
          className="field"
          type="email"
          placeholder="Captain email"
          value={captainEmail}
          onChange={(e) => setCaptainEmail(e.target.value)}
          required
        />
        <input
          className="field"
          placeholder="Captain phone (optional)"
          value={captainPhone}
          onChange={(e) => setCaptainPhone(e.target.value)}
        />
        <textarea
          className="field min-h-[7rem] resize-y"
          placeholder="Roster (names, one per line or comma-separated)"
          value={rosterText}
          onChange={(e) => setRosterText(e.target.value)}
          required
        />
        {league?.season?.entryNote ? (
          <p className="m-0 text-sm text-[color:var(--muted)]">{league.season.entryNote}</p>
        ) : null}
        {error ? <p className="m-0 text-sm text-[color:var(--buzz)]">{error}</p> : null}
        <button className="btn btn-buzz text-lg py-3" disabled={busy}>
          {busy ? "Submitting…" : "Submit registration"}
        </button>
      </form>
    </main>
  );
}
