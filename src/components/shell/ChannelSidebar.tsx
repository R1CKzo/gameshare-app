"use client";

import Link from "next/link";

import { useUnread } from "@/components/notifications/UnreadContext";
import { InviteButton } from "@/components/shell/InviteButton";
import { ServerSettingsButton } from "@/components/shell/ServerSettingsButton";
import { UserPill } from "@/components/shell/UserPill";

type ChannelSummary = {
  id: string;
  name: string;
  type: "TEXT" | "CALL";
  isLive: boolean;
  broadcaster: { nickname: string | null } | null;
  presenceCount: number;
};
type RoleSummary = { id: string; name: string; color: string | null };
type MemberSummary = {
  id: string;
  nickname: string | null;
  userTag: string | null;
  image: string | null;
  status: "ONLINE" | "AWAY" | null;
  lastActiveAt: string | Date | null;
  roleId: string | null;
  role: RoleSummary | null;
};
type ServerPermissions = { isOwner: boolean; canKick: boolean; canBan: boolean; canManageRoles: boolean };

export function ChannelSidebar({
  serverId,
  serverName,
  inviteCode,
  channels,
  currentChannelId,
  members,
  ownerId,
  permissions,
  user,
}: {
  serverId: string;
  serverName: string;
  inviteCode: string;
  channels: ChannelSummary[];
  currentChannelId: string;
  members: MemberSummary[];
  ownerId: string;
  permissions: ServerPermissions;
  user: { nickname: string | null; userTag: string | null; image: string | null };
}) {
  const textChannels = channels.filter((c) => c.type === "TEXT");
  const callChannels = channels.filter((c) => c.type === "CALL");
  const canManageServer = permissions.isOwner || permissions.canKick || permissions.canBan || permissions.canManageRoles;

  return (
    <div className="flex w-[252px] shrink-0 flex-col border-r border-white/[0.06] bg-sidebar">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-4">
        <span className="truncate font-bold">{serverName}</span>
        <div className="flex items-center gap-1">
          {canManageServer && (
            <ServerSettingsButton serverId={serverId} ownerId={ownerId} members={members} permissions={permissions} />
          )}
          <InviteButton inviteCode={inviteCode} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="px-2 pb-1 pt-2 text-[11px] font-bold tracking-wider text-muted">
          CANAIS DE TEXTO
        </div>
        {textChannels.map((channel) => (
          <ChannelRow key={channel.id} serverId={serverId} channel={channel} active={channel.id === currentChannelId} />
        ))}

        <div className="px-2 pb-1 pt-4 text-[11px] font-bold tracking-wider text-muted">
          SALAS DE CHAMADA
        </div>
        {callChannels.map((channel) => (
          <ChannelRow key={channel.id} serverId={serverId} channel={channel} active={channel.id === currentChannelId} />
        ))}
      </div>

      <UserPill user={user} serverId={serverId} isServerOwner={permissions.isOwner} />
    </div>
  );
}

function ChannelRow({
  serverId,
  channel,
  active,
}: {
  serverId: string;
  channel: ChannelSummary;
  active: boolean;
}) {
  const isCall = channel.type === "CALL";
  const hasActivity = isCall && (channel.isLive || channel.presenceCount > 0);
  const { isChannelUnread } = useUnread();
  const unread = !isCall && isChannelUnread(channel.id);

  return (
    <Link
      href={`/servers/${serverId}/channels/${channel.id}`}
      prefetch
      className={`mb-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 transition ${
        hasActivity
          ? "border-l-2 border-accent bg-accent/[0.08]"
          : active
            ? "bg-elevated"
            : "hover:bg-white/[0.03]"
      }`}
    >
      {isCall ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={hasActivity ? "#22d3ee" : active ? "#f5f5f7" : "#6b7280"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
      ) : (
        <span className="w-4 text-center text-base font-semibold text-muted">#</span>
      )}
      <span
        className={`flex-1 truncate text-sm ${
          active || hasActivity || unread ? "font-semibold text-[#f5f5f7]" : "text-[#9aa0ae]"
        }`}
      >
        {channel.name}
      </span>
      {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />}
      {isCall && channel.isLive && channel.broadcaster && (
        <div
          className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-sidebar bg-primary text-[8px] font-bold"
          title={channel.broadcaster.nickname ?? undefined}
        >
          {channel.broadcaster.nickname?.slice(0, 1).toUpperCase()}
        </div>
      )}
      {isCall && !channel.isLive && channel.presenceCount > 0 && (
        <div className="flex items-center gap-1 text-[11px] font-semibold text-accent">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
          {channel.presenceCount}
        </div>
      )}
    </Link>
  );
}
