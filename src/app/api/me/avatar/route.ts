import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DATA_URL_RE = /^data:([^;]+);base64,([\s\S]+)$/;

// Resolve a referencia curta que fica no token de sessao (ver
// src/lib/avatarUrl.ts) de volta pra imagem de verdade — le a data URL
// guardada no banco e devolve como uma resposta de imagem normal, em vez
// de embutir os KBs inteiros dentro do cookie de sessao.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse(null, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true },
  });

  if (!user?.image) {
    return new NextResponse(null, { status: 404 });
  }

  // Se por algum motivo a foto guardada agora e uma URL normal (ex:
  // trocou de volta pra usar a do Google), so redireciona pra ela.
  if (!user.image.startsWith("data:")) {
    return NextResponse.redirect(user.image);
  }

  const match = DATA_URL_RE.exec(user.image);
  if (!match) {
    return new NextResponse(null, { status: 404 });
  }

  const [, mime, base64] = match;
  const buffer = Buffer.from(base64, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mime,
      // Privada (tem sessao no meio) mas cacheavel por um tempo curto — a
      // foto raramente muda de um request pro outro.
      "Cache-Control": "private, max-age=300",
    },
  });
}
