"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";

import { usePresence } from "@/components/notifications/PresenceProvider";
import { ChannelBadge } from "@/components/shell/ChannelBadge";
import { MoreMenu } from "@/components/shell/MoreMenu";
import { SettingsButton } from "@/components/shell/SettingsButton";
import { StatusMenu } from "@/components/shell/StatusMenu";

export function UserPill({
  user,
  serverId,
  isServerOwner,
}: {
  user: { nickname: string | null; userTag: string | null; image: string | null };
  serverId?: string;
  isServerOwner?: boolean;
}) {
  const { data: session } = useSession();
  const { effectiveStatus } = usePresence();
  const label = user.nickname ?? "Alguem";

  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 border-t border-overlay bg-black/20 px-3">
      <StatusMenu status={effectiveStatus}>
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={36}
            height={36}
            // O otimizador de imagem do Next busca a URL pelo proprio
            // servidor, sem os cookies do navegador — /api/me/avatar exige
            // sessao (ver src/lib/avatarUrl.ts), entao sem isso ele leva
            // 401 e a foto quebra. unoptimized faz o navegador buscar
            // direto, com a sessao de verdade. priority evita o lazy-load
            // padrao (fica sempre visivel na tela, nao precisa esperar
            // entrar em cena pra carregar).
            unoptimized
            priority
            className="rounded-full ring-1 ring-overlay-strong"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-display text-[13px] font-bold ring-1 ring-overlay-strong">
            {label.slice(0, 2).toUpperCase()}
          </div>
        )}
      </StatusMenu>

      <div className="min-w-0 flex-1">
        <div title={label} className="truncate text-[13.5px] font-bold leading-tight text-foreground">
          {label}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[11px] font-medium leading-tight text-muted">#{user.userTag}</span>
          <ChannelBadge />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <SettingsButton />
        <MoreMenu isAdmin={session?.user?.isAdmin ?? false} serverId={serverId} isServerOwner={isServerOwner} />
      </div>
    </div>
  );
}
