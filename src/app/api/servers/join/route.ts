import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { checkAndBumpThrottle } from "@/lib/authThrottle";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Um convite e um segredo (quem tiver o codigo entra no servidor) — sem
  // isso, uma conta logada podia tentar codigo atras de codigo ate acertar
  // um valido, mesmo o codigo sendo dificil de adivinhar de primeira.
  const throttle = await checkAndBumpThrottle(`server_join:${session.user.id}`, {
    maxAttempts: 20,
    windowMs: 10 * 60 * 1000,
    lockoutMs: 10 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Tente de novo mais tarde." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const inviteCode: string = body?.inviteCode?.trim().toLowerCase();

  if (!inviteCode) {
    return NextResponse.json({ error: "Informe um código de convite." }, { status: 400 });
  }

  const server = await prisma.server.findUnique({
    where: { inviteCode },
    select: { id: true, name: true },
  });

  if (!server) {
    return NextResponse.json({ error: "Código de convite inválido." }, { status: 404 });
  }

  const ban = await prisma.serverBan.findUnique({
    where: { serverId_userId: { serverId: server.id, userId: session.user.id } },
    select: { id: true },
  });
  if (ban) {
    return NextResponse.json({ error: "Você foi banido desse servidor." }, { status: 403 });
  }

  await prisma.serverMember.upsert({
    where: { userId_serverId: { userId: session.user.id, serverId: server.id } },
    create: { userId: session.user.id, serverId: server.id },
    update: {},
  });

  return NextResponse.json({ id: server.id, name: server.name });
}
