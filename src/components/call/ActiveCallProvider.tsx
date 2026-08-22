"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { type PresentUser, useVoiceMesh } from "@/hooks/useVoiceMesh";

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
  toggleShare: () => Promise<void>;
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

    function beat() {
      fetch(`${apiBase}/presence`, { method: "POST" }).catch(() => {});
    }

    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    return () => {
      clearInterval(interval);
      fetch(`${apiBase}/presence`, { method: "DELETE", keepalive: true }).catch(() => {});
    };
  }, [target?.apiBase]);

  const join = useCallback((newTarget: ActiveCallTarget, userId: string) => {
    setCallError(null);
    setPresent([]);
    setLive({ isLive: false, broadcaster: null });
    setCurrentUserId(userId);
    setTarget(newTarget);
  }, []);

  const leave = useCallback(() => {
    if (mesh.isSharingScreen) mesh.stopScreenShare();
    setTarget(null);
    setCallError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh.isSharingScreen]);

  const toggleShare = useCallback(async () => {
    setCallError(null);
    if (mesh.isSharingScreen) {
      mesh.stopScreenShare();
      return;
    }
    if (live.isLive && live.broadcaster?.id !== currentUserId) {
      setCallError("Ja tem alguem compartilhando a tela.");
      return;
    }
    await mesh.startScreenShare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh.isSharingScreen, mesh.startScreenShare, mesh.stopScreenShare, live, currentUserId]);

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
        toggleShare,
        join,
        leave,
      }}
    >
      {children}
    </ActiveCallContext.Provider>
  );
}
