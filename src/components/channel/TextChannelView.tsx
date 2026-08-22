"use client";

import { useRef } from "react";

import { MessageList } from "@/components/channel/MessageList";
import { HamburgerIcon, MembersIcon, useMobileUI } from "@/components/shell/MobileUIContext";
import { useChatMessages } from "@/hooks/useChatMessages";
import { textChannelPusherName } from "@/lib/pusherShared";
import { useStickyScroll } from "@/hooks/useStickyScroll";

export function TextChannelView({
  channelId,
  channelName,
  currentUserId,
}: {
  channelId: string;
  channelName: string;
  currentUserId: string;
}) {
  const { toggleSidebar, toggleMembers } = useMobileUI();
  const apiBase = `/api/channels/${channelId}`;
  const chat = useChatMessages({ apiBase, pusherChannelName: textChannelPusherName(channelId) });
  const { scrollRef, handleScroll, stickToBottom } = useStickyScroll(chat.messages);

  const draftRef = useRef<HTMLTextAreaElement>(null);

  async function handleLoadOlder() {
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    await chat.loadOlder();
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
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
        <span className="text-xl font-semibold text-muted">#</span>
        <span className="truncate font-bold">{channelName}</span>
        <button
          onClick={toggleMembers}
          aria-label="Ver membros"
          className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-[#f5f5f7] lg:hidden"
        >
          <MembersIcon />
        </button>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 sm:px-5">
        {chat.loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">Carregando...</div>
        ) : chat.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="font-display text-lg font-bold">Este e o comeco de #{channelName}</div>
            <div className="max-w-xs text-sm text-muted">Manda a primeira mensagem pro servidor.</div>
          </div>
        ) : (
          <>
            {chat.hasMore && (
              <div className="mb-3 mt-4 flex justify-center">
                <button
                  onClick={handleLoadOlder}
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
            placeholder={`Enviar mensagem em #${channelName}`}
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
