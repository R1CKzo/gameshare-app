"use client";

import { usePathname, useRouter } from "next/navigation";

import { useActiveCall } from "@/components/call/ActiveCallProvider";

// Barra flutuante tipo Discord: some quando voce esta olhando a propria
// tela da chamada (o CallChannel/DMChatView ja mostram os controles la), e
// aparece em qualquer outra rota enquanto a chamada continua ativa por tras
// via ActiveCallProvider. So o indicador "em que sala estou, clique pra
// voltar" -- mic/fone/desligar moraram pra UserPill (barra lateral, sempre
// visivel, igual o Discord), pra nao duplicar os mesmos controles em dois
// lugares diferentes da tela.
export function ActiveCallBar() {
  const { target, isConnected } = useActiveCall();
  const pathname = usePathname();
  const router = useRouter();

  if (!target) return null;

  const ownPath =
    target.kind === "channel" ? `/servers/${target.serverId}/channels/${target.channelId}` : `/dms/${target.dmChannelId}`;
  if (pathname === ownPath) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-elevated py-1.5 pl-3 pr-4 shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
      <span className="relative mr-0.5 flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <button onClick={() => router.push(ownPath)} className="max-w-[45vw] truncate text-sm font-semibold text-foreground hover:underline">
        {isConnected ? "Em chamada" : "Conectando..."} — {target.name}
      </button>
    </div>
  );
}
