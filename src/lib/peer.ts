import type Peer from "peerjs";
import type { PeerJSOption } from "peerjs";

// STUN sozinho so resolve a conexao quando os dois lados estao atras de NATs
// "simples". Muita gente em rede residencial/4G esta atras de NAT simetrico
// ou CGNAT, onde o WebRTC so consegue conectar via um servidor TURN
// (retransmite a midia em vez de tentar conexao direta). Sem isso, dois
// usuarios no mesmo navegador/rede conectam bem, mas amigos em redes
// diferentes simplesmente nunca fecham a conexao.
//
// O Open Relay Project (metered.ca) mantem um TURN publico e gratuito para
// testes/demos, com credenciais publicas de proposito. Para producao com
// mais uso, o ideal e trocar por um TURN proprio (ex: Metered, Twilio,
// Cloudflare Calls).
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

// Se NEXT_PUBLIC_PEERJS_HOST nao estiver definido, o PeerJS usa o broker
// publico da nuvem (0.peerjs.com) automaticamente — util para desenvolvimento.
// Em producao, recomenda-se hospedar seu proprio PeerServer.
export function getPeerOptions(): PeerJSOption {
  const host = process.env.NEXT_PUBLIC_PEERJS_HOST;

  if (!host) {
    return { debug: 1, config: { iceServers: ICE_SERVERS } };
  }

  return {
    host,
    port: Number(process.env.NEXT_PUBLIC_PEERJS_PORT) || 443,
    path: process.env.NEXT_PUBLIC_PEERJS_PATH || "/",
    secure: true,
    debug: 1,
    config: { iceServers: ICE_SERVERS },
  };
}

export async function createPeer(id?: string): Promise<Peer> {
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
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, 2, 2);
  }
  const videoTrack = canvas.captureStream(1).getVideoTracks()[0];

  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  const audioTrack = destination.stream.getAudioTracks()[0];

  const tracks = [videoTrack, audioTrack].filter(Boolean) as MediaStreamTrack[];
  return new MediaStream(tracks);
}
