import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_QUALITY = ["GOOD", "MEDIUM", "BAD"] as const;

async function requireParticipant(userId: string, dmChannelId: string) {
  const participant = await prisma.dMParticipant.findUnique({
    where: { dmChannelId_userId: { dmChannelId, userId } },
    select: { id: true },
  });
  return Boolean(participant);
}

// Mesma logica de src/app/api/channels/[channelId]/presence/route.ts,
// pra uma DM em vez de um canal de servidor.
export async function POST(request: Request, { params }: { params: { dmChannelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!(await requireParticipant(session.user.id, params.dmChannelId))) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const peerId: string | undefined = typeof body?.peerId === "string" ? body.peerId : undefined;
  const isMuted: boolean | undefined = typeof body?.isMuted === "boolean" ? body.isMuted : undefined;
  const connectionQuality = VALID_QUALITY.includes(body?.connectionQuality) ? body.connectionQuality : undefined;

  await prisma.dMPresence.upsert({
    where: { dmChannelId_userId: { dmChannelId: params.dmChannelId, userId: session.user.id } },
    create: {
      dmChannelId: params.dmChannelId,
      userId: session.user.id,
      peerId,
      isMuted: isMuted ?? false,
      ...(connectionQuality ? { connectionQuality } : {}),
    },
    update: {
      updatedAt: new Date(),
      ...(peerId !== undefined ? { peerId } : {}),
      ...(isMuted !== undefined ? { isMuted } : {}),
      ...(connectionQuality ? { connectionQuality } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { dmChannelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  await prisma.dMPresence
    .delete({
      where: { dmChannelId_userId: { dmChannelId: params.dmChannelId, userId: session.user.id } },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
