import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { checkAndBumpThrottle } from "@/lib/authThrottle";
import { sendSecurityCodeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { createSecurityCode } from "@/lib/securityCode";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pede o codigo pra trocar o email (beta, Configuracoes > Privacidade e
// Seguranca) -- o codigo vai pro email NOVO (nao o atual), pra provar que
// a pessoa tem acesso a ele antes da troca valer. So aplicado de verdade
// em /change-confirm, mesma filosofia do change-request de senha.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const newEmail = String(body?.newEmail ?? "").trim().toLowerCase();

  if (!EMAIL_REGEX.test(newEmail)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true } });
  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }
  if (newEmail === user.email) {
    return NextResponse.json({ error: "Esse já é o seu email atual." }, { status: 400 });
  }

  const throttle = await checkAndBumpThrottle(`emailchange:${user.id}`, {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Tente de novo mais tarde." }, { status: 429 });
  }

  const taken = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (taken) {
    return NextResponse.json({ error: "Esse email já está em uso por outra conta." }, { status: 409 });
  }

  const { ticketId, code, expiresAt } = await createSecurityCode(user.id, "EMAIL_CHANGE", newEmail);
  try {
    await sendSecurityCodeEmail({ to: newEmail, code, purpose: "EMAIL_CHANGE" });
  } catch (err) {
    console.error("Falha ao enviar codigo de troca de email:", err);
    return NextResponse.json({ error: "Não foi possível enviar o código por email." }, { status: 500 });
  }

  return NextResponse.json({ ticketId, expiresAt });
}
