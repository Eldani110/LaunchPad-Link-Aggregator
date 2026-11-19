export type DesktopUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export interface DesktopUpdateState {
  status: DesktopUpdateStatus;
  currentVersion: string;
  latestVersion: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  releaseUrl: string;
  downloadUrl: string | null;
  progress: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
  canAutoInstall: boolean;
  checkedAt: number | null;
  error: string | null;
}

export interface DesktopUpdaterBridge {
  getState: () => Promise<DesktopUpdateState>;
  checkForUpdates: () => Promise<DesktopUpdateState>;
  downloadUpdate: () => Promise<DesktopUpdateState>;
  installUpdate: () => Promise<boolean>;
  openReleasePage: (url?: string) => Promise<boolean>;
  onStatusChange: (callback: (state: DesktopUpdateState) => void) => () => void;
}

export interface LaunchpadDesktopBridge {
  isDesktop: true;
  platform: "win32" | "darwin" | "linux" | string;
  openExternal: (url: string) => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  updater?: DesktopUpdaterBridge;
}

declare global {
  interface Window {
    launchpadDesktop?: LaunchpadDesktopBridge;
  }
}

export const isDesktopApp = (): boolean => {
  return typeof window !== "undefined" && Boolean(window.launchpadDesktop?.isDesktop);
};

export const getDesktopPlatform = (): string | null => {
  if (!isDesktopApp()) return null;
  return window.launchpadDesktop?.platform ?? null;
};

export const getDesktopPlatformLabel = (): string => {
  const platform = getDesktopPlatform();
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Ubuntu / Linux";
  return "Escritorio";
};

export const getDesktopUpdater = (): DesktopUpdaterBridge | null => {
  if (!isDesktopApp()) return null;
  return window.launchpadDesktop?.updater ?? null;
};

/**
 * Opens an external URL in the system default browser on Desktop (Electron),
 * or in a new browser tab on Web.
 */
export const openExternalLink = (rawUrl: string): void => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return;

  const normalizedUrl = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  if (window.launchpadDesktop?.openExternal) {
    void window.launchpadDesktop.openExternal(normalizedUrl);
    return;
  }

  window.open(normalizedUrl, "_blank", "noopener,noreferrer");
};
