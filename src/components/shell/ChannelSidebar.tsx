import Image from "next/image";
import Link from "next/link";

import { SignOutButton } from "@/components/shell/SignOutButton";

type ChannelSummary = {
  id: string;
  name: string;
  type: "TEXT" | "CALL";
  isLive: boolean;
  broadcaster: { nickname: string | null } | null;
};

export function ChannelSidebar({
  serverId,
  serverName,
  channels,
  currentChannelId,
  user,
}: {
  serverId: string;
  serverName: string;
  channels: ChannelSummary[];
  currentChannelId: string;
  user: { nickname: string | null; userTag: string | null; image: string | null };
}) {
  const textChannels = channels.filter((c) => c.type === "TEXT");
  const callChannels = channels.filter((c) => c.type === "CALL");

  return (
    <div className="flex w-[252px] shrink-0 flex-col border-r border-white/[0.06] bg-sidebar">
      <div className="flex h-14 shrink-0 items-center border-b border-white/[0.06] px-4">
        <span className="truncate font-bold">{serverName}</span>
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

  return (
    <Link
      href={`/servers/${serverId}/channels/${channel.id}`}
      className={`mb-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 transition ${
        isCall && channel.isLive
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
          stroke={channel.isLive ? "#22d3ee" : active ? "#f5f5f7" : "#6b7280"}
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
      <span className={`flex-1 truncate text-sm ${active || channel.isLive ? "font-semibold text-[#f5f5f7]" : "text-[#9aa0ae]"}`}>
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
    </Link>
  );
}
