"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { apiUrl } from "@/lib/apiUrl";
import { isDesktopApp } from "@/lib/desktop";

const MENU_WIDTH = 220;

// Junta as acoes menos frequentes (baixar o app, area de bugs, sair do
// servidor, sair da conta) num so menu — sem isso, cada uma virava um
// icone fixo do lado do nome, e com varios icones espremidos numa barra
// lateral estreita o nome do usuario ficava cortado ("D...").
export function MoreMenu({
  isAdmin,
  serverId,
  isServerOwner,
}: {
  isAdmin: boolean;
  serverId?: string;
  isServerOwner?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
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

  async function leaveServer() {
    if (!serverId || leaving) return;
    setLeaving(true);
    const res = await fetch(apiUrl(`/api/servers/${serverId}/leave`), { method: "DELETE" });
    if (res.ok) {
      setOpen(false);
      router.push("/");
      router.refresh();
    } else {
      setLeaving(false);
      const data = await res.json().catch(() => ({}));
      window.alert(data?.error ?? "Não foi possível sair do servidor.");
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        aria-label="Mais opcoes"
        title="Mais opcoes"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition ${
          open ? "bg-elevated-hover text-foreground" : "text-dim hover:bg-elevated-hover hover:text-foreground"
        }`}
      >
        <MoreIcon />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH, transform: "translateY(-100%)" }}
            className="fixed z-[100] overflow-hidden rounded-xl border border-overlay-strong bg-elevated py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
          >
            <Link
              href="/novidades"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-semibold text-foreground-secondary transition hover:bg-elevated-hover hover:text-foreground"
            >
              <SparkleIcon />
              Novidades
            </Link>

            {!isDesktopApp() && (
              <a
                href="https://github.com/R1CKzo/gameshare-app/releases/latest/download/GameShare-Setup.exe"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-semibold text-foreground-secondary transition hover:bg-elevated-hover hover:text-foreground"
              >
                <DownloadIcon />
                Baixar para Windows
              </a>
            )}

            {isAdmin && (
              <Link
                href="/admin/bugs"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-semibold text-foreground-secondary transition hover:bg-elevated-hover hover:text-foreground"
              >
                <BugIcon />
                Bugs reportados
              </Link>
            )}

            {serverId && !isServerOwner && (
              <button
                onClick={leaveServer}
                disabled={leaving}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold text-foreground-secondary transition hover:bg-elevated-hover hover:text-foreground disabled:opacity-50"
              >
                <LeaveIcon />
                {leaving ? "Saindo..." : "Sair do servidor"}
              </button>
            )}

            {(!isDesktopApp() || isAdmin || (serverId && !isServerOwner)) && (
              <div className="my-1.5 border-t border-overlay" />
            )}

            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold text-danger transition hover:bg-danger/10"
            >
              <SignOutIcon />
              Sair
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5L9 15M15 9l2.5-2.5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function BugIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M19 7l-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M12 2v4M8 13H2M22 13h-6" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l-4-5 4-5" />
      <path d="M20 12H9" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
