import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    const hasNickname = Boolean(token?.nickname && token?.userTag);

    if (token && !hasNickname && pathname !== "/setup") {
      return NextResponse.redirect(new URL("/setup", req.url));
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

// Protege apenas as rotas que exigem usuario autenticado + nickname definido.
// "/" fica de fora de proposito: e a landing publica e ela mesma decide,
// no server component, para onde mandar o usuario (evita loop de redirect
// com pages.signIn = "/").
export const config = {
  matcher: ["/setup", "/servers/:path*"],
};
