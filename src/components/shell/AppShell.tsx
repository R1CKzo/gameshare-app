import type { ReactNode } from "react";

import { ChannelSidebar } from "@/components/shell/ChannelSidebar";
import { ServerRail } from "@/components/shell/ServerRail";

type ServerSummary = { id: string; name: string };
type ChannelSummary = {
  id: string;
  name: string;
  type: "TEXT" | "CALL";
  isLive: boolean;
  broadcaster: { nickname: string | null } | null;
};

export function AppShell({
  servers,
  currentServerId,
  serverName,
  inviteCode,
  channels,
  currentChannelId,
  user,
  children,
}: {
  servers: ServerSummary[];
  currentServerId: string;
  serverName: string;
  inviteCode: string;
  channels: ChannelSummary[];
  currentChannelId: string;
  user: { nickname: string | null; userTag: string | null; image: string | null };
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-main">
      <ServerRail servers={servers} currentServerId={currentServerId} />
      <ChannelSidebar
        serverId={currentServerId}
        serverName={serverName}
        inviteCode={inviteCode}
        channels={channels}
        currentChannelId={currentChannelId}
        user={user}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
