import type { MediaConnection, default as Peer } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { getMicConstraints, loadAudioSettings, sensitivityToGateThreshold } from "@/lib/audioSettings";
import { createBlankVideoTrack, createPeer } from "@/lib/peer";

// Gate de ruido: deixa a faixa do microfone passar direto quando o volume
// esta acima do limiar (a pessoa esta falando) e silencia quando esta
// abaixo (ruido de fundo, ronco de ventilador, e principalmente o inicio de
// um loop de eco/feedback antes dele conseguir crescer).
//
// Roda num AudioWorklet (public/noise-gate-worklet.js) — thread de audio
// dedicada, separada da thread principal do React. A primeira versao usava
// ScriptProcessorNode (thread principal) com coeficientes de ataque/
// liberacao calibrados errado (convergiam em menos de 1ms), o que gerava
// estalos audiveis toda vez que o gate abria/fechava — exatamente o "audio
// repetindo" que apareceu nos testes reais.
async function createNoiseGate(audioContext: AudioContext, micStream: MediaStream, threshold: number) {
  await audioContext.audioWorklet.addModule("/noise-gate-worklet.js");
  const source = audioContext.createMediaStreamSource(micStream);
  const gateNode = new AudioWorkletNode(audioContext, "noise-gate-processor", {
    processorOptions: { threshold },
  });
  const destination = audioContext.createMediaStreamDestination();

  source.connect(gateNode);
  gateNode.connect(destination);
  return { track: destination.stream.getAudioTracks()[0], node: gateNode, source };
}

export type PresentUser = {
  id: string;
  nickname: string | null;
  userTag: string | null;
  image: string | null;
  peerId: string | null;
};

export type ScreenShareOptions = {
  sourceId: string;
  sourceType: "screen" | "window";
  fps: number;
  width: number;
  height: number;
};

// Constraints "legado" do Chromium (chromeMediaSource/chromeMediaSourceId)
// pra capturar exatamente a fonte escolhida no seletor nativo do Electron
// (desktopCapturer), com FPS/resolucao exatos — o TypeScript padrao nao
// conhece esse formato, so existe em Electron/Chromium.
type ElectronDesktopConstraints = MediaStreamConstraints & {
  audio?: boolean | { mandatory: { chromeMediaSource: "desktop" } };
  video?: {
    mandatory: {
      chromeMediaSource: "desktop";
      chromeMediaSourceId: string;
      minFrameRate: number;
      maxFrameRate: number;
      minWidth: number;
      maxWidth: number;
      minHeight: number;
      maxHeight: number;
    };
  };
};

// Video sempre vem da fonte escolhida no seletor nativo. Audio do sistema
// (loopback) so e pedido quando a fonte e a tela inteira — Windows nao tem
// como capturar o audio de uma janela/app especifico sozinho por essa API,
// entao compartilhar so um app fica so com o video (+ o microfone, que ja
// vai sempre junto por fora, misturado depois).
async function captureDesktopSource(options: ScreenShareOptions): Promise<MediaStream> {
  const constraints: ElectronDesktopConstraints = {
    audio:
      options.sourceType === "screen"
        ? { mandatory: { chromeMediaSource: "desktop" } }
        : false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: options.sourceId,
        minFrameRate: options.fps,
        maxFrameRate: options.fps,
        minWidth: options.width,
        maxWidth: options.width,
        minHeight: options.height,
        maxHeight: options.height,
      },
    },
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch {
    if (options.sourceType !== "screen") throw new Error("Nao foi possivel capturar a janela escolhida.");
    // Alguns PCs nao tem um dispositivo de saida padrao reconhecido pelo
    // loopback de audio do Windows — cai pra so o video em vez de falhar o
    // compartilhamento inteiro.
    return navigator.mediaDevices.getUserMedia({ audio: false, video: constraints.video });
  }
}

// Malha de voz: cada participante presente na sala mantem uma conexao de
// midia PeerJS direta com todo mundo (audio do microfone sempre, + video
// "em branco" reservando espaco pra, quando alguem ligar o compartilhamento
// de tela, trocar so a faixa de video via replaceTrack — sem renegociar
// nada). Pra nunca duplicar a conexao entre duas pessoas, quem tem o
// userId menor (ordem alfabetica) e sempre quem liga.
export function useVoiceMesh({
  apiBase,
  currentUserId,
  enabled,
  present,
}: {
  // Prefixo da API pra essa sala de chamada: "/api/channels/<id>" pra um
  // canal de servidor, ou "/api/dms/<id>" pra uma conversa direta — o
  // hook so acrescenta "/presence", "/start", "/stop" em cima disso, o
  // resto e identico nos dois casos.
  apiBase: string;
  currentUserId: string;
  enabled: boolean;
  present: PresentUser[];
}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null); // faixa de mic ja processada pelo gate de ruido
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null); // faixa de audio atual enviada (mic puro ou mic+sistema misturado)
  const outgoingStreamRef = useRef<MediaStream | null>(null);
  const micProcessingRef = useRef<{ audioContext: AudioContext; rawStream: MediaStream } | null>(null);
  const connectionsRef = useRef<Map<string, MediaConnection>>(new Map()); // peerId -> conexao
  const shareMixRef = useRef<{ audioContext: AudioContext; displayStream: MediaStream } | null>(null);
  const presentRef = useRef<PresentUser[]>(present);
  presentRef.current = present;

  function registerConnection(peerId: string, call: MediaConnection) {
    connectionsRef.current.set(peerId, call);
    call.on("stream", (stream) => {
      setRemoteStreams((prev) => new Map(prev).set(peerId, stream));
    });
    const drop = () => {
      connectionsRef.current.delete(peerId);
      setRemoteStreams((prev) => {
        if (!prev.has(peerId)) return prev;
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
    };
    call.on("close", drop);
    call.on("error", drop);
  }

  // Setup: pega o microfone, abre o peer local e comeca a mandar heartbeat
  // com o peerId pra galera conseguir me achar na malha.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function setup() {
      try {
        const settings = loadAudioSettings();
        const rawStream = await navigator.mediaDevices.getUserMedia({ audio: getMicConstraints(settings) });
        if (cancelled) {
          rawStream.getTracks().forEach((t) => t.stop());
          return;
        }

        const audioContext = new AudioContext();
        const threshold = sensitivityToGateThreshold(settings.sensitivity);
        const gate = await createNoiseGate(audioContext, rawStream, threshold);
        if (cancelled) {
          rawStream.getTracks().forEach((t) => t.stop());
          audioContext.close().catch(() => {});
          return;
        }
        micProcessingRef.current = { audioContext, rawStream };

        const micTrack = gate.track;
        micTrackRef.current = micTrack;
        audioTrackRef.current = micTrack;

        const videoTrack = createBlankVideoTrack();
        videoTrackRef.current = videoTrack;

        const outgoing = new MediaStream([micTrack, videoTrack]);
        outgoingStreamRef.current = outgoing;
        setLocalStream(outgoing);

        const peer = await createPeer();
        if (cancelled) {
          peer.destroy();
          return;
        }
        peerRef.current = peer;

        peer.on("open", (peerId) => {
          fetch(`${apiBase}/presence`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ peerId }),
          }).catch(() => {});
        });

        peer.on("call", (call) => {
          call.answer(outgoingStreamRef.current ?? undefined);
          registerConnection(call.peer, call);
        });

        peer.on("error", (err) => {
          if (err.type !== "peer-unavailable") setMicError("Erro de conexao WebRTC: " + err.type);
        });
      } catch {
        if (!cancelled) setMicError("Nao foi possivel acessar o microfone.");
      }
    }

    setup();

    return () => {
      cancelled = true;
      connectionsRef.current.forEach((c) => c.close());
      connectionsRef.current.clear();
      setRemoteStreams(new Map());
      peerRef.current?.destroy();
      peerRef.current = null;
      outgoingStreamRef.current?.getTracks().forEach((t) => t.stop());
      outgoingStreamRef.current = null;
      micTrackRef.current = null;
      videoTrackRef.current = null;
      audioTrackRef.current = null;
      if (micProcessingRef.current) {
        micProcessingRef.current.rawStream.getTracks().forEach((t) => t.stop());
        micProcessingRef.current.audioContext.close().catch(() => {});
        micProcessingRef.current = null;
      }
      if (shareMixRef.current) {
        shareMixRef.current.audioContext.close().catch(() => {});
        shareMixRef.current.displayStream.getTracks().forEach((t) => t.stop());
        shareMixRef.current = null;
      }
      setLocalStream(null);
      setIsMuted(false);
      setIsSharingScreen(false);
      setMicError(null);
    };
  }, [enabled, apiBase]);

  // Reconciliacao: liga pra quem esta presente e ainda nao tem conexao
  // aberta, fecha quem saiu da sala. Roda de novo a cada poll de presenca,
  // mas so age nas diferencas (idempotente).
  useEffect(() => {
    if (!enabled) return;
    const peer = peerRef.current;
    if (!peer || peer.disconnected) return;

    const stillHerePeerIds = new Set(present.map((u) => u.peerId).filter(Boolean) as string[]);
    connectionsRef.current.forEach((call, peerId) => {
      if (!stillHerePeerIds.has(peerId)) {
        call.close();
        connectionsRef.current.delete(peerId);
        setRemoteStreams((prev) => {
          if (!prev.has(peerId)) return prev;
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        });
      }
    });

    const outgoing = outgoingStreamRef.current;
    if (!outgoing) return;

    for (const user of present) {
      if (user.id === currentUserId || !user.peerId) continue;
      if (connectionsRef.current.has(user.peerId)) continue;
      if (currentUserId < user.id) {
        const call = peer.call(user.peerId, outgoing);
        if (call) registerConnection(user.peerId, call);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, present, currentUserId]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (micTrackRef.current) micTrackRef.current.enabled = !next;
      return next;
    });
  }, []);

  function replaceOutgoingTracks(video: MediaStreamTrack, audio: MediaStreamTrack) {
    connectionsRef.current.forEach((call) => {
      const pc = call.peerConnection;
      if (!pc) return;
      pc.getSenders().forEach((sender) => {
        if (sender.track?.kind === "video") sender.replaceTrack(video).catch(() => {});
        if (sender.track?.kind === "audio") sender.replaceTrack(audio).catch(() => {});
      });
    });
    videoTrackRef.current = video;
    audioTrackRef.current = audio;
    if (outgoingStreamRef.current) {
      outgoingStreamRef.current.getTracks().forEach((t) => outgoingStreamRef.current!.removeTrack(t));
      outgoingStreamRef.current.addTrack(audio);
      outgoingStreamRef.current.addTrack(video);
      setLocalStream(new MediaStream(outgoingStreamRef.current.getTracks()));
    }
  }

  const stopScreenShare = useCallback(() => {
    if (!shareMixRef.current) return;
    const blankVideo = createBlankVideoTrack();
    if (micTrackRef.current) {
      replaceOutgoingTracks(blankVideo, micTrackRef.current);
    }
    shareMixRef.current.audioContext.close().catch(() => {});
    shareMixRef.current.displayStream.getTracks().forEach((t) => t.stop());
    shareMixRef.current = null;
    setIsSharingScreen(false);
    fetch(`${apiBase}/stop`, { method: "POST" }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const startScreenShare = useCallback(async (options: ScreenShareOptions) => {
    if (!micTrackRef.current) return;
    try {
      const displayStream = await captureDesktopSource(options);
      const displayVideoTrack = displayStream.getVideoTracks()[0];
      const displayAudioTracks = displayStream.getAudioTracks();

      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(new MediaStream([micTrackRef.current])).connect(destination);
      if (displayAudioTracks.length > 0) {
        audioContext.createMediaStreamSource(new MediaStream(displayAudioTracks)).connect(destination);
      }
      const mixedAudioTrack = destination.stream.getAudioTracks()[0];

      shareMixRef.current = { audioContext, displayStream };
      displayVideoTrack.addEventListener("ended", stopScreenShare);

      replaceOutgoingTracks(displayVideoTrack, mixedAudioTrack);
      setIsSharingScreen(true);

      const res = await fetch(`${apiBase}/start`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      setMicError("Nao foi possivel compartilhar a tela.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, stopScreenShare]);

  return {
    localStream,
    remoteStreams,
    isMuted,
    toggleMute,
    isSharingScreen,
    startScreenShare,
    stopScreenShare,
    micError,
  };
}
