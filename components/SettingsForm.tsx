
import React, { useState, useRef, useMemo } from "react";
import { Category, IconSize } from "../types";
import { useLaunchpad } from "../context/LaunchpadContext";
import { 
  Plus, Trash2, Pencil, Check, X, FolderOpen, Layout, 
  Upload, Cloud, Loader2, LogOut, Grid, ChevronRight, 
  ChevronDown, CornerDownRight, User, Download
} from "lucide-react";
import { toast } from "sonner";
import { DesktopUpdatesSection } from "./DesktopUpdatesSection";

interface SettingsFormProps {
  currentTitle: string;
  currentBg: string;
  currentLogo: string;
  categories: Category[];
  onSaveTitle: (newTitle: string) => void;
  onSaveBg: (url: string) => void;
  onSaveLogo: (url: string) => void;
  onAddCategory: (title: string, parentId?: string | null) => void;
  onUpdateCategory: (id: string, title: string, parentId?: string | null) => void;
  onDeleteCategory: (id: string) => void;
  onCancel: () => void;
}

export const SettingsForm: React.FC<SettingsFormProps> = ({
  currentTitle,
  currentBg,
  currentLogo,
  categories,
  onSaveTitle,
  onSaveBg,
  onSaveLogo,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onCancel,
}) => {
  const { 
    links,
    isSyncing, 
    lastSyncTime, 
    userEmail,
    disconnectCloud,
    iconSize,
    updateIconSize,
    getCategoryData,
    importCategory,
    importLink,
    replaceLinks,
    replaceCategories
  } = useLaunchpad();

  const [activeTab, setActiveTab] = useState<'general' | 'categories'>('categories');
  const [appTitle, setAppTitle] = useState(currentTitle);
  const [bgUrl, setBgUrl] = useState(currentBg);
  const [logoUrl, setLogoUrl] = useState(currentLogo);
  const [selectedSize, setSelectedSize] = useState<IconSize>(iconSize);
  
  // File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Category Local State
  const [newCategoryName, setNewCategoryName] = useState("");
  const [targetParentId, setTargetParentId] = useState<string | null>(null); // For adding new subcats
  
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [editingCatParent, setEditingCatParent] = useState<string | null>(null);

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const handleExportCategory = (id: string) => {
    const data = getCategoryData(id);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `folder-${data.category.title}.json`;
    a.click();
  };

  const handleImportCategory = (e: React.ChangeEvent<HTMLInputElement>, parentId: string | null = null) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        if (data.categories && data.links) {
            // Full backup
            replaceCategories(data.categories);
            replaceLinks(data.links);
            toast.success("Respaldo completo importado con éxito");
        } else if (data.category && data.links) {
            // Single category (with subcategories and links)
            importCategory(data, parentId);
            toast.success(`Carpeta "${data.category.title}" importada`);
        } else if (data.url && data.title) {
            // Single link
            importLink(data, parentId);
            toast.success(`Enlace "${data.title}" importado`);
        } else {
            toast.error("Formato de archivo no reconocido");
            console.error("Data received:", data);
        }
      } catch (err) {
        toast.error("Error al leer el archivo JSON");
        console.error("Import error:", err);
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = "";
  };

  // --- Tree Logic ---
  
  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedCats);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedCats(newSet);
  };

  // Build Tree Structure
  const categoryTree = useMemo(() => {
    const tree: (Category & { children: any[] })[] = [];
    const map = new Map();

    // Initialize map
    categories.forEach(cat => {
        map.set(cat.id, { ...cat, children: [] });
    });

    // Connect nodes
    categories.forEach(cat => {
        if (cat.parentId && map.has(cat.parentId)) {
            map.get(cat.parentId).children.push(map.get(cat.id));
        } else {
            tree.push(map.get(cat.id));
        }
    });

    return tree;
  }, [categories]);

  // Check valid parents (prevent circular references)
  const getValidParents = (currentId: string) => {
      const isDescendant = (potentialParent: string, target: string): boolean => {
          if (potentialParent === target) return true;
          const parent = categories.find(c => c.id === potentialParent);
          if (parent && parent.parentId) {
              return isDescendant(parent.parentId, target);
          }
          return false;
      };

      return categories.filter(c => {
          // Can't be self
          if (c.id === currentId) return false;
          // Can't be a descendant of self
          if (isDescendant(c.id, currentId)) return false;
          return true;
      });
  };

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveTitle(appTitle);
    onSaveBg(bgUrl);
    onSaveLogo(logoUrl);
    updateIconSize(selectedSize);
    onCancel(); 
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategoryName.trim()) {
      onAddCategory(newCategoryName, targetParentId);
      setNewCategoryName("");
      // If we were targeting a parent, ensure it's expanded to see result
      if (targetParentId) {
          const newSet = new Set(expandedCats);
          newSet.add(targetParentId);
          setExpandedCats(newSet);
      }
      setTargetParentId(null); // Reset to root add
    }
  };

  const startEditing = (cat: Category) => {
    setEditingCatId(cat.id);
    setEditingCatName(cat.title);
    setEditingCatParent(cat.parentId || null);
  };

  const saveEditing = (id: string) => {
    if (editingCatName.trim()) {
      onUpdateCategory(id, editingCatName, editingCatParent);
    }
    setEditingCatId(null);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setLogoUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
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

  // --- Render Tree Recursive ---
  const renderCategoryNode = (node: Category & { children: any[] }, level: number = 0) => {
      const isEditing = editingCatId === node.id;
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedCats.has(node.id);
      const validParents = isEditing ? getValidParents(node.id) : [];

      return (
          <div key={node.id} className="flex flex-col">
              <div 
                className={`
                    group flex items-center gap-2 p-2 rounded-lg transition-all border border-transparent
                    ${isEditing ? 'bg-white/10 border-blue-500/30' : 'hover:bg-white/5 border-white/5'}
                    ${level > 0 ? 'ml-4' : ''}
                `}
              >
                  {/* Indent Guide */}
                  {level > 0 && <CornerDownRight size={14} className="text-white/20 shrink-0" />}

                  {/* Expand/Collapse */}
                  <button 
                    onClick={() => toggleExpand(node.id)}
                    className={`p-1 rounded hover:bg-white/10 text-white/50 transition-colors ${!hasChildren && 'invisible'}`}
                  >
                     {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {/* Icon */}
                  <FolderOpen size={16} className={`shrink-0 ${targetParentId === node.id ? 'text-green-400' : 'text-blue-300'}`} />

                  {isEditing ? (
                    <div className="flex-1 flex flex-col sm:flex-row gap-2 animate-in fade-in duration-200">
                        <input
                            type="text"
                            value={editingCatName}
                            onChange={(e) => setEditingCatName(e.target.value)}
                            className="flex-1 min-w-[120px] bg-black/40 border border-white/20 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                            placeholder="Nombre"
                            autoFocus
                        />
                        <select
                            value={editingCatParent || ""}
                            onChange={(e) => setEditingCatParent(e.target.value || null)}
                            className="bg-black/40 border border-white/20 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 max-w-[150px]"
                        >
                            <option value="">(Raíz)</option>
                            {getFlattenedCategories()
                                .filter(p => {
                                    // Can't be self or a descendant of self
                                    const isDescendant = (potentialParent: string, target: string): boolean => {
                                        if (potentialParent === target) return true;
                                        const parent = categories.find(c => c.id === potentialParent);
                                        if (parent && parent.parentId) {
                                            return isDescendant(parent.parentId, target);
                                        }
                                        return false;
                                    };
                                    if (p.id === node.id) return false;
                                    if (isDescendant(p.id, node.id)) return false;
                                    return true;
                                })
                                .map(p => (
                                <option key={p.id} value={p.id}>
                                    {"\u00A0".repeat(p.depth * 2)}{p.depth > 0 ? "└─ " : ""}{p.title}
                                </option>
                            ))}
                        </select>
                        <div className="flex items-center gap-1">
                            <button onClick={() => saveEditing(node.id)} className="p-1.5 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30">
                                <Check size={14} />
                            </button>
                            <button onClick={() => setEditingCatId(null)} className="p-1.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30">
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                  ) : (
                    <>
                        <span className="flex-1 text-sm font-medium text-white/90 truncate select-none" onDoubleClick={() => startEditing(node)}>
                            {node.title}
                        </span>
                        
                        <div className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={() => handleExportCategory(node.id)}
                                className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                                title="Exportar carpeta"
                            >
                                <Download size={14} />
                            </button>
                            <button 
                                onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = '.json';
                                    input.onchange = (e) => handleImportCategory(e as any, node.id);
                                    input.click();
                                }}
                                className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                                title="Importar subcarpeta"
                            >
                                <Upload size={14} />
                            </button>
                            <button 
                                onClick={() => {
                                    setTargetParentId(node.id);
                                    setNewCategoryName("");
                                    const input = document.getElementById('new-cat-input');
                                    input?.focus();
                                }}
                                className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
                                title="Añadir subcarpeta aquí"
                            >
                                <Plus size={14} />
                            </button>
                            <button 
                                onClick={() => startEditing(node)}
                                className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                title="Editar / Mover"
                            >
                                <Pencil size={14} />
                            </button>
                            <button 
                                onClick={() => onDeleteCategory(node.id)}
                                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                title="Eliminar"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </>
                  )}
              </div>

              {/* Recursive Children */}
              {hasChildren && isExpanded && (
                  <div className="flex flex-col">
                      {node.children.map(child => renderCategoryNode(child, level + 1))}
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="flex flex-col h-[600px]">
      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('categories')}
          className={`pb-2 text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'categories' 
              ? 'text-blue-400 border-b-2 border-blue-400 -mb-2.5' 
              : 'text-white/60 hover:text-white'
          }`}
        >
          <FolderOpen size={16} /> Estructura
        </button>
        <button
          onClick={() => setActiveTab('general')}
          className={`pb-2 text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'general' 
              ? 'text-blue-400 border-b-2 border-blue-400 -mb-2.5' 
              : 'text-white/60 hover:text-white'
          }`}
        >
          <Layout size={16} /> General
        </button>
      </div>

      {/* Tab Content: Categories */}
      {activeTab === 'categories' && (
        <div className="flex-1 flex flex-col min-h-0">
          
          {/* Add Category Input */}
          <form onSubmit={handleAddCategory} className="mb-4 bg-white/5 p-3 rounded-xl border border-white/10">
            <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-bold text-white/40 flex items-center justify-between">
                    <span>{targetParentId ? `Añadir dentro de "${categories.find(c => c.id === targetParentId)?.title}"` : "Añadir Categoría Raíz"}</span>
                    {targetParentId && (
                        <button type="button" onClick={() => setTargetParentId(null)} className="text-red-400 hover:underline">
                            Cancelar (Volver a Raíz)
                        </button>
                    )}
                </label>
                <div className="flex gap-2">
                    <input
                    id="new-cat-input"
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder={targetParentId ? "Nombre de subcarpeta..." : "Nombre de categoría..."}
                    className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    autoFocus
                    />
                    <button
                    type="submit"
                    disabled={!newCategoryName.trim()}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center"
                    title="Añadir categoría"
                    >
                    <Plus size={18} />
                    </button>
                    <button
                    type="button"
                    onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.json';
                        input.onchange = (e) => handleImportCategory(e as any);
                        input.click();
                    }}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center justify-center"
                    title="Importar carpeta (.json)"
                    >
                    <Upload size={18} />
                    </button>
                    <button
                    type="button"
                    onClick={() => {
                        const data = { categories, links };
                        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `launchpad-full-backup-${new Date().toISOString().split('T')[0]}.json`;
                        a.click();
                    }}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center justify-center"
                    title="Exportar todo (.json)"
                    >
                    <Download size={18} />
                    </button>
                </div>
            </div>
          </form>

          {/* Categories Tree */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-1">
            {categoryTree.length === 0 ? (
              <div className="text-center text-white/30 text-sm py-8 italic">
                No hay categorías creadas.
              </div>
            ) : (
                categoryTree.map(node => renderCategoryNode(node))
            )}
          </div>
          
           <div className="pt-4 mt-2 border-t border-white/10 flex justify-end">
             <button onClick={onCancel} className="text-sm text-white/70 hover:text-white">Hecho</button>
           </div>
        </div>
      )}

      {/* Tab Content: General */}
      {activeTab === 'general' && (
        <form onSubmit={handleSaveGeneral} className="flex flex-col h-full overflow-y-auto pr-2">
          <div className="flex-1 space-y-6">
            
            {/* Sync Section */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-500/20">
              <div className="flex items-center justify-between mb-3">
                 <div className="flex items-center gap-2">
                   <Cloud className="w-5 h-5 text-green-400" />
                   <h3 className="font-semibold text-white text-sm">Cuenta y Sincronización</h3>
                 </div>
                 {isSyncing && <Loader2 className="w-4 h-4 text-blue-300 animate-spin" />}
              </div>

              <div>
                 <div className="flex justify-between items-center mb-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-green-400 flex items-center gap-1">
                          <Check size={12} /> Sincronización Activa
                      </span>
                      {userEmail && (
                          <span className="text-[11px] text-white/60 flex items-center gap-1 mt-0.5">
                              <User size={10} /> {userEmail}
                          </span>
                      )}
                    </div>
                    {lastSyncTime && (
                      <span className="text-[10px] text-white/40">
                        {new Date(lastSyncTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    )}
                 </div>
                 <button
                  type="button"
                  onClick={async () => {
                    onCancel();
                    await disconnectCloud();
                  }}
                  className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs font-medium text-red-300 transition-all flex items-center justify-center gap-2"
                 >
                   <LogOut size={14} /> Cerrar sesión de esta pestaña
                 </button>
              </div>
            </div>

            {/* Desktop Auto-Update Section (visible only in Electron desktop app) */}
            <DesktopUpdatesSection />

            {/* Icon Size */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 uppercase flex items-center gap-2">
                 <Grid size={14} /> Tamaño de Iconos
              </label>
              <div className="grid grid-cols-3 gap-3">
                 <button
                  type="button"
                  onClick={() => setSelectedSize('small')}
                  className={`py-3 rounded-lg border text-sm transition-all ${selectedSize === 'small' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black/20 border-white/10 text-white/60 hover:bg-white/10'}`}
                 >
                   Pequeño
                 </button>
                 <button
                  type="button"
                  onClick={() => setSelectedSize('medium')}
                  className={`py-3 rounded-lg border text-sm transition-all ${selectedSize === 'medium' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black/20 border-white/10 text-white/60 hover:bg-white/10'}`}
                 >
                   Mediano
                 </button>
                 <button
                  type="button"
                  onClick={() => setSelectedSize('large')}
                  className={`py-3 rounded-lg border text-sm transition-all ${selectedSize === 'large' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black/20 border-white/10 text-white/60 hover:bg-white/10'}`}
                 >
                   Grande
                 </button>
              </div>
            </div>

            {/* App Title */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 uppercase">
                Título de la Aplicación
              </label>
              <input
                type="text"
                value={appTitle}
                onChange={(e) => setAppTitle(e.target.value)}
                placeholder="LaunchPad"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
            </div>

            {/* Background Image */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 uppercase">
                Imagen de Fondo (URL)
              </label>
              <input
                type="text"
                value={bgUrl}
                onChange={(e) => setBgUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
            </div>

            {/* Logo Image */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 uppercase">
                Logo / Avatar
              </label>
              <div className="flex gap-3">
                 <img src={logoUrl} alt="Preview" className="w-10 h-10 rounded-lg border border-white/10 object-cover bg-white/5 shrink-0" onError={(e) => e.currentTarget.style.display = 'none'} />
                 
                 <div className="flex-1 flex gap-2">
                   <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  <button 
                    type="button"
                    onClick={handleUploadClick}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center justify-center border border-white/10"
                    title="Subir imagen desde archivo"
                  >
                    <Upload size={18} />
                  </button>
                 </div>
              </div>
            </div>

          </div>
          
          <div className="pt-6 flex justify-end gap-3 mt-auto border-t border-white/10">
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
              Guardar Cambios
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
