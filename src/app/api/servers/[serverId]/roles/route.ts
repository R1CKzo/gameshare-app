import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getServerPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const NAME_MAX = 40;

export async function GET(_request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.isOwner && !permissions.canManageRoles && !permissions.canKick && !permissions.canBan) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }

  const roles = await prisma.role.findMany({
    where: { serverId: params.serverId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, color: true, position: true, canKick: true, canBan: true, canManageRoles: true },
  });

  return NextResponse.json({ roles });
}

export async function POST(request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const permissions = await getServerPermissions(params.serverId, session.user.id);
  if (!permissions.canManageRoles) {
    return NextResponse.json({ error: "Sem permissão pra gerenciar cargos." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name: string = (body?.name ?? "").trim();
  if (!name || name.length > NAME_MAX) {
    return NextResponse.json({ error: `Nome do cargo precisa ter entre 1 e ${NAME_MAX} caracteres.` }, { status: 400 });
  }
  const color: string | null = typeof body?.color === "string" ? body.color : null;
  const canKick = Boolean(body?.canKick);
  const canBan = Boolean(body?.canBan);
  const canManageRoles = Boolean(body?.canManageRoles);

  try {
    const role = await prisma.role.create({
      data: { serverId: params.serverId, name, color, canKick, canBan, canManageRoles },
      select: { id: true, name: true, color: true, position: true, canKick: true, canBan: true, canManageRoles: true },
    });
    return NextResponse.json(role);
  } catch {
    return NextResponse.json({ error: "Já existe um cargo com esse nome nesse servidor." }, { status: 409 });
  }
}
