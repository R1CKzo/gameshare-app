// Constantes usadas tanto no servidor (src/lib/pusher.ts) quanto no
// navegador (src/lib/pusherClient.ts e os componentes de chat) — isoladas
// aqui pra nenhum componente client precisar importar o SDK de servidor do
// Pusher (que usa modulos do Node e nao roda no navegador).
export function textChannelPusherName(channelId: string) {
  return `private-channel-${channelId}`;
}

export function dmChannelPusherName(dmChannelId: string) {
  return `private-dm-${dmChannelId}`;
}

export const NEW_MESSAGE_EVENT = "new-message";
