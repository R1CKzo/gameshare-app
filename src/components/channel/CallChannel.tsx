"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { type LiveState, useActiveCall } from "@/components/call/ActiveCallProvider";
import { CallControlBar } from "@/components/channel/CallControlBar";
import { ParticipantGrid } from "@/components/channel/ParticipantGrid";
import { HamburgerIcon, MembersIcon, useMobileUI } from "@/components/shell/MobileUIContext";
import { type PresentUser } from "@/hooks/useVoiceMesh";

export function CallChannel({
  channelId,
  channelName,
  serverId,
  currentUserId,
  initialLive,
}: {
  channelId: string;
  channelName: string;
  serverId: string;
  currentUserId: string;
  initialLive: LiveState;
}) {
  const activeCall = useActiveCall();
  const isActive = activeCall.target?.kind === "channel" && activeCall.target.channelId === channelId;
  const joined = isActive;

  // Enquanto essa chamada NAO e a ativa, mantemos nosso proprio poll local
  // so pra mostrar o selo "AO VIVO" e quem esta na sala antes de entrar —
  // assim que ela vira a chamada ativa, o ActiveCallProvider assume esse
  // poll (ele precisa continuar rodando mesmo se o usuario sair dessa
  // pagina), entao paramos de duplicar a requisicao.
  const [localLive, setLocalLive] = useState<LiveState>(initialLive);
  const [localPresent, setLocalPresent] = useState<PresentUser[]>([]);
  const live = isActive ? activeCall.live : localLive;
  const present = isActive ? activeCall.present : localPresent;

  const { toggleSidebar, toggleMembers } = useMobileUI();

  const clearedOrphanRef = useRef(false);

  // Se a pagina foi recarregada enquanto eu estava "compartilhando" (do
  // ponto de vista do servidor) e essa chamada NAO esta mais ativa no
  // provider, nao tem mais nenhuma midia de verdade rolando pra manter isso
  // vivo — limpa sozinho. Se a chamada continua ativa (o usuario so voltou
  // a visitar essa pagina enquanto ainda esta nela), nao mexe em nada.
  useEffect(() => {
    if (clearedOrphanRef.current || isActive) return;
    if (initialLive.isLive && initialLive.broadcaster?.id === currentUserId) {
      clearedOrphanRef.current = true;
      fetch(`/api/channels/${channelId}/stop`, { method: "POST" }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  useEffect(() => {
    if (isActive) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/channels/${channelId}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setLocalLive({ isLive: data.isLive, broadcaster: data.broadcaster });
        setLocalPresent(data.present ?? []);
      } catch {
        // ignora falhas transitorias de rede
      }
    }

    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [channelId, isActive]);

  function joinRoom() {
    activeCall.setCallError(null);
    activeCall.join({ kind: "channel", channelId, serverId, apiBase: `/api/channels/${channelId}`, name: channelName }, currentUserId);
  }

  function leaveRoom() {
    activeCall.leave();
  }

  const errorMsg = isActive ? activeCall.callError : null;
  const broadcasterLabel = live.broadcaster
    ? `${live.broadcaster.nickname ?? "Alguém"}${live.broadcaster.userTag ? "#" + live.broadcaster.userTag : ""}`
    : null;
  const someoneElseLive = live.isLive && live.broadcaster?.id !== currentUserId;
  const isSharingScreenHere = isActive && activeCall.isSharingScreen;
  const sharingUserId = isSharingScreenHere ? currentUserId : live.isLive ? live.broadcaster?.id ?? null : null;

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 sm:gap-2.5 sm:px-5">
        <button
          onClick={toggleSidebar}
          aria-label="Abrir menu"
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-[#f5f5f7] md:hidden"
        >
          <HamburgerIcon />
        </button>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={joined ? "#22d3ee" : "#6b7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
        <span className="truncate font-bold">{channelName}</span>
        {live.isLive && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/[0.12] px-2.5 py-0.5 text-xs font-bold text-accent">
            <div className="h-1.5 w-1.5 rounded-full bg-accent" />
            AO VIVO
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {present.length > 0 && (
            <>
              <div className="flex">
                {present.slice(0, 5).map((u, i) => (
                  <PresenceAvatar key={u.id} user={u} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 5 - i }} />
                ))}
              </div>
              <span className="hidden text-xs text-muted sm:inline">
                {present.length} {present.length === 1 ? "pessoa aqui" : "pessoas aqui"}
              </span>
            </>
          )}
          <button
            onClick={toggleMembers}
            aria-label="Ver membros"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-[#f5f5f7] lg:hidden"
          >
            <MembersIcon />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger sm:px-5">{errorMsg}</div>
      )}

      {joined ? (
        <>
          <ParticipantGrid
            present={present}
            currentUserId={currentUserId}
            localStream={activeCall.localStream}
            remoteStreams={activeCall.remoteStreams}
            isMuted={activeCall.isMuted}
            sharingUserId={sharingUserId}
            connectionQuality={activeCall.connectionQuality}
          />
          <CallControlBar isMuted={activeCall.isMuted} onToggleMute={activeCall.toggleMute} onDisconnect={leaveRoom} />
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4">
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-elevated">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
          </div>
          <div className="max-w-sm text-center">
            <div className="font-display text-xl font-bold">Você não está em {channelName}</div>
            <div className="mt-2 text-sm text-muted">
              {someoneElseLive
                ? `${broadcasterLabel} está ao vivo aqui agora.`
                : "Entre pra conversar por voz e, se quiser, compartilhar sua tela."}
            </div>
          </div>
          <button
            onClick={joinRoom}
            className="flex items-center gap-2.5 rounded-full bg-primary px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition hover:-translate-y-px"
          >
            Entrar na sala
          </button>

          {present.filter((u) => u.id !== currentUserId).length > 0 && (
            <div className="flex items-center gap-2 rounded-full bg-elevated px-3 py-1.5">
              <div className="flex">
                {present
                  .filter((u) => u.id !== currentUserId)
                  .slice(0, 5)
                  .map((u, i) => (
                    <PresenceAvatar key={u.id} user={u} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 5 - i }} />
                  ))}
              </div>
              <span className="text-xs text-muted">também estão na sala</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function PresenceAvatar({ user, style }: { user: PresentUser; style?: React.CSSProperties }) {
  const initials = (user.nickname ?? "?").slice(0, 1).toUpperCase();
  return (
    <div
      title={user.nickname ? `${user.nickname}#${user.userTag ?? ""}` : undefined}
      style={style}
      className="relative h-6 w-6 overflow-hidden rounded-full border-2 border-main bg-primary"
    >
      {user.image ? (
        <Image src={user.image} alt="" fill sizes="24px" className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-display text-[10px] font-bold">
          {initials}
        </div>
      )}
    </div>
  );
}
