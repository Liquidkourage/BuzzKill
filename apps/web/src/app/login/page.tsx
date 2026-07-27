"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { homePathFor, login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { user } = await login(email, password);
      router.replace(homePathFor(user));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell-light px-6 py-10 max-w-md mx-auto flex flex-col gap-8">
      <div>
        <Link href="/" className="mono text-xs tracking-[0.18em] uppercase text-[color:var(--muted)]">
          BuzzKill
        </Link>
        <h1 className="display text-5xl mt-2 m-0">Sign in</h1>
        <p className="mt-2 text-[color:var(--muted)] m-0">
          Commissioner, captains, players, and readers use the same login.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div>
          <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
            Email
          </label>
          <input
            className="field w-full mt-1"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mono text-[0.65rem] tracking-[0.14em] uppercase text-[color:var(--muted)]">
            Password
          </label>
          <input
            className="field w-full mt-1"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <p className="m-0 text-sm text-[color:var(--buzz)]">{error}</p> : null}
        <button className="btn btn-buzz" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
