// Marca do app: silhueta de controle (corpo, dois manipulos, cruz
// direcional e dois botoes). Usada nos mesmos 4 lugares: tela de login,
// tela de setup, topo da barra de servidores e a barra de titulo
// customizada do app de desktop (ver DesktopTitleBar.tsx).
export function GameShareMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className}>
      <rect x="12" y="32" width="76" height="34" rx="17" fill="currentColor" />
      <circle cx="20" cy="64" r="15" fill="currentColor" />
      <circle cx="80" cy="64" r="15" fill="currentColor" />
      <rect x="27" y="39" width="7" height="19" rx="1.5" fill="#7c3aed" />
      <rect x="21" y="45" width="19" height="7" rx="1.5" fill="#7c3aed" />
      <circle cx="64" cy="42" r="5" fill="#22d3ee" />
      <circle cx="76" cy="52" r="5" fill="#22d3ee" />
    </svg>
  );
}
