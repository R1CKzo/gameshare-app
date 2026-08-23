"use client";

import { createContext, useContext } from "react";

export type DmActivity = { content: string; createdAt: string };

export type UnreadContextValue = {
  isChannelUnread: (channelId: string) => boolean;
  isServerUnread: (serverId: string) => boolean;
  isDmUnread: (dmChannelId: string) => boolean;
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
