"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 py-16 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[720px] h-[720px] rounded-full bg-[radial-gradient(circle,rgba(192,38,211,0.22),transparent_60%)] blur-2xl" />
        <div className="absolute bottom-0 right-0 w-[480px] h-[480px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.18),transparent_60%)] blur-2xl" />
      </div>

      <div className="relative z-10 max-w-xl w-full text-center flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <p className="text-sm uppercase tracking-[0.35em] text-fuchsia-300/80">Live trivia showdown</p>
          <h1 className="display text-7xl sm:text-8xl leading-none neon neon-pink" data-text="BuzzKill">
            BuzzKill
          </h1>
          <p className="text-lg text-white/75 max-w-md mx-auto">
            Two teams. Limited buzzers. Steal or get BuzzKilled. Host a match in the browser — video included.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/host" className="btn-primary text-lg px-8 py-3">
            Host a match
          </Link>
          <Link href="/play" className="btn-secondary text-lg px-8 py-3">
            Join as player
          </Link>
        </div>

        <p className="text-xs text-white/40">
          <Link href="/admin/matches" className="underline underline-offset-2 hover:text-white/70">
            Match history
          </Link>
        </p>
      </div>
    </main>
  );
}
