import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Marca "li ate agora" nesse canal — chamado quando a tela do canal monta,
// e de novo quando chega mensagem nova enquanto a pessoa ja esta vendo ele.
export async function POST(_request: Request, { params }: { params: { channelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  await prisma.channelRead.upsert({
    where: { userId_channelId: { userId: session.user.id, channelId: params.channelId } },
    create: { userId: session.user.id, channelId: params.channelId },
    update: { lastReadAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
