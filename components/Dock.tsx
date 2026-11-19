
import React from "react";
import { Plus, FolderPlus } from "lucide-react";

interface DockProps {
  onAddClick: () => void;
  onAddFolderClick?: () => void;
}

export const Dock: React.FC<DockProps> = ({ onAddClick, onAddFolderClick }) => {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
      <div className="flex items-end gap-2 px-4 pb-3 pt-4 bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl transition-all hover:scale-105">
        
        {onAddFolderClick && (
          <DockItem
            icon={<FolderPlus size={24} />}
            label="Nueva Carpeta"
            onClick={onAddFolderClick}
          />
        )}

        <DockItem
          icon={<Plus size={24} />}
          label="Agregar Enlace"
          onClick={onAddClick}
          primary
        />
        
      </div>
    </div>
  );
};

const DockItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}> = ({ icon, label, onClick, primary }) => {
  return (
    <button
      onClick={onClick}
      className={`
        group relative flex flex-col items-center justify-end p-3 rounded-xl transition-all duration-200 hover:-translate-y-2
        ${primary ? "bg-blue-500/80 hover:bg-blue-400/90 shadow-lg shadow-blue-500/30" : "hover:bg-white/10 text-white/90"}
      `}
    >
      <div className="text-white drop-shadow-lg">{icon}</div>
      {/* Tooltip */}
      <span className="absolute -top-10 scale-0 group-hover:scale-100 transition-transform bg-black/80 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
        {label}
      </span>
    </button>
  );
};
