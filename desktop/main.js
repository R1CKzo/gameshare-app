const {
  app,
  BrowserWindow,
  shell,
  dialog,
  Notification,
  ipcMain,
  desktopCapturer,
  Tray,
  Menu,
  nativeImage,
  protocol,
  safeStorage,
} = require("electron");
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

// Janela de teste da interface embutida (ver plano de app nativo, Fase 2)
// — nunca liga sozinha: so em dev com a flag GAMESHARE_DEBUG_UI=1, ou num
// instalador de teste separado (nome interno "gameshare-desktop-testui",
// ver builder-test-config.json) que nunca e o instalador publicado de
// verdade. A janela normal (createWindow, acima) continua carregando a
// pagina ao vivo do jeito de sempre, sem nenhuma mudanca.
// DEBUG_UI_ORIGIN e a mesma origem que precisa estar liberada em
// DESKTOP_APP_ORIGIN no Vercel pro CORS deixar essas chamadas passarem
// (ver src/lib/cors.ts).
const DEBUG_UI = process.env.GAMESHARE_DEBUG_UI === "1" || app.getName() === "gameshare-desktop-testui";
const DEBUG_UI_SCHEME = "gameshare-app";
const DEBUG_UI_ORIGIN = `${DEBUG_UI_SCHEME}://local`;
const DEBUG_UI_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "desktop-ui-out")
  : path.join(__dirname, "..", "desktop-ui", "out");

protocol.registerSchemesAsPrivileged([
  { scheme: DEBUG_UI_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// Pasta de dados propria pra essa janela de teste — sem isso ela usaria a
// MESMA pasta (e o mesmo trava-instancia-unica logo abaixo) do app de
// verdade instalado, e rodar os dois ao mesmo tempo faria esse processo
// de teste simplesmente fechar sozinho sem abrir nada (perdendo o
// trava-instancia pro app real ja aberto) — nunca deve competir com uma
// sessao real em uso.
if (DEBUG_UI) {
  app.setPath("userData", path.join(app.getPath("temp"), "gameshare-debug-ui"));
}

// So uma instancia por vez — sem isso, abrir o app de novo enquanto ele ja
// esta rodando minimizado na bandeja abriria um processo novo do zero em
// vez de so trazer a janela existente pra frente (igual o Discord faz).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // Sai imediatamente, sem deixar o resto do arquivo rodar — o app.quit()
  // sozinho e assincrono, entao sem esse "return" o whenReady() la embaixo
  // ainda chegava a criar uma janela e um icone de bandeja novos por um
  // instante antes do quit() completar (o "pisca e some" que acontecia ao
  // abrir o app com ele ja rodando minimizado).
  app.quit();
  return;
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
let loginPollInterval = null;
let tray = null;
let isQuitting = false;
let lastUnreadState = false;

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

// --- Fatia de teste da interface embutida (Fase 2 do plano de app nativo) ---
// So roda quando DEBUG_UI e verdadeiro (ver definicao acima) — nada disso
// afeta a janela principal nem o app publicado.

const DEBUG_TOKEN_FILE = () => path.join(app.getPath("userData"), "desktop-ui-session.bin");

function readStoredToken() {
  try {
    const encrypted = fs.readFileSync(DEBUG_TOKEN_FILE());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

function writeStoredToken(token) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("safeStorage indisponivel nesse computador — nao da pra guardar o token com seguranca.");
  }
  fs.mkdirSync(path.dirname(DEBUG_TOKEN_FILE()), { recursive: true });
  fs.writeFileSync(DEBUG_TOKEN_FILE(), safeStorage.encryptString(token));
}

function clearStoredToken() {
  fs.rm(DEBUG_TOKEN_FILE(), { force: true }, () => {});
}

ipcMain.handle("auth:get-token", () => readStoredToken());

ipcMain.handle("auth:clear-token", () => {
  clearStoredToken();
});

// Mesmo fluxo do startDesktopLogin (abre o navegador padrao, espera a
// pessoa logar, poll no codigo) so que pedindo o token em JSON
// ("?as=token", ver finish/route.ts) em vez de deixar o Set-Cookie grudar
// numa janela — e exatamente essa troca que faz sentido pra uma janela
// que nao esta mais na mesma origem da API.
function startDebugTokenLogin() {
  return new Promise((resolve) => {
    const code = crypto.randomBytes(16).toString("hex");
    shell.openExternal(`${APP_URL}/desktop-login/${code}`);

    const startedAt = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - startedAt > 10 * 60 * 1000) {
        clearInterval(interval);
        resolve({ ok: false, error: "Tempo esgotado (10 minutos) esperando o login." });
        return;
      }

      // So essa parte (checar o status) tolera falha transitoria de rede e
      // tenta de novo no proximo ciclo -- uma vez que "ready" e detectado,
      // qualquer erro daqui em diante e definitivo (sem retry escondido),
      // pra sempre terminar em resolve() com um motivo claro.
      let data;
      try {
        const res = await fetch(`${APP_URL}/api/desktop-login/${code}`);
        if (!res.ok) return;
        data = await res.json();
      } catch {
        return;
      }

      if (data.status === "expired") {
        clearInterval(interval);
        resolve({ ok: false, error: "O codigo de login expirou." });
        return;
      }
      if (data.status !== "ready") return;

      clearInterval(interval);
      try {
        const finishRes = await fetch(`${APP_URL}/api/desktop-login/${code}/finish?as=token`);
        if (!finishRes.ok) {
          resolve({ ok: false, error: `O servidor recusou o token (HTTP ${finishRes.status}).` });
          return;
        }
        const finishData = await finishRes.json();
        if (!finishData.token) {
          resolve({ ok: false, error: "O servidor nao devolveu um token." });
          return;
        }
        writeStoredToken(finishData.token);
        resolve({ ok: true });
      } catch (err) {
        log.error("[debug-ui] erro ao finalizar login", err);
        resolve({ ok: false, error: `Erro ao finalizar login: ${err.message ?? err}` });
      }
    }, 2000);
  });
}

ipcMain.handle("auth:start-login", () => startDebugTokenLogin());

function createDebugDesktopUiWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "GameShare — teste (app nativo)",
    backgroundColor: "#0b0d12",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "main-preload.js"),
    },
  });
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
    console.log("[debug-ui] janela mostrada");
  });
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("[debug-ui] falha ao carregar", validatedURL, errorCode, errorDescription);
  });
  win.webContents.on("console-message", (_event, level, message) => {
    console.log("[debug-ui:renderer]", level, message);
  });
  console.log("[debug-ui] carregando", `${DEBUG_UI_ORIGIN}/`);
  win.loadURL(`${DEBUG_UI_ORIGIN}/`);
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

// Versao rodando agora — so pra mostrar o selo "BETA" na interface quando
// o interruptor "Permitir versoes beta" esta ligado (ver
// resetBetaIfStableVersionChanged em src/lib/beta.ts e UserPill.tsx).
ipcMain.handle("app:get-version", () => app.getVersion());

// Programa beta (reformulado): sem instalador proprio nem download nenhum
// -- so um interruptor local (Configuracoes > Beta) que libera acesso a
// RECURSOS que ainda estao em teste dentro do app normal (o mesmo
// instalador de sempre, atualizado pelo auto-update padrao). Como alguns
// recursos beta so sao lidos uma vez, no inicio (nao dá pra simplesmente
// aparecer/sumir sozinho no meio da sessao), ligar ou desligar o
// interruptor reinicia o app pra carregar (ou parar de carregar) esses
// recursos de forma limpa -- ver handleToggle em SettingsButton.tsx.
ipcMain.on("app:restart", () => {
  app.relaunch();
  app.exit(0);
});

// --- Correcoes sem trocar de versao ("patch") ---
// Toda build (mesmo republicando a MESMA versao, sem bump nenhum) grava um
// build-info.json com o commit exato dela — embutido dentro do instalador
// (ver extraResources em package.json) e TAMBEM publicado como arquivo
// solto na Release do GitHub (ver build-desktop.yml). Comparando os dois
// (o que esta embutido no app JA INSTALADO vs o que esta publicado agora
// pra essa mesma versao), da pra saber se saiu uma correcao nova sem
// precisar de bump de versao pra cada ajuste pequeno -- o auto-update
// padrao (acima) so dispara quando o NUMERO da versao muda, entao isso
// aqui cobre o buraco: quem ja tem o app instalado ve um icone (ver
// UserPill.tsx) e baixa na mao quando quiser; quem instala do zero ja
// baixa a Release mais recente, sempre com a correcao mais nova dentro.
function getBuildInfoPath() {
  const fileName = "build-info.json";
  return app.isPackaged ? path.join(process.resourcesPath, fileName) : path.join(__dirname, fileName);
}

function getLocalBuildCommit() {
  try {
    const raw = fs.readFileSync(getBuildInfoPath(), "utf-8");
    return JSON.parse(raw).commit ?? null;
  } catch {
    return null;
  }
}

async function checkForPatch() {
  try {
    const localCommit = getLocalBuildCommit();
    if (!localCommit) return { available: false };

    const res = await fetch(`https://api.github.com/repos/R1CKzo/gameshare-app/releases/tags/v${app.getVersion()}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return { available: false };
    const release = await res.json();

    const infoAsset = release.assets?.find((a) => a.name === "build-info.json");
    if (!infoAsset) return { available: false };
    const infoRes = await fetch(infoAsset.browser_download_url);
    if (!infoRes.ok) return { available: false };
    const remoteInfo = await infoRes.json();
    if (!remoteInfo.commit || remoteInfo.commit === localCommit) return { available: false };

    const exeAsset = release.assets.find((a) => a.name.endsWith(".exe"));
    if (!exeAsset) return { available: false };

    return { available: true, downloadUrl: exeAsset.browser_download_url };
  } catch (err) {
    log.error("[patch] erro ao checar atualizacao", err);
    return { available: false };
  }
}

ipcMain.handle("patch:check", () => checkForPatch());

// Mesma mecanica robusta do instalador de sempre (so fecha o app depois de
// confirmar que o instalador realmente abriu, nunca antes -- ver o
// historico dessa exata logica pra correcao do bug "fechava sem instalar
// nada").
//
// De proposito NAO recebe a URL de fora (nem do IPC, nem da renderer) --
// sempre busca ela de novo aqui dentro, chamando checkForPatch() sozinho.
// Essa janela carrega o site de verdade (loadURL(APP_URL)), entao
// qualquer script rodando la (em tese, um XSS futuro no site) conseguiria
// chamar essa ponte diretamente -- se ela aceitasse uma URL vinda de fora,
// isso baixaria e executaria QUALQUER .exe que quisesse, sem nenhuma
// validacao. Derivando a URL aqui dentro (sempre da API do GitHub, sempre
// desse repositorio), a pior coisa que um script malicioso consegue fazer
// e disparar a instalacao de uma correcao de verdade, nunca de algo
// arbitrario.
// O instalador tem dezenas de MB -- numa rede fraca/instavel, uma unica
// tentativa de baixar tudo de uma vez falha com frequencia (conexao cai no
// meio, reset). Tenta de novo antes de desistir de verdade, em vez de
// mostrar erro na primeira falha.
async function fetchWithRetry(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    log.warn(`[patch] tentativa ${i + 1}/${attempts} de baixar falhou`, lastErr);
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000));
  }
  throw lastErr;
}

async function downloadAndInstallPatch() {
  try {
    const patch = await checkForPatch();
    if (!patch.available) {
      return { ok: false, error: "Nenhuma correção disponível." };
    }

    let res;
    try {
      res = await fetchWithRetry(patch.downloadUrl);
    } catch (err) {
      log.error("[patch] falha ao baixar depois de repetir", err);
      return { ok: false, error: "Não foi possível baixar a atualização. Tente de novo mais tarde." };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const dest = path.join(app.getPath("temp"), "GameShare-Patch-Setup.exe");
    fs.writeFileSync(dest, buffer);

    return await new Promise((resolve) => {
      const child = spawn(dest, [], { detached: true, stdio: "ignore" });
      child.once("error", (err) => {
        log.error("[patch] instalador nao abriu", err);
        resolve({ ok: false, error: "Não foi possível abrir o instalador. Tente de novo mais tarde." });
      });
      child.once("spawn", () => {
        child.unref();
        setTimeout(() => app.quit(), 500);
        resolve({ ok: true });
      });
    });
  } catch (err) {
    log.error("[patch] erro ao baixar/instalar", err);
    return { ok: false, error: "Não foi possível baixar a atualização. Tente de novo mais tarde." };
  }
}

ipcMain.handle("patch:download-and-install", () => downloadAndInstallPatch());

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, icon: path.join(__dirname, "build", "icon.ico") }).show();
}

app.whenReady().then(() => {
  // A janela de teste, com pasta de dados propria (ver acima), nao
  // precisa da janela/bandeja/auto-update normais junto — mante-la fora
  // deixa esse teste isolado, sem abrir uma segunda janela "de verdade"
  // (deslogada, numa pasta separada) do lado da sessao real que ja esta
  // em uso.
  if (!DEBUG_UI) {
    createWindow();
    createTray();
    setupAutoUpdate();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }

  if (DEBUG_UI) {
    // Serve o export estatico do desktop-ui/ por um protocolo proprio, em
    // vez de file:// cru — assim a pagina tem uma origem de verdade
    // (gameshare-app://local) que da pra liberar explicitamente no CORS
    // do backend, em vez do "null" generico que file:// manda.
    const MIME_TYPES = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
      ".woff2": "font/woff2",
    };
    protocol.handle(DEBUG_UI_SCHEME, (request) => {
      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname);
      const filePath = path.join(DEBUG_UI_DIR, pathname);

      if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
        const contentType = MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream";
        return new Response(fs.readFileSync(filePath), { headers: { "Content-Type": contentType } });
      }

      // Sem arquivo estatico com esse nome: se o caminho tem extensao
      // (ex: .js, .css — um recurso de verdade que devia existir), 404
      // de verdade. Se nao tem (ex: /servers/abc/channels/def — uma
      // rota do app, nao um arquivo), serve a mesma pagina raiz de
      // sempre com 200 -- o export estatico nao suporta rota dinamica
      // pra id desconhecido no build (server/canal/DM sao dados de cada
      // pessoa), entao essa pagina unica le a URL na hora e decide o que
      // mostrar sozinha (ver desktop-ui/app/page.tsx).
      if (path.extname(pathname)) {
        return new Response(fs.readFileSync(path.join(DEBUG_UI_DIR, "404.html")), {
          status: 404,
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response(fs.readFileSync(path.join(DEBUG_UI_DIR, "index.html")), {
        headers: { "Content-Type": "text/html" },
      });
    });
    createDebugDesktopUiWindow();
  }
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
