import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const inviteCode: string = body?.inviteCode?.trim().toLowerCase();

  if (!inviteCode) {
    return NextResponse.json({ error: "Informe um codigo de convite." }, { status: 400 });
  }

  const server = await prisma.server.findUnique({
    where: { inviteCode },
    select: { id: true, name: true },
  });

  if (!server) {
    return NextResponse.json({ error: "Codigo de convite invalido." }, { status: 404 });
  }

  await prisma.serverMember.upsert({
    where: { userId_serverId: { userId: session.user.id, serverId: server.id } },
    create: { userId: session.user.id, serverId: server.id },
    update: {},
  });

  return NextResponse.json({ id: server.id, name: server.name });
}
