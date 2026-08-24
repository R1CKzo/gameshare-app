"use client";

// Substituto de "next-auth/react" so pra esse build (ver o alias em
// next.config.js) -- mesma forma de useSession/signIn/signOut/
// SessionProvider que os componentes compartilhados (../src/...) ja usam,
// so que lendo a sessao de um token Bearer (guardado pelo processo
// principal do Electron via safeStorage) em vez de cookie. Nenhum
// componente compartilhado precisou mudar uma linha por causa disso.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { apiUrl } from "@/lib/apiUrl";

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  nickname: string | null;
  userTag: string | null;
  isAdmin: boolean;
  hasPassword: boolean;
};

type Session = { user: SessionUser } | null;
type Status = "loading" | "authenticated" | "unauthenticated";

type SessionContextValue = {
  data: Session;
  status: Status;
  update: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: "loading",
  update: async () => {},
});

async function fetchSession(): Promise<Session> {
  const token = await window.gameshareDesktop?.getAuthToken?.();
  if (!token) return null;

  const res = await fetch(apiUrl("/api/me/session"), {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res?.ok) return null;

  const data = await res.json().catch(() => ({ user: null }));
  return data.user ? { user: data.user } : null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Session>(null);
  const [status, setStatus] = useState<Status>("loading");

  const reload = useCallback(async () => {
    const session = await fetchSession();
    setData(session);
    setStatus(session ? "authenticated" : "unauthenticated");
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return <SessionContext.Provider value={{ data, status, update: reload }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

// Login de verdade acontece no processo principal do Electron (mesmo
// fluxo do desktop-login que ja existe, so pedindo o token em vez do
// cookie -- ver plano) -- aqui so aciona.
export async function signIn(): Promise<void> {
  await window.gameshareDesktop?.startLogin?.();
}

export async function signOut(): Promise<void> {
  await window.gameshareDesktop?.clearAuthToken?.();
  window.location.reload();
}
