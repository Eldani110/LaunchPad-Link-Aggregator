
import React from "react";
import { Folder, X, Pencil } from "lucide-react";
import { IconSize } from "../types";

interface IconProps {
  title: string;
  url?: string;
  customIconUrl?: string; // New Prop
  onClick: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  isFolder?: boolean;
  itemCount?: number;
  subIcons?: string[]; // Array of URLs for folder preview
  isDragging?: boolean;
  size?: IconSize;
}

export const Icon: React.FC<IconProps> = ({
  title,
  url,
  customIconUrl,
  onClick,
  onDelete,
  onEdit,
  isFolder = false,
  itemCount = 0,
  subIcons = [],
  isDragging = false,
  size = 'medium'
}) => {
  // Helper to get favicon
  const getFavicon = (u: string) =>
    `https://www.google.com/s2/favicons?domain=${u}&sz=128`;
  
  // Determine display URL: Custom > Google Favicon > Placeholder logic (handled by onError)
  const displayIconUrl = customIconUrl || (url ? getFavicon(url) : "");

  // Size Configuration Maps
  const containerSizeClasses = {
    small: "w-[80px]",
    medium: "w-[100px]",
    large: "w-[128px]"
  };

  const boxSizeClasses = {
    small: "w-12 h-12",
    medium: "w-16 h-16 sm:w-20 sm:h-20",
    large: "w-24 h-24"
  };

  const textSizeClasses = {
    small: "text-[10px]",
    medium: "text-xs sm:text-sm",
    large: "text-sm sm:text-base"
  };

  // Fixed height for text area to ensure grid rows stay perfectly aligned
  const textContainerHeight = {
    small: "h-8",    // ~2 lines of small text
    medium: "h-10",  // ~2 lines of medium text
    large: "h-12"    // ~2 lines of large text
  };
  
  const folderPreviewGap = {
    small: "gap-0.5",
    medium: "gap-0.5 sm:gap-1",
    large: "gap-1"
  };

  const folderPadding = {
    small: "p-1",
    medium: "p-1.5 sm:p-2",
    large: "p-2"
  };

  const folderIconSize = {
    small: "w-3 h-3",
    medium: "w-3.5 h-3.5 sm:w-4 sm:h-4",
    large: "w-6 h-6"
  }

  // If dragging, we simplify the look slightly and hide actions
  if (isDragging) {
      return (
        <div className={`flex flex-col items-center justify-center ${containerSizeClasses[size]} gap-2 p-2 rounded-xl bg-white/10 opacity-80 cursor-grabbing`}>
             <div className={`relative ${boxSizeClasses[size]} flex items-center justify-center`}>
                  <div className="w-full h-full bg-white rounded-2xl shadow-xl overflow-hidden flex items-center justify-center">
                      {isFolder ? <Folder className="text-gray-400" /> : <img src={displayIconUrl} className="w-full h-full object-cover" />}
                  </div>
             </div>
        </div>
      );
  }

  return (
    <div className={`group relative flex flex-col items-center ${containerSizeClasses[size]} p-2 rounded-xl transition-all duration-200 hover:bg-white/10 hover:z-50 touch-manipulation`}>
      
      {/* Action Buttons Container (Visible on Hover of the Icon Box) */}
      <div className="absolute -top-2 -right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
        
        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            onPointerDown={(e) => e.stopPropagation()} // Prevent drag start on click
            className="p-1.5 bg-gray-600 hover:bg-blue-500 text-white rounded-full shadow-lg transition-colors"
            title="Editar"
          >
            <Pencil size={12} strokeWidth={2.5} />
          </button>
        )}

        {/* Delete Button */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            onPointerDown={(e) => e.stopPropagation()} // Prevent drag start on click
            className="p-1.5 bg-gray-600 hover:bg-red-500 text-white rounded-full shadow-lg transition-colors"
            title="Eliminar"
          >
            <X size={12} strokeWidth={3} />
          </button>
        )}
      </div>

      <button
        onClick={onClick}
        className="flex flex-col items-center justify-start w-full gap-2 focus:outline-none active:scale-95 transition-transform"
      >
        <div className={`relative ${boxSizeClasses[size]} flex items-center justify-center shrink-0`}>
          {isFolder ? (
            <div className={`w-full h-full bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-lg grid grid-cols-3 ${folderPadding[size]} ${folderPreviewGap[size]} content-start overflow-hidden`}>
              {/* Folder Mini Preview */}
              {subIcons.slice(0, 9).map((subUrl, idx) => (
                <div key={idx} className="flex items-center justify-center aspect-square">
                    <img
                    src={subUrl}
                    alt=""
                    className={`${folderIconSize[size]} rounded-sm object-cover opacity-90`}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                </div>
              ))}
              {subIcons.length === 0 && (
                  <div className="col-span-3 row-span-3 flex items-center justify-center h-full">
                    <Folder className="w-1/2 h-1/2 text-white/50" />
                  </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full bg-white rounded-2xl shadow-xl overflow-hidden flex items-center justify-center transition-transform group-hover:-translate-y-1">
               {/* Fallback image logic is handled by the browser's default behavior, but we use Google's consistent favicon service */}
              <img
                src={displayIconUrl}
                alt={title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Local inline SVG fallback (no external placeholder dependency)
                  const initial = (title.trim().charAt(0) || "?").toUpperCase().replace(/[<>&"']/g, "");
                  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="#1e293b"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="56" font-weight="600">${initial}</text></svg>`;
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
                }}
              />
            </div>
          )}
        </div>

        {/* 
            Text Container Strategy:
            1. Use a relative container with a FIXED height matching the lines we want to show by default (alignment).
            2. Place the text inside as an absolute element.
            3. By default, line-clamp it.
            4. On hover, remove line-clamp, add background/blur, and let it expand over the content (z-index).
        */}
        <div className={`relative w-full ${textContainerHeight[size]} flex justify-center`}>
          <span 
            className={`
              absolute top-0 left-1/2 -translate-x-1/2
              text-white ${textSizeClasses[size]} font-medium text-center leading-tight
              transition-all duration-200 ease-out
              
              /* Default State: Clamped, limited width, transparent */
              w-full px-1 line-clamp-2 drop-shadow-md z-10

              /* Hover State: Expanded, Background, High Z-Index */
              group-hover:z-50
              group-hover:w-auto group-hover:min-w-[120%] group-hover:max-w-[180px]
              group-hover:line-clamp-none
              group-hover:bg-gray-900/95 group-hover:backdrop-blur-xl
              group-hover:border group-hover:border-white/10
              group-hover:shadow-2xl group-hover:rounded-lg
              group-hover:px-2 group-hover:py-1.5
              group-hover:scale-105
            `}
          >
            {title}
          </span>
        </div>
      </button>
    </div>
  );
};
