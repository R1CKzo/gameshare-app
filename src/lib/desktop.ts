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

export type BetaCheckResult =
  | { available: true; version: string; publishedAt: string; notes: string; downloadUrl: string }
  | { available: false };

export type BetaInstallResult = { ok: true } | { ok: false; error: string };

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
  // Programa beta (ver SettingsButton.tsx e desktop/main.js) — checa se
  // tem uma build beta publicada no GitHub e baixa/instala se a pessoa
  // confirmar. Sempre existe no app de desktop atual (nao e exclusivo da
  // janela de teste do app nativo, ao contrario dos 3 de cima).
  checkBetaBuild: () => Promise<BetaCheckResult>;
  downloadAndInstallBeta: (downloadUrl: string) => Promise<BetaInstallResult>;
  getAppVersion: () => Promise<string>;
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

// Liga/desliga o ponto vermelho de notificacao no icone da bandeja do
// sistema (ver GlobalNotificationListener) — no-op no navegador comum, ja
// que la nao tem bandeja nenhuma pra marcar.
export function setUnreadBadge(hasUnread: boolean): void {
  window.gameshareDesktop?.setUnreadBadge(hasUnread);
}

// Verifica se tem uma build beta publicada (ver desktop/main.js) — so faz
// sentido no app de desktop; no navegador nunca ha build beta pra baixar.
// Checa o METODO especifico (nao so window.gameshareDesktop) porque o site
// atualiza sozinho e na hora, mas o preload.js do app instalado so muda
// numa atualizacao nova do instalador — sem essa checagem, quem ainda esta
// numa versao mais antiga (sem esses metodos no preload) chamava undefined
// como funcao e quebrava o app inteiro (aconteceu em producao, ver
// [[feedback-...]] se isso virar licao permanente).
export function checkBetaBuild(): Promise<BetaCheckResult> {
  if (typeof window === "undefined" || !window.gameshareDesktop?.checkBetaBuild) {
    return Promise.resolve({ available: false });
  }
  return window.gameshareDesktop.checkBetaBuild();
}

export function downloadAndInstallBeta(downloadUrl: string): Promise<BetaInstallResult> {
  if (typeof window === "undefined" || !window.gameshareDesktop?.downloadAndInstallBeta) {
    return Promise.resolve({ ok: false, error: "Não foi possível baixar a versão beta agora." });
  }
  return window.gameshareDesktop.downloadAndInstallBeta(downloadUrl);
}

// Versao do instalador rodando agora — so usado pro selo "BETA" (ver
// UserPill.tsx). String vazia no navegador (nunca ha versao de instalador
// nenhuma la).
export function getAppVersion(): Promise<string> {
  if (typeof window === "undefined" || !window.gameshareDesktop?.getAppVersion) return Promise.resolve("");
  return window.gameshareDesktop.getAppVersion();
}
