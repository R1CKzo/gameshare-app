import { encode } from "next-auth/jwt";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const EXPIRATION_MS = 10 * 60 * 1000;
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // igual ao padrao do NextAuth (30 dias)

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
    select: { id: true, name: true, email: true, image: true, nickname: true, userTag: true },
  });
  if (!user) {
    return NextResponse.redirect(new URL("/?error=desktop-login-expired", request.url));
  }

  const secret = process.env.NEXTAUTH_SECRET as string;
  const jwt = await encode({
    secret,
    maxAge: MAX_AGE_SECONDS,
    token: {
      sub: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.image,
      nickname: user.nickname,
      userTag: user.userTag,
    },
  });

  const secure = (process.env.NEXTAUTH_URL ?? "").startsWith("https");
  const cookieName = secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(cookieName, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return response;
}
