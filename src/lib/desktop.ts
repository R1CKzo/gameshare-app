// Ponte com o app de desktop (Electron). So existe quando o site esta
// rodando dentro do app instalado — no navegador comum, "gameshareDesktop"
// nunca e definido, entao todo o compartilhamento de tela nativo fica
// automaticamente indisponivel la (a mesma logica que "desativa" a feature
// no site: sem a ponte, so sobra a opcao desabilitada na UI).
export type ScreenSourceType = "screen" | "window";

export type ScreenSource = {
  id: string;
  name: string;
  type: ScreenSourceType;
  thumbnail: string | null;
  appIcon: string | null;
};

export type StartSystemAudioResult = { ok: true } | { ok: false; reason: string };

export type PatchCheckResult = { available: true; downloadUrl: string } | { available: false };
export type PatchInstallResult = { ok: true } | { ok: false; error: string };

type GameshareDesktopBridge = {
  isDesktop: true;
  getScreenSources: () => Promise<ScreenSource[]>;
  startSystemAudioExcludingSelf: () => Promise<StartSystemAudioResult>;
  stopSystemAudioExcludingSelf: () => void;
  startAppAudio: (hwnd: number) => Promise<StartSystemAudioResult>;
  stopAppAudio: () => void;
  // Cada pedaco de PCM cruza o IPC do Electron duas vezes (processo
  // principal -> preload -> mundo principal via contextBridge) -- em
  // todas as travessias, um Buffer do Node vira um Uint8Array puro do
  // outro lado, nunca um ArrayBuffer (ver o comentario em useVoiceMesh.ts
  // onde isso e consumido).
  onSystemAudioChunk: (callback: (chunk: Uint8Array) => void) => () => void;
  setUnreadBadge: (hasUnread: boolean) => void;
  // So existe na janela do app de desktop EMBUTIDO (ver desktop-ui/), que
  // roda numa origem diferente da API e por isso usa token em vez de
  // cookie -- indefinido tanto no navegador quanto no app de desktop atual
  // (que ainda carrega a pagina ao vivo, com cookie normal). Ver
  // desktop-ui/shims/next-auth-react.tsx.
  getAuthToken?: () => Promise<string | null>;
  startLogin?: () => Promise<{ ok: boolean; error?: string }>;
  clearAuthToken?: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  // Reinicia o app -- usado ao ligar/desligar "Permitir versoes beta" (ver
  // SettingsButton.tsx), pra carregar (ou parar de carregar) os recursos
  // em teste de forma limpa.
  restartApp?: () => void;
  // Correcoes sem trocar de versao (ver main.js e UserPill.tsx) -- checa
  // se saiu uma build nova pra MESMA versao instalada e baixa/instala se
  // a pessoa confirmar.
  checkForPatch?: () => Promise<PatchCheckResult>;
  downloadAndInstallPatch?: () => Promise<PatchInstallResult>;
  // Aceleracao de hardware (ver AvancadoTab em SettingsButton.tsx) -- so
  // faz efeito depois de reiniciar o app.
  syncHardwareAccel?: (enabled: boolean) => void;
  // Limpa so o cache HTTP do app (ver AvancadoTab) -- nao mexe em
  // localStorage/cookies.
  clearCache?: () => Promise<boolean>;
  // Controles da janela desenhados na propria pagina (ver
  // DesktopTitleBar.tsx) -- so tem efeito de verdade quando a janela nasceu
  // sem moldura nativa (ver createWindow em main.js).
  minimizeWindow?: () => void;
  toggleMaximizeWindow?: () => void;
  closeWindow?: () => void;
  isWindowMaximized?: () => Promise<boolean>;
  onWindowMaximizedChanged?: (callback: (isMaximized: boolean) => void) => () => void;
  // Atalhos globais (Configuracoes > Atalhos, beta) -- ver
  // registerGlobalShortcuts em main.js. name e "mute-toggle" |
  // "deafen-toggle" | "leave-call" | "ptt-down" | "ptt-up".
  onShortcut?: (name: string, callback: () => void) => () => void;
  getShortcuts?: () => Promise<ShortcutBindings>;
  setShortcuts?: (shortcuts: ShortcutBindings) => Promise<ShortcutBindings>;
  // Deteccao de jogo (beta) -- ver startGameDetection em main.js. gameName
  // e o nome bonito (lista curada) ou null.
  onActivityChanged?: (callback: (gameName: string | null) => void) => () => void;
};

export type ShortcutBindings = {
  muteToggle: string;
  deafenToggle: string;
  leaveCall: string;
  pushToTalk: string;
};

export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  muteToggle: "CommandOrControl+Shift+M",
  deafenToggle: "CommandOrControl+Shift+S",
  leaveCall: "CommandOrControl+Shift+L",
  pushToTalk: "CommandOrControl+Shift+V",
};

declare global {
  interface Window {
    gameshareDesktop?: GameshareDesktopBridge;
  }
}

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.gameshareDesktop?.isDesktop);
}

export function getScreenSources(): Promise<ScreenSource[]> {
  if (typeof window === "undefined" || !window.gameshareDesktop) return Promise.resolve([]);
  return window.gameshareDesktop.getScreenSources();
}

// Pede pro app nativo capturar o audio do sistema EXCLUINDO so o que o
// proprio GameShare esta tocando (a chamada de voz) — evita o eco de
// compartilhar a tela inteira com audio do sistema (ver
// desktop/native/loopback-helper). So funciona no app desktop e so a
// partir do Windows 10 build 20348; se a ativacao falhar por qualquer
// motivo (Windows antigo, driver de audio, etc.), devolve ok:false e quem
// chamou decide o que fazer (deixar sem audio de sistema, ou oferecer o
// modo "tudo incluindo a chamada" como alternativa manual).
export function startSystemAudioExcludingSelf(): Promise<StartSystemAudioResult> {
  if (typeof window === "undefined" || !window.gameshareDesktop) {
    return Promise.resolve({ ok: false, reason: "not-desktop" });
  }
  return window.gameshareDesktop.startSystemAudioExcludingSelf();
}

export function stopSystemAudioExcludingSelf(): void {
  window.gameshareDesktop?.stopSystemAudioExcludingSelf();
}

// Extrai o HWND do id que getScreenSources devolve pra uma fonte do tipo
// "window" (formato "window:<hwnd>:<indice>", especifico do Windows).
export function parseWindowHandle(sourceId: string): number | null {
  const match = /^window:(\d+):\d+$/.exec(sourceId);
  return match ? Number(match[1]) : null;
}

// Pede pro app nativo capturar SO o audio do app/jogo dono da janela
// escolhida (modo "include", oposto do exclude acima) — usado quando a
// pessoa compartilha uma janela especifica em vez da tela inteira.
export function startAppAudio(hwnd: number): Promise<StartSystemAudioResult> {
  if (typeof window === "undefined" || !window.gameshareDesktop) {
    return Promise.resolve({ ok: false, reason: "not-desktop" });
  }
  return window.gameshareDesktop.startAppAudio(hwnd);
}

export function stopAppAudio(): void {
  window.gameshareDesktop?.stopAppAudio();
}

export function onSystemAudioChunk(callback: (chunk: Uint8Array) => void): () => void {
  if (typeof window === "undefined" || !window.gameshareDesktop) return () => {};
  return window.gameshareDesktop.onSystemAudioChunk(callback);
}

// Atalhos globais (beta) -- ver ActiveCallProvider.tsx, unico lugar que
// assina isso, so quando isBetaEnabled().
export function onShortcut(
  name: "mute-toggle" | "deafen-toggle" | "leave-call" | "ptt-down" | "ptt-up",
  callback: () => void
): () => void {
  if (typeof window === "undefined" || !window.gameshareDesktop?.onShortcut) return () => {};
  return window.gameshareDesktop.onShortcut(name, callback);
}

export function getShortcuts(): Promise<ShortcutBindings> {
  if (typeof window === "undefined" || !window.gameshareDesktop?.getShortcuts) {
    return Promise.resolve(DEFAULT_SHORTCUTS);
  }
  return window.gameshareDesktop.getShortcuts();
}

export function setShortcuts(shortcuts: ShortcutBindings): Promise<ShortcutBindings> {
  if (typeof window === "undefined" || !window.gameshareDesktop?.setShortcuts) {
    return Promise.resolve(shortcuts);
  }
  return window.gameshareDesktop.setShortcuts(shortcuts);
}

export function onActivityChanged(callback: (gameName: string | null) => void): () => void {
  if (typeof window === "undefined" || !window.gameshareDesktop?.onActivityChanged) return () => {};
  return window.gameshareDesktop.onActivityChanged(callback);
}

// Liga/desliga o ponto vermelho de notificacao no icone da bandeja do
// sistema (ver GlobalNotificationListener) — no-op no navegador comum, ja
// que la nao tem bandeja nenhuma pra marcar.
export function setUnreadBadge(hasUnread: boolean): void {
  window.gameshareDesktop?.setUnreadBadge(hasUnread);
}

// Versao do instalador rodando agora — so usado pro selo "BETA" (ver
// UserPill.tsx). String vazia no navegador (nunca ha versao de instalador
// nenhuma la).
export function getAppVersion(): Promise<string> {
  if (typeof window === "undefined" || !window.gameshareDesktop?.getAppVersion) return Promise.resolve("");
  return window.gameshareDesktop.getAppVersion();
}

// Reinicia o app de desktop (ou recarrega a pagina no navegador comum) —
// usado ao ligar/desligar "Permitir versoes beta" nas Configuracoes, pra
// carregar (ou parar de carregar) os recursos em teste de forma limpa.
// Checa o METODO especifico (nao so window.gameshareDesktop) porque o
// site atualiza sozinho e na hora, mas o preload.js do app instalado so
// muda numa atualizacao nova do instalador — quem ainda estiver numa
// versao mais antiga sem esse metodo cai no reload normal em vez de
// quebrar (ja aconteceu de um metodo novo faltando derrubar o app inteiro
// em producao, ver [[feedback-...]]).
export function restartAppOrReload(): void {
  if (typeof window === "undefined") return;
  if (window.gameshareDesktop?.restartApp) {
    window.gameshareDesktop.restartApp();
    return;
  }
  window.location.reload();
}

// Checa se saiu uma correcao nova pra MESMA versao ja instalada (ver
// main.js) -- so faz sentido no app de desktop; no navegador o site
// atualiza sozinho, na hora, sem nada disso. Checa o METODO especifico
// (nao so window.gameshareDesktop) porque quem ainda esta numa versao
// instalada mais antiga (sem esse metodo no preload) nao tem essa
// capacidade ainda -- cai em "nao disponivel" em vez de quebrar.
export function checkForPatch(): Promise<PatchCheckResult> {
  if (typeof window === "undefined" || !window.gameshareDesktop?.checkForPatch) {
    return Promise.resolve({ available: false });
  }
  return window.gameshareDesktop.checkForPatch();
}

// De proposito nao recebe nem repassa a URL de baixar -- o processo
// principal do Electron sempre deriva ela de novo sozinho (ver
// downloadAndInstallPatch em desktop/main.js) em vez de confiar numa URL
// vinda daqui (que rodaria dentro da propria pagina do site).
export function downloadAndInstallPatch(): Promise<PatchInstallResult> {
  if (typeof window === "undefined" || !window.gameshareDesktop?.downloadAndInstallPatch) {
    return Promise.resolve({ ok: false, error: "Não foi possível baixar a atualização agora." });
  }
  return window.gameshareDesktop.downloadAndInstallPatch();
}

// No-op no navegador comum ou em instalacao antiga demais pra ter esse
// metodo no preload.
export function syncHardwareAccel(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.gameshareDesktop?.syncHardwareAccel?.(enabled);
}

// false no navegador comum (nao tem cache nenhum do Electron pra limpar)
// ou em instalacao antiga demais pra ter esse metodo no preload.
export function clearCache(): Promise<boolean> {
  if (typeof window === "undefined" || !window.gameshareDesktop?.clearCache) return Promise.resolve(false);
  return window.gameshareDesktop.clearCache();
}

// Controles da janela desenhados na propria pagina (ver
// DesktopTitleBar.tsx) -- no-op no navegador comum ou em instalacao antiga
// demais pra ter esses metodos no preload.
export function minimizeWindow(): void {
  if (typeof window === "undefined") return;
  window.gameshareDesktop?.minimizeWindow?.();
}

export function toggleMaximizeWindow(): void {
  if (typeof window === "undefined") return;
  window.gameshareDesktop?.toggleMaximizeWindow?.();
}

export function closeWindow(): void {
  if (typeof window === "undefined") return;
  window.gameshareDesktop?.closeWindow?.();
}

export async function isWindowMaximized(): Promise<boolean> {
  if (typeof window === "undefined" || !window.gameshareDesktop?.isWindowMaximized) return false;
  return window.gameshareDesktop.isWindowMaximized();
}

// Devolve uma funcao de "parar de escutar" (ou um no-op se a ponte nao
// existir) -- mesmo formato do onSystemAudioChunk, pra sempre dar pra
// limpar no cleanup de um useEffect sem checar undefined toda vez.
export function onWindowMaximizedChanged(callback: (isMaximized: boolean) => void): () => void {
  if (typeof window === "undefined" || !window.gameshareDesktop?.onWindowMaximizedChanged) return () => {};
  return window.gameshareDesktop.onWindowMaximizedChanged(callback);
}
