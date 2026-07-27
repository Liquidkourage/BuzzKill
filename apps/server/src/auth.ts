import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./db";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function authSecret(): string {
  return process.env.AUTH_SECRET || process.env.ORGANIZER_KEY || "dev-only-change-me";
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(next, "hex"));
  } catch {
    return false;
  }
}

type TokenPayload = { sub: string; exp: number };

export function signToken(userId: string): string {
  const payload: TokenPayload = { sub: userId, exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", authSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", authSecret()).update(body).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (!payload?.sub || !payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export type AuthedUser = {
  id: string;
  email: string;
  name: string | null;
  isCommissioner: boolean;
  isReader: boolean;
};

export type AuthedRequest = Request & { user?: AuthedUser };

function bearer(req: Request): string | null {
  const h = String(req.headers.authorization || "");
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  const q = String(req.query.token || "");
  return q || null;
}

export async function resolveUser(req: Request): Promise<AuthedUser | null> {
  const token = bearer(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isCommissioner: user.isCommissioner,
    isReader: user.isReader,
  };
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: "Sign in required" });
  req.user = user;
  next();
}

export async function requireCommissioner(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: "Sign in required" });
  if (!user.isCommissioner) return res.status(403).json({ error: "Commissioner only" });
  req.user = user;
  next();
}

export function publicUser(user: {
  id: string;
  email: string;
  name: string | null;
  isCommissioner: boolean;
  isReader: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isCommissioner: user.isCommissioner,
    isReader: user.isReader,
  };
}

/** Ensure commissioner account exists from env (idempotent). */
export async function ensureCommissioner() {
  const email = (process.env.COMMISSIONER_EMAIL || "").trim().toLowerCase();
  const password = process.env.COMMISSIONER_PASSWORD || "";
  const name = process.env.COMMISSIONER_NAME || "Commissioner";
  if (!email || !password) {
    console.warn("[auth] COMMISSIONER_EMAIL / COMMISSIONER_PASSWORD not set — skip seed");
    return null;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        isCommissioner: true,
        name: existing.name || name,
        // refresh password only when COMMISSIONER_RESET_PASSWORD=1
        ...(process.env.COMMISSIONER_RESET_PASSWORD === "1"
          ? { passwordHash: hashPassword(password) }
          : {}),
      },
    });
  }
  return prisma.user.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password),
      isCommissioner: true,
      isReader: true,
    },
  });
}
