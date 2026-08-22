"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { ChannelSidebar } from "@/components/shell/ChannelSidebar";
import { MemberList } from "@/components/shell/MemberList";
import { MobileUIContext } from "@/components/shell/MobileUIContext";
import { ServerRail } from "@/components/shell/ServerRail";

type ServerSummary = { id: string; name: string };
type ChannelSummary = {
  id: string;
  name: string;
  type: "TEXT" | "CALL";
  isLive: boolean;
  broadcaster: { nickname: string | null } | null;
  presenceCount: number;
};
type MemberSummary = { id: string; nickname: string | null; userTag: string | null; image: string | null };

export function AppShell({
  servers,
  currentServerId,
  serverName,
  inviteCode,
  channels,
  currentChannelId,
  members,
  user,
  children,
}: {
  servers: ServerSummary[];
  currentServerId: string;
  serverName: string;
  inviteCode: string;
  channels: ChannelSummary[];
  currentChannelId: string;
  members: MemberSummary[];
  user: { nickname: string | null; userTag: string | null; image: string | null };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  // Fecha os paineis moveis sempre que o usuario navega pra outro canal/servidor
  useEffect(() => {
    setSidebarOpen(false);
    setMembersOpen(false);
  }, [pathname]);

  return (
    <MobileUIContext.Provider
      value={{
        toggleSidebar: () => setSidebarOpen((v) => !v),
        toggleMembers: () => setMembersOpen((v) => !v),
      }}
    >
      <div className="relative flex h-[100dvh] w-screen overflow-hidden bg-main">
        {(sidebarOpen || membersOpen) && (
          <div
            onClick={() => {
              setSidebarOpen(false);
              setMembersOpen(false);
            }}
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
          />
        )}

        <div
          className={`fixed inset-y-0 left-0 z-50 flex -translate-x-full transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : ""
          }`}
        >
          <ServerRail servers={servers} currentServerId={currentServerId} />
          <ChannelSidebar
            serverId={currentServerId}
            serverName={serverName}
            inviteCode={inviteCode}
            channels={channels}
            currentChannelId={currentChannelId}
            user={user}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">{children}</div>

        <div
          className={`fixed inset-y-0 right-0 z-50 translate-x-full transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
            membersOpen ? "translate-x-0" : ""
          }`}
        >
          <MemberList members={members} />
        </div>
      </div>
    </MobileUIContext.Provider>
  );
}
