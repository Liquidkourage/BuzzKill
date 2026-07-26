/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSocket } from "@/lib/socket";
import StageVideoLayout from "@/components/StageVideoLayout";
import GameScreen from "@/components/GameScreen";
import BigTimer from "@/components/BigTimer";

type TeamId = "A" | "B";
type PhaseKind = "idle" | "open" | "locked" | "steal_open" | "ended";

const STORAGE_KEY = "buzzkill.player.session";

const PHASE_HINT: Record<PhaseKind, string> = {
  idle: "Wait for the host to open buzzers",
  open: "Buzzers are open — hit BUZZ!",
  locked: "Someone locked in — listen for the host",
  steal_open: "Steal window — opposing team can buzz",
  ended: "Match over",
};

export default function PlayPage() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState<TeamId>("A");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<any>(null);
  const [eligibleTargets, setEligibleTargets] = useState<string[]>([]);
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null);
  const [timerLabel, setTimerLabel] = useState("");
  const [joinError, setJoinError] = useState("");
  const [banner, setBanner] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved?.code) setCode(String(saved.code).toUpperCase());
      if (saved?.name) setName(String(saved.name));
      if (saved?.team === "A" || saved?.team === "B") setTeam(saved.team);
      if (saved?.playerId) setPlayerId(String(saved.playerId));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();
    socket.on("room:state", setState);
    socket.on("kill:promptTargets", (p: { eligible: string[]; playerId?: string }) => {
      if (p.playerId && playerId && p.playerId !== playerId) return;
      setEligibleTargets(p.eligible || []);
      setBanner("You scored — pick an opponent to BuzzKill");
    });
    socket.on("kill:applied", () => {
      setEligibleTargets([]);
      setBanner("BuzzKill applied");
    });
    socket.on("question:opened", (p: { deadlineAt: number }) => {
      setTimerLabel("Buzz");
      setDeadlineAt(p.deadlineAt);
      setBanner("Buzzers open!");
      setEligibleTargets([]);
    });
    socket.on("steal:opened", (p: { team: TeamId; deadlineAt: number }) => {
      setTimerLabel("Steal");
      setDeadlineAt(p.deadlineAt);
      setBanner(`Steal open for Team ${p.team}`);
    });
    socket.on("question:timeout", () => {
      setDeadlineAt(null);
      setBanner("Time — no buzz");
    });
    socket.on("steal:timeout", () => {
      setDeadlineAt(null);
      setBanner("Steal timed out");
    });
    socket.on("lockout:winner", (p: { playerId: string; name: string }) => {
      setDeadlineAt(null);
      setBanner(p.playerId === playerId ? "You locked in!" : `${p.name} locked in`);
    });
    socket.on("steal:lockout", (p: { playerId: string; name: string }) => {
      setDeadlineAt(null);
      setBanner(p.playerId === playerId ? "You stole the lock!" : `${p.name} stole the lock`);
    });
    socket.on("match:end", () => setBanner("Match complete"));
    socket.on("match:overtime", () => setBanner("Sudden death overtime"));
    return () => {
      socket.off("room:state");
      socket.off("kill:promptTargets");
      socket.off("kill:applied");
      socket.off("question:opened");
      socket.off("steal:opened");
      socket.off("question:timeout");
      socket.off("steal:timeout");
      socket.off("lockout:winner");
      socket.off("steal:lockout");
      socket.off("match:end");
      socket.off("match:overtime");
    };
  }, [playerId]);

  // Auto-rejoin after refresh if we still have a seat
  useEffect(() => {
    if (!playerId || !code || !name) return;
    const socket = getSocket();
    const tryRejoin = () => {
      socket.emit(
        "player:joinRoom",
        { code, team, name, playerId },
        (resp: any) => {
          if (resp?.ok) {
            setPlayerId(resp.playerId);
            setJoinError("");
          }
        }
      );
    };
    if (socket.connected) tryRejoin();
    socket.on("connect", tryRejoin);
    return () => {
      socket.off("connect", tryRejoin);
    };
  }, [playerId, code, name, team]);

  const me = useMemo(
    () => (state?.players || []).find((p: any) => p.id === playerId) || null,
    [state, playerId]
  );

  const phase = (state?.phase?.kind || "idle") as PhaseKind;
  const canBuzz = useMemo(() => {
    if (!playerId || !me?.slotted) return false;
    if ((me.buzzesRemaining ?? 0) <= 0) return false;
    if (phase === "open") return true;
    if (phase === "steal_open") return state?.phase?.team === me.team;
    return false;
  }, [playerId, me, phase, state]);

  const playerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of state?.players || []) map.set(p.id, p.name || p.id.slice(0, 6));
    return map;
  }, [state]);

  const persist = (next: { code: string; name: string; team: TeamId; playerId: string }) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const join = () => {
    setJoinError("");
    const room = code.trim().toUpperCase();
    if (!room || !name.trim()) {
      setJoinError("Enter room code and your name");
      return;
    }
    getSocket().emit(
      "player:joinRoom",
      { code: room, team, name: name.trim(), playerId: playerId || undefined },
      (resp: any) => {
        if (resp?.ok) {
          setCode(room);
          setPlayerId(resp.playerId);
          persist({ code: room, name: name.trim(), team, playerId: resp.playerId });
          setBanner(resp.rejoined ? "Rejoined match" : "You're in — wait for the host");
        } else {
          setJoinError(resp?.reason || "Could not join");
        }
      }
    );
  };

  const buzz = () => {
    if (!canBuzz) return;
    getSocket().emit("player:buzz", { code });
  };

  const kill = (targetId: string) => {
    getSocket().emit("player:assignKillTarget", { code, targetId });
    setEligibleTargets([]);
  };

  if (!playerId) {
    return (
      <main className="p-6 max-w-lg mx-auto flex flex-col gap-5">
        <div>
          <Link href="/" className="text-xs uppercase tracking-widest text-white/50 hover:text-white/80">
            BuzzKill
          </Link>
          <h1 className="display text-5xl mt-1">Join match</h1>
          <p className="text-white/65 mt-2">Enter the room code from your host.</p>
        </div>
        <div className="hud-card p-5 flex flex-col gap-3">
          <input
            className="border border-white/20 bg-black/30 px-3 py-3 rounded tracking-widest uppercase text-lg"
            placeholder="ROOM CODE"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <input
            className="border border-white/20 bg-black/30 px-3 py-3 rounded"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="border border-white/20 bg-black/30 px-3 py-3 rounded"
            value={team}
            onChange={(e) => setTeam(e.target.value as TeamId)}
          >
            <option value="A">Team A</option>
            <option value="B">Team B</option>
          </select>
          {joinError ? <p className="text-sm text-red-300">{joinError}</p> : null}
          <button className="btn-primary text-lg py-3" onClick={join}>
            Join game
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6 max-w-[1500px] mx-auto flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-xs uppercase tracking-widest text-white/50 hover:text-white/80">
            BuzzKill
          </Link>
          <h1 className="display text-4xl">
            {me?.name || name}{" "}
            <span className={me?.team === "B" ? "team-b" : "team-a"}>Team {me?.team || team}</span>
          </h1>
          <p className="text-sm text-white/55">
            Room <span className="tracking-widest text-white/80">{code}</span>
            {me ? ` · ${me.buzzesRemaining} buzzes left` : ""}
            {me && !me.slotted ? " · spectator (team full)" : ""}
          </p>
        </div>
        {deadlineAt ? (
          <BigTimer
            deadlineAt={deadlineAt}
            label={timerLabel}
            totalMs={timerLabel === "Steal" ? 10000 : 15000}
          />
        ) : null}
      </div>

      {state && (
        <div className="hud-card p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          <div className="text-2xl display">
            <span className="team-a">A</span> <span className="score-pill">{state?.scores?.A ?? 0}</span>
            <span className="mx-2 opacity-50">•</span>
            <span className="score-pill">{state?.scores?.B ?? 0}</span> <span className="team-b">B</span>
          </div>
          <div className="text-center text-sm md:text-base opacity-90">
            Q {Number(state?.questionIndex ?? 0) + 1}/{state?.maxQuestions ?? 20}
            {state?.overtime ? <span className="ml-2 phase-pill">OT</span> : null}
          </div>
          <div className="text-center md:text-right text-sm text-amber-100/90">
            {banner || PHASE_HINT[phase]}
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <button
          className={`w-full max-w-md py-6 rounded-xl text-3xl font-black tracking-wide transition ${
            canBuzz
              ? "bg-gradient-to-r from-fuchsia-600 to-indigo-600 shadow-[0_0_40px_rgba(192,38,211,0.45)] scale-100"
              : "bg-white/10 text-white/35 cursor-not-allowed"
          }`}
          onClick={buzz}
          disabled={!canBuzz}
        >
          BUZZ
        </button>
        {!canBuzz && me?.slotted ? (
          <p className="text-xs text-white/45">{PHASE_HINT[phase]}</p>
        ) : null}
      </div>

      {eligibleTargets.length > 0 && !state?.overtime && (
        <div className="hud-card p-4 flex flex-col gap-3 border border-red-400/40">
          <div className="font-semibold text-red-200">BuzzKill — choose an opponent</div>
          <div className="flex flex-wrap gap-2">
            {eligibleTargets.map((pid) => (
              <button
                key={pid}
                className="px-4 py-3 rounded bg-red-600 hover:bg-red-500 text-white font-semibold"
                onClick={() => kill(pid)}
              >
                {playerNameById.get(pid) ?? pid.slice(0, 6)}
              </button>
            ))}
          </div>
        </div>
      )}

      <StageVideoLayout
        code={code}
        identity={playerId}
        hostIdentity={`host-${code}`}
        leftIdentities={state?.slots?.A || []}
        rightIdentities={state?.slots?.B || []}
        playerNames={Object.fromEntries(
          (state?.players || []).map((p: any) => [p.id, p.name || p.id.slice(0, 6)])
        )}
        screen={<GameScreen screen={state?.screen} />}
      />

      {state?.players && (
        <div className="grid grid-cols-2 gap-3">
          {(["A", "B"] as const).map((t) => (
            <div key={t} className="hud-card p-2">
              <div className={`font-semibold mb-1 ${t === "A" ? "team-a" : "team-b"}`}>Team {t}</div>
              <div className="flex flex-col gap-1">
                {(state.slots?.[t] || []).map((pid: string) => {
                  const p = (state.players || []).find((pp: any) => pp.id === pid);
                  if (!p) return null;
                  const isMe = p.id === playerId;
                  return (
                    <div key={pid} className="flex items-center justify-between text-sm">
                      <span>
                        {p.name}
                        {isMe ? " (you)" : ""}
                      </span>
                      <div className="buzz-dots">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className={`dot ${i < (p.buzzesRemaining ?? 0) ? "on" : ""}`} />
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
    </main>
  );
}
