import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { checkAndBumpThrottle } from "@/lib/authThrottle";
import { sendSecurityCodeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { createSecurityCode } from "@/lib/securityCode";

const ACTIONS = ["JOIN_SERVER", "ACCEPT_FRIEND"] as const;

// Pede o codigo de autorizacao pra uma acao especifica (entrar num
// servidor ou aceitar um pedido de amizade) -- so quem tem controle
// parental ligado passa por aqui (ver /api/servers/join e
// /api/friends/[friendshipId], que devolvem needsParentalAuth em vez de
// executar a acao direto). O codigo vai pro parentEmail; a acao de
// verdade so acontece em authorize-confirm, se o codigo bater.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  const targetId = String(body?.targetId ?? "");
  if (!ACTIONS.includes(action) || !targetId) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { parentalControlEnabled: true, parentEmail: true },
  });
  if (!user?.parentalControlEnabled || !user.parentEmail) {
    return NextResponse.json({ error: "O controle parental não está ativo nessa conta." }, { status: 400 });
  }

  const throttle = await checkAndBumpThrottle(`parentalaction:${session.user.id}`, {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Tente de novo mais tarde." }, { status: 429 });
  }

  const { ticketId, code, expiresAt } = await createSecurityCode(
    session.user.id,
    "PARENTAL_ACTION",
    JSON.stringify({ action, targetId }),
  );
  try {
    await sendSecurityCodeEmail({ to: user.parentEmail, code, purpose: "PARENTAL_ACTION" });
  } catch (err) {
    console.error("Falha ao enviar codigo de autorizacao parental:", err);
    return NextResponse.json({ error: "Não foi possível enviar o código por email." }, { status: 500 });
  }

  return NextResponse.json({ ticketId, expiresAt });
}
