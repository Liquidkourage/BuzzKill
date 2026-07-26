/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSocket } from "@/lib/socket";
import StageVideoLayout from "@/components/StageVideoLayout";
import GameScreen from "@/components/GameScreen";
import BigTimer from "@/components/BigTimer";
import { serverUrl } from "@/lib/league";

type PhaseKind = "idle" | "open" | "locked" | "steal_open" | "ended";

type LeagueTeam = { teamId: string; name: string; paymentStatus: string };
type PackRow = { id: string; name: string; questionCount: number };

const PHASE_LABEL: Record<PhaseKind, string> = {
  idle: "Stand by",
  open: "Buzzers live",
  locked: "Locked in",
  steal_open: "Steal",
  ended: "Final",
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
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const [leagueTeams, setLeagueTeams] = useState<LeagueTeam[]>([]);
  const [readyPacks, setReadyPacks] = useState<PackRow[]>([]);
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [packId, setPackId] = useState("");

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setClaimCode(saved);
    } catch {
      /* ignore */
    }
    fetch(`${serverUrl()}/league/teams`)
      .then((r) => r.json())
      .then((data) => setLeagueTeams(data.teams || []))
      .catch(() => setLeagueTeams([]));
    fetch(`${serverUrl()}/packs`)
      .then((r) => r.json())
      .then((data) => setReadyPacks(data.packs || []))
      .catch(() => setReadyPacks([]));
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
      setStatus(`${p.name} · Team ${p.team} locked`);
    });
    socket.on("steal:lockout", (p: { name: string; team: string }) => {
      setStatus(`Steal lock · ${p.name} (Team ${p.team})`);
    });
    socket.on("match:end", () => setStatus("Match complete"));
    socket.on("match:overtime", () => setStatus("Tied — sudden death"));
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
  const live = phase === "open" || phase === "steal_open";
  const lockedPlayer = useMemo(() => {
    if (phase !== "locked" || !state?.phase?.playerId) return null;
    return (state.players || []).find((p: any) => p.id === state.phase.playerId) || null;
  }, [phase, state]);

  const createRoom = () => {
    const pickingLeague = Boolean(teamAId || teamBId);
    if (pickingLeague && (!teamAId || !teamBId || teamAId === teamBId)) {
      setStatus("Pick two different registered teams, or leave both blank for a scratch room");
      return;
    }
    setStatus("Opening room…");
    const payload: { teamAId?: string; teamBId?: string; packId?: string } = {};
    if (teamAId && teamBId) {
      payload.teamAId = teamAId;
      payload.teamBId = teamBId;
    }
    if (packId) payload.packId = packId;
    getSocket().emit("host:createRoom", payload, (resp: any) => {
      if (resp?.ok === false) setStatus(resp?.reason || "Could not create room");
      else setStatus(teamAId && teamBId ? "League match ready — share the room code" : "Scratch room ready");
    });
  };

  const claimRoom = () => {
    const c = claimCode.trim().toUpperCase();
    if (!c) return;
    getSocket().emit("host:claimRoom", { code: c }, (resp: any) => {
      if (resp?.ok) {
        setCode(resp.code);
        setStatus("Host seat reclaimed");
      } else {
        setStatus(resp?.reason || "Could not reclaim");
      }
    });
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setStatus("Copy failed");
    }
  };

  const openBuzzers = () => getSocket().emit("host:openBuzzers", { code });
  const setScreen = () => {
    getSocket().emit("host:screenSet", { code, category, question, answer });
    setStatus("Board pushed");
  };
  const reveal = () => {
    getSocket().emit("host:screenReveal", { code });
    setStatus("Answer revealed");
  };
  const clearScreen = () => getSocket().emit("host:screenClear", { code });
  const packStep = (direction: "next" | "prev") => {
    getSocket().emit("host:packNext", { code, direction }, (resp: any) => {
      if (resp?.ok === false) setStatus(resp?.reason || "Pack step failed");
      else {
        setStatus(direction === "prev" ? "Previous pack question" : "Pack question on board");
        // Mirror into local fields for manual edit/override
        // room:state will refresh screen; also pull from state after tick
      }
    });
  };
  const attachPack = () => {
    if (!packId) return;
    getSocket().emit("host:attachPack", { code, packId }, (resp: any) => {
      if (resp?.ok === false) setStatus(resp?.reason || "Could not attach pack");
      else setStatus(`Pack loaded: ${resp.packName}`);
    });
  };

  useEffect(() => {
    const screen = state?.screen;
    if (!screen?.question) return;
    setCategory(screen.category || "");
    setQuestion(screen.question || "");
    setAnswer(screen.answer || "");
  }, [state?.packCursor, state?.screen?.question]);

  if (!code) {
    return (
      <main className="shell-stage px-5 py-8 max-w-xl mx-auto flex flex-col gap-8">
        <div>
          <Link href="/" className="mono text-xs tracking-[0.18em] uppercase text-[color:var(--stage-muted)]">
            BuzzKill
          </Link>
          <h1 className="display text-6xl mt-3">Match night</h1>
          <p className="mt-3 text-[color:var(--stage-muted)] text-lg">
            Pair two league teams, open a room, and run the board. Results feed standings.
          </p>
        </div>

        {leagueTeams.length >= 2 ? (
          <div className="flex flex-col gap-3">
            <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--stage-muted)]">
              Side A
            </label>
            <select className="field" value={teamAId} onChange={(e) => setTeamAId(e.target.value)}>
              <option value="">Select team</option>
              {leagueTeams.map((t) => (
                <option key={t.teamId} value={t.teamId} disabled={t.teamId === teamBId}>
                  {t.name}
                  {t.paymentStatus !== "paid" ? ` (${t.paymentStatus})` : ""}
                </option>
              ))}
            </select>
            <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--stage-muted)]">
              Side B
            </label>
            <select className="field" value={teamBId} onChange={(e) => setTeamBId(e.target.value)}>
              <option value="">Select team</option>
              {leagueTeams.map((t) => (
                <option key={t.teamId} value={t.teamId} disabled={t.teamId === teamAId}>
                  {t.name}
                  {t.paymentStatus !== "paid" ? ` (${t.paymentStatus})` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="m-0 text-sm text-[color:var(--stage-muted)]">
            No registered teams yet —{" "}
            <Link href="/enter" className="underline underline-offset-2">
              teams enter here
            </Link>
            . You can still open a scratch room.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--stage-muted)]">
            Question pack
          </label>
          <select className="field" value={packId} onChange={(e) => setPackId(e.target.value)}>
            <option value="">None — type questions live</option>
            {readyPacks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.questionCount} Q)
              </option>
            ))}
          </select>
          {readyPacks.length === 0 ? (
            <p className="m-0 text-xs text-[color:var(--stage-muted)]">
              No ready packs — build one under{" "}
              <Link href="/packs" className="underline underline-offset-2">
                Question packs
              </Link>
              .
            </p>
          ) : null}
        </div>

        <button className="btn btn-buzz text-lg py-3" onClick={createRoom}>
          {teamAId && teamBId ? "Start league match" : "Open room"}
        </button>
        {leagueTeams.length >= 2 ? (
          <p className="m-0 text-xs text-[color:var(--stage-muted)]">
            Leave both sides blank for a scratch room that won&apos;t touch standings.
          </p>
        ) : null}

        <div className="strip">
          <div className="w-full text-sm text-[color:var(--stage-muted)]">Already mid-match?</div>
          <input
            className="field mono tracking-[0.2em] uppercase flex-1 min-w-[12rem]"
            placeholder="ROOM CODE"
            value={claimCode}
            onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
          />
          <button className="btn btn-ghost" onClick={claimRoom} disabled={!claimCode.trim()}>
            Reclaim host
          </button>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-[color:var(--stage-muted)]">
          <Link href="/packs" className="underline underline-offset-2">
            Question packs
          </Link>
          <Link href="/organizer" className="underline underline-offset-2">
            Organizer desk
          </Link>
        </div>
        {status ? <p className="text-sm text-[color:var(--live)]">{status}</p> : null}
      </main>
    );
  }

  return (
    <main className="shell-stage px-4 sm:px-6 py-5 max-w-[1500px] mx-auto flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="mono text-xs tracking-[0.18em] uppercase text-[color:var(--stage-muted)]">
            BuzzKill
          </Link>
          <h1 className="display text-5xl mt-1">Control</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mono text-[0.65rem] tracking-[0.18em] uppercase text-[color:var(--stage-muted)]">
              Room
            </div>
            <div className="display text-4xl tracking-[0.12em] text-[color:var(--live)]">{code}</div>
          </div>
          <button className="btn btn-ghost" onClick={copyCode}>
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
      </header>

      <div className="strip">
        <input
          className="field"
          placeholder="Reader name"
          value={hostName}
          onChange={(e) => setHostName(e.target.value)}
        />
        <input
          className="field w-28"
          placeholder="Pronouns"
          value={hostPronouns}
          onChange={(e) => setHostPronouns(e.target.value)}
        />
        <span className="phase-tag" data-live={live ? "true" : "false"}>
          {PHASE_LABEL[phase]}
        </span>
        {status ? <span className="text-sm text-[color:var(--live)]">{status}</span> : null}
      </div>

      {state && (
        <div className="board py-2">
          <div>
            <div className="mono text-xs tracking-[0.16em] uppercase team-a">
              {state?.teamNames?.A || "Team A"}
            </div>
            <div className="score team-a">{state?.scores?.A ?? 0}</div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="mono text-sm text-[color:var(--stage-muted)]">
              Q {Number(state?.questionIndex ?? 0) + 1}/{state?.maxQuestions ?? 20}
              {state?.overtime ? " · OT" : ""}
            </div>
            <BigTimer
              deadlineAt={phase === "open" || phase === "steal_open" ? state?.phase?.deadlineAt : null}
              label={phase === "steal_open" ? "Steal" : phase === "open" ? "Buzz" : undefined}
              totalMs={phase === "steal_open" ? 10000 : 15000}
            />
          </div>
          <div className="text-right">
            <div className="mono text-xs tracking-[0.16em] uppercase team-b">
              {state?.teamNames?.B || "Team B"}
            </div>
            <div className="score team-b">{state?.scores?.B ?? 0}</div>
          </div>
        </div>
      )}

      {state?.players && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(["A", "B"] as const).map((t) => (
            <div key={t}>
              <div className={`mono text-xs tracking-[0.16em] uppercase mb-2 ${t === "A" ? "team-a" : "team-b"}`}>
                Team {t} · {(state.slots?.[t] || []).length}/4
              </div>
              <ul className="m-0 p-0 list-none flex flex-col gap-2">
                {(state.slots?.[t] || []).map((pid: string) => {
                  const p = (state.players || []).find((pp: any) => pp.id === pid);
                  if (!p) return null;
                  const locked = lockedPlayer?.id === pid;
                  return (
                    <li
                      key={pid}
                      className="flex items-center justify-between text-sm border-b border-[color:var(--stage-line)] pb-2"
                    >
                      <span className={locked ? "text-[color:var(--live)]" : ""}>
                        {p.name}
                        {locked ? " · locked" : ""}
                      </span>
                      <span className="buzz-dots" aria-label={`${p.buzzesRemaining} buzzes`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className={`dot ${i < (p.buzzesRemaining ?? 0) ? "on" : ""}`} />
                        ))}
                      </span>
                    </li>
                  );
                })}
                {(state.slots?.[t] || []).length === 0 ? (
                  <li className="text-xs text-[color:var(--stage-muted)]">Waiting for players</li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="display text-2xl m-0">Board</h2>
        {state?.packName || readyPacks.length > 0 ? (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="mono text-xs tracking-[0.12em] uppercase text-[color:var(--stage-muted)]">
              {state?.packName
                ? `${state.packName} · Q ${Math.max(0, Number(state.packCursor ?? -1) + 1)}/${state.packTotal || 0}`
                : "No pack on this room"}
            </span>
            {state?.packId ? (
              <>
                <button className="btn btn-buzz" onClick={() => packStep("next")}>
                  Next from pack
                </button>
                <button className="btn btn-ghost" onClick={() => packStep("prev")}>
                  Prev
                </button>
              </>
            ) : (
              <>
                <select className="field" value={packId} onChange={(e) => setPackId(e.target.value)}>
                  <option value="">Select ready pack</option>
                  {readyPacks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.questionCount})
                    </option>
                  ))}
                </select>
                <button className="btn btn-ink" onClick={attachPack} disabled={!packId}>
                  Attach pack
                </button>
              </>
            )}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <input
            className="field"
            placeholder="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <input
            className="field flex-1 min-w-[14rem]"
            placeholder="Question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <input
            className="field min-w-[10rem]"
            placeholder="Answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ink" onClick={setScreen} disabled={!question}>
            Push board
          </button>
          <button className="btn btn-ghost" onClick={reveal}>
            Reveal
          </button>
          <button className="btn btn-ghost" onClick={clearScreen}>
            Clear
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="display text-2xl m-0">Call</h2>
        {phase === "idle" && (
          <button className="btn btn-live w-fit text-lg" onClick={openBuzzers}>
            Open buzzers
          </button>
        )}
        {phase === "open" && (
          <p className="m-0 text-[color:var(--stage-muted)]">Listening for the first buzz…</p>
        )}
        {phase === "steal_open" && (
          <p className="m-0 text-[color:var(--live)]">
            Steal open for Team {state?.phase?.team}
          </p>
        )}
        {phase === "locked" && (
          <div className="flex flex-col gap-3">
            <p className="m-0">
              Locked: <strong>{lockedPlayer?.name || "Player"}</strong> · Team {lockedPlayer?.team}
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ok" onClick={() => getSocket().emit("host:markCorrectInitial", { code })}>
                Correct · BuzzKill
              </button>
              <button className="btn btn-ghost" onClick={() => getSocket().emit("host:markIncorrectInitial", { code })}>
                Miss · Steal
              </button>
              <button className="btn btn-ok" onClick={() => getSocket().emit("host:markCorrectSteal", { code })}>
                Steal correct
              </button>
              <button className="btn btn-ghost" onClick={() => getSocket().emit("host:markIncorrectSteal", { code })}>
                Steal miss
              </button>
              <button className="btn btn-warn" onClick={() => getSocket().emit("host:skipKill", { code })}>
                Skip kill
              </button>
            </div>
          </div>
        )}
        {phase === "ended" && (
          <p className="display text-3xl m-0">
            <span className="team-a">{state?.scores?.A}</span>
            <span className="mx-3 opacity-40">—</span>
            <span className="team-b">{state?.scores?.B}</span>
          </p>
        )}
      </section>

      <StageVideoLayout
        code={code}
        identity={`host-${code}`}
        hostIdentity={`host-${code}`}
        hostLabel={hostName ? `Reader · ${hostName}${hostPronouns ? ` (${hostPronouns})` : ""}` : "Reader"}
        leftIdentities={state?.slots?.A || []}
        rightIdentities={state?.slots?.B || []}
        playerNames={Object.fromEntries(
          (state?.players || []).map((p: any) => [p.id, p.name || p.id.slice(0, 6)])
        )}
        screen={<GameScreen screen={state?.screen} />}
      />
    </main>
  );
}
