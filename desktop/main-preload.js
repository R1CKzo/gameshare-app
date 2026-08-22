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
  });
}
