import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { FriendsView } from "@/components/friends/FriendsView";
import { DMSidebar } from "@/components/shell/DMSidebar";
import { FriendsShell } from "@/components/shell/FriendsShell";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  const servers = await prisma.server.findMany({
    where: { members: { some: { userId: session.user.id } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, image: true },
  });

  return (
    <FriendsShell
      servers={servers}
      sidebar={
        <DMSidebar
          user={{ nickname: session.user.nickname, userTag: session.user.userTag, image: session.user.image ?? null }}
        />
      }
    >
      <FriendsView />
    </FriendsShell>
  );
}
