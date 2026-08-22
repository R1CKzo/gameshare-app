import PusherClient from "pusher-js";

let client: PusherClient | null = null;

// Uma unica conexao Pusher por aba, reaproveitada entre canais — abrir uma
// conexao WebSocket nova a cada troca de canal seria desperdicio.
export function getPusherClient(): PusherClient {
  if (!client) {
    client = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY ?? "", {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "",
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
      },
    });
  }
  return client;
}
