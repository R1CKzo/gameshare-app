import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Mesmo padrao de requireMembership do presence/route.ts desse canal.
async function requireMembership(userId: string, channelId: string): Promise<boolean> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
  if (!channel) return false;
  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
    select: { id: true },
  });
  return Boolean(membership);
}

// Silencia (ou reativa) notificacoes so desse canal pra quem chamou. Sem
// linha em ChannelMute = nao silenciado (mesma logica de ChannelRead) --
// por isso upsert pra silenciar e deleteMany pra reativar, em vez de um
// update comum.
export async function PATCH(request: Request, { params }: { params: { channelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body?.muted !== "boolean") {
    return NextResponse.json({ error: "Campo 'muted' inválido." }, { status: 400 });
  }

  if (!(await requireMembership(session.user.id, params.channelId))) {
    return NextResponse.json({ error: "Você não é membro desse servidor." }, { status: 403 });
  }

  if (body.muted) {
    await prisma.channelMute.upsert({
      where: { userId_channelId: { userId: session.user.id, channelId: params.channelId } },
      create: { userId: session.user.id, channelId: params.channelId },
      update: {},
    });
  } else {
    await prisma.channelMute.deleteMany({
      where: { userId: session.user.id, channelId: params.channelId },
    });
  }

  return NextResponse.json({ ok: true });
}
