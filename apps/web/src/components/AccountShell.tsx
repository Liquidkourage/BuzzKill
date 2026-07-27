"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/auth";
import { logout } from "@/lib/auth";

export default function AccountShell({
  user,
  title,
  children,
}: {
  user: AuthUser | null;
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const signOut = () => {
    logout();
    router.replace("/login");
  };

  return (
    <main className="shell-light px-6 py-10 max-w-4xl mx-auto flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="mono text-xs tracking-[0.18em] uppercase text-[color:var(--muted)]">
            BuzzKill
          </Link>
          <h1 className="display text-5xl mt-2 m-0">{title}</h1>
          {user ? (
            <p className="mt-2 text-[color:var(--muted)] m-0">
              {user.name || user.email}
              {user.isCommissioner ? " · Commissioner" : ""}
              {user.isReader ? " · Reader" : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/account" className="btn btn-ghost text-xs">
            Account
          </Link>
          <Link href="/team" className="btn btn-ghost text-xs">
            Team
          </Link>
          {user?.isReader ? (
            <Link href="/reader" className="btn btn-ghost text-xs">
              Reader
            </Link>
          ) : null}
          {user?.isCommissioner ? (
            <Link href="/commissioner" className="btn btn-ink text-xs">
              Commissioner
            </Link>
          ) : null}
          <button className="btn btn-ghost text-xs" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
      {children}
    </main>
  );
}
