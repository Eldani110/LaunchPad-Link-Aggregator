
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { LinkItem, Category } from "../types";
import { useLaunchpad } from "../context/LaunchpadContext";
import { Icon } from "../components/Icon";
import { SortableIcon } from "../components/SortableIcon";
import { Dock } from "../components/Dock";
import { GlassModal } from "../components/GlassModal";
import { AddEditForm } from "../components/AddEditForm";
import { SettingsForm } from "../components/SettingsForm";
import { ListView } from "../components/ListView";
import { CategorySidebar } from "../components/CategorySidebar";
import { ConfirmModal } from "../components/ConfirmModal";
import { AccountTabsBar } from "../components/AccountTabsBar";
import { ChevronRight, Home as HomeIcon, Settings, Cloud, Loader2, Trash2, LayoutGrid, List as ListIcon, AlertCircle, Menu, Share2, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

export const Home = () => {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const { 
    links, 
    categories, 
    appTitle,
    backgroundImage,
    logoImage,
    saveLink, 
    deleteLink, 
    duplicateLink,
    deleteCategory, 
    addCategory, 
    updateCategory, 
    duplicateCategory,
    updateAppTitle, 
    updateBackgroundImage,
    updateLogoImage,
    replaceLinks,
    replaceCategories,
    isSyncing,
    lastSyncTime,
    iconSize,
    layoutMode,
    updateLayoutMode,
    error,
    clearError
  } = useLaunchpad();

  // Local UI State
  const activeFolderId = categoryId || null;
  const setActiveFolderId = (id: string | null) => {
    if (id) {
      navigate(`/category/${id}`);
    } else {
      navigate("/");
    }
  };
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sidebar toggle for mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Category Edit State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [tempCategoryName, setTempCategoryName] = useState("");
  const [tempCategoryParentId, setTempCategoryParentId] = useState<string | null>(null);
  
  // New Folder Creation State
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  
  // Category Delete Confirmation State
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [showCategoryDeleteConfirm, setShowCategoryDeleteConfirm] = useState(false);

  // DnD State
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // ESC Key Handler for Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeFolderId) {
        // Go up one level
        const currentCat = categories.find(c => c.id === activeFolderId);
        setActiveFolderId(currentCat?.parentId || null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFolderId, categories]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            distance: 8, // Require movement before drag starts (prevents click accidental drag)
        }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // --- Handlers ---
  const handleEditClick = (link: LinkItem) => {
    setEditingLink(link);
    setIsLinkModalOpen(true);
  };

  const handleEditCategoryClick = (cat: Category) => {
    setEditingCategory(cat);
    setTempCategoryName(cat.title);
    setTempCategoryParentId(cat.parentId || null);
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCategory && tempCategoryName.trim()) {
      updateCategory(editingCategory.id, tempCategoryName, tempCategoryParentId);
      setIsCategoryModalOpen(false);
      setEditingCategory(null);
    }
  };
  
  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      addCategory(newFolderName, newFolderParentId);
      setNewFolderName("");
      setIsNewFolderModalOpen(false);
    }
  };

  const handleLinkClick = (link: LinkItem) => {
    window.open(link.url, "_blank");
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Enlace copiado al portapapeles");
    }).catch(() => {
      toast.error("Error al copiar el enlace");
    });
  };

  const handleDeleteCategoryRequest = (categoryId: string) => {
    const cat = categories.find(c => c.id === categoryId);
    if (cat) {
        setCategoryToDelete(cat);
        setShowCategoryDeleteConfirm(true);
    }
  };

  const executeDeleteCategory = () => {
    if (categoryToDelete) {
      deleteCategory(categoryToDelete.id);
      
      // If we were inside that folder, move up
      if (activeFolderId === categoryToDelete.id) {
         setActiveFolderId(categoryToDelete.parentId || null);
      }
      
      // Close Single Edit Modal if applicable
      if (editingCategory?.id === categoryToDelete.id) {
          setIsCategoryModalOpen(false);
          setEditingCategory(null);
      }
      
      setShowCategoryDeleteConfirm(false);
      setCategoryToDelete(null);
    }
  };

  const executeDeleteLink = () => {
    if (editingLink) {
      deleteLink(editingLink.id);
      setShowDeleteConfirm(false);
      setIsLinkModalOpen(false);
      setEditingLink(null);
    }
  };

  // --- Breadcrumb Helper ---
  const getBreadcrumbs = () => {
      const crumbs = [];
      let currentId = activeFolderId;
      
      while (currentId) {
          const cat = categories.find(c => c.id === currentId);
          if (cat) {
              crumbs.unshift(cat);
              currentId = cat.parentId || null;
          } else {
              break;
          }
      }
      return crumbs;
  };

  // --- DnD Handlers ---
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  // Helper to check circular dependencies
  const isDescendant = (potentialDescendantId: string, targetId: string): boolean => {
      if (potentialDescendantId === targetId) return true;
      const children = categories.filter(c => c.parentId === potentialDescendantId);
      for (const child of children) {
          if (isDescendant(child.id, targetId)) return true;
      }
      return false;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) return;

    if (active.id !== over.id) {
        const overCategory = categories.find(c => c.id === over.id);
        const activeCategory = categories.find(c => c.id === active.id);
        
        if (activeCategory && overCategory) {
            if (!isDescendant(activeCategory.id, overCategory.id)) {
                // Nesting logic logic placeholder
            }
        }
    }

    // Reordering Logic
    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const currentLevelLinks = visibleLinks;
    const currentLevelCats = visibleCategories;

    // Is it a Category Reorder?
    const oldCatIndex = currentLevelCats.findIndex(c => c.id === activeId);
    const newCatIndex = currentLevelCats.findIndex(c => c.id === overId);

    if (oldCatIndex !== -1 && newCatIndex !== -1) {
        const newOrderedCats = arrayMove(currentLevelCats, oldCatIndex, newCatIndex);
        const unrelatedCats = categories.filter(c => {
             const p = c.parentId || null;
             const a = activeFolderId || null;
             return p !== a;
        });
        replaceCategories([...unrelatedCats, ...newOrderedCats]);
        return;
    }

    // Is it a Link Reorder?
    const oldLinkIndex = currentLevelLinks.findIndex(l => l.id === activeId);
    const newLinkIndex = currentLevelLinks.findIndex(l => l.id === overId);

    if (oldLinkIndex !== -1 && newLinkIndex !== -1) {
        const newOrderedLinks = arrayMove(currentLevelLinks, oldLinkIndex, newLinkIndex);
        const unrelatedLinks = links.filter(l => {
            const c = l.categoryId || null;
            const a = activeFolderId || null;
            return c !== a;
        });
        replaceLinks([...unrelatedLinks, ...newOrderedLinks]);
    }
  };

  // --- Hierarchy Helper for Selects ---
  const getFlattenedCategories = (parentId: string | null = null, depth: number = 0): { id: string, title: string, depth: number }[] => {
    const results: { id: string, title: string, depth: number }[] = [];
    const children = categories.filter(c => (c.parentId || null) === parentId);
    
    // Sort alphabetically for consistency
    children.sort((a, b) => a.title.localeCompare(b.title));

    for (const child of children) {
      results.push({ id: child.id, title: child.title, depth });
      results.push(...getFlattenedCategories(child.id, depth + 1));
    }
    return results;
  };

  // --- Derived State ---
  const visibleCategories = categories.filter(c => {
      const p = c.parentId || null;
      const a = activeFolderId || null;
      return p === a;
  });

  const visibleLinks = links.filter(l => {
      const c = l.categoryId || null;
      const a = activeFolderId || null;
      return c === a;
  });
  
  const breadcrumbs = getBreadcrumbs();

  const getIconUrl = (link: LinkItem) => {
     return link.customIconUrl || `https://www.google.com/s2/favicons?domain=${link.url}&sz=128`;
  };

  const getDragOverlayItem = () => {
    if (!activeDragId) return null;
    const cat = categories.find(c => c.id === activeDragId);
    if (cat) {
        const catLinks = links.filter(l => l.categoryId === cat.id);
        const previewIcons = catLinks.map(getIconUrl);
        const subCatCount = categories.filter(c => c.parentId === cat.id).length;
        return <Icon title={cat.title} isFolder subIcons={previewIcons} itemCount={catLinks.length + subCatCount} onClick={()=>{}} isDragging size={iconSize} />;
    }
    const link = links.find(l => l.id === activeDragId);
    if (link) {
        return <Icon title={link.title} url={link.url} customIconUrl={link.customIconUrl} onClick={()=>{}} isDragging size={iconSize} />;
    }
    return null;
  };

  const categoryStats = useMemo(() => {
    const linkCounts = new Map<string, number>();
    const previewMap = new Map<string, string[]>();
    const subFolderCounts = new Map<string, number>();

    for (const l of links) {
      if (!l.categoryId) continue;
      linkCounts.set(l.categoryId, (linkCounts.get(l.categoryId) || 0) + 1);
      const previews = previewMap.get(l.categoryId) || [];
      if (previews.length < 4) {
        previews.push(l.customIconUrl || `https://www.google.com/s2/favicons?domain=${l.url}&sz=128`);
        previewMap.set(l.categoryId, previews);
      }
    }

    for (const c of categories) {
      if (!c.parentId) continue;
      subFolderCounts.set(c.parentId, (subFolderCounts.get(c.parentId) || 0) + 1);
    }

    return { linkCounts, previewMap, subFolderCounts };
  }, [links, categories]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-gray-900 font-sans text-slate-100 selection:bg-blue-500/30 flex flex-col">
      
      {/* Dynamic Background */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-700"
        style={{
          backgroundImage: `url('${backgroundImage}')`,
        }}
      >
        <div className={`absolute inset-0 bg-black/20 backdrop-blur-xl transition-all duration-500 ${activeFolderId || layoutMode === 'list' ? "backdrop-blur-3xl bg-black/40" : ""}`} />
      </div>

      {/* Browser-style Multi-Account Top Tab Bar */}
      <AccountTabsBar
        onAccountSwitch={() => {
          setActiveFolderId(null);
          setIsSidebarOpen(false);
        }}
      />

      <div className="flex-1 flex overflow-hidden relative z-10">
            {/* Controls - Positioned cleanly below tab bar */}
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-40 flex items-center gap-3">
                <div className="flex bg-black/20 backdrop-blur-xl border border-white/10 rounded-full p-1 shadow-lg">
                    <button
                    onClick={() => { updateLayoutMode('grid'); setActiveFolderId(null); }}
                    className={`p-2 rounded-full transition-all duration-200 ${layoutMode === 'grid' ? 'bg-white/20 text-white shadow-inner' : 'text-white/50 hover:text-white/80 hover:bg-white/10'}`}
                    title="Vista Cuadrícula"
                    >
                    <LayoutGrid size={18} />
                    </button>
                    <button
                    onClick={() => { updateLayoutMode('list'); setActiveFolderId(null); }}
                    className={`p-2 rounded-full transition-all duration-200 ${layoutMode === 'list' ? 'bg-white/20 text-white shadow-inner' : 'text-white/50 hover:text-white/80 hover:bg-white/10'}`}
                    title="Vista Lista"
                    >
                    <ListIcon size={18} />
                    </button>
                </div>

                <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="p-3 bg-black/20 hover:bg-black/40 backdrop-blur-xl border border-white/10 rounded-full text-white/70 hover:text-white transition-all duration-200 hover:scale-110 shadow-lg group"
                title="Configuración"
                >
                <Settings size={20} className="group-hover:rotate-45 transition-transform duration-500" />
                </button>
            </div>

            {/* Mobile Sidebar Toggle */}
            <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="absolute top-4 left-4 z-40 md:hidden p-3 bg-black/20 backdrop-blur-xl border border-white/10 rounded-full text-white/70"
            >
                <Menu size={20} />
            </button>

            {/* SIDEBAR */}
            <div className={`
                absolute inset-y-0 left-0 w-64 bg-gray-900/60 backdrop-blur-2xl border-r border-white/10 transform transition-transform duration-300 ease-in-out z-30
                md:relative md:translate-x-0 md:bg-transparent md:backdrop-blur-none
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="h-full pt-20 md:pt-8 px-2">
                    <CategorySidebar 
                        categories={categories}
                        activeFolderId={activeFolderId}
                        onNavigate={(id) => {
                            setActiveFolderId(id);
                            setIsSidebarOpen(false); // Close on selection (mobile)
                        }}
                    />
                </div>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 h-full overflow-y-auto px-4 py-8 sm:p-12 pb-32">
                
                {/* Header / Breadcrumbs */}
                <div className="flex flex-col gap-6 mb-8 mt-12 md:mt-0 animate-in slide-in-from-top-10 duration-700">
                    
                    {/* Show Title if on Root and List view is NOT active (though design choice, keeping consistent header if deep nav) */}
                    {(!activeFolderId) && (
                        <div className="flex items-center justify-between sm:justify-start gap-4">
                            <div className="flex items-center gap-4">
                                <img 
                                    src={logoImage} 
                                    alt="Logo" 
                                    className="w-16 h-16 rounded-xl shadow-lg border border-white/10 object-cover"
                                />
                                <h1 className="text-white/90 font-thin text-4xl sm:text-5xl drop-shadow-2xl tracking-tighter">
                                    {appTitle}
                                </h1>
                            </div>
                            <button 
                                onClick={handleShare}
                                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors flex items-center gap-2 text-sm"
                                title="Compartir este apartado"
                            >
                                <Share2 size={16} />
                                <span className="hidden sm:inline">Compartir</span>
                            </button>
                        </div>
                    )}

                    {/* Show Breadcrumbs if inside a folder, REGARDLESS of view mode */}
                    {activeFolderId && (
                        <div className="flex items-center justify-between gap-4">
                            <nav className="flex items-center gap-2 text-lg sm:text-xl font-medium text-white/60 overflow-x-auto pb-2 scrollbar-none">
                                <button 
                                    onClick={() => setActiveFolderId(null)}
                                    className="hover:text-white hover:bg-white/10 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
                                >
                                    <HomeIcon size={18} /> Inicio
                                </button>
                                {breadcrumbs.map((crumb) => (
                                    <React.Fragment key={crumb.id}>
                                        <ChevronRight size={16} className="text-white/30 shrink-0" />
                                        <button
                                            onClick={() => setActiveFolderId(crumb.id)}
                                            className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap ${crumb.id === activeFolderId ? 'text-white bg-white/10 cursor-default' : 'hover:text-white hover:bg-white/10'}`}
                                        >
                                            {crumb.title}
                                        </button>
                                    </React.Fragment>
                                ))}
                            </nav>
                            <button 
                                onClick={handleShare}
                                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors flex items-center gap-2 text-sm shrink-0"
                                title="Compartir este apartado"
                            >
                                <Share2 size={16} />
                                <span className="hidden sm:inline">Compartir</span>
                            </button>
                        </div>
                    )}
                </div>

                {layoutMode === 'list' ? (
                <ListView 
                    categories={visibleCategories}
                    links={visibleLinks}
                    onNavigate={setActiveFolderId}
                    onEditCategory={handleEditCategoryClick}
                    onDuplicateCategory={(cat) => {
                        duplicateCategory(cat.id);
                        toast.success("Carpeta duplicada");
                    }}
                    onEditLink={handleEditClick}
                    onDuplicateLink={(link) => {
                        duplicateLink(link.id);
                        toast.success("Enlace duplicado");
                    }}
                    onLinkClick={handleLinkClick}
                />
                ) : (
                <DndContext 
                    sensors={sensors} 
                    collisionDetection={closestCenter} 
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <div className="animate-in fade-in duration-300 min-h-[50vh]">
                        
                        {visibleCategories.length === 0 && visibleLinks.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-64 text-white/30 gap-3 border-2 border-dashed border-white/5 rounded-3xl">
                                <p>Carpeta vacía</p>
                                <button onClick={() => setIsNewFolderModalOpen(true)} className="text-sm text-blue-400 hover:underline">
                                    Crear subcarpeta
                                </button>
                            </div>
                        )}

                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-x-4 gap-y-8 max-w-7xl mx-auto justify-items-center items-start">
                            
                            <SortableContext items={visibleCategories} strategy={rectSortingStrategy}>
                                {visibleCategories.map((cat) => {
                                const catLinksCount = categoryStats.linkCounts.get(cat.id) || 0;
                                const subFoldersCount = categoryStats.subFolderCounts.get(cat.id) || 0;
                                const previewIcons = categoryStats.previewMap.get(cat.id) || [];
                                
                                return (
                                    <SortableIcon
                                        key={cat.id}
                                        id={cat.id}
                                        title={cat.title}
                                        isFolder
                                        itemCount={catLinksCount + subFoldersCount}
                                        subIcons={previewIcons}
                                        onClick={() => setActiveFolderId(cat.id)}
                                        onEdit={() => handleEditCategoryClick(cat)}
                                        size={iconSize}
                                    />
                                );
                                })}
                            </SortableContext>

                            <SortableContext items={visibleLinks} strategy={rectSortingStrategy}>
                                {visibleLinks.map((link) => (
                                <SortableIcon
                                    key={link.id}
                                    id={link.id}
                                    title={link.title}
                                    url={link.url}
                                    customIconUrl={link.customIconUrl}
                                    onClick={() => handleLinkClick(link)}
                                    onEdit={() => handleEditClick(link)}
                                    size={iconSize}
                                />
                                ))}
                            </SortableContext>
                        </div>
                    </div>

                    <DragOverlay>
                        {getDragOverlayItem()}
                    </DragOverlay>
                </DndContext>
                )}
            </main>

            {/* Status Footer - Moved inside main or fixed differently if sidebar is present */}
            <div className="fixed bottom-6 left-6 z-40 animate-in fade-in slide-in-from-bottom-4 duration-700 select-none hidden md:block">
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-black/20 backdrop-blur-xl border border-white/5 text-[11px] font-medium text-white/40 shadow-lg transition-all hover:bg-black/30 hover:text-white/80 hover:border-white/10 group cursor-default">
                    {isSyncing ? (
                        <>
                        <Loader2 size={12} className="animate-spin text-blue-400" />
                        <span className="text-blue-100 group-hover:text-white transition-colors">Guardando...</span>
                        </>
                    ) : (
                        <>
                        <Cloud size={12} className="text-emerald-400/80 group-hover:text-emerald-400 transition-colors" />
                        <span className="text-emerald-100/60 group-hover:text-emerald-50 transition-colors">
                            Sincronizado {lastSyncTime && `• ${new Date(lastSyncTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`}
                        </span>
                        </>
                    )}
                </div>
            </div>

            {/* Dock is available in both modes to add items quickly */}
            <Dock 
              onAddClick={() => {
                  setEditingLink(null);
                  setIsLinkModalOpen(true);
              }}
              onAddFolderClick={() => {
                  setNewFolderParentId(activeFolderId);
                  setIsNewFolderModalOpen(true);
              }}
            />

            {/* --- MODALS --- */}

            {/* General Error Modal */}
            <GlassModal 
                isOpen={!!error} 
                onClose={clearError} 
                title="Aviso del Sistema"
            >
                <div className="space-y-6">
                    <div className="flex items-center gap-4 text-white/80">
                        <div className="p-3 bg-amber-500/20 rounded-full text-amber-400">
                            <AlertCircle size={24} />
                        </div>
                        <div>
                            <p className="font-medium text-white">Atención</p>
                            <p className="text-sm text-white/60">{error}</p>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button onClick={clearError} className="px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors">Entendido</button>
                    </div>
                </div>
            </GlassModal>

            {/* Link Edit Modal */}
            <GlassModal
                isOpen={isLinkModalOpen}
                onClose={() => {
                setIsLinkModalOpen(false);
                setEditingLink(null);
                }}
                title={editingLink ? "Editar Enlace" : "Agregar Enlace"}
            >
                <AddEditForm
                categories={categories}
                initialData={editingLink}
                currentFolderId={activeFolderId}
                onSave={(t, u, cIcon, cId) => {
                    saveLink(t, u, cIcon, cId, editingLink?.id);
                    setIsLinkModalOpen(false);
                    setEditingLink(null);
                }}
                onDelete={() => setShowDeleteConfirm(true)}
                onDuplicate={editingLink ? () => {
                    duplicateLink(editingLink.id);
                    setIsLinkModalOpen(false);
                    setEditingLink(null);
                    toast.success("Enlace duplicado");
                } : undefined}
                onCancel={() => {
                    setIsLinkModalOpen(false);
                    setEditingLink(null);
                }}
                />
            </GlassModal>
            
            {/* New Folder Modal */}
            <GlassModal
                isOpen={isNewFolderModalOpen}
                onClose={() => setIsNewFolderModalOpen(false)}
                title={activeFolderId ? "Nueva Subcarpeta" : "Nueva Carpeta"}
            >
                <form onSubmit={handleCreateFolder} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-400 uppercase">
                        Nombre de la carpeta
                        </label>
                        <input
                        type="text"
                        required
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Ej. Proyectos, Finanzas..."
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-400 uppercase">
                        Carpeta Padre
                        </label>
                        <select
                            value={newFolderParentId || ""}
                            onChange={(e) => setNewFolderParentId(e.target.value || null)}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
                        >
                            <option value="" className="bg-gray-800">Ninguna (Escritorio)</option>
                            {getFlattenedCategories().map(cat => (
                                <option key={cat.id} value={cat.id} className="bg-gray-800">
                                    {"\u00A0".repeat(cat.depth * 3)}{cat.depth > 0 ? "└─ " : ""}{cat.title}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                        type="button"
                        onClick={() => setIsNewFolderModalOpen(false)}
                        className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors"
                        >
                        Cancelar
                        </button>
                        <button
                        type="submit"
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
                        >
                        Crear
                        </button>
                    </div>
                </form>
            </GlassModal>

            {/* Category Edit Modal */}
            <GlassModal
                isOpen={isCategoryModalOpen}
                onClose={() => {
                setIsCategoryModalOpen(false);
                setEditingCategory(null);
                }}
                title="Editar Carpeta"
            >
                <form onSubmit={handleSaveCategory} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-400 uppercase">
                        Nombre
                        </label>
                        <input
                        type="text"
                        required
                        value={tempCategoryName}
                        onChange={(e) => setTempCategoryName(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        autoFocus
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-400 uppercase">
                        Carpeta Padre
                        </label>
                        <select
                            value={tempCategoryParentId || ""}
                            onChange={(e) => setTempCategoryParentId(e.target.value || null)}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
                        >
                            <option value="" className="bg-gray-800">Ninguna (Escritorio)</option>
                            {getFlattenedCategories()
                                // Prevent a category from being its own parent or a parent of its descendants
                                .filter(cat => !isDescendant(editingCategory?.id || "", cat.id))
                                .map(cat => (
                                <option key={cat.id} value={cat.id} className="bg-gray-800">
                                    {"\u00A0".repeat(cat.depth * 3)}{cat.depth > 0 ? "└─ " : ""}{cat.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    if(editingCategory) handleDeleteCategoryRequest(editingCategory.id);
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
                                title="Eliminar Carpeta"
                            >
                                <Trash2 size={16} />
                                <span className="hidden sm:inline">Eliminar</span>
                            </button>
                            {editingCategory && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        duplicateCategory(editingCategory.id);
                                        setIsCategoryModalOpen(false);
                                        setEditingCategory(null);
                                        toast.success("Carpeta duplicada");
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors text-sm"
                                    title="Duplicar Carpeta"
                                >
                                    <Copy size={16} />
                                    <span className="hidden sm:inline">Duplicar</span>
                                </button>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                            type="button"
                            onClick={() => setIsCategoryModalOpen(false)}
                            className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors"
                            >
                            Cancelar
                            </button>
                            <button
                            type="submit"
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
                            >
                            Guardar
                            </button>
                        </div>
                    </div>
                </form>
            </GlassModal>

            {/* Confirmation Modals */}
            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={executeDeleteLink}
                title="Confirmar Eliminación"
                message="¿Estás seguro de eliminar este enlace?"
                subMessage="Esta acción no se puede deshacer."
                confirmText="Eliminar"
                isDanger
            />

            <ConfirmModal
                isOpen={showCategoryDeleteConfirm}
                onClose={() => setShowCategoryDeleteConfirm(false)}
                onConfirm={executeDeleteCategory}
                title="Eliminar Carpeta"
                message={`¿Eliminar "${categoryToDelete?.title}"?`}
                subMessage="El contenido (enlaces y subcarpetas) se moverá a la carpeta superior o al escritorio."
                confirmText="Eliminar Carpeta"
                isDanger
            />

            {/* Settings Modal */}
            <GlassModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                title="Configuración"
            >
                <SettingsForm 
                currentTitle={appTitle}
                currentBg={backgroundImage}
                currentLogo={logoImage}
                categories={categories}
                onSaveTitle={updateAppTitle}
                onSaveBg={updateBackgroundImage}
                onSaveLogo={updateLogoImage}
                onAddCategory={(t) => addCategory(t, null)}
                onUpdateCategory={(id, t) => updateCategory(id, t)}
                onDeleteCategory={handleDeleteCategoryRequest}
                onCancel={() => setIsSettingsModalOpen(false)}
                />
            </GlassModal>
        </div>
    </div>
  );
};
