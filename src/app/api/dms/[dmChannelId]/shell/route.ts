import { NextResponse } from "next/server";

import { corsPreflight, withCors } from "@/lib/cors";
import { getRequestSession } from "@/lib/getRequestSession";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Mesmos dados que src/app/dms/[dmChannelId]/page.tsx calcula direto no
// Prisma -- versao pro app de desktop embutido (ver desktop-ui/app/page.tsx).
export async function GET(request: Request, { params }: { params: { dmChannelId: string } }) {
  const session = await getRequestSession(request);
  if (!session?.user?.id) {
    return withCors(request, NextResponse.json({ error: "Não autenticado." }, { status: 401 }));
  }

  const [dmChannel, servers] = await Promise.all([
    prisma.dMChannel.findUnique({
      where: { id: params.dmChannelId },
      select: {
        id: true,
        isLive: true,
        broadcaster: { select: { id: true, nickname: true, userTag: true } },
        participants: {
          select: { user: { select: { id: true, nickname: true, userTag: true, image: true } } },
        },
      },
    }),
    prisma.server.findMany({
      where: { members: { some: { userId: session.user.id } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, image: true },
    }),
  ]);

  const isParticipant = dmChannel?.participants.some((p) => p.user.id === session.user.id) ?? false;
  const otherUser = dmChannel?.participants.map((p) => p.user).find((u) => u.id !== session.user.id);

  if (!dmChannel || !isParticipant || !otherUser) {
    return withCors(request, NextResponse.json({ error: "not-found" }, { status: 404 }));
  }

  return withCors(
    request,
    NextResponse.json({
      servers,
      dmChannel: { id: dmChannel.id, isLive: dmChannel.isLive, broadcaster: dmChannel.broadcaster },
      otherUser,
    }),
  );
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
