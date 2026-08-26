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
import { checkForPatch, downloadAndInstallPatch, getAppVersion, syncBetaTitlebarFlag } from "@/lib/desktop";

// Confere se saiu uma correcao nova pra MESMA versao ja instalada (ver
// checkForPatch em desktop.ts) a cada meia hora -- nao precisa ser mais
// frequente, e uma correcao pequena, nao uma emergencia.
const PATCH_CHECK_MS = 30 * 60 * 1000;

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
      const enabled = isBetaEnabled();
      setIsBeta(enabled);
      // Mantem o arquivo que o processo principal le no boot sempre em dia
      // com o interruptor de verdade (localStorage) -- sem isso, ligar o
      // beta sem nunca reabrir a aba de Configuracoes deixaria a barra de
      // titulo customizada (ver DesktopTitleBar.tsx) sem saber disso.
      syncBetaTitlebarFlag(enabled);
    });
  }, []);

  // Correcao disponivel pra MESMA versao ja instalada (sem bump de
  // versao nenhum -- ver checkForPatch em desktop.ts). No navegador
  // comum isso nunca fica disponivel (o site ja atualiza sozinho, na
  // hora), entao o icone so aparece mesmo no app de desktop.
  const [patchDownloadUrl, setPatchDownloadUrl] = useState<string | null>(null);
  const [installingPatch, setInstallingPatch] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    function check() {
      checkForPatch().then((result) => {
        if (cancelled) return;
        setPatchDownloadUrl(result.available ? result.downloadUrl : null);
      });
    }
    check();
    const interval = setInterval(check, PATCH_CHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function handleInstallPatch() {
    if (!patchDownloadUrl || installingPatch) return;
    setInstallingPatch(true);
    setPatchError(null);
    const result = await downloadAndInstallPatch();
    if (!result.ok) {
      setPatchError(result.error);
      setInstallingPatch(false);
    }
    // Se deu certo o app fecha sozinho em seguida (ver
    // downloadAndInstallPatch) -- nao precisa desligar o "instalando".
  }

  return (
    <div className="shrink-0 border-t border-overlay bg-black/20 p-2">
      <div className="flex items-center gap-2 rounded-xl bg-elevated/70 px-2 py-1.5">
        <StatusMenu status={effectiveStatus}>
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={32}
              height={32}
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
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-display text-[12px] font-bold ring-1 ring-overlay-strong">
              {label.slice(0, 2).toUpperCase()}
            </div>
          )}
        </StatusMenu>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div title={label} className="truncate text-[13px] font-bold leading-tight text-foreground">
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

        {/* So aparece com uma chamada ativa (em qualquer tela do app, nao
            so na propria tela do canal/DM -- ver ActiveCallProvider) --
            controla mic/fone/desligar direto daqui, igual o Discord, sem
            precisar voltar pra tela da chamada. */}
        {target && (
          <div className="flex shrink-0 items-center gap-0.5">
            <PillIconButton
              onClick={toggleMute}
              label={isMuted ? "Ativar microfone" : "Mutar microfone"}
              active={isMuted}
            >
              {isMuted ? <MicOffIcon /> : <MicIcon />}
            </PillIconButton>
            <PillIconButton
              onClick={toggleDeafen}
              label={isDeafened ? "Voltar a ouvir a chamada" : "Silenciar chamada (não ouvir ninguém)"}
              active={isDeafened}
            >
              {isDeafened ? <HeadphoneOffIcon /> : <HeadphoneIcon />}
            </PillIconButton>
            <PillIconButton onClick={() => leave()} label="Sair da chamada" active danger>
              <PhoneOffIcon />
            </PillIconButton>
          </div>
        )}

        {/* Mais/atualizacao cabem na lista de coisas que podem esperar a
            call acabar -- com os 3 botoes de chamada + nome + avatar +
            Configuracoes, nao sobra espaco pra ISSO tambem na barra
            lateral estreita (252px) sem cortar o nome. O wrapper deixa
            isso estrutural, nao so um comentario: qualquer botao que
            precise continuar acessivel DURANTE uma chamada (como
            Configuracoes, ver bug relatado pelo dono) tem que ficar FORA
            dele, nunca colado aqui dentro. */}
        <HiddenDuringCall hidden={Boolean(target)}>
          <div className="flex shrink-0 items-center gap-0.5">
            {patchDownloadUrl && (
              <button
                onClick={handleInstallPatch}
                disabled={installingPatch}
                aria-label={patchError ?? (installingPatch ? "Baixando atualização…" : "Atualização disponível — clique pra baixar")}
                title={patchError ?? (installingPatch ? "Baixando atualização…" : "Atualização disponível — clique pra baixar")}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition ${
                  patchError ? "text-danger" : "text-accent hover:bg-elevated-hover"
                } ${installingPatch ? "animate-pulse" : ""}`}
              >
                <DownloadIcon />
              </button>
            )}
            <MoreMenu isAdmin={session?.user?.isAdmin ?? false} serverId={serverId} isServerOwner={isServerOwner} />
          </div>
        </HiddenDuringCall>
        <SettingsButton />
      </div>
    </div>
  );
}

// So mostra os filhos fora de uma chamada ativa -- existe como componente
// (em vez de so `{!target && (...)}` inline) pra deixar explicito, pelo
// nome, que nada essencial pode entrar aqui dentro sem pensar duas vezes.
function HiddenDuringCall({ hidden, children }: { hidden: boolean; children: React.ReactNode }) {
  if (hidden) return null;
  return <>{children}</>;
}

// Botao circular compacto pros controles de chamada dentro do pill --
// mesma altura/estilo do gear/kebab ao lado, so redondo em vez de
// quadrado (mais "moderno e arredondado", igual o Discord).
function PillIconButton({
  onClick,
  label,
  active,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
        active
          ? danger
            ? "text-danger hover:bg-danger/15"
            : "bg-danger/15 text-danger"
          : "text-muted hover:bg-elevated-hover hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
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

// So o telefone, sem nenhuma risca por cima -- a cor vermelha (ver o
// "danger" no PillIconButton que usa esse icone) ja deixa claro que e
// "desligar", sem precisar do corte no meio.
function PhoneOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
