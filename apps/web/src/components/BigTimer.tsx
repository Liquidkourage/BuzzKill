"use client";

import { useEffect, useMemo, useState } from "react";

export default function BigTimer({
  deadlineAt,
  label,
  totalMs = 15000,
}: {
  deadlineAt: number | null;
  label?: string;
  totalMs?: number;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!deadlineAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadlineAt]);

  const remaining = useMemo(
    () => (deadlineAt ? Math.max(0, deadlineAt - now) : 0),
    [deadlineAt, now]
  );
  const pct = Math.max(0, Math.min(1, remaining / totalMs));
  const seconds = Math.ceil(remaining / 1000);
  const urgent = remaining > 0 && remaining <= 5000;

  if (!deadlineAt) return null;

  return (
    <div className="timer-rail" data-urgent={urgent ? "true" : "false"}>
      {label ? <div className="label">{label}</div> : null}
      <div className="seconds mono">{seconds}</div>
      <div className="timer-track" aria-hidden>
        <i style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
