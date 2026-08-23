import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Todo canal de texto de todo servidor que a pessoa e membro, mais toda DM
// dela, com o estado inicial de "tem mensagem nao lida". Chamado uma vez no
// carregamento do app: alimenta tanto os badges iniciais quanto a lista de
// canais que o listener global do Pusher vai assinar (ver
// GlobalNotificationListener.tsx) — sem isso nao tem como saber, de um
// lugar so, em quais canais escutar mensagem nova.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }
  const userId = session.user.id;

  const [channels, dmChannels, channelReads, dmReads] = await Promise.all([
    prisma.channel.findMany({
      where: { type: "TEXT", server: { members: { some: { userId } } } },
      select: {
        id: true,
        serverId: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.dMChannel.findMany({
      where: { participants: { some: { userId } } },
      select: {
        id: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.channelRead.findMany({ where: { userId }, select: { channelId: true, lastReadAt: true } }),
    prisma.dMRead.findMany({ where: { userId }, select: { dmChannelId: true, lastReadAt: true } }),
  ]);

  const channelReadMap = new Map(channelReads.map((r) => [r.channelId, r.lastReadAt]));
  const dmReadMap = new Map(dmReads.map((r) => [r.dmChannelId, r.lastReadAt]));

  // Sem linha de leitura = tratado como lido (evita badge retroativo em
  // canal que a pessoa nunca visitou desde que esse recurso existe).
  return NextResponse.json({
    channels: channels.map((c) => {
      const lastMessageAt = c.messages[0]?.createdAt ?? null;
      const lastReadAt = channelReadMap.get(c.id) ?? null;
      return {
        channelId: c.id,
        serverId: c.serverId,
        unread: Boolean(lastReadAt && lastMessageAt && lastMessageAt > lastReadAt),
      };
    }),
    dms: dmChannels.map((d) => {
      const lastMessageAt = d.messages[0]?.createdAt ?? null;
      const lastReadAt = dmReadMap.get(d.id) ?? null;
      return {
        dmChannelId: d.id,
        unread: Boolean(lastReadAt && lastMessageAt && lastMessageAt > lastReadAt),
      };
    }),
  });
}
