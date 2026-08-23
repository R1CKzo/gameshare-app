import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// O dono nao pode sair (Server.ownerId ficaria orfao, sem ninguem
// responsavel) — a saida dele e excluir o servidor (DELETE na rota raiz).
export async function DELETE(_request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const server = await prisma.server.findUnique({
    where: { id: params.serverId },
    select: { ownerId: true },
  });
  if (!server) {
    return NextResponse.json({ error: "Servidor nao encontrado." }, { status: 404 });
  }

  if (server.ownerId === session.user.id) {
    return NextResponse.json(
      { error: "Voce e o dono desse servidor — pra sair, exclua o servidor em vez disso." },
      { status: 400 },
    );
  }

  await prisma.serverMember.deleteMany({
    where: { userId: session.user.id, serverId: params.serverId },
  });

  return NextResponse.json({ ok: true });
}
