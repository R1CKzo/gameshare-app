"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { DEFAULT_AUDIO_SETTINGS, loadAudioSettings, saveAudioSettings, type AudioSettings } from "@/lib/audioSettings";

const NICKNAME_REGEX = /^[a-zA-Z0-9_]{3,16}$/;
const AVATAR_SIZE = 256;

// Redimensiona a foto pro navegador nunca mandar um arquivo gigante — vira
// um quadrado de 256x256 em JPEG, com a qualidade reduzida ate caber num
// teto de tamanho (o backend tambem valida isso, isso aqui e so pra nao
// gastar banda/armazenamento a toa).
async function resizeImageToDataUrl(file: File, maxBytes = 180_000): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponivel.");

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  let quality = 0.9;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > maxBytes && quality > 0.3) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Configuracoes"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-dim transition hover:bg-elevated-hover hover:text-[#f5f5f7]"
      >
        <GearIcon />
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"perfil" | "audio">("perfil");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-surface shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <h2 className="font-display text-lg font-bold">Configuracoes</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-[#f5f5f7]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-white/[0.06] px-3 pt-3">
          {(["perfil", "audio"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t-lg px-4 py-2 text-sm font-bold capitalize transition ${
                tab === t ? "bg-elevated text-[#f5f5f7]" : "text-muted hover:text-[#d5d7dc]"
              }`}
            >
              {t === "perfil" ? "Perfil" : "Audio"}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto p-5">
          {tab === "perfil" ? <ProfileTab /> : <AudioTab />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [nickname, setNickname] = useState(session?.user?.nickname ?? "");
  const [image, setImage] = useState<string | null>(session?.user?.image ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userTag = session?.user?.userTag ?? "";
  const nicknameValid = NICKNAME_REGEX.test(nickname);
  const changed = nickname !== (session?.user?.nickname ?? "") || image !== (session?.user?.image ?? null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setImage(dataUrl);
    } catch {
      setError("Nao foi possivel processar essa imagem.");
    }
  }

  async function handleSave() {
    if (!nicknameValid) {
      setError("Nickname invalido. Use 3-16 caracteres: letras, numeros ou underline.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const body: { nickname?: string; image?: string } = {};
      if (nickname !== session?.user?.nickname) body.nickname = nickname;
      if (image && image !== session?.user?.image) body.image = image;

      if (Object.keys(body).length === 0) return;

      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Nao foi possivel salvar.");
        return;
      }

      // Mesmo truque do /setup: forca o cookie de sessao a se atualizar
      // agora, senao o resto da interface (e o middleware) continua vendo
      // o nickname/foto antigos ate a sessao expirar sozinha.
      await update();
      router.refresh();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-[#2d3344] bg-primary"
        >
          {image ? (
            <Image src={image} alt="" fill sizes="80px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-2xl font-bold">
              {(nickname || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] font-bold opacity-0 transition group-hover:opacity-100">
            Trocar
          </div>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        <div className="text-xs text-dim">Clique na foto pra trocar. JPG/PNG, sera recortada em quadrado.</div>
      </div>

      <div>
        <label htmlFor="settings-nickname" className="mb-2 block text-xs font-bold tracking-wide text-muted">
          NICKNAME
        </label>
        <div className="flex items-center gap-2">
          <input
            id="settings-nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            minLength={3}
            maxLength={16}
            className="h-11 flex-1 rounded-xl border border-[#2d3344] bg-background px-4 text-[15px] font-semibold outline-none focus:border-primary"
          />
          <span className="text-sm font-bold text-dim">#{userTag}</span>
        </div>
        <p className="mt-1.5 text-xs text-dim">A tag numerica e permanente e nao pode ser alterada.</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {success && <p className="text-sm text-accent">Perfil atualizado.</p>}

      <button
        onClick={handleSave}
        disabled={saving || !changed || !nicknameValid}
        className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar alteracoes"}
      </button>
    </div>
  );
}

function AudioTab() {
  const [settings, setSettings] = useState<AudioSettings>(() =>
    typeof window !== "undefined" ? loadAudioSettings() : DEFAULT_AUDIO_SETTINGS
  );

  function update(patch: Partial<AudioSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAudioSettings(next);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-dim">
        Aplicado no seu microfone da proxima vez que voce entrar numa chamada. So afeta seu proprio audio, cada
        pessoa configura o dela.
      </p>
      <ToggleRow
        label="Supressao de ruido"
        description="Reduz ruido de fundo (ventilador, teclado, etc)."
        checked={settings.noiseSuppression}
        onChange={(v) => update({ noiseSuppression: v })}
      />
      <ToggleRow
        label="Cancelamento de eco"
        description="Evita que sua propria voz volte pelo alto-falante de quem esta ouvindo."
        checked={settings.echoCancellation}
        onChange={(v) => update({ echoCancellation: v })}
      />
      <ToggleRow
        label="Controle automatico de ganho"
        description="Ajusta o volume do microfone automaticamente."
        checked={settings.autoGainControl}
        onChange={(v) => update({ autoGainControl: v })}
      />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl bg-elevated/60 p-3.5">
      <div>
        <div className="text-sm font-bold text-[#f5f5f7]">{label}</div>
        <div className="mt-0.5 text-xs text-dim">{description}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-primary"
      />
    </label>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
