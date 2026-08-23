import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;

// So a conta administradora pode mudar o status de um bug (marcar como "em
// andamento" ou "resolvido").
export async function PATCH(request: Request, { params }: { params: { bugId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  if (!STATUSES.includes(body?.status)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  try {
    const updated = await prisma.bugReport.update({
      where: { id: params.bugId },
      data: { status: body.status },
      select: { id: true, status: true },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Bug não encontrado." }, { status: 404 });
  }
}
