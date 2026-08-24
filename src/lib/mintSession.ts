import { encode } from "next-auth/jwt";
import type { NextResponse } from "next/server";

import { sessionSafeImage } from "@/lib/avatarUrl";

const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // igual ao padrao do NextAuth (30 dias)

type SessionUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  nickname: string | null;
  userTag: string | null;
  isAdmin: boolean;
  passwordHash: string | null;
};

// Monta o JWT de sessao na mao (fora do fluxo normal do NextAuth) — usado
// tanto pelo login por senha (depois do codigo confirmado) quanto pelo
// desktop-login, que ja fazia isso antes desse recurso existir. Os dois
// pontos que criam sessao precisam gerar exatamente o mesmo formato de
// token que o callback jwt() normal produziria.
export async function buildSessionCookie(
  user: SessionUser,
): Promise<{ name: string; value: string; maxAge: number; secure: boolean }> {
  const secret = process.env.NEXTAUTH_SECRET as string;
  const jwt = await encode({
    secret,
    maxAge: MAX_AGE_SECONDS,
    token: {
      sub: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      // Nunca a data URL crua aqui — ver src/lib/avatarUrl.ts. Uma foto
      // enviada por upload pode ter varios KB, e isso sozinho ja estoura o
      // limite de tamanho de cookie do navegador (~4KB), fazendo o
      // Set-Cookie ser descartado em silencio e a pessoa nunca ficar
      // logada de verdade — foi exatamente esse bug que aconteceu no login
      // do app de desktop.
      picture: sessionSafeImage(user.image),
      nickname: user.nickname,
      userTag: user.userTag,
      isAdmin: user.isAdmin,
      hasPassword: user.passwordHash !== null,
    },
  });

  const secure = (process.env.NEXTAUTH_URL ?? "").startsWith("https");
  const cookieName = secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";

  return { name: cookieName, value: jwt, maxAge: MAX_AGE_SECONDS, secure };
}

export function setSessionCookie(
  response: NextResponse,
  cookie: { name: string; value: string; maxAge: number; secure: boolean },
): void {
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookie.secure,
    path: "/",
    maxAge: cookie.maxAge,
  });
}
