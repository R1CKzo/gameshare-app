import { NextResponse } from "next/server";

import { sendSecurityCodeEmail } from "@/lib/email";
import { hashPassword, isValidPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createSecurityCode } from "@/lib/securityCode";

// Cria a conta e ja dispara o mesmo fluxo de codigo do login — o primeiro
// login confirma o email, nao precisa de um passo de verificacao separado.
// Nickname/tag continuam sendo definidos depois em /setup, igual ao Google.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Informe um email válido." }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: "A senha precisa ter entre 8 e 72 caracteres." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // Mensagem generica — nao revela se a conta existente e Google ou senha.
    return NextResponse.json({ error: "Já existe uma conta com esse email. Faça login." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: { id: true },
  });

  const { ticketId, code, expiresAt } = await createSecurityCode(user.id, "LOGIN");
  try {
    await sendSecurityCodeEmail({ to: email, code, purpose: "LOGIN" });
  } catch (err) {
    console.error("Falha ao enviar codigo de cadastro por email:", err);
    return NextResponse.json(
      { error: "Conta criada, mas não foi possível enviar o código por email. Tente fazer login." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ticketId, expiresAt });
}
