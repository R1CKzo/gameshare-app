import { NextResponse } from "next/server";

import { corsPreflight, withCors } from "@/lib/cors";
import { getRequestSession } from "@/lib/getRequestSession";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Lista de servidores que a pessoa e membro (id + nome), pra montar a
// barra de servidores (ServerRail) fora do server component -- mesma
// consulta que src/app/friends/page.tsx ja faz direto no Prisma. Primeira
// rota com CORS + login por token (ver src/lib/cors.ts e
// src/lib/getRequestSession.ts), como fatia de teste do app de desktop
// embutido.
export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session?.user?.id) {
    return withCors(request, NextResponse.json({ error: "Não autenticado." }, { status: 401 }));
  }

  const servers = await prisma.server.findMany({
    where: { members: { some: { userId: session.user.id } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, image: true },
  });

  return withCors(request, NextResponse.json({ servers }));
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
