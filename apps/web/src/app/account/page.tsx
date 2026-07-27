"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountShell from "@/components/AccountShell";
import { api, type AuthUser } from "@/lib/auth";

type Home = {
  user: AuthUser;
  memberships: { role: string; teamId: string; teamName: string }[];
  season: { id: string; name: string; status: string };
  schedule: {
    id: string;
    status: string;
    startsAt: string | null;
    week: { weekIndex: number; label: string | null };
    teamA: { name: string };
    teamB: { name: string };
    reader: { name: string | null; email: string } | null;
  }[];
  reading: {
    id: string;
    status: string;
    startsAt: string | null;
    week: { weekIndex: number; label: string | null };
    teamA: { name: string };
    teamB: { name: string };
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

export default function AccountPage() {
  const router = useRouter();
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const { ok, status, data } = await api<Home>("/account/home");
      if (status === 401) {
        router.replace("/login");
        return;
      }
      if (!ok) {
        setError(data.error || "Failed to load account");
        return;
      }
      setHome(data);
    })();
  }, [router]);

  if (!home && !error) {
    return (
      <main className="shell-light px-6 py-10 max-w-4xl mx-auto">
        <p className="text-[color:var(--muted)]">Loading account…</p>
      </main>
    );
  }

  return (
    <AccountShell user={home?.user ?? null} title="Your account">
      {error ? <p className="m-0 text-sm text-[color:var(--buzz)]">{error}</p> : null}
      {home ? (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="display text-2xl m-0">Profile</h2>
            <p className="m-0 text-[color:var(--muted)]">
              {home.user.email}
              <span className="mx-2 opacity-40">·</span>
              {home.season.name} ({home.season.status})
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="display text-2xl m-0">Teams</h2>
              <Link href="/team" className="mono text-xs uppercase tracking-[0.14em] underline">
                Team portal
              </Link>
            </div>
            {home.memberships.length === 0 ? (
              <p className="m-0 text-[color:var(--muted)]">
                No team yet — ask the commissioner to add you, or{" "}
                <Link href="/enter" className="underline">
                  enter a team
                </Link>
                .
              </p>
            ) : (
              <ul className="m-0 p-0 list-none flex flex-col gap-2">
                {home.memberships.map((m) => (
                  <li
                    key={m.teamId}
                    className="flex justify-between gap-3 py-2 border-b border-[color:var(--line)]"
                  >
                    <span className="font-semibold">{m.teamName}</span>
                    <span className="mono text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">
                      {m.role}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="display text-2xl m-0">Your schedule</h2>
            {home.schedule.length === 0 ? (
              <p className="m-0 text-[color:var(--muted)]">No matches scheduled yet.</p>
            ) : (
              <ul className="m-0 p-0 list-none flex flex-col gap-2">
                {home.schedule.map((m) => (
                  <li
                    key={m.id}
                    className="py-3 border-b border-[color:var(--line)] flex flex-col gap-1"
                  >
                    <div className="font-semibold">
                      {m.teamA.name} vs {m.teamB.name}
                    </div>
                    <div className="text-sm text-[color:var(--muted)]">
                      Week {m.week.weekIndex}
                      {m.week.label ? ` · ${m.week.label}` : ""} · {fmtWhen(m.startsAt)} ·{" "}
                      {m.status}
                      {m.reader ? ` · Reader ${m.reader.name || m.reader.email}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {home.user.isReader ? (
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="display text-2xl m-0">Reading assignments</h2>
                <Link href="/reader" className="mono text-xs uppercase tracking-[0.14em] underline">
                  Reader desk
                </Link>
              </div>
              {home.reading.length === 0 ? (
                <p className="m-0 text-[color:var(--muted)]">No upcoming reads.</p>
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col gap-2">
                  {home.reading.map((m) => (
                    <li key={m.id} className="py-2 border-b border-[color:var(--line)] text-sm">
                      <span className="font-semibold">
                        {m.teamA.name} vs {m.teamB.name}
                      </span>
                      <span className="text-[color:var(--muted)]">
                        {" "}
                        · Week {m.week.weekIndex} · {fmtWhen(m.startsAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <p className="m-0 text-sm text-[color:var(--muted)]">
            Match night:{" "}
            <Link href="/play" className="underline">
              /play
            </Link>
            {home.user.isCommissioner || home.user.isReader ? (
              <>
                {" "}
                · Host:{" "}
                <Link href="/host" className="underline">
                  /host
                </Link>
              </>
            ) : null}
          </p>
        </>
      ) : null}
    </AccountShell>
  );
}
