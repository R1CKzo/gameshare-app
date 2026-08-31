import { withAuth } from "next-auth/middleware";
import { type NextRequest, NextResponse } from "next/server";

// Liga na mao (e desliga na mao, editando essa linha) quando o banco
// (Neon) estiver fora do ar de verdade -- ver conversa que motivou isso:
// limite de transferencia do plano estourado bloqueia toda conexao com o
// banco, e sem essa tela qualquer pagina normal (login, servidor, etc)
// quebrava tentando consultar o banco morto. A tela de manutencao em si
// e 100% estatica, nao toca no banco nem na sessao.
const MAINTENANCE_MODE = true;

const PROTECTED_PREFIXES = ["/setup", "/servers", "/invite", "/friends", "/dms", "/admin", "/novidades"];

const authMiddleware = withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    const hasNickname = Boolean(token?.nickname && token?.userTag);

    if (token && !hasNickname && pathname !== "/setup") {
      const setupUrl = new URL("/setup", req.url);
      setupUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
      return NextResponse.redirect(setupUrl);
    }

    if (token && hasNickname && pathname === "/setup") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => Boolean(token),
    },
  }
);

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (MAINTENANCE_MODE) {
    if (pathname === "/manutencao") return NextResponse.next();
    return NextResponse.rewrite(new URL("/manutencao", req.url));
  }

  // Fora do modo manutencao, so aplica a checagem de sessao/nickname nas
  // rotas que sempre exigiram isso -- as demais (incluindo "/", a landing
  // publica) passam direto, igual sempre foi.
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isProtected) return NextResponse.next();

  return (authMiddleware as (req: NextRequest) => NextResponse)(req);
}

// Matcher agora cobre praticamente tudo (menos assets/API) so pra tela de
// manutencao conseguir interceptar QUALQUER pagina, incluindo "/" -- a
// funcao acima e quem decide, rota a rota, se aplica a checagem de sessao
// de verdade ou so deixa passar (comportamento identico ao de antes
// quando MAINTENANCE_MODE esta desligado).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
