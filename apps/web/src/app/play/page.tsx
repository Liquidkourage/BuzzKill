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
  idle: "WAIT FOR HOST",
  open: "HIT IT",
  locked: "LOCKED",
  steal_open: "STEAL WINDOW",
  ended: "GAME OVER",
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
      setBanner("PICK A TARGET");
    });
    socket.on("kill:applied", () => {
      setEligibleTargets([]);
      setBanner("BUZZKILL LANDED");
    });
    socket.on("question:opened", (p: { deadlineAt: number }) => {
      setTimerLabel("BUZZ");
      setDeadlineAt(p.deadlineAt);
      setBanner("BUZZERS LIVE");
      setEligibleTargets([]);
    });
    socket.on("steal:opened", (p: { team: TeamId; deadlineAt: number }) => {
      setTimerLabel("STEAL");
      setDeadlineAt(p.deadlineAt);
      setBanner(`STEAL · TEAM ${p.team}`);
    });
    socket.on("question:timeout", () => {
      setDeadlineAt(null);
      setBanner("TIME");
    });
    socket.on("steal:timeout", () => {
      setDeadlineAt(null);
      setBanner("STEAL OVER");
    });
    socket.on("lockout:winner", (p: { playerId: string; name: string }) => {
      setDeadlineAt(null);
      setBanner(p.playerId === playerId ? "YOU LOCKED IT" : `${p.name} LOCKED`);
    });
    socket.on("steal:lockout", (p: { playerId: string; name: string }) => {
      setDeadlineAt(null);
      setBanner(p.playerId === playerId ? "YOU STOLE IT" : `${p.name} STOLE`);
    });
    socket.on("match:end", () => setBanner("FINAL"));
    socket.on("match:overtime", () => setBanner("SUDDEN DEATH"));
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
      setJoinError("NEED ROOM CODE + NAME");
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
          setBanner(resp.rejoined ? "BACK IN" : "SEATED");
        } else {
          setJoinError(resp?.reason || "JOIN FAILED");
        }
      }
    );
  };

  if (!playerId) {
    return (
      <main className="shell-sudden">
        <div className="sd-hazard" aria-hidden />
        <div className="sd-wrap gap-6" style={{ gap: "1.5rem", paddingTop: "2rem" }}>
          <div>
            <div className="sd-kicker">
              <Link href="/">BUZZKILL</Link>
            </div>
            <h1
              className="m-0 mt-3"
              style={{
                fontFamily: "var(--font-punch), sans-serif",
                fontSize: "clamp(3rem, 16vw, 4.5rem)",
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                color: "var(--sd-yellow)",
              }}
            >
              Join
            </h1>
            <p className="sd-meta mt-3 m-0">ENTER THE CODE. PICK A SIDE. TRY NOT TO CHOKE.</p>
          </div>
          <div className="flex flex-col gap-3">
            <input
              className="field mono tracking-[0.22em] uppercase text-lg"
              placeholder="ROOM CODE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <input
              className="field"
              placeholder="YOUR NAME"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`btn ${team === "A" ? "btn-ink" : "btn-ghost"}`}
                onClick={() => setTeam("A")}
              >
                TEAM A
              </button>
              <button
                type="button"
                className={`btn ${team === "B" ? "btn-ink" : "btn-ghost"}`}
                onClick={() => setTeam("B")}
              >
                TEAM B
              </button>
            </div>
            {joinError ? (
              <p className="m-0 sd-meta" style={{ color: "var(--sd-red)" }}>
                {joinError}
              </p>
            ) : null}
            <button className="btn btn-buzz text-lg py-4" onClick={join}>
              INSERT COIN
            </button>
          </div>
        </div>
      </main>
    );
  }

  const screen = state?.screen;
  const live = phase === "open" || phase === "steal_open";

  return (
    <main className="shell-sudden">
      <div className="sd-hazard" aria-hidden />
      <div className="sd-wrap">
        <header className="sd-top">
          <div>
            <div className="sd-kicker">
              <Link href="/">BUZZKILL</Link>
              <span style={{ opacity: 0.45 }}> · </span>
              SUDDEN DEATH
            </div>
            <div
              style={{
                fontFamily: "var(--font-punch), sans-serif",
                fontSize: "1.75rem",
                textTransform: "uppercase",
                marginTop: "0.35rem",
                color: "var(--sd-yellow)",
              }}
            >
              {me?.name || name}
            </div>
            <p className="sd-meta m-0 mt-1">
              TEAM {me?.team || team}
              <span style={{ opacity: 0.4 }}> · </span>
              {code}
              {me ? (
                <>
                  <span style={{ opacity: 0.4 }}> · </span>
                  {me.buzzesRemaining} LEFT
                </>
              ) : null}
              {me && !me.slotted ? " · SIDELINE" : null}
              {state?.overtime ? " · OT" : null}
            </p>
          </div>
          <BigTimer
            deadlineAt={deadlineAt}
            label={timerLabel}
            totalMs={timerLabel === "STEAL" ? 10000 : 15000}
          />
        </header>

        {state ? (
          <div className="sd-scores">
            <div>
              <div className="sd-score-label">{state?.teamNames?.A || "P1"}</div>
              <div className="sd-score" data-side="a">
                {String(state?.scores?.A ?? 0).padStart(2, "0")}
              </div>
            </div>
            <div className="sd-phase" data-live={live ? "true" : "false"}>
              <div>{banner || PHASE_HINT[phase]}</div>
              <div className="mt-2" style={{ color: "var(--sd-mute)" }}>
                Q {Number(state?.questionIndex ?? 0) + 1}/{state?.maxQuestions ?? 20}
              </div>
            </div>
            <div>
              <div className="sd-score-label" style={{ textAlign: "right" }}>
                {state?.teamNames?.B || "P2"}
              </div>
              <div className="sd-score" data-side="b">
                {String(state?.scores?.B ?? 0).padStart(2, "0")}
              </div>
            </div>
          </div>
        ) : null}

        <section className="sd-frame" aria-live="polite">
          {screen?.category ? <div className="sd-cat">{screen.category}</div> : null}
          {screen?.question ? (
            <p className="sd-q">{screen.question}</p>
          ) : (
            <p className="sd-q-idle m-0">AWAITING QUESTION</p>
          )}
          {screen?.revealed ? <div className="sd-answer">{screen.answer || "—"}</div> : null}
        </section>

        <div className="flex flex-col gap-2">
          <button
            className="sd-buzz"
            data-ready={canBuzz ? "true" : "false"}
            onClick={() => canBuzz && getSocket().emit("player:buzz", { code })}
            disabled={!canBuzz}
          >
            BUZZ
          </button>
          {!canBuzz ? <p className="sd-hint">{PHASE_HINT[phase]}</p> : null}
          {me ? (
            <div className="sd-dots" aria-label={`${me.buzzesRemaining} buzzes remaining`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={i < (me.buzzesRemaining ?? 0) ? "on" : ""} />
              ))}
            </div>
          ) : null}
        </div>

        {eligibleTargets.length > 0 && !state?.overtime ? (
          <div className="sd-kill">
            <div className="sd-kill-title">BuzzKill</div>
            <div className="flex flex-wrap gap-2">
              {eligibleTargets.map((pid) => (
                <button
                  key={pid}
                  type="button"
                  className="sd-kill-btn"
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

        <div className="sd-video">
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
        </div>

        {state?.players ? (
          <div className="sd-roster">
            {(["A", "B"] as const).map((t) => (
              <div key={t}>
                <h3>TEAM {t}</h3>
                <ul>
                  {(state.slots?.[t] || []).map((pid: string) => {
                    const p = (state.players || []).find((pp: any) => pp.id === pid);
                    if (!p) return null;
                    return (
                      <li key={pid}>
                        <span>
                          {p.name}
                          {p.id === playerId ? " *" : ""}
                        </span>
                        <span className="sd-dots">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className={i < (p.buzzesRemaining ?? 0) ? "on" : ""} />
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
