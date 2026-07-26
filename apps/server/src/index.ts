import express from "express";
import http from "http";
import { Server } from "socket.io";
import { AccessToken } from "livekit-server-sdk";
import "./env"; // load env before anything else that reads process.env
import {
  envCandidates,
  loadedEnvFiles,
  livekitConfigured,
  livekitHost,
  logDbError,
  databaseInfo,
} from "./env";
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
import fs from "fs";
import { randomUUID } from "crypto";
import { prisma } from "./db";
import {
  ensureActiveSeason,
  getLeaguePublic,
  getStandings,
  listRegistrations,
  recordMatchResult,
  registerTeam,
  setPaymentStatus,
} from "./league";

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
  seasonId?: string;
  teamAId?: string;
  teamBId?: string;
  teamNames?: { A: string; B: string };
  screen?: { category?: string; question?: string; answer?: string; revealed?: boolean };
}

const INITIAL_BUZZES_PER_PLAYER = 5;
const QUESTION_TIME_MS = 15_000;
const STEAL_TIME_MS = 10_000;
const MAX_SLOTTED_PER_TEAM = 4;

const rooms = new Map<string, RoomState>();

// Friendly 3-letter words for human-readable room codes (9 letters total)
const THREE_LETTER_WORDS: string[] = [
  "cat","dog","fox","owl","yak","cow","pig","ant","bee","eel",
  "bat","rat","ape","emu","hen","ram","yak","gnu","yak","yak",
  "sun","sky","fog","ice","dew","ash","mud","oak","elm","fir",
  "red","tan","blu","grn","pur","org","blk","wht","gry","brn",
  "car","bus","van","jet","ski","sub","pod","bot","app","lab",
  "map","pen","cap","cup","mug","bed","rug","mat","key","pad",
  "win","run","aim","hit","pop","hip","hop","max","pro","ace",
  "fun","joy","zen","zap","bam","wow","yay","hey","sup","yo"
];

const app = express();
// Set permissive CORS headers early for all routes (including 404s)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "100kb" }));

function organizerAuthorized(req: express.Request): boolean {
  const key = process.env.ORGANIZER_KEY;
  if (!key) return false;
  const header = String(req.headers["x-organizer-key"] || "");
  const query = String(req.query.key || "");
  return header === key || query === key;
}

async function finalizeMatch(matchId: string, scores: { A: number; B: number }) {
  try {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: "completed", scoreA: scores.A, scoreB: scores.B },
    });
    await recordMatchResult(matchId);
  } catch (err) {
    logDbError("finalizeMatch", err);
  }
}

// ——— League (public) ———
app.get("/league", async (_req, res) => {
  try {
    res.json(await getLeaguePublic());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed to load league" });
  }
});

app.get("/league/standings", async (_req, res) => {
  try {
    res.json(await getStandings());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed to load standings" });
  }
});

app.get("/league/teams", async (_req, res) => {
  try {
    const { season, registrations } = await listRegistrations();
    res.json({
      season: { id: season.id, name: season.name, status: season.status },
      teams: registrations.map((r) => ({
        registrationId: r.id,
        teamId: r.teamId,
        name: r.team.name,
        slug: r.team.slug,
        paymentStatus: r.paymentStatus,
        captainName: r.captainName,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed to list teams" });
  }
});

app.post("/league/register", async (req, res) => {
  try {
    const registration = await registerTeam({
      teamName: String(req.body?.teamName || ""),
      captainName: String(req.body?.captainName || ""),
      captainEmail: String(req.body?.captainEmail || ""),
      captainPhone: req.body?.captainPhone ? String(req.body.captainPhone) : undefined,
      rosterText: String(req.body?.rosterText || ""),
    });
    res.status(201).json({
      ok: true,
      registration: {
        id: registration.id,
        teamId: registration.teamId,
        teamName: registration.team.name,
        paymentStatus: registration.paymentStatus,
        seasonName: registration.season.name,
        entryFeeCents: registration.season.entryFeeCents,
        entryNote: registration.season.entryNote,
      },
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || "registration failed" });
  }
});

// Organizer: mark dues paid (requires ORGANIZER_KEY)
app.post("/league/registrations/:id/payment", async (req, res) => {
  if (!organizerAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const status = String(req.body?.paymentStatus || "");
  if (!["pending", "paid", "waived"].includes(status)) {
    return res.status(400).json({ error: "paymentStatus must be pending|paid|waived" });
  }
  try {
    const row = await setPaymentStatus(req.params.id, status as "pending" | "paid" | "waived");
    res.json({ ok: true, registration: row });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "update failed" });
  }
});

// Health: liveness + optional DB/LiveKit readiness (no secrets)
app.get("/health", async (_req, res) => {
  const dbMeta = databaseInfo();
  let database: "connected" | "disconnected" = "disconnected";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "connected";
  } catch {
    database = "disconnected";
  }
  const livekit = livekitConfigured();
  const healthy = database === "connected";
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    status: healthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    database,
    db: dbMeta,
    livekit: { configured: livekit, host: livekitHost() },
  });
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
    configured: livekitConfigured(),
    host: livekitHost(),
    hasUrl: Boolean(process.env.LIVEKIT_URL),
    hasKey: Boolean(process.env.LIVEKIT_API_KEY),
    hasSecret: Boolean(process.env.LIVEKIT_API_SECRET),
    cwd: process.cwd(),
    loadedEnvFiles,
    checked,
  });
});

app.get("/livekit/token", async (req, res) => {
  try {
    const room = String(req.query.code || "").trim();
    const identity = String(req.query.identity || "").trim();
    if (!room || !identity) {
      return res.status(400).json({ error: "Missing code or identity" });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return res.status(503).json({
        error: "LiveKit not configured",
        hint: "Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in the repo root .env or apps/server/.env",
      });
    }

    const at = new AccessToken(apiKey, apiSecret, { identity, ttl: "2h" });
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
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
  allowEIO3: true,
  path: "/socket.io",
});

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
  const pick = () => THREE_LETTER_WORDS[Math.floor(Math.random() * THREE_LETTER_WORDS.length)] || "cat";
  const code = (pick() + pick() + pick()).toUpperCase();
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
    screen: state.screen,
    teamNames: state.teamNames,
    seasonId: state.seasonId,
    players: Object.values(state.players).map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      buzzesRemaining: p.buzzesRemaining,
      slotted: p.slotted,
    })),
  });
}

function normalizeCode(code: string): string {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function getRoom(code: string): RoomState | undefined {
  return rooms.get(normalizeCode(code));
}

function isHost(socketId: string, state: RoomState): boolean {
  return state.hostSocketId === socketId;
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  console.log("Socket transport:", socket.conn.transport.name);
  socket.emit("connected", { socketId: socket.id });

  socket.on("disconnect", () => {
    // Keep player/host seats; only clear live socket bindings so they can rejoin.
    for (const state of rooms.values()) {
      if (state.hostSocketId === socket.id) {
        // Host seat stays claimable via host:claimRoom
        continue;
      }
      const playerId = state.socketsToPlayers[socket.id];
      if (playerId) {
        delete state.socketsToPlayers[socket.id];
        const player = state.players[playerId];
        if (player && player.socketId === socket.id) {
          player.socketId = "";
        }
      }
    }
  });

  // Host creates a room (optionally bind two league teams for standings)
  socket.on(
    "host:createRoom",
    async (
      payload: { teamAId?: string; teamBId?: string } | undefined,
      ack?: (payload: { code: string; ok?: boolean; reason?: string }) => void
    ) => {
      const code = generateRoomCode();
      let seasonId: string | undefined;
      let teamAId: string | undefined;
      let teamBId: string | undefined;
      let teamNames = { A: "Team A", B: "Team B" };

      try {
        const season = await ensureActiveSeason();
        seasonId = season.id;
        if (payload?.teamAId && payload?.teamBId && payload.teamAId !== payload.teamBId) {
          const [regA, regB] = await Promise.all([
            prisma.registration.findUnique({
              where: { seasonId_teamId: { seasonId: season.id, teamId: payload.teamAId } },
              include: { team: true },
            }),
            prisma.registration.findUnique({
              where: { seasonId_teamId: { seasonId: season.id, teamId: payload.teamBId } },
              include: { team: true },
            }),
          ]);
          if (!regA || !regB) {
            ack?.({ code: "", ok: false, reason: "Both teams must be registered this season" });
            return;
          }
          teamAId = regA.teamId;
          teamBId = regB.teamId;
          teamNames = { A: regA.team.name, B: regB.team.name };
        }
      } catch (err) {
        logDbError("host:createRoom season", err);
      }

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
        screen: undefined,
        seasonId,
        teamAId,
        teamBId,
        teamNames,
      };
      rooms.set(code, state);
      socket.join(code);
      ack?.({ code, ok: true });
      socket.emit("host:created", { code, teamNames });
      publishState(state);

      const createData =
        teamAId && teamBId
          ? {
              code,
              status: "live",
              seasonId,
              teamAId,
              teamBId,
            }
          : {
              code,
              status: "live",
              seasonId,
              teamA: { create: { name: `Team A ${code}` } },
              teamB: { create: { name: `Team B ${code}` } },
            };

      prisma.match
        .create({ data: createData as any })
        .then((m: any) => {
          state.matchId = m.id;
          state.teamAId = m.teamAId;
          state.teamBId = m.teamBId;
          return prisma.matchEvent.create({
            data: {
              matchId: m.id,
              type: "room_created",
              payload: { code, teamAId: m.teamAId, teamBId: m.teamBId, seasonId },
            },
          });
        })
        .catch((err) => logDbError("match.create", err));
    }
  );

  // Host reclaims an existing room after refresh/disconnect
  socket.on(
    "host:claimRoom",
    (
      payload: { code: string },
      ack?: (resp: { ok: boolean; code?: string; reason?: string }) => void
    ) => {
      const code = normalizeCode(payload?.code);
      const state = getRoom(code);
      if (!state) return ack?.({ ok: false, reason: "Room not found" });
      if (state.phase.kind === "ended") return ack?.({ ok: false, reason: "Match already ended" });
      state.hostSocketId = socket.id;
      socket.join(state.code);
      ack?.({ ok: true, code: state.code });
      socket.emit("host:created", { code: state.code });
      publishState(state);
    }
  );

  // Player joins or rejoins a room
  socket.on(
    "player:joinRoom",
    (
      payload: { code: string; team: TeamId; name: string; playerId?: string },
      ack?: (resp: { ok: boolean; playerId?: string; reason?: string; rejoined?: boolean }) => void
    ) => {
      const code = normalizeCode(payload.code);
      const state = getRoom(code);
      if (!state) return ack?.({ ok: false, reason: "Room not found" });
      if (state.phase.kind === "ended") return ack?.({ ok: false, reason: "Match already ended" });

      // Rejoin existing seat
      if (payload.playerId && state.players[payload.playerId]) {
        const existing = state.players[payload.playerId];
        if (existing.socketId && state.socketsToPlayers[existing.socketId] === existing.id) {
          delete state.socketsToPlayers[existing.socketId];
        }
        existing.socketId = socket.id;
        if (payload.name?.trim()) existing.name = payload.name.trim();
        state.socketsToPlayers[socket.id] = existing.id;
        socket.join(state.code);
        publishState(state);
        return ack?.({ ok: true, playerId: existing.id, rejoined: true });
      }

      const team: TeamId = payload.team === "B" ? "B" : "A";
      socket.join(state.code);
      const playerId = randomUUID();
      const alreadySlotted = state.slots[team].length < MAX_SLOTTED_PER_TEAM;
      const player: Player = {
        id: playerId,
        socketId: socket.id,
        name: payload.name?.trim() || "Player",
        team,
        buzzesRemaining: INITIAL_BUZZES_PER_PLAYER,
        slotted: alreadySlotted,
      };
      state.players[playerId] = player;
      state.socketsToPlayers[socket.id] = playerId;
      if (alreadySlotted) state.slots[team].push(playerId);
      publishState(state);
      ack?.({ ok: true, playerId });
    }
  );

  // Client ping -> server pong: record RTT in room state by player
  socket.on("client:ping", ({ code, sentAt }: { code: string; sentAt: number }) => {
    const state = getRoom(code);
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
        if (state.matchId) prisma.match.update({ where: { id: state.matchId }, data: { overtime: true } }).catch((err) => logDbError("persist", err));
        return;
      } else {
        state.phase = { kind: "ended" };
        publishState(state);
        io.to(state.code).emit("match:end", { scores: state.scores });
        if (state.matchId) void finalizeMatch(state.matchId, state.scores);
        return;
      }
    }
    state.phase = { kind: "idle" };
    publishState(state);
  }

  // Host opens buzzers for a new question (works for regulation and OT)
  socket.on("host:openBuzzers", ({ code }: { code: string }) => {
    const state = getRoom(code);
    if (!state || state.hostSocketId !== socket.id) return;
    if (!state.overtime && state.questionIndex >= state.maxQuestions) return;
    state.phase = { kind: "open", deadlineAt: Date.now() + QUESTION_TIME_MS };
    publishState(state);
    io.to(code).emit("question:opened", { deadlineAt: (state.phase as any).deadlineAt });

    // Set timeout for no-buzz case
    setTimeout(() => {
      const current = getRoom(code);
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

  // Host sets screen content (category/question/answer)
  socket.on(
    "host:screenSet",
    ({ code, category, question, answer }: { code: string; category?: string; question?: string; answer?: string }) => {
      const state = getRoom(code);
      if (!state || state.hostSocketId !== socket.id) return;
      state.screen = { category, question, answer, revealed: false };
      publishState(state);
    }
  );

  // Host reveals the answer
  socket.on("host:screenReveal", ({ code }: { code: string }) => {
    const state = getRoom(code);
    if (!state || state.hostSocketId !== socket.id) return;
    if (!state.screen) return;
    state.screen.revealed = true;
    publishState(state);
  });

  // Host clears the screen
  socket.on("host:screenClear", ({ code }: { code: string }) => {
    const state = getRoom(code);
    if (!state || state.hostSocketId !== socket.id) return;
    state.screen = undefined;
    publishState(state);
  });

  // Player attempts to buzz
  socket.on("player:buzz", ({ code }: { code: string }) => {
    const state = getRoom(code);
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
          .catch((err) => logDbError("persist", err));
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
          .catch((err) => logDbError("persist", err));
    }
  });

  // Host grades the current locked answer
  socket.on("host:grade", ({ code, correct }: { code: string; correct: boolean }) => {
    const state = getRoom(code);
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
    const state = getRoom(code);
    if (!state || state.hostSocketId !== socket.id) return;
    if (state.phase.kind !== "locked") return;
    const answerer = state.players[state.phase.playerId];
    if (!answerer) return;
    state.scores[answerer.team] += 1;
    if (state.matchId)
      prisma.match.update({ where: { id: state.matchId }, data: { scoreA: state.scores.A, scoreB: state.scores.B } }).catch((err) => logDbError("persist", err));
    if (state.matchId)
      prisma.matchEvent
        .create({ data: { matchId: state.matchId, type: "correct_initial", payload: { playerId: answerer.id, team: answerer.team } } })
        .catch((err) => logDbError("persist", err));
    if (state.overtime) {
      // Sudden death: correct answer ends the match, no kill
      state.phase = { kind: "ended" };
      publishState(state);
      io.to(state.code).emit("match:end", { scores: state.scores });
      if (state.matchId) void finalizeMatch(state.matchId, state.scores);
    } else {
      const eligible = getEligibleTargets(state, answerer.team);
      if (eligible.length === 0) {
        advanceAfterQuestion(state);
      } else {
        // Broadcast so rejoined answerers still receive the prompt
        io.to(state.code).emit("kill:promptTargets", { eligible, playerId: answerer.id });
        publishState(state);
      }
    }
  });

  // Host can skip kill selection and advance (answerer AFK / no valid targets UX)
  socket.on("host:skipKill", ({ code }: { code: string }) => {
    const state = getRoom(code);
    if (!state || state.hostSocketId !== socket.id) return;
    if (state.phase.kind !== "locked") return;
    advanceAfterQuestion(state);
  });

  socket.on("player:assignKillTarget", ({ code, targetId }: { code: string; targetId: string }) => {
    const state = getRoom(code);
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
        .catch((err) => logDbError("persist", err));
    // End question and advance
    advanceAfterQuestion(state);
  });

  socket.on("host:markIncorrectInitial", ({ code }: { code: string }) => {
    const state = getRoom(code);
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
        .catch((err) => logDbError("persist", err));
    setTimeout(() => {
      const current = getRoom(code);
      if (!current) return;
      if (current.phase.kind !== "steal_open") return; // someone already locked/graded
      if (current.overtime) {
        // In OT, no random kills on steal timeout; just proceed
        io.to(code).emit("steal:timeout", {});
        if (current.matchId)
          prisma.matchEvent.create({ data: { matchId: current.matchId, type: "steal_timeout", payload: {} } }).catch((err) => logDbError("persist", err));
        advanceAfterQuestion(current);
      } else {
        // No steal attempt -> random eligible on stealing team loses 1
        const killed = randomBuzzKill(current, stealTeam);
        io.to(code).emit("steal:timeout", { killed });
        if (current.matchId)
          prisma.matchEvent
            .create({ data: { matchId: current.matchId, type: "steal_timeout", payload: { killed } } })
            .catch((err) => logDbError("persist", err));
        advanceAfterQuestion(current);
      }
    }, STEAL_TIME_MS + 10);
  });

  socket.on("host:markCorrectSteal", ({ code }: { code: string }) => {
    const state = getRoom(code);
    if (!state || state.hostSocketId !== socket.id) return;
    if (state.phase.kind !== "locked") return;
    const answerer = state.players[state.phase.playerId];
    if (!answerer) return;
    state.scores[answerer.team] += 1;
    if (state.matchId)
      prisma.match.update({ where: { id: state.matchId }, data: { scoreA: state.scores.A, scoreB: state.scores.B } }).catch((err) => logDbError("persist", err));
    if (state.matchId)
      prisma.matchEvent
        .create({ data: { matchId: state.matchId, type: "correct_steal", payload: { playerId: answerer.id, team: answerer.team } } })
        .catch((err) => logDbError("persist", err));
    if (state.overtime) {
      // Sudden death: end immediately
      state.phase = { kind: "ended" };
      publishState(state);
      io.to(state.code).emit("match:end", { scores: state.scores });
      if (state.matchId) void finalizeMatch(state.matchId, state.scores);
    } else {
      // No kill on steals
      advanceAfterQuestion(state);
    }
  });

  socket.on("host:markIncorrectSteal", ({ code }: { code: string }) => {
    const state = getRoom(code);
    if (!state || state.hostSocketId !== socket.id) return;
    if (state.phase.kind !== "locked") return;
    // End question; both teams already down one buzz (initial + steal buzzer)
    if (state.matchId)
      prisma.matchEvent.create({ data: { matchId: state.matchId, type: "incorrect_steal", payload: {} } }).catch((err) => logDbError("persist", err));
    advanceAfterQuestion(state);
  });
});

// Error handling for uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit immediately, let the process handle it gracefully
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit immediately, let the process handle it gracefully
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
server.listen(PORT, () => {
  const dbMeta = databaseInfo();
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Socket.IO path=/socket.io (websocket + polling)`);
  console.log(`Env files: ${loadedEnvFiles.length ? loadedEnvFiles.join(" | ") : "(none)"}`);
  console.log(`Database: ${dbMeta.provider} → ${dbMeta.urlRedacted}`);
  console.log(
    livekitConfigured()
      ? `LiveKit: configured (${livekitHost()})`
      : "LiveKit: NOT configured — /livekit/token will return 503"
  );
});


