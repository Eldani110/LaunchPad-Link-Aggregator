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
const { execFile, execFileSync } = require("child_process");
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

const IS_KDE_LINUX =
  process.platform === "linux" &&
  (process.env.XDG_CURRENT_DESKTOP || "").toUpperCase().includes("KDE");

// On KDE Plasma Wayland, running through XWayland (--ozone-platform=x11) enables:
// 1. Native 60 FPS GPU KWin Gaussian blur behind the window (_KDE_NET_WM_BLUR_BEHIND_REGION)
// 2. Reliable global shortcuts (Alt+Space) across all apps
// 3. Exact active-monitor centering (win.setPosition)
const NEEDS_KDE_X11_RELAUNCH =
  !IS_SMOKE_TEST &&
  IS_KDE_LINUX &&
  Boolean(process.env.DISPLAY) &&
  process.env.XDG_SESSION_TYPE === "wayland" &&
  process.env.LAUNCHPAD_X11_RELAUNCHED !== "1" &&
  !process.argv.some((a) => a.startsWith("--ozone-platform=x11"));

if (NEEDS_KDE_X11_RELAUNCH) {
  process.env.ELECTRON_OZONE_PLATFORM_HINT = "x11";
  process.env.LAUNCHPAD_X11_RELAUNCHED = "1";
  app.relaunch({
    args: [...process.argv.slice(1), "--ozone-platform=x11"],
  });
  app.exit(0);
}

const USING_X11_ON_LINUX =
  process.platform === "linux" &&
  Boolean(process.env.DISPLAY) &&
  (process.env.XDG_SESSION_TYPE === "x11" ||
    process.env.ELECTRON_OZONE_PLATFORM_HINT === "x11" ||
    process.argv.some((a) => a.startsWith("--ozone-platform=x11")));

const HAS_KDE_NATIVE_BLUR = IS_KDE_LINUX && USING_X11_ON_LINUX;
const IS_KDE_WAYLAND =
  IS_KDE_LINUX && process.env.XDG_SESSION_TYPE === "wayland";

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
let kwinCursorPlacementActive = false;

const KWIN_PLACEMENT_PLUGIN = "launchpad_cursor_placement";
const KWIN_REPOSITION_PLUGIN = "launchpad_cursor_reposition";

function runKwinScriptingCall(method, args = [], { async: isAsync = false } = {}) {
  const gdbusArgs = [
    "call",
    "--session",
    "--dest",
    "org.kde.KWin",
    "--object-path",
    "/Scripting",
    "--method",
    `org.kde.kwin.Scripting.${method}`,
    ...args,
  ];
  const qdbusArgs = [
    "org.kde.KWin",
    "/Scripting",
    `org.kde.kwin.Scripting.${method}`,
    ...args,
  ];

  const isOutputOk = (out) => {
    const trimmed = String(out || "").trim();
    if (method === "loadScript") {
      const m = /-?\d+/.exec(trimmed);
      return m ? parseInt(m[0], 10) >= 0 : false;
    }
    return true;
  };

  if (isAsync) {
    return new Promise((resolve) => {
      execFile("gdbus", gdbusArgs, { encoding: "utf8", timeout: 1500 }, (err, stdout) => {
        if (!err) {
          resolve(isOutputOk(stdout));
          return;
        }
        execFile("qdbus6", qdbusArgs, { encoding: "utf8", timeout: 1500 }, (err2, stdout2) => {
          resolve(!err2 && isOutputOk(stdout2));
        });
      });
    });
  }

  try {
    const out = execFileSync("gdbus", gdbusArgs, { encoding: "utf8", timeout: 1500 });
    return isOutputOk(out);
  } catch {
    try {
      const out = execFileSync("qdbus6", qdbusArgs, { encoding: "utf8", timeout: 1500 });
      return isOutputOk(out);
    } catch {
      return false;
    }
  }
}

function buildKwinPlaceFunctionSource(targetPid) {
  return `
  var TARGET_PID = ${targetPid};
  function isLaunchPadWindow(w) {
    if (!w || w.pid !== TARGET_PID) return false;
    if (w.popupWindow || w.tooltip || w.dock || w.desktopWindow || w.menu || w.dialog) return false;
    if (typeof w.normalWindow === "boolean" && !w.normalWindow) return false;
    var cap = String(w.caption || "");
    if (cap && cap.indexOf("LaunchPad") === -1) return false;
    return true;
  }
  function placeLaunchPadWindow(w) {
    if (!isLaunchPadWindow(w)) return;
    var p = workspace.cursorPos;
    if (!p) return;
    var scr = typeof workspace.screenAt === "function" ? workspace.screenAt(p) : null;
    if (!scr && workspace.activeScreen) scr = workspace.activeScreen;
    if (!scr) return;
    var area = workspace.clientArea(KWin.MaximizeArea, scr, workspace.currentDesktop);
    if (!area || area.width <= 0 || area.height <= 0) return;
    var cap = String(w.caption || "");
    var isLauncher = Boolean(w.noBorder) || cap === "LaunchPad";
    var minW = isLauncher ? 640 : 760;
    var minH = isLauncher ? 440 : 520;
    var curW = Math.round(w.width) || (isLauncher ? 860 : 1280);
    var curH = Math.round(w.height) || (isLauncher ? 560 : 820);
    var ww = Math.min(curW, Math.max(minW, Math.round(area.width) - 48));
    var hh = Math.min(curH, Math.max(minH, Math.round(area.height) - 64));
    var tx = Math.round(area.x + (area.width - ww) / 2);
    var ty = Math.round(area.y + (area.height - hh) / (isLauncher ? 2.25 : 2));
    if (typeof w.frameGeometry !== "undefined") {
      w.frameGeometry = { x: tx, y: ty, width: ww, height: hh };
    } else if (typeof w.geometry !== "undefined") {
      w.geometry = { x: tx, y: ty, width: ww, height: hh };
    }
  }
`;
}

/**
 * On KDE Plasma Wayland with XWayland (--ozone-platform=x11), X11's pointer API
 * (screen.getCursorScreenPoint / xdotool) stays stale whenever the mouse is over
 * native Wayland apps or the desktop. Registering a lightweight KWin script lets
 * KWin itself place LaunchPad synchronously on workspace.screenAt(workspace.cursorPos)
 * at the exact moment the window maps (0 ms latency, zero wrong-monitor flicker).
 */
function installKwinCursorPlacement() {
  if (!IS_KDE_WAYLAND || IS_SMOKE_TEST) return false;
  try {
    const scriptPath = path.join(app.getPath("userData"), "kwin-cursor-placement.js");
    const source = `(function () {
${buildKwinPlaceFunctionSource(process.pid)}
  if (workspace.windowAdded && typeof workspace.windowAdded.connect === "function") {
    workspace.windowAdded.connect(placeLaunchPadWindow);
  } else if (workspace.clientAdded && typeof workspace.clientAdded.connect === "function") {
    workspace.clientAdded.connect(placeLaunchPadWindow);
  }
})();
`;
    fs.writeFileSync(scriptPath, source, "utf8");
    runKwinScriptingCall("unloadScript", [KWIN_PLACEMENT_PLUGIN]);
    const loaded = runKwinScriptingCall("loadScript", [scriptPath, KWIN_PLACEMENT_PLUGIN]);
    const started = loaded && runKwinScriptingCall("start");
    kwinCursorPlacementActive = Boolean(started);
    return kwinCursorPlacementActive;
  } catch (err) {
    console.warn("Could not install KWin cursor placement helper:", err?.message || err);
    kwinCursorPlacementActive = false;
    return false;
  }
}

function uninstallKwinCursorPlacement() {
  if (!IS_KDE_WAYLAND || IS_SMOKE_TEST) return;
  try {
    runKwinScriptingCall("unloadScript", [KWIN_PLACEMENT_PLUGIN]);
    runKwinScriptingCall("unloadScript", [KWIN_REPOSITION_PLUGIN]);
  } catch {
    // ignore
  }
  kwinCursorPlacementActive = false;
}

/**
 * Repositions an already-visible LaunchPad window on KDE Wayland to the monitor
 * currently under the live Wayland cursor (used when autoHideOnBlur is disabled
 * and the window is already mapped on another monitor).
 */
async function repositionVisibleKwinWindowToCursor() {
  if (!IS_KDE_WAYLAND || IS_SMOKE_TEST) return false;
  try {
    const scriptPath = path.join(app.getPath("userData"), "kwin-cursor-reposition.js");
    const source = `(function () {
${buildKwinPlaceFunctionSource(process.pid)}
  var list = typeof workspace.windowList === "function"
    ? workspace.windowList()
    : (typeof workspace.clientList === "function" ? workspace.clientList() : []);
  for (var i = 0; i < list.length; i++) {
    placeLaunchPadWindow(list[i]);
  }
})();
`;
    fs.writeFileSync(scriptPath, source, "utf8");
    await runKwinScriptingCall("unloadScript", [KWIN_REPOSITION_PLUGIN], { async: true });
    const loaded = await runKwinScriptingCall(
      "loadScript",
      [scriptPath, KWIN_REPOSITION_PLUGIN],
      { async: true }
    );
    if (loaded) {
      await runKwinScriptingCall("start", [], { async: true });
      setTimeout(() => {
        void runKwinScriptingCall("unloadScript", [KWIN_REPOSITION_PLUGIN], { async: true });
      }, 150);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

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

function hasNativeOsBlur() {
  return process.platform === "darwin" || isWindows11() || HAS_KDE_NATIVE_BLUR;
}

/**
 * Builds an exact 15-rectangle (60 cardinals, <= 64 xprop limit) rounded-corner
 * blur region so KWin GPU-blurs ONLY inside the rounded glass card.
 */
function buildRoundedBlurRegion(w, h, radius = 22) {
  const rad = Math.min(radius, Math.floor(w / 2), Math.floor(h / 2));
  const steps = 7;
  const rects = [];

  for (let i = 0; i < steps; i++) {
    const y0 = Math.round((i * rad) / steps);
    const y1 = Math.round(((i + 1) * rad) / steps);
    const bandH = Math.max(1, y1 - y0);
    const yMid = rad - (y0 + bandH / 2);
    const dx = Math.ceil(rad - Math.sqrt(Math.max(0, rad * rad - yMid * yMid)));
    rects.push(dx, y0, Math.max(1, w - dx * 2), bandH);
  }

  rects.push(0, rad, w, Math.max(1, h - rad * 2));

  for (let i = 0; i < steps; i++) {
    const y0 = Math.round((i * rad) / steps);
    const y1 = Math.round(((i + 1) * rad) / steps);
    const bandH = Math.max(1, y1 - y0);
    const yMid = y0 + bandH / 2;
    const dx = Math.ceil(rad - Math.sqrt(Math.max(0, rad * rad - yMid * yMid)));
    rects.push(dx, h - rad + y0, Math.max(1, w - dx * 2), bandH);
  }

  return rects.join(",");
}

function applyKdeBlurRegion(win) {
  if (!HAS_KDE_NATIVE_BLUR || !win || win.isDestroyed()) return;
  if (desktopPrefs?.windowMode !== "launcher") return;
  try {
    const buf = win.getNativeWindowHandle();
    if (!buf || buf.length < 4) return;
    const xid = buf.readUInt32LE(0);
    if (!xid || xid <= 1) return;

    const [w, h] = win.getContentSize();
    const region = buildRoundedBlurRegion(w, h, 22);
    execFile(
      "xprop",
      [
        "-id",
        String(xid),
        "-f",
        "_KDE_NET_WM_BLUR_BEHIND_REGION",
        "32c",
        "-set",
        "_KDE_NET_WM_BLUR_BEHIND_REGION",
        region,
      ],
      (err) => {
        if (err) {
          console.warn("Could not apply KWin blur region:", err.message);
        }
      }
    );
  } catch (err) {
    console.warn("applyKdeBlurRegion failed:", err?.message || err);
  }
}

function getDefaultDesktopPrefs() {
  return {
    windowMode: "launcher", // "launcher" (floating Spotlight/Apps glass panel) | "window" (standard window)
    shortcut: "Alt+Space",
    autoHideOnBlur: true,
    autoHideOnLaunch: true,
    openAtLogin: false,
    glassOpacity: hasNativeOsBlur() ? 0.34 : 0.62,
  };
}

function loadDesktopPrefs() {
  const defaults = getDefaultDesktopPrefs();
  try {
    const raw = fs.readFileSync(getDesktopPrefsPath(), "utf8");
    const parsed = JSON.parse(raw);
    const parsedOpacity =
      typeof parsed.glassOpacity === "number" && Number.isFinite(parsed.glassOpacity)
        ? Math.min(0.88, Math.max(0.10, parsed.glassOpacity))
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
    hasNativeBlur: hasNativeOsBlur(),
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

function getCursorScreenPointSafe() {
  try {
    const pt = screen.getCursorScreenPoint();
    // On pure Wayland, Chromium may return {0, 0}; fall back to xdotool if available
    if (process.platform === "linux" && pt.x === 0 && pt.y === 0) {
      try {
        const out = execFileSync("xdotool", ["getmouselocation", "--shell"], {
          encoding: "utf8",
          timeout: 300,
        });
        const xMatch = /X=(\d+)/.exec(out);
        const yMatch = /Y=(\d+)/.exec(out);
        if (xMatch && yMatch) {
          return { x: parseInt(xMatch[1], 10), y: parseInt(yMatch[1], 10) };
        }
      } catch {
        // ignore if xdotool is unavailable
      }
    }
    return pt;
  } catch {
    return { x: 0, y: 0 };
  }
}

function getDisplayAtCursor() {
  try {
    const cursor = getCursorScreenPointSafe();
    const displays = screen.getAllDisplays();
    // Prefer exact bounds containment first (most reliable on multi-monitor grids)
    const exact = displays.find((d) => {
      const b = d.bounds;
      return (
        cursor.x >= b.x &&
        cursor.x < b.x + b.width &&
        cursor.y >= b.y &&
        cursor.y < b.y + b.height
      );
    });
    return exact || screen.getDisplayNearestPoint(cursor);
  } catch {
    return screen.getPrimaryDisplay();
  }
}

function computeCenteredBoundsForDisplay(display, width, height, { isLauncher = true } = {}) {
  const area = display.workArea;
  const minW = isLauncher ? 640 : 760;
  const minH = isLauncher ? 440 : 520;
  const clampedW = Math.min(width, Math.max(minW, area.width - 48));
  const clampedH = Math.min(height, Math.max(minH, area.height - 64));
  const x = Math.round(area.x + (area.width - clampedW) / 2);
  const y = Math.round(area.y + (area.height - clampedH) / (isLauncher ? 2.25 : 2));
  return { x, y, width: clampedW, height: clampedH };
}

function positionWindowOnCursorDisplay(win) {
  if (!win || win.isDestroyed()) return null;
  try {
    const isLauncher = desktopPrefs?.windowMode === "launcher";
    const display = getDisplayAtCursor();
    const wasMaximized = !isLauncher && win.isMaximized();
    if (wasMaximized) {
      win.unmaximize();
    }
    const [w, h] = win.getSize();
    const bounds = computeCenteredBoundsForDisplay(display, w, h, { isLauncher });
    win.setBounds(bounds, false);
    if (wasMaximized) {
      win.maximize();
    }
    return bounds;
  } catch {
    win.center();
    return null;
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow({ showImmediately: true });
    return;
  }

  const isLauncher = desktopPrefs.windowMode === "launcher";
  const wasVisible = mainWindow.isVisible();

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (IS_KDE_WAYLAND && !IS_SMOKE_TEST && !kwinCursorPlacementActive) {
    installKwinCursorPlacement();
  }

  if (kwinCursorPlacementActive) {
    // KWin's workspace.windowAdded listener places the window synchronously on
    // workspace.screenAt(workspace.cursorPos) when mapping from hidden. Do NOT
    // overwrite with Electron's stale XWayland setBounds() coordinates.
    mainWindow.show();
    if (wasVisible && !mainWindow.isMaximized()) {
      void repositionVisibleKwinWindowToCursor();
    }
  } else {
    // Position on the display where the mouse cursor currently is BEFORE mapping
    const targetBounds = positionWindowOnCursorDisplay(mainWindow);

    if (process.platform === "darwin" && isLauncher) {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      mainWindow.show();
      if (targetBounds) mainWindow.setBounds(targetBounds, false);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
        }
      }, 120);
    } else {
      mainWindow.show();
      // Re-apply bounds right after mapping so Windows mixed-DPI and X11 WMs
      // do not restore the window onto its previous monitor
      if (targetBounds && !mainWindow.isMaximized()) {
        mainWindow.setBounds(targetBounds, false);
        setTimeout(() => {
          if (
            mainWindow &&
            !mainWindow.isDestroyed() &&
            mainWindow.isVisible() &&
            !mainWindow.isMaximized()
          ) {
            mainWindow.setBounds(targetBounds, false);
          }
        }, 30);
      }
    }
  }

  mainWindow.focus();
  if (HAS_KDE_NATIVE_BLUR && isLauncher) {
    setTimeout(() => applyKdeBlurRegion(mainWindow), 50);
  }
  if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("desktop:window:shown");
  }
  updaterController?.checkIfStale?.();
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
    createMainWindow({ showImmediately: true });
    return;
  }

  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    // On platforms where Electron has live global cursor coordinates (Windows, macOS, X11),
    // relocate if the user moved the mouse to another monitor instead of hiding.
    if (!kwinCursorPlacementActive) {
      try {
        const cursorDisplay = getDisplayAtCursor();
        const winDisplay = screen.getDisplayMatching(mainWindow.getBounds());
        if (cursorDisplay && winDisplay && cursorDisplay.id !== winDisplay.id) {
          showMainWindow();
          return;
        }
      } catch {
        // ignore and toggle normally
      }
    }
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
  const initialDisplay = getDisplayAtCursor();
  const initialBounds = isLauncher
    ? computeCenteredBoundsForDisplay(
        initialDisplay,
        LAUNCHER_DEFAULT_WIDTH,
        LAUNCHER_DEFAULT_HEIGHT,
        { isLauncher: true }
      )
    : computeCenteredBoundsForDisplay(
        initialDisplay,
        normalState.width,
        normalState.height,
        { isLauncher: false }
      );

  const windowOptions = isLauncher
    ? {
        width: initialBounds.width,
        height: initialBounds.height,
        x: initialBounds.x,
        y: initialBounds.y,
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
        width: initialBounds.width,
        height: initialBounds.height,
        x: initialBounds.x,
        y: initialBounds.y,
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
    // Keep window title as "LaunchPad" instead of index.html's <title>
    win.on("page-title-updated", (event) => {
      event.preventDefault();
    });
  }

  win.once("ready-to-show", () => {
    if (IS_SMOKE_TEST || !showImmediately || win.isDestroyed()) return;
    showMainWindow();
    if (!isLauncher && normalState.isMaximized) {
      win.maximize();
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
  let blurResizeTimer = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(win), 300);
  };
  const scheduleBlurRegion = () => {
    if (!HAS_KDE_NATIVE_BLUR || desktopPrefs?.windowMode !== "launcher") return;
    if (blurResizeTimer) clearTimeout(blurResizeTimer);
    blurResizeTimer = setTimeout(() => applyKdeBlurRegion(win), 80);
  };

  win.on("resize", () => {
    scheduleSave();
    scheduleBlurRegion();
  });
  win.on("show", () => {
    if (HAS_KDE_NATIVE_BLUR && desktopPrefs?.windowMode === "launcher") {
      setTimeout(() => applyKdeBlurRegion(win), 50);
    }
  });
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
      ? { glassOpacity: Math.min(0.88, Math.max(0.10, patch.glassOpacity)) }
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
    uninstallKwinCursorPlacement();
    try {
      globalShortcut.unregisterAll();
    } catch {
      // ignore
    }
  });

  app.whenReady().then(() => {
    desktopPrefs = loadDesktopPrefs();
    installKwinCursorPlacement();

    if (!DEV_URL) {
      registerLocalAppProtocol();
    }

    updaterController = initUpdater({
      getMainWindow: () => mainWindow,
      skipAutoCheck: IS_SMOKE_TEST,
      onBeforeInstallUpdate: () => {
        isQuitting = true;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(false);
          mainWindow.hide();
        }
      },
      onInstallCancelled: () => {
        isQuitting = false;
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (desktopPrefs?.windowMode === "launcher") {
            mainWindow.setAlwaysOnTop(true);
          }
          showMainWindow();
        }
      },
      onBeforeRelaunch: () => {
        uninstallKwinCursorPlacement();
      },
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
