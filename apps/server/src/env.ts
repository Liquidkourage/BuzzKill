import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// apps/server/src -> apps/server -> apps -> repo root
export const serverDir = path.resolve(__dirname, "..");
export const repoRoot = path.resolve(serverDir, "../..");

export const envCandidates = [
  path.join(repoRoot, ".env"),
  path.join(serverDir, ".env"),
];

export const loadedEnvFiles: string[] = [];

for (const p of envCandidates) {
  if (!fs.existsSync(p)) continue;
  // Later files override earlier ones (server .env wins over root for local knobs).
  dotenv.config({ path: p, override: true });
  if (!loadedEnvFiles.includes(p)) loadedEnvFiles.push(p);
}

export function databaseInfo(): {
  provider: "sqlite" | "postgres" | "other";
  urlRedacted: string;
  persistentHint: string;
} {
  const url = process.env.DATABASE_URL || "";
  if (url.startsWith("file:")) {
    return {
      provider: "sqlite",
      urlRedacted: url,
      persistentHint: "SQLite file (dev only). Production should use Postgres.",
    };
  }
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    let host = "postgres";
    try {
      host = new URL(url).host;
    } catch {
      /* ignore */
    }
    return {
      provider: "postgres",
      urlRedacted: `postgresql://${host}/…`,
      persistentHint: "Postgres (durable across deploys).",
    };
  }
  return {
    provider: "other",
    urlRedacted: url ? "(set)" : "(missing)",
    persistentHint: "Set DATABASE_URL to your Railway Postgres URL.",
  };
}

export function livekitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET
  );
}

export function livekitHost(): string | null {
  const url = process.env.LIVEKIT_URL;
  if (!url) return null;
  try {
    return new URL(url.replace(/^ws/, "http")).host;
  } catch {
    return url;
  }
}

export function logDbError(context: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[db] ${context}:`, message);
}
