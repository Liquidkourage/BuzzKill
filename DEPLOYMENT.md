# BuzzKill Deployment Guide

## Deploy to Railway

### 1. Set up LiveKit Cloud (Free)

1. Go to [LiveKit Cloud](https://cloud.livekit.io)
2. Sign up for a free account
3. Create a new project
4. Copy your project URL, API Key, and API Secret

### 2. Deploy to Railway

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Initialize Railway project**:
   ```bash
   railway init
   ```

4. **Set environment variables**:
   ```bash
   railway variables set LIVEKIT_URL=wss://your-project.livekit.cloud
   railway variables set LIVEKIT_API_KEY=APIxxxxxxxxxxxxxxxxxxxx
   railway variables set LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   railway variables set DATABASE_URL=file:./prisma/dev.db
   railway variables set PORT=4000
   ```

5. **Deploy**:
   ```bash
   railway up
   ```

6. **Get your app URL**:
   ```bash
   railway domain
   ```

7. **Set the web app URL**:
   ```bash
   railway variables set NEXT_PUBLIC_SERVER_URL=https://your-app.railway.app
   ```

### 3. Test Cross-Device Access

Once deployed, anyone can access your game at:
- **Your Railway URL**: `https://your-app.railway.app`
- **Host**: `https://your-app.railway.app/host`
- **Play**: `https://your-app.railway.app/play`
- **Admin**: `https://your-app.railway.app/admin/matches`

### 4. Features

✅ **Real video streaming** via LiveKit Cloud  
✅ **Cross-device access** - works on any device with a browser  
✅ **Persistent matches** - game data saved to database  
✅ **Admin panel** - view match history  
✅ **Real-time gameplay** - Socket.IO for instant updates  

## Local Development

For local development with video:
```bash
npm run dev
```

The app will run on:
- Web: http://localhost:3000
- Server: http://localhost:4000
- LiveKit: ws://localhost:7880 (if running local LiveKit server)
