const { contextBridge, ipcRenderer } = require("electron");

// So expoe a ponte se a pagina carregada for mesmo o nosso site — mesmo
// sendo raro (o main.js ja intercepta navegacao pra fora), evita que essa
// API fique acessivel se por algum motivo essa janela acabar carregando
// outra origem.
const ALLOWED_ORIGIN = "https://gameshare-app.vercel.app";

if (location.origin === ALLOWED_ORIGIN) {
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
    onSystemAudioChunk: (callback) => {
      const listener = (_event, chunk) => callback(chunk);
      ipcRenderer.on("screen-share:audio-chunk", listener);
      return () => ipcRenderer.removeListener("screen-share:audio-chunk", listener);
    },
  });
}
