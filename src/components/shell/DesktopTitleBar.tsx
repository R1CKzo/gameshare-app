"use client";

import { useEffect, useState } from "react";

import { GameShareMark } from "@/components/GameShareMark";
import {
  closeWindow,
  isDesktopApp,
  isWindowMaximized,
  minimizeWindow,
  onWindowMaximizedChanged,
  toggleMaximizeWindow,
} from "@/lib/desktop";

// Faixa customizada no topo da janela do app de desktop -- a janela sempre
// nasce SEM moldura nativa (frame: false, ver createWindow em
// desktop/main.js). Minimizar/maximizar/fechar sao desenhados AQUI, na
// propria pagina, em vez de deixar o Windows desenhar (como uma primeira
// versao fazia) --
// aquela versao so pintava uma cor de fundo fixa atras dos botoes
// nativos, que nunca batia direito com o tom exato de cada tela (login,
// Configuracoes etc usam tons escuros ligeiramente diferentes entre si) e
// nao trocava sozinha de cor ao alternar claro/escuro. Sendo pagina de
// verdade, usa os mesmos tokens de cor do resto do app -- sem costura em
// lugar nenhum, em qualquer tema.
//
// A altura daqui (36px) tem que bater com --titlebar-h (ver o script
// inline em layout.tsx, que liga essa variavel sempre que o boot e do app
// de desktop) -- as telas do app usam essa variavel pra descontar da
// propria altura e nao ficar cortadas embaixo da janela.
export function DesktopTitleBar() {
  const [show, setShow] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    setShow(isDesktopApp());
  }, []);

  useEffect(() => {
    if (!show) return;
    isWindowMaximized().then(setMaximized);
    return onWindowMaximizedChanged(setMaximized);
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="flex h-9 shrink-0 select-none items-center justify-between border-b border-overlay bg-background pl-3 text-xs font-bold text-dim"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      onDoubleClick={toggleMaximizeWindow}
    >
      <div className="flex items-center gap-2">
        <GameShareMark size={16} />
        GameShare
      </div>
      <div className="flex h-full items-stretch" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <TitleBarButton label="Minimizar" onClick={minimizeWindow}>
          <MinimizeIcon />
        </TitleBarButton>
        <TitleBarButton label={maximized ? "Restaurar" : "Maximizar"} onClick={toggleMaximizeWindow}>
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </TitleBarButton>
        <TitleBarButton label="Fechar" onClick={closeWindow} danger>
          <CloseIcon />
        </TitleBarButton>
      </div>
    </div>
  );
}

function TitleBarButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex w-11 items-center justify-center transition ${
        danger ? "text-dim hover:bg-danger hover:text-white" : "text-dim hover:bg-elevated-hover hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function MinimizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" />
      <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" />
    </svg>
  );
}
