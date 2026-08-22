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
  if (!membership) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div>
          <h1 className="font-display text-xl font-bold">Voce nao e membro desse servidor</h1>
          <p className="mt-2 text-sm text-muted">
            Peca pra quem te chamou o link de convite (algo como /invite/xxxxxxxx).
          </p>
        </div>
      </div>
    );
  }

  const firstChannel = await prisma.channel.findFirst({
    where: { serverId: params.serverId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!firstChannel) notFound();

  redirect(`/servers/${params.serverId}/channels/${firstChannel.id}`);
}
