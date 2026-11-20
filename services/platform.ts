import { LinkItem, TargetOS } from "../types";

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
  packageType?: string;
  hasToken?: boolean;
  needsAuth?: boolean;
  checkedAt: number | null;
  error: string | null;
}

export interface DesktopReleaseItem {
  id: number;
  tagName: string;
  version: string;
  name: string;
  body: string | null;
  publishedAt: string | null;
  htmlUrl: string;
  prerelease: boolean;
  isCurrent: boolean;
  isLatest: boolean;
}

export interface DesktopReleasesListResult {
  ok: boolean;
  needsAuth: boolean;
  releases: DesktopReleaseItem[];
  error?: string;
}

export interface DesktopUpdaterBridge {
  getState: () => Promise<DesktopUpdateState>;
  checkForUpdates: () => Promise<DesktopUpdateState>;
  downloadUpdate: () => Promise<DesktopUpdateState>;
  installUpdate: () => Promise<boolean>;
  setToken?: (token: string | null) => Promise<DesktopUpdateState>;
  listReleases?: () => Promise<DesktopReleasesListResult>;
  openReleasePage: (url?: string) => Promise<boolean>;
  onStatusChange: (callback: (state: DesktopUpdateState) => void) => () => void;
}

export interface InstalledAppInfo {
  name: string;
  target: string;
  iconUrl?: string;
  source?: string;
}

export interface LaunchAppResult {
  ok: boolean;
  error?: string;
}

export interface PickLocalAppResult {
  canceled: boolean;
  app?: InstalledAppInfo;
}

export interface DesktopLauncherBridge {
  launch: (target: string, args?: string) => Promise<LaunchAppResult>;
  pickApp: () => Promise<PickLocalAppResult>;
  listInstalled: (forceRefresh?: boolean) => Promise<InstalledAppInfo[]>;
}

export type DesktopWindowMode = "launcher" | "window";

export interface DesktopWindowPrefs {
  windowMode: DesktopWindowMode;
  shortcut: string;
  autoHideOnBlur: boolean;
  autoHideOnLaunch: boolean;
  openAtLogin: boolean;
  registeredShortcut: string | null;
  shortcutError: string | null;
}

export interface DesktopWindowBridge {
  getPrefs: () => Promise<DesktopWindowPrefs>;
  updatePrefs: (patch: Partial<DesktopWindowPrefs>) => Promise<DesktopWindowPrefs>;
  hide: () => Promise<boolean>;
  show: () => Promise<boolean>;
  toggle: () => Promise<boolean>;
  setAutoHidePaused: (paused: boolean) => Promise<number>;
  quit: () => Promise<boolean>;
  onPrefsChange: (callback: (prefs: DesktopWindowPrefs) => void) => () => void;
  onShown: (callback: () => void) => () => void;
}

export interface LaunchpadDesktopBridge {
  isDesktop: true;
  platform: "win32" | "darwin" | "linux" | string;
  openExternal: (url: string) => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  window?: DesktopWindowBridge;
  launcher?: DesktopLauncherBridge;
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

export const getCurrentDesktopOS = (): "win32" | "linux" | "darwin" | null => {
  const p = getDesktopPlatform();
  if (p === "win32" || p === "linux" || p === "darwin") return p;
  return null;
};

export const getOSLabel = (os: TargetOS): string => {
  switch (os) {
    case "win32":
      return "Windows";
    case "darwin":
      return "macOS";
    case "linux":
      return "Ubuntu / Linux";
    case "all":
      return "Todos los SO";
  }
};

export const getDesktopPlatformLabel = (): string => {
  const platform = getCurrentDesktopOS();
  if (platform) return getOSLabel(platform);
  return "Escritorio";
};

/**
 * Infers the target OS for legacy app items that don't have `targetOs` set explicitly.
 */
export const inferTargetOSFromPath = (rawTarget: string): TargetOS => {
  const target = (rawTarget || "").trim();
  const lower = target.toLowerCase();

  if (
    lower.endsWith(".exe") ||
    lower.endsWith(".lnk") ||
    lower.endsWith(".bat") ||
    lower.endsWith(".cmd") ||
    lower.endsWith(".msi") ||
    /^[a-z]:\\/i.test(target)
  ) {
    return "win32";
  }

  if (
    lower.endsWith(".app") ||
    target.startsWith("/Applications/") ||
    target.startsWith("/System/Applications/")
  ) {
    return "darwin";
  }

  if (
    lower.endsWith(".desktop") ||
    lower.endsWith(".appimage") ||
    target.startsWith("/usr/") ||
    target.startsWith("/snap/") ||
    target.startsWith("/var/lib/flatpak/") ||
    target.includes("/.local/share/applications/")
  ) {
    return "linux";
  }

  return "all";
};

/**
 * Determines whether a LinkItem should be visible on the current runtime:
 * - Web links ('web') are always visible everywhere.
 * - PC software ('app') is hidden on Web, and on Desktop is only shown if
 *   its targetOs matches the current OS (or is 'all').
 */
export const isLinkVisibleOnCurrentPlatform = (link: LinkItem): boolean => {
  if (link.itemType !== "app") return true;

  const currentOs = getCurrentDesktopOS();
  if (!currentOs) return false;

  const effectiveOs = link.targetOs || inferTargetOSFromPath(link.url);
  return effectiveOs === "all" || effectiveOs === currentOs;
};

export const getDesktopUpdater = (): DesktopUpdaterBridge | null => {
  if (!isDesktopApp()) return null;
  return window.launchpadDesktop?.updater ?? null;
};

export const getDesktopLauncher = (): DesktopLauncherBridge | null => {
  if (!isDesktopApp()) return null;
  return window.launchpadDesktop?.launcher ?? null;
};

export const getDesktopWindow = (): DesktopWindowBridge | null => {
  if (!isDesktopApp()) return null;
  return window.launchpadDesktop?.window ?? null;
};

export const launchDesktopApp = async (
  target: string,
  args?: string
): Promise<LaunchAppResult> => {
  const launcher = getDesktopLauncher();
  if (!launcher) {
    return {
      ok: false,
      error: "Para abrir programas del PC usa la versión de escritorio de LaunchPad.",
    };
  }
  return launcher.launch(target, args);
};

/**
 * Generates a crisp local SVG icon data URL for PC software items without a custom icon.
 */
export const getLocalAppFallbackIcon = (title: string): string => {
  const initial = (title.trim().charAt(0) || "A")
    .toUpperCase()
    .replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#2563eb"/></linearGradient></defs><rect width="128" height="128" rx="24" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="56" font-weight="700">${initial}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
