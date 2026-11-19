const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launchpadDesktop", {
  isDesktop: true,
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
  getAppVersion: () => ipcRenderer.invoke("desktop:get-version"),
  updater: {
    getState: () => ipcRenderer.invoke("desktop:updater:get-state"),
    checkForUpdates: () => ipcRenderer.invoke("desktop:updater:check"),
    downloadUpdate: () => ipcRenderer.invoke("desktop:updater:download"),
    installUpdate: () => ipcRenderer.invoke("desktop:updater:install"),
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
