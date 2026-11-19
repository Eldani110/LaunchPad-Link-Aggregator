const { app, ipcMain, net, shell } = require("electron");
const { autoUpdater } = require("electron-updater");

const GITHUB_OWNER = "Eldani110";
const GITHUB_REPO = "LaunchPad-Link-Aggregator";
const GITHUB_RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const GITHUB_LATEST_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

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

function supportsNativeAutoUpdate() {
  if (!app.isPackaged) return false;
  if (process.platform === "linux") {
    // AppImage supports in-place replacement; .deb packages are managed by dpkg/apt
    return Boolean(process.env.APPIMAGE);
  }
  if (process.platform === "win32") {
    // Portable builds do not self-install via NSIS updater
    return !process.env.PORTABLE_EXECUTABLE_DIR;
  }
  return process.platform === "darwin";
}

function pickAssetDownloadUrl(assets) {
  if (!Array.isArray(assets) || assets.length === 0) return null;

  const names = assets.map((a) => ({
    name: String(a?.name || "").toLowerCase(),
    url: String(a?.browser_download_url || ""),
  }));

  const findBy = (pred) => names.find((item) => item.url && pred(item.name))?.url || null;

  if (process.platform === "win32") {
    return (
      findBy((n) => n.endsWith(".exe") && !n.includes("portable") && !n.endsWith(".blockmap")) ||
      findBy((n) => n.endsWith(".exe") && !n.endsWith(".blockmap"))
    );
  }

  if (process.platform === "linux") {
    if (process.env.APPIMAGE) {
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

function initUpdater({ getMainWindow, skipAutoCheck = false }) {
  const nativeCapable = supportsNativeAutoUpdate();

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

  async function checkViaGitHubApi({ silent = false } = {}) {
    try {
      const response = await net.fetch(GITHUB_LATEST_API, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `LaunchPad-Desktop/${app.getVersion()}`,
        },
      });

      if (response.status === 404) {
        // No releases published yet in GitHub Releases
        return setState({
          status: "not-available",
          latestVersion: app.getVersion(),
          releaseUrl: GITHUB_RELEASES_PAGE,
          downloadUrl: null,
          canAutoInstall: false,
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
      const downloadUrl = pickAssetDownloadUrl(release.assets) || releaseUrl;

      if (latestVersion && isNewerVersion(latestVersion, app.getVersion())) {
        return setState({
          status: "available",
          latestVersion,
          releaseName: release.name || `v${latestVersion}`,
          releaseNotes: normalizeReleaseNotes(release.body),
          releaseUrl,
          downloadUrl,
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

  // Configure electron-updater (reads GitHub owner/repo from app-update.yml)
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

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
      status: "available",
      latestVersion: version || null,
      releaseName: info?.releaseName || (version ? `v${version}` : null),
      releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
      releaseUrl,
      downloadUrl: releaseUrl,
      canAutoInstall: nativeCapable,
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
    setState({
      status: "downloaded",
      latestVersion: version || state.latestVersion,
      progress: 100,
      canAutoInstall: true,
      error: null,
    });
  });

  autoUpdater.on("error", (err) => {
    // Only surface direct download/install errors; check errors fall back to GitHub API
    if (state.status === "downloading") {
      setState({
        status: "error",
        error: err?.message || "Error al descargar la actualización.",
      });
    }
  });

  async function checkForUpdates({ silent = false } = {}) {
    if (checkInFlight) return checkInFlight;

    checkInFlight = (async () => {
      setState({ status: "checking", error: null });

      if (nativeCapable) {
        try {
          await autoUpdater.checkForUpdates();
          return state;
        } catch (err) {
          console.warn("Native electron-updater check failed, falling back to GitHub API:", err?.message || err);
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
        // Fallback: allow user to download directly from GitHub Releases (e.g., unsigned macOS)
        console.warn("Native update download failed:", err?.message || err);
        return setState({
          status: "available",
          canAutoInstall: false,
          error:
            "No se pudo descargar automáticamente en este sistema. Puedes descargar el instalador directamente desde GitHub Releases.",
        });
      }
    }

    const targetUrl = state.downloadUrl || state.releaseUrl || GITHUB_RELEASES_PAGE;
    await shell.openExternal(targetUrl);
    return state;
  }

  function installUpdate() {
    if (state.status === "downloaded") {
      autoUpdater.quitAndInstall(false, true);
      return true;
    }
    return false;
  }

  async function openReleasePage(customUrl) {
    const candidate = typeof customUrl === "string" && customUrl.startsWith("https://")
      ? customUrl
      : state.releaseUrl || GITHUB_RELEASES_PAGE;
    await shell.openExternal(candidate);
    return true;
  }

  ipcMain.handle("desktop:updater:get-state", () => state);
  ipcMain.handle("desktop:updater:check", () => checkForUpdates({ silent: false }));
  ipcMain.handle("desktop:updater:download", () => downloadUpdate());
  ipcMain.handle("desktop:updater:install", () => installUpdate());
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

  return {
    checkForUpdates,
    getState: () => state,
  };
}

module.exports = {
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_RELEASES_PAGE,
  initUpdater,
};

