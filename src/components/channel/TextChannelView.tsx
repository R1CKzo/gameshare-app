export function TextChannelView({ name }: { name: string }) {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5">
        <span className="text-xl font-semibold text-muted">#</span>
        <span className="font-bold">{name}</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-elevated">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div className="font-display text-lg font-bold">O chat de #{name} esta chegando</div>
        <div className="max-w-xs text-sm text-muted">
          Por enquanto, use as salas de chamada para conversar e compartilhar sua tela com o servidor.
        </div>
      </div>

      <div className="px-6 pb-5">
        <div className="flex h-11 items-center gap-3 rounded-xl bg-elevated px-3.5 opacity-50">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="flex-1 text-sm text-muted">Enviar mensagem em #{name}</span>
        </div>
      </div>
    </>
  );
}
