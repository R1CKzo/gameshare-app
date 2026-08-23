import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CloseNovidadesButton } from "@/components/novidades/CloseNovidadesButton";
import { changelog } from "@/data/changelog";
import { authOptions } from "@/lib/auth";

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
            <div key={i} className="rounded-xl border border-[#2d3344] bg-elevated/40 p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="font-display text-base font-bold text-[#f5f5f7]">{entry.title}</h2>
                <span className="text-xs font-semibold text-dim">{formatDate(entry.date)}</span>
              </div>
              <ul className="space-y-1.5">
                {entry.items.map((item, j) => (
                  <li key={j} className="flex gap-2 text-sm text-[#d5d7dc]">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
