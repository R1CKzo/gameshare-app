"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { usePresence } from "@/components/notifications/PresenceProvider";
import { MoreMenu } from "@/components/shell/MoreMenu";
import { SettingsButton } from "@/components/shell/SettingsButton";
import { StatusMenu } from "@/components/shell/StatusMenu";
import { isBetaEnabled } from "@/lib/beta";
import { getAppVersion } from "@/lib/desktop";

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

  // Mostra o selo "BETA" quando a build instalada veio do programa beta
  // (versao do instalador do desktop) OU quando o interruptor "Permitir
  // versoes beta" (Configuracoes > Beta) esta ligado nesse navegador --
  // esse segundo caso libera funcoes novas so do site (ver isBetaEnabled),
  // sem precisar de instalador nenhum, entao precisa do proprio aviso.
  const [isBeta, setIsBeta] = useState(false);
  useEffect(() => {
    if (isBetaEnabled()) {
      setIsBeta(true);
      return;
    }
    getAppVersion().then((version) => setIsBeta(version.includes("beta")));
  }, []);

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
        <div className="flex items-center gap-1.5">
          <div title={label} className="truncate text-[13.5px] font-bold leading-tight text-foreground">
            {label}
          </div>
          {isBeta && (
            <span className="shrink-0 rounded bg-accent px-1 py-px text-[9px] font-bold leading-tight text-background">
              BETA
            </span>
          )}
        </div>
        <div className="truncate text-[11px] font-medium leading-tight text-muted">#{user.userTag}</div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <SettingsButton />
        <MoreMenu isAdmin={session?.user?.isAdmin ?? false} serverId={serverId} isServerOwner={isServerOwner} />
      </div>
    </div>
  );
}
