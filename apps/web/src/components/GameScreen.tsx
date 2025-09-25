import React from "react";

export default function GameScreen({ screen }: { screen?: { category?: string; question?: string; answer?: string; revealed?: boolean } }) {
  if (!screen) {
    return <div className="w-full h-full flex items-center justify-center opacity-70">Game Screen</div>;
  }
  return (
    <div className="w-full h-full p-6 text-center text-white">
      {screen.category ? (
        <div className="text-lg opacity-80 mb-2">{screen.category}</div>
      ) : null}
      {screen.question ? (
        <div className="text-2xl font-semibold mb-4">{screen.question}</div>
      ) : (
        <div className="text-2xl font-semibold mb-4 opacity-60">(no question)</div>
      )}
      <div className={`mt-6 text-xl ${screen.revealed ? "opacity-100" : "opacity-30"}`}>
        {screen.answer ? screen.answer : "(answer)"}
      </div>
    </div>
  );
}
