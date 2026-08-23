import { prisma } from "@/lib/prisma";

export type ServerPermissions = {
  isOwner: boolean;
  canKick: boolean;
  canBan: boolean;
  canManageRoles: boolean;
};

const NO_PERMISSIONS: ServerPermissions = {
  isOwner: false,
  canKick: false,
  canBan: false,
  canManageRoles: false,
};

// O dono do servidor sempre tem permissao plena, sem precisar de cargo —
// checado antes de olhar o cargo do membro. Usado por toda rota de
// moderacao/gestao de servidor (expulsar, banir, gerenciar cargos).
export async function getServerPermissions(serverId: string, userId: string): Promise<ServerPermissions> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ownerId: true },
  });
  if (!server) return NO_PERMISSIONS;

  if (server.ownerId === userId) {
    return { isOwner: true, canKick: true, canBan: true, canManageRoles: true };
  }

  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } },
    select: { role: { select: { canKick: true, canBan: true, canManageRoles: true } } },
  });
  if (!member) return NO_PERMISSIONS;

  return {
    isOwner: false,
    canKick: member.role?.canKick ?? false,
    canBan: member.role?.canBan ?? false,
    canManageRoles: member.role?.canManageRoles ?? false,
  };
}
