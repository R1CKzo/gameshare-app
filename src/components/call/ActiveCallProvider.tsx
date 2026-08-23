"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { type PresentUser, type ScreenShareOptions, useVoiceMesh } from "@/hooks/useVoiceMesh";

export type ActiveCallTarget =
  | { kind: "channel"; channelId: string; serverId: string; apiBase: string; name: string }
  | { kind: "dm"; dmChannelId: string; apiBase: string; name: string };

export type BroadcasterInfo = { id: string; nickname: string | null; userTag: string | null } | null;
export type LiveState = { isLive: boolean; broadcaster: BroadcasterInfo };

const HEARTBEAT_MS = 15000;
const POLL_MS = 4000;

type ActiveCallContextValue = {
  target: ActiveCallTarget | null;
  currentUserId: string | null;
  present: PresentUser[];
  live: LiveState;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isMuted: boolean;
  isSharingScreen: boolean;
  micError: string | null;
  callError: string | null;
  setCallError: (error: string | null) => void;
  toggleMute: () => void;
  startScreenShare: (options: ScreenShareOptions) => Promise<void>;
  stopScreenShare: () => void;
  join: (target: ActiveCallTarget, currentUserId: string) => void;
  leave: () => void;
};

const ActiveCallContext = createContext<ActiveCallContextValue | null>(null);

export function useActiveCall() {
  const ctx = useContext(ActiveCallContext);
  if (!ctx) throw new Error("useActiveCall precisa estar dentro de ActiveCallProvider");
  return ctx;
}

// O estado da chamada ativa (malha de voz, presenca, heartbeat) mora aqui,
// no provider da raiz — nao dentro da pagina do canal/DM. Como so existe
// layout.tsx na raiz (cada rota e um page.tsx que remonta do zero), manter
// esse estado dentro de CallChannel/DMChatView significava que trocar de
// servidor/canal/amigos derrubava a chamada junto, igual a desligar. Aqui
// ele sobrevive a navegacao; so um "leave" explicito encerra de verdade.
export function ActiveCallProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<ActiveCallTarget | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [present, setPresent] = useState<PresentUser[]>([]);
  const [live, setLive] = useState<LiveState>({ isLive: false, broadcaster: null });
  const [callError, setCallError] = useState<string | null>(null);

  const mesh = useVoiceMesh({
    apiBase: target?.apiBase ?? "",
    currentUserId: currentUserId ?? "",
    enabled: target !== null,
    present,
  });

  useEffect(() => {
    if (mesh.micError) setCallError(mesh.micError);
  }, [mesh.micError]);

  useEffect(() => {
    if (!target) return;
    const apiBase = target.apiBase;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(apiBase, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setLive({ isLive: data.isLive, broadcaster: data.broadcaster });
        setPresent(data.present ?? []);
      } catch {
        // ignora falhas transitorias de rede
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [target?.apiBase]);

  useEffect(() => {
    if (!target) return;
    const apiBase = target.apiBase;

    // Reenvia o peerId atual em toda batida (nao so quando o peer abre pela
    // primeira vez) — se a linha de presenca ficar sem peerId por qualquer
    // motivo (ex: uma corrida numa reentrada rapida), a proxima batida
    // conserta sozinha em ate HEARTBEAT_MS, em vez de ficar muda pra
    // sempre. O DELETE de "sair" agora mora em leave() (aguardado antes de
    // liberar o botao de entrar de novo), entao esse cleanup so cancela o
    // intervalo — nao manda mais um DELETE por conta propria, o que evitava
    // exatamente essa corrida quando alguem reentrava rapido.
    function beat() {
      const peerId = mesh.getPeerId();
      fetch(`${apiBase}/presence`, {
        method: "POST",
        headers: peerId ? { "Content-Type": "application/json" } : undefined,
        body: peerId ? JSON.stringify({ peerId }) : undefined,
      }).catch(() => {});
    }

    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    return () => {
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.apiBase]);

  const join = useCallback((newTarget: ActiveCallTarget, userId: string) => {
    setCallError(null);
    setPresent([]);
    setLive({ isLive: false, broadcaster: null });
    setCurrentUserId(userId);
    setTarget(newTarget);
  }, []);

  const leave = useCallback(async () => {
    if (mesh.isSharingScreen) mesh.stopScreenShare();
    // Espera o DELETE terminar antes de liberar o botao de entrar de novo
    // (setTarget(null) e o que faz "joined" virar false) — sem isso, uma
    // reentrada rapida podia mandar o POST do peerId novo ANTES desse
    // DELETE chegar no banco, que ai apagava a linha recem-criada e
    // deixava a chamada muda pros dois lados ate um F5.
    if (target) {
      try {
        await fetch(`${target.apiBase}/presence`, { method: "DELETE", keepalive: true });
      } catch {
        // segue o baile mesmo se a rede falhar — a linha expira sozinha
      }
    }
    setTarget(null);
    setCallError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh.isSharingScreen, target]);

  const startScreenShare = useCallback(
    async (options: ScreenShareOptions) => {
      setCallError(null);
      if (live.isLive && live.broadcaster?.id !== currentUserId) {
        setCallError("Já tem alguém compartilhando a tela.");
        return;
      }
      await mesh.startScreenShare(options);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mesh.startScreenShare, live, currentUserId],
  );

  const stopScreenShare = useCallback(() => {
    mesh.stopScreenShare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh.stopScreenShare]);

  return (
    <ActiveCallContext.Provider
      value={{
        target,
        currentUserId,
        present,
        live,
        localStream: mesh.localStream,
        remoteStreams: mesh.remoteStreams,
        isMuted: mesh.isMuted,
        isSharingScreen: mesh.isSharingScreen,
        micError: mesh.micError,
        callError,
        setCallError,
        toggleMute: mesh.toggleMute,
        startScreenShare,
        stopScreenShare,
        join,
        leave,
      }}
    >
      {children}
    </ActiveCallContext.Provider>
  );
}
