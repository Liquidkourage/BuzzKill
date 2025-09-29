/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameScreen from "./GameScreen";
import { Room, RoomEvent, RemoteTrack, createLocalTracks } from "livekit-client";

interface Props {
  code: string;
  identity: string; // this client's identity
  leftIdentities: string[]; // playerIds for team A
  rightIdentities: string[]; // playerIds for team B
  hostIdentity: string; // e.g., host-<code>
  screen?: React.ReactNode;
  hostLabel?: string;
  playerNames?: Record<string, string>;
}

export default function StageVideoLayout({ code, identity, leftIdentities, rightIdentities, hostIdentity, screen, hostLabel, playerNames }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
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
        // When a remote track is subscribed, store it by participant identity
        lkRoom.on(RoomEvent.TrackSubscribed, (track: any, publication: any) => {
          if (!publication?.participant?.identity) return;
          if ((track as RemoteTrack).kind !== "video") return;
          identityToTrack.current.set(publication.participant.identity as string, track as RemoteTrack);
          forceRerender();
        });
        // Remove mapping when track unsubscribes
        lkRoom.on(RoomEvent.TrackUnsubscribed, (_track: any, publication: any) => {
          if (!publication?.participant?.identity) return;
          identityToTrack.current.delete(publication.participant.identity as string);
          forceRerender();
        });
        // Ensure we subscribe to new publications (especially when participants join later)
        lkRoom.on(RoomEvent.TrackPublished as any, (pub: any) => {
          if (pub?.kind === "video" && typeof pub.setSubscribed === "function") {
            try { pub.setSubscribed(true); } catch {}
          }
        });
        await lkRoom.connect(data.url, data.token, { autoSubscribe: true, rtcConfig: { iceTransportPolicy: "relay" } });
        await publishLocal(lkRoom);
        // Fallback: scan already-subscribed remote video tracks and map identities
        try {
          // Ensure subscription to remote video publications
          lkRoom.remoteParticipants.forEach((participant: any) => {
            participant.tracks?.forEach((pub: any) => {
              if (pub?.kind === "video" && typeof pub.setSubscribed === "function") {
                try { pub.setSubscribed(true); } catch {}
              }
            });
            participant.tracks.forEach((pub: any) => {
              const t = pub?.track as RemoteTrack | undefined;
              if (t && (t as any).kind === "video" && participant.identity) {
                identityToTrack.current.set(participant.identity, t);
              }
            });
          });
          // Also force subscribe when new participants connect
          lkRoom.on(RoomEvent.ParticipantConnected as any, (p: any) => {
            p?.tracks?.forEach((pub: any) => {
              if (pub?.kind === "video" && typeof pub.setSubscribed === "function") {
                try { pub.setSubscribed(true); } catch {}
              }
            });
          });
          forceRerender();
        } catch {}
      } catch (e: any) {
        setError(e?.message || "Failed to join LiveKit");
      }
    })();
    return () => { mounted = false; if (lkRoom) lkRoom.disconnect(); };
  }, [code, identity, publishLocal, forceRerender]);

  const renderRemote = useCallback((who: string) => {
    const isSelf = who === identity;
    if (isSelf) {
      return (
        <div className="relative w-full h-full">
          <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          {/* Local controls overlay for the current user */}
          <div className="absolute top-2 left-2 flex gap-2 text-xs">
            <button
              className="px-2 py-1 rounded border bg-black/40 text-white"
              onClick={async (e) => { e.stopPropagation(); try {
                const enabled = (room as any)?.localParticipant?.isMicrophoneEnabled?.() ?? true;
                await (room as any)?.localParticipant?.setMicrophoneEnabled(!enabled);
              } catch {} }}
            >
              Toggle Mic
            </button>
            <button
              className="px-2 py-1 rounded border bg-black/40 text-white"
              onClick={async (e) => { e.stopPropagation(); try {
                const enabled = (room as any)?.localParticipant?.isCameraEnabled?.() ?? true;
                await (room as any)?.localParticipant?.setCameraEnabled(!enabled);
              } catch {} }}
            >
              Toggle Camera
            </button>
          </div>
        </div>
      );
    }
    const track = identityToTrack.current.get(who);
    const participantPresent = (room as any)?.getParticipantByIdentity?.(who);
    const label = playerNames?.[who] || who.slice(0, 6);
    if (!track && !participantPresent) {
      return <EmptyCell />;
    }
    return <VideoRender track={track || null} fallbackLabel={label} />;
  }, [identity, playerNames, room]);

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
        <div className="relative w-full h-full aspect-video">
          {renderRemote(hostIdentity)}
          {hostLabel ? (
            <div className="absolute bottom-1 left-1 text-xs bg-black/60 text-white px-2 py-0.5 rounded">
              {hostLabel}
            </div>
          ) : null}
        </div>
      </div>
      {/* Screen bottom-middle */}
      <div className="col-[2] row-[3/5] bg-black/80">
        <div className="w-full h-full aspect-video flex items-center justify-center text-xl opacity-80">{screen || <GameScreen />}</div>
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

      {/* Removed global debug/status bar to avoid confusion when alone */}
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
      {/* Mute remote videos to satisfy autoplay policies across browsers */}
      <video ref={setEl} autoPlay playsInline muted className="w-full h-full object-cover" />
      {!track && (
        <div className="absolute inset-0 flex items-center justify-center text-sm opacity-70">Waiting for video…</div>
      )}
    </div>
  );
}

function EmptyCell() {
  return <div className="w-full h-full flex items-center justify-center text-xs opacity-40">empty</div>;
}


