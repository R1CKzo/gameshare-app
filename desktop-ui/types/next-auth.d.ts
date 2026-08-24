// Copia de ../src/types/next-auth.d.ts -- augmentacoes ambientes de tipo
// (declare module) precisam existir dentro do proprio projeto TypeScript
// pra serem reconhecidas de forma confiavel; tentar "alcancar" o arquivo
// do projeto principal via tsconfig include falhou de forma inconsistente
// no verificador de tipos do Next (funcionava as vezes local, sempre
// falhava no CI). E so tipo, sem logica nenhuma -- se o formato da sessao
// mudar em src/lib/auth.ts, atualizar aqui tambem.
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      nickname: string | null;
      userTag: string | null;
      isAdmin: boolean;
      hasPassword: boolean;
    } & DefaultSession["user"];
  }
}
