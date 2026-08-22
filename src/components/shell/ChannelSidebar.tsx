import Image from "next/image";
import Link from "next/link";

import { InviteButton } from "@/components/shell/InviteButton";
import { SettingsButton } from "@/components/shell/SettingsButton";
import { SignOutButton } from "@/components/shell/SignOutButton";

type ChannelSummary = {
  id: string;
  name: string;
  type: "TEXT" | "CALL";
  isLive: boolean;
  broadcaster: { nickname: string | null } | null;
  presenceCount: number;
};

export function ChannelSidebar({
  serverId,
  serverName,
  inviteCode,
  channels,
  currentChannelId,
  user,
}: {
  serverId: string;
  serverName: string;
  inviteCode: string;
  channels: ChannelSummary[];
  currentChannelId: string;
  user: { nickname: string | null; userTag: string | null; image: string | null };
}) {
  const textChannels = channels.filter((c) => c.type === "TEXT");
  const callChannels = channels.filter((c) => c.type === "CALL");

  return (
    <div className="flex w-[252px] shrink-0 flex-col border-r border-white/[0.06] bg-sidebar">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-4">
        <span className="truncate font-bold">{serverName}</span>
        <InviteButton inviteCode={inviteCode} />
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

      <div className="flex h-14 shrink-0 items-center gap-2 border-t border-white/[0.06] bg-black/20 px-2">
        <div className="relative">
          {user.image ? (
            <Image src={user.image} alt="" width={34} height={34} className="rounded-full" />
          ) : (
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-primary font-display text-[13px] font-bold">
              {user.nickname?.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[2.5px] border-[#0a0b11] bg-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-[#f5f5f7]">{user.nickname}</div>
          <div className="text-[11px] text-muted">#{user.userTag}</div>
        </div>
        <a
          href="https://github.com/R1CKzo/gameshare-app/releases/latest/download/GameShare-Setup.exe"
          target="_blank"
          rel="noopener noreferrer"
          title="Baixar app para Windows"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-dim transition hover:bg-elevated-hover hover:text-[#f5f5f7]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
        </a>
        <SettingsButton />
        <SignOutButton />
      </div>
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

  return (
    <Link
      href={`/servers/${serverId}/channels/${channel.id}`}
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
      <span className={`flex-1 truncate text-sm ${active || hasActivity ? "font-semibold text-[#f5f5f7]" : "text-[#9aa0ae]"}`}>
        {channel.name}
      </span>
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
