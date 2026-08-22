import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Estado atual do canal (usado pelos espectadores para saber se ha
// transmissao ao vivo e qual o peerId para conectar).
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
      peerId: true,
      broadcaster: { select: { id: true, nickname: true, userTag: true, image: true } },
    },
  });

  if (!channel) {
    return NextResponse.json({ error: "Canal nao encontrado." }, { status: 404 });
  }

  return NextResponse.json(channel);
}
