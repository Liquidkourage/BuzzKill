/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import VideoClient from "@/components/VideoClient";
import StageLayout from "@/components/StageLayout";
import StageVideoLayout from "@/components/StageVideoLayout";
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

  const leftPlayers = (() => {
    const s: any = state || {};
    const ids: string[] = s?.slots?.A || [];
    return ids.slice(0, 4).map((pid) => {
      const p = (s?.players || []).find((pp: any) => pp.id === pid) || {};
      return { id: pid, name: p.name || pid.slice(0, 6), buzzesRemaining: p.buzzesRemaining ?? 0, latencyMs: s?.latencyMsByPlayer?.[pid] };
    });
  })();
  const rightPlayers = (() => {
    const s: any = state || {};
    const ids: string[] = s?.slots?.B || [];
    return ids.slice(0, 4).map((pid) => {
      const p = (s?.players || []).find((pp: any) => pp.id === pid) || {};
      return { id: pid, name: p.name || pid.slice(0, 6), buzzesRemaining: p.buzzesRemaining ?? 0, latencyMs: s?.latencyMsByPlayer?.[pid] };
    });
  })();

  return (
    <main className="p-6 max-w-[1500px] mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Host Console</h1>
      <div className="flex gap-2 items-center">
        <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={createRoom}>Create Room</button>
        <span className="opacity-70">Code: {code || "-"}</span>
      </div>
      {/* HUD: scores, question, phase */}
      {state && (
        <div className="hud-card p-4 grid grid-cols-3 gap-3 items-center">
          <div className="text-2xl display">
            <span className="team-a">Team A</span> <span className="score-pill">{(state as any)?.scores?.A ?? 0}</span>
            <span className="mx-2 opacity-50">•</span>
            <span className="score-pill">{(state as any)?.scores?.B ?? 0}</span> <span className="team-b">Team B</span>
          </div>
          <div className="text-center opacity-90">
            Question {Number((state as any)?.questionIndex ?? 0) + 1} / {(state as any)?.maxQuestions ?? 20}
            <span className="ml-2 phase-pill">{(state as any)?.phase?.kind}</span>
            {(state as any)?.overtime ? <span className="ml-2 phase-pill">overtime</span> : null}
          </div>
          <div className="text-right flex justify-end">
            <BigTimer
              deadlineAt={(state as any)?.phase?.kind === "open" || (state as any)?.phase?.kind === "steal_open" ? (state as any)?.phase?.deadlineAt : null}
              label={(state as any)?.phase?.kind === "steal_open" ? "Steal" : (state as any)?.phase?.kind === "open" ? ((state as any)?.overtime ? "OT Question" : "Question") : undefined}
              totalMs={(state as any)?.phase?.kind === "steal_open" ? 10000 : 15000}
            />
          </div>
        </div>
      )}
      {(state as any)?.overtime && (
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
      {code && (
        <StageVideoLayout
          code={code}
          identity={`host-${code}`}
          hostIdentity={`host-${code}`}
          leftIdentities={(state as any)?.slots?.A || []}
          rightIdentities={(state as any)?.slots?.B || []}
          screen={<div className="w-full h-full flex items-center justify-center text-xl opacity-80">Game Screen</div>}
        />
      )}
      <details className="hud-card p-3 text-xs"><summary className="cursor-pointer opacity-80">Debug state</summary><pre className="overflow-auto">{JSON.stringify(state, null, 2)}</pre></details>
    </main>
  );
}


