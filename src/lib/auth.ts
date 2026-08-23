import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
  ],
  // Sessao em JWT: necessario para o middleware conseguir ler o token
  // (rotas protegidas / redirecionamento para o setup de nickname)
  // mesmo usando o PrismaAdapter para persistir usuarios/contas.
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }

      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { nickname: true, userTag: true, isAdmin: true, passwordHash: true },
        });
        token.nickname = dbUser?.nickname ?? null;
        token.userTag = dbUser?.userTag ?? null;
        token.isAdmin = dbUser?.isAdmin ?? false;
        token.hasPassword = dbUser?.passwordHash != null;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.nickname = (token.nickname as string | null) ?? null;
        session.user.userTag = (token.userTag as string | null) ?? null;
        session.user.isAdmin = Boolean(token.isAdmin);
        session.user.hasPassword = Boolean(token.hasPassword);
      }
      return session;
    },
  },
};
