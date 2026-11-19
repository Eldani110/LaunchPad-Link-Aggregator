import React, { useState, useEffect, useMemo } from "react";
import { Category, LinkItem, LinkItemType, TargetOS } from "../types";
import {
  Trash2,
  Sparkles,
  Loader2,
  Folder,
  Image as ImageIcon,
  Copy,
  Download,
  Upload,
  Globe,
  Monitor,
  FolderSearch,
  AppWindow,
  Search,
  Terminal,
  X,
} from "lucide-react";
import { suggestCategory } from "../services/geminiService";
import { useLaunchpad } from "../context/LaunchpadContext";
import {
  getCurrentDesktopOS,
  getDesktopLauncher,
  getDesktopPlatform,
  getLocalAppFallbackIcon,
  getOSLabel,
  inferTargetOSFromPath,
  InstalledAppInfo,
  isDesktopApp,
} from "../services/platform";
import { toast } from "sonner";

interface AddEditFormProps {
  categories: Category[];
  initialData?: LinkItem | null;
  currentFolderId?: string | null;
  onSave: (
    title: string,
    url: string,
    customIconUrl: string | undefined,
    categoryId: string | null,
    itemType: LinkItemType,
    launchArgs?: string,
    targetOs?: TargetOS
  ) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}

export const AddEditForm: React.FC<AddEditFormProps> = ({
  categories,
  initialData,
  currentFolderId,
  onSave,
  onCancel,
  onDelete,
  onDuplicate,
}) => {
  const { importLink } = useLaunchpad();
  const desktopMode = isDesktopApp();
  const desktopPlatform = getDesktopPlatform();
  const currentDesktopOs = getCurrentDesktopOS();

  const [itemType, setItemType] = useState<LinkItemType>("web");
  const [targetOs, setTargetOs] = useState<TargetOS>(currentDesktopOs || "linux");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [launchArgs, setLaunchArgs] = useState("");
  const [customIconUrl, setCustomIconUrl] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Installed PC Apps picker state (Desktop only)
  const [showInstalledPicker, setShowInstalledPicker] = useState(false);
  const [installedApps, setInstalledApps] = useState<InstalledAppInfo[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [appSearch, setAppSearch] = useState("");

  const handleExport = () => {
    if (!initialData) return;
    const data = JSON.stringify(initialData);
    const blob = new Blob([data], { type: "application/json" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `link-${initialData.title}.json`;
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.url && data.title) {
          importLink(data, currentFolderId);
          toast.success(`"${data.title}" importado`);
          onCancel();
        } else {
          toast.error("El archivo no contiene un acceso válido");
        }
      } catch {
        toast.error("Error al leer el archivo JSON");
      }
    };
    reader.readAsText(file);
  };

  // Initialize form if editing, or default to current folder if adding
  useEffect(() => {
    if (initialData) {
      const nextType = initialData.itemType || "web";
      setItemType(nextType);
      setTargetOs(
        initialData.targetOs ||
          (nextType === "app"
            ? inferTargetOSFromPath(initialData.url)
            : currentDesktopOs || "linux")
      );
      setTitle(initialData.title);
      setUrl(initialData.url);
      setLaunchArgs(initialData.launchArgs || "");
      setCustomIconUrl(initialData.customIconUrl || "");
      setCategoryId(initialData.categoryId || "");
    } else {
      setItemType("web");
      setTargetOs(currentDesktopOs || "linux");
      setTitle("");
      setUrl("");
      setLaunchArgs("");
      setCustomIconUrl("");
      setCategoryId(currentFolderId || "");
    }
    setShowInstalledPicker(false);
    setAppSearch("");
  }, [initialData, currentFolderId, currentDesktopOs]);

  const handleOpenInstalledPicker = async () => {
    const launcher = getDesktopLauncher();
    if (!launcher) return;

    if (showInstalledPicker) {
      setShowInstalledPicker(false);
      return;
    }

    setShowInstalledPicker(true);
    if (installedApps.length > 0) return;

    setIsLoadingApps(true);
    try {
      const apps = await launcher.listInstalled(false);
      setInstalledApps(apps);
    } catch {
      toast.error("No se pudieron cargar las aplicaciones instaladas.");
    } finally {
      setIsLoadingApps(false);
    }
  };

  const handleSelectInstalledApp = (appInfo: InstalledAppInfo) => {
    setTitle(appInfo.name);
    setUrl(appInfo.target);
    if (currentDesktopOs) {
      setTargetOs(currentDesktopOs);
    }
    if (appInfo.iconUrl) {
      setCustomIconUrl(appInfo.iconUrl);
    }
    setShowInstalledPicker(false);
    setAppSearch("");
  };

  const handleBrowseAppFile = async () => {
    const launcher = getDesktopLauncher();
    if (!launcher) return;

    try {
      const res = await launcher.pickApp();
      if (!res.canceled && res.app) {
        setUrl(res.app.target);
        if (currentDesktopOs) {
          setTargetOs(currentDesktopOs);
        }
        if (!title.trim()) {
          setTitle(res.app.name);
        }
        if (res.app.iconUrl) {
          setCustomIconUrl(res.app.iconUrl);
        }
      }
    } catch {
      toast.error("No se pudo abrir el selector de archivos.");
    }
  };

  const filteredInstalledApps = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    if (!q) return installedApps;
    return installedApps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) || app.target.toLowerCase().includes(q)
    );
  }, [installedApps, appSearch]);

  // Determine preview icon
  const previewIconUrl =
    customIconUrl ||
    (itemType === "app"
      ? title.trim()
        ? getLocalAppFallbackIcon(title)
        : ""
      : url
      ? `https://www.google.com/s2/favicons?domain=${url}&sz=64`
      : "");

  // Generate hierarchical options for the dropdown
  const categoryOptions = useMemo(() => {
    const options: { id: string; title: string; depth: number }[] = [];
    const childrenMap = new Map<string | null, Category[]>();

    categories.forEach((cat) => {
      const pid = cat.parentId || null;
      if (!childrenMap.has(pid)) {
        childrenMap.set(pid, []);
      }
      childrenMap.get(pid)?.push(cat);
    });

    const traverse = (parentId: string | null, depth: number) => {
      const children = childrenMap.get(parentId);
      if (children) {
        children.sort((a, b) => a.title.localeCompare(b.title));
        children.forEach((child) => {
          options.push({ id: child.id, title: child.title, depth });
          traverse(child.id, depth + 1);
        });
      }
    };

    traverse(null, 0);
    return options;
  }, [categories]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && url.trim()) {
      onSave(
        title.trim(),
        url.trim(),
        customIconUrl.trim() || undefined,
        categoryId === "" ? null : categoryId,
        itemType,
        itemType === "app" ? launchArgs.trim() || undefined : undefined,
        itemType === "app" ? targetOs : undefined
      );
    }
  };

  const handleAiSuggest = async () => {
    if (!url || !title || categories.length === 0) return;
    setIsAiLoading(true);
    try {
      const suggestedName = await suggestCategory(url, title, categories);
      if (suggestedName) {
        const match = categories.find(
          (c) => c.title.toLowerCase() === suggestedName.toLowerCase()
        );
        if (match) {
          setCategoryId(match.id);
        }
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  const appPathPlaceholder =
    desktopPlatform === "win32"
      ? "Ej. C:\\Program Files\\...\\app.exe o notepad"
      : desktopPlatform === "darwin"
      ? "Ej. /Applications/Visual Studio Code.app"
      : "Ej. /usr/share/applications/code.desktop o vlc";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type Switcher: Web Link vs PC Software */}
      <div className="grid grid-cols-2 p-1 bg-black/30 border border-white/10 rounded-xl">
        <button
          type="button"
          onClick={() => {
            setItemType("web");
            setShowInstalledPicker(false);
          }}
          className={`py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
            itemType === "web"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          <Globe size={14} />
          Enlace Web
        </button>
        <button
          type="button"
          onClick={() => setItemType("app")}
          className={`py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
            itemType === "app"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          <Monitor size={14} />
          Programa del PC
        </button>
      </div>

      {/* Desktop App Quick Pickers */}
      {itemType === "app" && (
        <div className="space-y-2">
          {desktopMode ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenInstalledPicker}
                className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                  showInstalledPicker
                    ? "bg-blue-500/20 border-blue-400/50 text-blue-200"
                    : "bg-white/5 hover:bg-white/10 border-white/10 text-white/80 hover:text-white"
                }`}
              >
                <AppWindow size={14} />
                Apps instaladas
              </button>
              <button
                type="button"
                onClick={handleBrowseAppFile}
                className="py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white/80 hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <FolderSearch size={14} />
                Buscar archivo...
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Puedes guardar rutas o comandos aquí, pero para explorar y abrir programas locales usa la versión de escritorio de LaunchPad.
            </p>
          )}

          {/* Embedded Searchable Installed Apps Picker */}
          {showInstalledPicker && (
            <div className="p-3 rounded-xl bg-black/40 border border-white/15 space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={appSearch}
                    onChange={(e) => setAppSearch(e.target.value)}
                    placeholder="Buscar software instalado..."
                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/35 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowInstalledPicker(false)}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"
                  title="Cerrar lista"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                {isLoadingApps ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-white/50">
                    <Loader2 size={14} className="animate-spin" />
                    Escaneando programas del PC...
                  </div>
                ) : filteredInstalledApps.length === 0 ? (
                  <p className="text-center text-xs text-white/40 py-4">
                    No se encontraron programas con ese nombre.
                  </p>
                ) : (
                  filteredInstalledApps.map((appInfo) => (
                    <button
                      key={`${appInfo.name}-${appInfo.target}`}
                      type="button"
                      onClick={() => handleSelectInstalledApp(appInfo)}
                      className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/10 text-left transition-colors"
                    >
                      <div className="w-7 h-7 rounded-md bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                        {appInfo.iconUrl ? (
                          <img
                            src={appInfo.iconUrl}
                            alt=""
                            className="w-full h-full object-contain p-0.5"
                          />
                        ) : (
                          <AppWindow size={14} className="text-blue-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-white truncate">
                          {appInfo.name}
                        </p>
                        <p className="text-[10px] text-white/40 truncate">
                          {appInfo.target}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Icon Preview & URL/Path Row */}
      <div className="flex gap-4">
        <div className="shrink-0">
          <div className="w-16 h-16 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
            {previewIconUrl ? (
              <img
                src={previewIconUrl}
                alt="Preview"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : itemType === "app" ? (
              <AppWindow className="text-blue-300/70" />
            ) : (
              <ImageIcon className="text-white/30" />
            )}
          </div>
          <p className="text-[10px] text-center mt-1 text-white/40 uppercase">
            Vista Previa
          </p>
        </div>

        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400 uppercase">
              {itemType === "app" ? "Ruta del programa o comando" : "URL"}
            </label>
            <input
              type={itemType === "app" ? "text" : "url"}
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={itemType === "app" ? appPathPlaceholder : "https://ejemplo.com"}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-400 uppercase">
          Título
        </label>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={itemType === "app" ? "Ej. Visual Studio Code, Blender..." : "Nombre del Sitio"}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
        />
      </div>

      {/* Optional CLI Arguments & Target OS for PC software */}
      {itemType === "app" && (
        <>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400 uppercase flex justify-between">
              <span>Visible en Sistema Operativo</span>
              {currentDesktopOs && (
                <span className="text-[10px] text-blue-300/80 normal-case font-normal">
                  Detectado: {getOSLabel(currentDesktopOs)}
                </span>
              )}
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: "linux", label: "Ubuntu" },
                  { id: "win32", label: "Windows" },
                  { id: "darwin", label: "macOS" },
                  { id: "all", label: "Todos" },
                ] as { id: TargetOS; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTargetOs(opt.id)}
                  className={`py-2 px-2 rounded-lg border text-xs font-medium transition-all ${
                    targetOs === opt.id
                      ? "bg-blue-600/80 border-blue-400/70 text-white shadow-sm"
                      : "bg-black/20 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/40">
              {targetOs === "all"
                ? "Visible en Windows, Ubuntu y macOS (oculta en navegador web)."
                : `Solo se mostrará al abrir LaunchPad en ${getOSLabel(targetOs)}; en otros sistemas quedará oculta.`}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400 uppercase flex justify-between">
              <span>Argumentos (Opcional)</span>
              <span className="text-[10px] text-white/30 lowercase font-normal">
                ej. --new-window o ruta de proyecto
              </span>
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <Terminal size={15} />
              </div>
              <input
                type="text"
                value={launchArgs}
                onChange={(e) => setLaunchArgs(e.target.value)}
                placeholder="--new-window"
                className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm font-mono"
              />
            </div>
          </div>
        </>
      )}

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-400 uppercase flex justify-between">
          <span>Icono Personalizado (Opcional)</span>
          <span className="text-[10px] text-white/30 lowercase font-normal">
            {itemType === "app" ? "se extrae automáticamente al elegir app" : "dejar vacío para usar automático"}
          </span>
        </label>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <ImageIcon size={16} />
          </div>
          <input
            type="text"
            value={customIconUrl}
            onChange={(e) => setCustomIconUrl(e.target.value)}
            placeholder="https://... o icono detectado automáticamente"
            className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-xs font-medium text-gray-400 uppercase">
            Categoría
          </label>
          {url && title && !isAiLoading && categories.length > 0 && (
            <button
              type="button"
              onClick={handleAiSuggest}
              className="text-xs flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
              title="Seleccionar automáticamente la mejor categoría existente"
            >
              <Sparkles size={12} /> Auto-Seleccionar
            </button>
          )}
          {isAiLoading && (
            <span className="text-xs flex items-center gap-1 text-gray-400">
              <Loader2 size={12} className="animate-spin" /> Pensando...
            </span>
          )}
        </div>

        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <Folder size={16} />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full appearance-none bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer hover:bg-white/5"
          >
            <option value="" className="bg-gray-800 text-white">
              Escritorio (Sin categoría)
            </option>
            {categoryOptions.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-gray-800 text-white">
                {"\u00A0".repeat(opt.depth * 3)}
                {opt.depth > 0 && "└─ "}
                {opt.title}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-white/50"></div>
        </div>

        {categories.length === 0 && (
          <p className="text-[10px] text-amber-400/80 mt-1">
            * Crea categorías en Configuración para organizar tus accesos.
          </p>
        )}
      </div>

      <div className="pt-4 flex items-center justify-between">
        {/* Action Buttons (Left) */}
        <div className="flex gap-2">
          {initialData && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-2 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
              title="Eliminar"
            >
              <Trash2 size={16} />
              <span className="hidden sm:inline">Eliminar</span>
            </button>
          )}
          {initialData && onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              className="flex items-center gap-2 px-3 py-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors text-sm"
              title="Duplicar"
            >
              <Copy size={16} />
              <span className="hidden sm:inline">Duplicar</span>
            </button>
          )}
          {initialData && (
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors text-sm"
              title="Exportar"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          )}
          {!initialData && (
            <label className="flex items-center gap-2 px-3 py-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors text-sm cursor-pointer">
              <Upload size={16} />
              <span className="hidden sm:inline">Importar</span>
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          )}
        </div>

        {/* Action Buttons (Right) */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
          >
            {initialData
              ? "Guardar Cambios"
              : itemType === "app"
              ? "Agregar Programa"
              : "Agregar Enlace"}
          </button>
        </div>
      </div>
    </form>
  );
};
