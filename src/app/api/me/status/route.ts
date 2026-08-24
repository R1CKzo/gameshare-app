import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MANUAL_STATUSES = ["ONLINE", "AWAY", "BUSY"];

// Le se a pessoa fixou o proprio status manualmente — chamado uma vez pelo
// PresenceProvider ao montar, pra restaurar a escolha depois de recarregar
// a pagina (sem isso, um refresh voltaria "Ocupado" pro automatico sozinho).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { statusManual: true, status: true },
  });

  return NextResponse.json({ manual: user?.statusManual ?? false, status: user?.status ?? null });
}

// Fixa (mode: "MANUAL") ou solta (mode: "AUTO") o status manual. Fixar ja
// grava o status escolhido na hora; soltar so desliga a trava — o proximo
// heartbeat automatico do PresenceProvider corrige o valor sozinho.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  if (body?.mode === "MANUAL" && MANUAL_STATUSES.includes(body?.status)) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { statusManual: true, status: body.status, lastActiveAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (body?.mode === "AUTO") {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { statusManual: false },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
}
