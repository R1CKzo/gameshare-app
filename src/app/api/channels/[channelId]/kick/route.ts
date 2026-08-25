import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getServerPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { CALL_KICKED_EVENT, CALL_UPDATE_EVENT, pusherServer, serverVoicePusherName, textChannelPusherName, userPusherName } from "@/lib/pusher";

// Expulsa alguem da sala de chamada (nao do servidor -- a pessoa pode
// entrar de novo na hora, so encerra a call atual). Mesma permissao
// "canKick" que ja gate a expulsao do servidor inteiro (ver
// src/app/api/servers/[serverId]/members/[userId]/route.ts).
export async function POST(request: Request, { params }: { params: { channelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: params.channelId },
    select: { id: true, serverId: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });
  }

  const permissions = await getServerPermissions(channel.serverId, session.user.id);
  if (!permissions.canKick) {
    return NextResponse.json({ error: "Sem permissão pra expulsar da chamada." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const targetUserId: string | undefined = typeof body?.userId === "string" ? body.userId : undefined;
  if (!targetUserId) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  }

  const server = await prisma.server.findUnique({ where: { id: channel.serverId }, select: { ownerId: true } });
  if (targetUserId === server?.ownerId) {
    return NextResponse.json({ error: "Não é possível expulsar o dono do servidor da chamada." }, { status: 400 });
  }

  await prisma.channelPresence
    .delete({ where: { channelId_userId: { channelId: channel.id, userId: targetUserId } } })
    .catch(() => {});

  pusherServer.trigger(textChannelPusherName(channel.id), CALL_UPDATE_EVENT, {}).catch(() => {});
  pusherServer.trigger(serverVoicePusherName(channel.serverId), CALL_UPDATE_EVENT, {}).catch(() => {});
  // Avisa o proprio expulso pra ele sair de verdade (desligar mic, fechar
  // a malha de voz) -- sem isso, so apagar a presenca no banco deixava o
  // client dele "fantasma": continuava conectado achando que ainda estava
  // na sala, so os outros deixavam de ve-lo.
  pusherServer.trigger(userPusherName(targetUserId), CALL_KICKED_EVENT, { channelId: channel.id }).catch(() => {});

  return NextResponse.json({ ok: true });
}
