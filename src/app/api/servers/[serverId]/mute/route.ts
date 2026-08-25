import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Silencia (ou reativa) TODO canal desse servidor pra quem chamou, sem
// mexer em mais ninguem — mora direto em ServerMember (linha ja existe
// pra qualquer membro, entao e so um update, sem upsert). Ver
// ChannelMute/DMMute pros canais/DMs, que usam uma tabela a parte porque
// a linha de membro la nao existe por padrao.
export async function PATCH(request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body?.muted !== "boolean") {
    return NextResponse.json({ error: "Campo 'muted' inválido." }, { status: 400 });
  }

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId: params.serverId } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Você não é membro desse servidor." }, { status: 403 });
  }

  await prisma.serverMember.update({
    where: { id: membership.id },
    data: { notificationsMuted: body.muted },
  });

  return NextResponse.json({ ok: true });
}
