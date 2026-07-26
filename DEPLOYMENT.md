# BuzzKill Deployment Guide

## Architecture (Railway)

| Service | Role | Public URL pattern |
|---------|------|--------------------|
| **web** | Next.js UI (`/host`, `/play`, `/admin`) | `https://web-….up.railway.app` |
| **BuzzKill** | Socket.IO + LiveKit tokens + match API | `https://buzzkill-….up.railway.app` |
| **Postgres** | Persistent match history | private (`DATABASE_URL`) |

Players only open the **web** URL. Video media goes through **LiveKit Cloud** (not Railway).

## One-time setup

1. LiveKit Cloud project → set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` on the **BuzzKill** service.
2. Add Railway **Postgres** → set server `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
3. On **web**, set `NEXT_PUBLIC_SERVER_URL` to the BuzzKill public HTTPS URL.
4. Deploy both services from GitHub `main` (or `railway up --service <name>`).

## Local development (optional)

You do **not** need a local API if you point the web app at Railway:

```bash
# apps/web/.env.local
NEXT_PUBLIC_SERVER_URL=https://buzzkill-production.up.railway.app
npm run dev:web
```

To run the API locally against Railway Postgres:

```bash
railway link -p BuzzKill
railway run -s BuzzKill npm run dev -w apps/server
```

## URLs

- Host: `https://<web>/host`
- Play: `https://<web>/play`
- Admin: `https://<web>/admin/matches`
- API health: `https://<server>/health`
