"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSocket } from "@/lib/socket";

export default function Home() {
  const [socketId, setSocketId] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onConnected = (payload: { socketId: string }) => setSocketId(payload.socketId);
    socket.on("connected", onConnected);
    return () => {
      socket.off("connected", onConnected);
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 gap-6">
      <h1 className="text-3xl font-bold">BuzzKill</h1>
      <p className="opacity-80">Web app scaffold is running.</p>
      <p className="text-sm opacity-70">Socket: {socketId ?? "connecting..."}</p>
      <div className="flex gap-3">
        <a className="btn-secondary" href="/host">Host</a>
        <a className="btn-secondary" href="/play">Play</a>
        <Link className="btn-secondary" href="/admin/matches">Admin</Link>
      </div>
    </main>
  );
}
