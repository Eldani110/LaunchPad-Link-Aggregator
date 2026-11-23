
import React from "react";
import { Folder, X, Pencil, Monitor } from "lucide-react";
import { IconSize, LinkItemType } from "../types";
import { getLocalAppFallbackIcon } from "../services/platform";

interface IconProps {
  title: string;
  url?: string;
  itemType?: LinkItemType;
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
  itemType = 'web',
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
  const isLocalApp = !isFolder && itemType === 'app';

  // Helper to get favicon
  const getFavicon = (u: string) =>
    `https://www.google.com/s2/favicons?domain=${u}&sz=128`;
  
  // Determine display URL: Custom > Local App SVG fallback > Google Favicon
  const displayIconUrl =
    customIconUrl ||
    (isLocalApp ? getLocalAppFallbackIcon(title) : url ? getFavicon(url) : "");

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
    <div className={`group relative flex flex-col items-center ${containerSizeClasses[size]} p-2 rounded-xl touch-manipulation`}>
      
      {/* Action Buttons Container (Visible on Hover of the Icon Box, without animation) */}
      <div className="absolute -top-2 -right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100">
        
        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            onPointerDown={(e) => e.stopPropagation()} // Prevent drag start on click
            className="p-1.5 bg-gray-600 hover:bg-blue-500 text-white rounded-full shadow-lg"
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
            className="p-1.5 bg-gray-600 hover:bg-red-500 text-white rounded-full shadow-lg"
            title="Eliminar"
          >
            <X size={12} strokeWidth={3} />
          </button>
        )}
      </div>

      <button
        onClick={onClick}
        title={title}
        className="flex flex-col items-center justify-start w-full gap-2 focus:outline-none cursor-pointer"
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
            <div className={`relative w-full h-full rounded-2xl shadow-xl overflow-hidden flex items-center justify-center ${isLocalApp ? "bg-slate-900/90 border border-white/15" : "bg-white"}`}>
              <img
                src={displayIconUrl}
                alt={title}
                className={`w-full h-full ${isLocalApp && customIconUrl ? "object-contain p-1.5" : "object-cover"}`}
                onError={(e) => {
                  // Local inline SVG fallback (no external placeholder dependency)
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = getLocalAppFallbackIcon(title);
                }}
              />
              {isLocalApp && (
                <span
                  className="absolute bottom-1 right-1 p-1 rounded-md bg-gray-950/85 border border-white/15 text-blue-300 shadow"
                  title="Programa del PC"
                >
                  <Monitor size={size === "small" ? 9 : 11} />
                </span>
              )}
            </div>
          )}
        </div>

        <div className={`w-full ${textContainerHeight[size]} flex justify-center`}>
          <span
            className={`w-full px-1 line-clamp-2 text-white ${textSizeClasses[size]} font-medium text-center leading-tight drop-shadow-md`}
          >
            {title}
          </span>
        </div>
      </button>
    </div>
  );
};
