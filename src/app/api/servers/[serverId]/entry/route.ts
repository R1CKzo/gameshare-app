import { NextResponse } from "next/server";

import { corsPreflight, withCors } from "@/lib/cors";
import { getRequestSession } from "@/lib/getRequestSession";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Mesma logica de src/app/servers/[serverId]/page.tsx (que so acha o
// primeiro canal e redireciona) -- versao pro app de desktop embutido
// decidir pra onde navegar sozinho (ver desktop-ui/app/page.tsx).
export async function GET(request: Request, { params }: { params: { serverId: string } }) {
  const session = await getRequestSession(request);
  if (!session?.user?.id) {
    return withCors(request, NextResponse.json({ error: "Não autenticado." }, { status: 401 }));
  }

  const [membership, firstChannel] = await Promise.all([
    prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: session.user.id, serverId: params.serverId } },
      select: { id: true },
    }),
    prisma.channel.findFirst({
      where: { serverId: params.serverId },
      orderBy: { position: "asc" },
      select: { id: true },
    }),
  ]);

  if (!membership) {
    return withCors(request, NextResponse.json({ error: "not-a-member" }, { status: 403 }));
  }
  if (!firstChannel) {
    return withCors(request, NextResponse.json({ error: "no-channels" }, { status: 404 }));
  }

  return withCors(request, NextResponse.json({ firstChannelId: firstChannel.id }));
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
