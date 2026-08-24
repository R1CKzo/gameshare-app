"use client";

import "../../shims/bootstrap";

import { useEffect, useState } from "react";
import { signIn, SessionProvider, useSession } from "next-auth/react";

import { FriendsView } from "@/components/friends/FriendsView";
import { DMSidebar } from "@/components/shell/DMSidebar";
import { FriendsShell } from "@/components/shell/FriendsShell";
import { apiUrl } from "@/lib/apiUrl";
// Tipo explicito em vez de confiar na extensao de tipos do next-auth (que
// so existe em ../src/types/next-auth.d.ts) chegar ate aqui sozinha --
// funcionou local por acaso (cache do TypeScript), mas falhou limpo no
// CI porque o verificador de tipos do Next so inclui o que e alcancavel
// pelo grafo de imports de verdade, e esse .d.ts nunca e importado por
// ninguem (so declara global). Import explicito garante o mesmo formato
// sempre, sem depender de include/glob.
import type { SessionUser } from "../../shims/next-auth-react";

type ServerSummary = { id: string; name: string };

// Primeira fatia de teste do app nativo (Fase 2 do plano): so a tela de
// Amigos, rodando isolada nesse projeto separado, reaproveitando os
// mesmos componentes do site (FriendsShell/DMSidebar/FriendsView) sem
// nenhuma mudanca neles -- so a sessao (token em vez de cookie, ver
// shims/next-auth-react.tsx) e os enderecos de API (apiUrl, ja preparado
// desde a Fase 0) diferem.
function FriendsPageInner() {
  const { data: session, status, update } = useSession();
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [loggingIn, setLoggingIn] = useState(false);

  async function handleLogin() {
    setLoggingIn(true);
    await signIn();
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

  const user = session?.user as SessionUser | undefined;

  if (status !== "authenticated" || !user) {
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
      </div>
    );
  }

  return (
    <FriendsShell
      servers={servers}
      sidebar={<DMSidebar user={{ nickname: user.nickname, userTag: user.userTag, image: user.image }} />}
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
