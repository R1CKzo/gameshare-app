import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Exclui o servidor inteiro — so o dono pode. Cascata do schema ja cuida
// de membros, canais, mensagens, cargos e banimentos.
export async function DELETE(_request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const server = await prisma.server.findUnique({
    where: { id: params.serverId },
    select: { ownerId: true },
  });
  if (!server) {
    return NextResponse.json({ error: "Servidor não encontrado." }, { status: 404 });
  }
  if (server.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Só o dono pode excluir o servidor." }, { status: 403 });
  }

  await prisma.server.delete({ where: { id: params.serverId } });

  return NextResponse.json({ ok: true });
}
