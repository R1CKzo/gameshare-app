import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CloseNovidadesButton } from "@/components/novidades/CloseNovidadesButton";
import { changelog, changelogKey } from "@/data/changelog";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} de ${MESES[month - 1]} de ${year}`;
}

// Lista do que mudou em cada leva de atualizações — em vez de só contar no
// chat, o resumo fica guardado aqui, dentro do proprio app.
export default async function NovidadesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  // Visitar essa pagina (seja por link ou pelo redirecionamento automatico
  // do GlobalNotificationListener) sempre marca a entrada mais recente como
  // vista — e o que faz o redirecionamento automatico so acontecer uma vez
  // por atualizacao.
  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastSeenChangelogKey: changelogKey(changelog[0]) },
  });

  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 text-xs font-bold tracking-wide text-dim">GAMESHARE</div>
            <h1 className="font-display text-2xl font-bold">Novidades</h1>
            <p className="mt-1 text-sm text-muted">Tudo que mudou no app, mais recente primeiro.</p>
          </div>
          <CloseNovidadesButton />
        </div>

        <div className="space-y-6">
          {changelog.map((entry, i) => (
            <div key={i} className="rounded-xl border border-border bg-elevated/40 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {entry.version && (
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary-hover">
                      v{entry.version}
                    </span>
                  )}
                  <h2 className="font-display text-base font-bold text-foreground">{entry.title}</h2>
                </div>
                <span className="text-xs font-semibold text-dim">{formatDate(entry.date)}</span>
              </div>

              {entry.items.length > 0 && (
                <ul className="space-y-1.5">
                  {entry.items.map((item, j) => (
                    <li key={j} className="flex gap-2 text-sm text-foreground-secondary">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}

              {entry.betaFeatures && entry.betaFeatures.length > 0 && (
                <div className={entry.items.length > 0 ? "mt-3" : ""}>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-muted">
                    <span className="rounded bg-accent px-1 py-px text-[9px] font-bold text-background">BETA</span>
                    RECURSOS EM TESTE
                  </div>
                  <p className="mb-1.5 text-xs text-dim">Só aparecem pra quem ligar "Permitir versões beta" nas Configurações.</p>
                  <ul className="space-y-1.5">
                    {entry.betaFeatures.map((item, j) => (
                      <li key={j} className="flex gap-2 text-sm text-foreground-secondary">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {entry.bugsFixed && entry.bugsFixed.length > 0 && (
                <div className={entry.items.length > 0 || (entry.betaFeatures && entry.betaFeatures.length > 0) ? "mt-3" : ""}>
                  <div className="mb-1.5 text-[11px] font-bold tracking-wider text-muted">BUGS CORRIGIDOS</div>
                  <ul className="space-y-1.5">
                    {entry.bugsFixed.map((item, j) => (
                      <li key={j} className="flex gap-2 text-sm text-foreground-secondary">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-danger" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
