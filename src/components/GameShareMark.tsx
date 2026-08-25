"use client";

import { useEffect, useState } from "react";

import { isBetaEnabled } from "@/lib/beta";

// Marca do app — recurso em teste. Quem tem "Permitir versoes beta" ligado
// ve o logo novo (silhueta de controle: corpo, dois manipulos, cruz
// direcional e dois botoes); todo mundo continua vendo o icone de
// engrenagem de sempre (nunca foi um logo de verdade, so um placeholder
// generico reaproveitado como marca desde o inicio do projeto). Usado nos
// mesmos 4 lugares que hoje mostram esse placeholder: tela de login, tela
// de setup, topo da barra de servidores e a barra de titulo customizada do
// app de desktop (ver DesktopTitleBar.tsx).
export function GameShareMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  const [useNewMark, setUseNewMark] = useState(false);

  useEffect(() => {
    setUseNewMark(isBetaEnabled());
  }, []);

  if (useNewMark) {
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

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M4.9 4.9l2.8 2.8" />
      <path d="M16.3 16.3l2.8 2.8" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M4.9 19.1l2.8-2.8" />
      <path d="M16.3 7.7l2.8-2.8" />
    </svg>
  );
}
