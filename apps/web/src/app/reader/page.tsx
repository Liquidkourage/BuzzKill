"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountShell from "@/components/AccountShell";
import { api, type AuthUser } from "@/lib/auth";

type Home = {
  user: AuthUser;
  reading: {
    id: string;
    status: string;
    startsAt: string | null;
    notes: string | null;
    week: { weekIndex: number; label: string | null };
    teamA: { name: string };
    teamB: { name: string };
  }[];
};

function fmtWhen(iso: string | null) {
  if (!iso) return "Time TBD";
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "Time TBD";
  }
}

export default function ReaderPage() {
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
        setError(data.error || "Failed to load");
        return;
      }
      if (!data.user.isReader && !data.user.isCommissioner) {
        setError("Reader access required — ask the commissioner to enable your account.");
        setHome(data);
        return;
      }
      setHome(data);
    })();
  }, [router]);

  if (!home && !error) {
    return (
      <main className="shell-light px-6 py-10 max-w-4xl mx-auto">
        <p className="text-[color:var(--muted)]">Loading reader desk…</p>
      </main>
    );
  }

  return (
    <AccountShell user={home?.user ?? null} title="Reader desk">
      {error ? <p className="m-0 text-sm text-[color:var(--buzz)]">{error}</p> : null}

      <p className="m-0 text-[color:var(--muted)] max-w-xl">
        Matches assigned to you. On match night open{" "}
        <Link href="/host" className="underline">
          Host
        </Link>{" "}
        with the room code from the commissioner.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="display text-2xl m-0">Assignments</h2>
        {!home?.reading?.length ? (
          <p className="m-0 text-[color:var(--muted)]">No matches assigned yet.</p>
        ) : (
          <ul className="m-0 p-0 list-none">
            {home.reading.map((m) => (
              <li
                key={m.id}
                className="py-4 border-b border-[color:var(--line)] flex flex-col gap-1"
              >
                <div className="font-semibold text-lg">
                  {m.teamA.name} vs {m.teamB.name}
                </div>
                <div className="text-sm text-[color:var(--muted)]">
                  Week {m.week.weekIndex}
                  {m.week.label ? ` · ${m.week.label}` : ""} · {fmtWhen(m.startsAt)} · {m.status}
                </div>
                {m.notes ? <div className="text-sm">{m.notes}</div> : null}
                <div className="mt-2">
                  <Link href="/host" className="btn btn-live text-xs">
                    Open host
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AccountShell>
  );
}
