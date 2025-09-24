/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
// VideoClient not used in grid layout; kept available for future
// import VideoClient from "@/components/VideoClient";
// import StageLayout from "@/components/StageLayout";
import StageVideoLayout from "@/components/StageVideoLayout";
import BigTimer from "@/components/BigTimer";

export default function HostPage() {
  const [code, setCode] = useState<string>("");
  const [hostName, setHostName] = useState<string>("");
  const [hostPronouns, setHostPronouns] = useState<string>("");
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

  // Player arrays are computed inside StageVideoLayout; no local copies needed

  return (
    <main className="p-6 max-w-[1500px] mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Host Console</h1>
      <div className="flex gap-2 items-center">
        <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={createRoom}>Create Room</button>
        <span className="opacity-70">Code: {code || "-"}</span>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <input className="border px-2 py-1 rounded" placeholder="Host name" value={hostName} onChange={e => setHostName(e.target.value)} />
        <input className="border px-2 py-1 rounded" placeholder="Pronouns" value={hostPronouns} onChange={e => setHostPronouns(e.target.value)} />
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
          hostLabel={hostName ? `READER: ${hostName}${hostPronouns ? ` (${hostPronouns})` : ''}` : undefined}
          leftIdentities={(state as any)?.slots?.A || []}
          rightIdentities={(state as any)?.slots?.B || []}
          screen={<div className="w-full h-full flex items-center justify-center text-xl opacity-80">Game Screen</div>}
        />
      )}
      <details className="hud-card p-3 text-xs"><summary className="cursor-pointer opacity-80">Debug state</summary><pre className="overflow-auto">{JSON.stringify(state, null, 2)}</pre></details>
    </main>
  );
}


