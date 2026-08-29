import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { checkAndBumpThrottle } from "@/lib/authThrottle";
import { sendSecurityCodeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { createSecurityCode } from "@/lib/securityCode";

// Pede o codigo pra DESATIVAR o controle parental -- vai pro
// parentEmail ja salvo (nunca pra um email novo digitado agora, senao
// qualquer um trocava o email na hora e se autorizava sozinho).
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { parentalControlEnabled: true, parentEmail: true },
  });
  if (!user?.parentalControlEnabled || !user.parentEmail) {
    return NextResponse.json({ error: "O controle parental não está ativo nessa conta." }, { status: 400 });
  }

  const throttle = await checkAndBumpThrottle(`parentalremoval:${session.user.id}`, {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Tente de novo mais tarde." }, { status: 429 });
  }

  const { ticketId, code, expiresAt } = await createSecurityCode(session.user.id, "PARENTAL_REMOVAL");
  try {
    await sendSecurityCodeEmail({ to: user.parentEmail, code, purpose: "PARENTAL_REMOVAL" });
  } catch (err) {
    console.error("Falha ao enviar codigo de remocao do controle parental:", err);
    return NextResponse.json({ error: "Não foi possível enviar o código por email." }, { status: 500 });
  }

  return NextResponse.json({ ticketId, expiresAt });
}
