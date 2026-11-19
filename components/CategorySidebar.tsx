
import React, { useMemo, useState, useEffect } from 'react';
import { Category } from '../types';
import { Folder, FolderOpen, ChevronRight, ChevronDown, LayoutGrid, Home } from 'lucide-react';

interface CategorySidebarProps {
  categories: Category[];
  activeFolderId: string | null;
  onNavigate: (id: string | null) => void;
  className?: string;
}

export const CategorySidebar: React.FC<CategorySidebarProps> = ({
  categories,
  activeFolderId,
  onNavigate,
  className = ""
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Automatically expand parents of active folder
  useEffect(() => {
    if (activeFolderId) {
      const parentsToExpand = new Set<string>();
      let current = categories.find(c => c.id === activeFolderId);
      while (current && current.parentId) {
        parentsToExpand.add(current.parentId);
        current = categories.find(c => c.id === current.parentId);
      }
      setExpanded(prev => {
        const next = new Set(prev);
        parentsToExpand.forEach(id => next.add(id));
        return next;
      });
    }
  }, [activeFolderId, categories]);

  // Build Tree Structure
  const tree = useMemo(() => {
    const rootNodes: (Category & { children: any[] })[] = [];
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
            rootNodes.push(map.get(cat.id));
        }
    });

    // Sort alphabetically
    const sortNodes = (nodes: any[]) => {
        nodes.sort((a, b) => a.title.localeCompare(b.title));
        nodes.forEach(n => sortNodes(n.children));
    };
    sortNodes(rootNodes);

    return rootNodes;
  }, [categories]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(expanded);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpanded(newSet);
  };

  const renderNode = (node: Category & { children: any[] }, level: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const isActive = activeFolderId === node.id;

    return (
      <div key={node.id} className="select-none">
        <div 
          onClick={() => onNavigate(node.id)}
          className={`
            group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all mb-0.5
            ${isActive 
               ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
               : 'text-white/70 hover:bg-white/10 hover:text-white'
            }
          `}
          style={{ paddingLeft: `${level * 12 + 12}px` }}
        >
           {/* Expand Toggle */}
           <div 
             onClick={(e) => hasChildren && toggleExpand(node.id, e)}
             className={`
                p-0.5 rounded-md transition-colors 
                ${hasChildren ? 'hover:bg-white/20 text-white/50 hover:text-white' : 'invisible'}
             `}
           >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
           </div>

           {/* Icon */}
           {isActive ? (
               <FolderOpen size={16} className="shrink-0 text-white" />
           ) : (
               <Folder size={16} className="shrink-0 text-blue-300/70 group-hover:text-blue-300" />
           )}
           
           <span className="truncate text-sm font-medium">{node.title}</span>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="overflow-hidden animate-in slide-in-from-left-2 duration-200">
             {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className={`flex flex-col h-full ${className}`}>
        <div className="mb-2 px-4">
            <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Navegación</h3>
        </div>

        <nav className="flex-1 overflow-y-auto space-y-1 pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {/* Root / Desktop */}
            <div 
                onClick={() => onNavigate(null)}
                className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all mb-2
                    ${activeFolderId === null
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }
                `}
            >
                <div className="w-5 flex justify-center"><Home size={16} /></div>
                <span className="text-sm font-medium">Escritorio</span>
            </div>

            {/* Tree */}
            {tree.map(node => renderNode(node))}
            
            {tree.length === 0 && (
                <div className="px-4 py-8 text-center">
                    <p className="text-xs text-white/30 italic">No hay carpetas</p>
                </div>
            )}
        </nav>
    </aside>
  );
};
