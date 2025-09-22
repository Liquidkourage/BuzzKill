"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import VideoClient from "@/components/VideoClient";
import BigTimer from "@/components/BigTimer";

export default function HostPage() {
  const [code, setCode] = useState<string>("");
  const [state, setState] = useState<unknown>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.on("host:created", (p) => setCode(p.code));
    socket.on("room:state", setState);
    // Host also receives ping summaries via state.latencyMsByPlayer in debug panel; no need to ping
    return () => {
      socket.off("host:created");
      socket.off("room:state");
    };
  }, []);

  const createRoom = () => getSocket().emit("host:createRoom", {}, () => {});
  const openBuzzers = () => getSocket().emit("host:openBuzzers", { code });

  // Grading controls
  const markCorrectInitial = () => getSocket().emit("host:markCorrectInitial", { code });
  const markIncorrectInitial = () => getSocket().emit("host:markIncorrectInitial", { code });
  const markCorrectSteal = () => getSocket().emit("host:markCorrectSteal", { code });
  const markIncorrectSteal = () => getSocket().emit("host:markIncorrectSteal", { code });

  return (
    <main className="p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Host Console</h1>
      <div className="flex gap-2 items-center">
        <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={createRoom}>Create Room</button>
        <span className="opacity-70">Code: {code || "-"}</span>
      </div>
      {/* HUD: scores, question, phase */}
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
          <div className="text-right flex justify-end">
            <BigTimer
              deadlineAt={state?.phase?.kind === "open" || state?.phase?.kind === "steal_open" ? state?.phase?.deadlineAt : null}
              label={state?.phase?.kind === "steal_open" ? "Steal" : state?.phase?.kind === "open" ? (state?.overtime ? "OT Question" : "Question") : undefined}
              totalMs={state?.phase?.kind === "steal_open" ? 10000 : 15000}
            />
          </div>
        </div>
      )}
      {state?.overtime && (
        <div className="hud-card p-3 text-center text-lg">
          Sudden Death Overtime — first correct answer wins
        </div>
      )}
      <div className="flex gap-2 items-center">
        <button className="btn-primary" onClick={openBuzzers} disabled={!code}>Open Buzzers</button>
      </div>
      <div className="flex gap-2 items-center">
        <button className="btn-secondary" onClick={markCorrectInitial} disabled={!code}>Correct (Initial)</button>
        <button className="btn-secondary" onClick={markIncorrectInitial} disabled={!code}>Incorrect (Initial)</button>
        <button className="btn-secondary" onClick={markCorrectSteal} disabled={!code}>Correct (Steal)</button>
        <button className="btn-secondary" onClick={markIncorrectSteal} disabled={!code}>Incorrect (Steal)</button>
      </div>
      {/* Slotted players with buzz counts + RTT if available */}
      {state?.players && (
        <div className="grid grid-cols-2 gap-3">
          {(["A","B"] as const).map((t) => (
            <div key={t} className="hud-card p-2">
              <div className="font-semibold mb-1">Team {t}</div>
              <div className="flex flex-col gap-1">
                {state.slots?.[t]?.map((pid: string) => {
                  const p = (state as any).players.find((pp: unknown) => (pp as any).id === pid);
                  if (!p) return null;
                  return (
                    <div key={pid} className="flex items-center justify-between text-sm">
                      <span>{p.name || pid.slice(0,6)}{typeof state?.latencyMsByPlayer?.[pid] === 'number' ? ` · ${state.latencyMsByPlayer[pid]}ms` : ''}</span>
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
      {code && <VideoClient code={code} identity={`host-${code}`} />}
      <details className="hud-card p-3 text-xs"><summary className="cursor-pointer opacity-80">Debug state</summary><pre className="overflow-auto">{JSON.stringify(state, null, 2)}</pre></details>
    </main>
  );
}


