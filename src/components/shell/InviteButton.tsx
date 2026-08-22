"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const POPOVER_WIDTH = 288; // w-[18rem]

export function InviteButton({ inviteCode }: { inviteCode: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/invite/${inviteCode}` : "";

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 16),
      });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
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

  async function copyLink() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        title="Convidar amigos"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-[#f5f5f7]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6" />
          <path d="M22 11h-6" />
        </svg>
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: position.top, left: position.left, width: POPOVER_WIDTH }}
            className="fixed z-[100] rounded-xl border border-white/[0.08] bg-elevated p-4 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-bold">Convidar amigos</div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="-m-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-[#f5f5f7]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Quem abrir esse link entra direto no servidor.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 min-w-0 flex-1 truncate rounded-lg border border-[#2d3344] bg-background px-2.5 text-xs text-[#d5d7dc] outline-none"
              />
              <button
                onClick={copyLink}
                className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-bold text-white transition hover:bg-primary-hover"
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
