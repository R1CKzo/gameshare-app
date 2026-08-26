import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DATA_URL_RE = /^data:([^;]+);base64,([\s\S]+)$/;

// Gemeo de /api/users/[userId]/avatar, so que pro icone de SERVIDOR (o
// link curto que publicServerImage() gera -- ver src/lib/avatarUrl.ts).
export async function GET(_request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse(null, { status: 401 });
  }

  const server = await prisma.server.findUnique({
    where: { id: params.serverId },
    select: { image: true },
  });

  if (!server?.image) {
    return new NextResponse(null, { status: 404 });
  }

  if (!server.image.startsWith("data:")) {
    return NextResponse.redirect(server.image);
  }

  const match = DATA_URL_RE.exec(server.image);
  if (!match) {
    return new NextResponse(null, { status: 404 });
  }

  const [, mime, base64] = match;
  const buffer = Buffer.from(base64, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
