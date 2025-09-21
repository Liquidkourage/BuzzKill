import express from "express";
import http from "http";
import { Server } from "socket.io";
// Redis adapter (optional)
let createAdapter: any = null;
let createRedisClient: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  createAdapter = require("@socket.io/redis-adapter").createAdapter;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  createRedisClient = require("redis").createClient;
} catch {}
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { prisma } from "./db";

// Load env from multiple candidate locations to be robust across npm workspaces
const envCandidates = [
  path.resolve(__dirname, "../.env"),
  path.resolve(process.cwd(), "apps/server/.env"),
  path.resolve(process.cwd(), ".env"),
];

// Load default first
dotenv.config();
// Then load candidates in order, overriding previous values
for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: true });
  }
}

type TeamId = "A" | "B";

type Phase =
  | { kind: "idle" }
  | { kind: "open"; deadlineAt: number }
  | { kind: "locked"; playerId: string; team: TeamId }
  | { kind: "steal_open"; team: TeamId; deadlineAt: number }
  | { kind: "ended" };

interface Player {
  id: string;
  socketId: string;
  name: string;
  team: TeamId;
  buzzesRemaining: number;
  slotted: boolean;
}

interface RoomState {
  code: string;
  hostSocketId: string;
  players: Record<string, Player>; // by playerId
  socketsToPlayers: Record<string, string>; // socketId -> playerId
  slots: { A: string[]; B: string[] }; // playerIds
  scores: { A: number; B: number };
  questionIndex: number; // 0..19
  maxQuestions: number;
  phase: Phase;
  overtime: boolean; // sudden-death after regulation tie
  latencyMsByPlayer: Record<string, number>; // playerId -> RTT
  matchId?: string; // persisted match id
}

const INITIAL_BUZZES_PER_PLAYER = 5;
const QUESTION_TIME_MS = 15_000;
const STEAL_TIME_MS = 10_000;
const MAX_SLOTTED_PER_TEAM = 4;

const rooms = new Map<string, RoomState>();

const app = express();
app.use(cors());
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Admin: list recent matches
app.get("/admin/matches", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
    const matches = await prisma.match.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        code: true,
        status: true,
        scoreA: true,
        scoreB: true,
        overtime: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json({ matches });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed to list matches" });
  }
});

// Admin: match detail with events
app.get("/admin/matches/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const match = await prisma.match.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    if (!match) return res.status(404).json({ error: "not found" });
    res.json({ match });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed to fetch match" });
  }
});

// Quick config check (does not expose secrets)
app.get("/livekit/debug", (_req, res) => {
  const checked = envCandidates.map((p) => ({ path: p, exists: fs.existsSync(p) }));
  res.json({
    hasUrl: Boolean(process.env.LIVEKIT_URL),
    hasKey: Boolean(process.env.LIVEKIT_API_KEY),
    hasSecret: Boolean(process.env.LIVEKIT_API_SECRET),
    cwd: process.cwd(),
    __dirname,
    checked,
  });
});

// LiveKit token endpoint
app.get("/livekit/token", async (req, res) => {
  try {
    const room = String(req.query.code || "");
    const identity = String(req.query.identity || "");
    if (!room || !identity) {
      return res.status(400).json({ error: "Missing code or identity" });
    }
    
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;
    
    // For development, use mock tokens if LiveKit not fully configured
    if (!apiKey || !apiSecret || !livekitUrl) {
      const mockToken = `mock-token-${room}-${identity}-${Date.now()}`;
      const mockUrl = "ws://localhost:7880";
      return res.json({ token: mockToken, url: mockUrl });
    }
    
    // Real LiveKit token generation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AccessToken } = require("livekit-server-sdk");
    const at = new AccessToken(apiKey, apiSecret, { identity });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();
    res.json({ token, url: livekitUrl });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to create token" });
  }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// If REDIS_URL is set, enable Socket.IO Redis adapter for horizontal scaling
(async () => {
  try {
    const url = process.env.REDIS_URL;
    if (url && createAdapter && createRedisClient) {
      const pubClient = createRedisClient({ url });
      const subClient = pubClient.duplicate();
      await pubClient.connect();
      await subClient.connect();
      io.adapter(createAdapter(pubClient, subClient));
      // eslint-disable-next-line no-console
      console.log("Socket.IO Redis adapter enabled");
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to enable Redis adapter:", (err as any)?.message);
  }
})();

function generateRoomCode(): string {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  return rooms.has(code) ? generateRoomCode() : code;
}

function getEligibleTargets(state: RoomState, team: TeamId): string[] {
  // Eligible targets are opposing slotted players with > 0 buzzes.
  const opponent: TeamId = team === "A" ? "B" : "A";
  const opponents = state.slots[opponent]
    .map((pid) => state.players[pid])
    .filter((p) => p && p.buzzesRemaining > 0);
  if (opponents.length === 0) return [];
  const haveMoreThanOne = opponents.filter((p) => p.buzzesRemaining > 1);
  if (haveMoreThanOne.length > 0) return haveMoreThanOne.map((p) => p.id);
  // All opponents are at 1, so allow selecting anyone
  return opponents.map((p) => p.id);
}

function randomBuzzKill(state: RoomState, team: TeamId): string | null {
  // Random eligible player on team loses 1 (respect last-buzz rule)
  const candidates = state.slots[team]
    .map((pid) => state.players[pid])
    .filter((p) => p && p.buzzesRemaining > 0);
  if (candidates.length === 0) return null;
  const moreThanOne = candidates.filter((p) => p.buzzesRemaining > 1);
  const pool = moreThanOne.length > 0 ? moreThanOne : candidates;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  chosen.buzzesRemaining = Math.max(0, chosen.buzzesRemaining - 1);
  return chosen.id;
}

function publishState(state: RoomState) {
  const room = io.to(state.code);
  room.emit("room:state", {
    code: state.code,
    scores: state.scores,
    questionIndex: state.questionIndex,
    maxQuestions: state.maxQuestions,
    phase: state.phase,
    overtime: state.overtime,
    slots: state.slots,
    latencyMsByPlayer: state.latencyMsByPlayer,
    players: Object.values(state.players).map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      buzzesRemaining: p.buzzesRemaining,
      slotted: p.slotted,
    })),
  });
}

io.on("connection", (socket) => {
  socket.emit("connected", { socketId: socket.id });

  socket.on("disconnect", () => {
    // Cleanup mapping if player disconnects
    for (const state of rooms.values()) {
      if (state.hostSocketId === socket.id) continue;
      const playerId = state.socketsToPlayers[socket.id];
      if (playerId) {
        delete state.socketsToPlayers[socket.id];
      }
    }
  });

  // Host creates a room
  socket.on("host:createRoom", (_, ack?: (payload: { code: string }) => void) => {
    const code = generateRoomCode();
    const state: RoomState = {
      code,
      hostSocketId: socket.id,
      players: {},
      socketsToPlayers: {},
      slots: { A: [], B: [] },
      scores: { A: 0, B: 0 },
      questionIndex: 0,
      maxQuestions: 20,
      phase: { kind: "idle" },
      overtime: false,
      latencyMsByPlayer: {},
    };
    rooms.set(code, state);
    socket.join(code);
    ack?.({ code });
    socket.emit("host:created", { code });
    publishState(state);
    // Persist Match (fire-and-forget)
    prisma.match
      .create({ data: { code, status: "live", teamA: { create: { name: `Team A ${code}` } }, teamB: { create: { name: `Team B ${code}` } } } })
      .then((m) => {
        state.matchId = m.id;
        return prisma.matchEvent.create({ data: { matchId: m.id, type: "room_created", payload: { code } } });
      })
      .catch(() => {});
  });

  // Player joins a room
  socket.on(
    "player:joinRoom",
    (
      payload: { code: string; team: TeamId; name: string },
      ack?: (resp: { ok: boolean; playerId?: string; reason?: string }) => void
    ) => {
      const state = rooms.get(payload.code);
      if (!state) return ack?.({ ok: false, reason: "Room not found" });
      socket.join(state.code);
      const playerId = randomUUID();
      const alreadySlotted = state.slots[payload.team].length < MAX_SLOTTED_PER_TEAM;
      const player: Player = {
        id: playerId,
        socketId: socket.id,
        name: payload.name || "Player",
        team: payload.team,
        buzzesRemaining: INITIAL_BUZZES_PER_PLAYER,
        slotted: alreadySlotted,
      };
      state.players[playerId] = player;
      state.socketsToPlayers[socket.id] = playerId;
      if (alreadySlotted) state.slots[payload.team].push(playerId);
      publishState(state);
      ack?.({ ok: true, playerId });
    }
  );

  // Client ping -> server pong: record RTT in room state by player
  socket.on("client:ping", ({ code, sentAt }: { code: string; sentAt: number }) => {
    const state = rooms.get(code);
    if (!state) return;
    const playerId = state.socketsToPlayers[socket.id];
    if (!playerId) return; // ignore host pings for now
    const rtt = Math.max(0, Date.now() - Number(sentAt || 0));
    state.latencyMsByPlayer[playerId] = rtt;
    // Do not spam publish; clients will receive with next state change. Optionally, throttle emits if needed.
  });

  // Helper to advance after a question resolves
  function advanceAfterQuestion(state: RoomState) {
    state.questionIndex += 1;
    if (!state.overtime && state.questionIndex >= state.maxQuestions) {
      if (state.scores.A === state.scores.B) {
        state.overtime = true;
        state.phase = { kind: "idle" };
        publishState(state);
        io.to(state.code).emit("match:overtime", {});
        if (state.matchId) prisma.match.update({ where: { id: state.matchId }, data: { overtime: true } }).catch(() => {});
        return;
      } else {
        state.phase = { kind: "ended" };
        publishState(state);
        io.to(state.code).emit("match:end", { scores: state.scores });
        if (state.matchId)
          prisma.match
            .update({ where: { id: state.matchId }, data: { status: "completed", scoreA: state.scores.A, scoreB: state.scores.B } })
            .catch(() => {});
        return;
      }
    }
    state.phase = { kind: "idle" };
    publishState(state);
  }

  // Host opens buzzers for a new question (works for regulation and OT)
  socket.on("host:openBuzzers", ({ code }: { code: string }) => {
    const state = rooms.get(code);
    if (!state || state.hostSocketId !== socket.id) return;
    if (!state.overtime && state.questionIndex >= state.maxQuestions) return;
    state.phase = { kind: "open", deadlineAt: Date.now() + QUESTION_TIME_MS };
    publishState(state);
    io.to(code).emit("question:opened", { deadlineAt: (state.phase as any).deadlineAt });

    // Set timeout for no-buzz case
    setTimeout(() => {
      const current = rooms.get(code);
      if (!current) return;
      if (current.phase.kind !== "open") return; // someone locked in
      if (current.overtime) {
        // In OT, no random kills; just proceed to next OT question
        io.to(code).emit("question:timeout", {});
        advanceAfterQuestion(current);
      } else {
        // No one buzzed -> random buzzkill on both teams
        const killedA = randomBuzzKill(current, "A");
        const killedB = randomBuzzKill(current, "B");
        io.to(code).emit("question:timeout", { killedA, killedB });
        advanceAfterQuestion(current);
      }
    }, QUESTION_TIME_MS + 10);
  });

  // Player attempts to buzz
  socket.on("player:buzz", ({ code }: { code: string }) => {
    const state = rooms.get(code);
    if (!state) return;
    const playerId = state.socketsToPlayers[socket.id];
    if (!playerId) return;
    const player = state.players[playerId];
    if (!player || !player.slotted || player.buzzesRemaining <= 0) return;
    if (state.phase.kind === "open") {
      // Lock in the first buzz
      state.phase = { kind: "locked", playerId, team: player.team };
      // Spend buzzer for the lockout winner
      player.buzzesRemaining = Math.max(0, player.buzzesRemaining - 1);
      publishState(state);
      io.to(code).emit("lockout:winner", { playerId, team: player.team, name: player.name });
      if (state.matchId)
        prisma.matchEvent
          .create({ data: { matchId: state.matchId, type: "lock", payload: { playerId, team: player.team } } })
          .catch(() => {});
      // Await host grading
    } else if (state.phase.kind === "steal_open") {
      // Only opposing team to initial team can buzz in steal
      if (player.team !== state.phase.team) return;
      state.phase = { kind: "locked", playerId, team: player.team };
      player.buzzesRemaining = Math.max(0, player.buzzesRemaining - 1);
      publishState(state);
      io.to(code).emit("steal:lockout", { playerId, team: player.team, name: player.name });
      if (state.matchId)
        prisma.matchEvent
          .create({ data: { matchId: state.matchId, type: "steal_lock", payload: { playerId, team: player.team } } })
          .catch(() => {});
    }
  });

  // Host grades the current locked answer
  socket.on("host:grade", ({ code, correct }: { code: string; correct: boolean }) => {
    const state = rooms.get(code);
    if (!state || state.hostSocketId !== socket.id) return;
    if (state.phase.kind !== "locked") return;
    const answererId = state.phase.playerId;
    const answerer = state.players[answererId];
    if (!answerer) return;
    const phaseBefore = state.phase;

    if (correct) {
      // Award point to the answerer's team
      state.scores[answerer.team] += 1;
      // If it was initial buzz, allow kill; if steal, no kill
      if (phaseBefore && phaseBefore.team === answerer.team && io) {
        // initial phase or steal both set team, but we need to know if we were in steal.
      }
      // Determine if we were in initial or steal by checking if a steal window was open previously.
      // Simpler: on steal there would be a previous phase of type "steal_open"; since we overwrote it,
      // infer using an auxiliary flag via event. For MVP: treat as initial if there was no explicit steal_open active.
      // For strictness, we can store a transient flag on socket.io room, but keep simple:
      // If the last event emitted was "steal:lockout", clients will know no kill. Server enforces too:
      // If any steal window was open for this question, forbid kill.

      // Heuristic: if any opposing team member has spent a buzz in current question, then it was steal.
      // MVP: Track with a weak flag on state during steal window.
    }
  });

  // To keep logic clear, add explicit events:
  // - host:markCorrectInitial (enables kill)
  // - host:markCorrectSteal (no kill)
  // - host:markIncorrectInitial (opens steal window)
  // - host:markIncorrectSteal (ends question)

  socket.on("host:markCorrectInitial", ({ code }: { code: string }) => {
    const state = rooms.get(code);
    if (!state || state.hostSocketId !== socket.id) return;
    if (state.phase.kind !== "locked") return;
    const answerer = state.players[state.phase.playerId];
    if (!answerer) return;
    state.scores[answerer.team] += 1;
    if (state.matchId)
      prisma.match.update({ where: { id: state.matchId }, data: { scoreA: state.scores.A, scoreB: state.scores.B } }).catch(() => {});
    if (state.matchId)
      prisma.matchEvent
        .create({ data: { matchId: state.matchId, type: "correct_initial", payload: { playerId: answerer.id, team: answerer.team } } })
        .catch(() => {});
    if (state.overtime) {
      // Sudden death: correct answer ends the match, no kill
      state.phase = { kind: "ended" };
      publishState(state);
      io.to(state.code).emit("match:end", { scores: state.scores });
    } else {
      // Prompt kill targets to the answerer only
      const eligible = getEligibleTargets(state, answerer.team);
      io.to(answerer.socketId).emit("kill:promptTargets", { eligible });
      publishState(state);
    }
  });

  socket.on("player:assignKillTarget", ({ code, targetId }: { code: string; targetId: string }) => {
    const state = rooms.get(code);
    if (!state) return;
    if (state.phase.kind !== "locked") return;
    if (state.overtime) return; // No kills in OT
    const answererId = state.phase.playerId;
    const answerer = state.players[answererId];
    if (!answerer || state.socketsToPlayers[socket.id] !== answererId) return; // only answerer
    const opponentTeam: TeamId = answerer.team === "A" ? "B" : "A";
    const eligible = new Set(getEligibleTargets(state, answerer.team));
    if (!eligible.has(targetId)) return;
    const target = state.players[targetId];
    if (!target || target.team !== opponentTeam) return;
    target.buzzesRemaining = Math.max(0, target.buzzesRemaining - 1);
    io.to(state.code).emit("kill:applied", { targetId });
    if (state.matchId)
      prisma.matchEvent
        .create({ data: { matchId: state.matchId, type: "kill_applied", payload: { targetId } } })
        .catch(() => {});
    // End question and advance
    advanceAfterQuestion(state);
  });

  socket.on("host:markIncorrectInitial", ({ code }: { code: string }) => {
    const state = rooms.get(code);
    if (!state || state.hostSocketId !== socket.id) return;
    if (state.phase.kind !== "locked") return;
    const initialTeam = state.players[state.phase.playerId]?.team;
    if (!initialTeam) return;
    const stealTeam: TeamId = initialTeam === "A" ? "B" : "A";
    state.phase = { kind: "steal_open", team: stealTeam, deadlineAt: Date.now() + STEAL_TIME_MS };
    publishState(state);
    io.to(code).emit("steal:opened", { team: stealTeam, deadlineAt: (state.phase as any).deadlineAt });
    if (state.matchId)
      prisma.matchEvent
        .create({ data: { matchId: state.matchId, type: "steal_open", payload: { team: stealTeam } } })
        .catch(() => {});
    setTimeout(() => {
      const current = rooms.get(code);
      if (!current) return;
      if (current.phase.kind !== "steal_open") return; // someone already locked/graded
      if (current.overtime) {
        // In OT, no random kills on steal timeout; just proceed
        io.to(code).emit("steal:timeout", {});
        if (current.matchId)
          prisma.matchEvent.create({ data: { matchId: current.matchId, type: "steal_timeout", payload: {} } }).catch(() => {});
        advanceAfterQuestion(current);
      } else {
        // No steal attempt -> random eligible on stealing team loses 1
        const killed = randomBuzzKill(current, stealTeam);
        io.to(code).emit("steal:timeout", { killed });
        if (current.matchId)
          prisma.matchEvent
            .create({ data: { matchId: current.matchId, type: "steal_timeout", payload: { killed } } })
            .catch(() => {});
        advanceAfterQuestion(current);
      }
    }, STEAL_TIME_MS + 10);
  });

  socket.on("host:markCorrectSteal", ({ code }: { code: string }) => {
    const state = rooms.get(code);
    if (!state || state.hostSocketId !== socket.id) return;
    if (state.phase.kind !== "locked") return;
    const answerer = state.players[state.phase.playerId];
    if (!answerer) return;
    state.scores[answerer.team] += 1;
    if (state.matchId)
      prisma.match.update({ where: { id: state.matchId }, data: { scoreA: state.scores.A, scoreB: state.scores.B } }).catch(() => {});
    if (state.matchId)
      prisma.matchEvent
        .create({ data: { matchId: state.matchId, type: "correct_steal", payload: { playerId: answerer.id, team: answerer.team } } })
        .catch(() => {});
    if (state.overtime) {
      // Sudden death: end immediately
      state.phase = { kind: "ended" };
      publishState(state);
      io.to(state.code).emit("match:end", { scores: state.scores });
      if (state.matchId)
        prisma.match
          .update({ where: { id: state.matchId }, data: { status: "completed", scoreA: state.scores.A, scoreB: state.scores.B } })
          .catch(() => {});
    } else {
      // No kill on steals
      advanceAfterQuestion(state);
    }
  });

  socket.on("host:markIncorrectSteal", ({ code }: { code: string }) => {
    const state = rooms.get(code);
    if (!state || state.hostSocketId !== socket.id) return;
    if (state.phase.kind !== "locked") return;
    // End question; both teams already down one buzz (initial + steal buzzer)
    if (state.matchId)
      prisma.matchEvent.create({ data: { matchId: state.matchId, type: "incorrect_steal", payload: {} } }).catch(() => {});
    advanceAfterQuestion(state);
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});


