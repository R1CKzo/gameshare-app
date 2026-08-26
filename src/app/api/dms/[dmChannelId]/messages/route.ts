import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { verifyAttachment } from "@/lib/attachmentVerify";
import { prisma } from "@/lib/prisma";
import { NEW_MESSAGE_EVENT, pusherServer, dmChannelPusherName } from "@/lib/pusher";

const PAGE_SIZE = 50;
const MAX_CONTENT_LENGTH = 4000;

const messageSelect = {
  id: true,
  content: true,
  createdAt: true,
  attachmentUrl: true,
  attachmentType: true,
  attachmentName: true,
  attachmentSize: true,
  user: { select: { id: true, nickname: true, userTag: true, image: true } },
} as const;

async function requireParticipant(userId: string, dmChannelId: string) {
  const participant = await prisma.dMParticipant.findUnique({
    where: { dmChannelId_userId: { dmChannelId, userId } },
    select: { id: true },
  });
  return Boolean(participant);
}

// Mesma logica de src/app/api/channels/[channelId]/messages/route.ts,
// so que pra uma conversa direta em vez de um canal de servidor.
export async function GET(request: Request, { params }: { params: { dmChannelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!(await requireParticipant(session.user.id, params.dmChannelId))) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const before = searchParams.get("before");
  const after = searchParams.get("after");

  if (after) {
    const afterDate = new Date(after);
    const messages = await prisma.dMMessage.findMany({
      where: {
        dmChannelId: params.dmChannelId,
        ...(!Number.isNaN(afterDate.getTime()) ? { createdAt: { gt: afterDate } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: PAGE_SIZE,
      select: messageSelect,
    });
    return NextResponse.json({ messages, hasMore: false });
  }

  const cursorDate = before ? new Date(before) : null;
  const messages = await prisma.dMMessage.findMany({
    where: {
      dmChannelId: params.dmChannelId,
      ...(cursorDate && !Number.isNaN(cursorDate.getTime()) ? { createdAt: { lt: cursorDate } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    select: messageSelect,
  });

  return NextResponse.json({
    messages: messages.reverse(),
    hasMore: messages.length === PAGE_SIZE,
  });
}

export async function POST(request: Request, { params }: { params: { dmChannelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!(await requireParticipant(session.user.id, params.dmChannelId))) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const rawAttachmentUrl = typeof body?.attachmentUrl === "string" ? body.attachmentUrl : null;

  if (!content && !rawAttachmentUrl) {
    return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: "Mensagem muito longa." }, { status: 400 });
  }

  let attachmentData: Awaited<ReturnType<typeof verifyAttachment>> | Record<string, never> = {};
  if (rawAttachmentUrl) {
    const verified = await verifyAttachment(rawAttachmentUrl, body?.attachmentName);
    if (!verified) {
      return NextResponse.json({ error: "Anexo inválido." }, { status: 400 });
    }
    attachmentData = verified;
  }

  const message = await prisma.dMMessage.create({
    data: { dmChannelId: params.dmChannelId, userId: session.user.id, content, ...attachmentData },
    select: messageSelect,
  });

  pusherServer.trigger(dmChannelPusherName(params.dmChannelId), NEW_MESSAGE_EVENT, message).catch((err) => {
    console.error("Falha ao disparar evento no Pusher:", err);
  });

  return NextResponse.json(message);
}
