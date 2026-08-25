"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { SignalIcon } from "@/components/call/SignalIcon";
import { useUnread } from "@/components/notifications/UnreadContext";
import { InviteButton } from "@/components/shell/InviteButton";
import { ServerSettingsButton } from "@/components/shell/ServerSettingsButton";
import { UserPill } from "@/components/shell/UserPill";
import type { ConnectionQuality } from "@/hooks/useVoiceMesh";
import { apiUrl } from "@/lib/apiUrl";
import { isBetaEnabled } from "@/lib/beta";
import { getPusherClient } from "@/lib/pusherClient";
import { CALL_UPDATE_EVENT, serverVoicePusherName } from "@/lib/pusherShared";

const COLLAPSE_STORAGE_KEY = "gameshare:channelSidebarCollapsed";

type ChannelSummary = {
  id: string;
  name: string;
  type: "TEXT" | "CALL";
  isLive: boolean;
  broadcaster: { nickname: string | null } | null;
  presenceCount: number;
};
type RoleSummary = { id: string; name: string; color: string | null };
type MemberSummary = {
  id: string;
  nickname: string | null;
  userTag: string | null;
  image: string | null;
  status: "ONLINE" | "AWAY" | "BUSY" | null;
  lastActiveAt: string | Date | null;
  roleId: string | null;
  role: RoleSummary | null;
};
type ServerPermissions = { isOwner: boolean; canKick: boolean; canBan: boolean; canManageRoles: boolean; canManageChannels: boolean };
type VoicePresentUser = {
  id: string;
  nickname: string | null;
  userTag: string | null;
  image: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  connectionQuality: ConnectionQuality;
};

const NAME_MAX = 40;
// So um reforço agora — entrar/sair/mutar/compartilhar em qualquer sala do
// servidor avisa na hora pelo Pusher (ver a inscricao no useEffect abaixo).
const VOICE_PRESENCE_POLL_MS = 10000;

export function ChannelSidebar({
  serverId,
  serverName,
  serverImage,
  inviteCode,
  channels,
  currentChannelId,
  members,
  ownerId,
  permissions,
  user,
}: {
  serverId: string;
  serverName: string;
  serverImage: string | null;
  inviteCode: string;
  channels: ChannelSummary[];
  currentChannelId: string;
  members: MemberSummary[];
  ownerId: string;
  permissions: ServerPermissions;
  user: { nickname: string | null; userTag: string | null; image: string | null };
}) {
  const router = useRouter();
  const textChannels = channels.filter((c) => c.type === "TEXT");
  const callChannels = channels.filter((c) => c.type === "CALL");
  const canManageServer = permissions.isOwner || permissions.canKick || permissions.canBan || permissions.canManageRoles;
  const canManageChannels = permissions.isOwner || permissions.canManageChannels;

  // Quem esta em cada sala de chamada agora, pra listar embaixo de cada
  // uma (estilo Discord) — poll leve, cobre todas as salas do servidor de
  // uma vez so, sem precisar entrar em nenhuma pra ver quem esta la.
  const [voicePresence, setVoicePresence] = useState<Map<string, VoicePresentUser[]>>(new Map());

  // Recolher essa barra pra lateral — recurso em teste. O interruptor de
  // beta so decide se o botao de recolher/expandir aparece; a preferencia
  // de estado (recolhida ou nao) e separada e guardada no localStorage, pra
  // lembrar da escolha entre visitas. "collapsed && betaCollapsible" (nunca
  // so "collapsed") evita ficar preso sem essa barra e sem o botao pra
  // trazer ela de volta, caso a pessoa desligue o beta depois de ter
  // recolhido.
  const [collapsed, setCollapsed] = useState(false);
  const [betaCollapsible, setBetaCollapsible] = useState(false);
  useEffect(() => {
    setBetaCollapsible(isBetaEnabled());
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true");
    } catch {
      // ignora — so nao lembra a escolha entre visitas
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      } catch {
        // modo privado ou storage cheio — a escolha so nao sobrevive a um
        // recarregamento, sem quebrar nada
      }
      return next;
    });
  }
  const effectiveCollapsed = collapsed && betaCollapsible;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(apiUrl(`/api/servers/${serverId}/voice-presence`), { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const entries: { channelId: string; present: VoicePresentUser[] }[] = data.channels ?? [];
        setVoicePresence(new Map(entries.map((e) => [e.channelId, e.present])));
      } catch {
        // ignora falhas transitorias
      }
    }

    poll();
    const interval = setInterval(poll, VOICE_PRESENCE_POLL_MS);

    const pusher = getPusherClient();
    const pusherChannelName = serverVoicePusherName(serverId);
    const channel = pusher.subscribe(pusherChannelName);
    channel.bind(CALL_UPDATE_EVENT, poll);

    return () => {
      cancelled = true;
      clearInterval(interval);
      channel.unbind(CALL_UPDATE_EVENT, poll);
      pusher.unsubscribe(pusherChannelName);
    };
  }, [serverId]);

  async function createChannel(type: "TEXT" | "CALL", name: string) {
    await fetch(apiUrl(`/api/servers/${serverId}/channels`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type }),
    });
    router.refresh();
  }

  async function renameChannel(channelId: string, name: string) {
    await fetch(apiUrl(`/api/servers/${serverId}/channels/${channelId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    router.refresh();
  }

  // Se o canal excluido era o que a pessoa estava vendo, manda ela pra
  // raiz do servidor — senao a tela por baixo ficaria presa num canal que
  // nao existe mais.
  async function deleteChannel(channelId: string) {
    if (!window.confirm("Excluir esse canal? O histórico dele se perde pra sempre.")) return;
    const res = await fetch(apiUrl(`/api/servers/${serverId}/channels/${channelId}`), { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error ?? "Não foi possível excluir o canal.");
      return;
    }
    if (channelId === currentChannelId) router.push(`/servers/${serverId}`);
    router.refresh();
  }

  return (
    <div className="flex shrink-0">
      {betaCollapsible && (
        <button
          onClick={toggleCollapsed}
          title={effectiveCollapsed ? "Expandir canais" : "Recolher canais"}
          aria-label={effectiveCollapsed ? "Expandir canais" : "Recolher canais"}
          className="flex w-4 shrink-0 items-center justify-center border-r border-overlay bg-sidebar text-dim transition hover:bg-elevated-hover hover:text-foreground"
        >
          <ChevronIcon flipped={effectiveCollapsed} />
        </button>
      )}
      {/* Largura de fora anima 252px -> 0 (overflow escondendo o conteudo
          conforme fecha); o conteudo de dentro mantem 252px fixo sempre,
          senao o texto ficaria quebrando/reajustando durante a transicao
          em vez de so "deslizar pra fora". */}
      <div
        className={`flex overflow-hidden transition-[width] duration-300 ease-in-out ${effectiveCollapsed ? "w-0" : "w-[252px]"}`}
      >
    <div className="flex w-[252px] shrink-0 flex-col border-r border-overlay bg-sidebar">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-overlay px-4">
        <span className="truncate font-bold">{serverName}</span>
        <div className="flex items-center gap-1">
          {canManageServer && (
            <ServerSettingsButton
              serverId={serverId}
              serverName={serverName}
              serverImage={serverImage}
              ownerId={ownerId}
              members={members}
              permissions={permissions}
            />
          )}
          <InviteButton inviteCode={inviteCode} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex items-center justify-between px-2 pb-1 pt-2">
          <span className="text-[11px] font-bold tracking-wider text-muted">CANAIS DE TEXTO</span>
          {canManageChannels && <ChannelCreateButton onCreate={(name) => createChannel("TEXT", name)} />}
        </div>
        {textChannels.map((channel) => (
          <ChannelRow
            key={channel.id}
            serverId={serverId}
            channel={channel}
            active={channel.id === currentChannelId}
            canManage={canManageChannels}
            onRename={(name) => renameChannel(channel.id, name)}
            onDelete={() => deleteChannel(channel.id)}
          />
        ))}

        <div className="flex items-center justify-between px-2 pb-1 pt-4">
          <span className="text-[11px] font-bold tracking-wider text-muted">SALAS DE CHAMADA</span>
          {canManageChannels && <ChannelCreateButton onCreate={(name) => createChannel("CALL", name)} />}
        </div>
        {callChannels.map((channel) => (
          <ChannelRow
            key={channel.id}
            serverId={serverId}
            channel={channel}
            active={channel.id === currentChannelId}
            canManage={canManageChannels}
            onRename={(name) => renameChannel(channel.id, name)}
            onDelete={() => deleteChannel(channel.id)}
            voicePresent={voicePresence.get(channel.id) ?? []}
          />
        ))}
      </div>

      <UserPill user={user} serverId={serverId} isServerOwner={permissions.isOwner} />
    </div>
      </div>
    </div>
  );
}

function ChannelRow({
  serverId,
  channel,
  active,
  canManage,
  onRename,
  onDelete,
  voicePresent = [],
}: {
  serverId: string;
  channel: ChannelSummary;
  active: boolean;
  canManage: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  voicePresent?: VoicePresentUser[];
}) {
  const isCall = channel.type === "CALL";
  const hasActivity = isCall && (channel.isLive || channel.presenceCount > 0);
  const { isChannelUnread } = useUnread();
  const unread = !isCall && isChannelUnread(channel.id);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(channel.name);

  useEffect(() => setName(channel.name), [channel.name]);

  function commitRename() {
    setRenaming(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== channel.name) {
      onRename(trimmed);
    } else {
      setName(channel.name);
    }
  }

  if (renaming) {
    return (
      <div className="mb-0.5 flex items-center gap-2 rounded-md px-2 py-1.5">
        {isCall ? <CallGlyph active={false} live={false} /> : <span className="w-4 text-center text-base font-semibold text-muted">#</span>}
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") {
              setName(channel.name);
              setRenaming(false);
            }
          }}
          maxLength={NAME_MAX}
          className="h-6 min-w-0 flex-1 rounded border border-primary bg-background px-1.5 text-sm font-semibold text-foreground outline-none"
        />
      </div>
    );
  }

  return (
    <div className="mb-0.5">
      <div className="group relative flex items-center">
      <Link
        href={`/servers/${serverId}/channels/${channel.id}`}
        prefetch
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 transition ${
          hasActivity
            ? "border-l-2 border-accent bg-accent/[0.08]"
            : active
              ? "bg-elevated"
              : "hover:bg-overlay-weak"
        }`}
      >
        {isCall ? (
          <CallGlyph active={active} live={hasActivity} />
        ) : (
          <span className="w-4 text-center text-base font-semibold text-muted">#</span>
        )}
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            active || hasActivity || unread ? "font-semibold text-foreground" : "text-dim"
          }`}
        >
          {channel.name}
        </span>
        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />}
        {isCall && channel.isLive && channel.broadcaster && (
          <div
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 border-sidebar bg-primary text-[8px] font-bold"
            title={channel.broadcaster.nickname ?? undefined}
          >
            {channel.broadcaster.nickname?.slice(0, 1).toUpperCase()}
          </div>
        )}
        {isCall && !channel.isLive && channel.presenceCount > 0 && (
          <div className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-accent">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            {channel.presenceCount}
          </div>
        )}
      </Link>
      <ChannelActionsMenu channelId={channel.id} canManage={canManage} onEdit={() => setRenaming(true)} onDelete={onDelete} />
      </div>
      {isCall && voicePresent.length > 0 && (
        <div className="ml-6 space-y-0.5 py-0.5">
          {voicePresent.map((u) => (
            <VoicePresenceRow key={u.id} user={u} />
          ))}
        </div>
      )}
    </div>
  );
}

function VoicePresenceRow({ user }: { user: VoicePresentUser }) {
  const initials = (user.nickname ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1">
      <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-primary">
        {user.image ? (
          <Image src={user.image} alt="" fill sizes="20px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-[9px] font-bold">{initials}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <SignalIcon quality={user.connectionQuality} />
        <span className="block truncate text-xs text-muted">{user.nickname}</span>
      </div>
      {user.isMuted && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M1 1l22 22" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.11 1.23" />
        </svg>
      )}
      {user.isDeafened && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          <path d="M2 2l20 20" />
        </svg>
      )}
    </div>
  );
}

function CallGlyph({ active, live }: { active: boolean; live: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={live ? "var(--color-accent)" : active ? "var(--color-foreground)" : "var(--color-dim)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

// Botao "+" ao lado do titulo de cada secao — abre um popover flutuante so
// com o nome do canal, ja que o tipo (texto/chamada) e decidido por qual
// secao foi clicada.
function ChannelCreateButton({ onCreate }: { onCreate: (name: string) => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 232 - 12) });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    await onCreate(name.trim());
    setCreating(false);
    setName("");
    setOpen(false);
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        title="Criar canal"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted transition hover:bg-elevated-hover hover:text-foreground"
      >
        <PlusIcon />
      </button>
      {open &&
        position &&
        createPortal(
          <form
            ref={popoverRef}
            onSubmit={submit}
            style={{ top: position.top, left: position.left, width: 232 }}
            className="fixed z-[100] space-y-2 rounded-xl border border-overlay-strong bg-elevated p-3 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
          >
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              placeholder="Nome do canal"
              className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm font-semibold outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!name.trim() || creating}
              className="h-8 w-full rounded-lg bg-primary text-xs font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {creating ? "Criando..." : "Criar canal"}
            </button>
          </form>,
          document.body,
        )}
    </>
  );
}

// Botao hamburguer que so aparece no hover da linha (ou sempre, se quem
// esta vendo pode gerenciar canais) — abre um menu pra editar (renomear
// inline) ou excluir aquele canal especifico.
function ChannelActionsMenu({
  channelId,
  canManage,
  onEdit,
  onDelete,
}: {
  channelId: string;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { isChannelMuted, setChannelMuted } = useUnread();
  const muted = isChannelMuted(channelId);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 160 - 12) });
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

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        title="Opções do canal"
        className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 shrink-0 items-center justify-center rounded bg-sidebar text-muted transition hover:bg-elevated-hover hover:text-foreground ${
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <HamburgerIcon />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: position.top, left: position.left, width: 180 }}
            className="fixed z-[100] overflow-hidden rounded-xl border border-overlay-strong bg-elevated py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
          >
            <button
              onClick={() => {
                setChannelMuted(channelId, !muted);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold text-foreground-secondary transition hover:bg-elevated-hover hover:text-foreground"
            >
              {muted ? <BellIcon /> : <BellOffIcon />}
              {muted ? "Ativar notificações" : "Silenciar canal"}
            </button>
            {canManage && (
              <>
                <button
                  onClick={() => {
                    setOpen(false);
                    onEdit();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold text-foreground-secondary transition hover:bg-elevated-hover hover:text-foreground"
                >
                  <EditIcon />
                  Editar
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold text-danger transition hover:bg-danger/10"
                >
                  <TrashIcon />
                  Excluir
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function ChevronIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${flipped ? "rotate-180" : ""}`}
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M13.73 21a1.94 1.94 0 0 1-3.41 0" />
      <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0l-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
    </svg>
  );
}
