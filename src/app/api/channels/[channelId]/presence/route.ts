import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Heartbeat: registra que o usuario esta com essa sala de chamada aberta
// agora, mesmo sem estar compartilhando a tela. Chamado periodicamente
// pelo client enquanto a pagina do canal estiver aberta. Se o microfone
// (peer de voz) ja estiver conectado, o client manda o peerId junto pra
// quem mais estiver na sala conseguir discar direto.
async function requireMembership(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { serverId: true },
  });
  if (!channel) return false;

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function POST(
  request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  // Sem isso, qualquer pessoa logada (nao so membro do servidor)
  // conseguia se anunciar como "presente" numa sala e mandar as outras
  // pessoas discarem pra ela na malha de voz — inclusive de servidores
  // que ela nunca entrou.
  if (!(await requireMembership(session.user.id, params.channelId))) {
    return NextResponse.json({ error: "Voce nao e membro desse servidor." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const peerId: string | undefined = typeof body?.peerId === "string" ? body.peerId : undefined;

  // Um heartbeat sem peerId manda update:{peerId: undefined} — o Prisma
  // filtra chaves undefined do payload, e se sobrar um objeto vazio ele
  // pula a query de UPDATE (e o updatedAt do @updatedAt nunca bate). Por
  // isso o updatedAt vai explicito aqui: todo heartbeat tem que "contar"
  // mesmo quando so esta renovando a presenca, sem peerId novo.
  await prisma.channelPresence.upsert({
    where: { channelId_userId: { channelId: params.channelId, userId: session.user.id } },
    create: { channelId: params.channelId, userId: session.user.id, peerId },
    update: { updatedAt: new Date(), ...(peerId !== undefined ? { peerId } : {}) },
  });

  return NextResponse.json({ ok: true });
}

// Sai da sala (fechou a aba, trocou de canal, ou desligou o microfone).
// Best-effort.
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
