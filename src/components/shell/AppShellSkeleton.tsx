// Mostrado na hora (via loading.tsx) enquanto o servidor busca os dados da
// proxima tela — sem isso, trocar de servidor/canal/DM fica com uma pausa
// morta no meio (o React Server Component so troca de tela quando TODOS os
// dados chegam). As larguras aqui batem exatamente com ServerRail (72px) e
// ChannelSidebar/DMSidebar (252px) pra nao ter nenhum solavanco quando a
// tela de verdade substitui esse esqueleto.
export function AppShellSkeleton() {
  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-main">
      <div className="hidden shrink-0 md:flex">
        <div className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-3">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-elevated" />
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-elevated/70" />
          <div className="my-1 h-px w-8 bg-white/10" />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-elevated/50"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>

        <div className="flex w-[252px] shrink-0 flex-col border-r border-overlay bg-sidebar">
          <div className="flex h-14 shrink-0 items-center border-b border-overlay px-4">
            <div className="h-4 w-28 animate-pulse rounded bg-elevated" />
          </div>
          <div className="flex-1 space-y-2 p-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-8 animate-pulse rounded-lg bg-elevated/60"
                style={{ animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
          <div className="flex h-16 shrink-0 items-center gap-2.5 border-t border-overlay bg-black/20 px-3">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-elevated" />
            <div className="h-3 w-24 animate-pulse rounded bg-elevated" />
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-overlay px-5">
          <div className="h-4 w-40 animate-pulse rounded bg-elevated" />
        </div>
        <div className="flex-1 space-y-3 p-5">
          {[62, 44, 51, 38].map((w, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-elevated/50"
              style={{ width: `${w}%`, animationDelay: `${i * 110}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
