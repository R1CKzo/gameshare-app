import { randomUUID } from "crypto";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Inicia (ou reinicia) a live do usuario autenticado.
// Gera/atualiza o peerId usado pelo PeerJS no lado do streamer.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.nickname || !session.user.userTag) {
    return NextResponse.json({ error: "Nao autenticado ou nickname pendente." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const title: string = body?.title?.trim() || `Live de ${session.user.nickname}`;

  const peerId = `gs-${session.user.id}-${randomUUID().slice(0, 8)}`;

  const stream = await prisma.stream.upsert({
    where: { userId: session.user.id },
    create: {
      title,
      peerId,
      isLive: true,
      userId: session.user.id,
    },
    update: {
      title,
      peerId,
      isLive: true,
    },
  });

  return NextResponse.json({
    id: stream.id,
    title: stream.title,
    peerId: stream.peerId,
    isLive: stream.isLive,
    usernameTag: `${session.user.nickname}#${session.user.userTag}`,
  });
}

// Encerra a live do usuario autenticado.
export async function PATCH() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const stream = await prisma.stream.updateMany({
    where: { userId: session.user.id },
    data: { isLive: false },
  });

  return NextResponse.json({ updated: stream.count });
}
