const { contextBridge, ipcRenderer } = require("electron");

// So essa janela (a tela de novidades, que so carrega whats-new.html e
// nunca navega pra fora) recebe essa ponte — a janela principal, que
// carrega o site de verdade, nao tem preload nenhum, entao o site nunca
// tem acesso a IPC nenhum.
contextBridge.exposeInMainWorld("gameshareDesktop", {
  getChangelog: () => ipcRenderer.invoke("whats-new:get-changelog"),
  dismiss: (dontShowAgain) => ipcRenderer.send("whats-new:dismiss", dontShowAgain),
});
