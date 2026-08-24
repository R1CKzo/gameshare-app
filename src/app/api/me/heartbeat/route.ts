import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Chamado pelo PresenceHeartbeat.tsx a cada ~60s (e na hora, sempre que a
// aba entra ou sai de foco) — so grava ONLINE/AWAY + o horario, nunca
// OFFLINE (ver src/lib/presence.ts pra como isso vira "offline" na tela).
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const status = ["ONLINE", "AWAY", "BUSY"].includes(body?.status) ? body.status : "ONLINE";

  await prisma.user.update({
    where: { id: session.user.id },
    data: { status, lastActiveAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
