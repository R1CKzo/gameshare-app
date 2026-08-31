import { GameShareMark } from "@/components/GameShareMark";

export const dynamic = "force-static";

// Pagina 100% estatica, sem sessao nem banco de dados -- e exatamente o
// que precisa continuar funcionando quando o banco (Neon) estiver fora
// do ar (ver MAINTENANCE_MODE em middleware.ts), que e o unico cenario
// em que essa tela aparece.
export default function ManutencaoPage() {
  return (
    <div className="relative flex min-h-[calc(100dvh_-_var(--titlebar-h,0px))] items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute -top-56 left-1/2 h-[900px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.20)_0%,rgba(34,211,238,0.08)_45%,transparent_70%)]" />

      <div className="relative flex flex-col items-center text-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent">
          <GameShareMark size={28} className="text-white" />
        </div>

        <h1 className="font-display text-2xl font-bold">GameShare está em manutenção</h1>
        <p className="mt-3 max-w-sm text-[15px] text-muted">
          Voltamos assim que possível. Tenta de novo daqui a pouco.
        </p>
      </div>
    </div>
  );
}
