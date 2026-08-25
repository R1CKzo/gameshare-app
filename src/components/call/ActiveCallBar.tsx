"use client";

import { usePathname, useRouter } from "next/navigation";

import { useActiveCall } from "@/components/call/ActiveCallProvider";

// Barra flutuante tipo Discord: some quando voce esta olhando a propria
// tela da chamada (o CallChannel/DMChatView ja mostram os controles la), e
// aparece em qualquer outra rota enquanto a chamada continua ativa por tras
// via ActiveCallProvider.
export function ActiveCallBar() {
  const { target, leave, isMuted, toggleMute, isDeafened, toggleDeafen } = useActiveCall();
  const pathname = usePathname();
  const router = useRouter();

  if (!target) return null;

  const ownPath =
    target.kind === "channel" ? `/servers/${target.serverId}/channels/${target.channelId}` : `/dms/${target.dmChannelId}`;
  if (pathname === ownPath) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-1 rounded-full bg-elevated py-1.5 pl-4 pr-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
      <span className="relative mr-0.5 flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <button onClick={() => router.push(ownPath)} className="max-w-[45vw] truncate text-sm font-semibold text-foreground hover:underline">
        Em chamada — {target.name}
      </button>
      <button
        onClick={toggleMute}
        aria-label={isMuted ? "Ativar microfone" : "Mutar microfone"}
        title={isMuted ? "Ativar microfone" : "Mutar microfone"}
        className={`ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
          isMuted ? "border-transparent bg-danger/15 text-danger" : "border-border text-foreground-secondary hover:bg-elevated-hover"
        }`}
      >
        {isMuted ? <MicOffIcon /> : <MicIcon />}
      </button>
      <button
        onClick={toggleDeafen}
        aria-label={isDeafened ? "Voltar a ouvir a chamada" : "Silenciar chamada (não ouvir ninguém)"}
        title={isDeafened ? "Voltar a ouvir a chamada" : "Silenciar chamada (não ouvir ninguém)"}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
          isDeafened ? "border-transparent bg-danger/15 text-danger" : "border-border text-foreground-secondary hover:bg-elevated-hover"
        }`}
      >
        {isDeafened ? <HeadphoneOffIcon /> : <HeadphoneIcon />}
      </button>
      <button
        onClick={() => leave()}
        aria-label="Sair da chamada"
        title="Sair da chamada"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger text-white transition hover:bg-danger-hover"
      >
        <PhoneOffIcon />
      </button>
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
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

function HeadphoneOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1l22 22" />
      <path d="M3 14v-2a9 9 0 0 1 15.5-6.24M21 12v2" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v3z" />
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
