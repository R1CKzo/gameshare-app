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
};

const defaultValue: UnreadContextValue = {
  isChannelUnread: () => false,
  isServerUnread: () => false,
  isDmUnread: () => false,
  dmActivity: new Map(),
  friendsEventVersion: 0,
};

export const UnreadContext = createContext<UnreadContextValue>(defaultValue);

export function useUnread(): UnreadContextValue {
  return useContext(UnreadContext);
}
