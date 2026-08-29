import { prisma } from "@/lib/prisma";

export type JoinResult = { ok: true; serverId: string; serverName: string } | { ok: false; error: string; status: number };

// Logica de "entrar num servidor por codigo de convite", compartilhada
// entre /api/servers/join (entrada manual) e /invite/[code] (link
// clicavel) -- e tambem chamada de dentro de
// /api/parental/authorize-confirm quando a conta tem controle parental
// ligado, so que so DEPOIS do codigo dos pais confirmar.
export async function joinServerByInviteCode(userId: string, inviteCode: string): Promise<JoinResult> {
  const server = await prisma.server.findUnique({
    where: { inviteCode: inviteCode.trim().toLowerCase() },
    select: { id: true, name: true },
  });
  if (!server) {
    return { ok: false, error: "Código de convite inválido.", status: 404 };
  }

  const ban = await prisma.serverBan.findUnique({
    where: { serverId_userId: { serverId: server.id, userId } },
    select: { id: true },
  });
  if (ban) {
    return { ok: false, error: "Você foi banido desse servidor.", status: 403 };
  }

  await prisma.serverMember.upsert({
    where: { userId_serverId: { userId, serverId: server.id } },
    create: { userId, serverId: server.id },
    update: {},
  });

  return { ok: true, serverId: server.id, serverName: server.name };
}
