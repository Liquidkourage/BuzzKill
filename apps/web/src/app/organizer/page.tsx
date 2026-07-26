"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { serverUrl } from "@/lib/league";

type TeamRow = {
  registrationId: string;
  teamId: string;
  name: string;
  paymentStatus: string;
};

export default function OrganizerPage() {
  const [key, setKey] = useState("");
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [seasonName, setSeasonName] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setError("");
    try {
      const res = await fetch(`${serverUrl()}/league/teams`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load");
      setSeasonName(data.season?.name || "");
      setTeams(data.teams || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setPaid = async (registrationId: string, paymentStatus: string) => {
    setMsg("");
    setError("");
    try {
      const res = await fetch(`${serverUrl()}/league/registrations/${registrationId}/payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organizer-key": key,
        },
        body: JSON.stringify({ paymentStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Update failed");
      setMsg(`${data.registration.team.name} → ${paymentStatus}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const onKeySubmit = (e: FormEvent) => {
    e.preventDefault();
    setMsg("Key saved for this session — use the buttons below.");
  };

  return (
    <main className="shell-light px-6 py-10 max-w-3xl mx-auto flex flex-col gap-8">
      <div>
        <Link href="/" className="mono text-xs tracking-[0.18em] uppercase text-[color:var(--muted)]">
          BuzzKill
        </Link>
        <h1 className="display text-5xl mt-2 m-0">Organizer</h1>
        <p className="mt-2 text-[color:var(--muted)] m-0">
          {seasonName || "Season"} · mark dues ·{" "}
          <Link href="/packs" className="underline underline-offset-2">
            question packs
          </Link>{" "}
          ·{" "}
          <Link href="/host" className="underline underline-offset-2">
            run match night
          </Link>
        </p>
      </div>

      <form className="flex flex-wrap gap-2 items-end" onSubmit={onKeySubmit}>
        <div className="flex-1 min-w-[14rem]">
          <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
            Organizer key
          </label>
          <input
            className="field w-full mt-1"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="ORGANIZER_KEY"
          />
        </div>
        <button className="btn btn-ink" type="submit">
          Use key
        </button>
      </form>

      {error ? <p className="m-0 text-sm text-[color:var(--buzz)]">{error}</p> : null}
      {msg ? <p className="m-0 text-sm text-[color:var(--ok)]">{msg}</p> : null}

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="mono text-left text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)] border-b border-[color:var(--line)]">
              <th className="py-3 pr-3 font-medium">Team</th>
              <th className="py-3 pr-3 font-medium">Dues</th>
              <th className="py-3 pr-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.registrationId} className="border-b border-[color:var(--line)]">
                <td className="py-3 pr-3 font-semibold">{t.name}</td>
                <td className="py-3 pr-3 capitalize text-[color:var(--muted)]">{t.paymentStatus}</td>
                <td className="py-3 pr-3">
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-ok text-xs py-1" type="button" onClick={() => setPaid(t.registrationId, "paid")}>
                      Paid
                    </button>
                    <button className="btn btn-ghost text-xs py-1" type="button" onClick={() => setPaid(t.registrationId, "pending")}>
                      Pending
                    </button>
                    <button className="btn btn-ghost text-xs py-1" type="button" onClick={() => setPaid(t.registrationId, "waived")}>
                      Waive
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {teams.length === 0 && (
              <tr>
                <td className="py-8 text-[color:var(--muted)]" colSpan={3}>
                  No registrations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
