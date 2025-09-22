const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { AccessToken } = require('livekit-server-sdk');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Initialize Express server
const server = express();
const httpServer = createServer(server);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize Prisma
const prisma = new PrismaClient();

// Middleware
server.use(cors());
server.use(express.json());

// Game state
const rooms = new Map();
const latencyMsByPlayer = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('host:createRoom', async (data) => {
    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const room = {
        code,
        hostId: socket.id,
        players: new Map(),
        phase: 'waiting',
        question: null,
        scores: { A: 0, B: 0 },
        startTime: null,
        endTime: null,
        events: []
      };
      
      rooms.set(code, room);
      socket.join(code);
      socket.emit('host:roomCreated', { code });
      
      // Save to database
      const match = await prisma.match.create({
        data: {
          code,
          hostId: socket.id,
          status: 'waiting'
        }
      });
      
      console.log('Room created:', code);
    } catch (error) {
      console.error('Error creating room:', error);
      socket.emit('error', { message: 'Failed to create room' });
    }
  });

  socket.on('player:joinRoom', async (data) => {
    try {
      const { code, playerName } = data;
      const room = rooms.get(code);
      
      if (!room) {
        socket.emit('player:joinRoom', { ok: false, error: 'Room not found' });
        return;
      }
      
      if (room.players.size >= 2) {
        socket.emit('player:joinRoom', { ok: false, error: 'Room is full' });
        return;
      }
      
      const playerId = socket.id;
      const team = room.players.size === 0 ? 'A' : 'B';
      
      room.players.set(playerId, {
        id: playerId,
        name: playerName,
        team,
        connected: true,
        lastSeen: Date.now()
      });
      
      socket.join(code);
      socket.emit('player:joinRoom', { ok: true, playerId, team });
      
      // Notify host
      io.to(room.hostId).emit('host:playerJoined', {
        playerId,
        playerName,
        team,
        playerCount: room.players.size
      });
      
      // Save to database
      await prisma.matchEvent.create({
        data: {
          matchId: (await prisma.match.findFirst({ where: { code } }))?.id || 0,
          type: 'player_join',
          data: { playerId, playerName, team }
        }
      });
      
      console.log('Player joined:', playerName, 'to room:', code);
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('player:joinRoom', { ok: false, error: 'Failed to join room' });
    }
  });

  socket.on('host:startGame', async (data) => {
    try {
      const { code, question } = data;
      const room = rooms.get(code);
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      room.phase = 'open';
      room.question = question;
      room.startTime = Date.now();
      
      // Notify all players
      io.to(code).emit('game:state', {
        phase: room.phase,
        question: room.question,
        scores: room.scores,
        players: Array.from(room.players.values()),
        latencyMsByPlayer: Object.fromEntries(latencyMsByPlayer)
      });
      
      // Save to database
      await prisma.match.update({
        where: { code },
        data: {
          status: 'playing',
          question,
          startTime: new Date(room.startTime)
        }
      });
      
      console.log('Game started in room:', code);
    } catch (error) {
      console.error('Error starting game:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  socket.on('player:buzz', async (data) => {
    try {
      const { code } = data;
      const room = rooms.get(code);
      
      if (!room || room.phase !== 'open') {
        socket.emit('error', { message: 'Cannot buzz right now' });
        return;
      }
      
      const player = room.players.get(socket.id);
      if (!player) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }
      
      room.phase = 'buzzed';
      room.buzzedPlayer = player;
      
      // Notify all players
      io.to(code).emit('game:state', {
        phase: room.phase,
        question: room.question,
        scores: room.scores,
        players: Array.from(room.players.values()),
        buzzedPlayer: player,
        latencyMsByPlayer: Object.fromEntries(latencyMsByPlayer)
      });
      
      // Save to database
      await prisma.matchEvent.create({
        data: {
          matchId: (await prisma.match.findFirst({ where: { code } }))?.id || 0,
          type: 'buzz',
          data: { playerId: socket.id, playerName: player.name, team: player.team }
        }
      });
      
      console.log('Player buzzed:', player.name, 'in room:', code);
    } catch (error) {
      console.error('Error buzzing:', error);
      socket.emit('error', { message: 'Failed to buzz' });
    }
  });

  socket.on('host:score', async (data) => {
    try {
      const { code, team, points } = data;
      const room = rooms.get(code);
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      room.scores[team] += points;
      room.phase = 'open';
      room.buzzedPlayer = null;
      
      // Notify all players
      io.to(code).emit('game:state', {
        phase: room.phase,
        question: room.question,
        scores: room.scores,
        players: Array.from(room.players.values()),
        latencyMsByPlayer: Object.fromEntries(latencyMsByPlayer)
      });
      
      // Save to database
      await prisma.matchEvent.create({
        data: {
          matchId: (await prisma.match.findFirst({ where: { code } }))?.id || 0,
          type: 'score',
          data: { team, points, newScore: room.scores[team] }
        }
      });
      
      console.log('Score updated:', team, points, 'in room:', code);
    } catch (error) {
      console.error('Error scoring:', error);
      socket.emit('error', { message: 'Failed to score' });
    }
  });

  socket.on('host:nextQuestion', async (data) => {
    try {
      const { code, question } = data;
      const room = rooms.get(code);
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      room.phase = 'open';
      room.question = question;
      room.buzzedPlayer = null;
      
      // Notify all players
      io.to(code).emit('game:state', {
        phase: room.phase,
        question: room.question,
        scores: room.scores,
        players: Array.from(room.players.values()),
        latencyMsByPlayer: Object.fromEntries(latencyMsByPlayer)
      });
      
      console.log('Next question in room:', code);
    } catch (error) {
      console.error('Error next question:', error);
      socket.emit('error', { message: 'Failed to set next question' });
    }
  });

  socket.on('host:endGame', async (data) => {
    try {
      const { code } = data;
      const room = rooms.get(code);
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      room.phase = 'ended';
      room.endTime = Date.now();
      
      // Notify all players
      io.to(code).emit('game:state', {
        phase: room.phase,
        question: room.question,
        scores: room.scores,
        players: Array.from(room.players.values()),
        latencyMsByPlayer: Object.fromEntries(latencyMsByPlayer)
      });
      
      // Save to database
      await prisma.match.update({
        where: { code },
        data: {
          status: 'completed',
          endTime: new Date(room.endTime),
          finalScores: room.scores
        }
      });
      
      console.log('Game ended in room:', code);
    } catch (error) {
      console.error('Error ending game:', error);
      socket.emit('error', { message: 'Failed to end game' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Remove player from rooms
    for (const [code, room] of rooms.entries()) {
      if (room.players.has(socket.id)) {
        const player = room.players.get(socket.id);
        room.players.delete(socket.id);
        
        // Notify host
        io.to(room.hostId).emit('host:playerLeft', {
          playerId: socket.id,
          playerName: player.name,
          team: player.team,
          playerCount: room.players.size
        });
        
        console.log('Player left:', player.name, 'from room:', code);
      }
    }
  });
});

// LiveKit token endpoint
server.get('/livekit/token', async (req, res) => {
  try {
    const { code, identity } = req.query;
    
    if (!code || !identity) {
      return res.status(400).json({ error: 'Missing code or identity' });
    }
    
    // Check if LiveKit is configured
    if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
      // Return mock token for development
      return res.json({
        token: 'mock-token-' + Math.random().toString(36).substring(2),
        url: 'ws://localhost:7880'
      });
    }
    
    // Generate real LiveKit token
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: identity,
      ttl: '1h'
    });
    
    token.addGrant({
      room: code,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });
    
    res.json({
      token: await token.toJwt(),
      url: process.env.LIVEKIT_URL
    });
  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Health check endpoint
server.get('/health', async (req, res) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Handle Next.js requests
server.all('*', (req, res) => {
  return handle(req, res);
});

// Start server
app.prepare().then(() => {
  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
