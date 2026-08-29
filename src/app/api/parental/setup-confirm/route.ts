import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { hashPassword, isValidPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { verifySecurityCode } from "@/lib/securityCode";

// Confirma o codigo mandado pro email do responsavel E grava, no mesmo
// passo, a senha de remocao que o responsavel acabou de criar -- as duas
// coisas juntas sao o que a partir de agora protege a conta de ser
// desativada por qualquer um (ver /api/parental/removal-confirm).
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ticketId = String(body?.ticketId ?? "");
  const code = String(body?.code ?? "");
  const removalPassword = String(body?.removalPassword ?? "");

  if (!ticketId || !code) {
    return NextResponse.json({ error: "Informe o código." }, { status: 400 });
  }
  if (!isValidPassword(removalPassword)) {
    return NextResponse.json({ error: "A senha de remoção precisa ter entre 8 e 72 caracteres." }, { status: 400 });
  }

  const result = await verifySecurityCode(ticketId, code, "PARENTAL_SETUP");
  if (!result.ok) {
    if (result.reason === "too_many_attempts") {
      return NextResponse.json({ error: "Muitas tentativas erradas. Peça um novo código." }, { status: 429 });
    }
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 400 });
  }
  if (result.userId !== session.user.id || !result.payload) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  const removalPasswordHash = await hashPassword(removalPassword);
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      parentEmail: result.payload,
      parentEmailVerifiedAt: new Date(),
      parentalControlEnabled: true,
      parentalRemovalPasswordHash: removalPasswordHash,
    },
  });

  return NextResponse.json({ ok: true, parentEmail: result.payload });
}
