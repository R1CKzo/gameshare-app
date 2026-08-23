import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: params.channelId },
    select: { id: true, broadcasterId: true },
  });

  if (!channel) {
    return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });
  }

  if (channel.broadcasterId !== session.user.id) {
    return NextResponse.json({ error: "Só quem está compartilhando pode encerrar." }, { status: 403 });
  }

  await prisma.channel.update({
    where: { id: channel.id },
    data: { isLive: false, broadcasterId: null, broadcastStartedAt: null },
  });

  return NextResponse.json({ ok: true });
}
