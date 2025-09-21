// Simple mock LiveKit server for testing video components
const WebSocket = require('ws');
const express = require('express');

const app = express();
app.use(express.json());

// Mock HTTP endpoints
app.post('/twirp/livekit.RoomService/CreateRoom', (req, res) => {
  console.log('Mock: CreateRoom called');
  res.json({ room: { name: req.body.name || 'test-room' } });
});

app.post('/twirp/livekit.RoomService/DeleteRoom', (req, res) => {
  console.log('Mock: DeleteRoom called');
  res.json({});
});

app.post('/twirp/livekit.RoomService/CreateToken', (req, res) => {
  console.log('Mock: CreateToken called');
  const { room, identity } = req.body;
  const mockToken = `mock-token-${room}-${identity}-${Date.now()}`;
  res.json({ token: mockToken });
});

// WebSocket server for RTC connections
const wss = new WebSocket.Server({ port: 7881 });

wss.on('connection', (ws, req) => {
  console.log('Mock LiveKit: WebSocket connection established');
  
  // Send mock room info
  ws.send(JSON.stringify({
    type: 'room_info',
    room: { name: 'test-room' },
    participants: []
  }));
  
  ws.on('message', (message) => {
    console.log('Mock LiveKit: Received message:', message.toString());
    // Echo back a simple response
    ws.send(JSON.stringify({
      type: 'ack',
      message: 'Mock response'
    }));
  });
  
  ws.on('close', () => {
    console.log('Mock LiveKit: WebSocket connection closed');
  });
});

const PORT = 7880;
app.listen(PORT, () => {
  console.log(`Mock LiveKit server running on port ${PORT}`);
  console.log(`WebSocket server running on port 7881`);
});
