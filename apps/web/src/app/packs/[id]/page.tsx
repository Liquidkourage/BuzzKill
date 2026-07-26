"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { serverUrl } from "@/lib/league";

type Question = {
  id: string;
  prompt: string;
  answer: string;
  category: string | null;
  sortOrder: number;
};

type Pack = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  questions: Question[];
};

const KEY_STORAGE = "buzzkill.organizerKey";

export default function PackEditorPage() {
  const params = useParams();
  const id = String(params?.id || "");
  const [key, setKey] = useState("");
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [category, setCategory] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [importText, setImportText] = useState("");

  const load = async (organizerKey = key) => {
    if (!id) return;
    setError("");
    try {
      const res = await fetch(`${serverUrl()}/packs/${id}`, {
        headers: organizerKey ? { "x-organizer-key": organizerKey } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load pack");
      setPack(data.pack);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  };

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY_STORAGE) || "";
      setKey(saved);
      void load(saved);
    } catch {
      void load("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const headers = () => ({
    "Content-Type": "application/json",
    "x-organizer-key": key,
  });

  const setStatus = async (status: string) => {
    setError("");
    setMsg("");
    try {
      const res = await fetch(`${serverUrl()}/packs/${id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Update failed");
      setMsg(`Status → ${status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const addOne = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const res = await fetch(`${serverUrl()}/packs/${id}/questions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ category, prompt, answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Add failed");
      setCategory("");
      setPrompt("");
      setAnswer("");
      setMsg("Question added");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    }
  };

  const doImport = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const res = await fetch(`${serverUrl()}/packs/${id}/import`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ text: importText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Import failed");
      setImportText("");
      setMsg(`Imported ${data.imported} questions`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  };

  const remove = async (questionId: string) => {
    setError("");
    try {
      const res = await fetch(`${serverUrl()}/questions/${questionId}`, {
        method: "DELETE",
        headers: { "x-organizer-key": key },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Delete failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (!pack && !error) {
    return (
      <main className="shell-light px-6 py-10 max-w-3xl mx-auto">
        <p className="text-[color:var(--muted)]">Loading pack…</p>
      </main>
    );
  }

  return (
    <main className="shell-light px-6 py-10 max-w-3xl mx-auto flex flex-col gap-8">
      <div>
        <Link
          href="/packs"
          className="mono text-xs tracking-[0.18em] uppercase text-[color:var(--muted)]"
        >
          All packs
        </Link>
        <h1 className="display text-5xl mt-2 m-0">{pack?.name || "Pack"}</h1>
        <p className="mt-2 text-[color:var(--muted)] m-0">
          {pack?.questions.length ?? 0} questions · {pack?.status}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[14rem]">
          <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
            Organizer key
          </label>
          <input
            className="field w-full mt-1"
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              try {
                sessionStorage.setItem(KEY_STORAGE, e.target.value);
              } catch {
                /* ignore */
              }
            }}
            placeholder="ORGANIZER_KEY"
          />
        </div>
        <button className="btn btn-ok" type="button" onClick={() => setStatus("ready")} disabled={!key}>
          Mark ready
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => setStatus("draft")} disabled={!key}>
          Draft
        </button>
      </div>

      {error ? <p className="m-0 text-sm text-[color:var(--buzz)]">{error}</p> : null}
      {msg ? <p className="m-0 text-sm text-[color:var(--ok)]">{msg}</p> : null}

      <form className="flex flex-col gap-3" onSubmit={addOne}>
        <h2 className="display text-2xl m-0">Add question</h2>
        <input
          className="field"
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <textarea
          className="field min-h-[5rem]"
          placeholder="Question"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
        />
        <input
          className="field"
          placeholder="Answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          required
        />
        <button className="btn btn-ink w-fit" type="submit" disabled={!key}>
          Add
        </button>
      </form>

      <form className="flex flex-col gap-3" onSubmit={doImport}>
        <h2 className="display text-2xl m-0">Bulk import</h2>
        <p className="m-0 text-sm text-[color:var(--muted)]">
          One per line: <span className="mono">category | question | answer</span>
        </p>
        <textarea
          className="field min-h-[8rem] mono text-sm"
          placeholder={"Sports | Who won Super Bowl LVIII? | Chiefs\nMovies | First Toy Story year? | 1995"}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        <button className="btn btn-buzz w-fit" type="submit" disabled={!key || !importText.trim()}>
          Import lines
        </button>
      </form>

      <section>
        <h2 className="display text-2xl m-0 mb-4">Queue</h2>
        <ol className="list-none m-0 p-0 flex flex-col gap-0">
          {(pack?.questions || []).map((q, i) => (
            <li
              key={q.id}
              className="border-b border-[color:var(--line)] py-4 flex flex-wrap gap-3 justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
                  Q{i + 1}
                  {q.category ? ` · ${q.category}` : ""}
                </div>
                <div className="font-semibold mt-1">{q.prompt}</div>
                <div className="text-sm text-[color:var(--muted)] mt-1">Answer: {q.answer}</div>
              </div>
              <button
                className="btn btn-ghost text-xs py-1 h-fit"
                type="button"
                onClick={() => remove(q.id)}
                disabled={!key}
              >
                Remove
              </button>
            </li>
          ))}
          {(pack?.questions || []).length === 0 ? (
            <li className="py-6 text-[color:var(--muted)]">Empty pack — add questions above.</li>
          ) : null}
        </ol>
      </section>
    </main>
  );
}
