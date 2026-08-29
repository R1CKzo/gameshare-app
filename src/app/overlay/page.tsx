"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { onOverlayState, type OverlayParticipant } from "@/lib/desktop";

// Rota dedicada, carregada so pela janela de overlay do app de desktop
// (ver createGameOverlayWindow em desktop/main.js) -- nunca navegada por
// uma pessoa de verdade. Fundo tem que ficar transparente de verdade
// (nao so um div por cima) pra Electron enxergar o jogo por baixo, entao
// isso mexe direto no documento -- essa janela nunca carrega outra rota,
// entao nao tem risco de vazar pra o resto do site (ver Providers.tsx,
// que pula todos os provedores pesados pra "/overlay").
export default function OverlayPage() {
  const [participants, setParticipants] = useState<OverlayParticipant[]>([]);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return onOverlayState((state) => setParticipants(state.participants));
  }, []);

  if (participants.length === 0) return null;

  return (
    <div className="fixed left-3 top-3 flex flex-col gap-1.5">
      {participants.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-2 rounded-full bg-black/70 py-1 pl-1 pr-3 text-white shadow-lg backdrop-blur-sm"
        >
          <div
            className={`relative h-7 w-7 shrink-0 rounded-full border-2 p-0.5 transition-colors ${
              p.isSpeaking ? "border-accent" : "border-transparent"
            }`}
          >
            <div className="relative h-full w-full overflow-hidden rounded-full bg-primary">
              {p.image ? (
                <Image src={p.image} alt="" fill sizes="24px" unoptimized className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] font-bold">
                  {(p.nickname ?? "?").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <span className="max-w-[120px] truncate text-xs font-semibold">{p.nickname}</span>
          {p.isSharing && <ShareIcon />}
          {/* Mesmos icones (e mesma regra) do app de verdade -- ver
          ParticipantGrid.tsx: mudo e silenciado sao coisas diferentes e
          podem aparecer os dois juntos. */}
          {p.isMuted && <MutedIcon />}
          {p.isDeafened && <DeafenedIcon />}
        </div>
      ))}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M1 1l22 22" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.11 1.23" />
    </svg>
  );
}

function DeafenedIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      <path d="M2 2l20 20" />
    </svg>
  );
}
