"use client";

import "../../shims/bootstrap";

import { useEffect, useState } from "react";

import { FriendsView } from "@/components/friends/FriendsView";
import { DMSidebar } from "@/components/shell/DMSidebar";
import { FriendsShell } from "@/components/shell/FriendsShell";
import { apiUrl } from "@/lib/apiUrl";
// Importado direto do arquivo (nao "next-auth/react") -- essa pagina e
// especifica do desktop-ui, entao nao precisa fingir ser o pacote real
// como os componentes compartilhados fazem (ver o alias em
// next.config.js); assim o TypeScript enxerga o tipo certo, incluindo
// useSessionError, que so existe aqui.
import { signIn, SessionProvider, useSession, useSessionError } from "../../shims/next-auth-react";

type ServerSummary = { id: string; name: string };

// Primeira fatia de teste do app nativo (Fase 2 do plano): so a tela de
// Amigos, rodando isolada nesse projeto separado, reaproveitando os
// mesmos componentes do site (FriendsShell/DMSidebar/FriendsView) sem
// nenhuma mudanca neles -- so a sessao (token em vez de cookie, ver
// shims/next-auth-react.tsx) e os enderecos de API (apiUrl, ja preparado
// desde a Fase 0) diferem.
function FriendsPageInner() {
  const { data: session, status, update } = useSession();
  const lastError = useSessionError();
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  async function handleLogin() {
    setLoggingIn(true);
    setLoginError(null);
    const result = await signIn();
    if (!result.ok) {
      setLoginError(result.error ?? "Falha desconhecida no login.");
      setLoggingIn(false);
      return;
    }
    await update();
    setLoggingIn(false);
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch(apiUrl("/api/me/servers"))
      .then((r) => r.json())
      .then((data) => setServers(data.servers ?? []))
      .catch(() => {});
  }, [status]);

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center text-foreground">Carregando…</div>;
  }

  const user = session?.user;

  if (status !== "authenticated" || !user) {
    const errorToShow = loginError ?? lastError;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-foreground">
        <p>Não conectado (janela de teste do app nativo).</p>
        <button
          onClick={handleLogin}
          disabled={loggingIn}
          className="rounded-md bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {loggingIn ? "Abrindo o navegador…" : "Entrar"}
        </button>
        {errorToShow && <p className="max-w-md text-center text-sm text-danger">{errorToShow}</p>}
      </div>
    );
  }

  return (
    <FriendsShell
      servers={servers}
      sidebar={<DMSidebar user={{ nickname: user.nickname, userTag: user.userTag, image: user.image ?? null }} />}
    >
      <FriendsView />
    </FriendsShell>
  );
}

export default function FriendsPage() {
  return (
    <SessionProvider>
      <FriendsPageInner />
    </SessionProvider>
  );
}
