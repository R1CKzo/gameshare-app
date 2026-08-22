import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ServerRedirectPage({ params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId: params.serverId } },
    select: { id: true },
  });
  if (!membership) notFound();

  const firstChannel = await prisma.channel.findFirst({
    where: { serverId: params.serverId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!firstChannel) notFound();

  redirect(`/servers/${params.serverId}/channels/${firstChannel.id}`);
}
