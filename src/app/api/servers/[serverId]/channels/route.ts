import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getServerPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const NAME_MAX = 40;

export async function GET(_request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.isOwner && !permissions.canManageChannels) {
    return NextResponse.json({ error: "Sem permissão pra gerenciar canais." }, { status: 403 });
  }

  const channels = await prisma.channel.findMany({
    where: { serverId: params.serverId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, type: true, position: true },
  });

  return NextResponse.json({ channels });
}

// Cria um canal na proxima posicao livre (max atual + 1, nao so a
// contagem — senao um canal criado depois de uma exclusao no meio podia
// colidir de posicao com um canal existente).
export async function POST(request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.isOwner && !permissions.canManageChannels) {
    return NextResponse.json({ error: "Sem permissão pra gerenciar canais." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name: string = (body?.name ?? "").trim();
  if (!name || name.length > NAME_MAX) {
    return NextResponse.json({ error: `Nome do canal precisa ter entre 1 e ${NAME_MAX} caracteres.` }, { status: 400 });
  }
  const type = body?.type === "CALL" ? "CALL" : body?.type === "TEXT" ? "TEXT" : null;
  if (!type) {
    return NextResponse.json({ error: "Tipo de canal inválido." }, { status: 400 });
  }

  const { _max } = await prisma.channel.aggregate({
    where: { serverId: params.serverId },
    _max: { position: true },
  });

  const channel = await prisma.channel.create({
    data: { serverId: params.serverId, name, type, position: (_max.position ?? -1) + 1 },
    select: { id: true, name: true, type: true, position: true },
  });

  return NextResponse.json(channel);
}
