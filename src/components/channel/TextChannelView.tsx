"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { HamburgerIcon, MembersIcon, useMobileUI } from "@/components/shell/MobileUIContext";
import { getPusherClient } from "@/lib/pusherClient";
import { NEW_MESSAGE_EVENT, textChannelPusherName } from "@/lib/pusherShared";

type MessageAuthor = { id: string; nickname: string | null; userTag: string | null; image: string | null };
type ChatMessage = { id: string; content: string; createdAt: string; user: MessageAuthor };

// Mensagens seguidas da mesma pessoa em menos de 5 minutos ficam agrupadas
// num so bloco (um avatar/nome so), como no Discord.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const latestCreatedAtRef = useRef<string | null>(null);

  // Carrega o historico mais recente ao abrir o canal.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setError(null);

    fetch(`/api/channels/${channelId}/messages`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages ?? []);
        setHasMore(!!data.hasMore);
      })
      .catch(() => !cancelled && setError("Nao foi possivel carregar as mensagens."))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [channelId]);

  // Inscreve no canal privado do Pusher pra receber mensagens novas em
  // tempo real, sem precisar dar refresh ou ficar dando poll.
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(textChannelPusherName(channelId));

    function onNewMessage(message: ChatMessage) {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    }
    channel.bind(NEW_MESSAGE_EVENT, onNewMessage);

    return () => {
      channel.unbind(NEW_MESSAGE_EVENT, onNewMessage);
      pusher.unsubscribe(textChannelPusherName(channelId));
    };
  }, [channelId]);

  // Mantem o scroll grudado embaixo quando ja estava embaixo (chegou
  // mensagem nova), mas nao forca o scroll se a pessoa rolou pra cima pra
  // ler mensagens antigas.
  useEffect(() => {
    latestCreatedAtRef.current = messages.length > 0 ? messages[messages.length - 1].createdAt : null;
    if (!shouldStickToBottomRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Reforço além do Pusher: se o WebSocket cair silenciosamente sem que a
  // pagina perceba (comum quando a aba fica em segundo plano no celular,
  // ou numa rede que bloqueia WebSocket depois de um tempo), essa checagem
  // periodica garante que a mensagem aparece de qualquer jeito, sem
  // precisar de refresh manual.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!latestCreatedAtRef.current) return;
      try {
        const res = await fetch(`/api/channels/${channelId}/messages?after=${latestCreatedAtRef.current}`);
        if (!res.ok) return;
        const data = await res.json();
        const newer: ChatMessage[] = data.messages ?? [];
        if (newer.length === 0) return;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const toAdd = newer.filter((m) => !existingIds.has(m.id));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      } catch {
        // silencioso — e so um reforço, a proxima tentativa resolve
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [channelId]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    shouldStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  const loadOlder = useCallback(async () => {
    if (!messages.length || loadingMore) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const res = await fetch(`/api/channels/${channelId}/messages?before=${messages[0].createdAt}`);
      const data = await res.json();
      setMessages((prev) => [...(data.messages ?? []), ...prev]);
      setHasMore(!!data.hasMore);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch {
      setError("Nao foi possivel carregar mensagens mais antigas.");
    } finally {
      setLoadingMore(false);
    }
  }, [channelId, messages, loadingMore]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    setError(null);
    setDraft("");
    shouldStickToBottomRef.current = true;

    try {
      const res = await fetch(`/api/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Nao foi possivel enviar a mensagem.");
        setDraft(content);
        return;
      }
      // O Pusher tambem vai entregar essa mesma mensagem pra mim, mas o
      // dedupe por id no handler evita duplicar.
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
    } catch {
      setError("Erro de rede. Tente novamente.");
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  const groups = groupMessages(messages);

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
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">Carregando...</div>
        ) : groups.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="font-display text-lg font-bold">Este e o comeco de #{channelName}</div>
            <div className="max-w-xs text-sm text-muted">Manda a primeira mensagem pro servidor.</div>
          </div>
        ) : (
          <div className="py-4">
            {hasMore && (
              <div className="mb-3 flex justify-center">
                <button
                  onClick={loadOlder}
                  disabled={loadingMore}
                  className="rounded-full bg-elevated px-4 py-1.5 text-xs font-semibold text-muted transition hover:text-[#f5f5f7] disabled:opacity-50"
                >
                  {loadingMore ? "Carregando..." : "Carregar mensagens anteriores"}
                </button>
              </div>
            )}
            {groups.map((group) => (
              <MessageGroup key={group.messages[0].id} group={group} isSelf={group.user.id === currentUserId} />
            ))}
          </div>
        )}
      </div>

      {error && <div className="px-3 pb-1 text-xs text-danger sm:px-5">{error}</div>}

      <form onSubmit={handleSend} className="px-3 pb-5 sm:px-6">
        <div className="flex items-end gap-3 rounded-xl bg-elevated px-3.5 py-2.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Enviar mensagem em #${channelName}`}
            rows={1}
            className="max-h-32 flex-1 resize-none bg-transparent text-sm text-[#f5f5f7] outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
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

type MessageGroupData = { user: MessageAuthor; messages: ChatMessage[] };

function groupMessages(messages: ChatMessage[]): MessageGroupData[] {
  const groups: MessageGroupData[] = [];
  for (const message of messages) {
    const last = groups[groups.length - 1];
    const lastMessage = last?.messages[last.messages.length - 1];
    const sameAuthor = last && last.user.id === message.user.id;
    const withinWindow =
      lastMessage && new Date(message.createdAt).getTime() - new Date(lastMessage.createdAt).getTime() < GROUP_WINDOW_MS;

    if (sameAuthor && withinWindow) {
      last.messages.push(message);
    } else {
      groups.push({ user: message.user, messages: [message] });
    }
  }
  return groups;
}

function MessageGroup({ group, isSelf }: { group: MessageGroupData; isSelf: boolean }) {
  const { user, messages } = group;
  const initials = (user.nickname ?? "?").slice(0, 1).toUpperCase();
  const label = `${user.nickname ?? "Alguem"}${user.userTag ? "#" + user.userTag : ""}`;

  return (
    <div className="flex gap-3 py-1.5 hover:bg-white/[0.015]">
      <div className="relative mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-full bg-primary">
        {user.image ? (
          <Image src={user.image} alt="" fill sizes="36px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-xs font-bold">{initials}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-bold ${isSelf ? "text-accent" : "text-[#f5f5f7]"}`}>{label}</span>
          <span className="text-[11px] text-dim">{formatTime(messages[0].createdAt)}</span>
        </div>
        {messages.map((message) => (
          <p key={message.id} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#d5d7dc]">
            {message.content}
          </p>
        ))}
      </div>
    </div>
  );
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `hoje as ${time}`;
  return `${date.toLocaleDateString("pt-BR")} as ${time}`;
}
