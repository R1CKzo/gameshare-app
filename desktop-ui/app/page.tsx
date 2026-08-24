"use client";

import "../shims/bootstrap";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { CallChannel } from "@/components/channel/CallChannel";
import { TextChannelView } from "@/components/channel/TextChannelView";
import { DMChatView } from "@/components/dm/DMChatView";
import { FriendsView } from "@/components/friends/FriendsView";
import { AppShell } from "@/components/shell/AppShell";
import { DMSidebar } from "@/components/shell/DMSidebar";
import { FriendsShell } from "@/components/shell/FriendsShell";
import { apiUrl } from "@/lib/apiUrl";
// Importado direto do arquivo (nao "next-auth/react") -- essas paginas sao
// especificas do desktop-ui, entao nao precisam fingir ser o pacote real
// como os componentes compartilhados fazem (ver o alias em
// next.config.js); assim o TypeScript enxerga o tipo certo, incluindo
// useSessionError, que so existe aqui.
import { signIn, SessionProvider, useSession, useSessionError } from "../shims/next-auth-react";

type ServerSummary = { id: string; name: string };

// Unica pagina de verdade do desktop-ui (ver next.config.js/Electron
// main.js): o build estatico nao suporta rota dinamica pra id que nao se
// conhece no momento do build (server/canal/DM sao dados de cada pessoa),
// entao em vez de app/servers/[id]/... existir de verdade, essa pagina
// raiz le a URL na mao (usePathname) e decide o que mostrar -- o mesmo
// truque de qualquer SPA hospedada em site estatico. Navegar entre
// servidor/canal/DM aqui sempre recarrega a pagina inteira (o protocolo
// customizado do Electron serve essa mesma pagina pra qualquer URL
// desconhecida, ver main.js) -- funciona, so nao e uma transicao suave
// como no site (aceitavel nessa fase; revisitar se incomodar no uso real).
type Route =
  | { view: "friends" }
  | { view: "server"; serverId: string; channelId: string | null }
  | { view: "dm"; dmChannelId: string };

function parseRoute(pathname: string): Route {
  const channelMatch = pathname.match(/^\/servers\/([^/]+)\/channels\/([^/]+)\/?$/);
  if (channelMatch) return { view: "server", serverId: channelMatch[1], channelId: channelMatch[2] };

  const serverMatch = pathname.match(/^\/servers\/([^/]+)\/?$/);
  if (serverMatch) return { view: "server", serverId: serverMatch[1], channelId: null };

  const dmMatch = pathname.match(/^\/dms\/([^/]+)\/?$/);
  if (dmMatch) return { view: "dm", dmChannelId: dmMatch[1] };

  return { view: "friends" };
}

type ChannelSummary = {
  id: string;
  name: string;
  type: "TEXT" | "CALL";
  isLive: boolean;
  broadcaster: { id: string; nickname: string | null; userTag: string | null } | null;
  presenceCount: number;
};
type MemberSummary = {
  id: string;
  nickname: string | null;
  userTag: string | null;
  image: string | null;
  status: "ONLINE" | "AWAY" | "BUSY" | null;
  lastActiveAt: string | null;
  roleId: string | null;
  role: { id: string; name: string; color: string | null } | null;
};
type ChannelShell = {
  servers: ServerSummary[];
  server: { id: string; name: string; inviteCode: string; ownerId: string };
  channels: ChannelSummary[];
  channel: ChannelSummary;
  members: MemberSummary[];
  permissions: { isOwner: boolean; canKick: boolean; canBan: boolean; canManageRoles: boolean; canManageChannels: boolean };
};
type DMShell = {
  servers: ServerSummary[];
  dmChannel: { id: string; isLive: boolean; broadcaster: { id: string; nickname: string | null; userTag: string | null } | null };
  otherUser: { id: string; nickname: string | null; userTag: string | null; image: string | null };
};

function FriendsRoute({ user }: { user: { nickname: string | null; userTag: string | null; image: string | null } }) {
  const [servers, setServers] = useState<ServerSummary[]>([]);

  useEffect(() => {
    fetch(apiUrl("/api/me/servers"))
      .then((r) => r.json())
      .then((data) => setServers(data.servers ?? []))
      .catch(() => {});
  }, []);

  return (
    <FriendsShell servers={servers} sidebar={<DMSidebar user={user} />}>
      <FriendsView />
    </FriendsShell>
  );
}

function ServerRoute({
  serverId,
  channelId,
  userId,
  user,
}: {
  serverId: string;
  channelId: string | null;
  userId: string;
  user: { nickname: string | null; userTag: string | null; image: string | null };
}) {
  const [shell, setShell] = useState<ChannelShell | null>(null);
  const [status, setStatus] = useState<"loading" | "not-member" | "not-found" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setShell(null);

    async function load() {
      if (!channelId) {
        // /servers/:id sem canal -- acha o primeiro e navega ate ele de
        // verdade (uma URL que essa mesma pagina volta a interpretar).
        const res = await fetch(apiUrl(`/api/servers/${serverId}/entry`));
        if (cancelled) return;
        if (res.status === 403) return setStatus("not-member");
        if (!res.ok) return setStatus("not-found");
        const data = await res.json();
        window.location.assign(`/servers/${serverId}/channels/${data.firstChannelId}`);
        return;
      }

      const res = await fetch(apiUrl(`/api/servers/${serverId}/channels/${channelId}/shell`));
      if (cancelled) return;
      if (res.status === 403) return setStatus("not-member");
      if (!res.ok) return setStatus("not-found");
      const data: ChannelShell = await res.json();
      setShell(data);
      setStatus("ready");
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [serverId, channelId]);

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center text-foreground">Carregando…</div>;
  }
  if (status === "not-member") {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4 text-center text-foreground">
        <p>Você não é membro desse servidor.</p>
      </div>
    );
  }
  if (status === "not-found" || !shell) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4 text-center text-foreground">
        <p>Canal não encontrado.</p>
      </div>
    );
  }

  return (
    <AppShell
      servers={shell.servers}
      currentServerId={shell.server.id}
      serverName={shell.server.name}
      inviteCode={shell.server.inviteCode}
      channels={shell.channels}
      currentChannelId={shell.channel.id}
      members={shell.members}
      ownerId={shell.server.ownerId}
      permissions={shell.permissions}
      user={user}
    >
      {shell.channel.type === "TEXT" ? (
        <TextChannelView channelId={shell.channel.id} channelName={shell.channel.name} currentUserId={userId} />
      ) : (
        <CallChannel
          channelId={shell.channel.id}
          channelName={shell.channel.name}
          serverId={shell.server.id}
          currentUserId={userId}
          initialLive={{ isLive: shell.channel.isLive, broadcaster: shell.channel.broadcaster }}
        />
      )}
    </AppShell>
  );
}

function DMRoute({
  dmChannelId,
  userId,
  user,
}: {
  dmChannelId: string;
  userId: string;
  user: { nickname: string | null; userTag: string | null; image: string | null };
}) {
  const [shell, setShell] = useState<DMShell | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setShell(null);
    setNotFound(false);

    fetch(apiUrl(`/api/dms/${dmChannelId}/shell`))
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: DMShell) => {
        if (!cancelled) setShell(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });

    return () => {
      cancelled = true;
    };
  }, [dmChannelId]);

  if (notFound) {
    return (
      <div className="flex h-screen items-center justify-center bg-background px-4 text-center text-foreground">
        <p>Conversa não encontrada.</p>
      </div>
    );
  }
  if (!shell) {
    return <div className="flex h-screen items-center justify-center text-foreground">Carregando…</div>;
  }

  return (
    <FriendsShell
      servers={shell.servers}
      sidebar={<DMSidebar user={user} currentDmId={dmChannelId} />}
    >
      <DMChatView
        dmChannelId={dmChannelId}
        currentUserId={userId}
        otherUser={shell.otherUser}
        initialLive={{ isLive: shell.dmChannel.isLive, broadcaster: shell.dmChannel.broadcaster }}
      />
    </FriendsShell>
  );
}

function AppRouter() {
  const pathname = usePathname();
  const { data: session, status, update } = useSession();
  const lastError = useSessionError();
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

  const route = parseRoute(pathname ?? "/");
  const userSummary = { nickname: user.nickname, userTag: user.userTag, image: user.image ?? null };

  if (route.view === "server") {
    return <ServerRoute serverId={route.serverId} channelId={route.channelId} userId={user.id} user={userSummary} />;
  }
  if (route.view === "dm") {
    return <DMRoute dmChannelId={route.dmChannelId} userId={user.id} user={userSummary} />;
  }
  return <FriendsRoute user={userSummary} />;
}

export default function DesktopApp() {
  return (
    <SessionProvider>
      <AppRouter />
    </SessionProvider>
  );
}
