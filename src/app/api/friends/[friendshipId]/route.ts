import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FRIEND_ACCEPTED_EVENT, pusherServer, userPusherName } from "@/lib/pusher";

// Aceita um pedido de amizade recebido. So o "addressee" (quem recebeu)
// pode aceitar — o requester so pode cancelar (DELETE).
export async function PATCH(request: Request, { params }: { params: { friendshipId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const friendship = await prisma.friendship.findUnique({
    where: { id: params.friendshipId },
    select: { addresseeId: true, requesterId: true, status: true },
  });
  if (!friendship || friendship.addresseeId !== session.user.id) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  }
  if (friendship.status === "ACCEPTED") {
    return NextResponse.json({ ok: true });
  }

  await prisma.friendship.update({
    where: { id: params.friendshipId },
    data: { status: "ACCEPTED" },
  });
  pusherServer
    .trigger(userPusherName(friendship.requesterId), FRIEND_ACCEPTED_EVENT, { friendshipId: params.friendshipId })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}

// Cobre 3 casos com a mesma acao: recusar um pedido recebido, cancelar um
// pedido que eu mandei, ou desfazer uma amizade ja aceita — em todos, so
// precisa ser uma das duas pontas da linha pra poder apagar.
export async function DELETE(_request: Request, { params }: { params: { friendshipId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const friendship = await prisma.friendship.findUnique({
    where: { id: params.friendshipId },
    select: { requesterId: true, addresseeId: true },
  });
  if (!friendship) {
    return NextResponse.json({ ok: true });
  }
  if (friendship.requesterId !== session.user.id && friendship.addresseeId !== session.user.id) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  await prisma.friendship.delete({ where: { id: params.friendshipId } });
  return NextResponse.json({ ok: true });
}
