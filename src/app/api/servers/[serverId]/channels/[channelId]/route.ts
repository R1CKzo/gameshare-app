import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getServerPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const NAME_MAX = 40;

// Renomeia um canal (usado pelo "Editar" inline no ChannelSidebar).
export async function PATCH(request: Request, { params }: { params: { serverId: string; channelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.isOwner && !permissions.canManageChannels) {
    return NextResponse.json({ error: "Sem permissão pra gerenciar canais." }, { status: 403 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: params.channelId },
    select: { serverId: true },
  });
  if (!channel || channel.serverId !== params.serverId) {
    return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > NAME_MAX) {
    return NextResponse.json({ error: `Nome do canal precisa ter entre 1 e ${NAME_MAX} caracteres.` }, { status: 400 });
  }

  const updated = await prisma.channel.update({
    where: { id: params.channelId },
    data: { name },
    select: { id: true, name: true, type: true, position: true },
  });

  return NextResponse.json(updated);
}

// Exclui um canal — nunca deixa o servidor sem nenhum, senao ninguem mais
// conseguiria entrar nele (nem pra criar um canal novo, ja que essa tela
// so aparece dentro de um canal existente).
export async function DELETE(_request: Request, { params }: { params: { serverId: string; channelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.isOwner && !permissions.canManageChannels) {
    return NextResponse.json({ error: "Sem permissão pra gerenciar canais." }, { status: 403 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: params.channelId },
    select: { serverId: true },
  });
  if (!channel || channel.serverId !== params.serverId) {
    return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });
  }

  const channelCount = await prisma.channel.count({ where: { serverId: params.serverId } });
  if (channelCount <= 1) {
    return NextResponse.json({ error: "O servidor precisa ter pelo menos um canal." }, { status: 400 });
  }

  await prisma.channel.delete({ where: { id: params.channelId } });

  return NextResponse.json({ ok: true });
}
