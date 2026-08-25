"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useUnread } from "@/components/notifications/UnreadContext";
import { StatusDot } from "@/components/shell/StatusDot";
import { UserPill } from "@/components/shell/UserPill";
import { apiUrl } from "@/lib/apiUrl";
import { deriveStatus, type RawStatus } from "@/lib/presence";

type DMUser = {
  id: string;
  nickname: string | null;
  userTag: string | null;
  image: string | null;
  status: RawStatus;
  lastActiveAt: string | null;
};
type Conversation = { id: string; user: DMUser | null; lastMessage: { content: string; createdAt: string } | null };

export function DMSidebar({
  user,
  currentDmId,
}: {
  user: { nickname: string | null; userTag: string | null; image: string | null };
  currentDmId?: string;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const { isDmUnread, dmActivity, incomingFriendRequestCount, unreadDmCount } = useUnread();
  const friendsBadgeTotal = incomingFriendRequestCount + unreadDmCount;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(apiUrl("/api/dms"), { cache: "no-store" });
        if (cancelled) return;
        const data = await res.json();
        setConversations(data.conversations ?? []);
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
  }, []);

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
    <div className="flex w-[252px] shrink-0 flex-col border-r border-overlay bg-sidebar">
      <div className="flex h-14 shrink-0 items-center border-b border-overlay px-4">
        <span className="truncate font-bold">Mensagens diretas</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <Link
          href="/friends"
          prefetch
          className="mb-2 flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-semibold text-foreground-secondary transition hover:bg-overlay-weak"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className="flex-1">Amigos</span>
          {friendsBadgeTotal > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
              {friendsBadgeTotal}
            </span>
          )}
        </Link>

        <div className="px-2 pb-1 pt-2 text-[11px] font-bold tracking-wider text-muted">MENSAGENS DIRETAS</div>
        {sortedConversations.map((c) => {
          if (!c.user) return null;
          const unread = c.id !== currentDmId && isDmUnread(c.id);
          return (
            <div key={c.id} className="group relative mb-0.5">
              <Link
                href={`/dms/${c.id}`}
                prefetch
                className={`flex items-center gap-2.5 rounded-md py-1.5 pl-2 pr-8 transition ${
                  c.id === currentDmId ? "bg-elevated" : "hover:bg-overlay-weak"
                }`}
              >
                <div className="relative h-8 w-8 shrink-0">
                  <div className="relative h-full w-full overflow-hidden rounded-full bg-primary">
                    {c.user.image ? (
                      <Image src={c.user.image} alt="" fill sizes="32px" className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-display text-xs font-bold">
                        {(c.user.nickname ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <StatusDot status={deriveStatus(c.user.status, c.user.lastActiveAt)} className="-bottom-0.5 -right-0.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-sm ${
                      c.id === currentDmId || unread ? "font-semibold text-foreground" : "text-foreground-secondary"
                    }`}
                  >
                    {c.user.nickname}
                  </div>
                  {c.lastMessage && (
                    <div className={`truncate text-xs ${unread ? "text-foreground-secondary" : "text-dim"}`}>{c.lastMessage.content}</div>
                  )}
                </div>
                {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />}
              </Link>
              <DMActionsMenu dmChannelId={c.id} />
            </div>
          );
        })}
      </div>

      <UserPill user={user} />
    </div>
  );
}

// Mesmo padrao de menu flutuante do ChannelActionsMenu (ChannelSidebar.tsx)
// e do MoreMenu.tsx -- so que aqui e novo, nao existia nenhum menu por
// conversa antes.
function DMActionsMenu({ dmChannelId }: { dmChannelId: string }) {
  const { isDmMuted, setDmMuted } = useUnread();
  const muted = isDmMuted(dmChannelId);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 200 - 12) });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      document.addEventListener("keydown", onKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.preventDefault();
          toggleOpen();
        }}
        title="Opções da conversa"
        className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 shrink-0 items-center justify-center rounded bg-sidebar text-muted transition hover:bg-elevated-hover hover:text-foreground ${
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <HamburgerIcon />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: position.top, left: position.left, width: 200 }}
            className="fixed z-[100] overflow-hidden rounded-xl border border-overlay-strong bg-elevated py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
          >
            <button
              onClick={() => {
                setDmMuted(dmChannelId, !muted);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold text-foreground-secondary transition hover:bg-elevated-hover hover:text-foreground"
            >
              {muted ? <BellIcon /> : <BellOffIcon />}
              {muted ? "Ativar notificações" : "Silenciar conversa"}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

function HamburgerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M13.73 21a1.94 1.94 0 0 1-3.41 0" />
      <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <path d="M1 1l22 22" />
    </svg>
  );
}
