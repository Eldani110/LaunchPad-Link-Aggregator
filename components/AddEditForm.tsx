
import React, { useState, useEffect, useMemo } from "react";
import { Category, LinkItem } from "../types";
import { Trash2, Sparkles, Loader2, Folder, Image as ImageIcon, Copy, Download, Upload } from "lucide-react";
import { suggestCategory } from "../services/geminiService";
import { useLaunchpad } from "../context/LaunchpadContext";
import { toast } from "sonner";

interface AddEditFormProps {
  categories: Category[];
  initialData?: LinkItem | null; 
  currentFolderId?: string | null; // New prop to know current view
  onSave: (title: string, url: string, customIconUrl: string | undefined, categoryId: string | null) => void;
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
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [customIconUrl, setCustomIconUrl] = useState("");
  const [categoryId, setCategoryId] = useState<string>(""); // Empty string means "Root/Desktop" in this form state
  const [isAiLoading, setIsAiLoading] = useState(false);

  const handleExport = () => {
    if (!initialData) return;
    const data = JSON.stringify(initialData);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
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
            toast.success(`Enlace "${data.title}" importado`);
            onCancel();
        } else {
            toast.error("El archivo no contiene un enlace válido");
        }
      } catch (err) {
        toast.error("Error al leer el archivo JSON");
      }
    };
    reader.readAsText(file);
  };

  // Initialize form if editing, or default to current folder if adding
  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setUrl(initialData.url);
      setCustomIconUrl(initialData.customIconUrl || "");
      setCategoryId(initialData.categoryId || "");
    } else {
      setTitle("");
      setUrl("");
      setCustomIconUrl("");
      // If adding new, default to the folder we are currently viewing
      setCategoryId(currentFolderId || "");
    }
  }, [initialData, currentFolderId]);

  // Determine which icon to show in preview
  const previewIconUrl = customIconUrl || (url ? `https://www.google.com/s2/favicons?domain=${url}&sz=64` : "");

  // Generate hierarchical options for the dropdown
  const categoryOptions = useMemo(() => {
    const options: { id: string; title: string; depth: number }[] = [];
    const childrenMap = new Map<string | null, Category[]>();

    // Group by parent
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
        // Sort alphabetically for better readability in the list
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
    if (title && url) {
      // Convert empty string back to null for the context
      onSave(title, url, customIconUrl || undefined, categoryId === "" ? null : categoryId);
    }
  };

  const handleAiSuggest = async () => {
    if (!url || !title || categories.length === 0) return;
    setIsAiLoading(true);
    try {
      const suggestedName = await suggestCategory(url, title, categories);
      if (suggestedName) {
        // Find ID based on returned name
        const match = categories.find(c => c.title.toLowerCase() === suggestedName.toLowerCase());
        if (match) {
          setCategoryId(match.id);
        }
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Icon Preview & Title Row */}
      <div className="flex gap-4">
          <div className="shrink-0">
             <div className="w-16 h-16 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden">
                {previewIconUrl ? (
                   <img src={previewIconUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => e.currentTarget.style.display='none'} />
                ) : (
                   <ImageIcon className="text-white/30" />
                )}
             </div>
             <p className="text-[10px] text-center mt-1 text-white/40 uppercase">Vista Previa</p>
          </div>
          
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
                <label className="text-xs font-medium text-gray-400 uppercase">
                URL
                </label>
                <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://ejemplo.com"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
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
          placeholder="Nombre del Sitio"
          className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
        />
      </div>

      <div className="space-y-2">
         <label className="text-xs font-medium text-gray-400 uppercase flex justify-between">
           <span>Icono Personalizado (Opcional)</span>
           <span className="text-[10px] text-white/30 lowercase font-normal">dejar vacío para usar automático</span>
         </label>
         <div className="relative">
             <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <ImageIcon size={16} />
             </div>
             <input
               type="text"
               value={customIconUrl}
               onChange={(e) => setCustomIconUrl(e.target.value)}
               placeholder="https://..."
               className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
             />
         </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-xs font-medium text-gray-400 uppercase">
            Categoría
          </label>
          {(url && title && !isAiLoading && categories.length > 0) && (
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
            <option value="" className="bg-gray-800 text-white">Escritorio (Sin categoría)</option>
            {categoryOptions.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-gray-800 text-white">
                 {/* Visual Indentation using non-breaking spaces */}
                 {"\u00A0".repeat(opt.depth * 3)}
                 {opt.depth > 0 && '└─ '}
                 {opt.title}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-white/50"></div>
        </div>
        
        {categories.length === 0 && (
          <p className="text-[10px] text-amber-400/80 mt-1">
            * Crea categorías en Configuración para organizar tus enlaces.
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
              title="Eliminar Enlace"
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
              title="Duplicar Enlace"
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
              title="Exportar Enlace"
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
            {initialData ? "Guardar Cambios" : "Agregar Enlace"}
          </button>
        </div>
      </div>
    </form>
  );
};
