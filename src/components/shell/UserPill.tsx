"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { useActiveCall } from "@/components/call/ActiveCallProvider";
import { usePresence } from "@/components/notifications/PresenceProvider";
import { MoreMenu } from "@/components/shell/MoreMenu";
import { SettingsButton } from "@/components/shell/SettingsButton";
import { StatusMenu } from "@/components/shell/StatusMenu";
import { isBetaEnabled, resetBetaIfStableVersionChanged } from "@/lib/beta";
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
  const { target, isMuted, toggleMute, isDeafened, toggleDeafen, leave } = useActiveCall();
  const label = user.nickname ?? "Alguem";

  // Mostra o selo "BETA" so quando o interruptor "Permitir versoes beta"
  // (Configuracoes > Beta) esta ligado nesse navegador -- nao quando a
  // build instalada por si so e uma versao beta (a pessoa pode ter
  // desligado o interruptor depois de instalar uma). Antes de ler o
  // interruptor, confere se essa e uma versao estavel diferente da ultima
  // vista -- se for, desliga ele sozinho (ver resetBetaIfStableVersionChanged),
  // pra ninguem continuar "preso" em beta so porque uma vez ativou pra
  // testar algo que ja virou oficial.
  const [isBeta, setIsBeta] = useState(false);
  useEffect(() => {
    getAppVersion().then((version) => {
      resetBetaIfStableVersionChanged(version);
      setIsBeta(isBetaEnabled());
    });
  }, []);

  return (
    <div className="flex shrink-0 flex-col border-t border-overlay bg-black/20">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-3">
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

      {/* So aparece com uma chamada ativa (em qualquer tela do app, nao so
          na propria tela do canal/DM -- ver ActiveCallProvider) -- controla
          mic/fone/desligar direto daqui, igual o Discord, sem precisar
          voltar pra tela da chamada. */}
      {target && (
        <div className="flex items-center justify-center gap-1.5 border-t border-overlay/60 px-3 py-2">
          <button
            onClick={toggleMute}
            aria-label={isMuted ? "Ativar microfone" : "Mutar microfone"}
            title={isMuted ? "Ativar microfone" : "Mutar microfone"}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition ${
              isMuted ? "bg-danger/15 text-danger" : "text-muted hover:bg-elevated-hover hover:text-foreground"
            }`}
          >
            {isMuted ? <MicOffIcon /> : <MicIcon />}
          </button>
          <button
            onClick={toggleDeafen}
            aria-label={isDeafened ? "Voltar a ouvir a chamada" : "Silenciar chamada (não ouvir ninguém)"}
            title={isDeafened ? "Voltar a ouvir a chamada" : "Silenciar chamada (não ouvir ninguém)"}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition ${
              isDeafened ? "bg-danger/15 text-danger" : "text-muted hover:bg-elevated-hover hover:text-foreground"
            }`}
          >
            {isDeafened ? <HeadphoneOffIcon /> : <HeadphoneIcon />}
          </button>
          <button
            onClick={() => leave()}
            aria-label="Sair da chamada"
            title="Sair da chamada"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/15 hover:text-danger"
          >
            <PhoneOffIcon />
          </button>
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v4M8 23h8" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1l22 22" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.11 1.23" />
      <path d="M12 19v4M8 23h8" />
    </svg>
  );
}

function HeadphoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

function HeadphoneOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.86.31 1.77.53 2.7.64A2 2 0 0 1 22 17.72V20a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h2.28a2 2 0 0 1 2 1.72c.11.93.33 1.84.64 2.7a2 2 0 0 1-.45 2.11L7.31 9.68" />
      <path d="M23 1L1 23" />
    </svg>
  );
}
