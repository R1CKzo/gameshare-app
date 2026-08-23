"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getPusherClient } from "@/lib/pusherClient";
import { NEW_MESSAGE_EVENT } from "@/lib/pusherShared";

export type MessageAuthor = { id: string; nickname: string | null; userTag: string | null; image: string | null };
export type ChatMessage = { id: string; content: string; createdAt: string; user: MessageAuthor };

// Toda a logica de historico + tempo real de um chat (canal de servidor
// ou DM, a unica diferenca e o prefixo da API e o nome do canal do
// Pusher) — extraido pra nao duplicar isso entre TextChannelView e a
// tela de DM.
export function useChatMessages({ apiBase, pusherChannelName }: { apiBase: string; pusherChannelName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestCreatedAtRef = useRef<string | null>(null);

  // Carrega o historico mais recente ao abrir a conversa, e marca "lido ate
  // agora" na hora — mesma rota (`${apiBase}/read`) serve tanto canal de
  // servidor quanto DM, ja que os dois seguem o mesmo prefixo de API.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setError(null);

    fetch(`${apiBase}/messages`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages ?? []);
        setHasMore(!!data.hasMore);
      })
      .catch(() => !cancelled && setError("Não foi possível carregar as mensagens."))
      .finally(() => !cancelled && setLoading(false));

    fetch(`${apiBase}/read`, { method: "POST" }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  // Inscreve no canal privado do Pusher pra receber mensagens novas em
  // tempo real, sem precisar dar refresh ou ficar dando poll.
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(pusherChannelName);

    function onNewMessage(message: ChatMessage) {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      // Ja esta vendo essa conversa quando a mensagem chegou — marca lida
      // na hora, sem esperar a pessoa trocar de tela e voltar.
      fetch(`${apiBase}/read`, { method: "POST" }).catch(() => {});
    }
    channel.bind(NEW_MESSAGE_EVENT, onNewMessage);

    return () => {
      channel.unbind(NEW_MESSAGE_EVENT, onNewMessage);
      pusher.unsubscribe(pusherChannelName);
    };
  }, [pusherChannelName, apiBase]);

  useEffect(() => {
    latestCreatedAtRef.current = messages.length > 0 ? messages[messages.length - 1].createdAt : null;
  }, [messages]);

  // Reforço além do Pusher: se o WebSocket cair silenciosamente sem que a
  // pagina perceba, essa checagem periodica garante que a mensagem
  // aparece de qualquer jeito, sem precisar de refresh manual.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!latestCreatedAtRef.current) return;
      try {
        const res = await fetch(`${apiBase}/messages?after=${latestCreatedAtRef.current}`);
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
  }, [apiBase]);

  const loadOlder = useCallback(async () => {
    if (!messages.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`${apiBase}/messages?before=${messages[0].createdAt}`);
      const data = await res.json();
      setMessages((prev) => [...(data.messages ?? []), ...prev]);
      setHasMore(!!data.hasMore);
    } catch {
      setError("Não foi possível carregar mensagens mais antigas.");
    } finally {
      setLoadingMore(false);
    }
  }, [apiBase, messages, loadingMore]);

  const sendMessage = useCallback(
    async (content: string) => {
      setSending(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Não foi possível enviar a mensagem.");
          return false;
        }
        setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
        return true;
      } catch {
        setError("Erro de rede. Tente novamente.");
        return false;
      } finally {
        setSending(false);
      }
    },
    [apiBase]
  );

  return { messages, hasMore, loadingMore, loading, sending, error, setError, loadOlder, sendMessage };
}
