/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSocket } from "@/lib/socket";
import StageVideoLayout from "@/components/StageVideoLayout";
import GameScreen from "@/components/GameScreen";
import BigTimer from "@/components/BigTimer";

type PhaseKind = "idle" | "open" | "locked" | "steal_open" | "ended";

const PHASE_LABEL: Record<PhaseKind, string> = {
  idle: "Ready",
  open: "Buzzers open",
  locked: "Answer locked",
  steal_open: "Steal window",
  ended: "Match over",
};

const STORAGE_KEY = "buzzkill.host.room";

export default function HostPage() {
  const [code, setCode] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [hostName, setHostName] = useState("");
  const [hostPronouns, setHostPronouns] = useState("");
  const [category, setCategory] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [state, setState] = useState<any>(null);
  const [status, setStatus] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setClaimCode(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const onCreated = (p: { code: string }) => {
      setCode(p.code);
      setClaimCode(p.code);
      try {
        sessionStorage.setItem(STORAGE_KEY, p.code);
      } catch {
        /* ignore */
      }
    };
    socket.on("host:created", onCreated);
    socket.on("room:state", setState);
    socket.on("lockout:winner", (p: { name: string; team: string }) => {
      setStatus(`${p.name} (Team ${p.team}) locked in — grade the answer`);
    });
    socket.on("steal:lockout", (p: { name: string; team: string }) => {
      setStatus(`Steal lock: ${p.name} (Team ${p.team}) — grade the steal`);
    });
    socket.on("match:end", () => setStatus("Match complete"));
    socket.on("match:overtime", () => setStatus("Tied — sudden death overtime"));
    return () => {
      socket.off("host:created", onCreated);
      socket.off("room:state");
      socket.off("lockout:winner");
      socket.off("steal:lockout");
      socket.off("match:end");
      socket.off("match:overtime");
    };
  }, []);

  const phase = (state?.phase?.kind || "idle") as PhaseKind;
  const lockedPlayer = useMemo(() => {
    if (phase !== "locked" || !state?.phase?.playerId) return null;
    return (state.players || []).find((p: any) => p.id === state.phase.playerId) || null;
  }, [phase, state]);

  const createRoom = () => {
    setStatus("Creating room…");
    getSocket().emit("host:createRoom", {}, () => setStatus("Room live — share the code"));
  };

  const claimRoom = () => {
    const c = claimCode.trim().toUpperCase();
    if (!c) return;
    setStatus("Reclaiming room…");
    getSocket().emit("host:claimRoom", { code: c }, (resp: any) => {
      if (resp?.ok) {
        setCode(resp.code);
        setStatus("Host seat reclaimed");
      } else {
        setStatus(resp?.reason || "Could not reclaim room");
      }
    });
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setStatus("Copy failed — select the code manually");
    }
  };

  const openBuzzers = () => getSocket().emit("host:openBuzzers", { code });
  const setScreen = () => {
    getSocket().emit("host:screenSet", { code, category, question, answer });
    setStatus("Screen set — players see category/question");
  };
  const reveal = () => {
    getSocket().emit("host:screenReveal", { code });
    setStatus("Answer revealed");
  };
  const clearScreen = () => getSocket().emit("host:screenClear", { code });
  const markCorrectInitial = () => getSocket().emit("host:markCorrectInitial", { code });
  const markIncorrectInitial = () => getSocket().emit("host:markIncorrectInitial", { code });
  const markCorrectSteal = () => getSocket().emit("host:markCorrectSteal", { code });
  const markIncorrectSteal = () => getSocket().emit("host:markIncorrectSteal", { code });
  const skipKill = () => getSocket().emit("host:skipKill", { code });

  const playUrl =
    typeof window !== "undefined" ? `${window.location.origin}/play` : "/play";

  return (
    <main className="p-4 sm:p-6 max-w-[1500px] mx-auto flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-xs uppercase tracking-widest text-white/50 hover:text-white/80">
            BuzzKill
          </Link>
          <h1 className="display text-4xl">Host Console</h1>
        </div>
        {code ? (
          <div className="hud-card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-white/50">Room code</div>
              <div className="display text-3xl tracking-widest text-fuchsia-300">{code}</div>
            </div>
            <button className="btn-secondary" onClick={copyCode}>
              {copied ? "Copied" : "Copy code"}
            </button>
            <a className="btn-secondary text-center" href={playUrl} target="_blank" rel="noreferrer">
              Open player join
            </a>
          </div>
        ) : null}
      </div>

      {!code ? (
        <div className="hud-card p-5 flex flex-col gap-4 max-w-xl">
          <p className="text-white/70">
            Create a room, share the code with players, then run questions from this console.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={createRoom}>
              Create room
            </button>
          </div>
          <div className="border-t border-white/10 pt-4 flex flex-col gap-2">
            <div className="text-sm text-white/60">Refresh mid-match? Reclaim an existing code:</div>
            <div className="flex flex-wrap gap-2">
              <input
                className="border border-white/20 bg-black/30 px-3 py-2 rounded tracking-widest uppercase"
                placeholder="ROOM CODE"
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
              />
              <button className="btn-secondary" onClick={claimRoom} disabled={!claimCode.trim()}>
                Reclaim host
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="border border-white/20 bg-black/30 px-3 py-2 rounded"
              placeholder="Your name (READER)"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
            />
            <input
              className="border border-white/20 bg-black/30 px-3 py-2 rounded w-28"
              placeholder="Pronouns"
              value={hostPronouns}
              onChange={(e) => setHostPronouns(e.target.value)}
            />
            {status ? <span className="text-sm text-amber-200/90">{status}</span> : null}
          </div>

          {state && (
            <div className="hud-card p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <div className="text-2xl display">
                <span className="team-a">Team A</span>{" "}
                <span className="score-pill">{state?.scores?.A ?? 0}</span>
                <span className="mx-2 opacity-50">•</span>
                <span className="score-pill">{state?.scores?.B ?? 0}</span>{" "}
                <span className="team-b">Team B</span>
              </div>
              <div className="text-center opacity-90">
                Q {Number(state?.questionIndex ?? 0) + 1} / {state?.maxQuestions ?? 20}
                <span className="ml-2 phase-pill">{PHASE_LABEL[phase] || phase}</span>
                {state?.overtime ? <span className="ml-2 phase-pill">OT</span> : null}
              </div>
              <div className="flex justify-center md:justify-end">
                <BigTimer
                  deadlineAt={phase === "open" || phase === "steal_open" ? state?.phase?.deadlineAt : null}
                  label={
                    phase === "steal_open"
                      ? "Steal"
                      : phase === "open"
                        ? state?.overtime
                          ? "OT"
                          : "Buzz"
                        : undefined
                  }
                  totalMs={phase === "steal_open" ? 10000 : 15000}
                />
              </div>
            </div>
          )}

          {/* Roster */}
          {state?.players && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(["A", "B"] as const).map((t) => (
                <div key={t} className="hud-card p-3">
                  <div className={`font-semibold mb-2 ${t === "A" ? "team-a" : "team-b"}`}>
                    Team {t} ({state.slots?.[t]?.length || 0}/4)
                  </div>
                  <div className="flex flex-col gap-1 text-sm">
                    {(state.slots?.[t] || []).map((pid: string) => {
                      const p = (state.players || []).find((pp: any) => pp.id === pid);
                      if (!p) return null;
                      const locked = lockedPlayer?.id === pid;
                      return (
                        <div key={pid} className={`flex justify-between ${locked ? "text-amber-300" : ""}`}>
                          <span>
                            {p.name}
                            {locked ? " ← locked" : ""}
                          </span>
                          <span className="opacity-70">{p.buzzesRemaining} buzz</span>
                        </div>
                      );
                    })}
                    {(state.slots?.[t] || []).length === 0 ? (
                      <span className="opacity-40 text-xs">Waiting for players…</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Question board */}
          <div className="hud-card p-4 flex flex-col gap-3">
            <div className="font-semibold">1. Set the board</div>
            <div className="flex flex-wrap gap-2">
              <input
                className="border border-white/20 bg-black/30 px-3 py-2 rounded"
                placeholder="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <input
                className="border border-white/20 bg-black/30 px-3 py-2 rounded flex-1 min-w-[220px]"
                placeholder="Question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <input
                className="border border-white/20 bg-black/30 px-3 py-2 rounded min-w-[160px]"
                placeholder="Answer (hidden until reveal)"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={setScreen} disabled={!code || !question}>
                Push to screen
              </button>
              <button className="btn-secondary" onClick={reveal} disabled={!code}>
                Reveal answer
              </button>
              <button className="btn-secondary" onClick={clearScreen} disabled={!code}>
                Clear screen
              </button>
            </div>
          </div>

          {/* Phase actions */}
          <div className="hud-card p-4 flex flex-col gap-3">
            <div className="font-semibold">2. Run the question</div>
            {phase === "idle" && (
              <button className="btn-primary w-fit" onClick={openBuzzers} disabled={!code}>
                Open buzzers
              </button>
            )}
            {phase === "open" && (
              <p className="text-sm text-white/70">Buzzers are live. Waiting for first buzz…</p>
            )}
            {phase === "steal_open" && (
              <p className="text-sm text-amber-200">
                Steal open for Team {state?.phase?.team}. Waiting for a buzz…
              </p>
            )}
            {phase === "locked" && (
              <div className="flex flex-col gap-3">
                <p className="text-sm">
                  Locked: <strong>{lockedPlayer?.name || "Player"}</strong> (Team {lockedPlayer?.team})
                </p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={markCorrectInitial}>
                    Correct → point + BuzzKill
                  </button>
                  <button className="btn-secondary" onClick={markIncorrectInitial}>
                    Incorrect → steal
                  </button>
                  <button className="btn-secondary" onClick={markCorrectSteal}>
                    Correct steal → point
                  </button>
                  <button className="btn-secondary" onClick={markIncorrectSteal}>
                    Incorrect steal → next
                  </button>
                  <button className="btn-secondary" onClick={skipKill}>
                    Skip kill / next Q
                  </button>
                </div>
                <p className="text-xs text-white/45">
                  Use initial correct/incorrect for the first buzz; steal buttons after a steal lock.
                  “Skip kill” advances if the winner doesn’t pick a target.
                </p>
              </div>
            )}
            {phase === "ended" && (
              <p className="text-lg text-emerald-300">
                Final: Team A {state?.scores?.A} — Team B {state?.scores?.B}
              </p>
            )}
          </div>

          <StageVideoLayout
            code={code}
            identity={`host-${code}`}
            hostIdentity={`host-${code}`}
            hostLabel={
              hostName ? `READER: ${hostName}${hostPronouns ? ` (${hostPronouns})` : ""}` : "READER"
            }
            leftIdentities={state?.slots?.A || []}
            rightIdentities={state?.slots?.B || []}
            playerNames={Object.fromEntries(
              (state?.players || []).map((p: any) => [p.id, p.name || p.id.slice(0, 6)])
            )}
            screen={<GameScreen screen={state?.screen} />}
          />
        </>
      )}
    </main>
  );
}
