import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { checkAndBumpThrottle } from "@/lib/authThrottle";
import { prisma } from "@/lib/prisma";
import { joinServerByInviteCode } from "@/lib/serverJoin";

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

  // Controle parental (Configuracoes > Privacidade e Seguranca): so vale
  // pra ENTRADAS NOVAS, nunca revoga servidor que a conta ja tinha -- ver
  // src/lib/serverJoin.ts e /api/parental/authorize-confirm, que e quem
  // de fato chama joinServerByInviteCode depois do codigo confirmado.
  const requester = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { parentalControlEnabled: true },
  });
  if (requester?.parentalControlEnabled) {
    return NextResponse.json(
      { needsParentalAuth: true, action: "JOIN_SERVER", targetId: inviteCode },
      { status: 403 },
    );
  }

  const result = await joinServerByInviteCode(session.user.id, inviteCode);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ id: result.serverId, name: result.serverName });
}
