"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { useMobileUI } from "@/components/shell/MobileUIContext";
import { StatusDot } from "@/components/shell/StatusDot";
import { deriveStatus, type RawStatus } from "@/lib/presence";

type Member = {
  id: string;
  nickname: string | null;
  userTag: string | null;
  image: string | null;
  status: RawStatus;
  lastActiveAt: string | Date | null;
  role?: { id: string; name: string; color: string | null } | null;
};

type StatusUpdate = { id: string; status: RawStatus; lastActiveAt: string | null };

const POLL_INTERVAL_MS = 8_000;

export function MemberList({ serverId, members }: { serverId: string; members: Member[] }) {
  const { toggleMembers } = useMobileUI();

  // So a presenca (status/lastActiveAt) e atualizada por poll — o resto dos
  // dados do membro (nome, foto, cargo) vem fixo da renderizacao inicial no
  // servidor, sem precisar reconsultar tudo de novo a cada ciclo.
  const [statusById, setStatusById] = useState<Map<string, StatusUpdate>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/servers/${serverId}/member-status`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        const updates: StatusUpdate[] = data.members ?? [];
        setStatusById(new Map(updates.map((u) => [u.id, u])));
      } catch {
        // ignora falhas transitorias
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [serverId]);

  return (
    <div className="flex h-full w-[228px] shrink-0 flex-col border-l border-overlay bg-sidebar p-3">
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <span className="text-[11px] font-bold tracking-wider text-muted">MEMBROS — {members.length}</span>
        <button
          onClick={toggleMembers}
          aria-label="Fechar"
          className="-m-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-foreground lg:hidden"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {members.map((member) => {
          const update = statusById.get(member.id);
          const status = deriveStatus(
            update ? update.status : member.status,
            update ? update.lastActiveAt : member.lastActiveAt,
          );
          return (
          <div key={member.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-overlay-weak">
            <div className="relative h-8 w-8 shrink-0">
              <div className="relative h-full w-full overflow-hidden rounded-full bg-primary">
                {member.image ? (
                  <Image src={member.image} alt="" fill sizes="32px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-display text-xs font-bold">
                    {(member.nickname ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <StatusDot status={status} className="-bottom-0.5 -right-0.5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{member.nickname}</div>
              {member.role ? (
                <div
                  className="truncate text-xs font-semibold"
                  style={{ color: member.role.color ?? undefined }}
                >
                  {member.role.name}
                </div>
              ) : (
                <div className="truncate text-xs text-muted">#{member.userTag}</div>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
