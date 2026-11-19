const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require("electron");
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
let updaterController = null;

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
  if (!win || win.isDestroyed()) return;
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
              { role: "quit" },
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

function createMainWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 760,
    minHeight: 520,
    title: "LaunchPad Agregador",
    backgroundColor: "#111827",
    show: false,
    autoHideMenuBar: process.platform !== "darwin",
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  if (state.isMaximized && !IS_SMOKE_TEST) {
    mainWindow.maximize();
  }

  mainWindow.once("ready-to-show", () => {
    if (!IS_SMOKE_TEST && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  // Always open clicked links in the native OS default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
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
    saveTimer = setTimeout(() => saveWindowState(mainWindow), 300);
  };

  mainWindow.on("resize", scheduleSave);
  mainWindow.on("move", scheduleSave);
  mainWindow.on("maximize", scheduleSave);
  mainWindow.on("unmaximize", scheduleSave);
  mainWindow.on("close", () => saveWindowState(mainWindow));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  }

  if (IS_SMOKE_TEST) {
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        await new Promise((r) => setTimeout(r, 1200));
        const report = await mainWindow.webContents.executeJavaScript(`(() => {
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
            platform: window.launchpadDesktop ? window.launchpadDesktop.platform : null,
            rootChildCount: root ? root.childElementCount : 0,
            stylesheetCount: stylesheets.length,
            stylesheets,
            externalScripts,
            bodyBg: getComputedStyle(document.body).backgroundColor,
          };
        })()`);
        console.log("SMOKE_TEST_RESULT=" + JSON.stringify(report));
        const ok =
          report.origin === APP_ORIGIN &&
          report.hasDesktopBridge &&
          report.hasUpdaterBridge &&
          report.hasLauncherBridge &&
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

// Single-instance lock
const hasLock = IS_SMOKE_TEST ? true : app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
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

  app.whenReady().then(() => {
    if (!DEV_URL) {
      registerLocalAppProtocol();
    }
    updaterController = initUpdater({
      getMainWindow: () => mainWindow,
      skipAutoCheck: IS_SMOKE_TEST,
    });
    initLauncher({
      getMainWindow: () => mainWindow,
    });
    buildApplicationMenu();
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

