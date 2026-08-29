import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { publicUserImage } from "@/lib/avatarUrl";
import { PRESENCE_WINDOW_MS } from "@/lib/callLimits";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Estado atual do canal: quem esta compartilhando a tela (se alguem) e
// quem esta presente na sala agora, com o peerId de voz de cada um pra
// montar a malha de conexoes.
export async function GET(
  _request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: params.channelId },
    select: {
      id: true,
      isLive: true,
      serverId: true,
      broadcaster: { select: { id: true, nickname: true, userTag: true, image: true } },
      presences: {
        where: { updatedAt: { gt: new Date(Date.now() - PRESENCE_WINDOW_MS) } },
        // Sem isso o Postgres nao garante a mesma ordem entre uma consulta
        // e outra (updatedAt muda a cada heartbeat/mudanca de mute, o que
        // pode reordenar as linhas fisicamente) -- sem ordem fixa, os
        // icones dos participantes ficavam trocando de posicao sozinhos a
        // cada poll (~12s, ver ActiveCallProvider.tsx).
        orderBy: { id: "asc" },
        select: {
          peerId: true,
          isMuted: true,
          isDeafened: true,
          connectionQuality: true,
          user: { select: { id: true, nickname: true, userTag: true, image: true } },
        },
      },
    },
  });

  if (!channel) {
    return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });
  }

  // Sem isso, qualquer pessoa logada (nao so quem e membro do servidor)
  // conseguia consultar quem esta numa chamada de qualquer servidor —
  // nome, foto e ate o peerId usado pra discar na malha de voz.
  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId: channel.serverId } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Você não é membro desse servidor." }, { status: 403 });
  }

  return NextResponse.json({
    id: channel.id,
    isLive: channel.isLive,
    broadcaster: channel.broadcaster
      ? { ...channel.broadcaster, image: publicUserImage(channel.broadcaster.id, channel.broadcaster.image) }
      : null,
    present: channel.presences.map((p) => ({
      ...p.user,
      image: publicUserImage(p.user.id, p.user.image),
      peerId: p.peerId,
      isMuted: p.isMuted,
      isDeafened: p.isDeafened,
      connectionQuality: p.connectionQuality.toLowerCase(),
    })),
  });
}
