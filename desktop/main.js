const { app, BrowserWindow, shell, dialog, Notification, ipcMain, desktopCapturer, Tray, Menu, nativeImage } = require("electron");
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

const STABLE_URL = "https://gameshare-app.vercel.app";
const BETA_URL = "https://gameshare-beta.vercel.app";

// Preferencia de trilha (estavel/beta) guardada em disco, fora da pasta de
// instalacao — sobrevive a atualizacoes do instalador. Decide tanto qual
// ENDERECO o app abre (o site beta e um deploy Vercel separado, do branch
// "beta") quanto qual TRILHA de instalador o auto-updater confere (ver
// applyUpdaterChannel abaixo) — a maioria das mudancas ainda e so de site
// e nao precisa de instalador novo nenhum, mas quando precisar (tipo a
// splash de inicializacao), um build "1.0.9-beta.1" so chega em quem
// tiver essa trilha ligada.
const channelFilePath = path.join(app.getPath("userData"), "channel.json");

function getChannel() {
  try {
    const data = JSON.parse(fs.readFileSync(channelFilePath, "utf-8"));
    return data.channel === "beta" ? "beta" : "stable";
  } catch {
    return "stable";
  }
}

function setChannel(channel) {
  const next = channel === "beta" ? "beta" : "stable";
  try {
    fs.writeFileSync(channelFilePath, JSON.stringify({ channel: next }));
  } catch (err) {
    log.error("Erro ao salvar a trilha (beta/estavel):", err);
  }
  return next;
}

function getAppUrl() {
  return getChannel() === "beta" ? BETA_URL : STABLE_URL;
}

// Faz o auto-updater conferir a trilha certa: "latest" (arquivo
// latest.yml, so releases estaveis) ou "beta" (beta.yml, so releases com
// versao tipo "1.0.9-beta.1" -- o electron-builder gera esse arquivo
// separado sozinho a partir do sufixo de prerelease na versao). Sem
// allowPrerelease, o electron-updater ignora releases marcados como
// prerelease mesmo na trilha beta.
function applyUpdaterChannel() {
  const onBeta = getChannel() === "beta";
  autoUpdater.channel = onBeta ? "beta" : "latest";
  autoUpdater.allowPrerelease = onBeta;
}

// So uma instancia por vez — sem isso, abrir o app de novo enquanto ele ja
// esta rodando minimizado na bandeja abriria um processo novo do zero em
// vez de so trazer a janela existente pra frente (igual o Discord faz).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
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

// Compartilhamento de tela com audio de um processo especifico: spawna um
// processo separado (loopback_helper.exe, compilado a parte — ver
// desktop/native/loopback-helper) que usa a API de process-loopback do
// Windows. Dois modos: "exclude" (grava tudo, menos um pid — nao usado
// pela UI atual, mas o helper ainda suporta) e "include-window" (grava so
// o app dono da janela escolhida — usado quando a pessoa compartilha um
// app/jogo especifico em vez da tela inteira). Processo separado (nao um
// addon nativo do Node) de proposito: se ele travar ou o Windows for
// antigo demais pra suportar, so essa funcao falha — o compartilhamento
// de tela continua, so sem audio.
const LOOPBACK_HEADER_SIZE = 16;

function startLoopbackCapture(event, helperArgs) {
  return new Promise((resolve) => {
    stopLoopbackCapture();

    const helperPath = getLoopbackHelperPath();
    if (!fs.existsSync(helperPath)) {
      log.warn("loopback_helper.exe nao encontrado em", helperPath);
      resolve({ ok: false, reason: "helper-not-found" });
      return;
    }

    const proc = spawn(helperPath, helperArgs, { windowsHide: true });
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
}

ipcMain.handle("screen-share:start-system-audio-exclude-self", (event) => {
  return startLoopbackCapture(event, ["exclude", String(process.pid)]);
});

ipcMain.handle("screen-share:start-app-audio", (event, hwnd) => {
  if (!Number.isInteger(hwnd) || hwnd <= 0) {
    return Promise.resolve({ ok: false, reason: "invalid-hwnd" });
  }
  return startLoopbackCapture(event, ["include-window", String(hwnd)]);
});

ipcMain.on("screen-share:stop-system-audio-exclude-self", () => {
  stopLoopbackCapture();
});

ipcMain.on("screen-share:stop-app-audio", () => {
  stopLoopbackCapture();
});

let mainWindow;
let splashWindow = null;
let loginPollInterval = null;
let tray = null;
let isQuitting = false;
let lastUnreadState = false;

// Splash de inicializacao (igual o Discord) -- so testando na trilha beta
// por enquanto (ver getChannel acima), pra nao mexer na experiencia de
// quem esta na estavel antes de confirmar que funciona bem. So aparece
// quando o app abre do zero (a janela principal so e recriada de verdade
// nesse caso -- fechar so esconde ela, ver mainWindow.on("close") abaixo),
// nunca ao reabrir pela bandeja.
function createSplashWindow() {
  const win = new BrowserWindow({
    width: 300,
    height: 340,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: true,
    skipTaskbar: true,
    backgroundColor: "#08090d",
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "splash.html"));
  return win;
}

function createWindow() {
  const showSplash = getChannel() === "beta";
  if (showSplash) splashWindow = createSplashWindow();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: "GameShare",
    icon: path.join(__dirname, "build", "icon.ico"),
    backgroundColor: "#08090d",
    autoHideMenuBar: true,
    show: !showSplash,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "main-preload.js"),
    },
  });

  mainWindow.webContents.setUserAgent(DESKTOP_CHROME_UA);
  mainWindow.loadURL(getAppUrl());

  if (showSplash) {
    let revealed = false;
    const revealMainWindow = () => {
      if (revealed) return;
      revealed = true;
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
      splashWindow = null;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
    };
    mainWindow.webContents.once("did-finish-load", revealMainWindow);
    // Se a pagina falhar ao carregar (rede fora, etc), mostra a janela
    // principal mesmo assim -- ela tem seu proprio jeito de lidar com isso,
    // bem melhor que deixar a pessoa presa numa splash pra sempre.
    mainWindow.webContents.once("did-fail-load", revealMainWindow);
    setTimeout(revealMainWindow, 15000);
  }

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

  // Clicar no X so esconde a janela (fica rodando na bandeja, igual o
  // Discord) — o app so encerra de verdade pelo "Sair" no menu da bandeja.
  // Sem isso, fechar a janela por engano tambem derrubava qualquer chamada
  // de voz em andamento.
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    stopLoopbackCapture();
  });

  // Se a janela foi recriada (raro — so acontece se ela chegou a ser
  // destruida de verdade) enquanto ja tinha notificacao nao lida, reaplica
  // o ponto na barra de tarefas dela; senao ele ficaria sem, mesmo com o
  // icone da bandeja ainda mostrando o aviso.
  if (lastUnreadState) setUnreadBadge(true);
}

// Duas variantes do icone da bandeja (normal e com o ponto vermelho) mais
// o ponto sozinho (fundo transparente) pro overlay do icone na barra de
// tarefas — o overlay do Windows so aceita um icone PEQUENO desenhado por
// cima do icone existente, nao faz sentido mandar o logo inteiro ja com o
// ponto embutido pra ele (isso e so pro icone da bandeja, que troca
// inteiro).
let trayIconNormal = null;
let trayIconBadge = null;
let overlayDotIcon = null;

function loadTrayIcons() {
  if (trayIconNormal) return;
  const normal = nativeImage.createFromPath(path.join(__dirname, "build", "icon.ico"));
  const badge = nativeImage.createFromPath(path.join(__dirname, "build", "icon-badge.ico"));
  const dot = nativeImage.createFromPath(path.join(__dirname, "build", "dot-badge.png"));
  trayIconNormal = normal.isEmpty() ? normal : normal.resize({ width: 16, height: 16 });
  trayIconBadge = badge.isEmpty() ? badge : badge.resize({ width: 16, height: 16 });
  overlayDotIcon = dot.isEmpty() ? dot : dot.resize({ width: 16, height: 16 });
}

// Liga/desliga o aviso visual de notificacao nao lida — troca o icone da
// bandeja pra variante com o ponto vermelho (unico icone visivel enquanto a
// janela esta escondida) e, se a janela principal existir, tambem poe o
// mesmo ponto sobre o icone dela na barra de tarefas.
function setUnreadBadge(hasUnread) {
  lastUnreadState = hasUnread;
  log.info("Badge de notificacao na bandeja:", hasUnread ? "ligado" : "desligado");
  loadTrayIcons();
  if (tray) {
    tray.setImage(hasUnread ? trayIconBadge : trayIconNormal);
    tray.setToolTip(hasUnread ? "GameShare — notificações não lidas" : "GameShare");
  }
  if (mainWindow) {
    mainWindow.setOverlayIcon(hasUnread ? overlayDotIcon : null, hasUnread ? "Notificações não lidas" : "");
  }
}

ipcMain.on("badge:set", (_event, hasUnread) => {
  setUnreadBadge(Boolean(hasUnread));
});

// Trilha beta/estavel (ver getAppUrl acima) — o site em si expoe o toggle
// nas Configuracoes, aqui so guarda a escolha e recarrega a janela pro
// endereco novo. mainWindow.loadURL troca a origem por completo (cookies,
// localStorage etc. ficam isolados por origem sozinhos, sem precisar de
// nenhuma limpeza manual) — por isso trocar de trilha sempre pede login de
// novo do outro lado.
ipcMain.handle("channel:get", () => getChannel());

ipcMain.handle("channel:set", (_event, channel) => {
  const next = setChannel(channel);
  mainWindow?.loadURL(getAppUrl());
  // Passa a conferir a trilha certa de instalador na hora — sem esperar a
  // proxima checagem periodica (ate 4h) ou reiniciar o app inteiro.
  applyUpdaterChannel();
  return next;
});

// Versao do PROPRIO instalador (de package.json, via app.getVersion()) —
// pro selo visual de trilha/versao nas Configuracoes e na barra lateral
// (ver ChannelBadge.tsx). Pode ser diferente entre as trilhas quando um
// build beta (ex: "1.0.9-beta.1") traz algo que precisa de instalador
// novo — ver applyUpdaterChannel.
ipcMain.handle("app:get-version", () => app.getVersion());

function createTray() {
  if (tray) return;

  loadTrayIcons();
  tray = new Tray(trayIconNormal);
  tray.setToolTip("GameShare");

  const menu = Menu.buildFromTemplate([
    {
      label: "Abrir GameShare",
      click: () => {
        if (!mainWindow) {
          createWindow();
          return;
        }
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);

  // Clique simples no icone (padrao no Windows) tambem traz a janela pra
  // frente — o menu com "Sair" continua so no clique direito.
  tray.on("click", () => {
    if (!mainWindow) {
      createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
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
  shell.openExternal(`${getAppUrl()}/desktop-login/${code}`);

  const startedAt = Date.now();
  loginPollInterval = setInterval(async () => {
    if (Date.now() - startedAt > 10 * 60 * 1000) {
      clearInterval(loginPollInterval);
      loginPollInterval = null;
      mainWindow?.loadURL(getAppUrl());
      return;
    }

    try {
      const res = await fetch(`${getAppUrl()}/api/desktop-login/${code}`);
      const data = await res.json();

      if (data.status === "ready") {
        clearInterval(loginPollInterval);
        loginPollInterval = null;
        mainWindow?.loadURL(`${getAppUrl()}/api/desktop-login/${code}/finish`);
      } else if (data.status === "expired") {
        clearInterval(loginPollInterval);
        loginPollInterval = null;
        mainWindow?.loadURL(getAppUrl());
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
  applyUpdaterChannel();

  autoUpdater.on("checking-for-update", () => {
    log.info("Checando atualizacoes...");
  });

  autoUpdater.on("update-available", (info) => {
    log.info("Atualizacao encontrada:", info.version, "— baixando em segundo plano.");
    notify("Atualizando o GameShare", `Baixando a versão ${info.version}...`);
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
        title: "Atualização pronta",
        message: `Uma nova versão do GameShare (${info.version}) foi baixada.`,
        detail: "Reinicie o app pra aplicar a atualização. Se você só fechar o app normalmente, ela é aplicada sozinha na próxima vez que abrir.",
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

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupAutoUpdate();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Processos filhos (child_process.spawn) nao morrem sozinhos so porque o
// pai saiu — sem isso o loopback_helper.exe podia ficar orfao rodando se o
// app fechasse de um jeito que nao passa por mainWindow.on("closed").
app.on("before-quit", stopLoopbackCapture);

// "before-quit" dispara em QUALQUER caminho de saida (menu da bandeja,
// autoUpdater.quitAndInstall() pra instalar uma atualizacao, etc) — marcar
// isQuitting aqui, num lugar so, garante que o handler de "close" da janela
// deixa fechar de verdade dessa vez, em vez de so esconder pra bandeja de
// novo (o que travaria a instalacao da atualizacao, por exemplo).
app.on("before-quit", () => {
  isQuitting = true;
});
