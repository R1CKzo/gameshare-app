import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { BugsList } from "@/components/admin/BugsList";
import { CloseBugsButton } from "@/components/admin/CloseBugsButton";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// So a conta marcada como isAdmin ve essa pagina — pra qualquer outra
// conta (mesmo logada), nem existe: 404 igual uma rota que nao existe de
// verdade, sem revelar que a area existe.
export default async function AdminBugsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.isAdmin) notFound();

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

  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 text-xs font-bold tracking-wide text-dim">ÁREA ADMINISTRATIVA</div>
            <h1 className="font-display text-2xl font-bold">Bugs reportados</h1>
            <p className="mt-1 text-sm text-muted">
              {reports.length === 0 ? "Nenhum reporte ainda." : `${reports.length} reporte${reports.length === 1 ? "" : "s"} no total.`}
            </p>
          </div>
          <CloseBugsButton />
        </div>
        <BugsList
          reports={reports.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
