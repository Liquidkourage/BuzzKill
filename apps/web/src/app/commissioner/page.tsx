"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountShell from "@/components/AccountShell";
import { api, type AuthUser } from "@/lib/auth";

type TeamRow = {
  registrationId: string;
  teamId: string;
  name: string;
  paymentStatus: string;
  captainName: string;
  captainEmail: string;
  wins: number;
  losses: number;
  ties: number;
  roster: { id: string; name: string; userEmail?: string | null }[];
};

type UserRow = AuthUser & {
  teams: { role: string; teamId: string; teamName: string }[];
  readingCount: number;
};

type Week = {
  id: string;
  weekIndex: number;
  label: string | null;
  startsOn: string;
  matches: {
    id: string;
    status: string;
    startsAt: string | null;
    teamA: { id: string; name: string };
    teamB: { id: string; name: string };
    reader: { id: string; name: string | null; email: string } | null;
  }[];
};

type Dash = {
  season: { id: string; name: string; status: string; entryFeeCents: number };
  teams: TeamRow[];
  users: UserRow[];
  readers: { id: string; name: string | null; email: string }[];
  schedule: { weeks: Week[] };
};

export default function CommissionerPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // Create team
  const [teamName, setTeamName] = useState("");
  const [captainName, setCaptainName] = useState("");
  const [captainEmail, setCaptainEmail] = useState("");
  const [captainPassword, setCaptainPassword] = useState("");
  const [rosterText, setRosterText] = useState("");
  const [markPaid, setMarkPaid] = useState(true);

  // Create user / reader
  const [uName, setUName] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uReader, setUReader] = useState(true);

  // Schedule
  const [weekId, setWeekId] = useState("");
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [readerId, setReaderId] = useState("");
  const [startsAt, setStartsAt] = useState("");

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
    if (!me.data.user.isCommissioner) {
      setError("Commissioner access required");
      return;
    }
    const { ok, data } = await api<Dash>("/commissioner");
    if (!ok) {
      setError(data.error || "Failed to load dashboard");
      return;
    }
    setDash(data);
    if (!weekId && data.schedule.weeks[0]) setWeekId(data.schedule.weeks[0].id);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const teamsForSelect = useMemo(() => dash?.teams || [], [dash]);

  const createTeam = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    setError("");
    const rosterNames = rosterText
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    const { ok, data } = await api("/commissioner/teams", {
      method: "POST",
      body: JSON.stringify({
        teamName,
        captainName,
        captainEmail,
        captainPassword,
        rosterNames,
        markPaid,
      }),
    });
    if (!ok) {
      setError(data.error || "Could not create team");
      return;
    }
    setMsg(`Team created: ${teamName}`);
    setTeamName("");
    setCaptainName("");
    setCaptainEmail("");
    setCaptainPassword("");
    setRosterText("");
    await load();
  };

  const createUser = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    setError("");
    const { ok, data } = await api("/commissioner/users", {
      method: "POST",
      body: JSON.stringify({
        name: uName,
        email: uEmail,
        password: uPassword,
        isReader: uReader,
      }),
    });
    if (!ok) {
      setError(data.error || "Could not create user");
      return;
    }
    setMsg(`User created: ${uEmail}`);
    setUName("");
    setUEmail("");
    setUPassword("");
    await load();
  };

  const toggleReader = async (id: string, isReader: boolean) => {
    setError("");
    const { ok, data } = await api(`/commissioner/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isReader }),
    });
    if (!ok) {
      setError(data.error || "Update failed");
      return;
    }
    await load();
  };

  const ensureWeeks = async () => {
    setMsg("");
    setError("");
    const { ok, data } = await api("/commissioner/weeks", {
      method: "POST",
      body: JSON.stringify({ count: 8 }),
    });
    if (!ok) {
      setError(data.error || "Could not create weeks");
      return;
    }
    setMsg("Season weeks ready (8)");
    await load();
  };

  const scheduleMatch = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    setError("");
    const { ok, data } = await api("/commissioner/schedule", {
      method: "POST",
      body: JSON.stringify({
        weekId,
        teamAId,
        teamBId,
        readerId: readerId || undefined,
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      }),
    });
    if (!ok) {
      setError(data.error || "Could not schedule");
      return;
    }
    setMsg("Match scheduled");
    setTeamAId("");
    setTeamBId("");
    setStartsAt("");
    await load();
  };

  const setPayment = async (registrationId: string, paymentStatus: string) => {
    setError("");
    const { ok, data } = await api(`/league/registrations/${registrationId}/payment`, {
      method: "POST",
      body: JSON.stringify({ paymentStatus }),
    });
    if (!ok) {
      setError(data.error || "Payment update failed");
      return;
    }
    await load();
  };

  const assignReader = async (matchId: string, nextReaderId: string) => {
    setError("");
    const { ok, data } = await api(`/commissioner/schedule/${matchId}/reader`, {
      method: "PATCH",
      body: JSON.stringify({ readerId: nextReaderId || null }),
    });
    if (!ok) {
      setError(data.error || "Could not assign reader");
      return;
    }
    await load();
  };

  if (!dash && !error) {
    return (
      <main className="shell-light px-6 py-10 max-w-4xl mx-auto">
        <p className="text-[color:var(--muted)]">Loading commissioner desk…</p>
      </main>
    );
  }

  return (
    <AccountShell user={user} title="Commissioner">
      {dash ? (
        <p className="m-0 text-[color:var(--muted)] -mt-4">
          {dash.season.name} · {dash.teams.length} teams ·{" "}
          <Link href="/organizer" className="underline">
            legacy organizer
          </Link>{" "}
          ·{" "}
          <Link href="/host" className="underline">
            host
          </Link>{" "}
          ·{" "}
          <Link href="/packs" className="underline">
            packs
          </Link>
        </p>
      ) : null}

      {error ? <p className="m-0 text-sm text-[color:var(--buzz)]">{error}</p> : null}
      {msg ? <p className="m-0 text-sm text-[color:var(--ok)]">{msg}</p> : null}

      {/* Teams */}
      <section className="flex flex-col gap-4">
        <h2 className="display text-2xl m-0">Teams</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="mono text-left text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)] border-b border-[color:var(--line)]">
                <th className="py-3 pr-3 font-medium">Team</th>
                <th className="py-3 pr-3 font-medium">Captain</th>
                <th className="py-3 pr-3 font-medium">Roster</th>
                <th className="py-3 pr-3 font-medium">Dues</th>
                <th className="py-3 pr-3 font-medium">W-L-T</th>
              </tr>
            </thead>
            <tbody>
              {(dash?.teams || []).map((t) => (
                <tr key={t.registrationId} className="border-b border-[color:var(--line)] align-top">
                  <td className="py-3 pr-3 font-semibold">{t.name}</td>
                  <td className="py-3 pr-3 text-[color:var(--muted)]">
                    {t.captainName}
                    <br />
                    <span className="text-xs">{t.captainEmail}</span>
                  </td>
                  <td className="py-3 pr-3 text-[color:var(--muted)]">
                    {t.roster.map((p) => p.name).join(", ") || "—"}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex flex-col gap-1">
                      <span className="capitalize">{t.paymentStatus}</span>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-ok text-xs py-0.5"
                          type="button"
                          onClick={() => setPayment(t.registrationId, "paid")}
                        >
                          Paid
                        </button>
                        <button
                          className="btn btn-ghost text-xs py-0.5"
                          type="button"
                          onClick={() => setPayment(t.registrationId, "pending")}
                        >
                          Pending
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 mono">
                    {t.wins}-{t.losses}-{t.ties}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form className="flex flex-col gap-3 max-w-lg border-t border-[color:var(--line)] pt-4" onSubmit={createTeam}>
          <h3 className="m-0 text-lg font-semibold">Add team + captain account</h3>
          <input
            className="field"
            placeholder="Team name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
          </div>
          <input
            className="field"
            type="password"
            placeholder="Captain password (8+, new accounts)"
            value={captainPassword}
            onChange={(e) => setCaptainPassword(e.target.value)}
          />
          <textarea
            className="field min-h-[6rem]"
            placeholder={"Roster — one name per line (1–5)\nCaptain\nPlayer 2\n…"}
            value={rosterText}
            onChange={(e) => setRosterText(e.target.value)}
            required
          />
          <label className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
            <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
            Mark dues paid
          </label>
          <button className="btn btn-buzz self-start" type="submit">
            Create team
          </button>
        </form>
      </section>

      {/* Schedule */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="display text-2xl m-0">Schedule</h2>
          <button className="btn btn-ghost text-xs" type="button" onClick={ensureWeeks}>
            Ensure 8 weeks
          </button>
        </div>
        <p className="m-0 text-sm text-[color:var(--muted)]">
          Season week = Sunday–Saturday. Each team gets at most one match per week.
        </p>

        <form
          className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl items-end"
          onSubmit={scheduleMatch}
        >
          <div>
            <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
              Week
            </label>
            <select className="field w-full mt-1" value={weekId} onChange={(e) => setWeekId(e.target.value)} required>
              <option value="">Select week</option>
              {(dash?.schedule.weeks || []).map((w) => (
                <option key={w.id} value={w.id}>
                  Week {w.weekIndex}
                  {w.label ? ` — ${w.label}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
              Starts
            </label>
            <input
              className="field w-full mt-1"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
              Team A
            </label>
            <select className="field w-full mt-1" value={teamAId} onChange={(e) => setTeamAId(e.target.value)} required>
              <option value="">Select</option>
              {teamsForSelect.map((t) => (
                <option key={t.teamId} value={t.teamId}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
              Team B
            </label>
            <select className="field w-full mt-1" value={teamBId} onChange={(e) => setTeamBId(e.target.value)} required>
              <option value="">Select</option>
              {teamsForSelect.map((t) => (
                <option key={t.teamId} value={t.teamId}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
              Reader
            </label>
            <select className="field w-full mt-1" value={readerId} onChange={(e) => setReaderId(e.target.value)}>
              <option value="">Unassigned</option>
              {(dash?.readers || []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name || r.email}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-ink self-start" type="submit">
            Schedule match
          </button>
        </form>

        {(dash?.schedule.weeks || []).map((w) => (
          <div key={w.id} className="border-t border-[color:var(--line)] pt-3">
            <h3 className="m-0 text-base font-semibold">
              Week {w.weekIndex}
              {w.label ? ` · ${w.label}` : ""}
            </h3>
            {w.matches.length === 0 ? (
              <p className="m-0 mt-2 text-sm text-[color:var(--muted)]">No matches</p>
            ) : (
              <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-2">
                {w.matches.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm py-2"
                  >
                    <span>
                      <strong>
                        {m.teamA.name} vs {m.teamB.name}
                      </strong>
                      <span className="text-[color:var(--muted)]">
                        {" "}
                        · {m.status}
                        {m.startsAt
                          ? ` · ${new Date(m.startsAt).toLocaleString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}`
                          : ""}
                      </span>
                    </span>
                    <select
                      className="field text-xs py-1"
                      value={m.reader?.id || ""}
                      onChange={(e) => assignReader(m.id, e.target.value)}
                    >
                      <option value="">No reader</option>
                      {(dash?.readers || []).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name || r.email}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      {/* Users */}
      <section className="flex flex-col gap-4">
        <h2 className="display text-2xl m-0">Accounts</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="mono text-left text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)] border-b border-[color:var(--line)]">
                <th className="py-3 pr-3 font-medium">Name</th>
                <th className="py-3 pr-3 font-medium">Email</th>
                <th className="py-3 pr-3 font-medium">Flags</th>
                <th className="py-3 pr-3 font-medium">Teams</th>
                <th className="py-3 pr-3 font-medium">Reader</th>
              </tr>
            </thead>
            <tbody>
              {(dash?.users || []).map((u) => (
                <tr key={u.id} className="border-b border-[color:var(--line)]">
                  <td className="py-3 pr-3 font-semibold">{u.name || "—"}</td>
                  <td className="py-3 pr-3 text-[color:var(--muted)]">{u.email}</td>
                  <td className="py-3 pr-3 text-xs text-[color:var(--muted)]">
                    {u.isCommissioner ? "commissioner " : ""}
                    {u.isReader ? "reader" : ""}
                  </td>
                  <td className="py-3 pr-3 text-[color:var(--muted)]">
                    {u.teams.map((t) => t.teamName).join(", ") || "—"}
                  </td>
                  <td className="py-3 pr-3">
                    <button
                      className="btn btn-ghost text-xs py-0.5"
                      type="button"
                      onClick={() => toggleReader(u.id, !u.isReader)}
                    >
                      {u.isReader ? "Revoke" : "Make reader"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form className="flex flex-col gap-3 max-w-lg border-t border-[color:var(--line)] pt-4" onSubmit={createUser}>
          <h3 className="m-0 text-lg font-semibold">Create account</h3>
          <input
            className="field"
            placeholder="Name"
            value={uName}
            onChange={(e) => setUName(e.target.value)}
            required
          />
          <input
            className="field"
            type="email"
            placeholder="Email"
            value={uEmail}
            onChange={(e) => setUEmail(e.target.value)}
            required
          />
          <input
            className="field"
            type="password"
            placeholder="Password (8+)"
            value={uPassword}
            onChange={(e) => setUPassword(e.target.value)}
            required
            minLength={8}
          />
          <label className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
            <input type="checkbox" checked={uReader} onChange={(e) => setUReader(e.target.checked)} />
            Reader access
          </label>
          <button className="btn btn-ink self-start" type="submit">
            Create user
          </button>
        </form>
      </section>
    </AccountShell>
  );
}
