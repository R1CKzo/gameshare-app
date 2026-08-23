import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 4000;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;

// So a conta administradora (User.isAdmin) enxerga a lista — qualquer
// outra conta logada recebe 403, e quem nao esta logado nem chega aqui
// (a pagina /admin/bugs ja barra antes).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }

  const reports = await prisma.bugReport.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      severity: true,
      status: true,
      context: true,
      appVersion: true,
      createdAt: true,
      user: { select: { id: true, nickname: true, userTag: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ reports });
}

// Qualquer pessoa logada pode reportar um bug — nao exige ser membro de
// servidor nenhum, e propositalmente sem limite de taxa: o volume esperado
// e baixo (um grupo de amigos, nao usuarios anonimos da internet).
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const severity = SEVERITIES.includes(body?.severity) ? body.severity : "MEDIUM";
  const context = typeof body?.context === "string" ? body.context.slice(0, 300) : null;
  const appVersion = typeof body?.appVersion === "string" ? body.appVersion.slice(0, 60) : null;

  if (!title || title.length > MAX_TITLE) {
    return NextResponse.json({ error: "Título precisa ter entre 1 e 120 caracteres." }, { status: 400 });
  }
  if (!description || description.length > MAX_DESCRIPTION) {
    return NextResponse.json({ error: "Descreva o problema (até 4000 caracteres)." }, { status: 400 });
  }

  const report = await prisma.bugReport.create({
    data: { title, description, severity, context, appVersion, userId: session.user.id },
    select: { id: true },
  });

  return NextResponse.json({ id: report.id }, { status: 201 });
}
