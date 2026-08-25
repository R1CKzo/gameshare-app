import type Peer from "peerjs";
import type { PeerJSOption } from "peerjs";

// STUN sozinho so resolve a conexao quando os dois lados estao atras de NATs
// "simples". Muita gente em rede residencial/4G esta atras de NAT simetrico
// ou CGNAT, onde o WebRTC so consegue conectar via um servidor TURN
// (retransmite a midia em vez de tentar conexao direta). Sem isso, dois
// usuarios no mesmo navegador/rede conectam bem, mas amigos em redes
// diferentes simplesmente nunca fecham a conexao — foi exatamente isso que
// quebrou a chamada de voz: o TURN publico do Open Relay Project
// (metered.ca) que o app usava desde o inicio foi descontinuado (o dominio
// nem resolve mais), entao ninguem atras de NAT restritivo conseguia
// fechar a malha. Trocado pelo ExpressTURN (conta gratuita do proprio
// projeto, credenciais nas env vars abaixo).
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    servers.push(
      { urls: `turn:${turnUrl}`, username: turnUsername, credential: turnCredential },
      { urls: `turn:${turnUrl}?transport=tcp`, username: turnUsername, credential: turnCredential },
    );
  }

  return servers;
}

// Se NEXT_PUBLIC_PEERJS_HOST nao estiver definido, o PeerJS usa o broker
// publico da nuvem (0.peerjs.com) automaticamente — util para desenvolvimento.
// Em producao, recomenda-se hospedar seu proprio PeerServer.
export function getPeerOptions(): PeerJSOption {
  const host = process.env.NEXT_PUBLIC_PEERJS_HOST;
  const iceServers = buildIceServers();

  if (!host) {
    return { debug: 1, config: { iceServers } };
  }

  return {
    host,
    port: Number(process.env.NEXT_PUBLIC_PEERJS_PORT) || 443,
    path: process.env.NEXT_PUBLIC_PEERJS_PATH || "/",
    secure: true,
    debug: 1,
    config: { iceServers },
  };
}

// Prefere H.264 (que tem aceleracao de hardware no Windows/Chromium) em vez
// do VP8/VP9 que o Chromium negocia por padrao (codificados por SOFTWARE,
// direto na CPU) -- pensado pra sobrar mais CPU/GPU pro jogo durante o
// compartilhamento de tela. O PeerJS nao da nenhuma brecha pra mexer no
// RTCPeerConnection ANTES dele criar a oferta/resposta (addTrack e
// createOffer acontecem em sequencia direta, sem nenhum ponto de espera no
// meio pra gente entrar) -- entao a unica forma seria remendar essa parte
// da negociacao na mao, sem o PeerJS. Em vez disso, isso aqui intercepta
// createOffer/createAnswer no proprio RTCPeerConnection do navegador (que o
// PeerJS usa por baixo, sem saber) e so define a preferencia de codec bem
// na hora antes de cada chamada de verdade acontecer. So mexe nesse app: em
// nenhum outro lugar do GameShare cria RTCPeerConnection.
//
// Protegido em cada etapa pra NUNCA impedir a chamada de conectar: se o
// navegador nao suportar nada disso, se H.264 nao estiver disponivel, ou se
// setCodecPreferences recusar a lista por qualquer motivo, so segue sem
// preferencia nenhuma (o comportamento padrao de antes) -- createOffer/
// createAnswer sempre rodam de verdade no final, aconteca o que acontecer
// antes.
let codecPreferencePatched = false;

function applyVideoCodecPreference(pc: RTCPeerConnection) {
  try {
    if (typeof pc.getTransceivers !== "function") return;
    if (typeof RTCRtpSender === "undefined" || typeof RTCRtpSender.getCapabilities !== "function") return;
    const capabilities = RTCRtpSender.getCapabilities("video");
    if (!capabilities?.codecs?.length) return;

    const h264 = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === "video/h264");
    if (h264.length === 0) return; // navegador sem H.264 -- nao mexe em nada
    const rest = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() !== "video/h264");
    const ordered = [...h264, ...rest];

    for (const transceiver of pc.getTransceivers()) {
      if (transceiver.sender.track?.kind !== "video" && transceiver.receiver.track?.kind !== "video") continue;
      if (typeof transceiver.setCodecPreferences !== "function") continue;
      try {
        transceiver.setCodecPreferences(ordered);
      } catch {
        // lista recusada por algum motivo (formato, transceiver ja usado
        // por outra coisa, etc) -- segue sem preferencia nesse transceiver
      }
    }
  } catch {
    // qualquer erro inesperado aqui NUNCA deve impedir a chamada de
    // acontecer -- so desiste da preferencia de codec dessa vez
  }
}

function patchVideoCodecPreference() {
  if (codecPreferencePatched || typeof window === "undefined" || typeof window.RTCPeerConnection === "undefined") return;
  codecPreferencePatched = true;

  const proto = window.RTCPeerConnection.prototype;
  const originalCreateOffer = proto.createOffer;
  const originalCreateAnswer = proto.createAnswer;

  proto.createOffer = function (this: RTCPeerConnection, ...args: Parameters<typeof originalCreateOffer>) {
    applyVideoCodecPreference(this);
    return originalCreateOffer.apply(this, args);
  } as typeof proto.createOffer;

  proto.createAnswer = function (this: RTCPeerConnection, ...args: Parameters<typeof originalCreateAnswer>) {
    applyVideoCodecPreference(this);
    return originalCreateAnswer.apply(this, args);
  } as typeof proto.createAnswer;
}

export async function createPeer(id?: string): Promise<Peer> {
  patchVideoCodecPreference();
  const { default: PeerJS } = await import("peerjs");
  return new PeerJS(id as string, getPeerOptions());
}

// Cria uma MediaStream "vazia" (1px preto + silencio) pra usar como stream
// local de quem so vai assistir. Uma MediaStream de verdade sem NENHUMA
// faixa faz o PeerJS montar a offer sem secao de video/audio nenhuma em
// alguns navegadores (o Safari/WebKit — que e o motor por baixo de
// qualquer navegador no iPhone, incluindo o Chrome — e bem mais estrito
// com isso do que o Chrome/Firefox no computador). Com faixas reais
// (ainda que inuteis), a offer sempre reserva espaco pra video e audio,
// e quem esta compartilhando consegue responder com as faixas de verdade.
export function createReceiveOnlyStream(): MediaStream {
  const videoTrack = createBlankVideoTrack();
  const audioTrack = createSilentAudioTrack();
  const tracks = [videoTrack, audioTrack].filter(Boolean) as MediaStreamTrack[];
  return new MediaStream(tracks);
}

// Faixa de audio "muda" (silencio puro) — mesma ideia da faixa de video em
// branco acima, so que pra audio: reserva o espaco na conexao desde o
// inicio (troca depois via replaceTrack, sem renegociar) pra quem nao
// esta compartilhando nada ainda, ou pra transmissao de tela quando
// ninguem esta compartilhando (ver useVoiceMesh.ts).
export function createSilentAudioTrack(): MediaStreamTrack {
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  return destination.stream.getAudioTracks()[0];
}

// Faixa de video "em branco" (2x2 preto). Usada como placeholder de video
// pra quem esta na malha de voz mas nao esta compartilhando a tela: assim
// a conexao ja nasce com uma secao de video reservada (mesmo problema de
// SDP do Safari/WebKit descrito acima) e, quando a pessoa liga o
// compartilhamento de tela, so trocamos essa faixa pela de verdade via
// RTCRtpSender.replaceTrack() — sem precisar renegociar a conexao.
export function createBlankVideoTrack(): MediaStreamTrack {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, 2, 2);
  }
  return canvas.captureStream(1).getVideoTracks()[0];
}
