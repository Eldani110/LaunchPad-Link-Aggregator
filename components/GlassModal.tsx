import React, { useEffect, useState } from "react";
import { X, Loader2, Sparkles } from "lucide-react";

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

export const GlassModal: React.FC<GlassModalProps> = ({
  isOpen,
  onClose,
  children,
  title,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl max-h-[calc(100vh-1.5rem)] flex flex-col bg-gray-900/90 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
          <h2 className="text-base sm:text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-white/60 hover:text-white transition-colors rounded-full hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
};