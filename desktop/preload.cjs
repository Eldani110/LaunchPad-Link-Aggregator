const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launchpadDesktop", {
  isDesktop: true,
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  getAppVersion: () => ipcRenderer.invoke("desktop:get-version"),
  window: {
    getPrefs: () => ipcRenderer.invoke("desktop:window:get-prefs"),
    updatePrefs: (patch) => ipcRenderer.invoke("desktop:window:update-prefs", patch),
    hide: () => ipcRenderer.invoke("desktop:window:hide"),
    show: () => ipcRenderer.invoke("desktop:window:show"),
    toggle: () => ipcRenderer.invoke("desktop:window:toggle"),
    setAutoHidePaused: (paused) =>
      ipcRenderer.invoke("desktop:window:set-autohide-paused", Boolean(paused)),
    quit: () => ipcRenderer.invoke("desktop:window:quit"),
    onPrefsChange: (callback) => {
      if (typeof callback !== "function") return () => {};
      const listener = (_event, prefs) => callback(prefs);
      ipcRenderer.on("desktop:window:prefs-changed", listener);
      return () => {
        ipcRenderer.removeListener("desktop:window:prefs-changed", listener);
      };
    },
    onShown: (callback) => {
      if (typeof callback !== "function") return () => {};
      const listener = () => callback();
      ipcRenderer.on("desktop:window:shown", listener);
      return () => {
        ipcRenderer.removeListener("desktop:window:shown", listener);
      };
    },
  },
  launcher: {
    launch: (target, args) => ipcRenderer.invoke("desktop:launcher:launch", target, args),
    pickApp: () => ipcRenderer.invoke("desktop:launcher:pick-app"),
    listInstalled: (forceRefresh = false) =>
      ipcRenderer.invoke("desktop:launcher:list-installed", forceRefresh),
  },
  updater: {
    getState: () => ipcRenderer.invoke("desktop:updater:get-state"),
    checkForUpdates: () => ipcRenderer.invoke("desktop:updater:check"),
    downloadUpdate: () => ipcRenderer.invoke("desktop:updater:download"),
    installUpdate: () => ipcRenderer.invoke("desktop:updater:install"),
    setToken: (token) => ipcRenderer.invoke("desktop:updater:set-token", token),
    listReleases: () => ipcRenderer.invoke("desktop:updater:list-releases"),
    openReleasePage: (url) => ipcRenderer.invoke("desktop:updater:open-release", url),
    onStatusChange: (callback) => {
      if (typeof callback !== "function") return () => {};
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("desktop:updater:status", listener);
      return () => {
        ipcRenderer.removeListener("desktop:updater:status", listener);
      };
    },
  },
});
