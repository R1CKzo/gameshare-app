import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PRESENCE_WINDOW_MS = 30_000;

// Mesma logica de src/app/api/channels/[channelId]/route.ts (GET), pra
// uma DM: quem esta compartilhando a tela agora e quem esta presente na
// chamada, com o peerId de cada um pra montar a malha de voz.
export async function GET(_request: Request, { params }: { params: { dmChannelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const dmChannel = await prisma.dMChannel.findUnique({
    where: { id: params.dmChannelId },
    select: {
      id: true,
      isLive: true,
      participants: { select: { userId: true } },
      broadcaster: { select: { id: true, nickname: true, userTag: true, image: true } },
      presences: {
        where: { updatedAt: { gt: new Date(Date.now() - PRESENCE_WINDOW_MS) } },
        select: {
          peerId: true,
          isMuted: true,
          connectionQuality: true,
          user: { select: { id: true, nickname: true, userTag: true, image: true } },
        },
      },
    },
  });

  if (!dmChannel || !dmChannel.participants.some((p) => p.userId === session.user.id)) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    id: dmChannel.id,
    isLive: dmChannel.isLive,
    broadcaster: dmChannel.broadcaster,
    present: dmChannel.presences.map((p) => ({
      ...p.user,
      peerId: p.peerId,
      isMuted: p.isMuted,
      connectionQuality: p.connectionQuality.toLowerCase(),
    })),
  });
}
