import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getServerPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const NAME_MAX = 40;

export async function PATCH(request: Request, { params }: { params: { serverId: string; roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.canManageRoles) {
    return NextResponse.json({ error: "Sem permissão pra gerenciar cargos." }, { status: 403 });
  }

  const role = await prisma.role.findUnique({ where: { id: params.roleId }, select: { serverId: true } });
  if (!role || role.serverId !== params.serverId) {
    return NextResponse.json({ error: "Cargo não encontrado." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const data: {
    name?: string;
    color?: string | null;
    canKick?: boolean;
    canBan?: boolean;
    canManageRoles?: boolean;
    canManageChannels?: boolean;
  } = {};

  if (body?.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > NAME_MAX) {
      return NextResponse.json({ error: `Nome do cargo precisa ter entre 1 e ${NAME_MAX} caracteres.` }, { status: 400 });
    }
    data.name = name;
  }
  if (body?.color !== undefined) data.color = typeof body.color === "string" ? body.color : null;
  if (body?.canKick !== undefined) data.canKick = Boolean(body.canKick);
  if (body?.canBan !== undefined) data.canBan = Boolean(body.canBan);
  if (body?.canManageRoles !== undefined) data.canManageRoles = Boolean(body.canManageRoles);
  if (body?.canManageChannels !== undefined) data.canManageChannels = Boolean(body.canManageChannels);

  try {
    const updated = await prisma.role.update({
      where: { id: params.roleId },
      data,
      select: {
        id: true,
        name: true,
        color: true,
        position: true,
        canKick: true,
        canBan: true,
        canManageRoles: true,
        canManageChannels: true,
      },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Já existe um cargo com esse nome nesse servidor." }, { status: 409 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { serverId: string; roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.canManageRoles) {
    return NextResponse.json({ error: "Sem permissão pra gerenciar cargos." }, { status: 403 });
  }

  const role = await prisma.role.findUnique({ where: { id: params.roleId }, select: { serverId: true } });
  if (!role || role.serverId !== params.serverId) {
    return NextResponse.json({ error: "Cargo não encontrado." }, { status: 404 });
  }

  // Membros com esse cargo voltam pra "sem cargo" (onDelete: SetNull no schema)
  await prisma.role.delete({ where: { id: params.roleId } });

  return NextResponse.json({ ok: true });
}
