const { app, BrowserWindow, shell, dialog, Notification, ipcMain, desktopCapturer } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

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
  "1.0.5": {
    version: "1.0.5",
    title: "Audio do sistema sem eco",
    intro: "Corrigido o eco que rolava ao compartilhar a tela inteira com audio do sistema:",
    sections: [
      {
        heading: "Compartilhamento de tela",
        items: [
          "Nova opcao 'Tudo, menos a chamada': grava jogos, musica e video normalmente, mas exclui so a propria chamada de voz — sem eco pra quem esta ligado.",
          "Audio do sistema agora e sempre uma escolha explicita (desligado por padrao), com aviso claro do risco de eco em cada opcao.",
        ],
      },
    ],
  },
  "1.0.4": {
    version: "1.0.4",
    title: "Compartilhamento de tela nativo",
    intro: "Agora o compartilhamento de tela roda por dentro do proprio app, sem depender do navegador:",
    sections: [
      {
        heading: "Compartilhamento de tela",
        items: [
          "Escolha entre compartilhar a tela inteira ou so a janela de um app/jogo especifico.",
          "Selecao de qualidade: 720p, 1080p ou 1440p.",
          "Selecao de taxa de quadros: 30 ou 60 FPS.",
        ],
      },
    ],
  },
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

// Lista telas e janelas/apps abertos pro seletor de compartilhamento de
// tela do site (ver src/components/call/ScreenShareSourcePicker.tsx). As
// miniaturas vem como NativeImage e precisam virar data URL pra atravessar
// o IPC — nao da pra mandar o objeto original.
ipcMain.handle("screen-share:get-sources", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      type: source.id.startsWith("screen:") ? "screen" : "window",
      thumbnail: source.thumbnail.isEmpty() ? null : source.thumbnail.toDataURL(),
      appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
    }));
  } catch (err) {
    log.error("Erro ao listar fontes de tela:", err);
    return [];
  }
});

function getLoopbackHelperPath() {
  const fileName = "loopback_helper.exe";
  return app.isPackaged ? path.join(process.resourcesPath, fileName) : path.join(__dirname, fileName);
}

let loopbackProc = null;

function stopLoopbackCapture() {
  if (loopbackProc) {
    loopbackProc.kill();
    loopbackProc = null;
  }
}

// Compartilhamento de tela com "audio do sistema, menos a propria
// chamada": spawna um processo separado (loopback_helper.exe, compilado a
// parte — ver desktop/native/loopback-helper) que usa a API de
// process-loopback do Windows pra gravar tudo que esta tocando EXCETO o
// que o proprio GameShare esta tocando (a voz de quem esta na chamada).
// Sem isso, o audio do sistema capturado inclui a propria chamada de
// volta, causando eco pra quem esta ligado. Processo separado (nao um
// addon nativo do Node) de proposito: se ele travar ou o Windows for
// antigo demais pra suportar, so essa funcao falha — o app principal e a
// chamada de voz continuam normais.
const LOOPBACK_HEADER_SIZE = 16;

ipcMain.handle("screen-share:start-system-audio-exclude-self", (event) => {
  return new Promise((resolve) => {
    stopLoopbackCapture();

    const helperPath = getLoopbackHelperPath();
    if (!fs.existsSync(helperPath)) {
      log.warn("loopback_helper.exe nao encontrado em", helperPath);
      resolve({ ok: false, reason: "helper-not-found" });
      return;
    }

    const proc = spawn(helperPath, [String(process.pid)], { windowsHide: true });
    loopbackProc = proc;

    let headerBuffer = Buffer.alloc(0);
    let headerChecked = false;
    let settled = false;

    const timeoutId = setTimeout(() => settle({ ok: false, reason: "timeout" }), 4000);
    function settle(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    }

    proc.stdout.on("data", (chunk) => {
      if (!headerChecked) {
        headerBuffer = Buffer.concat([headerBuffer, chunk]);
        if (headerBuffer.length < LOOPBACK_HEADER_SIZE) return;
        const header = headerBuffer.subarray(0, LOOPBACK_HEADER_SIZE);
        const rest = headerBuffer.subarray(LOOPBACK_HEADER_SIZE);
        headerChecked = true;
        if (header.toString("ascii", 0, 4) !== "GSL1") {
          settle({ ok: false, reason: "bad-header" });
          proc.kill();
          return;
        }
        settle({ ok: true });
        if (rest.length > 0 && !event.sender.isDestroyed()) {
          event.sender.send("screen-share:audio-chunk", rest);
        }
        return;
      }
      if (!event.sender.isDestroyed()) {
        event.sender.send("screen-share:audio-chunk", chunk);
      }
    });

    proc.stderr.on("data", (chunk) => {
      log.warn("loopback_helper:", chunk.toString("utf-8").trim());
    });

    proc.on("exit", (code) => {
      if (loopbackProc === proc) loopbackProc = null;
      settle({ ok: false, reason: `exited-${code}` });
    });

    proc.on("error", (err) => {
      log.error("Erro ao iniciar loopback_helper:", err);
      settle({ ok: false, reason: "spawn-error" });
    });
  });
});

ipcMain.on("screen-share:stop-system-audio-exclude-self", () => {
  stopLoopbackCapture();
});

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
      preload: path.join(__dirname, "main-preload.js"),
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
    stopLoopbackCapture();
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

// Processos filhos (child_process.spawn) nao morrem sozinhos so porque o
// pai saiu — sem isso o loopback_helper.exe podia ficar orfao rodando se o
// app fechasse de um jeito que nao passa por mainWindow.on("closed").
app.on("before-quit", stopLoopbackCapture);
