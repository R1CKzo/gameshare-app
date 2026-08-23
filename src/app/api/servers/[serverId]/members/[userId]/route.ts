import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getServerPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Expulsar um membro (nao bane — a pessoa pode reentrar pelo convite).
export async function DELETE(_request: Request, { params }: { params: { serverId: string; userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.canKick) {
    return NextResponse.json({ error: "Sem permissao pra expulsar membros." }, { status: 403 });
  }

  const server = await prisma.server.findUnique({
    where: { id: params.serverId },
    select: { ownerId: true },
  });
  if (!server) {
    return NextResponse.json({ error: "Servidor nao encontrado." }, { status: 404 });
  }
  if (params.userId === server.ownerId) {
    return NextResponse.json({ error: "Nao e possivel expulsar o dono do servidor." }, { status: 400 });
  }

  await prisma.serverMember.deleteMany({
    where: { userId: params.userId, serverId: params.serverId },
  });

  return NextResponse.json({ ok: true });
}
