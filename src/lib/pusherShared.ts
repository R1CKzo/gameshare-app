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

// Canal privado de um usuario especifico — pra notificacoes que nao sao de
// um canal/DM (pedido de amizade, pedido aceito, cargo atribuido). So o
// proprio dono pode se inscrever (ver src/app/api/pusher/auth/route.ts).
export function userPusherName(userId: string) {
  return `private-user-${userId}`;
}

export const NEW_MESSAGE_EVENT = "new-message";
export const FRIEND_REQUEST_EVENT = "friend-request";
export const FRIEND_ACCEPTED_EVENT = "friend-accepted";
export const ROLE_GRANTED_EVENT = "role-granted";
