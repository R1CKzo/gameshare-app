"use client";

import { useEffect, useRef, useState } from "react";

// Mecanica compartilhada de menu flutuante em portal: calcula a posicao no
// clique, fecha sozinho ao clicar fora ou apertar Esc. Extraido porque o
// menu de opcoes do canal, o da DM e o MoreMenu reimplementavam cada um a
// mesma logica (so o calculo de posicao varia entre eles).
export function useFloatingMenu(getPosition: (buttonRect: DOMRect) => { top: number; left: number }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      setPosition(getPosition(buttonRef.current.getBoundingClientRect()));
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      document.addEventListener("keydown", onKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, position, buttonRef, menuRef, toggleOpen };
}
