import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Chamado pelo PresenceProvider.tsx a cada ~60s (e na hora, sempre que a
// aba entra ou sai de foco, ou fica 5min parada) — so grava ONLINE/AWAY/BUSY
// + o horario, nunca OFFLINE (ver src/lib/presence.ts pra como isso vira
// "offline" na tela).
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const status = ["ONLINE", "AWAY", "BUSY"].includes(body?.status) ? body.status : "ONLINE";

  // Com o status fixado manualmente (ver /api/me/status), o heartbeat
  // automatico so mantem "ultima vez vista" fresca — nunca sobrescreve o
  // status em si. Sem essa trava aqui (e nao so no client), um heartbeat
  // automatico que dispare fora de ordem (ex: logo ao carregar a pagina, "
  // antes do client saber que o status era manual) apagava o "Ocupado" que
  // a pessoa tinha fixado, e isso aparecia errado pros outros ate o
  // heartbeat seguinte corrigir sozinho.
  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { statusManual: true },
  });

  await prisma.user.update({
    where: { id: session.user.id },
    data: current?.statusManual ? { lastActiveAt: new Date() } : { status, lastActiveAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
