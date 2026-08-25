"use client";

import { useEffect, useState } from "react";

import { GameShareMark } from "@/components/GameShareMark";
import { isBetaEnabled } from "@/lib/beta";
import { isDesktopApp } from "@/lib/desktop";

// Faixa customizada no topo da janela do app de desktop -- so existe
// quando a janela nasceu SEM moldura nativa (titleBarOverlay, ver
// createWindow em desktop/main.js), o que so acontece quando "Permitir
// versoes beta" estava ligado no boot desse mesmo lancamento do app. Os
// botoes de minimizar/maximizar/fechar continuam sendo desenhados pelo
// proprio Windows (flutuam por cima, do lado direito, na cor combinada em
// main.js) -- essa faixa so precisa reservar o espaco pra eles e mostrar a
// marca do app do lado esquerdo, arrastavel igual a barra de titulo de
// qualquer janela.
//
// A altura daqui (36px) tem que bater exatamente com titleBarOverlay.height
// em main.js, e com --titlebar-h (ver o script inline em layout.tsx, que
// tambem so liga no mesmo boot em que a janela nasceu sem moldura) -- as
// telas do app usam esse valor pra descontar da propria altura e nao ficar
// cortadas embaixo da janela.
export function DesktopTitleBar() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isDesktopApp() && isBetaEnabled());
  }, []);

  if (!show) return null;

  return (
    <div
      className="flex h-9 shrink-0 select-none items-center gap-2 bg-rail px-3 text-xs font-bold text-dim"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <GameShareMark size={16} />
      GameShare
    </div>
  );
}
