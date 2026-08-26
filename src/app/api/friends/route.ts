import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { publicUserImage } from "@/lib/avatarUrl";
import { corsPreflight, withCors } from "@/lib/cors";
import { getRequestSession } from "@/lib/getRequestSession";
import { prisma } from "@/lib/prisma";
import { FRIEND_ACCEPTED_EVENT, FRIEND_REQUEST_EVENT, pusherServer, userPusherName } from "@/lib/pusher";

export const dynamic = "force-dynamic";

const userSelect = { id: true, nickname: true, userTag: true, image: true, status: true, lastActiveAt: true } as const;

// Lista amigos (aceitos) + pedidos pendentes recebidos e enviados. Tudo
// numa chamada so pra tela de Amigos nao precisar de 3 requests. Login por
// token + CORS (ver src/lib/cors.ts) pro app de desktop embutido chamar
// direto -- POST abaixo continua so por cookie, ninguem alem do site
// manda pedido de amizade ainda.
export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user?.id) {
    return withCors(request, NextResponse.json({ error: "Não autenticado." }, { status: 401 }));
  }

  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ requesterId: session.user.id }, { addresseeId: session.user.id }],
    },
    select: {
      id: true,
      status: true,
      requesterId: true,
      addresseeId: true,
      requester: { select: userSelect },
      addressee: { select: userSelect },
    },
    orderBy: { createdAt: "desc" },
  });

  const friends = [];
  const incoming = [];
  const outgoing = [];

  for (const f of friendships) {
    const isRequester = f.requesterId === session.user.id;
    const raw = isRequester ? f.addressee : f.requester;
    const otherUser = { ...raw, image: publicUserImage(raw.id, raw.image) };

    if (f.status === "ACCEPTED") {
      friends.push({ friendshipId: f.id, user: otherUser });
    } else if (isRequester) {
      outgoing.push({ friendshipId: f.id, user: otherUser });
    } else {
      incoming.push({ friendshipId: f.id, user: otherUser });
    }
  }

  return withCors(request, NextResponse.json({ friends, incoming, outgoing }));
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

// Manda um pedido de amizade por Nick#Tag. Se a outra pessoa ja tinha
// mandado um pedido pra mim, aceita na hora em vez de criar um segundo
// pedido duplicado (evita a "corrida" de dois pedidos cruzados).
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const tag = typeof body?.tag === "string" ? body.tag.trim() : "";
  const match = tag.match(/^(.{3,16})#(\d{6})$/);
  if (!match) {
    return NextResponse.json({ error: "Use o formato Nickname#123456." }, { status: 400 });
  }
  const [, nickname, userTag] = match;

  const target = await prisma.user.findUnique({
    where: { nickname_userTag: { nickname, userTag } },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Ninguém com esse Nick#Tag." }, { status: 404 });
  }
  if (target.id === session.user.id) {
    return NextResponse.json({ error: "Você não pode adicionar a si mesmo." }, { status: 400 });
  }

  const reverse = await prisma.friendship.findUnique({
    where: { requesterId_addresseeId: { requesterId: target.id, addresseeId: session.user.id } },
    select: { id: true, status: true },
  });
  if (reverse) {
    if (reverse.status === "ACCEPTED") {
      return NextResponse.json({ error: "Vocês já são amigos." }, { status: 409 });
    }
    const updated = await prisma.friendship.update({
      where: { id: reverse.id },
      data: { status: "ACCEPTED" },
    });
    // A outra pessoa que mandou o pedido original precisa saber que foi
    // aceito (do lado dela, ela nao fez nada agora — quem aceitou fomos
    // "nos", ao mandar um pedido que ja tinha uma reciproca pendente).
    pusherServer.trigger(userPusherName(target.id), FRIEND_ACCEPTED_EVENT, { friendshipId: updated.id }).catch(() => {});
    return NextResponse.json({ friendshipId: updated.id, status: updated.status });
  }

  try {
    const created = await prisma.friendship.create({
      data: { requesterId: session.user.id, addresseeId: target.id },
      select: { id: true, status: true },
    });
    pusherServer.trigger(userPusherName(target.id), FRIEND_REQUEST_EVENT, { friendshipId: created.id }).catch(() => {});
    return NextResponse.json({ friendshipId: created.id, status: created.status });
  } catch {
    return NextResponse.json({ error: "Pedido já enviado." }, { status: 409 });
  }
}
