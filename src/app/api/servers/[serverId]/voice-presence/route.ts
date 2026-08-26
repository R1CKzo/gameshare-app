import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { publicUserImage } from "@/lib/avatarUrl";
import { PRESENCE_WINDOW_MS } from "@/lib/callLimits";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Quem esta em CADA sala de chamada do servidor agora — usado pelo
// ChannelSidebar pra mostrar a lista de gente conectada embaixo de cada
// sala (estilo Discord), pra dar pra ver a atividade sem precisar entrar.
// Diferente do polling de ActiveCallProvider (que so acompanha a sala em
// que a pessoa esta), isso cobre todas as salas de uma vez, com uma unica
// consulta.
export async function GET(_request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId: params.serverId } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Você não é membro desse servidor." }, { status: 403 });
  }

  const channels = await prisma.channel.findMany({
    where: { serverId: params.serverId, type: "CALL" },
    select: {
      id: true,
      presences: {
        where: { updatedAt: { gt: new Date(Date.now() - PRESENCE_WINDOW_MS) } },
        select: {
          isMuted: true,
          isDeafened: true,
          connectionQuality: true,
          user: { select: { id: true, nickname: true, userTag: true, image: true } },
        },
      },
    },
  });

  return NextResponse.json({
    channels: channels.map((c) => ({
      channelId: c.id,
      present: c.presences.map((p) => ({
        ...p.user,
        image: publicUserImage(p.user.id, p.user.image),
        isMuted: p.isMuted,
        isDeafened: p.isDeafened,
        connectionQuality: p.connectionQuality.toLowerCase(),
      })),
    })),
  });
}
