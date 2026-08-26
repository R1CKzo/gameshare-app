"use client";

import Image from "next/image";

import { MessageAttachment } from "@/components/channel/MessageAttachment";
import type { ChatMessage, MessageAuthor } from "@/hooks/useChatMessages";
import { formatMessageContent } from "@/lib/messageFormatting";

// Mensagens seguidas da mesma pessoa em menos de 5 minutos ficam agrupadas
// num so bloco (um avatar/nome so), como no Discord.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function MessageList({ messages, currentUserId }: { messages: ChatMessage[]; currentUserId: string }) {
  const groups = groupMessages(messages);
  return (
    <div className="py-4">
      {groups.map((group) => (
        <MessageGroup key={group.messages[0].id} group={group} isSelf={group.user.id === currentUserId} />
      ))}
    </div>
  );
}

type MessageGroupData = { user: MessageAuthor; messages: ChatMessage[] };

function groupMessages(messages: ChatMessage[]): MessageGroupData[] {
  const groups: MessageGroupData[] = [];
  for (const message of messages) {
    const last = groups[groups.length - 1];
    const lastMessage = last?.messages[last.messages.length - 1];
    const sameAuthor = last && last.user.id === message.user.id;
    const withinWindow =
      lastMessage && new Date(message.createdAt).getTime() - new Date(lastMessage.createdAt).getTime() < GROUP_WINDOW_MS;

    if (sameAuthor && withinWindow) {
      last.messages.push(message);
    } else {
      groups.push({ user: message.user, messages: [message] });
    }
  }
  return groups;
}

function MessageGroup({ group, isSelf }: { group: MessageGroupData; isSelf: boolean }) {
  const { user, messages } = group;
  const initials = (user.nickname ?? "?").slice(0, 1).toUpperCase();
  const label = `${user.nickname ?? "Alguém"}${user.userTag ? "#" + user.userTag : ""}`;

  return (
    <div className="flex gap-3 py-1.5 hover:bg-overlay-weak">
      <div className="relative mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-full bg-primary">
        {user.image ? (
          <Image src={user.image} alt="" fill sizes="36px" unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-xs font-bold">{initials}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-bold ${isSelf ? "text-accent" : "text-foreground"}`}>{label}</span>
          <span className="text-[11px] text-dim">{formatTime(messages[0].createdAt)}</span>
        </div>
        {messages.map((message) => (
          <div key={message.id}>
            {message.content && (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground-secondary">
                {formatMessageContent(message.content)}
              </p>
            )}
            {message.attachmentUrl && (
              <MessageAttachment
                url={message.attachmentUrl}
                type={message.attachmentType ?? "file"}
                name={message.attachmentName ?? "arquivo"}
                size={message.attachmentSize ?? 0}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `hoje às ${time}`;
  return `${date.toLocaleDateString("pt-BR")} às ${time}`;
}
