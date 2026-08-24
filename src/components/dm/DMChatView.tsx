"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { type LiveState, useActiveCall } from "@/components/call/ActiveCallProvider";
import { CallControlBar } from "@/components/channel/CallControlBar";
import { MessageList } from "@/components/channel/MessageList";
import { ParticipantGrid } from "@/components/channel/ParticipantGrid";
import { HamburgerIcon, useMobileUI } from "@/components/shell/MobileUIContext";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useStickyScroll } from "@/hooks/useStickyScroll";
import { type PresentUser } from "@/hooks/useVoiceMesh";
import { dmChannelPusherName } from "@/lib/pusherShared";

type DMUser = { id: string; nickname: string | null; userTag: string | null; image: string | null };

// DM do GameShare, igual DM do Discord: uma unica tela com o historico de
// chat sempre visivel e uma chamada de voz opcional por cima — entrar na
// chamada nao troca de tela, so acrescenta a barra de participantes/
// controles no topo, o chat continua ali embaixo.
export function DMChatView({
  dmChannelId,
  currentUserId,
  otherUser,
  initialLive,
}: {
  dmChannelId: string;
  currentUserId: string;
  otherUser: DMUser;
  initialLive: LiveState;
}) {
  const { toggleSidebar } = useMobileUI();
  const apiBase = `/api/dms/${dmChannelId}`;

  const activeCall = useActiveCall();
  const isActive = activeCall.target?.kind === "dm" && activeCall.target.dmChannelId === dmChannelId;
  const joined = isActive;

  // Mesma logica do CallChannel: so mantemos poll local enquanto essa DM
  // NAO e a chamada ativa. Quando ela vira a ativa, o ActiveCallProvider
  // assume o poll (precisa continuar mesmo se o usuario sair da tela).
  const [localLive, setLocalLive] = useState<LiveState>(initialLive);
  const [localPresent, setLocalPresent] = useState<PresentUser[]>([]);
  const live = isActive ? activeCall.live : localLive;
  const present = isActive ? activeCall.present : localPresent;

  const callError = isActive ? activeCall.callError : null;
  const clearedOrphanRef = useRef(false);

  const chat = useChatMessages({ apiBase, pusherChannelName: dmChannelPusherName(dmChannelId) });
  const { scrollRef, handleScroll, stickToBottom } = useStickyScroll(chat.messages);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (clearedOrphanRef.current || isActive) return;
    if (initialLive.isLive && initialLive.broadcaster?.id === currentUserId) {
      clearedOrphanRef.current = true;
      fetch(`${apiBase}/stop`, { method: "POST" }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  useEffect(() => {
    if (isActive) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(apiBase, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setLocalLive({ isLive: data.isLive, broadcaster: data.broadcaster });
        setLocalPresent(data.present ?? []);
      } catch {
        // ignora falhas transitorias
      }
    }
    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiBase, isActive]);

  function joinCall() {
    activeCall.setCallError(null);
    activeCall.join({ kind: "dm", dmChannelId, apiBase, name: otherUser.nickname ?? "Alguém" }, currentUserId);
  }

  function leaveCall() {
    activeCall.leave();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const el = draftRef.current;
    const content = el?.value.trim() ?? "";
    if (!content || chat.sending) return;
    if (el) el.value = "";
    stickToBottom();
    const ok = await chat.sendMessage(content);
    if (!ok && el) el.value = content;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  const label = `${otherUser.nickname ?? "Alguém"}${otherUser.userTag ? "#" + otherUser.userTag : ""}`;
  const isSharingScreenHere = isActive && activeCall.isSharingScreen;
  const sharingUserId = isSharingScreenHere ? currentUserId : live.isLive ? live.broadcaster?.id ?? null : null;
  const someoneElseInCall = present.some((u) => u.id !== currentUserId) && !joined;

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-3 sm:px-5">
        <button
          onClick={toggleSidebar}
          aria-label="Abrir menu"
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-[#f5f5f7] md:hidden"
        >
          <HamburgerIcon />
        </button>
        <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-primary">
          {otherUser.image ? (
            <Image src={otherUser.image} alt="" fill sizes="28px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-[11px] font-bold">
              {(otherUser.nickname ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <span className="truncate font-bold">{label}</span>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {someoneElseInCall && (
            <span className="hidden text-xs font-semibold text-accent sm:inline">Em chamada</span>
          )}
          {!joined && (
            <button
              onClick={joinCall}
              className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-bold text-white transition hover:bg-primary-hover"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Ligar
            </button>
          )}
        </div>
      </div>

      {joined && (
        <div className="flex shrink-0 flex-col border-b border-white/[0.06]">
          <div className="h-[220px] shrink-0">
            <ParticipantGrid
              present={
                present.length > 0
                  ? present
                  : [{ id: currentUserId, nickname: null, userTag: null, image: null, peerId: null, isMuted: false }]
              }
              currentUserId={currentUserId}
              localStream={activeCall.localStream}
              remoteStreams={activeCall.remoteStreams}
              isMuted={activeCall.isMuted}
              sharingUserId={sharingUserId}
            />
          </div>
          <CallControlBar isMuted={activeCall.isMuted} onToggleMute={activeCall.toggleMute} onDisconnect={leaveCall} />
        </div>
      )}

      {callError && (
        <div className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger sm:px-5">{callError}</div>
      )}

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 sm:px-5">
        {chat.loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">Carregando...</div>
        ) : chat.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="relative h-16 w-16 overflow-hidden rounded-full bg-primary">
              {otherUser.image ? (
                <Image src={otherUser.image} alt="" fill sizes="64px" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-xl font-bold">
                  {(otherUser.nickname ?? "?").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="font-display text-lg font-bold">{label}</div>
            <div className="max-w-xs text-sm text-muted">Este é o começo da sua conversa.</div>
          </div>
        ) : (
          <>
            {chat.hasMore && (
              <div className="mb-3 mt-4 flex justify-center">
                <button
                  onClick={async () => {
                    const el = scrollRef.current;
                    const prevHeight = el?.scrollHeight ?? 0;
                    await chat.loadOlder();
                    requestAnimationFrame(() => {
                      if (el) el.scrollTop = el.scrollHeight - prevHeight;
                    });
                  }}
                  disabled={chat.loadingMore}
                  className="rounded-full bg-elevated px-4 py-1.5 text-xs font-semibold text-muted transition hover:text-[#f5f5f7] disabled:opacity-50"
                >
                  {chat.loadingMore ? "Carregando..." : "Carregar mensagens anteriores"}
                </button>
              </div>
            )}
            <MessageList messages={chat.messages} currentUserId={currentUserId} />
          </>
        )}
      </div>

      {chat.error && <div className="px-3 pb-1 text-xs text-danger sm:px-5">{chat.error}</div>}

      <form onSubmit={handleSend} className="px-3 pb-5 sm:px-6">
        <div className="flex items-end gap-3 rounded-xl bg-elevated px-3.5 py-2.5">
          <textarea
            ref={draftRef}
            onKeyDown={handleKeyDown}
            placeholder={`Enviar mensagem para ${otherUser.nickname ?? "..."}`}
            rows={1}
            className="max-h-32 flex-1 resize-none bg-transparent text-sm text-[#f5f5f7] outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={chat.sending}
            aria-label="Enviar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-accent disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </form>
    </>
  );
}
