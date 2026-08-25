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

    // Espelha o interruptor "Permitir versoes beta" num arquivo que o
    // processo principal consegue ler de forma sincrona no boot -- decide
    // se a janela nasce sem moldura nativa (ver createWindow em main.js e
    // DesktopTitleBar.tsx). So faz efeito depois de reiniciar o app.
    syncBetaTitlebarFlag: (enabled) => ipcRenderer.send("beta:sync-titlebar-flag", enabled),
  });
}
