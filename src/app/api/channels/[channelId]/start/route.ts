import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CALL_UPDATE_EVENT, pusherServer, serverVoicePusherName, textChannelPusherName } from "@/lib/pusher";

// Qualquer membro presente na sala (ja conectado na malha de voz) pode
// comecar a compartilhar a tela, desde que ninguem mais esteja
// transmitindo nela agora. O video em si viaja pela conexao de voz que a
// pessoa ja tem com quem mais estiver na sala — aqui so marcamos quem e o
// dono da transmissao pra UI.
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
    select: { id: true, type: true, isLive: true, serverId: true },
  });

  if (!channel || channel.type !== "CALL") {
    return NextResponse.json({ error: "Canal de chamada não encontrado." }, { status: 404 });
  }

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId: channel.serverId } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Você não é membro desse servidor." }, { status: 403 });
  }

  const presence = await prisma.channelPresence.findUnique({
    where: { channelId_userId: { channelId: channel.id, userId: session.user.id } },
    select: { id: true },
  });
  if (!presence) {
    return NextResponse.json({ error: "Entre na sala antes de compartilhar a tela." }, { status: 409 });
  }

  if (channel.isLive) {
    return NextResponse.json({ error: "Já tem alguém compartilhando a tela nesse canal." }, { status: 409 });
  }

  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      isLive: true,
      broadcasterId: session.user.id,
      broadcastStartedAt: new Date(),
    },
  });

  pusherServer.trigger(textChannelPusherName(channel.id), CALL_UPDATE_EVENT, {}).catch(() => {});
  pusherServer.trigger(serverVoicePusherName(channel.serverId), CALL_UPDATE_EVENT, {}).catch(() => {});

  return NextResponse.json({ ok: true });
}
