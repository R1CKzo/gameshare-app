import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { CallChannel } from "@/components/channel/CallChannel";
import { TextChannelView } from "@/components/channel/TextChannelView";
import { AppShell } from "@/components/shell/AppShell";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PRESENCE_WINDOW_MS = 30_000;

export default async function ChannelPage({
  params,
}: {
  params: { serverId: string; channelId: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId: params.serverId } },
    select: {
      server: {
        select: {
          id: true,
          name: true,
          inviteCode: true,
          channels: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              name: true,
              type: true,
              isLive: true,
              broadcaster: { select: { id: true, nickname: true, userTag: true } },
              _count: {
                select: { presences: { where: { updatedAt: { gt: new Date(Date.now() - PRESENCE_WINDOW_MS) } } } },
              },
            },
          },
        },
      },
    },
  });

  if (!membership) return <NotAMemberScreen />;

  const servers = await prisma.server.findMany({
    where: { members: { some: { userId: session.user.id } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const members = await prisma.serverMember.findMany({
    where: { serverId: membership.server.id },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { id: true, nickname: true, userTag: true, image: true } } },
  });

  const channel = membership.server.channels.find((c) => c.id === params.channelId);
  if (!channel) notFound();

  const channelsForSidebar = membership.server.channels.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    isLive: c.isLive,
    broadcaster: c.broadcaster,
    presenceCount: c._count.presences,
  }));

  return (
    <AppShell
      servers={servers}
      currentServerId={membership.server.id}
      serverName={membership.server.name}
      inviteCode={membership.server.inviteCode}
      channels={channelsForSidebar}
      currentChannelId={channel.id}
      members={members.map((m) => m.user)}
      user={{ nickname: session.user.nickname, userTag: session.user.userTag, image: session.user.image ?? null }}
    >
      {channel.type === "TEXT" ? (
        <TextChannelView channelId={channel.id} channelName={channel.name} currentUserId={session.user.id} />
      ) : (
        <CallChannel
          channelId={channel.id}
          channelName={channel.name}
          serverId={membership.server.id}
          currentUserId={session.user.id}
          initialLive={{ isLive: channel.isLive, broadcaster: channel.broadcaster }}
        />
      )}
    </AppShell>
  );
}

function NotAMemberScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div>
        <h1 className="font-display text-xl font-bold">Voce nao e membro desse servidor</h1>
        <p className="mt-2 text-sm text-muted">
          Peca pra quem te chamou o link de convite (algo como /invite/xxxxxxxx) em vez do link do canal.
        </p>
      </div>
    </div>
  );
}
