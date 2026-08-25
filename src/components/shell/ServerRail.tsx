"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useUnread } from "@/components/notifications/UnreadContext";
import { GameShareMark } from "@/components/GameShareMark";
import { getLastChannel } from "@/lib/lastChannel";

type ServerSummary = {
  id: string;
  name: string;
  image: string | null;
};

// Mostra quantos pedidos de amizade estao esperando + quantas DMs tem
// mensagem nao lida, direto na barra de servidores — antes esse aviso so
// existia dentro da tela de Amigos/DM (DMSidebar) e so contava pedido de
// amizade, entao dava pra ter uma mensagem nova esperando e nunca saber, se
// a pessoa vivesse dentro de um servidor.
function FriendsBadge() {
  const { incomingFriendRequestCount, unreadDmCount } = useUnread();
  const total = incomingFriendRequestCount + unreadDmCount;
  if (total === 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-rail bg-danger px-0.5 text-[9px] font-bold text-white">
      {total}
    </span>
  );
}

// Aponta direto pro ultimo canal visitado desse servidor quando conhecido
// (localStorage), pulando a pagina de redirecionamento /servers/[id] — so
// cai nela na primeira visita, quando ainda nao sabemos qual canal abrir.
function ServerIconLink({ server, active }: { server: ServerSummary; active: boolean }) {
  const [href, setHref] = useState(`/servers/${server.id}`);
  const { isServerUnread } = useUnread();

  useEffect(() => {
    const lastChannelId = getLastChannel(server.id);
    if (lastChannelId) {
      setHref(`/servers/${server.id}/channels/${lastChannelId}`);
    }
  }, [server.id]);

  return (
    <div className="relative">
      <Link
        href={href}
        prefetch
        title={server.name}
        className={`flex h-12 w-12 items-center justify-center overflow-hidden font-display text-sm font-bold transition-[border-radius] hover:rounded-2xl ${
          active ? "rounded-2xl bg-primary text-white" : "rounded-full bg-elevated text-muted"
        }`}
      >
        {server.image ? (
          <Image src={server.image} alt="" width={48} height={48} unoptimized className="h-full w-full object-cover" />
        ) : (
          initials(server.name)
        )}
      </Link>
      {isServerUnread(server.id) && (
        <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-rail bg-danger" />
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

export function ServerRail({
  servers,
  currentServerId,
  friendsActive = false,
}: {
  servers: ServerSummary[];
  currentServerId?: string;
  friendsActive?: boolean;
}) {
  return (
    <div className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-3">
      <Link
        href="/novidades"
        prefetch
        title="Novidades"
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent"
      >
        <GameShareMark size={24} className="text-white" />
      </Link>

      <div className="relative">
        {friendsActive && <div className="absolute -left-3 top-1 h-10 w-2 rounded-r-md bg-foreground" />}
        <Link
          href="/friends"
          prefetch
          title="Amigos"
          className={`flex h-12 w-12 items-center justify-center transition-[border-radius] hover:rounded-2xl ${
            friendsActive ? "rounded-2xl bg-primary text-white" : "rounded-full bg-elevated text-muted"
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </Link>
        <FriendsBadge />
      </div>

      <div className="my-1 h-px w-8 bg-white/10" />

      {servers.map((server) => {
        const active = server.id === currentServerId;
        return (
          <div key={server.id} className="relative">
            {active && (
              <div className="absolute -left-3 top-1 h-10 w-2 rounded-r-md bg-foreground" />
            )}
            <ServerIconLink server={server} active={active} />
          </div>
        );
      })}

      <Link
        href="/servers/new"
        title="Criar ou entrar em um servidor"
        className="mt-1 flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-border text-accent transition hover:rounded-2xl"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
    </div>
  );
}
