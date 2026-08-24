"use client";

import { isDesktopApp } from "@/lib/desktop";

// So aparece pra quem esta acessando pelo navegador — quem ja esta
// dentro do app de desktop obviamente nao precisa baixar ele de novo.
export function DesktopDownloadLink() {
  if (isDesktopApp()) return null;

  return (
    <>
      <a
        href="https://github.com/R1CKzo/gameshare-app/releases/latest/download/GameShare-Setup.exe"
        className="mt-3 flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-bold text-foreground-secondary transition hover:border-primary hover:text-foreground"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
        </svg>
        Baixar para Windows
      </a>
      <p className="mt-2 text-xs text-dim">Cliente de desktop, igual o Discord. Verifica atualizações sozinho.</p>
    </>
  );
}
