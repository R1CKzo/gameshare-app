import { NextResponse } from "next/server";

import { checkAndBumpThrottle } from "@/lib/authThrottle";
import { sendSecurityCodeEmail } from "@/lib/email";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createSecurityCode } from "@/lib/securityCode";

const GENERIC_ERROR = "Email ou senha invalidos.";

// Passo 1 do login por senha: confere email+senha, e se bater manda um
// codigo por email (nunca cria sessao aqui — isso so acontece depois do
// codigo confirmado em /verify-code).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const throttle = await checkAndBumpThrottle(`login_pwd:${email}`, {
    maxAttempts: 8,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Tente de novo em alguns minutos." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  // Mesma mensagem genérica pros 3 casos (nao existe / conta so-Google /
  // senha errada) — nao revela qual e o caso real.
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const { ticketId, code, expiresAt } = await createSecurityCode(user.id, "LOGIN");
  try {
    await sendSecurityCodeEmail({ to: email, code, purpose: "LOGIN" });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel enviar o codigo por email. Tente novamente." }, { status: 500 });
  }

  return NextResponse.json({ ticketId, expiresAt });
}
