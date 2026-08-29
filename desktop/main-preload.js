const { contextBridge, ipcRenderer } = require("electron");

// So expoe a ponte se a pagina carregada for mesmo o nosso site (ou, na
// janela de teste da Fase 2 do app nativo, a interface embutida servida
// pelo protocolo gameshare-app:// — ver main.js) — mesmo sendo raro (o
// main.js ja intercepta navegacao pra fora), evita que essa API fique
// acessivel se por algum motivo essa janela acabar carregando outra
// origem.
const ALLOWED_ORIGINS = ["https://gameshare-app.vercel.app", "gameshare-app://local"];

if (ALLOWED_ORIGINS.includes(location.origin)) {
  contextBridge.exposeInMainWorld("gameshareDesktop", {
    isDesktop: true,
    // Lista as telas e janelas/apps abertos (com miniatura de cada um) pro
    // seletor de compartilhamento de tela nativo do site — sem isso o site
    // so enxergaria a API generica getDisplayMedia, que o Electron nao
    // responde sozinho.
    getScreenSources: () => ipcRenderer.invoke("screen-share:get-sources"),

    // Audio do sistema "menos a propria chamada": pede pro processo
    // principal ativar a captura nativa (loopback_helper.exe) e devolve se
    // deu certo. Os pedaços de audio PCM chegam depois via onSystemAudioChunk
    // ate stopSystemAudioExcludingSelf ser chamado.
    startSystemAudioExcludingSelf: () => ipcRenderer.invoke("screen-share:start-system-audio-exclude-self"),
    stopSystemAudioExcludingSelf: () => ipcRenderer.send("screen-share:stop-system-audio-exclude-self"),

    // Audio de um app/jogo especifico: mesma captura nativa, mas em modo
    // "so esse processo" em vez de "tudo, menos esse processo". hwnd vem
    // do id que o getScreenSources devolve pra fontes do tipo "window"
    // ("window:<hwnd>:<indice>").
    startAppAudio: (hwnd) => ipcRenderer.invoke("screen-share:start-app-audio", hwnd),
    stopAppAudio: () => ipcRenderer.send("screen-share:stop-app-audio"),

    // Mesmo canal de audio pras duas capturas acima — so uma fica ativa
    // por vez (o processo principal sempre encerra a anterior antes de
    // comecar uma nova).
    onSystemAudioChunk: (callback) => {
      const listener = (_event, chunk) => callback(chunk);
      ipcRenderer.on("screen-share:audio-chunk", listener);
      return () => ipcRenderer.removeListener("screen-share:audio-chunk", listener);
    },

    // Liga/desliga o ponto vermelho de notificacao no icone da bandeja —
    // chamado pelo GlobalNotificationListener toda vez que o total de
    // notificacoes nao lidas do app muda.
    setUnreadBadge: (hasUnread) => ipcRenderer.send("badge:set", hasUnread),

    // So usado pela janela de teste da interface embutida (Fase 2 do
    // plano de app nativo) — le/inicia/apaga o token guardado com
    // safeStorage no processo principal (ver main.js). Indefinido na
    // janela principal de sempre, que ainda usa cookie.
    getAuthToken: () => ipcRenderer.invoke("auth:get-token"),
    startLogin: () => ipcRenderer.invoke("auth:start-login"),
    clearAuthToken: () => ipcRenderer.invoke("auth:clear-token"),

    getAppVersion: () => ipcRenderer.invoke("app:get-version"),

    // Reinicia o app (fecha e abre de novo sozinho) -- usado ao ligar/
    // desligar "Permitir versoes beta" nas Configuracoes, pra carregar (ou
    // parar de carregar) os recursos em teste de forma limpa (ver main.js).
    restartApp: () => ipcRenderer.send("app:restart"),

    // Correcoes sem trocar de versao (ver main.js) -- checa se saiu uma
    // build nova pra MESMA versao instalada e, se a pessoa confirmar,
    // baixa e abre o instalador.
    checkForPatch: () => ipcRenderer.invoke("patch:check"),
    downloadAndInstallPatch: () => ipcRenderer.invoke("patch:download-and-install"),

    // Espelha a aceleracao de hardware (Avancado nas Configuracoes) num
    // arquivo que o processo principal consegue ler de forma sincrona no
    // boot, porque so da pra ligar/desligar antes do Electron iniciar de
    // verdade. So faz efeito depois de reiniciar o app.
    syncHardwareAccel: (enabled) => ipcRenderer.send("hardware-accel:sync", enabled),

    // Limpar cache (Avancado nas Configuracoes) -- so o cache HTTP, nao
    // mexe em localStorage/cookies (nao desconecta nem apaga configuracao
    // nenhuma).
    clearCache: () => ipcRenderer.invoke("desktop:clear-cache"),

    // Controles da janela desenhados na propria pagina (ver
    // DesktopTitleBar.tsx) -- so tem efeito de verdade quando a janela
    // nasceu sem moldura nativa (ver createWindow em main.js).
    minimizeWindow: () => ipcRenderer.send("window:minimize"),
    toggleMaximizeWindow: () => ipcRenderer.send("window:toggle-maximize"),
    closeWindow: () => ipcRenderer.send("window:close"),
    isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onWindowMaximizedChanged: (callback) => {
      const listener = (_event, isMaximized) => callback(isMaximized);
      ipcRenderer.on("window:maximized-changed", listener);
      return () => ipcRenderer.removeListener("window:maximized-changed", listener);
    },

    // Atalhos globais (Configuracoes > Atalhos, beta) -- disparam mesmo
    // com outra janela (ex: um jogo) em foco, ver globalShortcut/uiohook
    // em main.js. name e "mute-toggle" | "deafen-toggle" | "leave-call" |
    // "ptt-down" | "ptt-up".
    onShortcut: (name, callback) => {
      const channel = `shortcut:${name}`;
      const listener = () => callback();
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
    getShortcuts: () => ipcRenderer.invoke("shortcuts:get"),
    setShortcuts: (shortcuts) => ipcRenderer.invoke("shortcuts:set", shortcuts),

    // Deteccao de jogo (beta) -- ver startGameDetection em main.js.
    // gameName e o nome bonito (lista curada) ou null (nenhum jogo
    // conhecido em foco).
    onActivityChanged: (callback) => {
      const listener = (_event, gameName) => callback(gameName);
      ipcRenderer.on("activity:changed", listener);
      return () => ipcRenderer.removeListener("activity:changed", listener);
    },

    // Sobreposicao em jogo (beta) -- ver createGameOverlayWindow em
    // main.js. show/hide sao chamados pela janela principal (quando entra/
    // sai de uma call); syncOverlayState tambem, pra empurrar quem esta
    // presente pra dentro da janela do overlay. onOverlayState e o que a
    // propria pagina /overlay usa pra receber esse estado.
    showOverlay: () => ipcRenderer.send("overlay:show"),
    hideOverlay: () => ipcRenderer.send("overlay:hide"),
    syncOverlayState: (state) => ipcRenderer.send("overlay:state", state),
    onOverlayState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("overlay:state", listener);
      return () => ipcRenderer.removeListener("overlay:state", listener);
    },
  });
}
