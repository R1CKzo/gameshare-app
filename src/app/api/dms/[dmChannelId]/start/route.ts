import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CALL_UPDATE_EVENT, dmChannelPusherName, pusherServer } from "@/lib/pusher";

// Mesma logica de src/app/api/channels/[channelId]/start/route.ts, pra
// uma DM: quem ja esta presente na chamada pode comecar a compartilhar a
// tela, desde que ninguem mais esteja.
export async function POST(_request: Request, { params }: { params: { dmChannelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const dmChannel = await prisma.dMChannel.findUnique({
    where: { id: params.dmChannelId },
    select: { id: true, isLive: true },
  });
  if (!dmChannel) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  const participant = await prisma.dMParticipant.findUnique({
    where: { dmChannelId_userId: { dmChannelId: dmChannel.id, userId: session.user.id } },
    select: { id: true },
  });
  if (!participant) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  const presence = await prisma.dMPresence.findUnique({
    where: { dmChannelId_userId: { dmChannelId: dmChannel.id, userId: session.user.id } },
    select: { id: true },
  });
  if (!presence) {
    return NextResponse.json({ error: "Entre na chamada antes de compartilhar a tela." }, { status: 409 });
  }

  if (dmChannel.isLive) {
    return NextResponse.json({ error: "Já tem alguém compartilhando a tela." }, { status: 409 });
  }

  await prisma.dMChannel.update({
    where: { id: dmChannel.id },
    data: { isLive: true, broadcasterId: session.user.id, broadcastStartedAt: new Date() },
  });

  pusherServer.trigger(dmChannelPusherName(dmChannel.id), CALL_UPDATE_EVENT, {}).catch(() => {});

  return NextResponse.json({ ok: true });
}
