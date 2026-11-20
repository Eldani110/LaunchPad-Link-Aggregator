const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  net,
  protocol,
  screen,
  shell,
} = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { initUpdater } = require("./updater.cjs");
const { initLauncher } = require("./launcher.cjs");

const APP_SCHEME = "app";
const APP_HOST = "launchpad";
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const DEV_URL = process.env.LAUNCHPAD_DEV_URL || "";
const IS_SMOKE_TEST = process.env.LAUNCHPAD_SMOKE_TEST === "1";

if (IS_SMOKE_TEST) {
  app.setPath("userData", path.join(os.tmpdir(), `launchpad-smoke-${process.pid}`));
}

const DIST_DIR = path.resolve(__dirname, "..", "dist");
const PRELOAD_PATH = path.join(__dirname, "preload.cjs");
const ICON_PATH = path.join(__dirname, "assets", "icon.png");

const LAUNCHER_DEFAULT_WIDTH = 860;
const LAUNCHER_DEFAULT_HEIGHT = 560;

app.setName("LaunchPad");

if (process.platform === "win32") {
  app.setAppUserModelId("com.launchpad.aggregator");
}

// Register privileged local protocol so local UI runs under a secure origin
// (enabling IndexedDB Firebase Auth persistence, localStorage, Clipboard, and Fetch APIs)
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow = null;
let tray = null;
let updaterController = null;
let isQuitting = false;
let isRecreatingWindow = false;
let autoHidePauseCount = 0;
let registeredShortcut = null;
let shortcutError = null;

// --- Desktop Preferences Persistence ---

function getDesktopPrefsPath() {
  return path.join(app.getPath("userData"), "desktop-prefs.json");
}

function isWindows11() {
  if (process.platform !== "win32") return false;
  try {
    const parts = os.release().split(".");
    const build = parseInt(parts[2] || "0", 10);
    return build >= 22000;
  } catch {
    return false;
  }
}

function getDefaultDesktopPrefs() {
  return {
    windowMode: "launcher", // "launcher" (floating Spotlight/Apps glass panel) | "window" (standard window)
    shortcut: "Alt+Space",
    autoHideOnBlur: true,
    autoHideOnLaunch: true,
    openAtLogin: false,
    glassOpacity: process.platform === "darwin" ? 0.28 : 0.56,
  };
}

function loadDesktopPrefs() {
  const defaults = getDefaultDesktopPrefs();
  try {
    const raw = fs.readFileSync(getDesktopPrefsPath(), "utf8");
    const parsed = JSON.parse(raw);
    const parsedOpacity =
      typeof parsed.glassOpacity === "number" && Number.isFinite(parsed.glassOpacity)
        ? Math.min(0.88, Math.max(0.15, parsed.glassOpacity))
        : defaults.glassOpacity;
    return {
      windowMode: parsed.windowMode === "window" ? "window" : "launcher",
      shortcut:
        typeof parsed.shortcut === "string" ? parsed.shortcut.trim() : defaults.shortcut,
      autoHideOnBlur:
        typeof parsed.autoHideOnBlur === "boolean"
          ? parsed.autoHideOnBlur
          : defaults.autoHideOnBlur,
      autoHideOnLaunch:
        typeof parsed.autoHideOnLaunch === "boolean"
          ? parsed.autoHideOnLaunch
          : defaults.autoHideOnLaunch,
      openAtLogin:
        typeof parsed.openAtLogin === "boolean"
          ? parsed.openAtLogin
          : defaults.openAtLogin,
      glassOpacity: parsedOpacity,
    };
  } catch {
    return defaults;
  }
}

let desktopPrefs = null;

function saveDesktopPrefs(next) {
  desktopPrefs = next;
  try {
    fs.writeFileSync(getDesktopPrefsPath(), JSON.stringify(next, null, 2), "utf8");
  } catch (err) {
    console.warn("Could not save desktop preferences:", err);
  }
}

function getPrefsPayload() {
  return {
    ...desktopPrefs,
    registeredShortcut,
    shortcutError,
  };
}

function broadcastPrefs() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send("desktop:window:prefs-changed", getPrefsPayload());
  }
}

function applyLoginItemSetting(openAtLogin) {
  if (IS_SMOKE_TEST || !app.isPackaged) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(openAtLogin),
      openAsHidden: true,
    });
  } catch (err) {
    console.warn("Could not update login item setting:", err?.message || err);
  }
}

function registerGlobalToggleShortcut(accelerator) {
  if (IS_SMOKE_TEST) return;
  try {
    globalShortcut.unregisterAll();
  } catch {
    // ignore
  }
  registeredShortcut = null;
  shortcutError = null;

  const clean = typeof accelerator === "string" ? accelerator.trim() : "";
  if (!clean) {
    refreshTrayMenu();
    return;
  }

  try {
    const ok = globalShortcut.register(clean, () => {
      toggleMainWindow();
    });
    if (ok) {
      registeredShortcut = clean;
    } else {
      shortcutError = `El sistema ya usa "${clean}". Prueba otro atajo (ej. CommandOrControl+Shift+Space).`;
    }
  } catch (err) {
    shortcutError = `Atajo inválido "${clean}": ${err?.message || "formato no reconocido"}`;
  }
  refreshTrayMenu();
}

// --- URL Helpers ---

function isAllowedExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

function isInternalAppUrl(rawUrl) {
  if (DEV_URL && rawUrl.startsWith(DEV_URL)) {
    return true;
  }
  return rawUrl.startsWith(APP_ORIGIN);
}

// --- Normal Window State Persistence ---

function getWindowStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadWindowState() {
  const defaults = { width: 1280, height: 820, isMaximized: false };
  try {
    const raw = fs.readFileSync(getWindowStatePath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      width: typeof parsed.width === "number" && parsed.width >= 640 ? parsed.width : defaults.width,
      height: typeof parsed.height === "number" && parsed.height >= 480 ? parsed.height : defaults.height,
      x: typeof parsed.x === "number" ? parsed.x : undefined,
      y: typeof parsed.y === "number" ? parsed.y : undefined,
      isMaximized: Boolean(parsed.isMaximized),
    };
  } catch {
    return defaults;
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed() || desktopPrefs?.windowMode === "launcher") return;
  try {
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
    const payload = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized,
    };
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    console.warn("Could not save window state:", err);
  }
}

function positionLauncherOnActiveDisplay(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const area = display.workArea;
    const [w, h] = win.getSize();
    const clampedW = Math.min(w, Math.max(640, area.width - 48));
    const clampedH = Math.min(h, Math.max(440, area.height - 64));
    if (clampedW !== w || clampedH !== h) {
      win.setSize(clampedW, clampedH);
    }
    const x = Math.round(area.x + (area.width - clampedW) / 2);
    const y = Math.round(area.y + (area.height - clampedH) / 2.25);
    win.setPosition(x, y, false);
  } catch {
    win.center();
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  if (desktopPrefs.windowMode === "launcher") {
    positionLauncherOnActiveDisplay(mainWindow);
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (process.platform === "darwin" && desktopPrefs.windowMode === "launcher") {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.show();
    mainWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
  } else {
    mainWindow.show();
  }

  mainWindow.focus();
  if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("desktop:window:shown");
  }
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (process.platform === "darwin" && desktopPrefs.windowMode === "launcher") {
    mainWindow.hide();
    // Return focus gracefully to previous macOS app
    try {
      app.hide();
    } catch {
      // ignore
    }
  } else {
    mainWindow.hide();
  }
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}

// --- Local Protocol ---

function registerLocalAppProtocol() {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    let requestedPath = decodeURIComponent(url.pathname || "/");
    if (requestedPath === "/" || requestedPath === "") {
      requestedPath = "/index.html";
    }

    const normalizedRelative = requestedPath.replace(/^\/+/, "");
    let candidatePath = path.resolve(DIST_DIR, normalizedRelative);

    // Prevent path traversal outside dist/
    if (!candidatePath.startsWith(DIST_DIR + path.sep) && candidatePath !== DIST_DIR) {
      candidatePath = path.join(DIST_DIR, "index.html");
    }

    // SPA fallback to local index.html
    if (!fs.existsSync(candidatePath) || fs.statSync(candidatePath).isDirectory()) {
      candidatePath = path.join(DIST_DIR, "index.html");
    }

    return net.fetch(pathToFileURL(candidatePath).toString());
  });
}

// --- System Tray ---

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const isLauncher = desktopPrefs.windowMode === "launcher";
  const shortcutHint = registeredShortcut ? ` (${registeredShortcut})` : "";

  const menu = Menu.buildFromTemplate([
    {
      label: `Abrir / Ocultar LaunchPad${shortcutHint}`,
      click: () => toggleMainWindow(),
    },
    { type: "separator" },
    {
      label: isLauncher ? "Cambiar a Ventana Normal" : "Cambiar a Launcher Flotante",
      click: () => {
        void updateDesktopPrefs({ windowMode: isLauncher ? "window" : "launcher" });
      },
    },
    {
      label: "Buscar actualizaciones...",
      click: () => {
        showMainWindow();
        updaterController?.checkForUpdates({ silent: false });
      },
    },
    { type: "separator" },
    {
      label: "Salir de LaunchPad",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}

function createTray() {
  if (IS_SMOKE_TEST || tray) return;
  if (!fs.existsSync(ICON_PATH)) return;

  try {
    let trayIcon = nativeImage.createFromPath(ICON_PATH);
    if (process.platform === "darwin") {
      trayIcon = trayIcon.resize({ width: 18, height: 18 });
    } else if (process.platform === "win32") {
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } else {
      trayIcon = trayIcon.resize({ width: 22, height: 22 });
    }

    tray = new Tray(trayIcon);
    tray.setToolTip("LaunchPad — Clic para abrir / ocultar");
    tray.on("click", () => toggleMainWindow());
    refreshTrayMenu();
  } catch (err) {
    console.warn("Could not create system tray icon:", err?.message || err);
  }
}

// --- Native Menu ---

function buildApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              {
                label: "Buscar actualizaciones...",
                click: () => {
                  updaterController?.checkForUpdates({ silent: false });
                },
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              {
                label: "Salir de LaunchPad",
                accelerator: "Command+Q",
                click: () => {
                  isQuitting = true;
                  app.quit();
                },
              },
            ],
          },
        ]
      : []),
    {
      label: "Editar",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(DEV_URL ? [{ role: "toggleDevTools" }] : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Ventana",
      submenu: [
        { role: "minimize" },
        ...(isMac
          ? [{ role: "zoom" }, { type: "separator" }, { role: "front" }]
          : [
              {
                label: "Buscar actualizaciones...",
                click: () => {
                  updaterController?.checkForUpdates({ silent: false });
                },
              },
              { type: "separator" },
              { role: "close" },
            ]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Window Creation (Hybrid Launcher / Normal) ---

function createMainWindow({ showImmediately = true } = {}) {
  const isLauncher = desktopPrefs.windowMode === "launcher";
  const normalState = loadWindowState();

  const basePrefs = {
    preload: PRELOAD_PATH,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: true,
  };

  const win11Acrylic = isWindows11();

  const windowOptions = isLauncher
    ? {
        width: LAUNCHER_DEFAULT_WIDTH,
        height: LAUNCHER_DEFAULT_HEIGHT,
        minWidth: 660,
        minHeight: 440,
        title: "LaunchPad",
        frame: false,
        transparent: !win11Acrylic,
        backgroundColor: "#00000000",
        hasShadow: true,
        roundedCorners: true,
        alwaysOnTop: true,
        resizable: true,
        maximizable: false,
        fullscreenable: false,
        show: false,
        icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
        ...(process.platform === "darwin"
          ? {
              vibrancy: "under-window",
              visualEffectState: "active",
            }
          : {}),
        ...(win11Acrylic
          ? {
              backgroundMaterial: "acrylic",
            }
          : {}),
        webPreferences: basePrefs,
      }
    : {
        width: normalState.width,
        height: normalState.height,
        x: normalState.x,
        y: normalState.y,
        minWidth: 760,
        minHeight: 520,
        title: "LaunchPad Agregador",
        backgroundColor: "#111827",
        show: false,
        autoHideMenuBar: process.platform !== "darwin",
        icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
        webPreferences: basePrefs,
      };

  const win = new BrowserWindow(windowOptions);
  mainWindow = win;

  if (isLauncher) {
    positionLauncherOnActiveDisplay(win);
  } else if (normalState.isMaximized && !IS_SMOKE_TEST) {
    win.maximize();
  }

  win.once("ready-to-show", () => {
    if (IS_SMOKE_TEST || !showImmediately || win.isDestroyed()) return;
    if (isLauncher) {
      showMainWindow();
    } else {
      win.show();
    }
  });

  // Auto-hide floating launcher when clicking outside (unless a modal/dialog is open)
  let blurTimer = null;
  win.on("blur", () => {
    if (IS_SMOKE_TEST || isRecreatingWindow || isQuitting) return;
    if (desktopPrefs.windowMode !== "launcher" || !desktopPrefs.autoHideOnBlur) return;
    if (autoHidePauseCount > 0) return;

    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      if (
        !win.isDestroyed() &&
        !win.isFocused() &&
        win.isVisible() &&
        autoHidePauseCount === 0 &&
        desktopPrefs.windowMode === "launcher" &&
        desktopPrefs.autoHideOnBlur
      ) {
        win.hide();
      }
    }, 90);
  });

  win.on("focus", () => {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
  });

  // Always open clicked links in the native OS default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isInternalAppUrl(url)) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) {
        shell.openExternal(url);
      }
    }
  });

  let saveTimer = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(win), 300);
  };

  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("maximize", scheduleSave);
  win.on("unmaximize", scheduleSave);

  // Keep resident in background when user closes window (unless actually quitting or switching mode)
  win.on("close", (event) => {
    saveWindowState(win);
    if (!isQuitting && !isRecreatingWindow && !IS_SMOKE_TEST) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadURL(`${APP_ORIGIN}/index.html`);
  }

  if (IS_SMOKE_TEST) {
    win.webContents.once("did-finish-load", async () => {
      try {
        await new Promise((r) => setTimeout(r, 1200));
        const report = await win.webContents.executeJavaScript(`(() => {
          const root = document.getElementById('root');
          const stylesheets = Array.from(document.styleSheets).map((s) => s.href || 'inline');
          const externalScripts = Array.from(document.scripts)
            .map((s) => s.src)
            .filter((src) => src && /^https?:\\/\\//i.test(src));
          return {
            origin: window.location.origin,
            hasDesktopBridge: Boolean(window.launchpadDesktop && window.launchpadDesktop.isDesktop),
            hasUpdaterBridge: Boolean(window.launchpadDesktop && window.launchpadDesktop.updater),
            hasLauncherBridge: Boolean(window.launchpadDesktop && window.launchpadDesktop.launcher),
            hasWindowBridge: Boolean(window.launchpadDesktop && window.launchpadDesktop.window),
            platform: window.launchpadDesktop ? window.launchpadDesktop.platform : null,
            rootChildCount: root ? root.childElementCount : 0,
            stylesheetCount: stylesheets.length,
            stylesheets,
            externalScripts,
          };
        })()`);
        console.log("SMOKE_TEST_RESULT=" + JSON.stringify(report));
        const ok =
          report.origin === APP_ORIGIN &&
          report.hasDesktopBridge &&
          report.hasUpdaterBridge &&
          report.hasLauncherBridge &&
          report.hasWindowBridge &&
          report.rootChildCount > 0 &&
          report.stylesheetCount > 0 &&
          report.externalScripts.length === 0;
        app.exit(ok ? 0 : 1);
      } catch (err) {
        console.error("SMOKE_TEST_ERROR=", err);
        app.exit(1);
      }
    });
  }
}

async function updateDesktopPrefs(patch) {
  const prevMode = desktopPrefs.windowMode;
  const prevShortcut = desktopPrefs.shortcut;
  const prevOpenAtLogin = desktopPrefs.openAtLogin;

  const next = {
    ...desktopPrefs,
    ...(patch.windowMode === "launcher" || patch.windowMode === "window"
      ? { windowMode: patch.windowMode }
      : {}),
    ...(typeof patch.shortcut === "string" ? { shortcut: patch.shortcut.trim() } : {}),
    ...(typeof patch.autoHideOnBlur === "boolean"
      ? { autoHideOnBlur: patch.autoHideOnBlur }
      : {}),
    ...(typeof patch.autoHideOnLaunch === "boolean"
      ? { autoHideOnLaunch: patch.autoHideOnLaunch }
      : {}),
    ...(typeof patch.openAtLogin === "boolean" ? { openAtLogin: patch.openAtLogin } : {}),
    ...(typeof patch.glassOpacity === "number" && Number.isFinite(patch.glassOpacity)
      ? { glassOpacity: Math.min(0.88, Math.max(0.15, patch.glassOpacity)) }
      : {}),
  };

  saveDesktopPrefs(next);

  if (next.shortcut !== prevShortcut) {
    registerGlobalToggleShortcut(next.shortcut);
  }
  if (next.openAtLogin !== prevOpenAtLogin) {
    applyLoginItemSetting(next.openAtLogin);
  }

  refreshTrayMenu();

  if (next.windowMode !== prevMode) {
    isRecreatingWindow = true;
    autoHidePauseCount = 0;
    const oldWin = mainWindow;
    if (oldWin && !oldWin.isDestroyed()) {
      oldWin.close();
      oldWin.destroy();
    }
    isRecreatingWindow = false;
    createMainWindow({ showImmediately: true });
  } else {
    broadcastPrefs();
  }

  return getPrefsPayload();
}

// Single-instance lock: clicking the OS launcher icon toggles/shows the floating launcher immediately
const hasLock = IS_SMOKE_TEST ? true : app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (desktopPrefs?.windowMode === "launcher") {
      toggleMainWindow();
    } else {
      showMainWindow();
    }
  });

  ipcMain.handle("desktop:open-external", async (_event, rawUrl) => {
    if (typeof rawUrl === "string" && isAllowedExternalUrl(rawUrl)) {
      await shell.openExternal(rawUrl);
      return true;
    }
    return false;
  });

  ipcMain.handle("desktop:get-version", () => app.getVersion());

  // Window / Floating Launcher IPCs
  ipcMain.handle("desktop:window:get-prefs", () => getPrefsPayload());
  ipcMain.handle("desktop:window:update-prefs", (_event, patch) =>
    updateDesktopPrefs(patch || {})
  );
  ipcMain.handle("desktop:window:hide", () => {
    hideMainWindow();
    return true;
  });
  ipcMain.handle("desktop:window:show", () => {
    showMainWindow();
    return true;
  });
  ipcMain.handle("desktop:window:toggle", () => {
    toggleMainWindow();
    return true;
  });
  ipcMain.handle("desktop:window:set-autohide-paused", (_event, paused) => {
    if (paused) {
      autoHidePauseCount += 1;
    } else {
      autoHidePauseCount = Math.max(0, autoHidePauseCount - 1);
    }
    return autoHidePauseCount;
  });
  ipcMain.handle("desktop:window:quit", () => {
    isQuitting = true;
    app.quit();
    return true;
  });

  app.on("before-quit", () => {
    isQuitting = true;
    try {
      globalShortcut.unregisterAll();
    } catch {
      // ignore
    }
  });

  app.whenReady().then(() => {
    desktopPrefs = loadDesktopPrefs();

    if (!DEV_URL) {
      registerLocalAppProtocol();
    }

    updaterController = initUpdater({
      getMainWindow: () => mainWindow,
      skipAutoCheck: IS_SMOKE_TEST,
    });

    initLauncher({
      getMainWindow: () => mainWindow,
      onBeforeNativeDialog: () => {
        autoHidePauseCount += 1;
      },
      onAfterNativeDialog: () => {
        autoHidePauseCount = Math.max(0, autoHidePauseCount - 1);
      },
    });

    buildApplicationMenu();
    createTray();
    registerGlobalToggleShortcut(desktopPrefs.shortcut);

    const startedHidden =
      !IS_SMOKE_TEST &&
      (process.argv.includes("--hidden") ||
        (process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAsHidden));

    createMainWindow({ showImmediately: !startedHidden });

    // macOS Dock icon click: toggle/show floating launcher instantly!
    app.on("activate", () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createMainWindow({ showImmediately: true });
      } else if (desktopPrefs.windowMode === "launcher") {
        toggleMainWindow();
      } else {
        showMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (isQuitting && process.platform !== "darwin") {
      app.quit();
    }
  });
}
