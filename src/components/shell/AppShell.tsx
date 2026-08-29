"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { ChannelSidebar } from "@/components/shell/ChannelSidebar";
import { MemberList } from "@/components/shell/MemberList";
import { MobileUIContext } from "@/components/shell/MobileUIContext";
import { ServerRail } from "@/components/shell/ServerRail";
import { setLastChannel } from "@/lib/lastChannel";

type ServerSummary = { id: string; name: string; image: string | null };
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
  status: "ONLINE" | "AWAY" | "BUSY" | null;
  lastActiveAt: string | Date | null;
  roleId: string | null;
  role: RoleSummary | null;
};
type ServerPermissions = { isOwner: boolean; canKick: boolean; canBan: boolean; canManageRoles: boolean; canManageChannels: boolean };

export function AppShell({
  servers,
  currentServerId,
  serverName,
  serverImage,
  inviteCode,
  channels,
  currentChannelId,
  members,
  ownerId,
  permissions,
  user,
  children,
}: {
  servers: ServerSummary[];
  currentServerId: string;
  serverName: string;
  serverImage: string | null;
  inviteCode: string;
  channels: ChannelSummary[];
  currentChannelId: string;
  members: MemberSummary[];
  ownerId: string;
  permissions: ServerPermissions;
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

  // Lembra o ultimo canal visitado desse servidor, pra ServerRail poder
  // linkar direto pra ca da proxima vez (ver src/lib/lastChannel.ts)
  useEffect(() => {
    setLastChannel(currentServerId, currentChannelId);
  }, [currentServerId, currentChannelId]);

  return (
    <MobileUIContext.Provider
      value={{
        toggleSidebar: () => setSidebarOpen((v) => !v),
        toggleMembers: () => setMembersOpen((v) => !v),
      }}
    >
      <div className="relative flex h-[calc(100dvh_-_var(--titlebar-h,0px))] w-screen gs-anim-slide-up overflow-hidden bg-main">
        {(sidebarOpen || membersOpen) && (
          <div
            onClick={() => {
              setSidebarOpen(false);
              setMembersOpen(false);
            }}
            className="fixed inset-0 z-40 gs-anim-fade bg-black/60 md:hidden"
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
            serverImage={serverImage}
            inviteCode={inviteCode}
            channels={channels}
            currentChannelId={currentChannelId}
            members={members}
            ownerId={ownerId}
            permissions={permissions}
            user={user}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">{children}</div>

        <div
          className={`fixed inset-y-0 right-0 z-50 translate-x-full transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
            membersOpen ? "translate-x-0" : ""
          }`}
        >
          <MemberList serverId={currentServerId} members={members} />
        </div>
      </div>
    </MobileUIContext.Provider>
  );
}
