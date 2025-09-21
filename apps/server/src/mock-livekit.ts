// Mock LiveKit server for development
import express from "express";

const app = express();
app.use(express.json());

// Mock token endpoint
app.post("/twirp/livekit.RoomService/CreateRoom", (req, res) => {
  res.json({ room: { name: req.body.name || "test-room" } });
});

app.post("/twirp/livekit.RoomService/DeleteRoom", (req, res) => {
  res.json({});
});

// Mock token generation
app.post("/twirp/livekit.RoomService/CreateToken", (req, res) => {
  const { room, identity } = req.body;
  const mockToken = `mock-token-${room}-${identity}-${Date.now()}`;
  res.json({ token: mockToken });
});

const PORT = 7880;
app.listen(PORT, () => {
  console.log(`Mock LiveKit server running on port ${PORT}`);
});
