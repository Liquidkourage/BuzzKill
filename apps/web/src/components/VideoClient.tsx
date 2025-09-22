/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Room, RoomEvent, createLocalTracks, RemoteTrack } from "livekit-client";

export default function VideoClient({ code, identity }: { code: string; identity: string }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connState, setConnState] = useState<string>("disconnected");
  const [micOn, setMicOn] = useState<boolean>(true);
  const [camOn, setCamOn] = useState<boolean>(true);
  const [remoteVideoTracks, setRemoteVideoTracks] = useState<Array<{ id: string; track: RemoteTrack }>>([]);
  const [localVideoEl, setLocalVideoEl] = useState<HTMLVideoElement | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);

  // Expose publishing helper so UI handlers can republish (e.g., when switching camera)
  const publishTracksWithRetry = useCallback(async (targetRoom: Room, videoOnly = false) => {
    try {
      const createOpts: Record<string, unknown> = {};
      if (videoOnly) {
        createOpts.video = selectedDeviceId ? { deviceId: selectedDeviceId } : true;
      } else {
        createOpts.audio = true;
        createOpts.video = selectedDeviceId ? { deviceId: selectedDeviceId } : true;
      }
      const tracks = await createLocalTracks(createOpts as any);
      for (const t of tracks) {
        try {
          await targetRoom.localParticipant.publishTrack(t);
        } catch (pubErr: unknown) {
          setError(pubErr instanceof Error ? pubErr.message : "Failed to publish track");
        }
      }
      // Attach local video directly from created tracks
      const localCamTrack = tracks.find((tr: any) => (tr as any).kind === "video");
      if (localCamTrack && localVideoEl) {
        try { (localCamTrack as any).attach(localVideoEl); } catch { /* noop */ }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not access mic/camera");
    }
  }, [selectedDeviceId, localVideoEl]);

  useEffect(() => {
    let lkRoom: Room | null = null;
    let mounted = true;

    async function join() {
      try {
        // enumerate devices early (prompts permissions once)
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          const list = await navigator.mediaDevices.enumerateDevices();
          setDevices(list.filter((d) => d.kind === 'videoinput'));
          stream.getTracks().forEach((t) => t.stop());
        } catch {/* ignore */}
        const base = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
        const resp = await fetch(`${base}/livekit/token?code=${encodeURIComponent(code)}&identity=${encodeURIComponent(identity)}`);
        if (!resp.ok) {
          const msg = await resp.text();
          setError(`Token endpoint error (${resp.status}): ${msg}`);
          return;
        }
        const data = await resp.json();
        if (!data?.token || !data?.url) {
          setError("LiveKit not configured - video disabled");
          return;
        }
        
        // Check if this is a mock token (for development)
        if (data.token.startsWith('mock-token-')) {
          setError("Mock LiveKit token - video disabled (use real LiveKit server for video)");
          return;
        }
        lkRoom = new Room();
        if (!mounted) return;
        setRoom(lkRoom);
        lkRoom.on(RoomEvent.Connected, async () => {
          setConnected(true);
          // publish after fully connected
          await publishTracksWithRetry(lkRoom!);
        });
        lkRoom.on(RoomEvent.ConnectionStateChanged, (state) => setConnState(state));
        // Track handling for remote videos (keyed by publication SID to avoid duplicates)
        const addTrackBySid = (sid: string | undefined, track: RemoteTrack) => {
          if (!sid) return;
          if (track.kind !== "video") return;
          setRemoteVideoTracks((prev) => {
            if (prev.some((t) => t.id === sid)) return prev;
            return [...prev, { id: sid, track }];
          });
        };
        const removeTrackBySid = (sid: string | undefined) => {
          if (!sid) return;
          setRemoteVideoTracks((prev) => prev.filter((t) => t.id !== sid));
        };
        lkRoom.on(
          RoomEvent.TrackSubscribed,
          (track: any, publication: any /* RemoteTrackPublication */, _participant: any) => {
            addTrackBySid(publication?.trackSid, track as RemoteTrack);
          }
        );
        lkRoom.on(
          RoomEvent.TrackUnsubscribed,
          (_track: any, publication: any /* RemoteTrackPublication */, _participant: any) => {
            removeTrackBySid(publication?.trackSid);
          }
        );
        await lkRoom.connect(data.url, data.token, {
          // Force relayed transport to work around strict NAT/firewall in dev
          rtcConfig: { iceTransportPolicy: "relay" },
        });
        // No manual scan; rely on TrackSubscribed events to avoid duplicates
      } catch (e: any) {
        setError(e?.message || "Failed to join LiveKit");
      }
    }
    join();
    return () => {
      mounted = false;
      if (lkRoom) lkRoom.disconnect();
    };
  }, [code, identity, selectedDeviceId, publishTracksWithRetry]);

  return (
    <div className="w-full border rounded p-2">
      <div className="text-sm opacity-80 mb-2">Video: {connected ? "connected" : `connecting... (${connState})`}</div>
      {error && (
        <div className="text-sm text-yellow-600 mb-2">
          {error}
          <div className="text-xs opacity-70 mt-1">Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET to enable video</div>
        </div>
      )}
      {/* Simple local + remote video grid */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        <div className="relative aspect-video bg-black/80 rounded overflow-hidden">
          <video ref={setLocalVideoEl} autoPlay muted playsInline className="w-full h-full object-cover" />
          <div className="absolute bottom-1 left-1 text-xs bg-black/60 text-white px-1 rounded">you</div>
        </div>
        {remoteVideoTracks.map(({ id, track }) => (
          <VideoTile key={id} track={track} />
        ))}
      </div>
      {room && (
        <div className="flex items-center gap-2 mt-2">
          <button
            className="px-2 py-1 text-sm rounded border"
            onClick={async () => {
              if (!room) return;
              const next = !micOn;
              try {
                await room.localParticipant.setMicrophoneEnabled(next);
                setMicOn(next);
              } catch (e) {
                // swallow
              }
            }}
          >
            {micOn ? "Mute" : "Unmute"}
          </button>
          <button
            className="px-2 py-1 text-sm rounded border"
            onClick={async () => {
              if (!room) return;
              const next = !camOn;
              try {
                await room.localParticipant.setCameraEnabled(next);
                setCamOn(next);
              } catch (e) {
                // swallow
              }
            }}
          >
            {camOn ? "Camera Off" : "Camera On"}
          </button>
          <span className="text-xs opacity-70 ml-2">
            {(() => {
              const size = (room as any)?.participants?.size ?? (room as any)?.remoteParticipants?.size ?? 0;
              return `participants: ${1 + (typeof size === "number" ? size : 0)}`;
            })()}
          </span>
          {devices.length > 0 && (
            <>
              <select
                className="ml-2 px-2 py-1 text-sm rounded border bg-black/20"
                value={selectedDeviceId || ''}
                onChange={(e) => setSelectedDeviceId(e.target.value || undefined)}
              >
                <option value="">Default camera</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(-4)}`}</option>
                ))}
              </select>
              <button
                className="px-2 py-1 text-sm rounded border"
                onClick={async () => {
                  if (!room) return;
                  try {
                    await room.localParticipant.setCameraEnabled(false);
                  } catch {}
                  // republish using selected device
                  await publishTracksWithRetry(room, true);
                }}
              >
                Switch Camera
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function VideoTile({ track }: { track: RemoteTrack }) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!el) return;
    try { track.attach(el); } catch { /* noop */ }
    return () => {
      try { track.detach(el); } catch { /* noop */ }
    };
  }, [el, track]);
  return <video ref={setEl} autoPlay playsInline className="w-full h-full object-cover aspect-video rounded bg-black/80" />;
}


