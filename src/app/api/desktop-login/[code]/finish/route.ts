import { NextResponse } from "next/server";

import { buildSessionCookie, setSessionCookie } from "@/lib/mintSession";
import { prisma } from "@/lib/prisma";

const EXPIRATION_MS = 10 * 60 * 1000;

// A janela do app de desktop navega direto pra ca (nao e um fetch em
// segundo plano) assim que o poll em /api/desktop-login/[code] disser
// "ready" — e exatamente por ser uma navegacao de verdade que o
// Set-Cookie abaixo gruda na sessao daquela janela. O codigo e apagado na
// hora (uso unico), entao ninguem mais consegue reusar esse link depois.
export async function GET(request: Request, { params }: { params: { code: string } }) {
  const loginRequest = await prisma.desktopLoginRequest.findUnique({
    where: { code: params.code },
    select: { userId: true, createdAt: true },
  });

  await prisma.desktopLoginRequest.delete({ where: { code: params.code } }).catch(() => {});

  if (!loginRequest?.userId || Date.now() - loginRequest.createdAt.getTime() > EXPIRATION_MS) {
    return NextResponse.redirect(new URL("/?error=desktop-login-expired", request.url));
  }

  const user = await prisma.user.findUnique({
    where: { id: loginRequest.userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      nickname: true,
      userTag: true,
      isAdmin: true,
      passwordHash: true,
    },
  });
  if (!user) {
    return NextResponse.redirect(new URL("/?error=desktop-login-expired", request.url));
  }

  const cookie = await buildSessionCookie(user);
  const response = NextResponse.redirect(new URL("/", request.url));
  setSessionCookie(response, cookie);
  return response;
}
