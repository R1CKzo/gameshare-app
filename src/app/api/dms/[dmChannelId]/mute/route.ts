import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireParticipant(userId: string, dmChannelId: string): Promise<boolean> {
  const participant = await prisma.dMParticipant.findUnique({
    where: { dmChannelId_userId: { dmChannelId, userId } },
    select: { id: true },
  });
  return Boolean(participant);
}

// Mesma logica do mute de canal (upsert/deleteMany em vez de update), so
// que pra uma DM em vez de um canal de servidor.
export async function PATCH(request: Request, { params }: { params: { dmChannelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body?.muted !== "boolean") {
    return NextResponse.json({ error: "Campo 'muted' inválido." }, { status: 400 });
  }

  if (!(await requireParticipant(session.user.id, params.dmChannelId))) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  if (body.muted) {
    await prisma.dMMute.upsert({
      where: { userId_dmChannelId: { userId: session.user.id, dmChannelId: params.dmChannelId } },
      create: { userId: session.user.id, dmChannelId: params.dmChannelId },
      update: {},
    });
  } else {
    await prisma.dMMute.deleteMany({
      where: { userId: session.user.id, dmChannelId: params.dmChannelId },
    });
  }

  return NextResponse.json({ ok: true });
}
