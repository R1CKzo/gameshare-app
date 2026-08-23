import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Mesma logica de src/app/api/channels/[channelId]/read/route.ts, pra uma DM.
export async function POST(_request: Request, { params }: { params: { dmChannelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  await prisma.dMRead.upsert({
    where: { userId_dmChannelId: { userId: session.user.id, dmChannelId: params.dmChannelId } },
    create: { userId: session.user.id, dmChannelId: params.dmChannelId },
    update: { lastReadAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
