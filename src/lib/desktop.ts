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
  startAppAudio: (hwnd: number) => Promise<StartSystemAudioResult>;
  stopAppAudio: () => void;
  onSystemAudioChunk: (callback: (chunk: ArrayBuffer) => void) => () => void;
  setUnreadBadge: (hasUnread: boolean) => void;
  getChannel: () => Promise<"stable" | "beta">;
  setChannel: (channel: "stable" | "beta") => Promise<"stable" | "beta">;
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

export function onSystemAudioChunk(callback: (chunk: ArrayBuffer) => void): () => void {
  if (typeof window === "undefined" || !window.gameshareDesktop) return () => {};
  return window.gameshareDesktop.onSystemAudioChunk(callback);
}

// Liga/desliga o ponto vermelho de notificacao no icone da bandeja do
// sistema (ver GlobalNotificationListener) — no-op no navegador comum, ja
// que la nao tem bandeja nenhuma pra marcar.
export function setUnreadBadge(hasUnread: boolean): void {
  window.gameshareDesktop?.setUnreadBadge(hasUnread);
}

// Trilha beta/estavel do app de desktop — so existe ali, o navegador comum
// so tem o site de producao mesmo. Trocar recarrega a janela do Electron
// pro endereco novo (ver channel:set em main.js), entao a troca em si volta
// pra tela de login do outro lado.
export function getChannel(): Promise<"stable" | "beta"> {
  if (typeof window === "undefined" || !window.gameshareDesktop) return Promise.resolve("stable");
  return window.gameshareDesktop.getChannel();
}

export function setChannel(channel: "stable" | "beta"): Promise<"stable" | "beta"> {
  if (typeof window === "undefined" || !window.gameshareDesktop) return Promise.resolve("stable");
  return window.gameshareDesktop.setChannel(channel);
}
