import { NextResponse } from "next/server";

import { buildSessionCookie, setSessionCookie } from "@/lib/mintSession";
import { prisma } from "@/lib/prisma";

const EXPIRATION_MS = 10 * 60 * 1000;

// A janela do app de desktop navega direto pra ca (nao e um fetch em
// segundo plano) assim que o poll em /api/desktop-login/[code] disser
// "ready" — e exatamente por ser uma navegacao de verdade que o
// Set-Cookie abaixo gruda na sessao daquela janela. O codigo e apagado na
// hora (uso unico), entao ninguem mais consegue reusar esse link depois.
//
// `?as=token` e o modo novo pro app de desktop embutido (ver plano de app
// nativo): devolve o mesmo JWT em JSON em vez de Set-Cookie + redirect,
// porque uma vez que a interface roda numa origem diferente da API, um
// cookie setado aqui nunca chegaria ate ela. O processo principal do
// Electron chama essa rota direto (fetch em Node, fora do navegador — sem
// exposicao de CORS), guarda o token com safeStorage, e passa a mandar
// "Authorization: Bearer <token>" em toda chamada (ver
// src/lib/getRequestSession.ts). O modo padrao (sem esse parametro)
// continua identico ao de sempre.
export async function GET(request: Request, { params }: { params: { code: string } }) {
  const loginRequest = await prisma.desktopLoginRequest.findUnique({
    where: { code: params.code },
    select: { userId: true, createdAt: true },
  });

  await prisma.desktopLoginRequest.delete({ where: { code: params.code } }).catch(() => {});

  const asToken = new URL(request.url).searchParams.get("as") === "token";

  if (!loginRequest?.userId || Date.now() - loginRequest.createdAt.getTime() > EXPIRATION_MS) {
    if (asToken) return NextResponse.json({ error: "expired" }, { status: 410 });
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
    if (asToken) return NextResponse.json({ error: "expired" }, { status: 410 });
    return NextResponse.redirect(new URL("/?error=desktop-login-expired", request.url));
  }

  const cookie = await buildSessionCookie(user);

  if (asToken) {
    return NextResponse.json({ token: cookie.value, expiresIn: cookie.maxAge });
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  setSessionCookie(response, cookie);
  return response;
}
