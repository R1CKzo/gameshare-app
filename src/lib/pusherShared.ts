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

// Canal privado agregando todas as salas de chamada de um servidor de uma
// vez so — o que alimenta a lista "quem esta em cada sala" da barra
// lateral (ChannelSidebar), sem precisar se inscrever em cada sala
// individualmente. Qualquer membro do servidor pode se inscrever (ver
// src/app/api/pusher/auth/route.ts).
export function serverVoicePusherName(serverId: string) {
  return `private-server-voice-${serverId}`;
}

export const NEW_MESSAGE_EVENT = "new-message";
export const FRIEND_REQUEST_EVENT = "friend-request";
export const FRIEND_ACCEPTED_EVENT = "friend-accepted";
export const ROLE_GRANTED_EVENT = "role-granted";
// Disparado em toda mudanca de presenca de chamada (entrar, sair, mutar/
// desmutar, comecar/parar de compartilhar a tela) — em vez de mandar o
// estado novo dentro do evento, so avisa "algo mudou nessa sala", e quem
// esta ouvindo refaz a mesma consulta GET que ja usava no poll (evita
// duplicar a logica de montar o payload em dois lugares, e fica
// automaticamente consistente com o poll de reforco que continua rodando
// por baixo). Ver ActiveCallProvider, CallChannel, DMChatView e
// ChannelSidebar.
export const CALL_UPDATE_EVENT = "call-update";
