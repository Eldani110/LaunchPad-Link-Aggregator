const { app, ipcMain, net, safeStorage, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const GITHUB_OWNER = "Eldani110";
const GITHUB_REPO = "LaunchPad-Link-Aggregator";
const GITHUB_RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const GITHUB_REPO_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
const GITHUB_RELEASES_API = `${GITHUB_REPO_API}/releases?per_page=8`;
const GITHUB_LATEST_API = `${GITHUB_REPO_API}/releases/latest`;
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const STALE_CHECK_MS = 15 * 60 * 1000; // 15 minutes

function parseSemver(raw) {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^v/i, "")
    .split("-")[0];
  const parts = cleaned.split(".").map((n) => parseInt(n, 10));
  if (parts.length === 0 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function isNewerVersion(candidate, current) {
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

function detectPackageType() {
  if (!app.isPackaged) return "dev";

  if (process.platform === "linux") {
    if (process.env.APPIMAGE) return "appimage";
    const pkgTypeFile = path.join(process.resourcesPath, "package-type");
    if (fs.existsSync(pkgTypeFile)) {
      try {
        const raw = fs.readFileSync(pkgTypeFile, "utf8").trim().toLowerCase();
        if (raw) return raw; // e.g., "deb", "rpm", "pacman"
      } catch {
        // ignore
      }
    }
    return "linux-unpacked";
  }

  if (process.platform === "win32") {
    return process.env.PORTABLE_EXECUTABLE_DIR ? "portable" : "nsis";
  }

  if (process.platform === "darwin") {
    return "mac";
  }

  return "unknown";
}

function supportsNativeAutoUpdate(packageType) {
  if (!app.isPackaged) return false;
  return (
    packageType === "appimage" ||
    packageType === "deb" ||
    packageType === "rpm" ||
    packageType === "pacman" ||
    packageType === "nsis" ||
    packageType === "mac"
  );
}

function pickAssetDownloadUrl(assets, packageType) {
  if (!Array.isArray(assets) || assets.length === 0) return null;

  const names = assets.map((a) => ({
    name: String(a?.name || "").toLowerCase(),
    url: String(a?.browser_download_url || ""),
  }));

  const findBy = (pred) => names.find((item) => item.url && pred(item.name))?.url || null;

  if (process.platform === "win32") {
    if (packageType === "portable") {
      return (
        findBy((n) => n.endsWith(".exe") && n.includes("portable") && !n.endsWith(".blockmap")) ||
        findBy((n) => n.endsWith(".exe") && !n.endsWith(".blockmap"))
      );
    }
    return (
      findBy((n) => n.endsWith(".exe") && !n.includes("portable") && !n.endsWith(".blockmap")) ||
      findBy((n) => n.endsWith(".exe") && !n.endsWith(".blockmap"))
    );
  }

  if (process.platform === "linux") {
    if (packageType === "appimage") {
      return findBy((n) => n.endsWith(".appimage")) || findBy((n) => n.endsWith(".deb"));
    }
    return findBy((n) => n.endsWith(".deb")) || findBy((n) => n.endsWith(".appimage"));
  }

  if (process.platform === "darwin") {
    const isArm = process.arch === "arm64";
    return (
      findBy((n) => n.endsWith(".dmg") && (isArm ? n.includes("arm64") : !n.includes("arm64"))) ||
      findBy((n) => n.endsWith(".dmg")) ||
      findBy((n) => n.endsWith(".zip") && !n.endsWith(".blockmap"))
    );
  }

  return null;
}

function normalizeReleaseNotes(notes) {
  if (!notes) return null;
  if (typeof notes === "string") return notes.trim() || null;
  if (Array.isArray(notes)) {
    const joined = notes
      .map((entry) => (typeof entry === "string" ? entry : entry?.note || ""))
      .filter(Boolean)
      .join("\n\n")
      .trim();
    return joined || null;
  }
  return null;
}

// --- Encrypted local storage for optional GitHub PAT (only needed if repo is private) ---

function getUpdaterConfigPath() {
  return path.join(app.getPath("userData"), "updater-config.json");
}

function readStoredToken() {
  try {
    const raw = fs.readFileSync(getUpdaterConfigPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.encryptedToken && safeStorage.isEncryptionAvailable()) {
      const buf = Buffer.from(parsed.encryptedToken, "base64");
      return safeStorage.decryptString(buf).trim() || null;
    }
    if (typeof parsed.plainToken === "string" && parsed.plainToken.trim()) {
      return parsed.plainToken.trim();
    }
  } catch {
    // Config does not exist yet
  }
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;
}

function writeStoredToken(token) {
  const cfgPath = getUpdaterConfigPath();
  const clean = typeof token === "string" ? token.trim() : "";

  if (!clean) {
    try {
      if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
    } catch {
      // ignore
    }
    return null;
  }

  const payload = {};
  if (safeStorage.isEncryptionAvailable()) {
    payload.encryptedToken = safeStorage.encryptString(clean).toString("base64");
  } else {
    payload.plainToken = clean;
  }

  fs.writeFileSync(cfgPath, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
  return clean;
}

function initUpdater({
  getMainWindow,
  skipAutoCheck = false,
  onBeforeInstallUpdate,
  onInstallCancelled,
  onBeforeRelaunch,
}) {
  const packageType = detectPackageType();
  const nativeCapable = supportsNativeAutoUpdate(packageType);
  let githubToken = readStoredToken();
  let downloadedFilePath = null;
  let isInstalling = false;

  let state = {
    status: "idle",
    currentVersion: app.getVersion(),
    latestVersion: null,
    releaseName: null,
    releaseNotes: null,
    releaseUrl: GITHUB_RELEASES_PAGE,
    downloadUrl: null,
    progress: 0,
    bytesPerSecond: 0,
    transferred: 0,
    total: 0,
    canAutoInstall: nativeCapable,
    packageType,
    hasToken: Boolean(githubToken),
    needsAuth: false,
    checkedAt: null,
    error: null,
  };

  let checkInFlight = null;
  let periodicTimer = null;

  function broadcast() {
    const win = getMainWindow();
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send("desktop:updater:status", state);
    }
  }

  function setState(patch) {
    state = { ...state, ...patch };
    broadcast();
    return state;
  }

  function configureAutoUpdaterFeed() {
    // Download updates automatically in the background whenever native auto-install is supported
    autoUpdater.autoDownload = nativeCapable;
    // On Linux .deb we handle privileged pkexec installation explicitly to avoid blocking/failing on quit
    autoUpdater.autoInstallOnAppQuit = packageType !== "deb";
    autoUpdater.allowPrerelease = false;

    if (githubToken) {
      autoUpdater.setFeedURL({
        provider: "github",
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        private: true,
        token: githubToken,
        releaseType: "release",
      });
    } else {
      autoUpdater.setFeedURL({
        provider: "github",
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        releaseType: "release",
      });
    }
  }

  function buildGitHubHeaders() {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": `LaunchPad-Desktop/${app.getVersion()}`,
    };
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }
    return headers;
  }

  async function checkViaGitHubApi({ silent = false } = {}) {
    try {
      const headers = buildGitHubHeaders();
      const response = await net.fetch(GITHUB_LATEST_API, { headers });

      if (response.status === 401 || response.status === 403) {
        return setState({
          status: silent ? "idle" : "error",
          needsAuth: true,
          checkedAt: Date.now(),
          error: silent
            ? null
            : "Token de GitHub inválido o sin permisos de lectura para este repositorio.",
        });
      }

      if (response.status === 404) {
        // Distinguish between: (A) private repo without token vs (B) public repo with no releases yet
        const repoResp = await net.fetch(GITHUB_REPO_API, { headers });
        if (repoResp.status === 404 || repoResp.status === 401 || repoResp.status === 403) {
          return setState({
            status: silent ? "idle" : "error",
            needsAuth: true,
            checkedAt: Date.now(),
            error: silent
              ? null
              : "El repositorio de GitHub es privado (404). Hazlo público o configura un Token de lectura de GitHub aquí abajo para recibir actualizaciones automáticas.",
          });
        }

        return setState({
          status: "not-available",
          latestVersion: app.getVersion(),
          releaseUrl: GITHUB_RELEASES_PAGE,
          downloadUrl: null,
          needsAuth: false,
          canAutoInstall: nativeCapable,
          checkedAt: Date.now(),
          error: null,
        });
      }

      if (!response.ok) {
        throw new Error(`GitHub API respondió con estado ${response.status}`);
      }

      const release = await response.json();
      const latestVersion = String(release.tag_name || "").replace(/^v/i, "").trim();
      const releaseUrl = release.html_url || GITHUB_RELEASES_PAGE;
      const downloadUrl = pickAssetDownloadUrl(release.assets, packageType) || releaseUrl;

      if (latestVersion && isNewerVersion(latestVersion, app.getVersion())) {
        return setState({
          status: "available",
          latestVersion,
          releaseName: release.name || `v${latestVersion}`,
          releaseNotes: normalizeReleaseNotes(release.body),
          releaseUrl,
          downloadUrl,
          needsAuth: false,
          canAutoInstall: false,
          checkedAt: Date.now(),
          error: null,
        });
      }

      return setState({
        status: "not-available",
        latestVersion: latestVersion || app.getVersion(),
        releaseName: release.name || null,
        releaseNotes: null,
        releaseUrl,
        downloadUrl: null,
        needsAuth: false,
        canAutoInstall: nativeCapable,
        checkedAt: Date.now(),
        error: null,
      });
    } catch (err) {
      if (silent) {
        return setState({
          status: "idle",
          checkedAt: Date.now(),
          error: null,
        });
      }
      return setState({
        status: "error",
        checkedAt: Date.now(),
        error: err?.message || "No se pudo consultar GitHub Releases.",
      });
    }
  }

  configureAutoUpdaterFeed();

  autoUpdater.on("checking-for-update", () => {
    setState({
      status: "checking",
      error: null,
    });
  });

  autoUpdater.on("update-available", (info) => {
    const version = String(info?.version || "").replace(/^v/i, "");
    const releaseUrl = version
      ? `${GITHUB_RELEASES_PAGE}/tag/v${version}`
      : GITHUB_RELEASES_PAGE;
    setState({
      status: nativeCapable ? "downloading" : "available",
      latestVersion: version || null,
      releaseName: info?.releaseName || (version ? `v${version}` : null),
      releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
      releaseUrl,
      downloadUrl: releaseUrl,
      progress: 0,
      bytesPerSecond: 0,
      transferred: 0,
      total: 0,
      canAutoInstall: nativeCapable,
      needsAuth: false,
      checkedAt: Date.now(),
      error: null,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    const version = String(info?.version || app.getVersion()).replace(/^v/i, "");
    setState({
      status: "not-available",
      latestVersion: version,
      releaseNotes: null,
      progress: 0,
      needsAuth: false,
      checkedAt: Date.now(),
      error: null,
    });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    setState({
      status: "downloading",
      progress: Math.min(100, Math.max(0, Math.round(progressObj?.percent || 0))),
      bytesPerSecond: progressObj?.bytesPerSecond || 0,
      transferred: progressObj?.transferred || 0,
      total: progressObj?.total || 0,
      error: null,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    const version = String(info?.version || state.latestVersion || "").replace(/^v/i, "");
    if (info?.downloadedFile && typeof info.downloadedFile === "string") {
      downloadedFilePath = info.downloadedFile;
    }
    setState({
      status: "downloaded",
      latestVersion: version || state.latestVersion,
      progress: 100,
      canAutoInstall: true,
      needsAuth: false,
      error: null,
    });
  });

  autoUpdater.on("error", (err) => {
    if (
      state.status === "downloading" ||
      state.status === "installing" ||
      state.status === "downloaded"
    ) {
      isInstalling = false;
      setState({
        status: state.status === "downloaded" || state.status === "installing" ? "downloaded" : "error",
        error: err?.message || "Error al procesar la actualización.",
      });
    }
  });

  async function checkForUpdates({ silent = false } = {}) {
    if (checkInFlight) return checkInFlight;

    checkInFlight = (async () => {
      setState({ status: "checking", error: null });

      if (nativeCapable) {
        try {
          configureAutoUpdaterFeed();
          await autoUpdater.checkForUpdates();
          return state;
        } catch (err) {
          console.warn(
            "Native electron-updater check failed, inspecting via GitHub API:",
            err?.message || err
          );
          return await checkViaGitHubApi({ silent });
        }
      }

      return await checkViaGitHubApi({ silent });
    })();

    try {
      return await checkInFlight;
    } finally {
      checkInFlight = null;
    }
  }

  async function downloadUpdate() {
    if (state.status !== "available") return state;

    if (state.canAutoInstall && nativeCapable) {
      setState({
        status: "downloading",
        progress: 0,
        bytesPerSecond: 0,
        transferred: 0,
        total: 0,
        error: null,
      });
      try {
        await autoUpdater.downloadUpdate();
        return state;
      } catch (err) {
        console.warn("Native update download failed:", err?.message || err);
        return setState({
          status: "available",
          canAutoInstall: false,
          error:
            err?.message
              ? `Descarga automática falló (${err.message}). Puedes descargar el instalador manualmente desde GitHub Releases.`
              : "No se pudo descargar automáticamente en este sistema. Puedes descargar el instalador desde GitHub Releases.",
        });
      }
    }

    const targetUrl = state.downloadUrl || state.releaseUrl || GITHUB_RELEASES_PAGE;
    await shell.openExternal(targetUrl);
    return state;
  }

  function resolvePendingDebPath() {
    if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
      return downloadedFilePath;
    }
    try {
      const pendingDir = path.join(
        app.getPath("home"),
        ".cache",
        "launchpad-link-aggregator-updater",
        "pending"
      );
      const infoPath = path.join(pendingDir, "update-info.json");
      if (fs.existsSync(infoPath)) {
        const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
        if (info?.fileName) {
          const candidate = path.join(pendingDir, path.basename(info.fileName));
          if (fs.existsSync(candidate)) return candidate;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  function processHasNoNewPrivs() {
    if (process.platform !== "linux") return false;
    try {
      const status = fs.readFileSync("/proc/self/status", "utf8");
      return /^NoNewPrivs:\s*1$/m.test(status);
    } catch {
      return false;
    }
  }

  function execPrivilegeCommand(cmd, args) {
    return new Promise((resolve) => {
      execFile(cmd, args, { timeout: 180000, encoding: "utf8" }, (err, stdout, stderr) => {
        if (!err) {
          resolve({ ok: true, stdout, stderr });
          return;
        }
        const code = typeof err.code === "number" ? err.code : null;
        const errCodeStr = typeof err.code === "string" ? err.code : null;
        const cleanStderr = String(stderr || "").trim();
        // Exit code 126 = user dismissed polkit password dialog;
        // 127 = auth error/not authorized (only if stderr isn't a technical binary/setuid error)
        const isPolkitDismissed =
          code === 126 ||
          (code === 127 &&
            (!cleanStderr || /dismissed|not authorized|authorization/i.test(cleanStderr)));
        if (isPolkitDismissed) {
          resolve({
            ok: false,
            code,
            errCodeStr,
            canceled: true,
            error: "Instalación cancelada o sin autorización de administrador.",
          });
          return;
        }
        resolve({
          ok: false,
          code,
          errCodeStr,
          canceled: false,
          error: (cleanStderr || err.message || "Error al instalar el paquete .deb.").trim(),
        });
      });
    });
  }

  async function runPkexecDpkgInstall(debPath) {
    // Electron on modern Linux sets PR_SET_NO_NEW_PRIVS=1 on its process tree,
    // which causes the kernel to ignore pkexec's setuid-root bit ("pkexec must be setuid root").
    // Delegating via `systemd-run --user` spawns pkexec from the user's systemd session manager
    // with NoNewPrivs=0 so polkit displays the native desktop password dialog cleanly.
    if (processHasNoNewPrivs()) {
      const res = await execPrivilegeCommand("systemd-run", [
        "--user",
        "--wait",
        "--pipe",
        "--collect",
        "--quiet",
        "--description=LaunchPad Update Installer",
        "--",
        "/usr/bin/pkexec",
        "/usr/bin/dpkg",
        "-i",
        debPath,
      ]);
      if (res.ok || res.errCodeStr !== "ENOENT") {
        return res;
      }
    }

    return await execPrivilegeCommand("/usr/bin/pkexec", ["/usr/bin/dpkg", "-i", debPath]);
  }

  async function installUpdate() {
    if (state.status !== "downloaded" || isInstalling) return false;
    isInstalling = true;

    // Dedicated, non-blocking pkexec installer for Linux .deb packages
    // (avoids electron-updater's blocking spawnSync + --disable-internal-agent polkit bug
    // and Electron's NoNewPrivs=1 setuid restriction)
    if (process.platform === "linux" && packageType === "deb") {
      const debPath = resolvePendingDebPath();
      if (!debPath) {
        isInstalling = false;
        setState({
          status: "error",
          error: "No se encontró el archivo .deb descargado en caché. Busca actualizaciones nuevamente.",
        });
        return false;
      }

      const launchExecPath = process.execPath.replace(/ \(deleted\)$/, "");
      const launchArgs = process.argv.slice(1).filter((a) => a !== "--hidden");

      setState({ status: "installing", error: null });
      onBeforeInstallUpdate?.();

      const res = await runPkexecDpkgInstall(debPath);
      if (res.ok) {
        try {
          fs.rmSync(path.dirname(debPath), { recursive: true, force: true });
        } catch {
          // ignore cache cleanup error
        }
        autoUpdater.autoInstallOnAppQuit = false;
        onBeforeRelaunch?.();
        app.relaunch({
          execPath: launchExecPath,
          args: launchArgs,
        });
        app.exit(0);
        return true;
      }

      isInstalling = false;
      onInstallCancelled?.();
      setState({
        status: "downloaded",
        error: res.error,
      });
      return false;
    }

    // Windows NSIS, Linux AppImage, and macOS
    setState({ status: "installing", error: null });
    onBeforeInstallUpdate?.();

    try {
      setImmediate(() => {
        try {
          autoUpdater.quitAndInstall(false, true);
        } catch (err) {
          isInstalling = false;
          onInstallCancelled?.();
          setState({
            status: "downloaded",
            error: err?.message || "No se pudo reiniciar para instalar la actualización.",
          });
        }
      });
      return true;
    } catch (err) {
      isInstalling = false;
      onInstallCancelled?.();
      setState({
        status: "downloaded",
        error: err?.message || "No se pudo iniciar la instalación.",
      });
      return false;
    }
  }

  async function setToken(rawToken) {
    githubToken = writeStoredToken(rawToken);
    configureAutoUpdaterFeed();
    setState({
      hasToken: Boolean(githubToken),
      needsAuth: false,
      error: null,
    });
    return await checkForUpdates({ silent: false });
  }

  async function listReleases() {
    try {
      const headers = buildGitHubHeaders();
      const response = await net.fetch(GITHUB_RELEASES_API, { headers });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          needsAuth: true,
          releases: [],
          error: "Token de GitHub inválido o sin permisos para leer los lanzamientos.",
        };
      }

      if (response.status === 404) {
        const repoResp = await net.fetch(GITHUB_REPO_API, { headers });
        if (repoResp.status === 404 || repoResp.status === 401 || repoResp.status === 403) {
          return {
            ok: false,
            needsAuth: true,
            releases: [],
            error: "Repositorio privado: hazlo público o configura un Token de lectura para ver el historial de versiones.",
          };
        }
        return { ok: true, needsAuth: false, releases: [] };
      }

      if (!response.ok) {
        return {
          ok: false,
          needsAuth: false,
          releases: [],
          error: `GitHub API respondió con estado ${response.status}`,
        };
      }

      const rawList = await response.json();
      const currentClean = String(app.getVersion() || "").replace(/^v/i, "").trim();
      const published = (Array.isArray(rawList) ? rawList : []).filter(
        (r) => r && !r.draft
      );

      const releases = published.map((r, index) => {
        const version = String(r.tag_name || "").replace(/^v/i, "").trim();
        return {
          id: r.id,
          tagName: r.tag_name || `v${version}`,
          version,
          name: r.name || r.tag_name || `v${version}`,
          body: normalizeReleaseNotes(r.body),
          publishedAt: r.published_at || r.created_at || null,
          htmlUrl: r.html_url || GITHUB_RELEASES_PAGE,
          prerelease: Boolean(r.prerelease),
          isCurrent: version === currentClean,
          isLatest: index === 0,
        };
      });

      return { ok: true, needsAuth: false, releases };
    } catch (err) {
      return {
        ok: false,
        needsAuth: false,
        releases: [],
        error: err?.message || "No se pudo obtener la lista de versiones.",
      };
    }
  }

  async function openReleasePage(customUrl) {
    const candidate =
      typeof customUrl === "string" && customUrl.startsWith("https://")
        ? customUrl
        : state.releaseUrl || GITHUB_RELEASES_PAGE;
    await shell.openExternal(candidate);
    return true;
  }

  ipcMain.handle("desktop:updater:get-state", () => state);
  ipcMain.handle("desktop:updater:check", () => checkForUpdates({ silent: false }));
  ipcMain.handle("desktop:updater:download", () => downloadUpdate());
  ipcMain.handle("desktop:updater:install", () => installUpdate());
  ipcMain.handle("desktop:updater:set-token", (_event, token) => setToken(token));
  ipcMain.handle("desktop:updater:list-releases", () => listReleases());
  ipcMain.handle("desktop:updater:open-release", (_event, url) => openReleasePage(url));

  if (!skipAutoCheck) {
    setTimeout(() => {
      void checkForUpdates({ silent: true });
    }, 5000);

    periodicTimer = setInterval(() => {
      void checkForUpdates({ silent: true });
    }, CHECK_INTERVAL_MS);
  }

  app.on("before-quit", () => {
    if (periodicTimer) clearInterval(periodicTimer);
  });

  function checkIfStale() {
    if (skipAutoCheck || checkInFlight || isInstalling) return;
    if (state.status === "downloading" || state.status === "downloaded") return;
    if (!state.checkedAt || Date.now() - state.checkedAt >= STALE_CHECK_MS) {
      void checkForUpdates({ silent: true });
    }
  }

  return {
    checkForUpdates,
    checkIfStale,
    getState: () => state,
  };
}

module.exports = {
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_RELEASES_PAGE,
  initUpdater,
};
