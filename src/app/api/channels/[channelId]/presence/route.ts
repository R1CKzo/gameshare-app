import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Heartbeat: registra que o usuario esta com essa sala de chamada aberta
// agora, mesmo sem estar compartilhando a tela. Chamado periodicamente
// pelo client enquanto a pagina do canal estiver aberta.
export async function POST(
  _request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  await prisma.channelPresence.upsert({
    where: { channelId_userId: { channelId: params.channelId, userId: session.user.id } },
    create: { channelId: params.channelId, userId: session.user.id },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

// Sai da sala (fechou a aba, trocou de canal). Best-effort.
export async function DELETE(
  _request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  await prisma.channelPresence
    .delete({
      where: { channelId_userId: { channelId: params.channelId, userId: session.user.id } },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
