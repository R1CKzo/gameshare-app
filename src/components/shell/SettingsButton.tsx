"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useTheme } from "@/components/ThemeProvider";
import {
  DEFAULT_AUDIO_SETTINGS,
  getMicConstraints,
  loadAudioSettings,
  saveAudioSettings,
  sensitivityToGateThreshold,
  type AudioSettings,
} from "@/lib/audioSettings";
import { apiUrl } from "@/lib/apiUrl";
import { checkBetaBuild, downloadAndInstallBeta, isDesktopApp, type BetaCheckResult } from "@/lib/desktop";

const NICKNAME_REGEX = /^[a-zA-Z0-9_]{3,16}$/;
const AVATAR_SIZE = 256;
const BETA_STORAGE_KEY = "gameshare-allow-beta";

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
  if (!ctx) throw new Error("Canvas indisponível.");

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
        title="Configurações"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-dim transition hover:bg-elevated-hover hover:text-foreground"
      >
        <GearIcon />
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"perfil" | "audio" | "seguranca" | "beta" | "bug">("perfil");
  const tabs = (["perfil", "audio", "seguranca", ...(isDesktopApp() ? (["beta"] as const) : []), "bug"] as const);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-overlay-strong bg-surface shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-overlay px-5 py-4">
          <h2 className="font-display text-lg font-bold">Configurações</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-elevated-hover hover:text-foreground"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-overlay px-3 pt-3">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t-lg px-4 py-2 text-sm font-bold capitalize transition ${
                tab === t ? "bg-elevated text-foreground" : "text-muted hover:text-foreground-secondary"
              }`}
            >
              {t === "perfil"
                ? "Perfil"
                : t === "audio"
                  ? "Áudio"
                  : t === "seguranca"
                    ? "Segurança"
                    : t === "beta"
                      ? "Beta"
                      : "Reportar bug"}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto p-5">
          {tab === "perfil" ? (
            <ProfileTab />
          ) : tab === "audio" ? (
            <AudioTab />
          ) : tab === "seguranca" ? (
            <SegurancaTab />
          ) : tab === "beta" ? (
            <BetaTab />
          ) : (
            <BugReportTab onClose={onClose} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ProfileTab() {
  const { data: session, update } = useSession();
  const { theme, setTheme } = useTheme();
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
      setError("Não foi possível processar essa imagem.");
    }
  }

  async function handleSave() {
    if (!nicknameValid) {
      setError("Nickname inválido. Use 3-16 caracteres: letras, números ou underline.");
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

      const res = await fetch(apiUrl("/api/user/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.");
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
      <div>
        <label className="mb-2 block text-xs font-bold tracking-wide text-muted">APARÊNCIA</label>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
              theme === "dark" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted hover:text-foreground-secondary"
            }`}
          >
            <MoonIcon className="mx-auto mb-1" />
            Escuro
          </button>
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
              theme === "light" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted hover:text-foreground-secondary"
            }`}
          >
            <SunIcon className="mx-auto mb-1" />
            Claro
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-border bg-primary"
        >
          {image ? (
            // unoptimized: quando image vem da sessao (/api/me/avatar), o
            // otimizador do Next buscaria essa URL sem os cookies do
            // navegador e levaria 401 — ver o mesmo comentario em
            // UserPill.tsx.
            <Image src={image} alt="" fill sizes="80px" unoptimized className="object-cover" />
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
        <div className="text-xs text-dim">Clique na foto pra trocar. JPG/PNG, será recortada em quadrado.</div>
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
            className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-[15px] font-semibold outline-none focus:border-primary"
          />
          <span className="text-sm font-bold text-dim">#{userTag}</span>
        </div>
        <p className="mt-1.5 text-xs text-dim">A tag numérica é permanente e não pode ser alterada.</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {success && <p className="text-sm text-accent">Perfil atualizado.</p>}

      <button
        onClick={handleSave}
        disabled={saving || !changed || !nicknameValid}
        className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar alterações"}
      </button>
    </div>
  );
}

// Nivel de RMS (0-1) considerado "bem alto" pra normalizar a barra visual —
// so uma referencia de escala, nao tem relacao com o limiar do gate.
const METER_REFERENCE_RMS = 0.35;

function AudioTab() {
  const [settings, setSettings] = useState<AudioSettings>(() =>
    typeof window !== "undefined" ? loadAudioSettings() : DEFAULT_AUDIO_SETTINGS
  );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState(0);
  const [monitorError, setMonitorError] = useState<string | null>(null);

  function update(patch: Partial<AudioSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAudioSettings(next);
  }

  // Lista os microfones disponiveis. Os nomes so vem preenchidos depois que
  // o navegador ja liberou o microfone pelo menos uma vez.
  useEffect(() => {
    let cancelled = false;
    async function loadDevices() {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(all.filter((d) => d.kind === "audioinput"));
      } catch {
        // ignora — a lista so fica vazia
      }
    }
    loadDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", loadDevices);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", loadDevices);
    };
  }, []);

  // Testador ao vivo: abre o mic escolhido (com as constraints escolhidas)
  // e mostra o volume captado em tempo real, pra dar pra calibrar a
  // sensibilidade olhando pro medidor em vez de adivinhar um numero.
  useEffect(() => {
    let cancelled = false;
    let audioContext: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let rafId: number;

    async function monitor() {
      try {
        setMonitorError(null);
        stream = await navigator.mediaDevices.getUserMedia({ audio: getMicConstraints(settings) });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // Agora que o mic foi liberado, os nomes dos dispositivos ficam
        // disponiveis — atualiza a lista pra trocar de "Microfone a3f9.."
        // pro nome de verdade.
        navigator.mediaDevices
          .enumerateDevices()
          .then((all) => !cancelled && setDevices(all.filter((d) => d.kind === "audioinput")))
          .catch(() => {});
        audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        function tick() {
          if (cancelled) return;
          analyser.getByteTimeDomainData(data);
          let sumSquares = 0;
          for (let i = 0; i < data.length; i++) {
            const normalized = (data[i] - 128) / 128;
            sumSquares += normalized * normalized;
          }
          setLevel(Math.sqrt(sumSquares / data.length));
          rafId = requestAnimationFrame(tick);
        }
        tick();
      } catch {
        if (!cancelled) setMonitorError("Não foi possível abrir esse microfone pra teste.");
      }
    }
    monitor();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      audioContext?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.deviceId, settings.noiseSuppression, settings.echoCancellation, settings.autoGainControl]);

  const threshold = sensitivityToGateThreshold(settings.sensitivity);
  const levelPct = Math.min(100, (level / METER_REFERENCE_RMS) * 100);
  const thresholdPct = Math.min(100, (threshold / METER_REFERENCE_RMS) * 100);

  return (
    <div className="space-y-4">
      <p className="text-xs text-dim">
        Aplicado no seu microfone da próxima vez que você entrar numa chamada. Só afeta seu próprio áudio, cada
        pessoa configura o dela.
      </p>

      <div>
        <label htmlFor="mic-device" className="mb-2 block text-xs font-bold tracking-wide text-muted">
          MICROFONE
        </label>
        <select
          id="mic-device"
          value={settings.deviceId ?? ""}
          onChange={(e) => update({ deviceId: e.target.value || null })}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-primary"
        >
          <option value="">Padrão do sistema</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microfone ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-dim">
          Se o áudio ficar "voltando"/com eco infinito, confira se não selecionou sem querer um dispositivo de loopback
          (ex: "Stereo Mix") em vez do microfone de verdade.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="mic-sensitivity" className="text-xs font-bold tracking-wide text-muted">
            SENSIBILIDADE DO MICROFONE
          </label>
          <span className="text-xs font-bold text-dim">{settings.sensitivity}</span>
        </div>
        <input
          id="mic-sensitivity"
          type="range"
          min={0}
          max={100}
          value={settings.sensitivity}
          onChange={(e) => update({ sensitivity: Number(e.target.value) })}
          className="w-full accent-primary"
        />
        <p className="mt-1.5 text-xs text-dim">
          Baixa: só deixa passar sua voz falando alto, corta ruído/eco de fundo. Alta: pega qualquer som, mesmo baixinho.
        </p>

        <div className="mt-3">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-75"
              style={{ width: `${levelPct}%` }}
            />
            <div
              className="absolute inset-y-0 w-0.5 bg-white/70"
              style={{ left: `${thresholdPct}%` }}
              title="Limiar do gate: o volume precisa passar dessa marca pra sua voz ser transmitida"
            />
          </div>
          <p className="mt-1.5 text-xs text-dim">
            {monitorError ?? "Fale perto do microfone pra ver o nível captado. A linha branca é o limiar atual."}
          </p>
        </div>
      </div>

      <ToggleRow
        label="Supressão de ruído"
        description="Reduz ruído de fundo (ventilador, teclado, etc)."
        checked={settings.noiseSuppression}
        onChange={(v) => update({ noiseSuppression: v })}
      />
      <ToggleRow
        label="Cancelamento de eco"
        description="Evita que sua própria voz volte pelo alto-falante de quem está ouvindo."
        checked={settings.echoCancellation}
        onChange={(v) => update({ echoCancellation: v })}
      />
      <ToggleRow
        label="Controle automático de ganho"
        description="Ajusta o volume do microfone automaticamente."
        checked={settings.autoGainControl}
        onChange={(v) => update({ autoGainControl: v })}
      />
    </div>
  );
}

// Programa beta simplificado: sem canal do electron-updater nem download
// em segundo plano (o sistema anterior fazia isso e quebrou repetidas
// vezes) -- so um interruptor local (guardado no localStorage desse
// computador, sem rota de API) que, ligado, checa o GitHub direto (ver
// checkBetaBuild em src/lib/desktop.ts) e mostra um botao pra baixar e
// abrir o instalador na hora.
function BetaTab() {
  const [allowed, setAllowed] = useState(false);
  const [checkState, setCheckState] = useState<"idle" | "checking" | "none" | "available">("idle");
  const [beta, setBeta] = useState<Extract<BetaCheckResult, { available: true }> | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAllowed(localStorage.getItem(BETA_STORAGE_KEY) === "true");
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setCheckState("checking");
    checkBetaBuild().then((result) => {
      if (cancelled) return;
      if (result.available) {
        setBeta(result);
        setCheckState("available");
      } else {
        setBeta(null);
        setCheckState("none");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  function handleToggle(v: boolean) {
    setAllowed(v);
    try {
      localStorage.setItem(BETA_STORAGE_KEY, String(v));
    } catch {
      // modo privado ou storage cheio — a escolha so nao sobrevive a um
      // recarregamento, sem quebrar nada
    }
  }

  async function handleInstall() {
    if (!beta) return;
    setInstalling(true);
    setError(null);
    const result = await downloadAndInstallBeta(beta.downloadUrl);
    if (!result.ok) {
      setError(result.error);
      setInstalling(false);
    }
    // Se deu certo o app fecha sozinho em seguida (ver
    // downloadAndInstallBeta) -- nao precisa desligar o "instalando".
  }

  return (
    <div className="space-y-4">
      <ToggleRow
        label="Permitir versões beta"
        description="Mostra aqui quando tiver uma versão de teste disponível pra baixar."
        checked={allowed}
        onChange={handleToggle}
      />

      {allowed && (
        <div className="rounded-xl bg-elevated/60 p-3.5">
          {checkState === "checking" && <p className="text-sm text-muted">Procurando versão beta…</p>}
          {checkState === "none" && <p className="text-sm text-muted">Nenhuma versão beta disponível no momento.</p>}
          {checkState === "available" && beta && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-foreground">Versão beta {beta.version} disponível</p>
              {beta.notes && <p className="whitespace-pre-wrap text-xs text-dim">{beta.notes}</p>}
              <button
                onClick={handleInstall}
                disabled={installing}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {installing ? "Baixando…" : "Baixar e instalar"}
              </button>
              {installing && (
                <p className="text-xs text-dim">O app vai fechar sozinho assim que o instalador abrir.</p>
              )}
              {error && <p className="text-xs text-danger">{error}</p>}
            </div>
          )}
        </div>
      )}
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
        <div className="text-sm font-bold text-foreground">{label}</div>
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

type PwStep = "form" | "code";

// Definir senha (conta so-Google) ou trocar (ja tem uma) — os dois casos
// sempre passam por um codigo enviado por email antes de valer, mesma
// logica do login por senha.
function SegurancaTab() {
  const { data: session, update } = useSession();
  const hasPassword = session?.user?.hasPassword ?? false;

  const [step, setStep] = useState<PwStep>("form");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function requestChange(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    const res = await fetch(apiUrl("/api/auth/password/change-request"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: hasPassword ? currentPassword : undefined, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível continuar.");
      return;
    }
    setTicketId(data.ticketId);
    setStep("code");
  }

  async function confirmChange(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    const res = await fetch(apiUrl("/api/auth/password/change-confirm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, code }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Código inválido.");
      return;
    }
    await update();
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <CheckIcon />
        </div>
        <p className="text-sm font-bold text-foreground">{hasPassword ? "Senha alterada!" : "Senha definida!"}</p>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={confirmChange} className="space-y-4">
        <p className="text-xs text-dim">Enviamos um código de 6 dígitos pro seu email. Confirme pra aplicar a nova senha.</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          placeholder="000000"
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-center text-lg font-bold tracking-[0.3em] outline-none focus:border-primary"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={sending || code.length !== 6}
          className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {sending ? "Confirmando..." : "Confirmar código"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={requestChange} className="space-y-4">
      <p className="text-xs text-dim">
        {hasPassword
          ? "Trocar sua senha também vai pedir um código por email pra confirmar."
          : "Sua conta usa login com Google. Defina uma senha pra também poder entrar com email e senha."}
      </p>

      {hasPassword && (
        <div>
          <label className="mb-2 block text-xs font-bold tracking-wide text-muted">SENHA ATUAL</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
        </div>
      )}

      <div>
        <label className="mb-2 block text-xs font-bold tracking-wide text-muted">
          {hasPassword ? "NOVA SENHA" : "SENHA"}
        </label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
        />
        <p className="mt-1.5 text-xs text-dim">Mínimo 8 caracteres.</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={sending || newPassword.length < 8 || (hasPassword && !currentPassword)}
        className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {sending ? "Enviando..." : hasPassword ? "Trocar senha" : "Definir senha"}
      </button>
    </form>
  );
}

const SEVERITIES = [
  { value: "LOW", label: "Baixa", hint: "Incomoda, mas dá pra contornar." },
  { value: "MEDIUM", label: "Média", hint: "Atrapalha o uso normal." },
  { value: "HIGH", label: "Alta", hint: "Trava, quebra ou impede de usar." },
] as const;

// Manda titulo + descricao pro banco junto com contexto capturado sozinho
// (em que pagina a pessoa estava, se e o app desktop ou o navegador) — a
// pessoa que reporta nao precisa descrever isso, so o problema em si.
function BugReportTab({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]["value"]>("MEDIUM");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/bugs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          severity,
          context: typeof window !== "undefined" ? window.location.pathname : null,
          appVersion: isDesktopApp() ? "App desktop" : "Navegador",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível enviar.");
        return;
      }
      setSent(true);
      setTimeout(onClose, 1400);
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <CheckIcon />
        </div>
        <p className="text-sm font-bold text-foreground">Reportado, valeu!</p>
        <p className="text-xs text-dim">Assim que der uma olhada, resolvemos.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-dim">Descreva o que aconteceu — quanto mais detalhe, mais rápido dá pra achar a causa.</p>

      <div>
        <label htmlFor="bug-title" className="mb-2 block text-xs font-bold tracking-wide text-muted">
TÍTULO
        </label>
        <input
          id="bug-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Ex: áudio corta quando alguém compartilha tela"
          className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm font-semibold outline-none focus:border-primary"
        />
      </div>

      <div>
        <label htmlFor="bug-description" className="mb-2 block text-xs font-bold tracking-wide text-muted">
          O QUE ACONTECEU
        </label>
        <textarea
          id="bug-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          rows={5}
          placeholder="O que você esperava que acontecesse, o que aconteceu de verdade, e como reproduzir."
          className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-bold tracking-wide text-muted">GRAVIDADE</label>
        <div className="flex gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSeverity(s.value)}
              title={s.hint}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                severity === s.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted hover:text-foreground-secondary"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={sending || !title.trim() || !description.trim()}
        className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {sending ? "Enviando..." : "Enviar reporte"}
      </button>
    </form>
  );
}

function MoonIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
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
