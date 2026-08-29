import { NextResponse } from "next/server";

import { publicServerImage, publicUserImage } from "@/lib/avatarUrl";
import { corsPreflight, withCors } from "@/lib/cors";
import { getRequestSession } from "@/lib/getRequestSession";
import { PRESENCE_WINDOW_MS } from "@/lib/callLimits";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Mesmos dados que src/app/servers/[serverId]/channels/[channelId]/page.tsx
// calcula direto no Prisma (server component) -- essa e a versao pro app
// de desktop embutido buscar via fetch (ver desktop-ui/app/page.tsx).
// Token + CORS, mesmo padrao das outras rotas "shell"/"entry" da Fase 3.
export async function GET(
  request: Request,
  { params }: { params: { serverId: string; channelId: string } },
) {
  const session = await getRequestSession(request);
  if (!session?.user?.id) {
    return withCors(request, NextResponse.json({ error: "Não autenticado." }, { status: 401 }));
  }

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
            image: true,
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
      select: { id: true, name: true, image: true },
    }),
    prisma.serverMember.findMany({
      where: { serverId: params.serverId },
      orderBy: { createdAt: "asc" },
      select: {
        roleId: true,
        role: { select: { id: true, name: true, color: true } },
        user: {
          select: { id: true, nickname: true, userTag: true, image: true, status: true, lastActiveAt: true, currentActivity: true },
        },
      },
    }),
  ]);

  if (!membership) {
    return withCors(request, NextResponse.json({ error: "not-a-member" }, { status: 403 }));
  }

  const channel = membership.server.channels.find((c) => c.id === params.channelId);
  if (!channel) {
    return withCors(request, NextResponse.json({ error: "not-found" }, { status: 404 }));
  }

  const isOwner = membership.server.ownerId === session.user.id;
  const permissions = {
    isOwner,
    canKick: isOwner || (membership.role?.canKick ?? false),
    canBan: isOwner || (membership.role?.canBan ?? false),
    canManageRoles: isOwner || (membership.role?.canManageRoles ?? false),
    canManageChannels: isOwner || (membership.role?.canManageChannels ?? false),
  };

  return withCors(
    request,
    NextResponse.json({
      servers: servers.map((s) => ({ ...s, image: publicServerImage(s.id, s.image) })),
      server: {
        id: membership.server.id,
        name: membership.server.name,
        image: publicServerImage(membership.server.id, membership.server.image),
        inviteCode: membership.server.inviteCode,
        ownerId: membership.server.ownerId,
      },
      channels: membership.server.channels.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        isLive: c.isLive,
        broadcaster: c.broadcaster,
        presenceCount: c._count.presences,
      })),
      channel: { id: channel.id, name: channel.name, type: channel.type, isLive: channel.isLive, broadcaster: channel.broadcaster },
      members: members.map((m) => ({ ...m.user, image: publicUserImage(m.user.id, m.user.image), roleId: m.roleId, role: m.role })),
      permissions,
    }),
  );
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
