import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { CallChannel } from "@/components/channel/CallChannel";
import { TextChannelView } from "@/components/channel/TextChannelView";
import { AppShell } from "@/components/shell/AppShell";
import { authOptions } from "@/lib/auth";
import { PRESENCE_WINDOW_MS } from "@/lib/callLimits";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ChannelPage({
  params,
}: {
  params: { serverId: string; channelId: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  // Nenhuma dessas 3 consultas depende do resultado das outras (o
  // serverId ja vem pronto da URL) — rodar em paralelo em vez de uma atras
  // da outra corta a viagem ate o banco de 3 idas e voltas pra 1 so.
  const [membership, servers, members] = await Promise.all([
    prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: session.user.id, serverId: params.serverId } },
      select: {
        roleId: true,
        role: { select: { canKick: true, canBan: true, canManageRoles: true, canManageChannels: true } },
        server: {
          select: {
            id: true,
            name: true,
            inviteCode: true,
            ownerId: true,
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
    }),
    prisma.server.findMany({
      where: { members: { some: { userId: session.user.id } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    prisma.serverMember.findMany({
      where: { serverId: params.serverId },
      orderBy: { createdAt: "asc" },
      select: {
        roleId: true,
        role: { select: { id: true, name: true, color: true } },
        user: { select: { id: true, nickname: true, userTag: true, image: true, status: true, lastActiveAt: true } },
      },
    }),
  ]);

  if (!membership) return <NotAMemberScreen />;

  const isOwner = membership.server.ownerId === session.user.id;
  const permissions = {
    isOwner,
    canKick: isOwner || (membership.role?.canKick ?? false),
    canBan: isOwner || (membership.role?.canBan ?? false),
    canManageRoles: isOwner || (membership.role?.canManageRoles ?? false),
    canManageChannels: isOwner || (membership.role?.canManageChannels ?? false),
  };

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
      members={members.map((m) => ({ ...m.user, roleId: m.roleId, role: m.role }))}
      ownerId={membership.server.ownerId}
      permissions={permissions}
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
        <h1 className="font-display text-xl font-bold">Você não é membro desse servidor</h1>
        <p className="mt-2 text-sm text-muted">
          Peça pra quem te chamou o link de convite (algo como /invite/xxxxxxxx) em vez do link do canal.
        </p>
      </div>
    </div>
  );
}
