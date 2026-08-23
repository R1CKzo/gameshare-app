import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getServerPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.canBan) {
    return NextResponse.json({ error: "Sem permissao pra ver banimentos." }, { status: 403 });
  }

  const bans = await prisma.serverBan.findMany({
    where: { serverId: params.serverId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reason: true,
      createdAt: true,
      user: { select: { id: true, nickname: true, userTag: true, image: true } },
    },
  });

  return NextResponse.json({ bans });
}

// Banir = expulsar + registrar em ServerBan (impede reentrar pelo convite).
export async function POST(request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.canBan) {
    return NextResponse.json({ error: "Sem permissao pra banir membros." }, { status: 403 });
  }

  const server = await prisma.server.findUnique({
    where: { id: params.serverId },
    select: { ownerId: true },
  });
  if (!server) {
    return NextResponse.json({ error: "Servidor nao encontrado." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const userId: string = body?.userId;
  const reason: string | null = typeof body?.reason === "string" ? body.reason.slice(0, 300) : null;
  if (!userId) {
    return NextResponse.json({ error: "Informe o usuario a banir." }, { status: 400 });
  }
  if (userId === server.ownerId) {
    return NextResponse.json({ error: "Nao e possivel banir o dono do servidor." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.serverMember.deleteMany({ where: { userId, serverId: params.serverId } }),
    prisma.serverBan.upsert({
      where: { serverId_userId: { serverId: params.serverId, userId } },
      create: { serverId: params.serverId, userId, reason },
      update: { reason },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
