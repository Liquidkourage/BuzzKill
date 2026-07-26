import React from "react";

export default function GameScreen({
  screen,
}: {
  screen?: { category?: string; question?: string; answer?: string; revealed?: boolean };
}) {
  if (!screen?.question && !screen?.category) {
    return (
      <div className="game-screen">
        <div className="idle">Awaiting question</div>
      </div>
    );
  }

  return (
    <div className="game-screen">
      {screen.category ? <div className="cat">{screen.category}</div> : null}
      {screen.question ? (
        <div className="q">{screen.question}</div>
      ) : (
        <div className="q" style={{ opacity: 0.35 }}>
          —
        </div>
      )}
      {screen.revealed ? <div className="a">{screen.answer || "—"}</div> : null}
    </div>
  );
}
