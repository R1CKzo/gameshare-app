import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth";

// Sem isso, o Next as vezes trata essa rota como estatica (a analise de
// build nem sempre "enxerga" que a biblioteca do NextAuth le cookies por
// baixo dos panos) — no ambiente beta isso fez /api/auth/session ficar
// preso devolvendo a primeira resposta que ele gerou (vazia, de antes de
// alguem logar), mesmo com um cookie de sessao valido em toda requisicao
// depois disso. O useSession() do lado do cliente depende dessa rota, entao
// a pessoa aparecia deslogada (e voltava pra tela de login) mesmo com a
// sessao valendo no servidor.
export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
