"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { MobileUIContext } from "@/components/shell/MobileUIContext";
import { ServerRail } from "@/components/shell/ServerRail";

type ServerSummary = { id: string; name: string; image: string | null };

// Mesma mecanica de painel responsivo do AppShell (usado nos servidores),
// so que sem lista de membros do lado direito — Amigos/DMs nao tem isso.
// Duplicado em vez de generalizar o AppShell pra nao arriscar mexer numa
// tela que ja esta funcionando.
export function FriendsShell({
  servers,
  sidebar,
  children,
}: {
  servers: ServerSummary[];
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <MobileUIContext.Provider
      value={{
        toggleSidebar: () => setSidebarOpen((v) => !v),
        toggleMembers: () => {},
      }}
    >
      <div className="page-fade-in relative flex h-[100dvh] w-screen overflow-hidden bg-main">
        {sidebarOpen && (
          <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/60 md:hidden" />
        )}

        <div
          className={`fixed inset-y-0 left-0 z-50 flex -translate-x-full transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : ""
          }`}
        >
          <ServerRail servers={servers} friendsActive />
          {sidebar}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </MobileUIContext.Provider>
  );
}
