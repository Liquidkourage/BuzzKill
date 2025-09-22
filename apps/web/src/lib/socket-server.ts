/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Game state
const rooms = new Map();

export function createSocketServer(httpServer: any) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('host:createRoom', async () => {
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
        await prisma.match.create({
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

  return io;
}
