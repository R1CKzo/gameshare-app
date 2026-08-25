"use client";

import { createContext, useContext } from "react";

export type DmActivity = { content: string; createdAt: string };

export type UnreadContextValue = {
  isChannelUnread: (channelId: string) => boolean;
  isServerUnread: (serverId: string) => boolean;
  isDmUnread: (dmChannelId: string) => boolean;
  // Silenciado = nunca marca nao lido nem toca som pra esse recurso (ver
  // GlobalNotificationListener.tsx). Servidor silenciado vale pra TODO
  // canal dele — nao existe "silenciar so esse canal dentro de um
  // servidor ja silenciado", de proposito, pra manter simples.
  isServerMuted: (serverId: string) => boolean;
  isChannelMuted: (channelId: string) => boolean;
  isDmMuted: (dmChannelId: string) => boolean;
  setServerMuted: (serverId: string, muted: boolean) => void;
  setChannelMuted: (channelId: string, muted: boolean) => void;
  setDmMuted: (dmChannelId: string, muted: boolean) => void;
  dmActivity: Map<string, DmActivity>;
  // Incrementado a cada pedido de amizade recebido/aceito ou cargo
  // atribuido — FriendsView/DMSidebar usam como gatilho pra recarregar na
  // hora, sem esperar o poll de 10s (que continua existindo como reforço).
  friendsEventVersion: number;
  // Contagem de pedidos de amizade recebidos pendentes — mora aqui (nao so
  // dentro do DMSidebar) pra dar pra mostrar o aviso na barra de servidores
  // tambem, ja que essa e a tela que fica aberta a maior parte do tempo.
  incomingFriendRequestCount: number;
  // Quantidade de conversas diretas com mensagem nao lida — usado junto com
  // incomingFriendRequestCount pro badge do icone de Amigos (antes so
  // reagia a pedido de amizade, nao a mensagem de DM nova).
  unreadDmCount: number;
  // Verdadeiro se tiver QUALQUER notificacao nao lida (mensagem de canal,
  // de DM, ou pedido de amizade) — usado so pra avisar o app de desktop
  // mostrar o ponto vermelho no icone da bandeja.
  hasAnyUnread: boolean;
};

const defaultValue: UnreadContextValue = {
  isChannelUnread: () => false,
  isServerUnread: () => false,
  isDmUnread: () => false,
  isServerMuted: () => false,
  isChannelMuted: () => false,
  isDmMuted: () => false,
  setServerMuted: () => {},
  setChannelMuted: () => {},
  setDmMuted: () => {},
  dmActivity: new Map(),
  friendsEventVersion: 0,
  incomingFriendRequestCount: 0,
  unreadDmCount: 0,
  hasAnyUnread: false,
};

export const UnreadContext = createContext<UnreadContextValue>(defaultValue);

export function useUnread(): UnreadContextValue {
  return useContext(UnreadContext);
}
