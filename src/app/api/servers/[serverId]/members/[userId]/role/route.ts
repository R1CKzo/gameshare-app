import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getServerPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { pusherServer, ROLE_GRANTED_EVENT, userPusherName } from "@/lib/pusher";

// Atribui (ou remove, com roleId: null) o cargo de um membro.
export async function PATCH(request: Request, { params }: { params: { serverId: string; userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.canManageRoles) {
    return NextResponse.json({ error: "Sem permissao pra gerenciar cargos." }, { status: 403 });
  }

  const server = await prisma.server.findUnique({
    where: { id: params.serverId },
    select: { ownerId: true },
  });
  if (!server) {
    return NextResponse.json({ error: "Servidor nao encontrado." }, { status: 404 });
  }
  if (params.userId === server.ownerId) {
    return NextResponse.json({ error: "O dono nao precisa de cargo — ja tem permissao plena." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const roleId: string | null = body?.roleId ?? null;

  if (roleId) {
    const role = await prisma.role.findUnique({ where: { id: roleId }, select: { serverId: true } });
    if (!role || role.serverId !== params.serverId) {
      return NextResponse.json({ error: "Cargo invalido." }, { status: 400 });
    }
  }

  const updated = await prisma.serverMember.updateMany({
    where: { userId: params.userId, serverId: params.serverId },
    data: { roleId },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Membro nao encontrado." }, { status: 404 });
  }

  pusherServer
    .trigger(userPusherName(params.userId), ROLE_GRANTED_EVENT, { serverId: params.serverId, roleId })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
