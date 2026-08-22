import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div>
          <h1 className="font-display text-xl font-bold">Convite invalido</h1>
          <p className="mt-2 text-sm text-muted">Esse codigo de convite nao existe ou expirou.</p>
        </div>
      </div>
    );
  }

  await prisma.serverMember.upsert({
    where: { userId_serverId: { userId: session.user.id, serverId: server.id } },
    create: { userId: session.user.id, serverId: server.id },
    update: {},
  });

  redirect(`/servers/${server.id}`);
}
