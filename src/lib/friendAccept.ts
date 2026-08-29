import { prisma } from "@/lib/prisma";
import { FRIEND_ACCEPTED_EVENT, pusherServer, userPusherName } from "@/lib/pusher";

export type AcceptResult = { ok: true } | { ok: false; error: string; status: number };

// Logica de "aceitar pedido de amizade", compartilhada entre
// /api/friends/[friendshipId] (aceite direto) e
// /api/parental/authorize-confirm (aceite so depois do codigo dos pais
// confirmar, quando a conta tem controle parental ligado).
export async function acceptFriendship(userId: string, friendshipId: string): Promise<AcceptResult> {
  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
    select: { addresseeId: true, requesterId: true, status: true },
  });
  if (!friendship || friendship.addresseeId !== userId) {
    return { ok: false, error: "Pedido não encontrado.", status: 404 };
  }
  if (friendship.status === "ACCEPTED") {
    return { ok: true };
  }

  await prisma.friendship.update({ where: { id: friendshipId }, data: { status: "ACCEPTED" } });
  pusherServer
    .trigger(userPusherName(friendship.requesterId), FRIEND_ACCEPTED_EVENT, { friendshipId })
    .catch(() => {});
  return { ok: true };
}
