const { app, dialog, ipcMain, nativeImage, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ICON_SIZE = 64;
const MAX_SVG_DATA_BYTES = 16 * 1024; // Avoid stuffing huge SVGs into Firestore

/**
 * Splits a shell-like argument string respecting single and double quotes.
 */
function parseCommandTokens(input) {
  if (!input || typeof input !== "string") return [];
  const tokens = [];
  let current = "";
  let quote = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (quote) {
      if (ch === "\\" && quote === '"' && i + 1 < input.length) {
        current += input[++i];
      } else if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else if (ch === "\\" && process.platform !== "win32" && i + 1 < input.length) {
      current += input[++i];
    } else {
      current += ch;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

/**
 * Removes Electron / AppImage environment variables that can break launched child apps
 * (especially other Electron apps like VS Code, Discord, Slack, Obsidian, Chrome).
 */
function buildCleanChildEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  delete env.LAUNCHPAD_DEV_URL;
  delete env.LAUNCHPAD_SMOKE_TEST;

  if (process.env.APPIMAGE) {
    delete env.APPIMAGE;
    delete env.APPDIR;
    delete env.OWD;
    // Restore original library paths if running inside an AppImage
    if (env.LD_LIBRARY_PATH && process.env.APPDIR) {
      env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH.split(":")
        .filter((p) => p && !p.startsWith(process.env.APPDIR))
        .join(":");
      if (!env.LD_LIBRARY_PATH) delete env.LD_LIBRARY_PATH;
    }
  }
  return env;
}

function imageFileToDataUrl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return undefined;
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".svg") {
      const stat = fs.statSync(filePath);
      if (stat.size <= MAX_SVG_DATA_BYTES) {
        const raw = fs.readFileSync(filePath, "utf8");
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}`;
      }
      // Large SVGs: let nativeImage attempt rasterization if supported
    }

    const img = nativeImage.createFromPath(filePath);
    if (!img || img.isEmpty()) return undefined;
    const resized = img.resize({ width: ICON_SIZE, height: ICON_SIZE, quality: "good" });
    return resized.toDataURL();
  } catch {
    return undefined;
  }
}

async function getNativeFileIconDataUrl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return undefined;
  try {
    const icon = await app.getFileIcon(filePath, { size: "normal" });
    if (!icon || icon.isEmpty()) return undefined;
    const resized = icon.resize({ width: ICON_SIZE, height: ICON_SIZE, quality: "good" });
    return resized.toDataURL();
  } catch {
    return undefined;
  }
}

// --- Linux .desktop helpers ---

function parseDesktopFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    let inDesktopEntry = false;
    const entries = {};

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.startsWith("[")) {
        inDesktopEntry = line === "[Desktop Entry]";
        continue;
      }
      if (!inDesktopEntry) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (!(key in entries)) {
        entries[key] = val;
      }
    }

    if (entries.Type && entries.Type !== "Application") return null;
    if (entries.NoDisplay === "true" || entries.Hidden === "true") return null;
    if (!entries.Name || !entries.Exec) return null;

    const localizedName = entries["Name[es]"] || entries["Name[es_ES]"] || entries.Name;

    return {
      name: localizedName,
      exec: entries.Exec,
      iconName: entries.Icon || "",
      terminal: entries.Terminal === "true",
      desktopPath: filePath,
    };
  } catch {
    return null;
  }
}

function buildLinuxIconIndex() {
  const index = new Map();
  const home = os.homedir();
  const sizes = ["64x64", "48x48", "128x128", "256x256", "scalable", "32x32"];
  const themes = ["hicolor", "Yaru", "Papirus", "Adwaita", "breeze"];
  const bases = [
    path.join(home, ".local/share/icons"),
    path.join(home, ".local/share/flatpak/exports/share/icons"),
    "/var/lib/flatpak/exports/share/icons",
    "/usr/share/icons",
    "/usr/local/share/icons",
  ];

  const extsPriority = { ".png": 1, ".svg": 2, ".xpm": 3 };

  const recordDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const file of entries) {
      const ext = path.extname(file).toLowerCase();
      if (!(ext in extsPriority)) continue;
      const stem = path.basename(file, ext);
      const full = path.join(dir, file);
      const existing = index.get(stem);
      if (!existing) {
        index.set(stem, full);
      } else {
        const prevExt = path.extname(existing).toLowerCase();
        if ((extsPriority[ext] || 9) < (extsPriority[prevExt] || 9)) {
          index.set(stem, full);
        }
      }
    }
  };

  for (const base of bases) {
    for (const theme of themes) {
      for (const size of sizes) {
        recordDir(path.join(base, theme, size, "apps"));
      }
    }
  }

  recordDir("/usr/share/pixmaps");
  recordDir("/var/lib/snapd/desktop/icons");
  return index;
}

function resolveLinuxIcon(iconName, iconIndex) {
  if (!iconName) return undefined;
  if (path.isAbsolute(iconName)) {
    return imageFileToDataUrl(iconName);
  }
  const cleanName = iconName.replace(/\.(png|svg|xpm|ico)$/i, "");
  const matchedPath = iconIndex.get(cleanName) || iconIndex.get(iconName);
  if (matchedPath) {
    return imageFileToDataUrl(matchedPath);
  }
  return undefined;
}

function listLinuxApps() {
  const home = os.homedir();
  const dirs = [
    path.join(home, ".local/share/applications"),
    "/usr/local/share/applications",
    "/usr/share/applications",
    "/var/lib/snapd/desktop/applications",
    "/var/lib/flatpak/exports/share/applications",
    path.join(home, ".local/share/flatpak/exports/share/applications"),
  ];

  const iconIndex = buildLinuxIconIndex();
  const seenNames = new Set();
  const apps = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".desktop")) continue;
      const fullPath = path.join(dir, file);
      const parsed = parseDesktopFile(fullPath);
      if (!parsed) continue;

      const dedupeKey = parsed.name.toLowerCase();
      if (seenNames.has(dedupeKey)) continue;
      seenNames.add(dedupeKey);

      apps.push({
        name: parsed.name,
        target: fullPath,
        iconUrl: resolveLinuxIcon(parsed.iconName, iconIndex),
        source: "desktop",
      });
    }
  }

  apps.sort((a, b) => a.name.localeCompare(b.name));
  return apps;
}

// --- Windows Start Menu scanner ---

function walkLnkFiles(dir, depth = 0, out = []) {
  if (depth > 4 || !dir || !fs.existsSync(dir)) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkLnkFiles(full, depth + 1, out);
    } else if (entry.name.toLowerCase().endsWith(".lnk")) {
      const lower = entry.name.toLowerCase();
      if (
        lower.includes("uninstall") ||
        lower.includes("desinstalar") ||
        lower.includes("readme") ||
        lower.includes("help") ||
        lower.includes("website")
      ) {
        continue;
      }
      out.push(full);
    }
  }
  return out;
}

async function listWindowsApps() {
  const dirs = [
    path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs"),
  ];

  const lnkFiles = [];
  for (const dir of dirs) {
    walkLnkFiles(dir, 0, lnkFiles);
  }

  const seen = new Set();
  const candidates = [];
  for (const file of lnkFiles) {
    const name = path.basename(file, path.extname(file)).trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    candidates.push({ name, target: file });
  }

  candidates.sort((a, b) => a.name.localeCompare(b.name));

  // Limit icon extraction concurrency cleanly
  const results = [];
  for (const item of candidates.slice(0, 200)) {
    let target = item.target;
    let iconSource = item.target;
    try {
      const details = shell.readShortcutLink(item.target);
      if (details?.target && fs.existsSync(details.target)) {
        // Keep .lnk as target if shortcut carries arguments/icon cleanly, or resolve exe
        iconSource = details.target;
        if (!details.args && details.target.toLowerCase().endsWith(".exe")) {
          target = details.target;
        }
      }
    } catch {
      // Keep original .lnk
    }
    const iconUrl = await getNativeFileIconDataUrl(iconSource);
    results.push({
      name: item.name,
      target,
      iconUrl,
      source: "start-menu",
    });
  }

  return results;
}

// --- macOS Applications scanner ---

async function listMacApps() {
  const dirs = [
    "/Applications",
    "/System/Applications",
    path.join(os.homedir(), "Applications"),
  ];

  const seen = new Set();
  const candidates = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.name.endsWith(".app")) continue;
      const full = path.join(dir, entry.name);
      const name = entry.name.replace(/\.app$/i, "");
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ name, target: full });
    }
  }

  candidates.sort((a, b) => a.name.localeCompare(b.name));

  const results = [];
  for (const item of candidates.slice(0, 200)) {
    const iconUrl = await getNativeFileIconDataUrl(item.target);
    results.push({
      name: item.name,
      target: item.target,
      iconUrl,
      source: "applications",
    });
  }

  return results;
}

async function listInstalledApps() {
  if (process.platform === "linux") return listLinuxApps();
  if (process.platform === "win32") return listWindowsApps();
  if (process.platform === "darwin") return listMacApps();
  return [];
}

// --- Native File Picker ---

async function pickLocalApp(win) {
  const filters =
    process.platform === "win32"
      ? [
          { name: "Aplicaciones", extensions: ["exe", "lnk", "bat", "cmd", "msi"] },
          { name: "Todos los archivos", extensions: ["*"] },
        ]
      : process.platform === "darwin"
      ? [
          { name: "Aplicaciones", extensions: ["app"] },
          { name: "Todos los archivos", extensions: ["*"] },
        ]
      : [
          { name: "Aplicaciones", extensions: ["desktop", "AppImage", "sh"] },
          { name: "Todos los archivos", extensions: ["*"] },
        ];

  const defaultPath =
    process.platform === "darwin"
      ? "/Applications"
      : process.platform === "linux"
      ? "/usr/share/applications"
      : process.env.ProgramFiles || undefined;

  const result = await dialog.showOpenDialog(win || undefined, {
    title: "Seleccionar programa o acceso directo",
    defaultPath: defaultPath && fs.existsSync(defaultPath) ? defaultPath : undefined,
    properties: ["openFile"],
    filters,
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  let name = path.basename(filePath, path.extname(filePath));
  let iconUrl;

  if (process.platform === "linux" && filePath.endsWith(".desktop")) {
    const parsed = parseDesktopFile(filePath);
    if (parsed) {
      name = parsed.name;
      const iconIndex = buildLinuxIconIndex();
      iconUrl = resolveLinuxIcon(parsed.iconName, iconIndex);
    }
  } else {
    iconUrl = await getNativeFileIconDataUrl(filePath);
  }

  return {
    canceled: false,
    app: {
      name,
      target: filePath,
      iconUrl,
    },
  };
}

// --- Cross-platform Application Spawner ---

function spawnDetached(command, args, opts = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
        env: buildCleanChildEnv(),
        windowsHide: false,
        ...opts,
      });

      child.once("error", (err) => {
        if (err && err.code === "ENOENT") {
          finish({
            ok: false,
            error: `No se encontró el programa "${command}" en este PC.`,
          });
        } else if (err && err.code === "EACCES") {
          finish({
            ok: false,
            error: `Sin permisos de ejecución para "${command}".`,
          });
        } else {
          finish({
            ok: false,
            error: err?.message || `No se pudo abrir "${command}".`,
          });
        }
      });

      child.unref();

      // Give spawn a brief window to surface immediate ENOENT/EACCES errors
      setTimeout(() => finish({ ok: true }), 180);
    } catch (err) {
      finish({
        ok: false,
        error: err?.message || `Error al lanzar "${command}".`,
      });
    }
  });
}

async function launchApplication(rawTarget, rawArgs = "") {
  const target = String(rawTarget || "").trim();
  if (!target) {
    return { ok: false, error: "La ruta o comando del programa está vacía." };
  }

  const extraArgs = parseCommandTokens(rawArgs);

  // 1. Linux .desktop shortcut
  if (process.platform === "linux" && target.endsWith(".desktop")) {
    if (!fs.existsSync(target)) {
      return { ok: false, error: `No existe el acceso directo "${target}" en este PC.` };
    }
    const parsed = parseDesktopFile(target);
    if (!parsed || !parsed.exec) {
      return { ok: false, error: `No se pudo leer el comando de "${path.basename(target)}".` };
    }
    // Strip freedesktop field codes (%u, %U, %f, %F, %i, %c, %k, etc.)
    const cleanedExec = parsed.exec.replace(/%[fFuUdDnNickvm]/g, "").trim();
    const tokens = parseCommandTokens(cleanedExec);
    if (tokens.length === 0) {
      return { ok: false, error: `Comando inválido en "${path.basename(target)}".` };
    }
    const [bin, ...desktopArgs] = tokens;
    return spawnDetached(bin, [...desktopArgs, ...extraArgs]);
  }

  // 2. macOS .app bundle
  if (process.platform === "darwin" && target.endsWith(".app")) {
    if (!fs.existsSync(target)) {
      return { ok: false, error: `No se encontró "${target}" en este Mac.` };
    }
    const openArgs = ["-a", target];
    if (extraArgs.length > 0) {
      openArgs.push("--args", ...extraArgs);
    }
    return spawnDetached("open", openArgs);
  }

  // 3. Windows .lnk shortcut or existing non-exe document without extra args
  if (process.platform === "win32") {
    if (fs.existsSync(target)) {
      const ext = path.extname(target).toLowerCase();
      if (ext === ".lnk" && extraArgs.length === 0) {
        const errMsg = await shell.openPath(target);
        return errMsg ? { ok: false, error: errMsg } : { ok: true };
      }
      if (ext === ".lnk" && extraArgs.length > 0) {
        try {
          const details = shell.readShortcutLink(target);
          if (details?.target && fs.existsSync(details.target)) {
            const shortcutArgs = parseCommandTokens(details.args || "");
            return spawnDetached(details.target, [...shortcutArgs, ...extraArgs]);
          }
        } catch {
          // Fall back to openPath
        }
        const errMsg = await shell.openPath(target);
        return errMsg ? { ok: false, error: errMsg } : { ok: true };
      }
      if (ext === ".exe") {
        return spawnDetached(target, extraArgs);
      }
      if (ext === ".bat" || ext === ".cmd") {
        return spawnDetached(target, extraArgs, { shell: true });
      }
      const errMsg = await shell.openPath(target);
      return errMsg ? { ok: false, error: errMsg } : { ok: true };
    }

    // Bare command on Windows (e.g., "notepad", "calc", "code", "wt")
    const tokens = parseCommandTokens(target);
    if (tokens.length === 0) {
      return { ok: false, error: "Comando inválido." };
    }
    const [bin, ...inlineArgs] = tokens;
    return spawnDetached(bin, [...inlineArgs, ...extraArgs], { shell: true });
  }

  // 4. Linux / macOS existing executable file or directory
  if (fs.existsSync(target)) {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      const errMsg = await shell.openPath(target);
      return errMsg ? { ok: false, error: errMsg } : { ok: true };
    }
    return spawnDetached(target, extraArgs);
  }

  // 5. Linux / macOS bare command (e.g., "code", "vlc", "flatpak run ...")
  const tokens = parseCommandTokens(target);
  if (tokens.length === 0) {
    return { ok: false, error: "Comando inválido." };
  }
  const [bin, ...inlineArgs] = tokens;
  return spawnDetached(bin, [...inlineArgs, ...extraArgs]);
}

function initLauncher({ getMainWindow }) {
  let cachedApps = null;
  let cacheTimestamp = 0;
  const CACHE_TTL_MS = 60 * 1000;

  ipcMain.handle("desktop:launcher:launch", async (_event, target, args) => {
    return launchApplication(target, args);
  });

  ipcMain.handle("desktop:launcher:pick-app", async () => {
    return pickLocalApp(getMainWindow());
  });

  ipcMain.handle("desktop:launcher:list-installed", async (_event, forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && cachedApps && now - cacheTimestamp < CACHE_TTL_MS) {
      return cachedApps;
    }
    try {
      cachedApps = await listInstalledApps();
      cacheTimestamp = Date.now();
      return cachedApps;
    } catch (err) {
      console.error("Failed listing installed apps:", err);
      return [];
    }
  });
}

module.exports = {
  initLauncher,
  launchApplication,
  listInstalledApps,
};

