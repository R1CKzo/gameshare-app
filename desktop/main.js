const { app, BrowserWindow, shell, dialog, Notification, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Log persistido em disco (%APPDATA%/GameShare/logs/main.log) — sem isso,
// qualquer erro no auto-updater só existiria no console de uma janela que
// ninguém está olhando, impossível de diagnosticar depois.
log.transports.file.level = "info";
autoUpdater.logger = log;

const APP_URL = "https://gameshare-app.vercel.app";

// Novidades de cada versao (mostradas uma vez, numa telinha, ao abrir o
// app depois de atualizar). So versoes com uma entrada aqui mostram a
// tela — se uma versao nao tiver nada digno de nota, so nao entra na
// lista e o app abre direto. A 1.0.3 junta tudo desde o lancamento porque
// e a primeira vez que essa tela existe.
const CHANGELOG = {
  "1.0.3": {
    version: "1.0.3",
    title: "Bem-vindo ao GameShare!",
    intro: "Essa e a primeira vez que essa tela aparece, entao aqui vai tudo que foi construido ate agora:",
    sections: [
      {
        heading: "Chamadas de voz e tela",
        items: [
          "Chat de voz em malha: todo mundo na sala se ouve diretamente, sem servidor de midia no meio.",
          "Barra de controle de chamada: mutar microfone, compartilhar tela e desligar.",
          "Anel visual ao redor do avatar de quem esta falando.",
          "Compartilhamento de tela sem cortar o audio da chamada.",
          "Configuracoes de audio: escolher qual microfone usar, ajustar sensibilidade com medidor ao vivo, supressao de ruido, cancelamento de eco e ganho automatico.",
        ],
      },
      {
        heading: "Perfil",
        items: ["Editar nickname e foto de perfil (a tag numerica #XXXXXX e permanente)."],
      },
      {
        heading: "Chat de texto",
        items: [
          "Mensagens de texto reais nos canais do servidor, com historico salvo.",
          "Entrega em tempo real — a mensagem aparece na hora pra quem esta com a pagina aberta.",
          "Mensagens agrupadas por autor, estilo Discord.",
        ],
      },
      {
        heading: "Aplicativo de desktop",
        items: [
          "Cliente de Windows instalavel, com a mesma interface do site.",
          "Login com Google funcionando de verdade (usa o navegador padrao do sistema).",
          "Atualizacao automatica: o app se atualiza sozinho, sem precisar baixar de novo no site.",
        ],
      },
    ],
  },
};

const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  } catch {
    return { dismissedChangelogVersions: [] };
  }
}

function saveSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (err) {
    log.error("Erro ao salvar settings.json:", err);
  }
}

// Marcar uma versao como "nao mostrar de novo" so vale pra ela mesma —
// uma atualizacao futura tem sua propria entrada no CHANGELOG e aparece
// normalmente, mesmo que uma versao anterior tenha sido dispensada.
function markChangelogDismissed(version) {
  const settings = loadSettings();
  if (!settings.dismissedChangelogVersions.includes(version)) {
    settings.dismissedChangelogVersions.push(version);
  }
  saveSettings(settings);
}

function isChangelogDismissed(version) {
  return loadSettings().dismissedChangelogVersions.includes(version);
}

// Janela pequena e separada so pra tela de novidades — nunca navega pra
// fora de whats-new.html, entao o preload dela (com acesso a IPC) nunca
// fica exposto ao site de verdade, que roda na janela principal sem
// preload nenhum.
function showWhatsNew(changelog) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 640,
      height: 680,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: "Novidades do GameShare",
      icon: path.join(__dirname, "build", "icon.ico"),
      backgroundColor: "#08090d",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "whats-new-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.loadFile(path.join(__dirname, "whats-new.html"));

    ipcMain.handleOnce("whats-new:get-changelog", () => changelog);

    function onDismiss(_event, dontShowAgain) {
      if (dontShowAgain) markChangelogDismissed(changelog.version);
      win.close();
    }
    ipcMain.on("whats-new:dismiss", onDismiss);

    win.on("closed", () => {
      ipcMain.removeListener("whats-new:dismiss", onDismiss);
      resolve();
    });
  });
}

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

// Checa atualizacao toda vez que o app abre (e depois, a cada 4h se ficar
// aberto). Se tiver uma versao nova publicada nos Releases do GitHub,
// baixa sozinho em segundo plano e pergunta se pode reiniciar pra aplicar
// — nunca precisa baixar/instalar manualmente de novo pelo site.
function setupAutoUpdate() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    log.info("Checando atualizacoes...");
  });

  autoUpdater.on("update-available", (info) => {
    log.info("Atualizacao encontrada:", info.version, "— baixando em segundo plano.");
    notify("Atualizando o GameShare", `Baixando a versao ${info.version}...`);
  });

  autoUpdater.on("update-not-available", () => {
    log.info("Ja esta na versao mais recente.");
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("Atualizacao baixada:", info.version);
    if (!mainWindow) return;
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Atualizacao pronta",
        message: `Uma nova versao do GameShare (${info.version}) foi baixada.`,
        detail: "Reinicie o app pra aplicar a atualizacao. Se voce so fechar o app normalmente, ela e aplicada sozinha na proxima vez que abrir.",
        buttons: ["Reiniciar agora", "Depois"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (err) => {
    log.error("Erro ao checar/baixar atualizacoes:", err);
  });

  function check() {
    autoUpdater.checkForUpdates().catch((err) => {
      log.error("Erro ao checar atualizacoes:", err);
    });
  }

  check();
  setInterval(check, 4 * 60 * 60 * 1000);
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, icon: path.join(__dirname, "build", "icon.ico") }).show();
}

// Enquanto a tela de novidades e a unica janela aberta, fechar ela NAO
// pode contar como "todas as janelas fecharam, sai do app" — senao o app
// se mata sozinho antes de chegar a abrir a janela principal.
let allowQuitOnAllClosed = false;

app.whenReady().then(async () => {
  const changelog = CHANGELOG[app.getVersion()];
  if (changelog && !isChangelogDismissed(changelog.version)) {
    await showWhatsNew(changelog);
  }

  createWindow();
  allowQuitOnAllClosed = true;
  setupAutoUpdate();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (!allowQuitOnAllClosed) return;
  if (process.platform !== "darwin") app.quit();
});
