import { NextResponse } from "next/server";

import { buildSessionCookie, setSessionCookie } from "@/lib/mintSession";
import { prisma } from "@/lib/prisma";
import { verifySecurityCode } from "@/lib/securityCode";

// Passo 2 do login por senha (e ultimo passo do cadastro tambem — o
// primeiro login ja confirma o email, nao precisa de uma verificacao
// separada). So aqui, com o codigo confirmado, e que a sessao de verdade
// e criada.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ticketId = String(body?.ticketId ?? "");
  const code = String(body?.code ?? "");

  if (!ticketId || !code) {
    return NextResponse.json({ error: "Informe o código." }, { status: 400 });
  }

  const result = await verifySecurityCode(ticketId, code, "LOGIN");
  if (!result.ok) {
    if (result.reason === "too_many_attempts") {
      return NextResponse.json({ error: "Muitas tentativas erradas. Peça um novo código." }, { status: 429 });
    }
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      nickname: true,
      userTag: true,
      isAdmin: true,
      passwordHash: true,
      emailVerified: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  if (!user.emailVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  }

  const cookie = await buildSessionCookie(user);
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, cookie);
  return response;
}
