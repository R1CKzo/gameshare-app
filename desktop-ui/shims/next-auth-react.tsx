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
  // So preenchido quando a sessao volta vazia por causa de um erro real
  // (token guardado mas rejeitado, rede falhou) -- diferente de "ainda nao
  // logou", que nao e erro nenhum. Mostrado na tela pra nao depender do
  // DevTools pra diagnosticar (ver friends/page.tsx).
  lastError: string | null;
};

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: "loading",
  update: async () => {},
  lastError: null,
});

async function fetchSession(): Promise<{ session: Session; error: string | null }> {
  const token = await window.gameshareDesktop?.getAuthToken?.();
  if (!token) return { session: null, error: null };

  let res: Response | null;
  try {
    res = await fetch(apiUrl("/api/me/session"), { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    return { session: null, error: `Nao consegui falar com o servidor: ${(err as Error).message ?? err}` };
  }
  if (!res.ok) {
    return { session: null, error: `O servidor recusou o token guardado (HTTP ${res.status}).` };
  }

  const data = await res.json().catch(() => ({ user: null }));
  if (!data.user) return { session: null, error: "O servidor nao devolveu um usuario pra esse token." };
  return { session: { user: data.user }, error: null };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Session>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [lastError, setLastError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { session, error } = await fetchSession();
    setData(session);
    setStatus(session ? "authenticated" : "unauthenticated");
    setLastError(error);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <SessionContext.Provider value={{ data, status, update: reload, lastError }}>{children}</SessionContext.Provider>
  );
}

// Retorno igual ao next-auth/react de verdade (so data/status/update) --
// o TypeScript nunca segue o alias do webpack pra tipos, entao qualquer
// import via "next-auth/react" (mesmo de dentro desse projeto) sempre
// resolve os tipos do pacote real, nunca os desse arquivo. Campo extra
// (lastError) fica so no hook useSessionError abaixo, importado direto
// daqui por caminho relativo (nao "next-auth/react") pra ter o tipo certo.
export function useSession(): { data: Session; status: Status; update: () => Promise<void> } {
  return useContext(SessionContext);
}

export function useSessionError(): string | null {
  return useContext(SessionContext).lastError;
}

// Login de verdade acontece no processo principal do Electron (mesmo
// fluxo do desktop-login que ja existe, so pedindo o token em vez do
// cookie -- ver plano) -- aqui so aciona e devolve o resultado, pra
// interface conseguir mostrar o motivo se der errado.
export async function signIn(): Promise<{ ok: boolean; error?: string }> {
  const result = await window.gameshareDesktop?.startLogin?.();
  return result ?? { ok: false, error: "Essa janela nao tem a ponte com o app de desktop." };
}

export async function signOut(): Promise<void> {
  await window.gameshareDesktop?.clearAuthToken?.();
  window.location.reload();
}
