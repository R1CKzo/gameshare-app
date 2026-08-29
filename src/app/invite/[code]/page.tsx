import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DeadEndScreen } from "@/components/DeadEndScreen";
import { ParentalAuthGate } from "@/components/ParentalAuthGate";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { joinServerByInviteCode } from "@/lib/serverJoin";

export const dynamic = "force-dynamic";

// Link de convite clicavel: /invite/abc123ef. Middleware garante que quem
// chega aqui ja esta autenticado e ja tem nickname/tag definidos.
export default async function InvitePage({ params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const code = params.code.trim().toLowerCase();
  const server = await prisma.server.findUnique({
    where: { inviteCode: code },
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

  const alreadyMember = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: session.user.id, serverId: server.id } },
    select: { id: true },
  });

  // Controle parental: so pede autorizacao pra ENTRAR de novo, nunca pra
  // continuar acessando servidor que a conta ja era membro.
  if (!alreadyMember) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { parentalControlEnabled: true },
    });
    if (user?.parentalControlEnabled) {
      return <ParentalAuthGate action="JOIN_SERVER" targetId={code} redirectTo={`/servers/${server.id}`} />;
    }
  }

  await joinServerByInviteCode(session.user.id, code);
  redirect(`/servers/${server.id}`);
}
