"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { serverUrl } from "@/lib/league";

type PackRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  questionCount: number;
};

const KEY_STORAGE = "buzzkill.organizerKey";

export default function PacksPage() {
  const [key, setKey] = useState("");
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = async (organizerKey = key) => {
    setError("");
    try {
      const res = await fetch(`${serverUrl()}/packs`, {
        headers: organizerKey ? { "x-organizer-key": organizerKey } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load packs");
      setPacks(data.packs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  };

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY_STORAGE);
      if (saved) setKey(saved);
      void load(saved || "");
    } catch {
      void load("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveKey = (e: FormEvent) => {
    e.preventDefault();
    try {
      sessionStorage.setItem(KEY_STORAGE, key);
    } catch {
      /* ignore */
    }
    setMsg("Key saved for this session");
    void load(key);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const res = await fetch(`${serverUrl()}/packs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organizer-key": key,
        },
        body: JSON.stringify({ name, status: "draft" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Create failed");
      setName("");
      setMsg(`Created ${data.pack.name}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  return (
    <main className="shell-light px-6 py-10 max-w-3xl mx-auto flex flex-col gap-8">
      <div>
        <Link href="/" className="mono text-xs tracking-[0.18em] uppercase text-[color:var(--muted)]">
          BuzzKill
        </Link>
        <h1 className="display text-5xl mt-2 m-0">Question packs</h1>
        <p className="mt-2 text-[color:var(--muted)] m-0">
          Build match-night packs, then attach one from Host.{" "}
          <Link href="/organizer" className="underline underline-offset-2">
            Dues desk
          </Link>
        </p>
      </div>

      <form className="flex flex-wrap gap-2 items-end" onSubmit={saveKey}>
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

      <form className="flex flex-wrap gap-2 items-end" onSubmit={create}>
        <div className="flex-1 min-w-[14rem]">
          <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
            New pack
          </label>
          <input
            className="field w-full mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Season 1 · Week 3"
            required
          />
        </div>
        <button className="btn btn-buzz" type="submit" disabled={!key || !name.trim()}>
          Create
        </button>
      </form>

      {error ? <p className="m-0 text-sm text-[color:var(--buzz)]">{error}</p> : null}
      {msg ? <p className="m-0 text-sm text-[color:var(--ok)]">{msg}</p> : null}

      <ul className="list-none m-0 p-0 flex flex-col gap-0">
        {packs.map((p) => (
          <li key={p.id} className="border-b border-[color:var(--line)] py-4 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <Link href={`/packs/${p.id}`} className="font-semibold text-lg underline-offset-2 hover:underline">
                {p.name}
              </Link>
              <div className="mono text-xs tracking-[0.12em] uppercase text-[color:var(--muted)] mt-1">
                {p.status}
                <span className="mx-2 opacity-40">·</span>
                {p.questionCount} Q
              </div>
            </div>
            <Link href={`/packs/${p.id}`} className="btn btn-ghost text-xs py-1">
              Edit
            </Link>
          </li>
        ))}
        {packs.length === 0 ? (
          <li className="py-8 text-[color:var(--muted)]">No packs yet — create one above.</li>
        ) : null}
      </ul>
    </main>
  );
}
