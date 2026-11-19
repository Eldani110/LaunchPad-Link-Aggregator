
import React from "react";
import { GlassModal } from "./GlassModal";
import { AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  subMessage?: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  subMessage,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  isDanger = false,
}) => {
  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-6">
        <div className="flex items-center gap-4 text-white/80">
          <div className={`p-3 rounded-full ${isDanger ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="font-medium text-white">{message}</p>
            {subMessage && <p className="text-sm text-white/60">{subMessage}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors shadow-lg ${
              isDanger 
                ? "bg-red-600 hover:bg-red-500 shadow-red-500/20" 
                : "bg-blue-600 hover:bg-blue-500 shadow-blue-500/20"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </GlassModal>
  );
};
