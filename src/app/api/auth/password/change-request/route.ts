import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { checkAndBumpThrottle } from "@/lib/authThrottle";
import { sendSecurityCodeEmail } from "@/lib/email";
import { hashPassword, isValidPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createSecurityCode } from "@/lib/securityCode";

// Pede o codigo pra definir (conta so-Google) ou trocar (ja tem senha) a
// senha. A senha nova so e aplicada de verdade em /change-confirm, depois
// do codigo bater — mesma filosofia de "codigo sempre" do login.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const currentPassword: string | undefined = body?.currentPassword;
  const newPassword = String(body?.newPassword ?? "");

  if (!isValidPassword(newPassword)) {
    return NextResponse.json({ error: "A nova senha precisa ter entre 8 e 72 caracteres." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  if (user.passwordHash) {
    const throttle = await checkAndBumpThrottle(`pwdchange:${user.id}`, {
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      lockoutMs: 15 * 60 * 1000,
    });
    if (!throttle.allowed) {
      return NextResponse.json({ error: "Muitas tentativas. Tente de novo mais tarde." }, { status: 429 });
    }
    if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
    }
  }

  const newHash = await hashPassword(newPassword);
  const { ticketId, code, expiresAt } = await createSecurityCode(user.id, "PASSWORD_CHANGE", newHash);
  try {
    await sendSecurityCodeEmail({ to: user.email, code, purpose: "PASSWORD_CHANGE" });
  } catch {
    return NextResponse.json({ error: "Não foi possível enviar o código por email." }, { status: 500 });
  }

  return NextResponse.json({ ticketId, expiresAt });
}
