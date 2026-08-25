import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { DeadEndScreen } from "@/components/DeadEndScreen";
import { DMChatView } from "@/components/dm/DMChatView";
import { DMSidebar } from "@/components/shell/DMSidebar";
import { FriendsShell } from "@/components/shell/FriendsShell";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DMPage({ params }: { params: { dmChannelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  // Nenhuma das duas depende da outra — rodar junto em vez de uma depois
  // da outra corta pela metade a viagem ate o banco.
  const [dmChannel, servers] = await Promise.all([
    prisma.dMChannel.findUnique({
      where: { id: params.dmChannelId },
      select: {
        id: true,
        isLive: true,
        broadcaster: { select: { id: true, nickname: true, userTag: true } },
        participants: {
          select: { user: { select: { id: true, nickname: true, userTag: true, image: true } } },
        },
      },
    }),
    prisma.server.findMany({
      where: { members: { some: { userId: session.user.id } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, image: true },
    }),
  ]);

  const isParticipant = dmChannel?.participants.some((p) => p.user.id === session.user.id) ?? false;
  const otherUser = dmChannel?.participants.map((p) => p.user).find((u) => u.id !== session.user.id);

  if (!dmChannel || !isParticipant || !otherUser) {
    return <NotFoundScreen />;
  }

  return (
    <FriendsShell
      servers={servers}
      sidebar={
        <DMSidebar
          user={{ nickname: session.user.nickname, userTag: session.user.userTag, image: session.user.image ?? null }}
          currentDmId={dmChannel.id}
        />
      }
    >
      <DMChatView
        dmChannelId={dmChannel.id}
        currentUserId={session.user.id}
        otherUser={otherUser}
        initialLive={{ isLive: dmChannel.isLive, broadcaster: dmChannel.broadcaster }}
      />
    </FriendsShell>
  );
}

function NotFoundScreen() {
  return (
    <DeadEndScreen
      title="Conversa não encontrada"
      description="Ela pode ter sido apagada, ou você não faz parte dela."
    />
  );
}
