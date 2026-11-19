import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import {
  DesktopUpdateState,
  getDesktopPlatformLabel,
  getDesktopUpdater,
  isDesktopApp,
} from "../services/platform";

export const DesktopUpdatesSection: React.FC = () => {
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null);

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

    const unsubscribe = updater.onStatusChange((next) => {
      if (active) setUpdateState(next);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!isDesktopApp()) return null;

  const updater = getDesktopUpdater();
  if (!updater) return null;

  const status = updateState?.status ?? "idle";
  const currentVersion = updateState?.currentVersion ?? "1.0.0";
  const latestVersion = updateState?.latestVersion;
  const progress = updateState?.progress ?? 0;
  const canAutoInstall = updateState?.canAutoInstall ?? false;
  const isChecking = status === "checking";
  const isDownloading = status === "downloading";

  return (
    <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-white text-sm">
            Actualizaciones de Escritorio
          </h3>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/70 font-mono">
          v{currentVersion} • {getDesktopPlatformLabel()}
        </span>
      </div>

      {/* Status description */}
      <div className="text-xs text-white/60">
        {isChecking && (
          <span className="flex items-center gap-2 text-blue-300">
            <Loader2 size={13} className="animate-spin" />
            Consultando GitHub Releases...
          </span>
        )}

        {status === "idle" && (
          <span>Las actualizaciones se obtienen automáticamente desde GitHub Releases.</span>
        )}

        {status === "not-available" && (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 size={13} />
            Tienes la versión más reciente instalada (v{currentVersion}).
          </span>
        )}

        {status === "available" && (
          <span className="text-blue-300">
            Nueva versión <strong className="text-white">v{latestVersion}</strong> disponible en
            GitHub Releases.
          </span>
        )}

        {isDownloading && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-blue-300">
              <span>Descargando v{latestVersion}...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {status === "downloaded" && (
          <span className="text-emerald-400">
            Actualización <strong className="text-white">v{latestVersion}</strong> descargada y
            lista para instalar.
          </span>
        )}

        {status === "error" && (
          <span className="flex items-center gap-1.5 text-amber-300">
            <AlertTriangle size={13} className="shrink-0" />
            {updateState?.error || "No se pudo comprobar actualizaciones."}
          </span>
        )}

        {updateState?.error && status === "available" && (
          <p className="mt-1.5 text-[11px] text-amber-300/90">{updateState.error}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {status === "downloaded" ? (
          <button
            type="button"
            onClick={() => void updater.installUpdate()}
            className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            <RefreshCw size={13} />
            Reiniciar e instalar v{latestVersion}
          </button>
        ) : status === "available" ? (
          <button
            type="button"
            onClick={() => void updater.downloadUpdate()}
            className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            {canAutoInstall ? <Download size={13} /> : <ExternalLink size={13} />}
            {canAutoInstall
              ? `Descargar v${latestVersion}`
              : `Descargar v${latestVersion} en GitHub`}
          </button>
        ) : (
          <button
            type="button"
            disabled={isChecking || isDownloading}
            onClick={() => void updater.checkForUpdates()}
            className="flex-1 py-2 px-3 bg-white/10 hover:bg-white/15 disabled:opacity-50 border border-white/10 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            {isChecking ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Buscar actualizaciones
          </button>
        )}

        <button
          type="button"
          onClick={() => void updater.openReleasePage()}
          className="py-2 px-3 bg-black/25 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white rounded-lg text-xs transition-colors flex items-center gap-1.5"
          title="Abrir GitHub Releases"
        >
          <ExternalLink size={13} />
          Releases
        </button>
      </div>
    </div>
  );
};

