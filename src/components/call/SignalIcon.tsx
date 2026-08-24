import type { ConnectionQuality } from "@/hooks/useVoiceMesh";

const QUALITY_COLOR: Record<ConnectionQuality, string> = {
  good: "var(--color-online)",
  medium: "var(--color-away)",
  bad: "var(--color-danger)",
};
const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  good: "Conexão boa",
  medium: "Conexão instável",
  bad: "Conexão ruim",
};
// Quantas barrinhas ficam "acesas" (cor cheia) pra cada nivel — as demais
// ficam esmaecidas, mesmo desenho de indicador de sinal que apps de
// chamada em geral usam (estilo barrinhas de sinal do Discord).
const QUALITY_BARS: Record<ConnectionQuality, number> = { good: 3, medium: 2, bad: 1 };

// Sinal de conexao — auto-relatado por cada pessoa (ver
// useVoiceMesh.getConnectionQuality), nunca um valor inventado por quem
// esta olhando. GOOD e o padrao ate a primeira medicao real chegar, entao
// isso sempre tem algo pra mostrar, igual o indicador do Discord.
export function SignalIcon({ quality, className = "" }: { quality: ConnectionQuality; className?: string }) {
  const lit = QUALITY_BARS[quality];
  const color = QUALITY_COLOR[quality];
  return (
    <div title={QUALITY_LABEL[quality]} className={`flex items-end gap-[1.5px] ${className}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{ height: 3 + i * 2.5, backgroundColor: i < lit ? color : "var(--color-border)" }}
          className="w-[3px] rounded-sm"
        />
      ))}
    </div>
  );
}
