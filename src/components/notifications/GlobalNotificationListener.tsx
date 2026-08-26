"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { type DmActivity, UnreadContext } from "@/components/notifications/UnreadContext";
import { apiUrl } from "@/lib/apiUrl";
import { setUnreadBadge } from "@/lib/desktop";
import { getPusherClient } from "@/lib/pusherClient";
import {
  dmChannelPusherName,
  FRIEND_ACCEPTED_EVENT,
  FRIEND_REQUEST_EVENT,
  NEW_MESSAGE_EVENT,
  ROLE_GRANTED_EVENT,
  textChannelPusherName,
  userPusherName,
} from "@/lib/pusherShared";
import { playMessageSound } from "@/lib/sound";

type ChannelMeta = { channelId: string; serverId: string };
type IncomingMessage = { content: string; createdAt: string; user?: { id: string } };

// Montado uma vez na raiz (ver Providers.tsx): sabe de todo canal de texto
// e toda DM da pessoa, assina cada um no Pusher, e mantem o estado de "tem
// mensagem nao lida" pra ServerRail/ChannelSidebar/DMSidebar renderizarem
// os badges — sem isso, cada um teria que descobrir sozinho em quais
// canais escutar, duplicando inscricao no Pusher.
export function GlobalNotificationListener({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const pathname = usePathname();
  const router = useRouter();

  const [channelMeta, setChannelMeta] = useState<ChannelMeta[]>([]);
  const [dmIds, setDmIds] = useState<string[]>([]);
  const [unreadChannelIds, setUnreadChannelIds] = useState<Set<string>>(new Set());
  const [unreadDmIds, setUnreadDmIds] = useState<Set<string>>(new Set());
  const [mutedServerIds, setMutedServerIds] = useState<Set<string>>(new Set());
  const [mutedChannelIds, setMutedChannelIds] = useState<Set<string>>(new Set());
  const [mutedDmIds, setMutedDmIds] = useState<Set<string>>(new Set());
  const [dmActivity, setDmActivity] = useState<Map<string, DmActivity>>(new Map());
  const [friendsEventVersion, setFriendsEventVersion] = useState(0);
  const [incomingFriendRequestCount, setIncomingFriendRequestCount] = useState(0);

  // Carrega a lista de canais/DMs + estado inicial de nao lido/silenciado,
  // uma vez.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch(apiUrl("/api/me/channels"))
      .then((r) => r.json())
      .then(
        (data: {
          channels?: (ChannelMeta & { unread: boolean })[];
          dms?: { dmChannelId: string; unread: boolean }[];
          mutedServerIds?: string[];
          mutedChannelIds?: string[];
          mutedDmIds?: string[];
        }) => {
          if (cancelled) return;
          const channels = data.channels ?? [];
          const dms = data.dms ?? [];
          setChannelMeta(channels.map((c) => ({ channelId: c.channelId, serverId: c.serverId })));
          setDmIds(dms.map((d) => d.dmChannelId));
          setUnreadChannelIds(new Set(channels.filter((c) => c.unread).map((c) => c.channelId)));
          setUnreadDmIds(new Set(dms.filter((d) => d.unread).map((d) => d.dmChannelId)));
          setMutedServerIds(new Set(data.mutedServerIds ?? []));
          setMutedChannelIds(new Set(data.mutedChannelIds ?? []));
          setMutedDmIds(new Set(data.mutedDmIds ?? []));
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Contagem de pedidos de amizade recebidos — carrega de cara e de novo
  // toda vez que um evento de amizade chega (friendsEventVersion), pra
  // funcionar em qualquer tela, nao so na de Amigos/DM (era ai que o aviso
  // ficava "escondido": no resto do app nao tinha como saber que tinha
  // pedido esperando).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch(apiUrl("/api/friends"), { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { incoming?: unknown[] }) => {
        if (!cancelled) setIncomingFriendRequestCount((data.incoming ?? []).length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, friendsEventVersion]);

  // Se a pessoa ainda nao viu a entrada mais recente do changelog, leva ela
  // pra /novidades sozinho ao abrir o app — substitui a telinha separada que
  // existia so no app de desktop. So deve rodar uma vez por aba/sessao — o
  // guard em checkedRef garante isso de verdade, mesmo se userId oscilar
  // (ex: refetch periodico da sessao) e o efeito rodar de novo sozinho; sem
  // ele, a pessoa podia ser jogada de volta pra /novidades depois de ja ter
  // fechado, so por deixar o app aberto um tempo (ver relato do usuario em
  // 2026-08-25). A propria pagina de Novidades marca como vista ao
  // renderizar, entao um recarregamento de pagina de verdade (F5, reabrir o
  // app) ainda funciona normalmente se realmente tiver novidade nao vista.
  const checkedChangelogRef = useRef(false);
  useEffect(() => {
    if (!userId) return;
    if (checkedChangelogRef.current) return;
    if (pathname === "/novidades") return;
    checkedChangelogRef.current = true;
    let cancelled = false;
    fetch(apiUrl("/api/me/changelog-status"))
      .then((r) => r.json())
      .then((data: { shouldRedirect?: boolean }) => {
        if (!cancelled && data.shouldRedirect) router.replace("/novidades");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // O efeito que assina o Pusher (logo abaixo) so roda de novo quando
  // channelMeta/dmIds mudam -- sem esses refs, os handlers ficariam presos
  // lendo o estado de silenciado de quando foram criados, e silenciar um
  // canal so faria efeito depois de trocar de canal/servidor.
  const mutedServerIdsRef = useRef(mutedServerIds);
  const mutedChannelIdsRef = useRef(mutedChannelIds);
  const mutedDmIdsRef = useRef(mutedDmIds);
  useEffect(() => {
    mutedServerIdsRef.current = mutedServerIds;
  }, [mutedServerIds]);
  useEffect(() => {
    mutedChannelIdsRef.current = mutedChannelIds;
  }, [mutedChannelIds]);
  useEffect(() => {
    mutedDmIdsRef.current = mutedDmIds;
  }, [mutedDmIds]);

  // Assina cada canal de texto + DM pra mensagem nova, e o canal privado do
  // usuario pra pedido de amizade/aceito/cargo atribuido.
  useEffect(() => {
    if (!userId) return;
    const pusher = getPusherClient();
    const unsubs: (() => void)[] = [];

    for (const meta of channelMeta) {
      const name = textChannelPusherName(meta.channelId);
      const channel = pusher.subscribe(name);
      const handler = (message: IncomingMessage) => {
        if (message.user?.id === userId) return;
        if (isViewingChannel(meta.channelId)) return; // useChatMessages ja marca lido nesse caso
        if (mutedServerIdsRef.current.has(meta.serverId) || mutedChannelIdsRef.current.has(meta.channelId)) return;
        setUnreadChannelIds((prev) => (prev.has(meta.channelId) ? prev : new Set(prev).add(meta.channelId)));
        playMessageSound();
      };
      channel.bind(NEW_MESSAGE_EVENT, handler);
      unsubs.push(() => {
        channel.unbind(NEW_MESSAGE_EVENT, handler);
        pusher.unsubscribe(name);
      });
    }

    for (const dmChannelId of dmIds) {
      const name = dmChannelPusherName(dmChannelId);
      const channel = pusher.subscribe(name);
      const handler = (message: IncomingMessage) => {
        setDmActivity((prev) => new Map(prev).set(dmChannelId, { content: message.content, createdAt: message.createdAt }));
        if (message.user?.id === userId) return;
        if (isViewingDm(dmChannelId)) return;
        if (mutedDmIdsRef.current.has(dmChannelId)) return;
        setUnreadDmIds((prev) => (prev.has(dmChannelId) ? prev : new Set(prev).add(dmChannelId)));
        playMessageSound();
      };
      channel.bind(NEW_MESSAGE_EVENT, handler);
      unsubs.push(() => {
        channel.unbind(NEW_MESSAGE_EVENT, handler);
        pusher.unsubscribe(name);
      });
    }

    const userChannelName = userPusherName(userId);
    const userChannel = pusher.subscribe(userChannelName);
    const bump = () => setFriendsEventVersion((v) => v + 1);
    userChannel.bind(FRIEND_REQUEST_EVENT, bump);
    userChannel.bind(FRIEND_ACCEPTED_EVENT, bump);
    userChannel.bind(ROLE_GRANTED_EVENT, bump);
    unsubs.push(() => {
      userChannel.unbind(FRIEND_REQUEST_EVENT, bump);
      userChannel.unbind(FRIEND_ACCEPTED_EVENT, bump);
      userChannel.unbind(ROLE_GRANTED_EVENT, bump);
      pusher.unsubscribe(userChannelName);
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, channelMeta, dmIds]);

  // Ao navegar pra dentro de um canal/DM que estava marcado como nao lido,
  // limpa na hora — a marcacao de "lido" no banco ja acontece via
  // useChatMessages, isso aqui e so o espelho local pro badge sumir junto.
  useEffect(() => {
    const channelMatch = pathname?.match(/\/servers\/[^/]+\/channels\/([^/]+)/);
    const dmMatch = pathname?.match(/^\/dms\/([^/]+)/);
    if (channelMatch) {
      const channelId = channelMatch[1];
      setUnreadChannelIds((prev) => {
        if (!prev.has(channelId)) return prev;
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
    if (dmMatch) {
      const dmChannelId = dmMatch[1];
      setUnreadDmIds((prev) => {
        if (!prev.has(dmChannelId)) return prev;
        const next = new Set(prev);
        next.delete(dmChannelId);
        return next;
      });
    }
  }, [pathname]);

  function isViewingChannel(channelId: string): boolean {
    return pathname?.includes(`/channels/${channelId}`) ?? false;
  }
  function isViewingDm(dmChannelId: string): boolean {
    return pathname === `/dms/${dmChannelId}`;
  }

  // Muda a UI na hora (otimista) e desfaz sozinho se a chamada falhar --
  // mesmo padrao ja usado no resto do app pra acoes rapidas de um clique
  // so, sem precisar de estado de "salvando" visivel pra isso.
  async function setServerMuted(serverId: string, muted: boolean) {
    setMutedServerIds((prev) => {
      const next = new Set(prev);
      if (muted) next.add(serverId);
      else next.delete(serverId);
      return next;
    });
    // Silenciar tambem apaga a bolinha de nao-lida que ja estava acesa --
    // senao o usuario acabou de pedir pra nao ser mais avisado sobre aquilo
    // e a marcacao antiga continuava la ate ele abrir o canal manualmente.
    if (muted) {
      const channelIds = channelMeta.filter((c) => c.serverId === serverId).map((c) => c.channelId);
      if (channelIds.length) {
        setUnreadChannelIds((prev) => {
          if (!channelIds.some((id) => prev.has(id))) return prev;
          const next = new Set(prev);
          for (const id of channelIds) next.delete(id);
          return next;
        });
      }
    }
    try {
      const res = await fetch(apiUrl(`/api/servers/${serverId}/mute`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMutedServerIds((prev) => {
        const next = new Set(prev);
        if (muted) next.delete(serverId);
        else next.add(serverId);
        return next;
      });
    }
  }

  async function setChannelMuted(channelId: string, muted: boolean) {
    setMutedChannelIds((prev) => {
      const next = new Set(prev);
      if (muted) next.add(channelId);
      else next.delete(channelId);
      return next;
    });
    if (muted) {
      setUnreadChannelIds((prev) => {
        if (!prev.has(channelId)) return prev;
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
    try {
      const res = await fetch(apiUrl(`/api/channels/${channelId}/mute`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMutedChannelIds((prev) => {
        const next = new Set(prev);
        if (muted) next.delete(channelId);
        else next.add(channelId);
        return next;
      });
    }
  }

  async function setDmMuted(dmChannelId: string, muted: boolean) {
    setMutedDmIds((prev) => {
      const next = new Set(prev);
      if (muted) next.add(dmChannelId);
      else next.delete(dmChannelId);
      return next;
    });
    if (muted) {
      setUnreadDmIds((prev) => {
        if (!prev.has(dmChannelId)) return prev;
        const next = new Set(prev);
        next.delete(dmChannelId);
        return next;
      });
    }
    try {
      const res = await fetch(apiUrl(`/api/dms/${dmChannelId}/mute`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMutedDmIds((prev) => {
        const next = new Set(prev);
        if (muted) next.delete(dmChannelId);
        else next.add(dmChannelId);
        return next;
      });
    }
  }

  const serverIdByChannel = useMemo(() => new Map(channelMeta.map((c) => [c.channelId, c.serverId])), [channelMeta]);
  const unreadServerIds = useMemo(() => {
    const set = new Set<string>();
    for (const channelId of unreadChannelIds) {
      const serverId = serverIdByChannel.get(channelId);
      if (serverId) set.add(serverId);
    }
    return set;
  }, [unreadChannelIds, serverIdByChannel]);

  const unreadDmCount = unreadDmIds.size;
  const hasAnyUnread = unreadChannelIds.size > 0 || unreadDmCount > 0 || incomingFriendRequestCount > 0;

  // Avisa o app de desktop (se for o caso — no-op no navegador comum) toda
  // vez que esse total muda, pra ele mostrar/esconder o ponto vermelho no
  // icone da bandeja do sistema, ja que esse e o unico icone visivel quando
  // a janela esta minimizada pra la.
  useEffect(() => {
    setUnreadBadge(hasAnyUnread);
  }, [hasAnyUnread]);

  const value = useMemo(
    () => ({
      isChannelUnread: (channelId: string) => unreadChannelIds.has(channelId),
      isServerUnread: (serverId: string) => unreadServerIds.has(serverId),
      isDmUnread: (dmChannelId: string) => unreadDmIds.has(dmChannelId),
      isServerMuted: (serverId: string) => mutedServerIds.has(serverId),
      isChannelMuted: (channelId: string) =>
        mutedChannelIds.has(channelId) || mutedServerIds.has(serverIdByChannel.get(channelId) ?? ""),
      isDmMuted: (dmChannelId: string) => mutedDmIds.has(dmChannelId),
      setServerMuted,
      setChannelMuted,
      setDmMuted,
      dmActivity,
      friendsEventVersion,
      incomingFriendRequestCount,
      unreadDmCount,
      hasAnyUnread,
    }),
    [
      unreadChannelIds,
      unreadServerIds,
      unreadDmIds,
      mutedServerIds,
      mutedChannelIds,
      mutedDmIds,
      serverIdByChannel,
      dmActivity,
      friendsEventVersion,
      incomingFriendRequestCount,
      unreadDmCount,
      hasAnyUnread,
    ],
  );

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
