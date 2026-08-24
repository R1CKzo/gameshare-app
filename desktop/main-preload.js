const { contextBridge, ipcRenderer } = require("electron");

// So expoe a ponte se a pagina carregada for mesmo um dos nossos sites
// (producao ou o beta, deploy separado do branch "beta" — ver getAppUrl em
// main.js) — mesmo sendo raro (o main.js ja intercepta navegacao pra
// fora), evita que essa API fique acessivel se por algum motivo essa
// janela acabar carregando outra origem.
const ALLOWED_ORIGINS = ["https://gameshare-app.vercel.app", "https://gameshare-beta.vercel.app"];

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

    // Trilha beta/estavel — qual dos dois sites o app abre. Trocar recarrega
    // a janela pro endereco novo (ver channel:set em main.js), entao pede
    // login de novo do outro lado.
    getChannel: () => ipcRenderer.invoke("channel:get"),
    setChannel: (channel) => ipcRenderer.invoke("channel:set", channel),
  });
}
