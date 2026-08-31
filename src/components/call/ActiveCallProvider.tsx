"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { type PresentUser, type RemotePeerTracks, type ScreenShareOptions, useVoiceMesh } from "@/hooks/useVoiceMesh";
import { loadAudioSettings } from "@/lib/audioSettings";
import { isBetaEnabled } from "@/lib/beta";
import { onShortcut } from "@/lib/desktop";
import { getPusherClient } from "@/lib/pusherClient";
import { CALL_KICKED_EVENT, CALL_UPDATE_EVENT, dmChannelPusherName, textChannelPusherName, userPusherName } from "@/lib/pusherShared";
import { playJoinCallSound, playLeaveCallSound } from "@/lib/sound";

export type ActiveCallTarget =
  | { kind: "channel"; channelId: string; serverId: string; apiBase: string; name: string }
  | { kind: "dm"; dmChannelId: string; apiBase: string; name: string };

export type BroadcasterInfo = { id: string; nickname: string | null; userTag: string | null } | null;
export type LiveState = { isLive: boolean; broadcaster: BroadcasterInfo };

const HEARTBEAT_MS = 15000;
// So um reforço agora — quem entra/sai/muta/compartilha avisa na hora
// pelo Pusher (ver o useEffect de inscricao abaixo); esse poll so existe
// pra cobrir o caso do WebSocket cair em silencio, entao pode ser bem
// mais espaçado do que quando era o unico jeito de descobrir uma mudanca.
const POLL_MS = 12000;

type ActiveCallContextValue = {
  target: ActiveCallTarget | null;
  currentUserId: string | null;
  present: PresentUser[];
  live: LiveState;
  localStream: MediaStream | null;
  remoteStreams: Map<string, RemotePeerTracks>;
  isMuted: boolean;
  // false = "Conectando..." (mic ainda inicializando ou handshake de
  // sinalizacao em andamento) -- so vira true depois que a propria
  // presenca foi registrada no servidor com sucesso, o momento em que
  // outras pessoas na sala realmente conseguem ouvir sua voz (ver
  // isConnected em useVoiceMesh.ts).
  isConnected: boolean;
  // "Silenciar geral": para de tocar a voz e a transmissao de todo mundo
  // pra mim (ver ActiveCallAudioSink), sem sair da call. Igual o Discord,
  // tambem muta o microfone de verdade ao ativar -- os outros participantes
  // passam a ver voce como mudo tambem (ver toggleDeafen).
  isDeafened: boolean;
  toggleDeafen: () => void;
  isSharingScreen: boolean;
  // Quem esta compartilhando agora (null se ninguem) -- derivado aqui (em
  // vez de cada tela de canal/DM calcular por conta propria, como era
  // antes) porque o provider tambem precisa saber quando isso MUDA, pra
  // resetar "estou assistindo" sozinho (ver useEffect abaixo).
  sharingUserId: string | null;
  // "Entrar/sair da transmissao": controla so se a faixa de audio/video da
  // transmissao toca pra mim, sem sair da chamada de voz (a voz de todo
  // mundo continua tocando sempre, independente disso -- ver
  // ActiveCallAudioSink). Some sozinho toda vez que sharingUserId muda,
  // entao uma transmissao nova sempre pede permissao de novo.
  isWatchingBroadcast: boolean;
  joinBroadcast: () => void;
  leaveBroadcast: () => void;
  getVolumeFor: (userId: string) => number;
  setVolumeFor: (userId: string, volume: number) => void;
  // Volume da VOZ de cada pessoa (0-200%) e mudo local -- so pra mim, os
  // outros participantes nao percebem nada (ver VoiceUserMenu.tsx).
  getMicVolumeFor: (userId: string) => number;
  setMicVolumeFor: (userId: string, volume: number) => void;
  isLocallyMuted: (userId: string) => boolean;
  toggleLocalMute: (userId: string) => void;
  micError: string | null;
  callError: string | null;
  setCallError: (error: string | null) => void;
  toggleMute: () => void;
  startScreenShare: (options: ScreenShareOptions) => Promise<void>;
  stopScreenShare: () => void;
  join: (target: ActiveCallTarget, currentUserId: string) => void;
  leave: (reason?: string) => void;
};

const DEFAULT_BROADCAST_VOLUME = 100;
const DEFAULT_MIC_VOLUME = 100;
const MAX_MIC_VOLUME = 200;

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
  const [isWatchingBroadcast, setIsWatchingBroadcast] = useState(false);
  const [volumes, setVolumes] = useState<Map<string, number>>(new Map());
  const [isDeafened, setIsDeafened] = useState(false);
  // Volume da VOZ de cada pessoa (0-200%, so pra mim -- os outros nao
  // percebem nada) e quem eu silenciei localmente (idem, so do meu lado).
  // Separado do "volumes" acima, que e so da transmissao de tela.
  const [micVolumes, setMicVolumes] = useState<Map<string, number>>(new Map());
  const [locallyMutedIds, setLocallyMutedIds] = useState<Set<string>>(new Set());

  const mesh = useVoiceMesh({
    apiBase: target?.apiBase ?? "",
    currentUserId: currentUserId ?? "",
    enabled: target !== null,
    present,
  });

  // Ativar "silenciar geral" tambem muta o microfone de verdade (nao so
  // um efeito visual -- por isso os outros participantes passam a ver
  // voce como mudo tambem, do jeito que ja acontece com qualquer mutado
  // normal). Desativar tambem desmuta sozinho, pra voltar exatamente ao
  // estado de antes de silenciar (pedido explicito do dono).
  const isDeafenedRef = useRef(false); // espelha isDeafened pro heartbeat abaixo ler sem closure velha
  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => {
      const next = !prev;
      isDeafenedRef.current = next;
      if (next !== mesh.isMuted) mesh.toggleMute();
      // Avisa na hora (nao espera o proximo heartbeat periodico, que pode
      // demorar ate HEARTBEAT_MS) -- mesma logica do toggleMute em
      // useVoiceMesh, pra quem esta vendo de fora perceber quase na hora.
      const peerId = mesh.getPeerId();
      if (target) {
        fetch(`${target.apiBase}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(peerId ? { peerId } : {}), isDeafened: next }),
        }).catch(() => {});
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh.isMuted, mesh.toggleMute, mesh.getPeerId, target]);

  useEffect(() => {
    if (mesh.micError) setCallError(mesh.micError);
  }, [mesh.micError]);

  const sharingUserId = mesh.isSharingScreen ? currentUserId : live.isLive ? live.broadcaster?.id ?? null : null;

  // Cada transmissao nova (troca de compartilhador, ou ninguem mais
  // compartilhando) pede "entrar" de novo -- sem isso, quem tivesse
  // entrado numa transmissao continuaria ouvindo/vendo a PROXIMA pessoa a
  // compartilhar sem ter escolhido isso.
  useEffect(() => {
    setIsWatchingBroadcast(false);
  }, [sharingUserId]);

  const joinBroadcast = useCallback(() => setIsWatchingBroadcast(true), []);
  const leaveBroadcast = useCallback(() => setIsWatchingBroadcast(false), []);

  const getVolumeFor = useCallback((userId: string) => volumes.get(userId) ?? DEFAULT_BROADCAST_VOLUME, [volumes]);
  const setVolumeFor = useCallback((userId: string, volume: number) => {
    setVolumes((prev) => new Map(prev).set(userId, volume));
  }, []);

  const getMicVolumeFor = useCallback((userId: string) => micVolumes.get(userId) ?? DEFAULT_MIC_VOLUME, [micVolumes]);
  const setMicVolumeFor = useCallback((userId: string, volume: number) => {
    setMicVolumes((prev) => new Map(prev).set(userId, Math.max(0, Math.min(MAX_MIC_VOLUME, volume))));
  }, []);
  const isLocallyMuted = useCallback((userId: string) => locallyMutedIds.has(userId), [locallyMutedIds]);
  const toggleLocalMute = useCallback((userId: string) => {
    setLocallyMutedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

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

    // Entrar/sair/mutar/compartilhar de qualquer outro participante dispara
    // esse evento (ver os endpoints presence/start/stop) — refaz a consulta
    // na hora, em vez de esperar o proximo tick do poll acima.
    const pusher = getPusherClient();
    const pusherChannelName = target.kind === "channel" ? textChannelPusherName(target.channelId) : dmChannelPusherName(target.dmChannelId);
    const channel = pusher.subscribe(pusherChannelName);
    channel.bind(CALL_UPDATE_EVENT, poll);

    return () => {
      cancelled = true;
      clearInterval(interval);
      channel.unbind(CALL_UPDATE_EVENT, poll);
      pusher.unsubscribe(pusherChannelName);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.apiBase]);

  // Batida em voo quando "sair" e clicado — abortada no comeco de leave()
  // ANTES do DELETE ser mandado (ver leave() abaixo). Sem isso, a rede nao
  // garante que o DELETE chega no banco antes de uma batida que ja estava a
  // caminho: se essa batida chegasse DEPOIS do DELETE, o upsert dela
  // recriava a linha de presenca sozinha, deixando a pessoa "fantasma" na
  // sala pros outros mesmo tendo saido de verdade.
  const heartbeatAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!target) return;
    const apiBase = target.apiBase;
    const controller = new AbortController();
    heartbeatAbortRef.current = controller;

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
      // isMuted, isDeafened e connectionQuality vao em toda batida (nao so
      // quando mudam) pra ficar consistente mesmo se um POST imediato
      // falhar por qualquer motivo — mesma logica de resiliencia do peerId
      // acima.
      fetch(`${apiBase}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(peerId ? { peerId } : {}),
          isMuted: mesh.getIsMuted(),
          isDeafened: isDeafenedRef.current,
          connectionQuality: mesh.getConnectionQuality().toUpperCase(),
        }),
        signal: controller.signal,
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
    playJoinCallSound();
  }, []);

  const leave = useCallback(async (reason?: string) => {
    if (mesh.isSharingScreen) mesh.stopScreenShare();
    // Cancela qualquer heartbeat ou mudanca de mudo que ja estava a
    // caminho ANTES de mandar o DELETE — a rede nao garante ordem entre
    // duas requisicoes distintas, entao sem isso uma dessas escritas podia
    // chegar DEPOIS do DELETE e recriar a linha de presenca sozinha (ver o
    // comentario em heartbeatAbortRef acima).
    heartbeatAbortRef.current?.abort();
    mesh.abortPendingWrites();
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
    // "reason" e como leave() avisa por que saiu sem ser por escolha
    // propria (ex: expulso por um moderador — ver o useEffect de
    // CALL_KICKED_EVENT abaixo). Um "sair" normal nao passa nada, e limpa
    // qualquer erro antigo do jeito que sempre fez.
    setCallError(reason ?? null);
    setIsDeafened(false);
    isDeafenedRef.current = false;
    playLeaveCallSound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh.isSharingScreen, mesh.abortPendingWrites, target]);

  // Se um moderador me expulsar dessa chamada (ver POST
  // /api/channels/[channelId]/kick), o servidor ja apaga minha presenca no
  // banco -- isso aqui e so o que faz o MEU proprio client perceber e sair
  // de verdade (desligar microfone, fechar a malha), em vez de continuar
  // conectado achando que ainda esta na sala. So se aplica a canais de
  // servidor (DM nao tem "expulsar", so 2 pessoas).
  useEffect(() => {
    if (!target || target.kind !== "channel" || !currentUserId) return;
    const channelId = target.channelId;
    const pusher = getPusherClient();
    const name = userPusherName(currentUserId);
    const channel = pusher.subscribe(name);
    const handler = (data: { channelId?: string }) => {
      if (data?.channelId !== channelId) return;
      leave("Você foi removido da chamada por um moderador.");
    };
    channel.bind(CALL_KICKED_EVENT, handler);
    return () => {
      channel.unbind(CALL_KICKED_EVENT, handler);
      pusher.unsubscribe(name);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, currentUserId]);

  // Atalhos globais (Configuracoes > Atalhos, beta) -- funcionam mesmo
  // com outra janela (ex: um jogo) em foco, ver registerGlobalShortcuts
  // em desktop/main.js. So assina enquanto estiver numa chamada de
  // verdade (target != null) -- sem call ativa, mutar/silenciar/sair nao
  // significam nada.
  useEffect(() => {
    if (!target || !isBetaEnabled()) return;
    const offMute = onShortcut("mute-toggle", () => mesh.toggleMute());
    const offDeafen = onShortcut("deafen-toggle", () => toggleDeafen());
    const offLeave = onShortcut("leave-call", () => leave());
    return () => {
      offMute();
      offDeafen();
      offLeave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, mesh.toggleMute, toggleDeafen, leave]);

  // Push-to-talk (beta, app de desktop) -- so entra em cena se a pessoa
  // ligou a opcao em Configuracoes > Audio (ver PushToTalkEnabled em
  // audioSettings.ts). Ao contrario do mute normal, nao mexe em isMuted
  // nem avisa a malha via /presence, ver comentario de
  // setPushToTalkActive em useVoiceMesh.ts.
  useEffect(() => {
    if (!target || !isBetaEnabled() || !loadAudioSettings().pushToTalkEnabled) return;
    const offDown = onShortcut("ptt-down", () => mesh.setPushToTalkActive(true));
    const offUp = onShortcut("ptt-up", () => mesh.setPushToTalkActive(false));
    return () => {
      offDown();
      offUp();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, mesh.setPushToTalkActive]);


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
        isConnected: mesh.isConnected,
        isDeafened,
        toggleDeafen,
        isSharingScreen: mesh.isSharingScreen,
        sharingUserId,
        isWatchingBroadcast,
        joinBroadcast,
        leaveBroadcast,
        getVolumeFor,
        setVolumeFor,
        getMicVolumeFor,
        setMicVolumeFor,
        isLocallyMuted,
        toggleLocalMute,
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
