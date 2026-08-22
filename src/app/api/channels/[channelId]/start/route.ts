import { randomUUID } from "crypto";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Qualquer membro do servidor pode comecar a compartilhar a tela em um
// canal de chamada, desde que ninguem mais esteja transmitindo nele.
export async function POST(
  _request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: params.channelId },
    select: { id: true, type: true, isLive: true, serverId: true },
  });

  if (!channel || channel.type !== "CALL") {
    return NextResponse.json({ error: "Canal de chamada nao encontrado." }, { status: 404 });
  }

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId: channel.serverId } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Voce nao e membro desse servidor." }, { status: 403 });
  }

  if (channel.isLive) {
    return NextResponse.json({ error: "Ja tem alguem compartilhando a tela nesse canal." }, { status: 409 });
  }

  const peerId = `gs-${channel.id}-${randomUUID().slice(0, 8)}`;

  const updated = await prisma.channel.update({
    where: { id: channel.id },
    data: {
      isLive: true,
      peerId,
      broadcasterId: session.user.id,
      broadcastStartedAt: new Date(),
    },
    select: { peerId: true },
  });

  return NextResponse.json({ peerId: updated.peerId });
}
