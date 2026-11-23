import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertTriangle,
  KeyRound,
  Trash2,
  Monitor,
  Clock,
  Tag,
  History,
  Sparkles,
  Keyboard,
  LayoutGrid,
} from "lucide-react";
import {
  DesktopReleaseItem,
  DesktopUpdateState,
  DesktopWindowMode,
  DesktopWindowPrefs,
  getDesktopPlatformLabel,
  getDesktopUpdater,
  getDesktopWindow,
  isDesktopApp,
} from "../services/platform";

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

const formatDate = (iso: string | null): string => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
};

export const DesktopUpdatesSection: React.FC = () => {
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null);
  const [windowPrefs, setWindowPrefs] = useState<DesktopWindowPrefs | null>(null);
  const [shortcutDraft, setShortcutDraft] = useState("");
  const [releases, setReleases] = useState<DesktopReleaseItem[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");
  const [isSavingToken, setIsSavingToken] = useState(false);

  useEffect(() => {
    if (!isDesktopApp()) return;
    const winBridge = getDesktopWindow();
    if (!winBridge) return;
    let active = true;
    winBridge
      .getPrefs()
      .then((prefs) => {
        if (active) {
          setWindowPrefs(prefs);
          setShortcutDraft(prefs.shortcut || "");
        }
      })
      .catch(() => {});
    const unsub = winBridge.onPrefsChange((next) => {
      if (active) {
        setWindowPrefs(next);
        setShortcutDraft(next.shortcut || "");
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const updateWindowPref = async (patch: Partial<DesktopWindowPrefs>) => {
    const winBridge = getDesktopWindow();
    if (!winBridge) return;
    const next = await winBridge.updatePrefs(patch);
    setWindowPrefs(next);
    setShortcutDraft(next.shortcut || "");
  };

  const loadReleases = useCallback(async () => {
    const updater = getDesktopUpdater();
    if (!updater?.listReleases) return;
    setReleasesLoading(true);
    setReleasesError(null);
    try {
      const res = await updater.listReleases();
      if (res.ok) {
        setReleases(res.releases);
      } else {
        setReleases([]);
        setReleasesError(res.error || null);
      }
    } catch {
      setReleasesError("No se pudo cargar el historial de versiones.");
    } finally {
      setReleasesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDesktopApp()) return;
    const updater = getDesktopUpdater();
    if (!updater) return;

    let active = true;
    updater
      .getState()
      .then((initial) => {
        if (active) setUpdateState(initial);
      })
      .catch(() => {});

    void loadReleases();

    const unsubscribe = updater.onStatusChange((next) => {
      if (active) setUpdateState(next);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadReleases]);

  if (!isDesktopApp()) return null;

  const updater = getDesktopUpdater();
  if (!updater) return null;

  const status = updateState?.status ?? "idle";
  const currentVersion = updateState?.currentVersion ?? "1.0.0";
  const latestVersion = updateState?.latestVersion;
  const progress = updateState?.progress ?? 0;
  const transferred = updateState?.transferred ?? 0;
  const total = updateState?.total ?? 0;
  const bytesPerSecond = updateState?.bytesPerSecond ?? 0;
  const canAutoInstall = updateState?.canAutoInstall ?? false;
  const hasToken = Boolean(updateState?.hasToken);
  const needsAuth = Boolean(updateState?.needsAuth);
  const packageType = updateState?.packageType;
  const checkedAt = updateState?.checkedAt;
  const isChecking = status === "checking";
  const isDownloading = status === "downloading";
  const isInstalling = status === "installing";

  const handleCheck = async () => {
    await updater.checkForUpdates();
    await loadReleases();
  };

  const handleSaveToken = async () => {
    if (!updater.setToken || !tokenDraft.trim()) return;
    setIsSavingToken(true);
    try {
      await updater.setToken(tokenDraft.trim());
      setTokenDraft("");
      setShowTokenInput(false);
      await loadReleases();
    } finally {
      setIsSavingToken(false);
    }
  };

  const handleClearToken = async () => {
    if (!updater.setToken) return;
    setIsSavingToken(true);
    try {
      await updater.setToken(null);
      await loadReleases();
    } finally {
      setIsSavingToken(false);
    }
  };

  const packageLabel =
    packageType && packageType !== "dev" && packageType !== "unknown"
      ? packageType.toUpperCase()
      : "DEV";

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-2 space-y-4">
      {/* Launcher Mode & Behavior Card */}
      {windowPrefs && (
        <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10 space-y-3.5">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-blue-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/85">
              Modo Launcher y Activación
            </h4>
          </div>

          {/* Window Mode Selector */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  id: "launcher" as DesktopWindowMode,
                  title: "Launcher Flotante",
                  desc: "Panel translúcido centrado estilo Spotlight",
                  icon: Sparkles,
                },
                {
                  id: "window" as DesktopWindowMode,
                  title: "Ventana Normal",
                  desc: "Ventana clásica completa con barra lateral",
                  icon: LayoutGrid,
                },
              ]
            ).map((opt) => {
              const IconComp = opt.icon;
              const isSelected = windowPrefs.windowMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (!isSelected) void updateWindowPref({ windowMode: opt.id });
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "bg-blue-600/25 border-blue-400/60 text-white shadow-sm"
                      : "bg-black/20 border-white/10 text-white/65 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <IconComp size={13} className={isSelected ? "text-blue-300" : "text-white/50"} />
                    {opt.title}
                  </div>
                  <p className="text-[10px] text-white/45 mt-1 leading-snug">{opt.desc}</p>
                </button>
              );
            })}
          </div>

          {/* Global Shortcut */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-white/65 flex items-center gap-1.5 font-medium">
                <Keyboard size={12} className="text-blue-300" /> Atajo global (abrir / ocultar)
              </span>
              {windowPrefs.registeredShortcut && !windowPrefs.shortcutError && (
                <span className="text-[10px] text-emerald-300 font-mono">
                  Activo: {windowPrefs.registeredShortcut}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Alt+Space", "CommandOrControl+Shift+Space", "Alt+L", "Control+Alt+Space"].map(
                (preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => void updateWindowPref({ shortcut: preset })}
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono border transition-colors ${
                      windowPrefs.shortcut === preset
                        ? "bg-blue-500/25 border-blue-400/50 text-blue-200"
                        : "bg-black/25 border-white/10 text-white/55 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {preset.replace("CommandOrControl", "Ctrl/Cmd")}
                  </button>
                )
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={shortcutDraft}
                onChange={(e) => setShortcutDraft(e.target.value)}
                placeholder="Ej. Alt+Space o CommandOrControl+Shift+Space"
                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
              <button
                type="button"
                onClick={() => void updateWindowPref({ shortcut: shortcutDraft })}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-xs text-white transition-colors"
              >
                Aplicar
              </button>
            </div>
            {windowPrefs.shortcutError && (
              <p className="text-[11px] text-amber-300">{windowPrefs.shortcutError}</p>
            )}
          </div>

          {/* Glass Translucency Slider (macOS Liquid Glass tuning) */}
          <div className="space-y-1.5 pt-1 border-t border-white/10">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-white/75 font-medium flex items-center gap-2">
                <span>Opacidad del cristal</span>
                {windowPrefs.hasNativeBlur && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 font-normal">
                    Blur GPU nativo
                  </span>
                )}
              </span>
              <span className="font-mono text-blue-300">
                {Math.round((windowPrefs.glassOpacity ?? 0.34) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.10}
              max={0.85}
              step={0.02}
              value={windowPrefs.glassOpacity ?? 0.34}
              onChange={(e) =>
                void updateWindowPref({ glassOpacity: parseFloat(e.target.value) })
              }
              className="w-full accent-blue-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-white/40">
              <span>Cristal puro</span>
              <span>Equilibrado</span>
              <span>Más opaco</span>
            </div>
          </div>

          {/* Behavior Toggles */}
          <div className="space-y-2 pt-1 border-t border-white/10 text-xs">
            <label className="flex items-center justify-between gap-2 cursor-pointer text-white/75 hover:text-white">
              <span>Ocultar automáticamente al hacer clic fuera</span>
              <input
                type="checkbox"
                checked={windowPrefs.autoHideOnBlur}
                onChange={(e) => void updateWindowPref({ autoHideOnBlur: e.target.checked })}
                className="accent-blue-500 w-4 h-4 rounded"
              />
            </label>
            <label className="flex items-center justify-between gap-2 cursor-pointer text-white/75 hover:text-white">
              <span>Ocultar automáticamente al abrir una app o enlace</span>
              <input
                type="checkbox"
                checked={windowPrefs.autoHideOnLaunch}
                onChange={(e) => void updateWindowPref({ autoHideOnLaunch: e.target.checked })}
                className="accent-blue-500 w-4 h-4 rounded"
              />
            </label>
            <label className="flex items-center justify-between gap-2 cursor-pointer text-white/75 hover:text-white">
              <span>Iniciar en segundo plano al encender el PC</span>
              <input
                type="checkbox"
                checked={windowPrefs.openAtLogin}
                onChange={(e) => void updateWindowPref({ openAtLogin: e.target.checked })}
                className="accent-blue-500 w-4 h-4 rounded"
              />
            </label>
          </div>
        </div>
      )}

      {/* Current Installed Version Hero Card */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-blue-900/25 via-indigo-900/20 to-slate-900/40 border border-blue-500/25 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
              <Monitor size={22} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/45 font-medium">
                LaunchPad Escritorio
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-2xl font-semibold text-white font-mono tracking-tight">
                  v{currentVersion}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-white/75 font-medium">
                  {getDesktopPlatformLabel()} • {packageLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Status Pill */}
          <div className="shrink-0">
            {status === "downloaded" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[11px] font-medium text-emerald-300">
                <CheckCircle2 size={12} /> Lista v{latestVersion}
              </span>
            ) : status === "available" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-[11px] font-medium text-blue-200">
                <Download size={12} /> Nueva v{latestVersion}
              </span>
            ) : status === "not-available" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[11px] font-medium text-emerald-300">
                <CheckCircle2 size={12} /> Actualizada
              </span>
            ) : isChecking || isDownloading ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-400/25 text-[11px] font-medium text-blue-200">
                <Loader2 size={12} className="animate-spin" />
                {isDownloading ? `${progress}%` : "Comprobando"}
              </span>
            ) : status === "error" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-[11px] font-medium text-amber-300">
                <AlertTriangle size={12} /> Revisar
              </span>
            ) : null}
          </div>
        </div>

        {/* Status Message / Live Download Progress */}
        <div className="text-xs text-white/70 bg-black/25 border border-white/10 rounded-lg p-3">
          {isChecking && (
            <span className="flex items-center gap-2 text-blue-300">
              <Loader2 size={14} className="animate-spin shrink-0" />
              Buscando nuevas versiones en GitHub Releases...
            </span>
          )}

          {status === "idle" && (
            <span>
              Comprueba si existe una versión nueva en GitHub Releases para actualizar tu app de escritorio.
            </span>
          )}

          {status === "not-available" && (
            <span className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 size={14} className="shrink-0" />
              Tienes instalada la versión más reciente disponible (v{currentVersion}).
            </span>
          )}

          {status === "available" && (
            <div className="space-y-1">
              <p className="text-blue-200 font-medium">
                Nueva versión v{latestVersion} disponible (tienes v{currentVersion}).
              </p>
              {updateState?.error && (
                <p className="text-[11px] text-amber-300/90">{updateState.error}</p>
              )}
            </div>
          )}

          {isDownloading && (
            <div className="space-y-2">
              <div className="flex justify-between text-blue-200 font-medium">
                <span>Descargando LaunchPad v{latestVersion}...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-white/45">
                <span>
                  {formatBytes(transferred)} / {formatBytes(total)}
                </span>
                <span>{bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : ""}</span>
              </div>
            </div>
          )}

          {status === "downloaded" && (
            <div className="space-y-1">
              <span className="text-emerald-300 block">
                La actualización <strong className="text-white">v{latestVersion}</strong> ya está descargada y lista para instalarse.
              </span>
              {updateState?.error && (
                <p className="text-[11px] text-amber-300/95">{updateState.error}</p>
              )}
            </div>
          )}

          {isInstalling && (
            <span className="flex items-center gap-2 text-blue-200">
              <Loader2 size={14} className="animate-spin shrink-0" />
              Instalando actualización v{latestVersion} y reiniciando LaunchPad...
            </span>
          )}

          {status === "error" && (
            <span className="flex items-start gap-2 text-amber-300 leading-relaxed">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{updateState?.error || "No se pudo comprobar actualizaciones."}</span>
            </span>
          )}
        </div>

        {/* Action Buttons + Last Checked */}
        <div className="flex flex-wrap items-center gap-2">
          {isInstalling ? (
            <button
              type="button"
              disabled
              className="flex-1 py-2.5 px-4 bg-blue-600/70 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 opacity-80"
            >
              <Loader2 size={14} className="animate-spin" />
              Instalando v{latestVersion}...
            </button>
          ) : status === "downloaded" ? (
            <button
              type="button"
              onClick={() => void updater.installUpdate()}
              className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              <RefreshCw size={14} />
              Reiniciar e instalar v{latestVersion}
            </button>
          ) : status === "available" ? (
            <button
              type="button"
              onClick={() => void updater.downloadUpdate()}
              className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
            >
              {canAutoInstall ? <Download size={14} /> : <ExternalLink size={14} />}
              {canAutoInstall
                ? `Descargar e instalar v${latestVersion}`
                : `Descargar v${latestVersion} en GitHub`}
            </button>
          ) : (
            <button
              type="button"
              disabled={isChecking || isDownloading}
              onClick={() => void handleCheck()}
              className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
            >
              {isChecking ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Buscar actualizaciones
            </button>
          )}

          <button
            type="button"
            onClick={() => void updater.openReleasePage()}
            className="py-2.5 px-3.5 bg-white/5 hover:bg-white/15 border border-white/10 text-white/80 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            title="Abrir GitHub Releases en el navegador"
          >
            <ExternalLink size={13} />
            GitHub Releases
          </button>
        </div>

        {checkedAt && (
          <div className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Clock size={11} />
            Última comprobación:{" "}
            {new Date(checkedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>

      {/* Releases History Section */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={15} className="text-blue-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/80">
              Historial de versiones
            </h4>
          </div>
          <button
            type="button"
            disabled={releasesLoading}
            onClick={() => void loadReleases()}
            className="text-[11px] text-white/45 hover:text-white flex items-center gap-1 transition-colors"
          >
            <RefreshCw size={11} className={releasesLoading ? "animate-spin" : ""} />
            Actualizar lista
          </button>
        </div>

        {releasesLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-white/50">
            <Loader2 size={14} className="animate-spin" />
            Cargando versiones desde GitHub...
          </div>
        ) : releasesError ? (
          <p className="text-xs text-amber-300/85 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            {releasesError}
          </p>
        ) : releases.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-4 italic">
            No hay lanzamientos publicados todavía en GitHub Releases.
          </p>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {releases.map((rel) => (
              <div
                key={rel.id}
                className={`p-3 rounded-lg border transition-colors ${
                  rel.isCurrent
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-black/25 border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Tag size={12} className="text-blue-300 shrink-0" />
                    <span className="text-xs font-semibold text-white font-mono">
                      {rel.tagName}
                    </span>
                    {rel.isCurrent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                        Instalada
                      </span>
                    )}
                    {rel.isLatest && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">
                        Más reciente
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {rel.publishedAt && (
                      <span className="text-[10px] text-white/40">
                        {formatDate(rel.publishedAt)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void updater.openReleasePage(rel.htmlUrl)}
                      className="p-1 rounded text-white/45 hover:text-white hover:bg-white/10 transition-colors"
                      title="Ver lanzamiento en GitHub"
                    >
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </div>
                {rel.body && (
                  <p className="mt-1.5 text-[11px] text-white/55 line-clamp-2 whitespace-pre-line">
                    {rel.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Optional GitHub Token for Private Repositories */}
      {updater.setToken && (
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowTokenInput((prev) => !prev)}
              className="text-xs text-white/60 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <KeyRound size={13} />
              {hasToken
                ? "Token de GitHub configurado (repositorio privado)"
                : needsAuth
                ? "Configurar Token de GitHub (repositorio privado)"
                : "Acceso a repositorio privado (Token opcional)"}
            </button>
            {hasToken && (
              <button
                type="button"
                disabled={isSavingToken}
                onClick={() => void handleClearToken()}
                className="text-[11px] text-red-300/80 hover:text-red-300 flex items-center gap-1"
                title="Quitar token guardado"
              >
                <Trash2 size={11} /> Quitar
              </button>
            )}
          </div>

          {(showTokenInput || needsAuth) && (
            <div className="space-y-1.5 pt-1">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenDraft}
                  onChange={(e) => setTokenDraft(e.target.value)}
                  placeholder="ghp_... o github_pat_... (solo lectura Contents)"
                  className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                />
                <button
                  type="button"
                  disabled={isSavingToken || !tokenDraft.trim()}
                  onClick={() => void handleSaveToken()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  {isSavingToken ? "..." : "Guardar"}
                </button>
              </div>
              <p className="text-[10px] text-white/40">
                Se guarda cifrado localmente. No es necesario si el repositorio es público.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
