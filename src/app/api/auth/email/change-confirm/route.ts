import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifySecurityCode } from "@/lib/securityCode";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ticketId = String(body?.ticketId ?? "");
  const code = String(body?.code ?? "");
  if (!ticketId || !code) {
    return NextResponse.json({ error: "Informe o código." }, { status: 400 });
  }

  const result = await verifySecurityCode(ticketId, code, "EMAIL_CHANGE");
  if (!result.ok) {
    if (result.reason === "too_many_attempts") {
      return NextResponse.json({ error: "Muitas tentativas erradas. Peça um novo código." }, { status: 429 });
    }
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 400 });
  }

  if (result.userId !== session.user.id || !result.payload) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { email: result.payload, emailVerified: new Date() },
    });
  } catch {
    // Corrida rara: alguem pegou esse email entre o pedido do codigo e a
    // confirmacao (o unique do banco e quem garante de verdade, a checagem
    // em change-request e so uma resposta rapida no caminho feliz).
    return NextResponse.json({ error: "Esse email já está em uso por outra conta." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
