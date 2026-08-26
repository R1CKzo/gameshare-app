import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DATA_URL_RE = /^data:([^;]+);base64,([\s\S]+)$/;

// Gemeo de /api/me/avatar, so que pra resolver a foto de QUALQUER usuario
// (o link curto que publicUserImage() gera -- ver src/lib/avatarUrl.ts) em
// vez de so a da propria sessao. Qualquer conta logada pode ver a foto de
// qualquer outra (mesma logica de qualquer app de chat: a foto de perfil
// nao e informacao sensivel dentro do app), so nao da pra acessar sem
// sessao nenhuma.
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse(null, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { image: true },
  });

  if (!user?.image) {
    return new NextResponse(null, { status: 404 });
  }

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
      // Publica (nao tem nada especifico da sessao de quem pediu) e
      // cacheavel por mais tempo que a /api/me/avatar -- a foto de outra
      // pessoa muda com bem menos frequencia do que a propria.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
