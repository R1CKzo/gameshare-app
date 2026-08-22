const { app, BrowserWindow, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const crypto = require("crypto");
const path = require("path");

const APP_URL = "https://gameshare-app.vercel.app";

// Deixa o user agent parecendo um Chrome desktop comum (o mesmo motor por
// baixo de qualquer forma) — ajuda em geral, mas NAO e o suficiente pra
// passar pelo login do Google: o Google bloqueia qualquer navegador
// embutido (Electron, CEF, WebView) que faca o OAuth dentro de si mesmo,
// nao importa o user agent. Por isso o login de verdade acontece no
// navegador padrao do usuario (ver startDesktopLogin abaixo), igual o
// VSCode/GitHub Desktop fazem.
const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

let mainWindow;
let loginPollInterval = null;

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

  // O login do Google (e qualquer navegacao pro fluxo de sign-in do
  // NextAuth) e barrado dentro da janela do Electron — intercepta antes
  // de navegar pra la e manda pro navegador de verdade do usuario.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.includes("accounts.google.com") || url.includes("/api/auth/signin")) {
      event.preventDefault();
      startDesktopLogin();
    }
  });

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

// Abre o login do Google no navegador padrao do usuario (fora do
// Electron, onde o Google aceita normalmente) e fica consultando o
// servidor ate a pessoa terminar o login por la. Quando terminar, troca o
// codigo por uma sessao de verdade navegando a propria janela do app pro
// endpoint de "finish" — o Set-Cookie da resposta gruda na sessao dessa
// janela, sem precisar mexer em cookies manualmente.
function startDesktopLogin() {
  if (loginPollInterval) return; // ja tem um login em andamento

  const code = crypto.randomBytes(16).toString("hex");

  mainWindow.loadFile(path.join(__dirname, "wait.html"));
  shell.openExternal(`${APP_URL}/desktop-login/${code}`);

  const startedAt = Date.now();
  loginPollInterval = setInterval(async () => {
    if (Date.now() - startedAt > 10 * 60 * 1000) {
      clearInterval(loginPollInterval);
      loginPollInterval = null;
      mainWindow?.loadURL(APP_URL);
      return;
    }

    try {
      const res = await fetch(`${APP_URL}/api/desktop-login/${code}`);
      const data = await res.json();

      if (data.status === "ready") {
        clearInterval(loginPollInterval);
        loginPollInterval = null;
        mainWindow?.loadURL(`${APP_URL}/api/desktop-login/${code}/finish`);
      } else if (data.status === "expired") {
        clearInterval(loginPollInterval);
        loginPollInterval = null;
        mainWindow?.loadURL(APP_URL);
      }
    } catch {
      // rede instavel — tenta de novo no proximo ciclo
    }
  }, 2000);
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
