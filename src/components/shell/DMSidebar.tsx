"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useUnread } from "@/components/notifications/UnreadContext";
import { UserPill } from "@/components/shell/UserPill";

type DMUser = { id: string; nickname: string | null; userTag: string | null; image: string | null };
type Conversation = { id: string; user: DMUser | null; lastMessage: { content: string; createdAt: string } | null };

export function DMSidebar({
  user,
  currentDmId,
}: {
  user: { nickname: string | null; userTag: string | null; image: string | null };
  currentDmId?: string;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [incomingCount, setIncomingCount] = useState(0);
  const { isDmUnread, dmActivity, friendsEventVersion } = useUnread();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [dmsRes, friendsRes] = await Promise.all([
          fetch("/api/dms", { cache: "no-store" }),
          fetch("/api/friends", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        const dmsData = await dmsRes.json();
        const friendsData = await friendsRes.json();
        setConversations(dmsData.conversations ?? []);
        setIncomingCount((friendsData.incoming ?? []).length);
      } catch {
        // ignora falhas transitorias
      }
    }

    load();
    const interval = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [friendsEventVersion]);

  // Sobrepoe a previa com a mensagem mais recente recebida em tempo real
  // (o GlobalNotificationListener ja sabe dela antes do proximo poll de
  // 10s chegar) e reordena pra quem mandou mensagem agora subir pro topo.
  const sortedConversations = useMemo(() => {
    return [...conversations]
      .map((c) => {
        const activity = dmActivity.get(c.id);
        if (!activity) return c;
        return { ...c, lastMessage: activity };
      })
      .sort((a, b) => {
        const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [conversations, dmActivity]);

  return (
    <div className="flex w-[252px] shrink-0 flex-col border-r border-white/[0.06] bg-sidebar">
      <div className="flex h-14 shrink-0 items-center border-b border-white/[0.06] px-4">
        <span className="truncate font-bold">Mensagens diretas</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <Link
          href="/friends"
          prefetch
          className="mb-2 flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-semibold text-[#d5d7dc] transition hover:bg-white/[0.03]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className="flex-1">Amigos</span>
          {incomingCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
              {incomingCount}
            </span>
          )}
        </Link>

        <div className="px-2 pb-1 pt-2 text-[11px] font-bold tracking-wider text-muted">MENSAGENS DIRETAS</div>
        {sortedConversations.map((c) => {
          if (!c.user) return null;
          const unread = c.id !== currentDmId && isDmUnread(c.id);
          return (
            <Link
              key={c.id}
              href={`/dms/${c.id}`}
              prefetch
              className={`mb-0.5 flex items-center gap-2.5 rounded-md px-2 py-1.5 transition ${
                c.id === currentDmId ? "bg-elevated" : "hover:bg-white/[0.03]"
              }`}
            >
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-primary">
                {c.user.image ? (
                  <Image src={c.user.image} alt="" fill sizes="32px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-display text-xs font-bold">
                    {(c.user.nickname ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-sm ${
                    c.id === currentDmId || unread ? "font-semibold text-[#f5f5f7]" : "text-[#d5d7dc]"
                  }`}
                >
                  {c.user.nickname}
                </div>
                {c.lastMessage && (
                  <div className={`truncate text-xs ${unread ? "text-[#d5d7dc]" : "text-dim"}`}>{c.lastMessage.content}</div>
                )}
              </div>
              {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />}
            </Link>
          );
        })}
      </div>

      <UserPill user={user} />
    </div>
  );
}
