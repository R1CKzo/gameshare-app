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
          <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full bg-primary">
            {p.image ? (
              <Image src={p.image} alt="" fill sizes="24px" unoptimized className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] font-bold">
                {(p.nickname ?? "?").slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <span className="max-w-[120px] truncate text-xs font-semibold">{p.nickname}</span>
          {p.isSharing && <span title="Compartilhando tela">🖥️</span>}
          {(p.isMuted || p.isDeafened) && <span title={p.isDeafened ? "Silenciado" : "Mudo"}>🔇</span>}
        </div>
      ))}
    </div>
  );
}
