import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NEW_MESSAGE_EVENT, pusherServer, textChannelPusherName } from "@/lib/pusher";

const PAGE_SIZE = 50;
const MAX_CONTENT_LENGTH = 4000;

const messageSelect = {
  id: true,
  content: true,
  createdAt: true,
  user: { select: { id: true, nickname: true, userTag: true, image: true } },
} as const;

async function requireMembership(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, type: true, serverId: true },
  });
  if (!channel || channel.type !== "TEXT") return null;

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId: channel.serverId } },
    select: { id: true },
  });
  if (!membership) return null;

  return channel;
}

// Historico paginado: sem cursor, devolve as mensagens mais recentes. Com
// "before" (createdAt em ISO), devolve a pagina anterior — usado pra
// carregar mensagens mais antigas ao rolar pra cima. Com "after", devolve
// so mensagens mais novas que o cursor — usado como reforço além do
// Pusher: se o WebSocket cair silenciosamente (comum em navegador mobile
// com a aba em segundo plano), o client re-pergunta periodicamente "tem
// mensagem nova?" em vez de depender só da entrega em tempo real.
export async function GET(request: Request, { params }: { params: { channelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const channel = await requireMembership(session.user.id, params.channelId);
  if (!channel) {
    return NextResponse.json({ error: "Canal nao encontrado." }, { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const before = searchParams.get("before");
  const after = searchParams.get("after");

  if (after) {
    const afterDate = new Date(after);
    const messages = await prisma.message.findMany({
      where: {
        channelId: channel.id,
        ...(!Number.isNaN(afterDate.getTime()) ? { createdAt: { gt: afterDate } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: PAGE_SIZE,
      select: messageSelect,
    });
    return NextResponse.json({ messages, hasMore: false });
  }

  const cursorDate = before ? new Date(before) : null;
  const messages = await prisma.message.findMany({
    where: {
      channelId: channel.id,
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

// Manda uma mensagem nova: salva no banco (fonte de verdade / historico) e
// dispara um evento no Pusher pro canal privado da sala, pra quem esta com
// a pagina aberta receber na hora sem precisar dar refresh.
export async function POST(request: Request, { params }: { params: { channelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const channel = await requireMembership(session.user.id, params.channelId);
  if (!channel) {
    return NextResponse.json({ error: "Canal nao encontrado." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: "Mensagem muito longa." }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: { channelId: channel.id, userId: session.user.id, content },
    select: messageSelect,
  });

  pusherServer.trigger(textChannelPusherName(channel.id), NEW_MESSAGE_EVENT, message).catch((err) => {
    // Se o Pusher falhar, a mensagem ja esta salva — quem esta com a
    // pagina aberta so nao ve na hora, ve no proximo carregamento.
    console.error("Falha ao disparar evento no Pusher:", err);
  });

  return NextResponse.json(message);
}
