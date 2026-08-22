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
