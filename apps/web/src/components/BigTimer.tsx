"use client";

import { useEffect, useMemo, useState } from "react";

export default function BigTimer({ deadlineAt, label, totalMs = 15000 }: { deadlineAt: number | null; label?: string; totalMs?: number }) {
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    if (!deadlineAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadlineAt]);

  const total = useMemo(() => totalMs, [totalMs]);
  const remaining = useMemo(() => (deadlineAt ? Math.max(0, deadlineAt - now) : 0), [deadlineAt, now]);
  const pct = Math.max(0, Math.min(1, remaining / total));
  const radius = 70;
  const circumference = 2 * Math.PI * radius;

  if (!deadlineAt) {
    return null;
  }

  return (
    <div className="timer-circle">
      <svg width="160" height="160">
        <defs>
          <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#a3e635" />
          </linearGradient>
        </defs>
        <circle className="ring-bg" cx="80" cy="80" r={radius} strokeWidth="10" fill="none" />
        <circle
          className="ring"
          cx="80" cy="80" r={radius}
          strokeWidth="10" fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={(1 - pct) * circumference}
          strokeLinecap="round"
        />
      </svg>
      <div className="value">{Math.ceil(remaining / 1000)}</div>
      {label && <div className="absolute bottom-2 text-xs opacity-80">{label}</div>}
    </div>
  );
}



