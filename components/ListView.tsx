
import React from "react";
import { Category, LinkItem } from "../types";
import { Pencil, Folder, Globe, ChevronRight, File, MoreVertical, Copy, Monitor } from "lucide-react";
import { getLocalAppFallbackIcon } from "../services/platform";

interface ListViewProps {
  categories: Category[];
  links: LinkItem[];
  onNavigate: (categoryId: string) => void;
  onEditCategory: (category: Category) => void;
  onDuplicateCategory: (category: Category) => void;
  onEditLink: (link: LinkItem) => void;
  onDuplicateLink: (link: LinkItem) => void;
  onLinkClick: (link: LinkItem) => void;
}

export const ListView: React.FC<ListViewProps> = ({
  categories,
  links,
  onNavigate,
  onEditCategory,
  onDuplicateCategory,
  onEditLink,
  onDuplicateLink,
  onLinkClick
}) => {
  // Helper to get favicon
  const getIconUrl = (link: LinkItem) => {
     if (link.customIconUrl) return link.customIconUrl;
     if (link.itemType === "app") return getLocalAppFallbackIcon(link.title);
     return `https://www.google.com/s2/favicons?domain=${link.url}&sz=64`;
  }

  // Render a Folder Row
  const renderCategoryRow = (cat: Category) => (
    <div 
        key={cat.id} 
        onClick={() => onNavigate(cat.id)}
        className="group flex items-center gap-4 p-3 bg-white/5 hover:bg-white/10 border-b border-white/5 first:rounded-t-xl last:rounded-b-xl hover:border-white/10 cursor-pointer transition-all active:scale-[0.99]"
    >
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0">
             <Folder size={20} fill="currentColor" className="opacity-80" />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
            <h4 className="text-white font-medium text-base truncate">{cat.title}</h4>
            <span className="text-white/30 text-xs truncate">Carpeta</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); onDuplicateCategory(cat); }} 
              className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-full transition-opacity opacity-0 group-hover:opacity-100"
              title="Duplicar Carpeta"
            >
                <Copy size={16} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onEditCategory(cat); }} 
              className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-full transition-opacity opacity-0 group-hover:opacity-100"
              title="Editar Carpeta"
            >
                <Pencil size={16} />
            </button>
            <ChevronRight size={20} className="text-white/20 group-hover:text-white/60" />
        </div>
    </div>
  );

  // Render a Link Row
  const renderLinkRow = (link: LinkItem) => (
      <div 
        key={link.id} 
        onClick={() => onLinkClick(link)}
        className="group flex items-center gap-4 p-3 bg-transparent hover:bg-white/5 border-b border-white/5 last:border-0 hover:border-white/10 cursor-pointer transition-all"
      >
          {/* Icon */}
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-sm border border-white/5">
               <img 
                src={getIconUrl(link)} 
                alt="" 
                className="w-full h-full object-cover" 
                onError={(e) => {
                   e.currentTarget.style.display = 'none';
                   e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                   e.currentTarget.parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-globe text-white/40"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';
                }} 
               />
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-2 min-w-0">
                <h4 className="text-white font-medium text-sm truncate">{link.title}</h4>
                {link.itemType === "app" && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-400/25 text-[10px] font-medium text-blue-300 shrink-0">
                    <Monitor size={10} /> PC
                  </span>
                )}
              </div>
              <span className="text-blue-300/60 text-xs truncate hover:underline block max-w-md">{link.url}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
               <button 
                onClick={(e) => { e.stopPropagation(); onDuplicateLink(link); }} 
                className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-full transition-colors"
                title="Duplicar Enlace"
               >
                   <Copy size={16} />
               </button>
               <button 
                onClick={(e) => { e.stopPropagation(); onEditLink(link); }} 
                className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                title="Editar Enlace"
               >
                   <Pencil size={16} />
               </button>
          </div>
      </div>
  );

  if (categories.length === 0 && links.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-white/30 gap-4 border border-dashed border-white/10 rounded-2xl bg-white/5 mx-auto max-w-3xl">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <Folder size={32} />
            </div>
            <p>Carpeta vacía</p>
        </div>
      );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 animate-in fade-in duration-300">
        <div className="bg-gray-900/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-xl">
            
            {/* Table Header-ish */}
            <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-3 bg-white/5 border-b border-white/10 text-xs font-medium text-white/40 uppercase tracking-wider">
                <div className="w-10 text-center">Tipo</div>
                <div>Nombre</div>
                <div className="w-10"></div>
            </div>

            <div className="divide-y divide-white/5">
                {/* Folders first */}
                {categories.map(renderCategoryRow)}
                
                {/* Links second */}
                {links.map(renderLinkRow)}
            </div>
        </div>
        
        <div className="mt-4 text-center text-xs text-white/20">
            {categories.length} carpetas • {links.length} enlaces
        </div>
    </div>
  )
}
