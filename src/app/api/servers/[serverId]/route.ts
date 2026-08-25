import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const NAME_MAX = 40;
// Mesmo teto usado em src/app/api/user/profile/route.ts — o cliente ja
// redimensiona a imagem num canvas antes de mandar, isso aqui e so uma
// rede de seguranca.
const MAX_IMAGE_BASE64_LENGTH = 300_000;

// Renomeia e/ou troca a imagem do servidor — so o dono pode.
export async function PATCH(request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const server = await prisma.server.findUnique({
    where: { id: params.serverId },
    select: { ownerId: true },
  });
  if (!server) {
    return NextResponse.json({ error: "Servidor não encontrado." }, { status: 404 });
  }
  if (server.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Só o dono pode editar o servidor." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const data: { name?: string; image?: string } = {};

  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (!name || name.length > NAME_MAX) {
      return NextResponse.json({ error: `Nome inválido. Use até ${NAME_MAX} caracteres.` }, { status: 400 });
    }
    data.name = name;
  }

  if (typeof body?.image === "string") {
    if (body.image.length > MAX_IMAGE_BASE64_LENGTH) {
      return NextResponse.json({ error: "Imagem muito grande." }, { status: 400 });
    }
    if (!/^data:image\/(jpeg|png|webp|gif);base64,/.test(body.image)) {
      return NextResponse.json({ error: "Formato de imagem inválido." }, { status: 400 });
    }
    data.image = body.image;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada pra atualizar." }, { status: 400 });
  }

  const updated = await prisma.server.update({
    where: { id: params.serverId },
    data,
    select: { name: true, image: true },
  });

  return NextResponse.json(updated);
}

// Exclui o servidor inteiro — so o dono pode. Cascata do schema ja cuida
// de membros, canais, mensagens, cargos e banimentos.
export async function DELETE(_request: Request, { params }: { params: { serverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const server = await prisma.server.findUnique({
    where: { id: params.serverId },
    select: { ownerId: true },
  });
  if (!server) {
    return NextResponse.json({ error: "Servidor não encontrado." }, { status: 404 });
  }
  if (server.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Só o dono pode excluir o servidor." }, { status: 403 });
  }

  await prisma.server.delete({ where: { id: params.serverId } });

  return NextResponse.json({ ok: true });
}
