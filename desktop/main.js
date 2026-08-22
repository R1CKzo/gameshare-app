const { app, BrowserWindow, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");

const APP_URL = "https://gameshare-app.vercel.app";

// O Electron manda "Electron/x.x.x" no user agent por padrao, e o login do
// Google bloqueia (erro "disallowed_useragent") qualquer navegador
// embutido que se identifique assim, mesmo rodando o mesmo Chromium por
// baixo. Anunciar como um Chrome desktop comum resolve — e exatamente o
// mesmo motor de renderizacao, so o texto do user agent que muda.
const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: "GameShare",
    icon: path.join(__dirname, "build", "icon.ico"),
    backgroundColor: "#08090d",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setUserAgent(DESKTOP_CHROME_UA);
  mainWindow.loadURL(APP_URL);

  // Links que abririam numa aba nova (convite copiado, "abrir em outra
  // guia" etc) vao pro navegador de verdade, nao numa segunda janela do
  // app — igual o Discord faz.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Checa atualizacao toda vez que o app abre. Se tiver uma versao nova
// publicada nos Releases do GitHub, baixa sozinho e pergunta se pode
// reiniciar pra aplicar — sem precisar reinstalar manualmente.
function setupAutoUpdate() {
  autoUpdater.autoDownload = true;

  autoUpdater.on("update-downloaded", (info) => {
    if (!mainWindow) return;
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Atualizacao pronta",
        message: `Uma nova versao do GameShare (${info.version}) foi baixada.`,
        detail: "Reinicie o app pra aplicar a atualizacao.",
        buttons: ["Reiniciar agora", "Depois"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("Erro ao checar atualizacoes:", err);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.error("Erro ao checar atualizacoes:", err);
  });
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdate();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
