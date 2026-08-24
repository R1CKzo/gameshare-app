"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type RoleSummary = {
  id: string;
  name: string;
  color: string | null;
  canKick: boolean;
  canBan: boolean;
  canManageRoles: boolean;
  canManageChannels: boolean;
};
type MemberSummary = {
  id: string;
  nickname: string | null;
  userTag: string | null;
  image: string | null;
  roleId: string | null;
  role: { id: string; name: string; color: string | null } | null;
};
type BanSummary = {
  id: string;
  reason: string | null;
  user: { id: string; nickname: string | null; userTag: string | null; image: string | null };
};
type ChannelSummary = { id: string; name: string; type: "TEXT" | "CALL"; position: number };
type ServerPermissions = {
  isOwner: boolean;
  canKick: boolean;
  canBan: boolean;
  canManageRoles: boolean;
  canManageChannels: boolean;
};

const ROLE_COLORS = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#22d3ee", "#7c3aed", "#ec4899", "#838a99"];

export function ServerSettingsButton({
  serverId,
  ownerId,
  members,
  permissions,
  currentChannelId,
}: {
  serverId: string;
  ownerId: string;
  members: MemberSummary[];
  permissions: ServerPermissions;
  currentChannelId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Gerenciar servidor"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-dim transition hover:bg-elevated-hover hover:text-[#f5f5f7]"
      >
        <ShieldIcon />
      </button>
      {open && (
        <ServerSettingsModal
          serverId={serverId}
          ownerId={ownerId}
          members={members}
          permissions={permissions}
          currentChannelId={currentChannelId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ServerSettingsModal({
  serverId,
  ownerId,
  members,
  permissions,
  currentChannelId,
  onClose,
}: {
  serverId: string;
  ownerId: string;
  members: MemberSummary[];
  permissions: ServerPermissions;
  currentChannelId?: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"membros" | "cargos" | "canais">("membros");
  const tabs = [
    "membros" as const,
    ...(permissions.canManageRoles ? (["cargos"] as const) : []),
    ...(permissions.isOwner || permissions.canManageChannels ? (["canais"] as const) : []),
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-surface shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <h2 className="font-display text-lg font-bold">Gerenciar servidor</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-[#f5f5f7]"
          >
            <CloseIcon />
          </button>
        </div>

        {tabs.length > 1 && (
          <div className="flex shrink-0 gap-1 border-b border-white/[0.06] px-3 pt-3">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-t-lg px-4 py-2 text-sm font-bold capitalize transition ${
                  tab === t ? "bg-elevated text-[#f5f5f7]" : "text-muted hover:text-[#d5d7dc]"
                }`}
              >
                {t === "membros" ? "Membros" : t === "cargos" ? "Cargos" : "Canais"}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto p-5">
          {tab === "membros" ? (
            <MembrosTab serverId={serverId} ownerId={ownerId} members={members} permissions={permissions} />
          ) : tab === "cargos" ? (
            <CargosTab serverId={serverId} permissions={permissions} />
          ) : (
            <CanaisTab serverId={serverId} currentChannelId={currentChannelId} onClose={onClose} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MembrosTab({
  serverId,
  ownerId,
  members,
  permissions,
}: {
  serverId: string;
  ownerId: string;
  members: MemberSummary[];
  permissions: ServerPermissions;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [bans, setBans] = useState<BanSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (permissions.canManageRoles) {
      fetch(`/api/servers/${serverId}/roles`)
        .then((r) => r.json())
        .then((data) => setRoles(data.roles ?? []))
        .catch(() => {});
    }
    if (permissions.canBan) {
      fetch(`/api/servers/${serverId}/bans`)
        .then((r) => r.json())
        .then((data) => setBans(data.bans ?? []))
        .catch(() => {});
    }
  }, [serverId, permissions.canManageRoles, permissions.canBan]);

  async function assignRole(userId: string, roleId: string | null) {
    setBusyId(userId);
    await fetch(`/api/servers/${serverId}/members/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId }),
    });
    setBusyId(null);
    router.refresh();
  }

  async function kick(userId: string) {
    if (!window.confirm("Expulsar esse membro? Ele pode reentrar com o convite.")) return;
    setBusyId(userId);
    await fetch(`/api/servers/${serverId}/members/${userId}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  async function ban(userId: string) {
    if (!window.confirm("Banir esse membro? Ele não vai conseguir reentrar pelo convite.")) return;
    setBusyId(userId);
    await fetch(`/api/servers/${serverId}/bans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setBusyId(null);
    setBans(null);
    router.refresh();
  }

  async function unban(userId: string) {
    setBusyId(userId);
    await fetch(`/api/servers/${serverId}/bans/${userId}`, { method: "DELETE" });
    setBans((prev) => (prev ? prev.filter((b) => b.user.id !== userId) : prev));
    setBusyId(null);
  }

  async function deleteServer() {
    setDeleting(true);
    const res = await fetch(`/api/servers/${serverId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setDeleting(false);
      window.alert("Não foi possível excluir o servidor.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        {members.map((member) => {
          const isOwnerRow = member.id === ownerId;
          return (
            <div key={member.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-primary">
                {member.image ? (
                  <Image src={member.image} alt="" fill sizes="32px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-display text-xs font-bold">
                    {(member.nickname ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-[#f5f5f7]">
                  {member.nickname}
                  {isOwnerRow && <CrownIcon />}
                </div>
                <div className="truncate text-xs text-muted">#{member.userTag}</div>
              </div>

              {!isOwnerRow && permissions.canManageRoles && (
                <select
                  value={member.roleId ?? ""}
                  disabled={busyId === member.id}
                  onChange={(e) => assignRole(member.id, e.target.value || null)}
                  className="h-8 rounded-lg border border-[#2d3344] bg-background px-2 text-xs font-semibold text-[#d5d7dc] outline-none focus:border-primary"
                >
                  <option value="">Sem cargo</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}

              {!isOwnerRow && permissions.canKick && (
                <button
                  onClick={() => kick(member.id)}
                  disabled={busyId === member.id}
                  title="Expulsar"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-[#f5f5f7] disabled:opacity-50"
                >
                  <KickIcon />
                </button>
              )}
              {!isOwnerRow && permissions.canBan && (
                <button
                  onClick={() => ban(member.id)}
                  disabled={busyId === member.id}
                  title="Banir"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-danger transition hover:bg-danger/10 disabled:opacity-50"
                >
                  <BanIcon />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {permissions.canBan && bans && bans.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-bold tracking-wider text-muted">BANIDOS</div>
          <div className="space-y-1">
            {bans.map((b) => (
              <div key={b.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                <div className="min-w-0 flex-1 truncate text-sm text-[#d5d7dc]">
                  {b.user.nickname}
                  <span className="text-muted">#{b.user.userTag}</span>
                </div>
                <button
                  onClick={() => unban(b.user.id)}
                  disabled={busyId === b.user.id}
                  className="rounded-full border border-[#2d3344] px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-primary hover:text-[#f5f5f7] disabled:opacity-50"
                >
                  Desbanir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {permissions.isOwner && (
        <div className="rounded-xl border border-danger/30 bg-danger/[0.06] p-4">
          <div className="text-sm font-bold text-[#f5f5f7]">Excluir servidor</div>
          <p className="mt-1 text-xs text-dim">
            Apaga o servidor pra sempre, com todos os canais, mensagens e membros. Nao da pra desfazer.
          </p>
          {confirmDelete ? (
            <div className="mt-3 flex gap-2">
              <button
                onClick={deleteServer}
                disabled={deleting}
                className="h-9 flex-1 rounded-lg bg-danger text-xs font-bold text-white transition hover:bg-danger-hover disabled:opacity-50"
              >
                {deleting ? "Excluindo..." : "Sim, excluir pra sempre"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="h-9 rounded-lg border border-[#2d3344] px-4 text-xs font-bold text-muted transition hover:text-[#f5f5f7]"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="mt-3 h-9 rounded-lg border border-danger/40 px-4 text-xs font-bold text-danger transition hover:bg-danger/10"
            >
              Excluir servidor
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CargosTab({ serverId, permissions }: { serverId: string; permissions: ServerPermissions }) {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(ROLE_COLORS[0]);
  const [canKick, setCanKick] = useState(false);
  const [canBan, setCanBan] = useState(false);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [canManageChannels, setCanManageChannels] = useState(false);
  const [error, setError] = useState("");

  function loadRoles() {
    fetch(`/api/servers/${serverId}/roles`)
      .then((r) => r.json())
      .then((data) => setRoles(data.roles ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(loadRoles, [serverId]);

  async function createRole(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    const res = await fetch(`/api/servers/${serverId}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color, canKick, canBan, canManageRoles, canManageChannels }),
    });
    setCreating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Não foi possível criar o cargo.");
      return;
    }
    setName("");
    setCanKick(false);
    setCanBan(false);
    setCanManageRoles(false);
    setCanManageChannels(false);
    loadRoles();
  }

  async function updateRoleFlag(role: RoleSummary, patch: Partial<RoleSummary>) {
    setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, ...patch } : r)));
    await fetch(`/api/servers/${serverId}/roles/${role.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    router.refresh();
  }

  async function deleteRole(roleId: string) {
    if (!window.confirm("Excluir esse cargo? Quem tinha ele fica sem cargo.")) return;
    await fetch(`/api/servers/${serverId}/roles/${roleId}`, { method: "DELETE" });
    setRoles((prev) => prev.filter((r) => r.id !== roleId));
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {!loading && roles.length > 0 && (
        <div className="space-y-2">
          {roles.map((role) => (
            <div key={role.id} className="rounded-xl border border-[#2d3344] p-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: role.color ?? "#838a99" }} />
                <span className="flex-1 truncate text-sm font-bold text-[#f5f5f7]">{role.name}</span>
                <button
                  onClick={() => deleteRole(role.id)}
                  title="Excluir cargo"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
                >
                  <TrashIcon />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <PermToggle label="Expulsar" checked={role.canKick} onChange={(v) => updateRoleFlag(role, { canKick: v })} />
                <PermToggle label="Banir" checked={role.canBan} onChange={(v) => updateRoleFlag(role, { canBan: v })} />
                <PermToggle
                  label="Gerenciar cargos"
                  checked={role.canManageRoles}
                  onChange={(v) => updateRoleFlag(role, { canManageRoles: v })}
                />
                <PermToggle
                  label="Gerenciar canais"
                  checked={role.canManageChannels}
                  onChange={(v) => updateRoleFlag(role, { canManageChannels: v })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={createRole} className="space-y-3 rounded-xl border border-[#2d3344] p-4">
        <div className="text-xs font-bold tracking-wide text-muted">NOVO CARGO</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Nome do cargo"
          className="h-10 w-full rounded-lg border border-[#2d3344] bg-background px-3 text-sm font-semibold outline-none focus:border-primary"
        />
        <div className="flex flex-wrap gap-1.5">
          {ROLE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full transition ${color === c ? "ring-2 ring-offset-2 ring-offset-surface ring-[#f5f5f7]" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <PermToggle label="Expulsar" checked={canKick} onChange={setCanKick} />
          <PermToggle label="Banir" checked={canBan} onChange={setCanBan} />
          <PermToggle label="Gerenciar cargos" checked={canManageRoles} onChange={setCanManageRoles} />
          <PermToggle label="Gerenciar canais" checked={canManageChannels} onChange={setCanManageChannels} />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="h-10 w-full rounded-lg bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {creating ? "Criando..." : "Criar cargo"}
        </button>
      </form>
    </div>
  );
}

function CanaisTab({
  serverId,
  currentChannelId,
  onClose,
}: {
  serverId: string;
  currentChannelId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"TEXT" | "CALL">("TEXT");
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadChannels() {
    fetch(`/api/servers/${serverId}/channels`)
      .then((r) => r.json())
      .then((data) => setChannels(data.channels ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(loadChannels, [serverId]);

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    const res = await fetch(`/api/servers/${serverId}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type }),
    });
    setCreating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Não foi possível criar o canal.");
      return;
    }
    setName("");
    loadChannels();
    router.refresh();
  }

  // Se o canal excluido era o que a pessoa estava vendo, fecha o modal e
  // manda ela pra raiz do servidor — senao a tela por baixo ficaria presa
  // num canal que nao existe mais.
  async function deleteChannel(channelId: string) {
    if (!window.confirm("Excluir esse canal? O histórico dele se perde pra sempre.")) return;
    setDeletingId(channelId);
    const res = await fetch(`/api/servers/${serverId}/channels/${channelId}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error ?? "Não foi possível excluir o canal.");
      return;
    }
    setChannels((prev) => prev.filter((c) => c.id !== channelId));
    if (channelId === currentChannelId) {
      onClose();
      router.push(`/servers/${serverId}`);
    }
    router.refresh();
  }

  const textChannels = channels.filter((c) => c.type === "TEXT");
  const callChannels = channels.filter((c) => c.type === "CALL");

  return (
    <div className="space-y-5">
      {!loading && (
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-[11px] font-bold tracking-wider text-muted">CANAIS DE TEXTO</div>
            <div className="space-y-1">
              {textChannels.map((c) => (
                <ChannelListRow key={c.id} channel={c} onDelete={() => deleteChannel(c.id)} deleting={deletingId === c.id} />
              ))}
              {textChannels.length === 0 && <p className="px-1 text-xs text-dim">Nenhum canal de texto.</p>}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-bold tracking-wider text-muted">SALAS DE CHAMADA</div>
            <div className="space-y-1">
              {callChannels.map((c) => (
                <ChannelListRow key={c.id} channel={c} onDelete={() => deleteChannel(c.id)} deleting={deletingId === c.id} />
              ))}
              {callChannels.length === 0 && <p className="px-1 text-xs text-dim">Nenhuma sala de chamada.</p>}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={createChannel} className="space-y-3 rounded-xl border border-[#2d3344] p-4">
        <div className="text-xs font-bold tracking-wide text-muted">NOVO CANAL</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Nome do canal"
          className="h-10 w-full rounded-lg border border-[#2d3344] bg-background px-3 text-sm font-semibold outline-none focus:border-primary"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setType("TEXT")}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition ${
              type === "TEXT" ? "border-primary bg-primary/10 text-[#f5f5f7]" : "border-[#2d3344] text-muted hover:text-[#d5d7dc]"
            }`}
          >
            Texto
          </button>
          <button
            type="button"
            onClick={() => setType("CALL")}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition ${
              type === "CALL" ? "border-primary bg-primary/10 text-[#f5f5f7]" : "border-[#2d3344] text-muted hover:text-[#d5d7dc]"
            }`}
          >
            Chamada
          </button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="h-10 w-full rounded-lg bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {creating ? "Criando..." : "Criar canal"}
        </button>
      </form>
    </div>
  );
}

function ChannelListRow({
  channel,
  onDelete,
  deleting,
}: {
  channel: ChannelSummary;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
      {channel.type === "CALL" ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-muted"
        >
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
      ) : (
        <span className="w-[15px] shrink-0 text-center text-sm font-semibold text-muted">#</span>
      )}
      <span className="flex-1 truncate text-sm font-semibold text-[#d5d7dc]">{channel.name}</span>
      <button
        onClick={onDelete}
        disabled={deleting}
        title="Excluir canal"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function PermToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
        checked ? "border-primary bg-primary/10 text-[#f5f5f7]" : "border-[#2d3344] text-muted hover:text-[#d5d7dc]"
      }`}
    >
      {label}
    </button>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-accent">
      <path d="M2.5 8l4 3 5.5-6 5.5 6 4-3-1.5 11h-16z" />
    </svg>
  );
}

function KickIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M17 8l4 4m0-4l-4 4" />
    </svg>
  );
}

function BanIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M4.9 4.9l14.2 14.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0l-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
