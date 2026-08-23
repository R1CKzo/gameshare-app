import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateUniqueInviteCode } from "@/utils/generateInviteCode";

// Cria um novo servidor: o usuario autenticado vira dono e membro,
// e o servidor nasce com um canal de texto e um canal de chamada padrao.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name: string = body?.name?.trim();

  if (!name || name.length < 2 || name.length > 40) {
    return NextResponse.json(
      { error: "Nome do servidor deve ter entre 2 e 40 caracteres." },
      { status: 400 }
    );
  }

  const inviteCode = await generateUniqueInviteCode();

  const server = await prisma.server.create({
    data: {
      name,
      inviteCode,
      ownerId: session.user.id,
      members: {
        create: { userId: session.user.id },
      },
      channels: {
        create: [
          { name: "geral", type: "TEXT", position: 0 },
          { name: "sala-1", type: "CALL", position: 1 },
        ],
      },
    },
    include: { channels: true },
  });

  return NextResponse.json({ id: server.id, name: server.name, inviteCode: server.inviteCode });
}
