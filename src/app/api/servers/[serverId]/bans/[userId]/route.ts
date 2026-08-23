import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getServerPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Desbanir — a pessoa volta a poder entrar pelo convite.
export async function DELETE(_request: Request, { params }: { params: { serverId: string; userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.canBan) {
    return NextResponse.json({ error: "Sem permissao pra desbanir membros." }, { status: 403 });
  }

  await prisma.serverBan.deleteMany({
    where: { userId: params.userId, serverId: params.serverId },
  });

  return NextResponse.json({ ok: true });
}
