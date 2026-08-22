import PusherServer from "pusher";

export { NEW_MESSAGE_EVENT, textChannelPusherName } from "@/lib/pusherShared";

// Cliente de servidor do Pusher, usado pra: (1) disparar o evento de
// mensagem nova quando alguem manda uma (ver
// src/app/api/channels/[channelId]/messages/route.ts) e (2) autorizar a
// inscricao em canais privados (ver src/app/api/pusher/auth/route.ts).
export const pusherServer = new PusherServer({
  appId: process.env.PUSHER_APP_ID ?? "",
  key: process.env.PUSHER_KEY ?? "",
  secret: process.env.PUSHER_SECRET ?? "",
  cluster: process.env.PUSHER_CLUSTER ?? "",
  useTLS: true,
});
