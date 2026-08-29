const { contextBridge, ipcRenderer } = require("electron");

// Ponte minima da janela de splash -- so recebe o texto de status de cada
// etapa (verificando atualizacao, baixando, instalando, conectando), nunca
// manda nada de volta pro processo principal. Igual main-preload.js, so
// exposta se a pagina carregada for mesmo o splash.html local (nunca
// conteudo remoto).
contextBridge.exposeInMainWorld("gameshareSplash", {
  onStatus: (callback) => {
    const listener = (_event, text) => callback(text);
    ipcRenderer.on("splash:status", listener);
    return () => ipcRenderer.removeListener("splash:status", listener);
  },
});
