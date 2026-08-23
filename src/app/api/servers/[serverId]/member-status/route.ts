import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// So id+status+lastActiveAt de cada membro — MemberList.tsx faz poll leve
// nisso (~15s) pra atualizar as bolinhas de presenca sem reconsultar nome,
// foto e cargo de todo mundo de novo.
export async function GET(_request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId: params.serverId } },
    select: { userId: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Você não é membro desse servidor." }, { status: 403 });
  }

  const members = await prisma.serverMember.findMany({
    where: { serverId: params.serverId },
    select: { user: { select: { id: true, status: true, lastActiveAt: true } } },
  });

  return NextResponse.json({
    members: members.map((m) => ({ id: m.user.id, status: m.user.status, lastActiveAt: m.user.lastActiveAt })),
  });
}
