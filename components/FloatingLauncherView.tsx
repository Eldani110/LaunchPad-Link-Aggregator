import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  FolderPlus,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Plus,
  Power,
  Search,
  Settings,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { Category, LinkItem } from "../types";
import { useLaunchpad } from "../context/LaunchpadContext";
import { Icon } from "./Icon";
import { AddAccountModal } from "./AddAccountModal";
import {
  DesktopUpdateState,
  DesktopWindowPrefs,
  getDesktopPlatform,
  getDesktopWindow,
  getLocalAppFallbackIcon,
  isLinkVisibleOnCurrentPlatform,
} from "../services/platform";

interface FloatingLauncherViewProps {
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
  onLinkClick: (link: LinkItem) => void;
  onEditLink: (link: LinkItem) => void;
  onEditCategory: (cat: Category) => void;
  onAddLinkClick: () => void;
  onAddFolderClick: () => void;
  onOpenSettings: (tab: "categories" | "general" | "desktop") => void;
  desktopPrefs: DesktopWindowPrefs;
  desktopUpdateState: DesktopUpdateState | null;
  hasModalOpen: boolean;
}

export const FloatingLauncherView: React.FC<FloatingLauncherViewProps> = ({
  activeFolderId,
  setActiveFolderId,
  onLinkClick,
  onEditLink,
  onEditCategory,
  onAddLinkClick,
  onAddFolderClick,
  onOpenSettings,
  desktopPrefs,
  desktopUpdateState,
  hasModalOpen,
}) => {
  const {
    links,
    categories,
    accounts,
    activeSlotId,
    switchAccount,
    isSyncing,
  } = useLaunchpad();

  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const platform = getDesktopPlatform();
  const isMac = platform === "darwin";

  // Pause auto-hide while local popover menus or AddAccountModal are open
  useEffect(() => {
    const winBridge = getDesktopWindow();
    if (!winBridge || !isAddAccountOpen) return;
    void winBridge.setAutoHidePaused(true);
    return () => {
      void winBridge.setAutoHidePaused(false);
    };
  }, [isAddAccountOpen]);

  // Auto-focus search input on mount and every time the launcher window is shown
  useEffect(() => {
    const focusInput = () => {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 20);
    };
    focusInput();

    const winBridge = getDesktopWindow();
    if (!winBridge) return;
    const unsub = winBridge.onShown(() => {
      setQuery("");
      setMenuOpen(false);
      setAccountMenuOpen(false);
      focusInput();
    });
    return unsub;
  }, []);

  // Close dropdown menus when clicking outside
  useEffect(() => {
    if (!menuOpen && !accountMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuOpen && menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (
        accountMenuOpen &&
        accountMenuRef.current &&
        !accountMenuRef.current.contains(target)
      ) {
        setAccountMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [menuOpen, accountMenuOpen]);

  const platformVisibleLinks = useMemo(
    () => links.filter((l) => isLinkVisibleOnCurrentPlatform(l)),
    [links]
  );

  const rootCategories = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories]
  );

  const breadcrumbs = useMemo(() => {
    const crumbs: Category[] = [];
    let current = activeFolderId;
    while (current) {
      const cat = categories.find((c) => c.id === current);
      if (!cat) break;
      crumbs.unshift(cat);
      current = cat.parentId || null;
    }
    return crumbs;
  }, [activeFolderId, categories]);

  const activeRootCategoryId = breadcrumbs.length > 0 ? breadcrumbs[0].id : null;

  const categoryStats = useMemo(() => {
    const linkCounts = new Map<string, number>();
    const previewMap = new Map<string, string[]>();
    const subFolderCounts = new Map<string, number>();

    for (const l of platformVisibleLinks) {
      if (!l.categoryId) continue;
      linkCounts.set(l.categoryId, (linkCounts.get(l.categoryId) || 0) + 1);
      const previews = previewMap.get(l.categoryId) || [];
      if (previews.length < 4) {
        previews.push(
          l.customIconUrl ||
            (l.itemType === "app"
              ? getLocalAppFallbackIcon(l.title)
              : `https://www.google.com/s2/favicons?domain=${l.url}&sz=128`)
        );
        previewMap.set(l.categoryId, previews);
      }
    }

    for (const c of categories) {
      if (!c.parentId) continue;
      subFolderCounts.set(c.parentId, (subFolderCounts.get(c.parentId) || 0) + 1);
    }

    return { linkCounts, previewMap, subFolderCounts };
  }, [platformVisibleLinks, categories]);

  const normalizedQuery = query.trim().toLowerCase();

  // When searching: filter across ALL categories & links globally; otherwise show current level
  const displayedCategories = useMemo(() => {
    if (normalizedQuery) {
      return categories.filter((c) =>
        c.title.toLowerCase().includes(normalizedQuery)
      );
    }
    // In root view, categories already appear in the horizontal pill bar,
    // while subfolders appear inside the grid when inside a category
    if (!activeFolderId) {
      return [];
    }
    return categories.filter((c) => (c.parentId || null) === activeFolderId);
  }, [categories, normalizedQuery, activeFolderId]);

  const displayedLinks = useMemo(() => {
    if (normalizedQuery) {
      return platformVisibleLinks.filter(
        (l) =>
          l.title.toLowerCase().includes(normalizedQuery) ||
          l.url.toLowerCase().includes(normalizedQuery)
      );
    }
    if (!activeFolderId) {
      // On root "Todas": show root links first, then all links so everything is 1 click away just like macOS Apps
      const rootLinks = platformVisibleLinks.filter((l) => !l.categoryId);
      const categorizedLinks = platformVisibleLinks.filter((l) => Boolean(l.categoryId));
      return [...rootLinks, ...categorizedLinks];
    }
    return platformVisibleLinks.filter(
      (l) => (l.categoryId || null) === activeFolderId
    );
  }, [platformVisibleLinks, normalizedQuery, activeFolderId]);

  // Keyboard navigation: Esc clears search -> goes up folder -> hides launcher; Enter launches #1 match
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (hasModalOpen || isAddAccountOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (menuOpen || accountMenuOpen) {
          setMenuOpen(false);
          setAccountMenuOpen(false);
          return;
        }
        if (query.trim()) {
          setQuery("");
          return;
        }
        if (activeFolderId) {
          const currentCat = categories.find((c) => c.id === activeFolderId);
          setActiveFolderId(currentCat?.parentId || null);
          return;
        }
        void getDesktopWindow()?.hide();
      } else if (e.key === "Enter" && normalizedQuery) {
        if (displayedLinks.length > 0) {
          e.preventDefault();
          onLinkClick(displayedLinks[0]);
        } else if (displayedCategories.length > 0) {
          e.preventDefault();
          setQuery("");
          setActiveFolderId(displayedCategories[0].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    hasModalOpen,
    isAddAccountOpen,
    menuOpen,
    accountMenuOpen,
    query,
    normalizedQuery,
    activeFolderId,
    categories,
    displayedLinks,
    displayedCategories,
    onLinkClick,
    setActiveFolderId,
  ]);

  const activeAccount = accounts.find((a) => a.slotId === activeSlotId);
  const hasDesktopUpdate =
    desktopUpdateState?.status === "available" ||
    desktopUpdateState?.status === "downloaded";

  const handleSwitchToNormalWindow = () => {
    setMenuOpen(false);
    void getDesktopWindow()?.updatePrefs({ windowMode: "window" });
  };

  return (
    <div className="h-screen w-screen bg-transparent p-1.5 select-none">
      {/* Main Translucent Floating Glass Panel (macOS Apps / Spotlight style) */}
      <div
        className={`relative h-full w-full rounded-[26px] border border-white/20 shadow-[0_24px_70px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col text-slate-100 ${
          isMac
            ? "bg-slate-900/50 backdrop-blur-3xl"
            : "bg-slate-900/82 backdrop-blur-3xl"
        }`}
      >
        {/* Top Search Bar (draggable window handle) */}
        <div className="electron-drag px-5 pt-4 pb-3 flex items-center gap-3 border-b border-white/10">
          <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white/80 shrink-0">
            <Search size={17} />
          </div>

          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Apps y enlaces..."
            className="electron-no-drag flex-1 bg-transparent text-2xl font-light text-white placeholder-white/40 focus:outline-none tracking-tight"
          />

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchInputRef.current?.focus();
              }}
              className="electron-no-drag p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              title="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}

          {/* Account Switcher Pill */}
          {accounts.length > 0 && (
            <div ref={accountMenuRef} className="electron-no-drag relative">
              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen((prev) => !prev);
                  setMenuOpen(false);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/15 border border-white/10 text-xs text-white/80 transition-colors"
                title={activeAccount?.email || "Cambiar cuenta"}
              >
                {activeAccount?.logoImage ? (
                  <img
                    src={activeAccount.logoImage}
                    alt=""
                    className="w-4 h-4 rounded-full object-cover"
                  />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-blue-500/50 text-[10px] font-semibold flex items-center justify-center text-white">
                    {(activeAccount?.appTitle || activeAccount?.email || "L")
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                )}
                <span className="max-w-[96px] truncate hidden sm:inline">
                  {activeAccount?.appTitle || activeAccount?.email?.split("@")[0]}
                </span>
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-gray-900/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-1.5 z-50">
                  <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                    Cuentas conectadas
                  </div>
                  {accounts.map((acc) => {
                    const isActive = acc.slotId === activeSlotId;
                    return (
                      <button
                        key={acc.slotId}
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          if (!isActive) {
                            void switchAccount(acc.slotId);
                            setActiveFolderId(null);
                          }
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left text-xs transition-colors ${
                          isActive
                            ? "bg-white/15 text-white font-medium"
                            : "text-white/70 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-400/90 opacity-90" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{acc.appTitle || "LaunchPad"}</p>
                          <p className="text-[10px] text-white/40 truncate">{acc.email}</p>
                        </div>
                      </button>
                    );
                  })}
                  <div className="my-1 border-t border-white/10" />
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setIsAddAccountOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-blue-300 hover:bg-blue-500/15 transition-colors"
                  >
                    <UserPlus size={13} />
                    Agregar otra cuenta
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Three-dot (...) Menu Button (just like top-right of macOS Apps!) */}
          <div ref={menuRef} className="electron-no-drag relative">
            <button
              type="button"
              onClick={() => {
                setMenuOpen((prev) => !prev);
                setAccountMenuOpen(false);
              }}
              className="relative p-2 rounded-full bg-white/[0.08] hover:bg-white/20 border border-white/10 text-white/80 hover:text-white transition-colors"
              title="Más opciones"
            >
              <MoreHorizontal size={17} />
              {hasDesktopUpdate && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-gray-900/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-1.5 z-50 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onAddLinkClick();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/85 hover:bg-white/10 transition-colors"
                >
                  <Plus size={14} className="text-blue-400" />
                  Agregar enlace o programa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onAddFolderClick();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/85 hover:bg-white/10 transition-colors"
                >
                  <FolderPlus size={14} className="text-indigo-300" />
                  Nueva categoría / carpeta
                </button>
                <div className="my-1 border-t border-white/10" />
                <button
                  type="button"
                  onClick={handleSwitchToNormalWindow}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/85 hover:bg-white/10 transition-colors"
                >
                  <Maximize2 size={14} className="text-white/60" />
                  Cambiar a Ventana Normal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings("categories");
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/85 hover:bg-white/10 transition-colors"
                >
                  <Settings size={14} className="text-white/60" />
                  Configuración
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings("desktop");
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-white/85 hover:bg-white/10 transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <Sparkles size={14} className="text-emerald-400" />
                    Escritorio y actualizaciones
                  </span>
                  {desktopUpdateState?.currentVersion && (
                    <span className="text-[10px] font-mono text-white/45">
                      v{desktopUpdateState.currentVersion}
                    </span>
                  )}
                </button>
                <div className="my-1 border-t border-white/10" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void getDesktopWindow()?.quit();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-300 hover:bg-red-500/15 transition-colors"
                >
                  <Power size={14} />
                  Salir de LaunchPad
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Horizontal Category Pills Bar (just like macOS Apps categories!) */}
        {!normalizedQuery && (
          <div className="px-5 py-2.5 flex items-center gap-1.5 overflow-x-auto border-b border-white/[0.07] shrink-0">
            <button
              type="button"
              onClick={() => setActiveFolderId(null)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 border ${
                !activeFolderId
                  ? "bg-white/20 border-white/30 text-white shadow-sm"
                  : "bg-white/[0.06] border-transparent text-white/65 hover:bg-white/12 hover:text-white"
              }`}
            >
              Todas
            </button>

            {rootCategories.map((cat) => {
              const isSelected = activeRootCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveFolderId(cat.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onEditCategory(cat);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 border ${
                    isSelected
                      ? "bg-white/20 border-white/30 text-white shadow-sm"
                      : "bg-white/[0.06] border-transparent text-white/65 hover:bg-white/12 hover:text-white"
                  }`}
                >
                  {cat.title}
                </button>
              );
            })}

            <button
              type="button"
              onClick={onAddFolderClick}
              className="p-1.5 rounded-full bg-white/[0.05] hover:bg-white/15 text-white/45 hover:text-white transition-colors shrink-0"
              title="Nueva categoría"
            >
              <Plus size={13} />
            </button>
          </div>
        )}

        {/* Subfolder Breadcrumbs (only when inside a nested subfolder) */}
        {!normalizedQuery && breadcrumbs.length > 1 && (
          <div className="px-5 pt-2 flex items-center gap-1.5 text-xs text-white/55 shrink-0">
            <button
              type="button"
              onClick={() => {
                const current = categories.find((c) => c.id === activeFolderId);
                setActiveFolderId(current?.parentId || null);
              }}
              className="p-1 rounded-md hover:bg-white/10 text-white/70 hover:text-white"
              title="Volver"
            >
              <ChevronLeft size={14} />
            </button>
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={crumb.id}>
                {i > 0 && <ChevronRight size={12} className="text-white/30" />}
                <button
                  type="button"
                  onClick={() => setActiveFolderId(crumb.id)}
                  className={`px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors ${
                    crumb.id === activeFolderId ? "text-white font-medium" : "text-white/55"
                  }`}
                >
                  {crumb.title}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Main Icon Grid */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {displayedCategories.length === 0 && displayedLinks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/40 gap-3 py-10">
              <p className="text-sm">
                {normalizedQuery
                  ? `Sin resultados para "${query}"`
                  : "No hay apps ni enlaces en esta vista"}
              </p>
              {!normalizedQuery && (
                <button
                  type="button"
                  onClick={onAddLinkClick}
                  className="px-4 py-2 rounded-xl bg-blue-600/80 hover:bg-blue-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  Agregar enlace o programa
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-x-2 gap-y-4 justify-items-center items-start">
              {displayedCategories.map((cat) => {
                const catLinksCount = categoryStats.linkCounts.get(cat.id) || 0;
                const subFoldersCount = categoryStats.subFolderCounts.get(cat.id) || 0;
                const previewIcons = categoryStats.previewMap.get(cat.id) || [];

                return (
                  <Icon
                    key={cat.id}
                    title={cat.title}
                    isFolder
                    itemCount={catLinksCount + subFoldersCount}
                    subIcons={previewIcons}
                    onClick={() => {
                      setQuery("");
                      setActiveFolderId(cat.id);
                    }}
                    onEdit={() => onEditCategory(cat)}
                    size="small"
                  />
                );
              })}

              {displayedLinks.map((link, idx) => (
                <div
                  key={link.id}
                  className={
                    normalizedQuery && idx === 0
                      ? "rounded-xl ring-2 ring-blue-400/70 bg-white/[0.06]"
                      : ""
                  }
                >
                  <Icon
                    title={link.title}
                    url={link.url}
                    itemType={link.itemType}
                    customIconUrl={link.customIconUrl}
                    onClick={() => onLinkClick(link)}
                    onEdit={() => onEditLink(link)}
                    size="small"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ultra-compact Glass Footer */}
        <div className="px-5 py-2 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-white/45 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              {isSyncing ? (
                <>
                  <Loader2 size={11} className="animate-spin text-blue-400" />
                  <span>Sincronizando...</span>
                </>
              ) : (
                <>
                  <Cloud size={11} className="text-emerald-400/80" />
                  <span>Sincronizado</span>
                </>
              )}
            </span>

            {desktopUpdateState?.currentVersion && (
              <button
                type="button"
                onClick={() => onOpenSettings("desktop")}
                className={`font-mono transition-colors ${
                  hasDesktopUpdate
                    ? "text-emerald-300 hover:text-emerald-200 font-semibold"
                    : "text-white/40 hover:text-white/80"
                }`}
                title="Ver versión y actualizaciones"
              >
                v{desktopUpdateState.currentVersion}
                {hasDesktopUpdate ? ` • Nueva v${desktopUpdateState.latestVersion}` : ""}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {desktopPrefs.registeredShortcut && (
              <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-white/[0.07] border border-white/10 font-mono text-white/50">
                {desktopPrefs.registeredShortcut}
              </span>
            )}
            <button
              type="button"
              onClick={handleSwitchToNormalWindow}
              className="hover:text-white transition-colors flex items-center gap-1"
              title="Abrir en ventana normal completa"
            >
              <Maximize2 size={11} />
              <span>Ventana normal</span>
            </button>
          </div>
        </div>
      </div>

      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onAccountAdded={() => setActiveFolderId(null)}
      />
    </div>
  );
};

