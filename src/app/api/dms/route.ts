import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { publicUserImage } from "@/lib/avatarUrl";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const userSelect = {
  id: true,
  nickname: true,
  userTag: true,
  image: true,
  status: true,
  lastActiveAt: true,
  currentActivity: true,
} as const;

// Lista minhas conversas diretas, com a outra pessoa e a ultima mensagem
// (pra mostrar uma previa), mais recente primeiro.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const channels = await prisma.dMChannel.findMany({
    where: { participants: { some: { userId: session.user.id } } },
    select: {
      id: true,
      participants: { select: { user: { select: userSelect } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, createdAt: true } },
    },
  });

  const conversations = channels
    .map((c) => {
      const raw = c.participants.map((p) => p.user).find((u) => u.id !== session.user.id) ?? null;
      const other = raw ? { ...raw, image: publicUserImage(raw.id, raw.image) } : null;
      const lastMessage = c.messages[0] ?? null;
      return { id: c.id, user: other, lastMessage };
    })
    .filter((c) => c.user !== null)
    .sort((a, b) => {
      const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });

  return NextResponse.json({ conversations });
}

// Abre (ou reaproveita) a conversa direta com um amigo. So funciona entre
// amigos de verdade — nao da pra iniciar DM com qualquer usuario do app.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const friendId = typeof body?.friendId === "string" ? body.friendId : "";
  if (!friendId) {
    return NextResponse.json({ error: "Amigo inválido." }, { status: 400 });
  }

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: session.user.id, addresseeId: friendId },
        { requesterId: friendId, addresseeId: session.user.id },
      ],
    },
    select: { id: true },
  });
  if (!friendship) {
    return NextResponse.json({ error: "Vocês precisam ser amigos pra conversar." }, { status: 403 });
  }

  const existing = await prisma.dMChannel.findFirst({
    where: {
      participants: { some: { userId: session.user.id } },
      AND: { participants: { some: { userId: friendId } } },
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ id: existing.id });
  }

  const created = await prisma.dMChannel.create({
    data: { participants: { create: [{ userId: session.user.id }, { userId: friendId }] } },
    select: { id: true },
  });
  return NextResponse.json({ id: created.id });
}
