import type { MediaConnection, default as Peer } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { getMicConstraints, loadAudioSettings, sensitivityToGateThreshold } from "@/lib/audioSettings";
import {
  onSystemAudioChunk,
  parseWindowHandle,
  startAppAudio,
  startSystemAudioExcludingSelf,
  stopAppAudio,
  stopSystemAudioExcludingSelf,
} from "@/lib/desktop";
import { createBlankVideoTrack, createPeer, createSilentAudioTrack } from "@/lib/peer";
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

export type ConnectionQuality = "good" | "medium" | "bad";

export type PresentUser = {
  id: string;
  nickname: string | null;
  userTag: string | null;
  image: string | null;
  peerId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  // Auto-relatado pelo proprio dono da presenca (ver getConnectionQuality
  // abaixo) — chega pronto do servidor pra todo mundo que ve essa pessoa,
  // dentro da chamada ou so espiando a barra lateral sem ter entrado.
  connectionQuality: ConnectionQuality;
};

// Voz do microfone, audio da transmissao (tela/app compartilhado) e video
// vem em 3 faixas SEPARADAS por pessoa (antes, mic e transmissao vinham
// misturados numa faixa so) -- assim quem esta ouvindo pode controlar o
// volume da transmissao (ou parar de assistir) sem afetar a voz de
// ninguem na call. Qualquer uma pode ser null: video sempre existe uma
// vez a conexao aberta (mesmo que "em branco", ver createBlankVideoTrack),
// broadcastTrack so carrega audio de verdade enquanto aquela pessoa
// estiver compartilhando com som.
export type RemotePeerTracks = {
  micTrack: MediaStreamTrack | null;
  broadcastTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
};

const QUALITY_POLL_MS = 3000;
// Tempo de "carencia" depois que uma conexao comeca a receber audio antes
// do sinal de qualidade passar a julgar ela — cobre o barulho normal da
// negociacao ICE/DTLS logo no inicio (ver o poll abaixo).
const STATS_GRACE_MS = 5000;

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

// Teto de bitrate (bps) do video da transmissao, por resolucao escolhida.
// Sem isso, cada conexao tenta usar o maximo de banda que conseguir
// sozinha, sem limite nenhum -- generoso o bastante pra continuar nitido,
// mas evita uma conexao sozinha saturar o upload de quem esta
// compartilhando (que fica pior conforme mais gente assiste, ja que cada
// pessoa e uma copia separada saindo do mesmo upload).
function maxVideoBitrateFor(options: ScreenShareOptions): number {
  if (options.height >= 1440) return 6_000_000;
  if (options.height >= 1080) return 4_000_000;
  return 2_500_000;
}

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
    // "chunk" chega como Uint8Array (o Buffer do Node vira isso ao cruzar
    // o IPC do Electron duas vezes -- main -> preload -> mundo principal
    // via contextBridge) -- so o ArrayBuffer por baixo e "transferivel"
    // pro postMessage; mandar o proprio Uint8Array na lista de
    // transferencia lanca DataCloneError toda vez, silenciosamente (o
    // worklet nunca recebia nenhum audio de verdade, so silencio).
    const buffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
    workletNode.port.postMessage(buffer, [buffer]);
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

// Audio da TELA INTEIRA: gemea de captureAppAudio acima, so que captura
// tudo que esta tocando no sistema, menos o proprio processo do GameShare
// (modo "exclude" da API de process-loopback do Windows — ver
// loopback_helper.cpp) em vez de um app especifico. Como e o proprio
// GameShare quem toca a voz dos outros participantes da call, excluir o
// proprio processo ja exclui essas vozes automaticamente, sem precisar de
// nenhum filtro extra.
async function captureSystemAudio(
  audioContext: AudioContext,
): Promise<{ track: MediaStreamTrack; cleanup: () => void } | null> {
  const result = await startSystemAudioExcludingSelf();
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
    // "chunk" chega como Uint8Array (o Buffer do Node vira isso ao cruzar
    // o IPC do Electron duas vezes -- main -> preload -> mundo principal
    // via contextBridge) -- so o ArrayBuffer por baixo e "transferivel"
    // pro postMessage; mandar o proprio Uint8Array na lista de
    // transferencia lanca DataCloneError toda vez, silenciosamente (o
    // worklet nunca recebia nenhum audio de verdade, so silencio).
    const buffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
    workletNode.port.postMessage(buffer, [buffer]);
  });

  return {
    track: destination.stream.getAudioTracks()[0],
    cleanup: () => {
      unsubscribe();
      stopSystemAudioExcludingSelf();
      workletNode.disconnect();
    },
  };
}

// Malha de voz: cada participante presente na sala mantem uma conexao de
// midia PeerJS direta com todo mundo, com 3 faixas reservadas desde o
// inicio -- audio do microfone (nunca trocada), video "em branco" e audio
// de transmissao "mudo" (ambos trocados via replaceTrack quando alguem
// compartilha a tela, sem precisar renegociar nada). Pra nunca duplicar a
// conexao entre duas pessoas, quem tem o userId menor (ordem alfabetica)
// e sempre quem liga.
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
  const [remoteStreams, setRemoteStreams] = useState<Map<string, RemotePeerTracks>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null); // faixa de mic ja processada pelo gate de ruido -- nunca trocada por replaceTrack
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const broadcastTrackRef = useRef<MediaStreamTrack | null>(null); // audio da transmissao (tela/app) -- "mudo" ate alguem compartilhar com som
  // outgoingStreamRef guarda as 3 faixas de VERDADE (mic, video, transmissao)
  // -- e o que semeia peer.call() pra gente nova entrando na sala. localStream
  // (exposto pro React) fica so com mic+video: nada na UI local precisa ouvir
  // a propria transmissao de volta, e incluir teria risco de confundir o
  // detector de "esta falando" (useSpeakingDetector) com o som do jogo/app.
  const outgoingStreamRef = useRef<MediaStream | null>(null);
  const micProcessingRef = useRef<{ audioContext: AudioContext; rawStream: MediaStream } | null>(null);
  const connectionsRef = useRef<Map<string, MediaConnection>>(new Map()); // peerId -> conexao
  const streamedPeerIdsRef = useRef<Set<string>>(new Set()); // quem ja mandou audio de verdade
  const peerIdRef = useRef<string | null>(null);
  const isMutedRef = useRef(false); // espelha isMuted pro heartbeat (mora em ActiveCallProvider) ler sem closure velha
  const selfQualityRef = useRef<ConnectionQuality>("good"); // idem, pro getConnectionQuality
  const shareMixRef = useRef<{
    audioContext: AudioContext;
    displayStream: MediaStream;
    nativeAudioCleanup: (() => void) | null;
  } | null>(null);
  // Teto de bitrate do video da transmissao (bps) enquanto compartilhando,
  // null quando nao. Guardado numa ref pra aplicar tambem em conexoes NOVAS
  // que abrirem no meio de uma transmissao ja em andamento (ver
  // registerConnection) -- sem isso, quem entrasse na sala depois de
  // alguem ja estar compartilhando ficaria sem o limite.
  const videoBitrateCapRef = useRef<number | null>(null);
  const presentRef = useRef<PresentUser[]>(present);
  presentRef.current = present;
  // Quando cada conexao comecou a receber audio de verdade — o sinal de
  // qualidade ignora uma conexao ate ela completar STATS_GRACE_MS nesse
  // relogio (ver poll abaixo), pra nao confundir o barulho normal de
  // negociacao ICE/DTLS logo no inicio (uns poucos pacotes perdidos
  // enquanto a conexao ainda esta se estabelecendo) com uma rede ruim de
  // verdade.
  const connectionStartedAtRef = useRef<Map<string, number>>(new Map());
  // Ultima leitura cumulativa de pacotes de cada conexao — o navegador so
  // devolve o TOTAL desde o inicio da chamada, nunca "quanto perdeu agora".
  // Guardar a leitura anterior e comparar a diferenca a cada poll e o que
  // faz o sinal refletir a rede AGORA, em vez de arrastar pra sempre um
  // punhado de pacotes perdidos so na largada (que sozinhos já bastavam pra
  // estourar o limite de 3-8% logo nos primeiros segundos, com poucos
  // pacotes recebidos ainda no total).
  const lastStatsRef = useRef<Map<string, { packetsLost: number; packetsReceived: number }>>(new Map());
  // Cancela o POST do peerId (ao abrir a conexao) e o do mudo (ao clicar)
  // se ainda estiverem em voo quando abortPendingWrites() for chamado (ver
  // ActiveCallProvider.leave()) — evita que uma dessas escritas chegue no
  // servidor DEPOIS do DELETE de "sair" e recrie a linha de presenca.
  const writeAbortRef = useRef<AbortController | null>(null);

  // Aplica o teto de bitrate + preferencia "manter FPS" (cortar nitidez
  // antes de cortar quadros por segundo sob pressao de rede) no sender de
  // video de uma conexao -- usado tanto ao trocar a faixa (replaceVideoTrack,
  // quando a transmissao comeca/termina) quanto em conexoes NOVAS que
  // abrirem no meio de uma transmissao ja em andamento (logo abaixo, em
  // registerConnection) -- sem isso, quem entrasse na sala depois de
  // alguem ja estar compartilhando ficava sem o limite.
  function applyVideoEncodingLimits(sender: RTCRtpSender | undefined, maxBitrate: number | null) {
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].maxBitrate = maxBitrate ?? undefined;
    params.degradationPreference = "maintain-framerate";
    sender.setParameters(params).catch(() => {});
  }

  function registerConnection(peerId: string, call: MediaConnection) {
    connectionsRef.current.set(peerId, call);
    if (videoBitrateCapRef.current !== null) {
      const sender = call.peerConnection?.getSenders().find((s) => s.track?.kind === "video");
      applyVideoEncodingLimits(sender, videoBitrateCapRef.current);
    }
    call.on("stream", () => {
      streamedPeerIdsRef.current.add(peerId);
      connectionStartedAtRef.current.set(peerId, Date.now());
      // Le direto dos receivers da conexao (nao do MediaStream que o
      // evento entrega) -- a ordem das faixas dentro de um MediaStream nao
      // e garantida pelo navegador, mas a ordem dos receivers reflete a
      // ordem das "m-lines" negociadas (a mesma ordem que construimos o
      // stream de saida: mic, video, transmissao — ver setup() abaixo) e
      // e estavel a vida toda da conexao, mesmo depois de varias trocas
      // de faixa via replaceTrack.
      const receivers = call.peerConnection?.getReceivers() ?? [];
      const audioReceivers = receivers.filter((r) => r.track?.kind === "audio");
      const videoReceiver = receivers.find((r) => r.track?.kind === "video");
      setRemoteStreams((prev) =>
        new Map(prev).set(peerId, {
          micTrack: audioReceivers[0]?.track ?? null,
          broadcastTrack: audioReceivers[1]?.track ?? null,
          videoTrack: videoReceiver?.track ?? null,
        }),
      );
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
      connectionStartedAtRef.current.delete(peerId);
      lastStatsRef.current.delete(peerId);
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
    const writeAbort = new AbortController();
    writeAbortRef.current = writeAbort;

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

        const videoTrack = createBlankVideoTrack();
        videoTrackRef.current = videoTrack;

        const broadcastTrack = createSilentAudioTrack();
        broadcastTrackRef.current = broadcastTrack;

        // Ordem fixa [mic, video, transmissao] -- e o que registerConnection()
        // usa pra saber qual receiver e qual do lado de quem recebe (ver
        // comentario la). outgoingStreamRef fica com as 3 faixas de verdade
        // (semeia peer.call() pra gente entrando depois); localStream (React)
        // fica so com mic+video, ver comentario no useRef acima.
        const outgoing = new MediaStream([micTrack, videoTrack, broadcastTrack]);
        outgoingStreamRef.current = outgoing;
        setLocalStream(new MediaStream([micTrack, videoTrack]));

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
            signal: writeAbort.signal,
          })
            .then(async (res) => {
              // So acontece na corrida rara de duas pessoas entrando no
              // mesmíssimo instante com a sala quase cheia (o aviso normal
              // de "sala cheia" já barra antes de chegar aqui — ver
              // CallChannel/DMChatView) — mas se acontecer, a pessoa precisa
              // saber que entrou "pela metade" (mic aberto, ninguém do outro
              // lado), em vez de a falha só sumir em silêncio.
              if (!res.ok && !cancelled) {
                const data = await res.json().catch(() => ({}));
                setMicError(data.error ?? "Não foi possível entrar na chamada.");
              }
            })
            .catch(() => {});
        });

        peer.on("call", (call) => {
          call.answer(outgoingStreamRef.current ?? undefined);
          registerConnection(call.peer, call);
        });

        peer.on("error", (err) => {
          if (err.type !== "peer-unavailable") setMicError("Não foi possível manter a conexão da chamada. Tente entrar de novo.");
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
      broadcastTrackRef.current = null;
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
      selfQualityRef.current = "good";
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
        connectionStartedAtRef.current.delete(peerId);
        lastStatsRef.current.delete(peerId);
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

  // Mede a PROPRIA qualidade de conexao — RTT (do par de candidatos ICE em
  // uso) e perda de pacote (do audio recebido) de cada conexao P2P ativa —
  // e guarda o pior resultado entre todas, como proxy de "como esta minha
  // conexao agora". Esse valor e o que vai no heartbeat (ver
  // ActiveCallProvider) pro servidor guardar e devolver pra todo mundo que
  // ve essa presenca, dentro da chamada ou so olhando a barra lateral —
  // e por isso que e auto-relatado (cada um so mede a propria malha) em
  // vez de cada pessoa tentar medir a conexao dos outros.
  useEffect(() => {
    if (!enabled) return;

    async function poll() {
      // Sinalizacao caida e o sintoma mais grave que da pra detectar sem
      // nenhuma conexao de midia ainda aberta — sozinho na sala, por
      // exemplo — entao pesa mais que qualquer estatistica de RTT.
      if (peerRef.current?.disconnected) {
        selfQualityRef.current = "bad";
        return;
      }

      let worst: ConnectionQuality = "good";
      for (const [peerId, call] of connectionsRef.current.entries()) {
        const pc = call.peerConnection;
        if (!pc) continue;

        // Recem-conectada: deixa passar sem julgar por um tempo — a
        // negociacao ICE/DTLS naturalmente perde alguns pacotes antes de
        // estabilizar, o que sozinho ja bastava pra acender vermelho/amarelo
        // pros dois lados assim que a call comecava, mesmo com internet boa.
        const connectedAt = connectionStartedAtRef.current.get(peerId);
        if (!connectedAt || Date.now() - connectedAt < STATS_GRACE_MS) continue;

        try {
          // Desde que a voz e a transmissao viraram faixas separadas, cada
          // conexao tem DUAS estatisticas "inbound-rtp" de audio (voz e
          // transmissao) -- sem filtrar por qual e qual, o report da
          // transmissao (silencio na maior parte do tempo, com um ritmo de
          // pacotes bem mais irregular) podia sobrescrever o da voz e
          // inventar uma perda enorme do nada, mesmo com a voz passando
          // perfeita. O sinal de qualidade so faz sentido medindo a VOZ (a
          // transmissao tem player e volume proprios, nao afeta "dar pra
          // conversar" com a pessoa).
          const micTrackId = pc.getReceivers().find((r) => r.track?.kind === "audio")?.track?.id ?? null;

          const stats = await pc.getStats();
          let rtt: number | null = null;
          let nominatedRtt: number | null = null;
          let packetsLost = 0;
          let packetsReceived = 0;
          stats.forEach((report) => {
            if (report.type === "candidate-pair" && report.state === "succeeded" && typeof report.currentRoundTripTime === "number") {
              // Em algumas redes o navegador mantem mais de um par de
              // candidatos com estado "succeeded" ao mesmo tempo (um backup
              // via TURN atras do par direto que esta sendo usado de
              // verdade, por exemplo) — sem filtrar por "nominated", a
              // leitura podia pegar o RTT do par ERRADO (mais lento) so por
              // ordem de iteracao, mesmo com o audio passando tranquilo pelo
              // par bom.
              if (report.nominated) nominatedRtt = report.currentRoundTripTime;
              rtt = report.currentRoundTripTime;
            }
            if (report.type === "inbound-rtp" && report.kind === "audio" && report.trackIdentifier === micTrackId) {
              packetsLost = report.packetsLost ?? 0;
              packetsReceived = report.packetsReceived ?? 0;
            }
          });
          const effectiveRtt = nominatedRtt ?? rtt;

          // So conta o que aconteceu DESDE o ultimo poll — packetsLost/
          // packetsReceived do navegador sao contadores acumulados desde o
          // inicio da chamada inteira, entao usar o total direto faz uns
          // poucos pacotes perdidos na largada (antes do total de pacotes
          // recebidos crescer) parecerem uma perda enorme, e o efeito nunca
          // se desfaz de verdade (so dilui bem devagar com o tempo).
          const last = lastStatsRef.current.get(peerId);
          lastStatsRef.current.set(peerId, { packetsLost, packetsReceived });
          const deltaLost = Math.max(0, packetsLost - (last?.packetsLost ?? packetsLost));
          const deltaReceived = Math.max(0, packetsReceived - (last?.packetsReceived ?? packetsReceived));
          const lossRatio = deltaLost + deltaReceived > 0 ? deltaLost / (deltaLost + deltaReceived) : 0;

          if ((effectiveRtt !== null && effectiveRtt > 0.3) || lossRatio > 0.08) worst = "bad";
          else if (worst !== "bad" && ((effectiveRtt !== null && effectiveRtt > 0.15) || lossRatio > 0.03)) worst = "medium";
        } catch {
          // sem estatistica valida nesse ciclo — nao deixa essa conexao
          // especifica piorar a leitura, so nao contribui com nada
        }
      }
      selfQualityRef.current = worst;
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
        signal: writeAbortRef.current?.signal,
      }).catch(() => {});
      return next;
    });
  }, [apiBase]);

  // Chamado por ActiveCallProvider.leave() logo antes de mandar o DELETE —
  // ver o comentario em writeAbortRef acima.
  function abortPendingWrites() {
    writeAbortRef.current?.abort();
  }

  // outgoingStreamRef (as 3 faixas de verdade que alimentam peer.call() pra
  // gente nova) e localStream (so mic+video, exposto pro React -- ver
  // comentario na declaracao de outgoingStreamRef acima) precisam ficar em
  // sincronia toda vez que qualquer uma das 3 faixas troca.
  function syncOutgoingStream() {
    if (!outgoingStreamRef.current || !micTrackRef.current || !videoTrackRef.current || !broadcastTrackRef.current) {
      return;
    }
    outgoingStreamRef.current.getTracks().forEach((t) => outgoingStreamRef.current!.removeTrack(t));
    outgoingStreamRef.current.addTrack(micTrackRef.current);
    outgoingStreamRef.current.addTrack(videoTrackRef.current);
    outgoingStreamRef.current.addTrack(broadcastTrackRef.current);
    setLocalStream(new MediaStream([micTrackRef.current, videoTrackRef.current]));
  }

  function replaceVideoTrack(video: MediaStreamTrack, maxBitrate: number | null = null) {
    videoBitrateCapRef.current = maxBitrate;
    connectionsRef.current.forEach((call) => {
      const sender = call.peerConnection?.getSenders().find((s) => s.track?.kind === "video");
      sender?.replaceTrack(video).catch(() => {});
      applyVideoEncodingLimits(sender, maxBitrate);
    });
    videoTrackRef.current = video;
    syncOutgoingStream();
  }

  // So mexe no SEGUNDO sender de audio de cada conexao. O primeiro
  // (indice 0) e sempre o microfone -- a ordem reflete a mesma ordem que o
  // stream de saida foi montado em setup() (mic, video, transmissao) e e
  // estavel pela vida toda da conexao (ver mesmo raciocinio no comentario
  // de registerConnection, do lado de quem recebe). O sender do
  // microfone nunca e tocado aqui: compartilhar tela nao deve silenciar
  // nem trocar a voz de ninguem na call.
  function replaceBroadcastAudioTrack(audio: MediaStreamTrack) {
    connectionsRef.current.forEach((call) => {
      const audioSenders = call.peerConnection?.getSenders().filter((s) => s.track?.kind === "audio") ?? [];
      audioSenders[1]?.replaceTrack(audio).catch(() => {});
    });
    broadcastTrackRef.current = audio;
    syncOutgoingStream();
  }

  const stopScreenShare = useCallback(() => {
    if (!shareMixRef.current) return;
    replaceVideoTrack(createBlankVideoTrack());
    replaceBroadcastAudioTrack(createSilentAudioTrack());
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
      // Avisa o codificador que isso e video em movimento (jogo, video),
      // nao uma imagem parada -- ele passa a priorizar manter os quadros
      // por segundo em vez de gastar mais processamento tentando afiar
      // cada quadro individual, o que ajuda a sobrar mais CPU/GPU pro
      // jogo em si durante a transmissao.
      displayVideoTrack.contentHint = "motion";

      audioContext = new AudioContext();
      // Tela inteira usa captureSystemAudio (tudo, menos o proprio
      // GameShare -- ja exclui a voz de todo mundo na call de graca, sem
      // filtro extra nenhum); janela/app especifico usa o captureAppAudio
      // que ja existia desde a v1.0.6 (so aquele processo). O microfone
      // NAO entra mais aqui -- a faixa de transmissao e 100% separada da
      // voz. Se a captura de audio falhar, segue so com video (faixa de
      // transmissao muda), do mesmo jeito automatico e sem erro pro
      // usuario que ja acontecia antes.
      const capture =
        options.sourceType === "screen"
          ? await captureSystemAudio(audioContext)
          : await captureAppAudio(audioContext, options.sourceId);
      if (capture) nativeAudioCleanup = capture.cleanup;

      shareMixRef.current = { audioContext, displayStream, nativeAudioCleanup };
      displayVideoTrack.addEventListener("ended", stopScreenShare);

      replaceVideoTrack(displayVideoTrack, maxVideoBitrateFor(options));
      replaceBroadcastAudioTrack(capture?.track ?? createSilentAudioTrack());
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

  // Idem, pro heartbeat mandar a qualidade de conexao auto-medida em toda
  // batida (ver o useEffect de poll acima).
  function getConnectionQuality(): ConnectionQuality {
    return selfQualityRef.current;
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
    getConnectionQuality,
    abortPendingWrites,
  };
}
