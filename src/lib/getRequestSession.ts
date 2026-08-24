import { getServerSession, type Session } from "next-auth";
import { decode } from "next-auth/jwt";

import { authOptions } from "@/lib/auth";

// Tenta a sessao por cookie primeiro (site, comportamento identico ao de
// sempre); se nao tiver cookie, decodifica um header
// "Authorization: Bearer <token>" -- caminho usado pelo app de desktop
// embutido, que roda numa origem diferente e nao pode contar com cookie
// (ver plano de app nativo). O token e o mesmo formato de JWT que a sessao
// por cookie usa (ver src/lib/mintSession.ts), so entregue por outro
// caminho -- nenhuma rota que ja usa getServerSession precisa mudar de
// formato de dado, so trocar a chamada por essa.
export async function getRequestSession(request: Request): Promise<Session | null> {
  const cookieSession = await getServerSession(authOptions);
  if (cookieSession?.user?.id) return cookieSession;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const secret = process.env.NEXTAUTH_SECRET as string;
  const decoded = await decode({ token, secret }).catch(() => null);
  if (!decoded?.id) return null;

  return {
    user: {
      id: decoded.id,
      name: (decoded.name as string | null) ?? null,
      email: (decoded.email as string | null) ?? null,
      image: (decoded.picture as string | null) ?? null,
      nickname: decoded.nickname,
      userTag: decoded.userTag,
      isAdmin: decoded.isAdmin,
      hasPassword: decoded.hasPassword,
    },
    expires: new Date(Number(decoded.exp ?? 0) * 1000).toISOString(),
  };
}
