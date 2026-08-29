"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { usePresence } from "@/components/notifications/PresenceProvider";
import { StatusDot } from "@/components/shell/StatusDot";
import type { PresenceStatus } from "@/lib/presence";

const MENU_WIDTH = 200;

const OPTIONS: { value: "ONLINE" | "AWAY" | "BUSY"; label: string; dot: PresenceStatus }[] = [
  { value: "ONLINE", label: "Online", dot: "online" },
  { value: "AWAY", label: "Ausente", dot: "away" },
  { value: "BUSY", label: "Ocupado", dot: "busy" },
];

// Envolve o avatar do proprio usuario (UserPill) num botao que abre um menu
// pra fixar o status manualmente — mesmo padrao de menu flutuante do
// MoreMenu.tsx (portal + posicao calculada + fecha ao clicar fora/Esc).
export function StatusMenu({ status, children }: { status: PresenceStatus; children: ReactNode }) {
  const { manualStatus, setManualStatus } = usePresence();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top - 8,
        left: Math.min(rect.left, window.innerWidth - MENU_WIDTH - 12),
      });
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

  function choose(value: "ONLINE" | "AWAY" | "BUSY" | null) {
    setManualStatus(value);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        aria-label="Mudar status"
        title="Mudar status"
        className="relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {children}
        <StatusDot status={status} className="-bottom-0.5 -right-0.5" borderClassName="border-ring" />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH, transform: "translateY(-100%)" }}
            className="fixed z-[100] gs-anim-fade overflow-hidden rounded-xl border border-overlay-strong bg-elevated py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
          >
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => choose(opt.value)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold text-foreground-secondary transition hover:bg-elevated-hover hover:text-foreground"
              >
                <StatusDot status={opt.dot} standalone className="shrink-0" />
                {opt.label}
                {manualStatus === opt.value && <CheckIcon />}
              </button>
            ))}

            <div className="my-1.5 border-t border-overlay" />

            <button
              onClick={() => choose(null)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold text-foreground-secondary transition hover:bg-elevated-hover hover:text-foreground"
            >
              <span className="h-3.5 w-3.5 shrink-0" />
              Automático
              {manualStatus === null && <CheckIcon />}
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0 text-primary-hover">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
