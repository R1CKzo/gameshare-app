import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const EXPIRATION_MS = 10 * 60 * 1000;

// O app de desktop fica consultando esse endpoint enquanto o usuario
// termina o login no navegador de verdade. So diz "pronto" quando a pagina
// /desktop-login/[code] confirmar que um usuario logado assumiu esse
// codigo — nao entrega nenhum dado de sessao aqui, so o status.
export async function GET(_request: Request, { params }: { params: { code: string } }) {
  const request = await prisma.desktopLoginRequest.findUnique({
    where: { code: params.code },
    select: { userId: true, createdAt: true },
  });

  if (!request || Date.now() - request.createdAt.getTime() > EXPIRATION_MS) {
    return NextResponse.json({ status: "expired" });
  }

  return NextResponse.json({ status: request.userId ? "ready" : "pending" });
}
