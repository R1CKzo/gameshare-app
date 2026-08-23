import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";

// Autoriza a inscricao num canal privado do Pusher — de um canal de texto
// de servidor ("private-channel-...") ou de uma DM ("private-dm-...").
// So deixa passar se a pessoa logada realmente faz parte daquela
// conversa; sem isso, qualquer um com o id conseguiria escutar as
// mensagens de qualquer canal ou DM.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const body = await request.formData();
  const socketId = body.get("socket_id");
  const channelName = body.get("channel_name");
  if (typeof socketId !== "string" || typeof channelName !== "string") {
    return NextResponse.json({ error: "Requisicao invalida." }, { status: 400 });
  }

  const authorized = channelName.startsWith("private-dm-")
    ? await canAccessDM(session.user.id, channelName.replace(/^private-dm-/, ""))
    : channelName.startsWith("private-channel-")
      ? await canAccessServerChannel(session.user.id, channelName.replace(/^private-channel-/, ""))
      : channelName.startsWith("private-user-")
        ? channelName.replace(/^private-user-/, "") === session.user.id
        : false;

  if (!authorized) {
    return NextResponse.json({ error: "Sem acesso a esse canal." }, { status: 403 });
  }

  const authResponse = pusherServer.authorizeChannel(socketId, channelName);
  return NextResponse.json(authResponse);
}

async function canAccessServerChannel(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { serverId: true },
  });
  if (!channel) return false;

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
    select: { id: true },
  });
  return Boolean(membership);
}

async function canAccessDM(userId: string, dmChannelId: string) {
  const participant = await prisma.dMParticipant.findUnique({
    where: { dmChannelId_userId: { dmChannelId, userId } },
    select: { id: true },
  });
  return Boolean(participant);
}
