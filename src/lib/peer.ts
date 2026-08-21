import type Peer from "peerjs";
import type { PeerJSOption } from "peerjs";

// Se NEXT_PUBLIC_PEERJS_HOST nao estiver definido, o PeerJS usa o broker
// publico da nuvem (0.peerjs.com) automaticamente — util para desenvolvimento.
// Em producao, recomenda-se hospedar seu proprio PeerServer.
export function getPeerOptions(): PeerJSOption {
  const host = process.env.NEXT_PUBLIC_PEERJS_HOST;
  if (!host) return { debug: 1 };

  return {
    host,
    port: Number(process.env.NEXT_PUBLIC_PEERJS_PORT) || 443,
    path: process.env.NEXT_PUBLIC_PEERJS_PATH || "/",
    secure: true,
    debug: 1,
  };
}

export async function createPeer(id?: string): Promise<Peer> {
  const { default: PeerJS } = await import("peerjs");
  return new PeerJS(id as string, getPeerOptions());
}
