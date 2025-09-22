/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import { useEffect, useMemo, useState } from "react";
import { getSocket } from "@/lib/socket";
import VideoClient from "@/components/VideoClient";
import BigTimer from "@/components/BigTimer";

type TeamId = "A" | "B";

export default function PlayPage() {
  const [code, setCode] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [team, setTeam] = useState<TeamId>("A");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<unknown>(null);
  const [eligibleTargets, setEligibleTargets] = useState<string[]>([]);
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null);
  const [timerLabel, setTimerLabel] = useState<string>("");
  const [now, setNow] = useState<number>(Date.now());
  const [rtt, setRtt] = useState<number | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.on("room:state", setState);
    socket.on("kill:promptTargets", (p: { eligible: string[] }) => setEligibleTargets(p.eligible));
    socket.on("kill:applied", () => setEligibleTargets([]));
    socket.on("question:opened", (p: { deadlineAt: number }) => {
      setTimerLabel("Question");
      setDeadlineAt(p.deadlineAt);
    });
    socket.on("steal:opened", (p: { team: TeamId; deadlineAt: number }) => {
      setTimerLabel("Steal");
      setDeadlineAt(p.deadlineAt);
    });
    socket.on("question:timeout", () => setDeadlineAt(null));
    socket.on("steal:timeout", () => setDeadlineAt(null));
    return () => {
      socket.off("room:state");
      socket.off("kill:promptTargets");
      socket.off("kill:applied");
      socket.off("question:opened");
      socket.off("steal:opened");
      socket.off("question:timeout");
      socket.off("steal:timeout");
    };
  }, []);

  // Lightweight ping loop to measure RTT
  useEffect(() => {
    const socket = getSocket();
    if (!code || !playerId) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const sentAt = Date.now();
      socket.emit("client:ping", { code, sentAt });
      // Optimistically compute client-side as well
      const start = sentAt;
      setTimeout(() => {
        if (!cancelled) setRtt(Date.now() - start);
      }, 0);
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [code, playerId]);

  const join = () => getSocket().emit("player:joinRoom", { code, team, name }, (resp: unknown) => {
    if ((resp as unknown as any)?.ok) setPlayerId((resp as unknown as any).playerId);
  });

  const buzz = () => getSocket().emit("player:buzz", { code });
  const kill = (targetId: string) => getSocket().emit("player:assignKillTarget", { code, targetId });

  useEffect(() => {
    if (!deadlineAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadlineAt]);

  // const remainingMs = useMemo(() => (deadlineAt ? Math.max(0, deadlineAt - now) : 0), [deadlineAt, now]);
  // const remainingSec = Math.ceil(remainingMs / 1000);

  const playerNameById = useMemo(() => {
    const map = new Map<string, string>();
    if ((state as any)?.players) {
      for (const p of (state as any).players) map.set((p as any).id, (p as any).name || (p as any).id.slice(0, 6));
    }
    return map;
  }, [state]);

  return (
    <main className="p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Player</h1>
      {/* HUD: scores, question, phase, timer */}
      {state && (
        <div className="hud-card p-4 grid grid-cols-3 gap-3 items-center">
          <div className="text-2xl display">
            <span className="team-a">Team A</span> <span className="score-pill">{state?.scores?.A ?? 0}</span>
            <span className="mx-2 opacity-50">•</span>
            <span className="score-pill">{state?.scores?.B ?? 0}</span> <span className="team-b">Team B</span>
          </div>
          <div className="text-center opacity-90">
            Question {Number(state?.questionIndex ?? 0) + 1} / {state?.maxQuestions ?? 20}
            <span className="ml-2 phase-pill">{state?.phase?.kind}</span>
            {state?.overtime ? <span className="ml-2 phase-pill">overtime</span> : null}
          </div>
          <div className="text-right text-sm opacity-80">{rtt != null ? `${rtt}ms` : ''}</div>
        </div>
      )}
      {state?.overtime && (
        <div className="hud-card p-3 text-center text-lg">
          Sudden Death Overtime — first correct answer wins
        </div>
      )}
      {deadlineAt && (
        <div className="hud-card p-3 flex justify-center">
          <BigTimer deadlineAt={deadlineAt} label={timerLabel} totalMs={timerLabel === "Steal" ? 10000 : 15000} />
        </div>
      )}
      <div className="flex gap-2 items-center flex-wrap">
        <input className="border px-2 py-1 rounded" placeholder="Room code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
        <input className="border px-2 py-1 rounded" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <select className="border px-2 py-1 rounded" value={team} onChange={e => setTeam(e.target.value as TeamId)}>
          <option value="A">Team A</option>
          <option value="B">Team B</option>
        </select>
        <button className="btn-primary" onClick={join} disabled={!code}>Join</button>
        <button className="btn-secondary" onClick={buzz} disabled={!playerId}>Buzz</button>
      </div>

      {playerId && code && <VideoClient code={code} identity={playerId} />}

      {eligibleTargets.length > 0 && !state?.overtime && (
        <div className="flex gap-2 items-center flex-wrap">
          <span className="opacity-70">Select opponent to kill:</span>
          {eligibleTargets.map((pid) => (
            <button key={pid} className="px-3 py-2 rounded bg-red-600 text-white" onClick={() => kill(pid)}>
              {playerNameById.get(pid) ?? pid.slice(0, 6)}
            </button>
          ))}
        </div>
      )}

      {/* Slotted players with buzz counts */}
      {state?.players && (
        <div className="grid grid-cols-2 gap-3">
          {(["A","B"] as const).map((t) => (
            <div key={t} className="hud-card p-2">
              <div className="font-semibold mb-1">Team {t}</div>
              <div className="flex flex-col gap-1">
                {(state as any).slots?.[t]?.map((pid: string) => {
                  const p = (state as any).players.find((pp: unknown) => (pp as any).id === pid);
                  if (!p) return null;
                  const isMe = p.id === playerId;
                  return (
                    <div key={pid} className="flex items-center justify-between text-sm">
                      <span>{p.name || pid.slice(0,6)}{isMe ? " (you)" : ""}</span>
                      <div className="buzz-dots">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className={`dot ${i < (p.buzzesRemaining ?? 0) ? 'on' : ''}`}></span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="hud-card p-3 text-xs"><summary className="cursor-pointer opacity-80">Debug state</summary><pre className="overflow-auto">{JSON.stringify(state, null, 2)}</pre></details>
    </main>
  );
}


