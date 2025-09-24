"use client";

import React from "react";

interface PlayerBoxData {
  id: string;
  name: string;
  buzzesRemaining?: number;
  latencyMs?: number;
}

interface StageLayoutProps {
  leftPlayers: PlayerBoxData[]; // up to 4
  rightPlayers: PlayerBoxData[]; // up to 4
  host: React.ReactNode; // large host view (top middle), spans 2 rows
  screen: React.ReactNode; // game screen (bottom middle), spans 2 rows
}

export default function StageLayout({ leftPlayers, rightPlayers, host, screen }: StageLayoutProps) {
  const renderPlayer = (p: PlayerBoxData | null, key: React.Key) => (
    <div key={key} className="bg-black/50 text-white aspect-video flex items-center justify-between px-3">
      {p ? (
        <>
          <span className="truncate mr-3 text-sm">{p.name}</span>
          <div className="flex items-center gap-2">
            {typeof p.latencyMs === "number" && (
              <span className="text-xs opacity-70">{p.latencyMs}ms</span>
            )}
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`w-2 h-2 rounded-full ${i < (p.buzzesRemaining ?? 0) ? "bg-green-400" : "bg-white/20"}`}></span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <span className="opacity-40 text-xs">empty</span>
      )}
    </div>
  );

  const paddedLeft: Array<PlayerBoxData | null> = [...leftPlayers].slice(0, 4);
  while (paddedLeft.length < 4) paddedLeft.push(null);
  const paddedRight: Array<PlayerBoxData | null> = [...rightPlayers].slice(0, 4);
  while (paddedRight.length < 4) paddedRight.push(null);

  return (
    <div className="grid grid-cols-[1fr_2fr_1fr] grid-rows-4 gap-0 w-full max-w-[1400px] mx-auto">
      {/* Left column: rows 1-4 */}
      {paddedLeft.map((p, idx) => (
        <div key={`L${idx}`} className="col-[1] row-[auto]">{renderPlayer(p, `L-${idx}`)}</div>
      ))}

      {/* Middle column: host spans rows 1-2, screen spans rows 3-4 */}
      <div className="col-[2] row-[1/3] bg-black/70 aspect-video flex items-center justify-center">
        <div className="w-full h-full">{host}</div>
      </div>
      <div className="col-[2] row-[3/5] bg-black/70 aspect-video flex items-center justify-center">
        <div className="w-full h-full">{screen}</div>
      </div>

      {/* Right column: rows 1-4 */}
      {paddedRight.map((p, idx) => (
        <div key={`R${idx}`} className="col-[3] row-[auto]">{renderPlayer(p, `R-${idx}`)}</div>
      ))}
    </div>
  );
}


