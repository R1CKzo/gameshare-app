"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { apiUrl } from "@/lib/apiUrl";

const NAME_MAX = 40;
const SERVER_IMAGE_SIZE = 256;

// Mesmo redimensionamento de src/components/shell/SettingsButton.tsx
// (foto de perfil) — duplicado em vez de compartilhar pra nao arriscar
// mexer num fluxo que ja funciona.
async function resizeImageToDataUrl(file: File, maxBytes = 180_000): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = SERVER_IMAGE_SIZE;
  canvas.height = SERVER_IMAGE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SERVER_IMAGE_SIZE, SERVER_IMAGE_SIZE);

  let quality = 0.9;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > maxBytes && quality > 0.3) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

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
  serverName,
  serverImage,
  ownerId,
  members,
  permissions,
}: {
  serverId: string;
  serverName: string;
  serverImage: string | null;
  ownerId: string;
  members: MemberSummary[];
  permissions: ServerPermissions;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Gerenciar servidor"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-dim transition hover:bg-elevated-hover hover:text-foreground"
      >
        <ShieldIcon />
      </button>
      {open && (
        <ServerSettingsModal
          serverId={serverId}
          serverName={serverName}
          serverImage={serverImage}
          ownerId={ownerId}
          members={members}
          permissions={permissions}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ServerSettingsModal({
  serverId,
  serverName,
  serverImage,
  ownerId,
  members,
  permissions,
  onClose,
}: {
  serverId: string;
  serverName: string;
  serverImage: string | null;
  ownerId: string;
  members: MemberSummary[];
  permissions: ServerPermissions;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"geral" | "membros" | "cargos">(permissions.isOwner ? "geral" : "membros");
  const tabs = [
    ...(permissions.isOwner ? (["geral"] as const) : []),
    "membros" as const,
    ...(permissions.canManageRoles ? (["cargos"] as const) : []),
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-overlay-strong bg-surface shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-overlay px-5 py-4">
          <h2 className="font-display text-lg font-bold">Gerenciar servidor</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-foreground"
          >
            <CloseIcon />
          </button>
        </div>

        {tabs.length > 1 && (
          <div className="flex shrink-0 gap-1 border-b border-overlay px-3 pt-3">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-t-lg px-4 py-2 text-sm font-bold capitalize transition ${
                  tab === t ? "bg-elevated text-foreground" : "text-muted hover:text-foreground-secondary"
                }`}
              >
                {t === "geral" ? "Geral" : t === "membros" ? "Membros" : "Cargos"}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto p-5">
          {tab === "geral" ? (
            <GeralTab serverId={serverId} serverName={serverName} serverImage={serverImage} />
          ) : tab === "membros" ? (
            <MembrosTab serverId={serverId} ownerId={ownerId} members={members} permissions={permissions} />
          ) : (
            <CargosTab serverId={serverId} permissions={permissions} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function GeralTab({
  serverId,
  serverName,
  serverImage,
}: {
  serverId: string;
  serverName: string;
  serverImage: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(serverName);
  const [image, setImage] = useState<string | null>(serverImage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nameValid = name.trim().length > 0 && name.trim().length <= NAME_MAX;
  const changed = name.trim() !== serverName || (image !== null && image !== serverImage);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setImage(dataUrl);
    } catch {
      setError("Não foi possível processar essa imagem.");
    }
  }

  async function handleSave() {
    if (!nameValid) {
      setError(`Nome inválido. Use até ${NAME_MAX} caracteres.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: { name?: string; image?: string } = {};
      if (name.trim() !== serverName) body.name = name.trim();
      if (image && image !== serverImage) body.image = image;
      if (Object.keys(body).length === 0) return;

      const res = await fetch(apiUrl(`/api/servers/${serverId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-primary transition hover:opacity-80"
          title="Trocar imagem do servidor"
        >
          {image ? (
            <Image src={image} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-lg font-bold">
              {(name || "?").slice(0, 2).toUpperCase()}
            </div>
          )}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-bold tracking-wide text-muted">NOME DO SERVIDOR</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-primary"
          />
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || !changed || !nameValid}
        className="h-10 w-full rounded-lg bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </div>
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
      fetch(apiUrl(`/api/servers/${serverId}/roles`))
        .then((r) => r.json())
        .then((data) => setRoles(data.roles ?? []))
        .catch(() => {});
    }
    if (permissions.canBan) {
      fetch(apiUrl(`/api/servers/${serverId}/bans`))
        .then((r) => r.json())
        .then((data) => setBans(data.bans ?? []))
        .catch(() => {});
    }
  }, [serverId, permissions.canManageRoles, permissions.canBan]);

  async function assignRole(userId: string, roleId: string | null) {
    setBusyId(userId);
    await fetch(apiUrl(`/api/servers/${serverId}/members/${userId}/role`), {
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
    await fetch(apiUrl(`/api/servers/${serverId}/members/${userId}`), { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  async function ban(userId: string) {
    if (!window.confirm("Banir esse membro? Ele não vai conseguir reentrar pelo convite.")) return;
    setBusyId(userId);
    await fetch(apiUrl(`/api/servers/${serverId}/bans`), {
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
    await fetch(apiUrl(`/api/servers/${serverId}/bans/${userId}`), { method: "DELETE" });
    setBans((prev) => (prev ? prev.filter((b) => b.user.id !== userId) : prev));
    setBusyId(null);
  }

  async function deleteServer() {
    setDeleting(true);
    const res = await fetch(apiUrl(`/api/servers/${serverId}`), { method: "DELETE" });
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
            <div key={member.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-overlay-weak">
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
                <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
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
                  className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-semibold text-foreground-secondary outline-none focus:border-primary"
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
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-foreground disabled:opacity-50"
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
              <div key={b.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-overlay-weak">
                <div className="min-w-0 flex-1 truncate text-sm text-foreground-secondary">
                  {b.user.nickname}
                  <span className="text-muted">#{b.user.userTag}</span>
                </div>
                <button
                  onClick={() => unban(b.user.id)}
                  disabled={busyId === b.user.id}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-primary hover:text-foreground disabled:opacity-50"
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
          <div className="text-sm font-bold text-foreground">Excluir servidor</div>
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
                className="h-9 rounded-lg border border-border px-4 text-xs font-bold text-muted transition hover:text-foreground"
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
    fetch(apiUrl(`/api/servers/${serverId}/roles`))
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
    const res = await fetch(apiUrl(`/api/servers/${serverId}/roles`), {
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
    await fetch(apiUrl(`/api/servers/${serverId}/roles/${role.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    router.refresh();
  }

  async function deleteRole(roleId: string) {
    if (!window.confirm("Excluir esse cargo? Quem tinha ele fica sem cargo.")) return;
    await fetch(apiUrl(`/api/servers/${serverId}/roles/${roleId}`), { method: "DELETE" });
    setRoles((prev) => prev.filter((r) => r.id !== roleId));
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {!loading && roles.length > 0 && (
        <div className="space-y-2">
          {roles.map((role) => (
            <div key={role.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: role.color ?? "#838a99" }} />
                <span className="flex-1 truncate text-sm font-bold text-foreground">{role.name}</span>
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

      <form onSubmit={createRole} className="space-y-3 rounded-xl border border-border p-4">
        <div className="text-xs font-bold tracking-wide text-muted">NOVO CARGO</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Nome do cargo"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-primary"
        />
        <div className="flex flex-wrap gap-1.5">
          {ROLE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full transition ${color === c ? "ring-2 ring-offset-2 ring-offset-surface ring-foreground" : ""}`}
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

function PermToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
        checked ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted hover:text-foreground-secondary"
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
