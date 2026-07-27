"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AccountShell from "@/components/AccountShell";
import { api, type AuthUser } from "@/lib/auth";

type Portal = {
  role: string;
  team: { id: string; name: string };
  registration: {
    id: string;
    paymentStatus: string;
    wins: number;
    losses: number;
    ties: number;
    roster: { id: string; name: string; userId: string | null; user?: { email: string } | null }[];
  } | null;
  schedule: {
    id: string;
    status: string;
    startsAt: string | null;
    week: { weekIndex: number; label: string | null };
    teamA: { name: string };
    teamB: { name: string };
    reader: { name: string | null; email: string } | null;
  }[];
};

function fmtWhen(iso: string | null) {
  if (!iso) return "TBD";
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "TBD";
  }
}

export default function TeamPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [portal, setPortal] = useState<Portal | null>(null);
  const [rosterText, setRosterText] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError("");
    const me = await api<{ user: AuthUser }>("/auth/me");
    if (me.status === 401) {
      router.replace("/login");
      return;
    }
    if (!me.ok) {
      setError(me.data.error || "Failed to load");
      return;
    }
    setUser(me.data.user);

    const { ok, status, data } = await api<Portal>("/account/team");
    if (status === 404) {
      setPortal(null);
      return;
    }
    if (!ok) {
      setError(data.error || "Failed to load team");
      return;
    }
    setPortal(data);
    setRosterText((data.registration?.roster || []).map((p) => p.name).join("\n"));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const saveRoster = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setError("");
    const names = rosterText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const { ok, data } = await api("/account/team/roster", {
      method: "PUT",
      body: JSON.stringify({ names }),
    });
    setBusy(false);
    if (!ok) {
      setError(data.error || "Could not save roster");
      return;
    }
    setMsg("Roster saved");
    await load();
  };

  if (!user && !error) {
    return (
      <main className="shell-light px-6 py-10 max-w-4xl mx-auto">
        <p className="text-[color:var(--muted)]">Loading team…</p>
      </main>
    );
  }

  return (
    <AccountShell user={user} title={portal?.team.name || "Team"}>
      {error ? <p className="m-0 text-sm text-[color:var(--buzz)]">{error}</p> : null}
      {msg ? <p className="m-0 text-sm text-[color:var(--ok)]">{msg}</p> : null}

      {!portal ? (
        <p className="m-0 text-[color:var(--muted)]">
          You are not on a team roster yet. The commissioner can create your team and captain login.
        </p>
      ) : (
        <>
          <section className="flex flex-wrap gap-6 text-sm">
            <div>
              <div className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
                Role
              </div>
              <div className="font-semibold capitalize mt-1">{portal.role}</div>
            </div>
            <div>
              <div className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
                Dues
              </div>
              <div className="font-semibold capitalize mt-1">
                {portal.registration?.paymentStatus || "—"}
              </div>
            </div>
            <div>
              <div className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
                Record
              </div>
              <div className="font-semibold mt-1">
                {portal.registration
                  ? `${portal.registration.wins}-${portal.registration.losses}-${portal.registration.ties}`
                  : "—"}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="display text-2xl m-0">Roster (up to 5)</h2>
            {portal.role === "captain" || user?.isCommissioner ? (
              <form className="flex flex-col gap-3 max-w-md" onSubmit={saveRoster}>
                <textarea
                  className="field w-full min-h-[8rem]"
                  value={rosterText}
                  onChange={(e) => setRosterText(e.target.value)}
                  placeholder={"One name per line\nPlayer 1\nPlayer 2\n…"}
                />
                <button className="btn btn-ink self-start" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save roster"}
                </button>
              </form>
            ) : (
              <ul className="m-0 p-0 list-none">
                {(portal.registration?.roster || []).map((p) => (
                  <li key={p.id} className="py-2 border-b border-[color:var(--line)]">
                    {p.name}
                    {p.user?.email ? (
                      <span className="text-[color:var(--muted)] text-sm"> · {p.user.email}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="display text-2xl m-0">Schedule</h2>
            {portal.schedule.length === 0 ? (
              <p className="m-0 text-[color:var(--muted)]">No matches yet this season.</p>
            ) : (
              <ul className="m-0 p-0 list-none">
                {portal.schedule.map((m) => (
                  <li key={m.id} className="py-3 border-b border-[color:var(--line)]">
                    <div className="font-semibold">
                      {m.teamA.name} vs {m.teamB.name}
                    </div>
                    <div className="text-sm text-[color:var(--muted)]">
                      Week {m.week.weekIndex} · {fmtWhen(m.startsAt)} · {m.status}
                      {m.reader ? ` · ${m.reader.name || m.reader.email}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AccountShell>
  );
}
