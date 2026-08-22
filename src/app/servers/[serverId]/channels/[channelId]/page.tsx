import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { CallChannel } from "@/components/channel/CallChannel";
import { TextChannelView } from "@/components/channel/TextChannelView";
import { AppShell } from "@/components/shell/AppShell";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
          channels: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              name: true,
              type: true,
              isLive: true,
              peerId: true,
              broadcaster: { select: { id: true, nickname: true, userTag: true } },
            },
          },
        },
      },
    },
  });

  if (!membership) notFound();

  const servers = await prisma.server.findMany({
    where: { members: { some: { userId: session.user.id } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const channel = membership.server.channels.find((c) => c.id === params.channelId);
  if (!channel) notFound();

  return (
    <AppShell
      servers={servers}
      currentServerId={membership.server.id}
      serverName={membership.server.name}
      channels={membership.server.channels}
      currentChannelId={channel.id}
      user={{ nickname: session.user.nickname, userTag: session.user.userTag, image: session.user.image ?? null }}
    >
      {channel.type === "TEXT" ? (
        <TextChannelView name={channel.name} />
      ) : (
        <CallChannel
          channelId={channel.id}
          channelName={channel.name}
          currentUserId={session.user.id}
          initialLive={{ isLive: channel.isLive, peerId: channel.peerId, broadcaster: channel.broadcaster }}
        />
      )}
    </AppShell>
  );
}
