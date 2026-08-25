import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { MAX_CALL_ROOM_SIZE, PRESENCE_WINDOW_MS } from "@/lib/callLimits";
import { prisma } from "@/lib/prisma";
import { CALL_UPDATE_EVENT, pusherServer, serverVoicePusherName, textChannelPusherName } from "@/lib/pusher";

const VALID_QUALITY = ["GOOD", "MEDIUM", "BAD"] as const;

// Heartbeat: registra que o usuario esta com essa sala de chamada aberta
// agora, mesmo sem estar compartilhando a tela. Chamado periodicamente
// pelo client enquanto a pagina do canal estiver aberta. Se o microfone
// (peer de voz) ja estiver conectado, o client manda o peerId junto pra
// quem mais estiver na sala conseguir discar direto.
// Devolve o serverId quando a pessoa e membro (null quando nao e, ou o
// canal nao existe) — o proprio POST/DELETE usa esse serverId pra avisar
// tanto a sala especifica (private-channel-{id}) quanto o agregado do
// servidor inteiro (private-server-voice-{id}, que alimenta a lista da
// barra lateral) de que a presenca mudou.
async function requireMembership(userId: string, channelId: string): Promise<string | null> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { serverId: true },
  });
  if (!channel) return null;

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
    select: { id: true },
  });
  return membership ? channel.serverId : null;
}

function notifyVoiceChange(channelId: string, serverId: string) {
  pusherServer.trigger(textChannelPusherName(channelId), CALL_UPDATE_EVENT, {}).catch(() => {});
  pusherServer.trigger(serverVoicePusherName(serverId), CALL_UPDATE_EVENT, {}).catch(() => {});
}

export async function POST(
  request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Sem isso, qualquer pessoa logada (nao so membro do servidor)
  // conseguia se anunciar como "presente" numa sala e mandar as outras
  // pessoas discarem pra ela na malha de voz — inclusive de servidores
  // que ela nunca entrou.
  const serverId = await requireMembership(session.user.id, params.channelId);
  if (!serverId) {
    return NextResponse.json({ error: "Você não é membro desse servidor." }, { status: 403 });
  }

  // So barra vaga nova (entrar pela primeira vez) — um heartbeat de quem
  // ja esta na sala nunca pode ser rejeitado, senao a sala inteira ficaria
  // presa incapaz de renovar a propria presenca assim que bater 10.
  const alreadyHere = await prisma.channelPresence.findUnique({
    where: { channelId_userId: { channelId: params.channelId, userId: session.user.id } },
    select: { id: true },
  });
  if (!alreadyHere) {
    const occupied = await prisma.channelPresence.count({
      where: { channelId: params.channelId, updatedAt: { gt: new Date(Date.now() - PRESENCE_WINDOW_MS) } },
    });
    if (occupied >= MAX_CALL_ROOM_SIZE) {
      return NextResponse.json(
        { error: `Essa sala já está com o máximo de ${MAX_CALL_ROOM_SIZE} pessoas.` },
        { status: 409 },
      );
    }
  }

  const body = await request.json().catch(() => ({}));
  const peerId: string | undefined = typeof body?.peerId === "string" ? body.peerId : undefined;
  const isMuted: boolean | undefined = typeof body?.isMuted === "boolean" ? body.isMuted : undefined;
  const isDeafened: boolean | undefined = typeof body?.isDeafened === "boolean" ? body.isDeafened : undefined;
  const connectionQuality = VALID_QUALITY.includes(body?.connectionQuality) ? body.connectionQuality : undefined;

  // Um heartbeat sem peerId manda update:{peerId: undefined} — o Prisma
  // filtra chaves undefined do payload, e se sobrar um objeto vazio ele
  // pula a query de UPDATE (e o updatedAt do @updatedAt nunca bate). Por
  // isso o updatedAt vai explicito aqui: todo heartbeat tem que "contar"
  // mesmo quando so esta renovando a presenca, sem peerId novo. Mesma logica
  // pro isMuted, isDeafened e connectionQuality — o client manda na hora
  // quando muda (ver useVoiceMesh/ActiveCallProvider), e todo heartbeat
  // periodico normal tambem reenvia o valor atual, pra ficar consistente
  // mesmo se aquele POST imediato falhar.
  await prisma.channelPresence.upsert({
    where: { channelId_userId: { channelId: params.channelId, userId: session.user.id } },
    create: {
      channelId: params.channelId,
      userId: session.user.id,
      peerId,
      isMuted: isMuted ?? false,
      isDeafened: isDeafened ?? false,
      ...(connectionQuality ? { connectionQuality } : {}),
    },
    update: {
      updatedAt: new Date(),
      ...(peerId !== undefined ? { peerId } : {}),
      ...(isMuted !== undefined ? { isMuted } : {}),
      ...(isDeafened !== undefined ? { isDeafened } : {}),
      ...(connectionQuality ? { connectionQuality } : {}),
    },
  });

  notifyVoiceChange(params.channelId, serverId);

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
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const channel = await prisma.channel.findUnique({ where: { id: params.channelId }, select: { serverId: true } });

  await prisma.channelPresence
    .delete({
      where: { channelId_userId: { channelId: params.channelId, userId: session.user.id } },
    })
    .catch(() => {});

  if (channel) notifyVoiceChange(params.channelId, channel.serverId);

  return NextResponse.json({ ok: true });
}
