import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CALL_UPDATE_EVENT, dmChannelPusherName, pusherServer } from "@/lib/pusher";

export async function POST(_request: Request, { params }: { params: { dmChannelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const dmChannel = await prisma.dMChannel.findUnique({
    where: { id: params.dmChannelId },
    select: { id: true, broadcasterId: true },
  });
  if (!dmChannel) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }
  if (dmChannel.broadcasterId !== session.user.id) {
    return NextResponse.json({ error: "Só quem está compartilhando pode encerrar." }, { status: 403 });
  }

  await prisma.dMChannel.update({
    where: { id: dmChannel.id },
    data: { isLive: false, broadcasterId: null, broadcastStartedAt: null },
  });

  pusherServer.trigger(dmChannelPusherName(dmChannel.id), CALL_UPDATE_EVENT, {}).catch(() => {});

  return NextResponse.json({ ok: true });
}
