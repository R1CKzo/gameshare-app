import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { DMChatView } from "@/components/dm/DMChatView";
import { DMSidebar } from "@/components/shell/DMSidebar";
import { FriendsShell } from "@/components/shell/FriendsShell";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DMPage({ params }: { params: { dmChannelId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  const dmChannel = await prisma.dMChannel.findUnique({
    where: { id: params.dmChannelId },
    select: {
      id: true,
      isLive: true,
      broadcaster: { select: { id: true, nickname: true, userTag: true } },
      participants: {
        select: { user: { select: { id: true, nickname: true, userTag: true, image: true } } },
      },
    },
  });

  const isParticipant = dmChannel?.participants.some((p) => p.user.id === session.user.id) ?? false;
  const otherUser = dmChannel?.participants.map((p) => p.user).find((u) => u.id !== session.user.id);

  if (!dmChannel || !isParticipant || !otherUser) {
    return <NotFoundScreen />;
  }

  const servers = await prisma.server.findMany({
    where: { members: { some: { userId: session.user.id } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div>
        <h1 className="font-display text-xl font-bold">Conversa nao encontrada</h1>
        <p className="mt-2 text-sm text-muted">Ela pode ter sido apagada, ou voce nao faz parte dela.</p>
      </div>
    </div>
  );
}
