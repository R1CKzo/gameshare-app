import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { checkAndBumpThrottle } from "@/lib/authThrottle";
import { sendSecurityCodeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { createSecurityCode } from "@/lib/securityCode";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pede o codigo pra ATIVAR o controle parental -- vai pro email do
// RESPONSAVEL (nao o da conta), pra provar que existe alguem de verdade
// ali antes de comecar a restringir a conta.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parentEmail = String(body?.parentEmail ?? "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(parentEmail)) {
    return NextResponse.json({ error: "Email do responsável inválido." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { parentalControlEnabled: true },
  });
  if (user?.parentalControlEnabled) {
    return NextResponse.json({ error: "O controle parental já está ativo nessa conta." }, { status: 400 });
  }

  const throttle = await checkAndBumpThrottle(`parentalsetup:${session.user.id}`, {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Tente de novo mais tarde." }, { status: 429 });
  }

  const { ticketId, code, expiresAt } = await createSecurityCode(session.user.id, "PARENTAL_SETUP", parentEmail);
  try {
    await sendSecurityCodeEmail({ to: parentEmail, code, purpose: "PARENTAL_SETUP" });
  } catch (err) {
    console.error("Falha ao enviar codigo de ativacao do controle parental:", err);
    return NextResponse.json({ error: "Não foi possível enviar o código por email." }, { status: 500 });
  }

  return NextResponse.json({ ticketId, expiresAt });
}
