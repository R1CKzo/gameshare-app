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

type GameshareDesktopBridge = {
  isDesktop: true;
  getScreenSources: () => Promise<ScreenSource[]>;
  startSystemAudioExcludingSelf: () => Promise<StartSystemAudioResult>;
  stopSystemAudioExcludingSelf: () => void;
  onSystemAudioChunk: (callback: (chunk: ArrayBuffer) => void) => () => void;
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

export function onSystemAudioChunk(callback: (chunk: ArrayBuffer) => void): () => void {
  if (typeof window === "undefined" || !window.gameshareDesktop) return () => {};
  return window.gameshareDesktop.onSystemAudioChunk(callback);
}
