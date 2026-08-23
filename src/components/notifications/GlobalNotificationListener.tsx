"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { type DmActivity, UnreadContext } from "@/components/notifications/UnreadContext";
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

  const [channelMeta, setChannelMeta] = useState<ChannelMeta[]>([]);
  const [dmIds, setDmIds] = useState<string[]>([]);
  const [unreadChannelIds, setUnreadChannelIds] = useState<Set<string>>(new Set());
  const [unreadDmIds, setUnreadDmIds] = useState<Set<string>>(new Set());
  const [dmActivity, setDmActivity] = useState<Map<string, DmActivity>>(new Map());
  const [friendsEventVersion, setFriendsEventVersion] = useState(0);

  // Carrega a lista de canais/DMs + estado inicial de nao lido, uma vez.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch("/api/me/channels")
      .then((r) => r.json())
      .then((data: { channels?: (ChannelMeta & { unread: boolean })[]; dms?: { dmChannelId: string; unread: boolean }[] }) => {
        if (cancelled) return;
        const channels = data.channels ?? [];
        const dms = data.dms ?? [];
        setChannelMeta(channels.map((c) => ({ channelId: c.channelId, serverId: c.serverId })));
        setDmIds(dms.map((d) => d.dmChannelId));
        setUnreadChannelIds(new Set(channels.filter((c) => c.unread).map((c) => c.channelId)));
        setUnreadDmIds(new Set(dms.filter((d) => d.unread).map((d) => d.dmChannelId)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

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

  const serverIdByChannel = useMemo(() => new Map(channelMeta.map((c) => [c.channelId, c.serverId])), [channelMeta]);
  const unreadServerIds = useMemo(() => {
    const set = new Set<string>();
    for (const channelId of unreadChannelIds) {
      const serverId = serverIdByChannel.get(channelId);
      if (serverId) set.add(serverId);
    }
    return set;
  }, [unreadChannelIds, serverIdByChannel]);

  const value = useMemo(
    () => ({
      isChannelUnread: (channelId: string) => unreadChannelIds.has(channelId),
      isServerUnread: (serverId: string) => unreadServerIds.has(serverId),
      isDmUnread: (dmChannelId: string) => unreadDmIds.has(dmChannelId),
      dmActivity,
      friendsEventVersion,
    }),
    [unreadChannelIds, unreadServerIds, unreadDmIds, dmActivity, friendsEventVersion],
  );

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}
