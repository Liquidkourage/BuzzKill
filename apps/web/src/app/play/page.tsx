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
  idle: "Waiting for host",
  open: "Buzzers open",
  locked: "Locked in",
  steal_open: "Steal window",
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
      setBanner("Choose a BuzzKill target");
    });
    socket.on("kill:applied", () => {
      setEligibleTargets([]);
      setBanner("BuzzKill applied");
    });
    socket.on("question:opened", (p: { deadlineAt: number }) => {
      setTimerLabel("Buzz");
      setDeadlineAt(p.deadlineAt);
      setBanner("Buzzers live");
      setEligibleTargets([]);
    });
    socket.on("steal:opened", (p: { team: TeamId; deadlineAt: number }) => {
      setTimerLabel("Steal");
      setDeadlineAt(p.deadlineAt);
      setBanner(`Steal · Team ${p.team}`);
    });
    socket.on("question:timeout", () => {
      setDeadlineAt(null);
      setBanner("Time");
    });
    socket.on("steal:timeout", () => {
      setDeadlineAt(null);
      setBanner("Steal closed");
    });
    socket.on("lockout:winner", (p: { playerId: string; name: string }) => {
      setDeadlineAt(null);
      setBanner(p.playerId === playerId ? "You locked it" : `${p.name} locked`);
    });
    socket.on("steal:lockout", (p: { playerId: string; name: string }) => {
      setDeadlineAt(null);
      setBanner(p.playerId === playerId ? "You stole it" : `${p.name} stole`);
    });
    socket.on("match:end", () => setBanner("Final"));
    socket.on("match:overtime", () => setBanner("Overtime"));
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

  useEffect(() => {
    if (!playerId || !code || !name) return;
    const socket = getSocket();
    const tryRejoin = () => {
      socket.emit("player:joinRoom", { code, team, name, playerId }, (resp: any) => {
        if (resp?.ok) {
          setPlayerId(resp.playerId);
          setJoinError("");
        }
      });
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
      setJoinError("Room code and name required");
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
          setBanner(resp.rejoined ? "Welcome back" : "You're in");
        } else {
          setJoinError(resp?.reason || "Could not join");
        }
      }
    );
  };

  if (!playerId) {
    return (
      <main className="shell-light px-5 py-10 max-w-md mx-auto flex flex-col gap-8">
        <div>
          <Link href="/" className="eyebrow text-[color:var(--muted)]">
            BuzzKill
          </Link>
          <h1 className="display text-5xl mt-3 m-0">Join match</h1>
          <p className="mt-3 text-[color:var(--muted)] text-lg m-0">
            Enter the room code from your host and pick a side.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <input
            className="field mono tracking-[0.18em] uppercase text-lg"
            placeholder="ROOM CODE"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <input
            className="field"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`btn ${team === "A" ? "btn-ink" : "btn-ghost"}`}
              onClick={() => setTeam("A")}
            >
              Team A
            </button>
            <button
              type="button"
              className={`btn ${team === "B" ? "btn-ink" : "btn-ghost"}`}
              onClick={() => setTeam("B")}
            >
              Team B
            </button>
          </div>
          {joinError ? <p className="m-0 text-sm text-[color:var(--buzz)]">{joinError}</p> : null}
          <button className="btn btn-buzz text-lg py-3" onClick={join}>
            Enter room
          </button>
        </div>
      </main>
    );
  }

  const screen = state?.screen;
  const live = phase === "open" || phase === "steal_open";

  return (
    <main className="shell-stage">
      <div className="play-wrap">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow text-[color:var(--stage-muted)]">
              <Link href="/">BuzzKill</Link>
              <span className="mx-2 opacity-40">·</span>
              Match night
            </div>
            <h1 className="display text-3xl mt-2 m-0">{me?.name || name}</h1>
            <p className="m-0 mt-1 text-sm text-[color:var(--stage-muted)]">
              <span className={me?.team === "B" ? "team-b" : "team-a"}>Team {me?.team || team}</span>
              <span className="mx-2 opacity-40">·</span>
              <span className="mono tracking-[0.12em]">{code}</span>
              {me ? (
                <>
                  <span className="mx-2 opacity-40">·</span>
                  {me.buzzesRemaining} buzzes
                </>
              ) : null}
              {me && !me.slotted ? " · sideline" : null}
              {state?.overtime ? " · OT" : null}
            </p>
          </div>
          <BigTimer
            deadlineAt={deadlineAt}
            label={timerLabel}
            totalMs={timerLabel === "Steal" ? 10000 : 15000}
          />
        </header>

        {state ? (
          <div className="board">
            <div>
              <div className="eyebrow team-a">{state?.teamNames?.A || "Team A"}</div>
              <div className="score team-a">{state?.scores?.A ?? 0}</div>
            </div>
            <div className="text-center">
              <div className="phase-tag" data-live={live ? "true" : "false"}>
                {banner || PHASE_HINT[phase]}
              </div>
              <div className="mono text-xs mt-2 text-[color:var(--stage-muted)]">
                Q {Number(state?.questionIndex ?? 0) + 1}/{state?.maxQuestions ?? 20}
              </div>
            </div>
            <div className="text-right">
              <div className="eyebrow team-b">{state?.teamNames?.B || "Team B"}</div>
              <div className="score team-b">{state?.scores?.B ?? 0}</div>
            </div>
          </div>
        ) : null}

        <section className="play-question" aria-live="polite">
          {screen?.category ? <div className="cat">{screen.category}</div> : null}
          {screen?.question ? (
            <p className="q">{screen.question}</p>
          ) : (
            <p className="idle m-0">Waiting for the next question</p>
          )}
          {screen?.revealed ? <div className="answer">{screen.answer || "—"}</div> : null}
        </section>

        <div className="flex flex-col items-center gap-3 py-1">
          <button
            className="buzz-pad"
            data-ready={canBuzz ? "true" : "false"}
            onClick={() => canBuzz && getSocket().emit("player:buzz", { code })}
            disabled={!canBuzz}
          >
            BUZZ
          </button>
          {!canBuzz ? (
            <p className="m-0 text-xs tracking-[0.1em] uppercase text-[color:var(--stage-muted)]">
              {PHASE_HINT[phase]}
            </p>
          ) : null}
          {me ? (
            <div className="buzz-dots" aria-label={`${me.buzzesRemaining} buzzes remaining`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`dot ${i < (me.buzzesRemaining ?? 0) ? "on" : ""}`} />
              ))}
            </div>
          ) : null}
        </div>

        {eligibleTargets.length > 0 && !state?.overtime ? (
          <div className="flex flex-col gap-3 border border-[color:var(--buzz)] rounded-[var(--radius)] p-4">
            <div className="display text-2xl text-[color:var(--buzz)]">BuzzKill</div>
            <div className="flex flex-wrap gap-2">
              {eligibleTargets.map((pid) => (
                <button
                  key={pid}
                  type="button"
                  className="btn btn-buzz"
                  onClick={() => {
                    getSocket().emit("player:assignKillTarget", { code, targetId: pid });
                    setEligibleTargets([]);
                  }}
                >
                  {playerNameById.get(pid) ?? pid.slice(0, 6)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

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

        {state?.players ? (
          <div className="grid grid-cols-2 gap-6">
            {(["A", "B"] as const).map((t) => (
              <div key={t}>
                <div className={`eyebrow mb-2 ${t === "A" ? "team-a" : "team-b"}`}>Team {t}</div>
                <ul className="m-0 p-0 list-none flex flex-col gap-2">
                  {(state.slots?.[t] || []).map((pid: string) => {
                    const p = (state.players || []).find((pp: any) => pp.id === pid);
                    if (!p) return null;
                    return (
                      <li key={pid} className="flex items-center justify-between text-sm">
                        <span>
                          {p.name}
                          {p.id === playerId ? " · you" : ""}
                        </span>
                        <span className="buzz-dots">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className={`dot ${i < (p.buzzesRemaining ?? 0) ? "on" : ""}`} />
                          ))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
