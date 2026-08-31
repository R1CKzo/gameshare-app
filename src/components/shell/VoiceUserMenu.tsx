"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { useActiveCall } from "@/components/call/ActiveCallProvider";
import { useFloatingMenu } from "@/hooks/useFloatingMenu";
import { apiUrl } from "@/lib/apiUrl";

const MENU_WIDTH = 240;

// Menu ao clicar no avatar de alguem conectado em voz (barra lateral, ver
// VoicePresenceRow em ChannelSidebar.tsx) -- estilo Discord: ajustar o
// volume só da voz dessa pessoa (0-200%, so pra mim), mutar ela so pra mim
// (sem afetar ninguem mais) ou mandar uma mensagem direta. Nao aparece pro
// proprio usuario (nao faz sentido nenhuma das 3 acoes em si mesmo).
export function VoiceUserMenu({
  user,
  children,
}: {
  user: { id: string; nickname: string | null; userTag: string | null };
  children: ReactNode;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const { getMicVolumeFor, setMicVolumeFor, isLocallyMuted, toggleLocalMute } = useActiveCall();
  const { open, setOpen, position, buttonRef, menuRef, toggleOpen } = useFloatingMenu((rect) => ({
    top: rect.bottom + 6,
    left: Math.min(rect.left, window.innerWidth - MENU_WIDTH - 12),
  }));

  if (session?.user?.id === user.id) return <>{children}</>;

  const volume = getMicVolumeFor(user.id);
  const muted = isLocallyMuted(user.id);
  const label = `${user.nickname ?? "Alguém"}${user.userTag ? "#" + user.userTag : ""}`;

  async function sendMessage() {
    setOpen(false);
    try {
      const res = await fetch(apiUrl("/api/dms"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId: user.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) router.push(`/dms/${data.id}`);
      else window.alert(data?.error ?? "Não foi possível abrir a conversa.");
    } catch {
      window.alert("Não foi possível abrir a conversa.");
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        aria-label={`Opções de ${label}`}
        className="contents"
      >
        {children}
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="fixed z-[100] gs-anim-fade rounded-xl border border-overlay-strong bg-elevated p-3 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
          >
            <div className="mb-3 truncate text-sm font-bold text-foreground">{label}</div>

            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wide text-muted">VOLUME</span>
              <span className="text-[11px] font-bold text-dim">{volume}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              value={volume}
              onChange={(e) => setMicVolumeFor(user.id, Number(e.target.value))}
              aria-label={`Volume de ${label}`}
              className="gs-range w-full"
              style={{ "--range-progress": `${volume / 2}%` } as React.CSSProperties}
            />

            <div className="mt-2.5 space-y-0.5 border-t border-overlay pt-2">
              <button
                onClick={() => toggleLocalMute(user.id)}
                className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-[13px] font-semibold text-foreground-secondary transition hover:bg-elevated-hover hover:text-foreground"
              >
                {muted ? <UnmuteIcon /> : <MuteIcon />}
                {muted ? "Reativar áudio" : "Mutar para você"}
              </button>
              <button
                onClick={sendMessage}
                className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-[13px] font-semibold text-foreground-secondary transition hover:bg-elevated-hover hover:text-foreground"
              >
                <MessageIcon />
                Enviar mensagem
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function MuteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M1 1l22 22" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.11 1.23" />
    </svg>
  );
}

function UnmuteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v4M8 23h8" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
