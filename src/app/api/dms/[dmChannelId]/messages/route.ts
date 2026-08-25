import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { type AttachmentKind, maxBytesForKind } from "@/lib/attachmentLimits";
import { authOptions } from "@/lib/auth";
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

function isTrustedBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

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
  const attachmentUrl = typeof body?.attachmentUrl === "string" ? body.attachmentUrl : null;
  const attachmentType = typeof body?.attachmentType === "string" ? body.attachmentType : null;
  const attachmentName = typeof body?.attachmentName === "string" ? body.attachmentName.slice(0, 255) : null;
  const attachmentSize = typeof body?.attachmentSize === "number" ? body.attachmentSize : null;

  if (!content && !attachmentUrl) {
    return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: "Mensagem muito longa." }, { status: 400 });
  }

  let attachmentData: {
    attachmentUrl?: string;
    attachmentType?: string;
    attachmentName?: string;
    attachmentSize?: number;
  } = {};
  if (attachmentUrl) {
    const kind = attachmentType as AttachmentKind;
    const validKind = kind === "image" || kind === "video" || kind === "file";
    if (
      !validKind ||
      !isTrustedBlobUrl(attachmentUrl) ||
      !attachmentName ||
      !attachmentSize ||
      attachmentSize > maxBytesForKind(kind)
    ) {
      return NextResponse.json({ error: "Anexo inválido." }, { status: 400 });
    }
    attachmentData = { attachmentUrl, attachmentType, attachmentName, attachmentSize };
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
