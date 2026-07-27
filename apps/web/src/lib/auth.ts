import { serverUrl } from "./league";

const TOKEN_KEY = "buzzkill.auth.token";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  isCommissioner: boolean;
  isReader: boolean;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const res = await fetch(`${serverUrl()}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });
  let data: T & { error?: string };
  try {
    data = (await res.json()) as T & { error?: string };
  } catch {
    data = { error: "Invalid response" } as T & { error?: string };
  }
  return { ok: res.ok, status: res.status, data };
}

export async function login(email: string, password: string) {
  const { ok, status, data } = await api<{ token?: string; user?: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!ok || !data.token || !data.user) {
    throw new Error(data.error || "Login failed");
  }
  setToken(data.token);
  return { status, user: data.user };
}

export function logout() {
  setToken(null);
}

export function homePathFor(user: AuthUser): string {
  if (user.isCommissioner) return "/commissioner";
  if (user.isReader) return "/reader";
  return "/account";
}
