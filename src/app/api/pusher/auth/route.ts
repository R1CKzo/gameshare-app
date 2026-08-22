import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";

// Autoriza a inscricao num canal privado do Pusher. So deixa passar se a
// pessoa logada for membro do servidor dono do canal de texto — sem isso,
// qualquer um com o channelId conseguiria escutar as mensagens.
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

  const channelId = channelName.replace(/^private-channel-/, "");
  if (channelId === channelName) {
    return NextResponse.json({ error: "Canal invalido." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { serverId: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Canal nao encontrado." }, { status: 404 });
  }

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId: channel.serverId } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Voce nao e membro desse servidor." }, { status: 403 });
  }

  const authResponse = pusherServer.authorizeChannel(socketId, channelName);
  return NextResponse.json(authResponse);
}
