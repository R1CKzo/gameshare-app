"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAccessibility, type TextSize } from "@/components/AccessibilityProvider";
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
import { BETA_STORAGE_KEY, isBetaEnabled } from "@/lib/beta";
import { SEND_WITH_CTRL_ENTER_KEY } from "@/lib/chatSettings";
import {
  clearCache,
  DEFAULT_SHORTCUTS,
  getShortcuts,
  isDesktopApp,
  isOverlayEnabled,
  restartAppOrReload,
  setOverlayEnabled,
  setShortcuts,
  syncHardwareAccel,
  type ShortcutBindings,
} from "@/lib/desktop";
import { SOUND_CALLS_KEY, SOUND_MESSAGES_KEY } from "@/lib/sound";

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
      {open && <DiscordSettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}

// Configuracoes remodeladas pra ficar o mais parecido possivel com o
// Discord (pedido explicito do dono) -- tela cheia, categoria na lateral
// esquerda, conteudo largo a direita, botao de fechar redondo flutuando
// fora do painel com "ESC" embaixo.
type TabKey =
  | "perfil"
  | "seguranca"
  | "beta"
  | "audio"
  | "aparencia"
  | "acessibilidade"
  | "idioma"
  | "batepapo"
  | "notificacoes"
  | "atalhos"
  | "avancado"
  | "bug";

function DiscordSettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>("perfil");

  // Mesmos 3 grupos do Discord (menos "Navegador" e "Icone do aplicativo",
  // que nao fazem sentido aqui — o GameShare nao tem navegador embutido
  // nem icone customizavel). "Idioma" ainda e so placeholder (ver
  // ComingSoonTab) -- so o portugues (Brasil) existe por enquanto.
  const groups: { label: string; tabs: TabKey[] }[] = [
    {
      label: "Configurações do usuário",
      tabs: ["perfil", "seguranca", ...(isDesktopApp() ? (["beta"] as const) : [])],
    },
    {
      label: "Config. do aplicativo",
      tabs: [
        "audio",
        "aparencia",
        "acessibilidade",
        "idioma",
        "batepapo",
        "notificacoes",
        ...(isDesktopApp() && isBetaEnabled() ? (["atalhos"] as const) : []),
        "avancado",
      ],
    },
    {
      label: "Suporte",
      tabs: ["bug"],
    },
  ];

  const labels: Record<TabKey, string> = {
    perfil: "Minha Conta",
    seguranca: "Privacidade e Segurança",
    beta: "Beta",
    audio: "Voz",
    aparencia: "Aparência",
    acessibilidade: "Acessibilidade",
    idioma: "Idioma",
    batepapo: "Bate-papo",
    notificacoes: "Notificações",
    atalhos: "Atalhos",
    avancado: "Avançado",
    bug: "Reportar um Problema",
  };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background gs-anim-fade md:flex-row"
      onClick={onClose}
    >
      <div
        className="flex max-h-[45vh] shrink-0 flex-col gap-0.5 overflow-y-auto border-b border-overlay bg-surface px-3 pb-3 pt-[calc(0.5rem_+_var(--titlebar-h,0px))] md:max-h-none md:w-[218px] md:justify-start md:overflow-x-hidden md:border-b-0 md:px-2 md:py-[60px] md:pl-4"
        onClick={(e) => e.stopPropagation()}
      >
        {groups.map((group) => (
          <div key={group.label} className="mt-4 flex flex-col gap-0.5 first:mt-0 md:mt-5">
            <div className="mb-1 px-2.5 text-xs font-bold uppercase tracking-wide text-dim">
              {group.label}
            </div>
            {group.tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2.5 py-2 text-left text-[15px] font-medium leading-tight transition ${
                  tab === t ? "bg-elevated text-foreground" : "text-muted hover:bg-elevated-hover hover:text-foreground-secondary"
                }`}
              >
                {labels[t]}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div key={tab} className="mx-auto max-w-[600px] gs-anim-fade px-5 py-8 md:px-10 md:py-[60px]">
          <h2 className="mb-6 font-display text-xl font-bold">{labels[tab]}</h2>
          {tab === "perfil" ? (
            <ProfileTab />
          ) : tab === "seguranca" ? (
            <SegurancaTab />
          ) : tab === "beta" ? (
            <BetaTab />
          ) : tab === "audio" ? (
            <AudioTab />
          ) : tab === "aparencia" ? (
            <AparenciaTab />
          ) : tab === "acessibilidade" ? (
            <AcessibilidadeTab />
          ) : tab === "idioma" ? (
            <ComingSoonTab
              title="Mais idiomas em breve"
              description='Por enquanto o GameShare só fala português (Brasil). Suporte a outros idiomas está nos planos.'
            />
          ) : tab === "batepapo" ? (
            <BatePapoTab />
          ) : tab === "notificacoes" ? (
            <NotificacoesTab />
          ) : tab === "atalhos" ? (
            <AtalhosTab />
          ) : tab === "avancado" ? (
            <AvancadoTab />
          ) : (
            <BugReportTab onClose={onClose} />
          )}
        </div>
      </div>

      <button
        onClick={onClose}
        aria-label="Fechar"
        className="absolute right-2 top-[calc(0.5rem_+_var(--titlebar-h,0px))] flex flex-col items-center gap-1 text-muted transition hover:text-foreground md:right-6 md:top-[calc(24px_+_var(--titlebar-h,0px))]"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-current">
          <CloseIcon />
        </span>
        <span className="hidden text-[11px] font-bold md:block">ESC</span>
      </button>
    </div>,
    document.body,
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

function AparenciaTab() {
  const { theme, setTheme, glass, setGlass } = useTheme();

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

      {isBetaEnabled() && (
        <div>
          <label className="mb-2 block text-xs font-bold tracking-wide text-muted">INTERFACE</label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setGlass(false)}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                !glass ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted hover:text-foreground-secondary"
              }`}
            >
              Padrão
            </button>
            <button
              type="button"
              onClick={() => setGlass(true)}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                glass ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted hover:text-foreground-secondary"
              }`}
            >
              Liquid Glass
            </button>
          </div>
          <p className="mt-1.5 text-xs text-dim">Painéis translúcidos e desfocados. Recurso em teste.</p>
        </div>
      )}
    </div>
  );
}

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: "small", label: "Pequeno" },
  { value: "normal", label: "Normal" },
  { value: "large", label: "Grande" },
];

function AcessibilidadeTab() {
  const { textSize, setTextSize, reduceMotion, setReduceMotion, highContrast, setHighContrast } = useAccessibility();

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-2 block text-xs font-bold tracking-wide text-muted">TAMANHO DO TEXTO</label>
        <div className="flex gap-1.5">
          {TEXT_SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setTextSize(s.value)}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                textSize === s.value ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted hover:text-foreground-secondary"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-dim">Deixa o texto do app inteiro maior ou menor.</p>
      </div>

      <ToggleRow
        label="Reduzir movimento"
        description="Desliga animações e transições do app, mesmo se o seu sistema não pedir isso."
        checked={reduceMotion}
        onChange={setReduceMotion}
      />

      <ToggleRow
        label="Alto contraste"
        description="Deixa bordas e textos apagados mais fortes, mais fácil de enxergar."
        checked={highContrast}
        onChange={setHighContrast}
      />
    </div>
  );
}

function BatePapoTab() {
  const [ctrlEnter, setCtrlEnterState] = useState(false);

  useEffect(() => {
    setCtrlEnterState(localStorage.getItem(SEND_WITH_CTRL_ENTER_KEY) === "true");
  }, []);

  function handleToggle(v: boolean) {
    setCtrlEnterState(v);
    try {
      localStorage.setItem(SEND_WITH_CTRL_ENTER_KEY, String(v));
    } catch {
      // modo privado ou storage cheio — a escolha so nao sobrevive a um
      // recarregamento, sem quebrar nada
    }
  }

  return (
    <div className="space-y-4">
      <ToggleRow
        label="Enviar com Ctrl+Enter"
        description='Enter passa a só quebrar linha; Ctrl+Enter (ou Cmd+Enter no Mac) envia a mensagem.'
        checked={ctrlEnter}
        onChange={handleToggle}
      />
    </div>
  );
}

function NotificacoesTab() {
  const [messageSound, setMessageSoundState] = useState(true);
  const [callSound, setCallSoundState] = useState(true);

  useEffect(() => {
    setMessageSoundState(localStorage.getItem(SOUND_MESSAGES_KEY) !== "false");
    setCallSoundState(localStorage.getItem(SOUND_CALLS_KEY) !== "false");
  }, []);

  function handleToggleMessageSound(v: boolean) {
    setMessageSoundState(v);
    try {
      localStorage.setItem(SOUND_MESSAGES_KEY, String(v));
    } catch {
      // modo privado ou storage cheio — a escolha so nao sobrevive a um
      // recarregamento, sem quebrar nada
    }
  }

  function handleToggleCallSound(v: boolean) {
    setCallSoundState(v);
    try {
      localStorage.setItem(SOUND_CALLS_KEY, String(v));
    } catch {
      // idem
    }
  }

  return (
    <div className="space-y-4">
      <ToggleRow
        label="Som de mensagem"
        description="Toca um som quando chega uma mensagem nova em canal ou DM que você não está vendo."
        checked={messageSound}
        onChange={handleToggleMessageSound}
      />
      <ToggleRow
        label="Som de chamada"
        description="Toca um som ao entrar, sair, ou mutar/desmutar numa chamada de voz."
        checked={callSound}
        onChange={handleToggleCallSound}
      />
      <p className="text-xs text-dim">
        Pra silenciar um servidor, canal ou conversa específica, use o menu (⋯ ou ≡) dele — os interruptores aqui
        controlam o app inteiro.
      </p>
    </div>
  );
}

function AvancadoTab() {
  const desktop = isDesktopApp();
  const [hardwareAccel, setHardwareAccelState] = useState(true);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    setHardwareAccelState(localStorage.getItem("gameshare-hardware-accel") !== "false");
  }, []);

  function handleToggleHardwareAccel(v: boolean) {
    setHardwareAccelState(v);
    try {
      localStorage.setItem("gameshare-hardware-accel", String(v));
    } catch {
      // modo privado ou storage cheio — a escolha so nao sobrevive a um
      // recarregamento, sem quebrar nada
    }
    syncHardwareAccel(v);
    setNeedsRestart(true);
  }

  async function handleClearCache() {
    setClearing(true);
    setCleared(false);
    await clearCache();
    setClearing(false);
    setCleared(true);
    setTimeout(() => setCleared(false), 2500);
  }

  if (!desktop) {
    return (
      <ComingSoonTab
        title="Só no app de desktop"
        description="As opções avançadas de hoje só valem pra quem usa o GameShare instalado no Windows."
      />
    );
  }

  return (
    <div className="space-y-4">
      <ToggleRow
        label="Aceleração de hardware"
        description="Usa a placa de vídeo pra desenhar a interface. Desligue se a tela ficar riscada, travando ou piscando."
        checked={hardwareAccel}
        onChange={handleToggleHardwareAccel}
      />

      {needsRestart && (
        <div className="rounded-xl bg-elevated/60 p-3.5">
          <p className="text-sm text-foreground">Reinicie o app pra aplicar essa mudança.</p>
          <button
            onClick={restartAppOrReload}
            className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm font-bold text-white"
          >
            Reiniciar agora
          </button>
        </div>
      )}

      <div className="rounded-xl bg-elevated/60 p-3.5">
        <div className="text-sm font-bold text-foreground">Limpar cache</div>
        <div className="mt-0.5 text-xs text-dim">
          Apaga arquivos temporários guardados pelo app (imagens, páginas). Não mexe nas suas configurações nem te
          desconecta.
        </div>
        <button
          onClick={handleClearCache}
          disabled={clearing}
          className="mt-3 rounded-md bg-elevated px-3 py-1.5 text-sm font-bold text-foreground transition hover:bg-elevated-hover disabled:opacity-50"
        >
          {clearing ? "Limpando..." : cleared ? "Cache limpo!" : "Limpar agora"}
        </button>
      </div>
    </div>
  );
}

function ComingSoonTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-elevated/60 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
        <ClockIcon />
      </div>
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="max-w-[320px] text-xs text-dim">{description}</p>
    </div>
  );
}

// Nivel de RMS (0-1) considerado "bem alto" pra normalizar a barra visual —
// so uma referencia de escala, nao tem relacao com o limiar do gate.
const METER_REFERENCE_RMS = 0.35;

const SHORTCUT_LABELS: Record<keyof ShortcutBindings, string> = {
  muteToggle: "Mutar/desmutar microfone",
  deafenToggle: "Silenciar áudio geral",
  leaveCall: "Sair da chamada",
  pushToTalk: "Push-to-talk (segurar pra falar)",
};

// Transforma um KeyboardEvent do navegador num formato de acelerador do
// Electron ("CommandOrControl+Shift+V"), mesmo formato que
// registerGlobalShortcuts/parseAccelerator entendem em desktop/main.js.
function eventToAccelerator(e: React.KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey) mods.push("Alt");
  if (["Control", "Meta", "Shift", "Alt"].includes(e.key)) return null;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (mods.length === 0) return null;
  return [...mods, key].join("+");
}

function AtalhosTab() {
  const [shortcuts, setShortcutsState] = useState<ShortcutBindings>(DEFAULT_SHORTCUTS);
  const [capturing, setCapturing] = useState<keyof ShortcutBindings | null>(null);
  // So pra avisar quando a tecla apertada nao serve (ver eventToAccelerator)
  // -- sem isso, apertar so uma letra sem segurar Ctrl/Alt/Shift nao dava
  // erro nenhum nem mudava nada na tela, parecia que o campo tinha travado
  // (atalho global PRECISA de um modificador, senao capturaria toda letra
  // digitada em qualquer app do sistema).
  const [captureError, setCaptureError] = useState(false);
  const [overlayEnabled, setOverlayEnabledState] = useState(true);

  useEffect(() => {
    getShortcuts().then(setShortcutsState);
    setOverlayEnabledState(isOverlayEnabled());
  }, []);

  async function handleCapture(name: keyof ShortcutBindings, e: React.KeyboardEvent) {
    e.preventDefault();
    const accelerator = eventToAccelerator(e);
    if (!accelerator) {
      setCaptureError(true);
      return;
    }
    setCaptureError(false);
    const next = { ...shortcuts, [name]: accelerator };
    setShortcutsState(next);
    setCapturing(null);
    await setShortcuts(next);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-dim">
        Funcionam mesmo com outra janela (ex: um jogo) em foco. Clique num atalho e aperte a combinação desejada
        (precisa incluir Ctrl, Alt ou Shift).
      </p>
      {(Object.keys(SHORTCUT_LABELS) as (keyof ShortcutBindings)[]).map((name) => (
        <div key={name} className="flex items-center justify-between gap-3 rounded-xl bg-elevated/60 p-3.5">
          <span className="text-sm font-semibold text-foreground">{SHORTCUT_LABELS[name]}</span>
          <button
            type="button"
            onKeyDown={(e) => handleCapture(name, e)}
            onClick={() => {
              setCapturing(name);
              setCaptureError(false);
            }}
            onBlur={() => {
              setCapturing(null);
              setCaptureError(false);
            }}
            className={`min-w-[160px] rounded-lg border px-3 py-2 text-center text-xs font-bold transition ${
              capturing === name
                ? captureError
                  ? "border-danger bg-danger/10 text-danger"
                  : "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted hover:text-foreground-secondary"
            }`}
          >
            {capturing === name
              ? captureError
                ? "Precisa de Ctrl, Alt ou Shift"
                : "Pressione a combinação..."
              : shortcuts[name].replace("CommandOrControl", "Ctrl")}
          </button>
        </div>
      ))}

      <ToggleRow
        label="Sobreposição em jogo"
        description="Mostra quem está na call (foto, fala, mudo) por cima da tela do jogo."
        checked={overlayEnabled}
        onChange={(v) => {
          setOverlayEnabledState(v);
          setOverlayEnabled(v);
        }}
      />
    </div>
  );
}

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
  }, [
    settings.deviceId,
    settings.noiseSuppression,
    settings.noiseSuppressionModel,
    settings.echoCancellation,
    settings.autoGainControl,
  ]);

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
          Se o áudio ficar voltando ou com eco, você deve ter selecionado o dispositivo errado — escolha seu
          microfone de verdade na lista, não a saída de som do computador.
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
          className="gs-range w-full"
          style={{ "--range-progress": `${settings.sensitivity}%` } as React.CSSProperties}
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
              title="Sua voz só é transmitida quando o volume passa dessa marca"
            />
          </div>
          <p className="mt-1.5 text-xs text-dim">
            {monitorError ?? "Fale perto do microfone pra ver o nível captado. A linha branca mostra o volume mínimo pra sua voz passar."}
          </p>
        </div>
      </div>

      <ToggleRow
        label="Supressão de ruído"
        description="Reduz ruído de fundo (ventilador, teclado, etc)."
        checked={settings.noiseSuppression}
        onChange={(v) => update({ noiseSuppression: v })}
      />
      {settings.noiseSuppression && (
        <div className="rounded-xl bg-elevated/60 p-3.5">
          <div className="text-sm font-bold text-foreground">Modelo de supressão de ruído</div>
          <div className="mt-0.5 text-xs text-dim">
            "Avançado" usa um modelo treinado pra reconhecer voz — separa melhor de ruído de teclado e afins do que o
            padrão, mas gasta um pouco mais de processamento.
          </div>
          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={() => update({ noiseSuppressionModel: "browser" })}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                settings.noiseSuppressionModel === "browser"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted hover:text-foreground-secondary"
              }`}
            >
              Padrão
            </button>
            <button
              type="button"
              onClick={() => update({ noiseSuppressionModel: "rnnoise" })}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                settings.noiseSuppressionModel === "rnnoise"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted hover:text-foreground-secondary"
              }`}
            >
              Avançado
            </button>
          </div>
        </div>
      )}
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
      {isDesktopApp() && isBetaEnabled() && (
        <ToggleRow
          label="Push-to-talk (beta)"
          description="Microfone começa mudo, só abre enquanto você segura o atalho (configure em Atalhos)."
          checked={settings.pushToTalkEnabled}
          onChange={(v) => update({ pushToTalkEnabled: v })}
        />
      )}
    </div>
  );
}

// Programa beta reformulado: sem instalador proprio nem download nenhum
// (o sistema anterior fazia isso e quebrou repetidas vezes) -- so um
// interruptor local (guardado no localStorage desse navegador/computador,
// sem rota de API) que libera acesso a RECURSOS que ainda estao em teste
// dentro do proprio app de sempre, atualizado pelo auto-update padrao. Hoje
// isso e so o Liquid Glass (ver AparenciaTab) -- os outros recursos que
// passaram por aqui ja viraram oficiais pra todo mundo. Como o Liquid Glass
// so e lido uma vez, no inicio, ligar/desligar pede um reinicio (recarregar
// a pagina, no navegador comum) pra aplicar de forma limpa -- nao forca na
// hora, ja que a pessoa pode estar no meio de uma chamada.
function BetaTab() {
  const [allowed, setAllowed] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);
  const desktop = isDesktopApp();

  useEffect(() => {
    setAllowed(localStorage.getItem(BETA_STORAGE_KEY) === "true");
  }, []);

  function handleToggle(v: boolean) {
    setAllowed(v);
    try {
      localStorage.setItem(BETA_STORAGE_KEY, String(v));
    } catch {
      // modo privado ou storage cheio — a escolha so nao sobrevive a um
      // recarregamento, sem quebrar nada
    }
    setNeedsRestart(true);
  }

  return (
    <div className="space-y-4">
      <ToggleRow
        label="Permitir versões beta"
        description="Libera acesso a recursos que ainda estão em teste, antes de virarem oficiais pra todo mundo."
        checked={allowed}
        onChange={handleToggle}
      />

      {needsRestart && (
        <div className="rounded-xl bg-elevated/60 p-3.5">
          <p className="text-sm text-foreground">
            {desktop ? "Reinicie o app pra aplicar essa mudança." : "Recarregue a página pra aplicar essa mudança."}
          </p>
          <button
            onClick={restartAppOrReload}
            className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm font-bold text-white"
          >
            {desktop ? "Reiniciar agora" : "Recarregar agora"}
          </button>
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
  // Checkbox desenhado na mao (nao o <input type="checkbox"> nativo) --
  // cada navegador/SO estiliza o nativo de um jeito bem diferente, mesmo
  // com accent-color (quadrado fino e sem graca no Windows, arredondado e
  // roxo bonito no iOS) — assim fica sempre identico em qualquer lugar. O
  // input em si continua ali, so invisivel (sr-only), pra manter foco por
  // teclado e leitor de tela funcionando normalmente.
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl bg-elevated/60 p-3.5">
      <div>
        <div className="text-sm font-bold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs text-dim">{description}</div>
      </div>
      <span className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-[7px] border-2 transition active:scale-90 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 ${
            checked ? "border-primary bg-primary" : "border-border"
          }`}
        >
          {checked && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </span>
      </span>
    </label>
  );
}

function SegurancaTab() {
  return (
    <div className="space-y-8">
      <PasswordSection />
      <div className="border-t border-overlay pt-6">
        <h3 className="mb-1 text-sm font-bold text-foreground">Email</h3>
        <EmailSection />
      </div>
      <div className="border-t border-overlay pt-6">
        <h3 className="mb-1 text-sm font-bold text-foreground">Telefone</h3>
        <PhoneSection />
      </div>
      <div className="border-t border-overlay pt-6">
        <h3 className="mb-1 text-sm font-bold text-foreground">Controle parental</h3>
        <ParentalControlSection />
      </div>
    </div>
  );
}

type PwStep = "form" | "code";

// Definir senha (conta so-Google) ou trocar (ja tem uma) — os dois casos
// sempre passam por um codigo enviado por email antes de valer, mesma
// logica do login por senha.
function PasswordSection() {
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

type EmailStep = "form" | "code";

// Troca de email -- mesma logica de "codigo sempre" da senha, so
// que o codigo vai pro email NOVO (nao o atual): prova que a pessoa tem
// acesso a ele antes da troca valer, em vez de so confiar no que foi
// digitado.
function EmailSection() {
  const { data: session, update } = useSession();
  const currentEmail = session?.user?.email ?? "";

  const [step, setStep] = useState<EmailStep>("form");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function requestChange(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    const res = await fetch(apiUrl("/api/auth/email/change-request"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail }),
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
    const res = await fetch(apiUrl("/api/auth/email/change-confirm"), {
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
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <CheckIcon />
        </div>
        <p className="text-sm font-bold text-foreground">Email alterado!</p>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={confirmChange} className="space-y-4">
        <p className="text-xs text-dim">Enviamos um código de 6 dígitos pro email novo ({newEmail}). Confirme pra aplicar a troca.</p>
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
      <p className="text-xs text-dim">Email atual: {currentEmail}</p>
      <div>
        <label className="mb-2 block text-xs font-bold tracking-wide text-muted">NOVO EMAIL</label>
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="voce@exemplo.com"
          className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
        />
        <p className="mt-1.5 text-xs text-dim">Vamos mandar um código de confirmação pra esse endereço antes de trocar.</p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={sending || !newEmail.trim()}
        className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {sending ? "Enviando..." : "Trocar email"}
      </button>
    </form>
  );
}

// Telefone -- opcional, sem verificacao nenhuma (diferente do
// email): so guardado pra eventualmente dar pra usar em suporte. Deixar em
// branco e salvar apaga.
function PhoneSection() {
  const { data: session, update } = useSession();
  const [phone, setPhone] = useState(session?.user?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const changed = phone !== (session?.user?.phone ?? "");

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    const res = await fetch(apiUrl("/api/user/profile"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível salvar.");
      return;
    }
    await update();
    setSaved(true);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-dim">
        Opcional, só usado pra suporte se a gente precisar entrar em contato. Não aparece pra outros usuários.
      </p>
      <input
        type="tel"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
          setSaved(false);
        }}
        placeholder="(00) 00000-0000"
        className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving || !changed}
        className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar telefone"}
      </button>
    </div>
  );
}

type ParentalStep = "form" | "code";

// Ativa/desativa o controle parental. So daqui pra frente (nao mexe em
// servidor/amizade que a conta ja tinha) -- ver contexto completo em
// prisma/schema.prisma no campo parentalControlEnabled. Ativar pede so o
// codigo (email do responsavel) + a senha de remocao que ele cria nessa
// hora; desativar pede as DUAS coisas de novo (codigo novo + a mesma
// senha) -- nunca so uma.
function ParentalControlSection() {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [parentEmail, setParentEmail] = useState<string | null>(null);

  const [step, setStep] = useState<ParentalStep>("form");
  const [emailInput, setEmailInput] = useState("");
  const [code, setCode] = useState("");
  const [removalPassword, setRemovalPassword] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"activated" | "deactivated" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(apiUrl("/api/parental/status"), { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      setLoadingStatus(false);
      setEnabled(Boolean(data.enabled));
      setParentEmail(data.parentEmail ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function requestActivation(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    const res = await fetch(apiUrl("/api/parental/setup-request"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentEmail: emailInput }),
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

  async function confirmActivation(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    const res = await fetch(apiUrl("/api/parental/setup-confirm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, code, removalPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Código inválido.");
      return;
    }
    setEnabled(true);
    setParentEmail(data.parentEmail ?? emailInput);
    setDone("activated");
  }

  async function requestRemoval() {
    setError("");
    setSending(true);
    const res = await fetch(apiUrl("/api/parental/removal-request"), { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível continuar.");
      return;
    }
    setTicketId(data.ticketId);
    setStep("code");
  }

  async function confirmRemoval(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    const res = await fetch(apiUrl("/api/parental/removal-confirm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, code, removalPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Código ou senha incorretos.");
      return;
    }
    setEnabled(false);
    setParentEmail(null);
    setDone("deactivated");
  }

  if (loadingStatus) return <p className="text-sm text-dim">Carregando...</p>;

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <CheckIcon />
        </div>
        <p className="text-sm font-bold text-foreground">
          {done === "activated" ? "Controle parental ativado!" : "Controle parental desativado!"}
        </p>
      </div>
    );
  }

  // Ligado, ainda nao pediu pra desativar
  if (enabled && step === "form") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-dim">
          Ativo — responsável: <span className="font-semibold text-foreground">{parentEmail}</span>. Entrar num
          servidor novo ou aceitar um pedido de amizade novo agora pede autorização por email.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          onClick={requestRemoval}
          disabled={sending}
          className="h-11 w-full rounded-xl border border-danger text-sm font-bold text-danger transition hover:bg-danger/10 disabled:opacity-50"
        >
          {sending ? "Enviando..." : "Desativar controle parental"}
        </button>
      </div>
    );
  }

  // Ligado, pediu pra desativar -- confirma com codigo NOVO + a mesma senha de remocao
  if (enabled && step === "code") {
    return (
      <form onSubmit={confirmRemoval} className="space-y-4">
        <p className="text-xs text-dim">
          Enviamos um código de 6 dígitos pro email do responsável ({parentEmail}). Digite ele e a senha de remoção
          criada na ativação pra desativar.
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          placeholder="000000"
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-center text-lg font-bold tracking-[0.3em] outline-none focus:border-primary"
        />
        <div>
          <label className="mb-2 block text-xs font-bold tracking-wide text-muted">SENHA DE REMOÇÃO</label>
          <input
            type="password"
            value={removalPassword}
            onChange={(e) => setRemovalPassword(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={sending || code.length !== 6 || !removalPassword}
          className="h-11 w-full rounded-xl bg-danger text-sm font-bold text-white transition hover:bg-danger-hover disabled:opacity-50"
        >
          {sending ? "Confirmando..." : "Confirmar desativação"}
        </button>
      </form>
    );
  }

  // Desligado, ainda nao pediu ativacao
  if (step === "form") {
    return (
      <form onSubmit={requestActivation} className="space-y-4">
        <p className="text-xs text-dim">
          Restringe essa conta: entrar num servidor novo ou aceitar um pedido de amizade novo passa a exigir
          autorização por código enviado pro email do responsável.
        </p>
        <div>
          <label className="mb-2 block text-xs font-bold tracking-wide text-muted">EMAIL DO RESPONSÁVEL</label>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="responsavel@exemplo.com"
            className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={sending || !emailInput.trim()}
          className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {sending ? "Enviando..." : "Ativar controle parental"}
        </button>
      </form>
    );
  }

  // Desligado, codigo ja pedido -- confirma codigo + cria a senha de remocao
  return (
    <form onSubmit={confirmActivation} className="space-y-4">
      <p className="text-xs text-dim">
        Enviamos um código de 6 dígitos pro email do responsável ({emailInput}). O responsável também cria agora uma
        senha, exigida pra remover o controle parental depois.
      </p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        placeholder="000000"
        className="h-12 w-full rounded-xl border border-border bg-background px-4 text-center text-lg font-bold tracking-[0.3em] outline-none focus:border-primary"
      />
      <div>
        <label className="mb-2 block text-xs font-bold tracking-wide text-muted">CRIAR SENHA DE REMOÇÃO</label>
        <input
          type="password"
          value={removalPassword}
          onChange={(e) => setRemovalPassword(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
        />
        <p className="mt-1.5 text-xs text-dim">Mínimo 8 caracteres. Só o responsável deve saber essa senha.</p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={sending || code.length !== 6 || removalPassword.length < 8}
        className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {sending ? "Confirmando..." : "Confirmar ativação"}
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

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
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
