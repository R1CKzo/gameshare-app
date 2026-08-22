import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PRESENCE_WINDOW_MS = 30_000;

// Estado atual do canal: quem esta compartilhando a tela (se alguem) e
// quem esta presente na sala agora, com o peerId de voz de cada um pra
// montar a malha de conexoes.
export async function GET(
  _request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: params.channelId },
    select: {
      id: true,
      isLive: true,
      serverId: true,
      broadcaster: { select: { id: true, nickname: true, userTag: true, image: true } },
      presences: {
        where: { updatedAt: { gt: new Date(Date.now() - PRESENCE_WINDOW_MS) } },
        select: {
          peerId: true,
          user: { select: { id: true, nickname: true, userTag: true, image: true } },
        },
      },
    },
  });

  if (!channel) {
    return NextResponse.json({ error: "Canal nao encontrado." }, { status: 404 });
  }

  // Sem isso, qualquer pessoa logada (nao so quem e membro do servidor)
  // conseguia consultar quem esta numa chamada de qualquer servidor —
  // nome, foto e ate o peerId usado pra discar na malha de voz.
  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId: channel.serverId } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Voce nao e membro desse servidor." }, { status: 403 });
  }

  return NextResponse.json({
    id: channel.id,
    isLive: channel.isLive,
    broadcaster: channel.broadcaster,
    present: channel.presences.map((p) => ({ ...p.user, peerId: p.peerId })),
  });
}
