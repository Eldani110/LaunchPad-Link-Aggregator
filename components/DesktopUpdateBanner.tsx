import React, { useEffect, useState } from "react";
import { Download, ExternalLink, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import {
  DesktopUpdateState,
  getDesktopUpdater,
  isDesktopApp,
} from "../services/platform";

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

export const DesktopUpdateBanner: React.FC = () => {
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

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
      if (!active) return;
      setUpdateState(next);
      if (next.status === "downloaded") {
        setDismissedVersion(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!isDesktopApp() || !updateState) return null;

  const { status, latestVersion, progress, transferred, total, bytesPerSecond, canAutoInstall } =
    updateState;

  const isVisibleStatus =
    status === "available" ||
    status === "downloading" ||
    status === "downloaded" ||
    status === "installing";

  if (!isVisibleStatus) return null;
  if (status === "available" && latestVersion && dismissedVersion === latestVersion) {
    return null;
  }

  const updater = getDesktopUpdater();
  if (!updater) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[60] w-80 max-w-[calc(100vw-2.5rem)] bg-gray-900/90 backdrop-blur-2xl border border-white/15 rounded-2xl p-4 shadow-2xl text-white animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0 text-blue-300">
            {status === "downloading" || status === "installing" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : status === "downloaded" ? (
              <RefreshCw size={15} />
            ) : (
              <Sparkles size={15} />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">
              {status === "installing"
                ? `Instalando v${latestVersion}...`
                : status === "downloaded"
                ? `Actualización v${latestVersion} lista`
                : status === "downloading"
                ? `Descargando v${latestVersion}...`
                : `Nueva versión v${latestVersion}`}
            </p>
            <p className="text-[11px] text-white/50 truncate">
              Actual: v{updateState.currentVersion} • GitHub Releases
            </p>
          </div>
        </div>

        {status !== "downloading" && status !== "installing" && (
          <button
            type="button"
            onClick={() => setDismissedVersion(latestVersion || "dismissed")}
            className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            title="Ocultar aviso"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {status === "downloading" && (
        <div className="space-y-1.5 mt-3">
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-white/50">
            <span>
              {formatBytes(transferred)} / {formatBytes(total)}
            </span>
            <span>
              {progress}%{bytesPerSecond > 0 ? ` • ${formatBytes(bytesPerSecond)}/s` : ""}
            </span>
          </div>
        </div>
      )}

      {status === "available" && (
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => void updater.downloadUpdate()}
            className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/20"
          >
            {canAutoInstall ? <Download size={14} /> : <ExternalLink size={14} />}
            {canAutoInstall ? "Descargar actualización" : "Descargar en GitHub"}
          </button>
          <button
            type="button"
            onClick={() => void updater.openReleasePage()}
            className="py-2 px-2.5 bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white rounded-xl text-xs transition-colors"
            title="Ver notas de la versión en GitHub"
          >
            Notas
          </button>
        </div>
      )}

      {status === "downloaded" && (
        <div className="space-y-2 mt-3">
          {updateState.error && (
            <p className="text-[11px] text-amber-300 leading-snug">{updateState.error}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void updater.installUpdate()}
              className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20"
            >
              <RefreshCw size={14} />
              Reiniciar e instalar
            </button>
          </div>
        </div>
      )}

      {status === "installing" && (
        <p className="mt-2.5 text-[11px] text-blue-200">
          Aplicando actualización y reiniciando LaunchPad...
        </p>
      )}
    </div>
  );
};

