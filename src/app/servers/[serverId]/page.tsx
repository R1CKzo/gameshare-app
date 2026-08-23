import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ServerRedirectPage({ params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  // firstChannel nao depende do resultado de membership (so precisa do
  // serverId, ja disponivel na URL) — busca os dois juntos e so usa
  // firstChannel se a checagem de membro passar.
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div>
          <h1 className="font-display text-xl font-bold">Você não é membro desse servidor</h1>
          <p className="mt-2 text-sm text-muted">
            Peça pra quem te chamou o link de convite (algo como /invite/xxxxxxxx).
          </p>
        </div>
      </div>
    );
  }

  if (!firstChannel) notFound();

  redirect(`/servers/${params.serverId}/channels/${firstChannel.id}`);
}
