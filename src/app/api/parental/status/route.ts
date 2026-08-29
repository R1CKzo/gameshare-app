import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// So o essencial pra desenhar a tela (ligado/desligado + qual email) --
// de proposito FORA da sessao/JWT (diferente de nickname/email/phone),
// pra nao carregar o email do responsavel em todo request feito pelo
// navegador da crianca.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { parentalControlEnabled: true, parentEmail: true },
  });

  return NextResponse.json({
    enabled: user?.parentalControlEnabled ?? false,
    parentEmail: user?.parentalControlEnabled ? user.parentEmail : null,
  });
}
