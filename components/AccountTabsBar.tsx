import React, { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { AccountTab } from "../types";
import { useLaunchpad } from "../context/LaunchpadContext";
import { AddAccountModal } from "./AddAccountModal";
import { ConfirmModal } from "./ConfirmModal";
import { toast } from "sonner";

interface AccountTabsBarProps {
  onAccountSwitch?: () => void;
}

const getTabLabel = (tab: AccountTab): string => {
  const username = tab.email.split("@")[0] || tab.email;
  if (tab.appTitle && tab.appTitle.trim() && tab.appTitle !== "LaunchPad") {
    return tab.appTitle;
  }
  return username;
};

const getInitial = (tab: AccountTab): string => {
  const source = getTabLabel(tab) || tab.email || "U";
  return source.charAt(0).toUpperCase();
};

export const AccountTabsBar: React.FC<AccountTabsBarProps> = React.memo(
  ({ onAccountSwitch }) => {
    const {
      accounts,
      activeSlotId,
      isSwitchingAccount,
      isSyncing,
      switchAccount,
      removeAccount,
    } = useLaunchpad();

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [tabToClose, setTabToClose] = useState<AccountTab | null>(null);

    // Keyboard shortcut: Alt+1..9 to switch between account tabs instantaneously
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const digit = Number(e.key);
        if (digit >= 1 && digit <= 9 && digit <= accounts.length) {
          e.preventDefault();
          const target = accounts[digit - 1];
          if (target && target.slotId !== activeSlotId) {
            switchAccount(target.slotId);
            onAccountSwitch?.();
          }
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [accounts, activeSlotId, onAccountSwitch, switchAccount]);

    const handleSelectTab = (slotId: string) => {
      if (slotId === activeSlotId) return;
      switchAccount(slotId);
      onAccountSwitch?.();
    };

    const handleConfirmClose = async () => {
      if (!tabToClose) return;
      const closingEmail = tabToClose.email;
      const slotId = tabToClose.slotId;
      setTabToClose(null);
      await removeAccount(slotId);
      onAccountSwitch?.();
      toast.info(`Sesión cerrada: ${closingEmail}`);
    };

    return (
      <>
        <header className="relative z-50 h-11 w-full bg-black/60 backdrop-blur-2xl border-b border-white/10 px-2 pt-1.5 flex items-end gap-1 select-none shrink-0">
          {/* Tabs Strip */}
          <div className="flex items-end gap-1 overflow-x-auto flex-1 h-full pr-1">
            {accounts.map((tab, idx) => {
              const isActive = tab.slotId === activeSlotId;
              const label = getTabLabel(tab);
              const showEmailSub =
                tab.appTitle &&
                tab.appTitle !== "LaunchPad" &&
                tab.email;

              return (
                <div
                  key={tab.slotId}
                  role="tab"
                  aria-selected={isActive}
                  title={`${tab.email} (Alt+${idx + 1})`}
                  onClick={() => handleSelectTab(tab.slotId)}
                  className={`group relative h-full min-w-[136px] max-w-[230px] shrink-0 px-3 rounded-t-xl border-t border-x flex items-center gap-2 cursor-pointer transition-all duration-150 ${
                    isActive
                      ? "bg-white/15 border-white/20 text-white shadow-[0_-2px_12px_rgba(0,0,0,0.25)]"
                      : "bg-white/[0.03] border-transparent text-white/55 hover:bg-white/[0.08] hover:text-white/90"
                  }`}
                >
                  {/* Avatar / Workspace Icon */}
                  {tab.logoImage ? (
                    <img
                      src={tab.logoImage}
                      alt=""
                      className="w-4 h-4 rounded-sm object-cover shrink-0 border border-white/15"
                    />
                  ) : (
                    <span className="w-4 h-4 rounded-sm bg-blue-500/40 text-[10px] font-semibold flex items-center justify-center shrink-0 text-white">
                      {getInitial(tab)}
                    </span>
                  )}

                  {/* Label */}
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium leading-none">
                      {label}
                    </span>
                    {showEmailSub && (
                      <span className="hidden lg:inline truncate text-[10px] text-white/40 leading-none">
                        {tab.email.split("@")[0]}
                      </span>
                    )}
                  </div>

                  {/* Active Sync Indicator */}
                  {isActive && (
                    <span className="shrink-0 flex items-center">
                      {isSyncing ? (
                        <Loader2 size={11} className="animate-spin text-blue-300" />
                      ) : (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-emerald-400/90"
                          title="Sincronizado"
                        />
                      )}
                    </span>
                  )}

                  {/* Close Tab / Sign Out Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTabToClose(tab);
                    }}
                    title={`Cerrar sesión de ${tab.email}`}
                    className={`p-0.5 rounded-md transition-all shrink-0 ${
                      isActive
                        ? "text-white/50 hover:text-white hover:bg-white/15"
                        : "opacity-0 group-hover:opacity-100 text-white/40 hover:text-white hover:bg-white/15"
                    }`}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}

            {/* Browser-style New Account Tab (+) Button */}
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              title="Agregar otra cuenta"
              className="h-8 w-8 mb-0.5 ml-0.5 shrink-0 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Account Counter Pill (subtle on desktop when 2+ accounts) */}
          {accounts.length > 1 && (
            <div className="hidden sm:flex items-center pb-2 px-2 text-[10px] text-white/40 shrink-0">
              {accounts.length} cuentas
            </div>
          )}

          {/* Thin loading shimmer while lazily restoring an uncached tab */}
          {isSwitchingAccount && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500/20 overflow-hidden">
              <div className="h-full w-1/3 bg-blue-400 animate-pulse" />
            </div>
          )}
        </header>

        <AddAccountModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAccountAdded={onAccountSwitch}
        />

        <ConfirmModal
          isOpen={!!tabToClose}
          onClose={() => setTabToClose(null)}
          onConfirm={handleConfirmClose}
          title="Cerrar sesión en esta pestaña"
          message={`¿Cerrar la sesión de "${tabToClose?.email}"?`}
          subMessage={
            accounts.length > 1
              ? "Tus datos quedan guardados en Firebase. Las demás pestañas seguirán abiertas."
              : "Tus datos quedan guardados en Firebase y volverás a la pantalla de inicio de sesión."
          }
          confirmText="Cerrar sesión"
          isDanger
        />
      </>
    );
  }
);

AccountTabsBar.displayName = "AccountTabsBar";

