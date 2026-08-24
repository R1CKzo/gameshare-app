import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getServerPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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
