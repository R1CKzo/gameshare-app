import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { acceptFriendship } from "@/lib/friendAccept";
import { prisma } from "@/lib/prisma";

// Aceita um pedido de amizade recebido. So o "addressee" (quem recebeu)
// pode aceitar — o requester so pode cancelar (DELETE).
export async function PATCH(_request: Request, { params }: { params: { friendshipId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Controle parental: so vale pra aceites NOVOS (ver comentario igual em
  // /api/servers/join). acceptFriendship de verdade so roda depois do
  // codigo confirmado, em /api/parental/authorize-confirm.
  const requester = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { parentalControlEnabled: true },
  });
  if (requester?.parentalControlEnabled) {
    return NextResponse.json(
      { needsParentalAuth: true, action: "ACCEPT_FRIEND", targetId: params.friendshipId },
      { status: 403 },
    );
  }

  const result = await acceptFriendship(session.user.id, params.friendshipId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
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
