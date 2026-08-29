import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { verifySecurityCode } from "@/lib/securityCode";

// So desativa com as DUAS coisas certas: o codigo mandado agora pro
// parentEmail E a senha de remocao criada no setup. Uma sozinha nao
// basta -- de proposito, ver contexto em prisma/schema.prisma no campo
// parentalRemovalPasswordHash.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ticketId = String(body?.ticketId ?? "");
  const code = String(body?.code ?? "");
  const removalPassword = String(body?.removalPassword ?? "");
  if (!ticketId || !code || !removalPassword) {
    return NextResponse.json({ error: "Informe o código e a senha de remoção." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { parentalControlEnabled: true, parentalRemovalPasswordHash: true },
  });
  if (!user?.parentalControlEnabled || !user.parentalRemovalPasswordHash) {
    return NextResponse.json({ error: "O controle parental não está ativo nessa conta." }, { status: 400 });
  }

  const result = await verifySecurityCode(ticketId, code, "PARENTAL_REMOVAL");
  if (!result.ok) {
    if (result.reason === "too_many_attempts") {
      return NextResponse.json({ error: "Muitas tentativas erradas. Peça um novo código." }, { status: 429 });
    }
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 400 });
  }
  if (result.userId !== session.user.id) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  const passwordOk = await verifyPassword(removalPassword, user.parentalRemovalPasswordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: "Senha de remoção incorreta." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      parentEmail: null,
      parentEmailVerifiedAt: null,
      parentalControlEnabled: false,
      parentalRemovalPasswordHash: null,
    },
  });

  return NextResponse.json({ ok: true });
}
