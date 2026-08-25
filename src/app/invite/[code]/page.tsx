import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DeadEndScreen } from "@/components/DeadEndScreen";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Link de convite clicavel: /invite/abc123ef. Middleware garante que quem
// chega aqui ja esta autenticado e ja tem nickname/tag definidos.
export default async function InvitePage({ params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const server = await prisma.server.findUnique({
    where: { inviteCode: params.code.trim().toLowerCase() },
    select: { id: true, name: true },
  });

  if (!server) {
    return <DeadEndScreen title="Convite inválido" description="Esse código de convite não existe ou expirou." />;
  }

  const ban = await prisma.serverBan.findUnique({
    where: { serverId_userId: { serverId: server.id, userId: session.user.id } },
    select: { id: true },
  });
  if (ban) {
    return (
      <DeadEndScreen title="Você foi banido desse servidor" description="Não é possível entrar por esse convite." />
    );
  }

  await prisma.serverMember.upsert({
    where: { userId_serverId: { userId: session.user.id, serverId: server.id } },
    create: { userId: session.user.id, serverId: server.id },
    update: {},
  });

  redirect(`/servers/${server.id}`);
}
