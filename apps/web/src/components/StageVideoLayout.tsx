/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent, RemoteTrack, createLocalTracks } from "livekit-client";

interface Props {
  code: string;
  identity: string; // this client's identity
  leftIdentities: string[]; // playerIds for team A
  rightIdentities: string[]; // playerIds for team B
  hostIdentity: string; // e.g., host-<code>
  screen?: React.ReactNode;
}

export default function StageVideoLayout({ code, identity, leftIdentities, rightIdentities, hostIdentity, screen }: Props) {
  const [, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connState, setConnState] = useState<string>("disconnected");
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const identityToTrack = useRef<Map<string, RemoteTrack>>(new Map());
  const [, force] = useState(0);

  const forceRerender = useCallback(() => force((x) => x + 1), []);

  const publishLocal = useCallback(async (targetRoom: Room) => {
    try {
      const tracks = await createLocalTracks({ audio: true, video: true } as any);
      for (const t of tracks) {
        try { await targetRoom.localParticipant.publishTrack(t); } catch {}
      }
      const localCamTrack = tracks.find((tr: any) => (tr as any).kind === "video");
      if (localCamTrack && localVideoRef.current) {
        try { (localCamTrack as any).attach(localVideoRef.current); } catch {}
      }
    } catch (e: any) {
      setError(e?.message || "Could not access mic/camera");
    }
  }, []);

  useEffect(() => {
    let lkRoom: Room | null = null;
    let mounted = true;
    (async () => {
      try {
        const base = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
        const resp = await fetch(`${base}/livekit/token?code=${encodeURIComponent(code)}&identity=${encodeURIComponent(identity)}`);
        if (!resp.ok) {
          setError(`Token endpoint error (${resp.status})`);
          return;
        }
        const data = await resp.json();
        if (!data?.token || !data?.url) {
          setError("LiveKit not configured");
          return;
        }
        if (data.token.startsWith("mock-token-")) {
          setError("Mock LiveKit token - video disabled");
          return;
        }
        lkRoom = new Room();
        if (!mounted) return;
        setRoom(lkRoom);
        lkRoom.on(RoomEvent.ConnectionStateChanged, (s) => setConnState(s));
        lkRoom.on(RoomEvent.TrackSubscribed, (track: any, publication: any) => {
          if (!publication?.participant?.identity) return;
          if ((track as RemoteTrack).kind !== "video") return;
          identityToTrack.current.set(publication.participant.identity as string, track as RemoteTrack);
          forceRerender();
        });
        lkRoom.on(RoomEvent.TrackUnsubscribed, (_track: any, publication: any) => {
          if (!publication?.participant?.identity) return;
          identityToTrack.current.delete(publication.participant.identity as string);
          forceRerender();
        });
        await lkRoom.connect(data.url, data.token, { rtcConfig: { iceTransportPolicy: "relay" } });
        await publishLocal(lkRoom);
      } catch (e: any) {
        setError(e?.message || "Failed to join LiveKit");
      }
    })();
    return () => { mounted = false; if (lkRoom) lkRoom.disconnect(); };
  }, [code, identity, publishLocal, forceRerender]);

  const renderRemote = useCallback((who: string) => {
    // If this identity is self, show local video ref instead
    if (who === identity) {
      return <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />;
    }
    const track = identityToTrack.current.get(who);
    return <VideoRender track={track || null} fallbackLabel={who.slice(0, 6)} />;
  }, [identity]);

  // Build arrays padded to 4
  const leftIds = useMemo(() => [...leftIdentities].slice(0, 4), [leftIdentities]);
  const rightIds = useMemo(() => [...rightIdentities].slice(0, 4), [rightIdentities]);
  while (leftIds.length < 4) leftIds.push("");
  while (rightIds.length < 4) rightIds.push("");

  return (
    <div className="grid grid-cols-[1fr_2fr_1fr] grid-rows-4 gap-0 w-full max-w-[1400px] mx-auto">
      {/* Left column */}
      {leftIds.map((id, idx) => (
        <div
          key={`L${idx}`}
          className="col-[1] bg-black/70"
          style={{ gridRow: `${idx + 1} / ${idx + 2}` }}
        >
          <div className="relative aspect-video">{id ? renderRemote(id) : <EmptyCell />}</div>
        </div>
      ))}
      {/* Host top-middle */}
      <div className="col-[2] row-[1/3] bg-black/80">
        <div className="relative w-full h-full aspect-video">{renderRemote(hostIdentity)}</div>
      </div>
      {/* Screen bottom-middle */}
      <div className="col-[2] row-[3/5] bg-black/80">
        <div className="w-full h-full aspect-video flex items-center justify-center text-xl opacity-80">{screen || "Game Screen"}</div>
      </div>
      {/* Right column */}
      {rightIds.map((id, idx) => (
        <div
          key={`R${idx}`}
          className="col-[3] bg-black/70"
          style={{ gridRow: `${idx + 1} / ${idx + 2}` }}
        >
          <div className="relative aspect-video">{id ? renderRemote(id) : <EmptyCell />}</div>
        </div>
      ))}

      {/* Status / errors (optional debug) */}
      {error ? <div className="col-[1/4] row-[1] text-xs text-yellow-500 p-1">Video: {error} ({connState})</div> : null}
    </div>
  );
}

function VideoRender({ track, fallbackLabel }: { track: RemoteTrack | null; fallbackLabel: string }) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!el) return;
    if (track) {
      try { track.attach(el); } catch {}
      return () => { try { track.detach(el); } catch {}; };
    }
  }, [el, track]);
  return (
    <div className="w-full h-full">
      <video ref={setEl} autoPlay playsInline muted={false} className="w-full h-full object-cover" />
      {!track && (
        <div className="absolute inset-0 flex items-center justify-center text-sm opacity-70">{fallbackLabel}</div>
      )}
    </div>
  );
}

function EmptyCell() {
  return <div className="w-full h-full flex items-center justify-center text-xs opacity-40">empty</div>;
}


