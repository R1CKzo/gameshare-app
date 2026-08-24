import type { MediaConnection, default as Peer } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { getMicConstraints, loadAudioSettings, sensitivityToGateThreshold } from "@/lib/audioSettings";
import { onSystemAudioChunk, parseWindowHandle, startAppAudio, stopAppAudio } from "@/lib/desktop";
import { createBlankVideoTrack, createPeer } from "@/lib/peer";
import { playMuteSound } from "@/lib/sound";

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
  // Mono fixo, sempre — garante que a faixa de audio enviada pra malha
  // nunca muda de contagem de canais entre "so falando" e "compartilhando
  // um app" (ver o mesmo ajuste em startScreenShare). Sem isso, um
  // microfone que capture em estereo faria o oposto do problema do
  // compartilhamento: a troca no sentido contrario, na hora de comecar a
  // chamada, ja quebraria o audio pro resto da sessao.
  destination.channelCount = 1;
  destination.channelCountMode = "explicit";
  destination.channelInterpretation = "speakers";

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
  isMuted: boolean;
};

// "good"/"medium"/"bad" a partir de RTT e perda de pacote reais (ver
// pollConnectionQuality) — so da pra medir pra quem a gente tem conexao
// P2P direta (a malha e full-mesh, entao isso cobre todo mundo que esta
// na MESMA sala que a gente, nunca outras salas).
export type ConnectionQuality = "good" | "medium" | "bad";

const QUALITY_POLL_MS = 3000;

// Prazo pra uma chamada de saida (peer.call) produzir audio de verdade
// antes de considerarmos que ela travou na negociacao ICE sem nunca
// disparar erro — mais generoso que uma negociacao normal (que costuma
// fechar em segundos) pra dar tempo de sobra ao relay TURN em redes mais
// lentas, sem deixar a malha presa indefinidamente se travar de verdade.
const CALL_CONNECT_TIMEOUT_MS = 12_000;

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
  audio: false;
  video: {
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

// So o video vem daqui. Audio nunca vem junto: tela inteira nao leva
// audio nenhum (so o microfone), e janela/app tem seu proprio audio
// capturado a parte (ver captureAppAudio), gravando so aquele processo
// especifico em vez do loopback cru do sistema inteiro.
async function captureDesktopSource(options: ScreenShareOptions): Promise<MediaStream> {
  const constraints: ElectronDesktopConstraints = {
    audio: false,
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
  return navigator.mediaDevices.getUserMedia(constraints);
}

// Audio de um app/jogo especifico: pede pro processo principal do
// Electron ativar a captura nativa (loopback_helper.exe, API de
// process-loopback do Windows, modo "so esse processo") e reconstitui o
// PCM que chega em pedacos via IPC numa MediaStreamTrack de verdade
// atraves de um AudioWorklet (public/pcm-injector-worklet.js) — mesmo
// padrao ja usado pro gate de ruido do microfone, so que aqui o worklet e
// alimentado por fora em vez de processar uma faixa de entrada. So
// funciona no app desktop (Windows 10 build 20348+) — se a ativacao
// falhar, devolve null e o compartilhamento continua so com o video, sem
// erro pro usuario (isso e automatico, nao uma escolha explicita).
async function captureAppAudio(
  audioContext: AudioContext,
  sourceId: string,
): Promise<{ track: MediaStreamTrack; cleanup: () => void } | null> {
  const hwnd = parseWindowHandle(sourceId);
  if (hwnd === null) return null;

  const result = await startAppAudio(hwnd);
  if (!result.ok) return null;

  await audioContext.audioWorklet.addModule("/pcm-injector-worklet.js");
  const workletNode = new AudioWorkletNode(audioContext, "pcm-injector-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  const destination = audioContext.createMediaStreamDestination();
  workletNode.connect(destination);

  const unsubscribe = onSystemAudioChunk((chunk) => {
    workletNode.port.postMessage(chunk, [chunk]);
  });

  return {
    track: destination.stream.getAudioTracks()[0],
    cleanup: () => {
      unsubscribe();
      stopAppAudio();
      workletNode.disconnect();
    },
  };
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
  const [connectionQuality, setConnectionQuality] = useState<Map<string, ConnectionQuality>>(new Map());

  const peerRef = useRef<Peer | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null); // faixa de mic ja processada pelo gate de ruido
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null); // faixa de audio atual enviada (mic puro ou mic+sistema misturado)
  const outgoingStreamRef = useRef<MediaStream | null>(null);
  const micProcessingRef = useRef<{ audioContext: AudioContext; rawStream: MediaStream } | null>(null);
  const connectionsRef = useRef<Map<string, MediaConnection>>(new Map()); // peerId -> conexao
  const streamedPeerIdsRef = useRef<Set<string>>(new Set()); // quem ja mandou audio de verdade
  const peerIdRef = useRef<string | null>(null);
  const isMutedRef = useRef(false); // espelha isMuted pro heartbeat (mora em ActiveCallProvider) ler sem closure velha
  const shareMixRef = useRef<{
    audioContext: AudioContext;
    displayStream: MediaStream;
    nativeAudioCleanup: (() => void) | null;
  } | null>(null);
  const presentRef = useRef<PresentUser[]>(present);
  presentRef.current = present;

  function registerConnection(peerId: string, call: MediaConnection) {
    connectionsRef.current.set(peerId, call);
    call.on("stream", (stream) => {
      streamedPeerIdsRef.current.add(peerId);
      setRemoteStreams((prev) => new Map(prev).set(peerId, stream));
    });
    // So diagnostico: se uma chamada nunca disparar "stream" nem "error"
    // (trava na negociacao ICE em silencio, o caso que o timeout de
    // CALL_CONNECT_TIMEOUT_MS existe pra contornar), isso aqui deixa visivel
    // NO console em que estado exatamente ela travou, pra a proxima vez
    // que alguem relatar o problema dar pra confirmar a causa de verdade
    // em vez de so suspeitar.
    call.peerConnection?.addEventListener("iceconnectionstatechange", () => {
      console.log(`[voiceMesh] ICE (${peerId}):`, call.peerConnection?.iceConnectionState);
    });
    const drop = () => {
      connectionsRef.current.delete(peerId);
      streamedPeerIdsRef.current.delete(peerId);
      setRemoteStreams((prev) => {
        if (!prev.has(peerId)) return prev;
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
    };
    call.on("close", drop);
    call.on("error", (err) => {
      console.error("[voiceMesh] erro na conexao com", peerId, err);
      drop();
    });
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
          peerIdRef.current = peerId;
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
          if (err.type !== "peer-unavailable") setMicError("Erro de conexão WebRTC: " + err.type);
        });

        // A conexao de SINALIZACAO com o broker do PeerJS (WebSocket, separada
        // do nosso proprio heartbeat de presenca) pode cair sozinha depois de
        // um tempo — sono do notebook, rede oscilando, etc — sem que o app
        // perceba: quem ainda esta com a aba aberta continua aparecendo
        // "presente" (nosso heartbeat HTTP e independente disso), mas o
        // broker nao consegue mais ENTREGAR chamadas novas pra esse peer. De
        // quem chama, parece exatamente uma negociacao que trava sem nunca
        // dar erro. peer.reconnect() e a recuperacao recomendada pelo
        // proprio PeerJS pra esse caso.
        peer.on("disconnected", () => {
          console.warn("[voiceMesh] sinalizacao caiu, tentando reconectar...");
          if (!cancelled) peer.reconnect();
        });
      } catch {
        if (!cancelled) setMicError("Não foi possível acessar o microfone.");
      }
    }

    setup();

    return () => {
      cancelled = true;
      connectionsRef.current.forEach((c) => c.close());
      connectionsRef.current.clear();
      streamedPeerIdsRef.current.clear();
      setRemoteStreams(new Map());
      peerRef.current?.destroy();
      peerRef.current = null;
      peerIdRef.current = null;
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
        shareMixRef.current.nativeAudioCleanup?.();
        shareMixRef.current.audioContext.close().catch(() => {});
        shareMixRef.current.displayStream.getTracks().forEach((t) => t.stop());
        shareMixRef.current = null;
      }
      setLocalStream(null);
      setIsMuted(false);
      isMutedRef.current = false;
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
    if (!peer) return;
    if (peer.disconnected) {
      // Nao so desiste — sem isso, uma sinalizacao que caiu e nunca disparou
      // o evento "disconnected" (conexao "zumbi", comum atras de proxy/NAT
      // que derruba WebSocket ocioso sem avisar) deixava a malha inteira
      // permanentemente incapaz de discar pra qualquer coisa nova.
      peer.reconnect();
      return;
    }

    const stillHerePeerIds = new Set(present.map((u) => u.peerId).filter(Boolean) as string[]);
    connectionsRef.current.forEach((call, peerId) => {
      if (!stillHerePeerIds.has(peerId)) {
        call.close();
        connectionsRef.current.delete(peerId);
        streamedPeerIdsRef.current.delete(peerId);
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
        const peerId = user.peerId;
        const call = peer.call(peerId, outgoing);
        if (call) {
          registerConnection(peerId, call);
          // Negociacao ICE que trava sem nunca disparar "error" (comum
          // atras de rede/NAT mais restritiva) deixava a conexao presa
          // pra sempre — nem tocava audio, nem liberava a vaga pra
          // reconciliacao tentar de novo. Se nao chegou audio nenhum
          // depois de um tempo razoavel, fecha e deixa o proximo poll
          // (~4s) discar de novo com uma tentativa nova.
          setTimeout(() => {
            if (!streamedPeerIdsRef.current.has(peerId) && connectionsRef.current.get(peerId) === call) {
              call.close();
              connectionsRef.current.delete(peerId);
            }
          }, CALL_CONNECT_TIMEOUT_MS);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, present, currentUserId]);

  // Qualidade de conexao por participante, medida de verdade via
  // RTCPeerConnection.getStats() de cada conexao P2P ativa — RTT (do par
  // de candidatos ICE em uso) e perda de pacote (do audio recebido).
  // Nunca inventa numero: se uma conexao ainda nao tem estatistica valida
  // (acabou de abrir), ela simplesmente nao aparece no mapa ainda.
  useEffect(() => {
    if (!enabled) return;

    async function poll() {
      const next = new Map<string, ConnectionQuality>();
      for (const [peerId, call] of connectionsRef.current) {
        const pc = call.peerConnection;
        if (!pc) continue;
        try {
          const stats = await pc.getStats();
          let rtt: number | null = null;
          let packetsLost = 0;
          let packetsReceived = 0;
          stats.forEach((report) => {
            if (report.type === "candidate-pair" && report.state === "succeeded" && typeof report.currentRoundTripTime === "number") {
              rtt = report.currentRoundTripTime;
            }
            if (report.type === "inbound-rtp" && report.kind === "audio") {
              packetsLost = report.packetsLost ?? 0;
              packetsReceived = report.packetsReceived ?? 0;
            }
          });
          const lossRatio = packetsReceived > 0 ? packetsLost / (packetsLost + packetsReceived) : 0;
          let quality: ConnectionQuality = "good";
          if ((rtt !== null && rtt > 0.3) || lossRatio > 0.08) quality = "bad";
          else if ((rtt !== null && rtt > 0.15) || lossRatio > 0.03) quality = "medium";
          next.set(peerId, quality);
        } catch {
          // sem estatistica valida nesse ciclo — mantem o participante de
          // fora do mapa em vez de arriscar um numero errado
        }
      }
      setConnectionQuality(next);
    }

    poll();
    const interval = setInterval(poll, QUALITY_POLL_MS);
    return () => clearInterval(interval);
  }, [enabled]);

  // Muda o estado local e avisa a malha na hora (nao espera o proximo
  // heartbeat periodico de ActiveCallProvider, que pode demorar ate
  // HEARTBEAT_MS) — assim quem esta ouvindo ve o icone de mudo
  // aparecer/sumir quase instantaneamente.
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      if (micTrackRef.current) micTrackRef.current.enabled = !next;
      playMuteSound(next);
      const peerId = peerIdRef.current;
      fetch(`${apiBase}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(peerId ? { peerId } : {}), isMuted: next }),
      }).catch(() => {});
      return next;
    });
  }, [apiBase]);

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
    shareMixRef.current.nativeAudioCleanup?.();
    shareMixRef.current.audioContext.close().catch(() => {});
    shareMixRef.current.displayStream.getTracks().forEach((t) => t.stop());
    shareMixRef.current = null;
    setIsSharingScreen(false);
    fetch(`${apiBase}/stop`, { method: "POST" }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const startScreenShare = useCallback(async (options: ScreenShareOptions) => {
    if (!micTrackRef.current) return;
    let displayStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let nativeAudioCleanup: (() => void) | null = null;
    try {
      displayStream = await captureDesktopSource(options);
      const displayVideoTrack = displayStream.getVideoTracks()[0];

      audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      // Forca mono na saida: a faixa de audio original (so o mic, antes de
      // compartilhar) e mono. Se o audio do app aqui embaixo for estereo, a
      // destination sem essas linhas vira estereo tambem — e trocar a
      // contagem de canais de uma faixa de audio no meio de uma chamada ja
      // conectada (via replaceTrack) faz quem esta recebendo simplesmente
      // parar de decodificar o audio, sem erro nenhum visivel. Era esse o
      // "audio do compartilhamento nao chega pra quem esta assistindo".
      destination.channelCount = 1;
      destination.channelCountMode = "explicit";
      destination.channelInterpretation = "speakers";
      audioContext.createMediaStreamSource(new MediaStream([micTrackRef.current])).connect(destination);
      if (options.sourceType === "window") {
        const appAudio = await captureAppAudio(audioContext, options.sourceId);
        if (appAudio) {
          audioContext.createMediaStreamSource(new MediaStream([appAudio.track])).connect(destination);
          nativeAudioCleanup = appAudio.cleanup;
        }
      }
      const mixedAudioTrack = destination.stream.getAudioTracks()[0];

      shareMixRef.current = { audioContext, displayStream, nativeAudioCleanup };
      displayVideoTrack.addEventListener("ended", stopScreenShare);

      replaceOutgoingTracks(displayVideoTrack, mixedAudioTrack);
      setIsSharingScreen(true);

      const res = await fetch(`${apiBase}/start`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch (err) {
      if (!shareMixRef.current) {
        nativeAudioCleanup?.();
        audioContext?.close().catch(() => {});
        displayStream?.getTracks().forEach((t) => t.stop());
      }
      setMicError(err instanceof Error && err.message ? err.message : "Não foi possível compartilhar a tela.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, stopScreenShare]);

  // Exposto pro heartbeat (mora em ActiveCallProvider) poder reenviar o
  // peerId atual em toda batida, nao so na primeira vez que o peer abre —
  // sem isso, se a linha de presenca perder o peerId (ex: corrida entre o
  // DELETE do "sair" e o POST do "entrar" numa reentrada rapida), ninguem
  // nunca mais reescreve ele, e a chamada fica muda pros dois lados ate
  // um F5.
  function getPeerId(): string | null {
    return peerIdRef.current;
  }

  // Mesmo motivo do getPeerId: o heartbeat periodico (em ActiveCallProvider)
  // roda numa closure que so e recriada quando a apiBase muda, entao ler
  // isMuted (estado do React) direto ali dentro pegaria sempre o valor de
  // quando o efeito foi criado, nunca o atual. Ler pela ref contorna isso.
  function getIsMuted(): boolean {
    return isMutedRef.current;
  }

  return {
    localStream,
    remoteStreams,
    isMuted,
    toggleMute,
    isSharingScreen,
    startScreenShare,
    stopScreenShare,
    micError,
    getPeerId,
    getIsMuted,
    connectionQuality,
  };
}
