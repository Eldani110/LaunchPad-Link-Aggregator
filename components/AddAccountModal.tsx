import React, { useState, useEffect } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail, UserPlus, X } from "lucide-react";
import { useLaunchpad } from "../context/LaunchpadContext";
import { toast } from "sonner";

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountAdded?: () => void;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountAdded,
}) => {
  const { addAccountWithEmail, registerAccountWithEmail, resetPassword } = useLaunchpad();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setEmail("");
      setPassword("");
      setShowPassword(false);
      setFormError(null);
      setMode("login");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email.trim() || !password) {
      setFormError("Ingresa tu correo y contraseña.");
      return;
    }

    if (mode === "register" && password.length < 6) {
      setFormError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result =
        mode === "login"
          ? await addAccountWithEmail(email, password)
          : await registerAccountWithEmail(email, password);

      if (result.alreadyOpen) {
        toast.info("Esta cuenta ya está abierta en otra pestaña");
      } else {
        toast.success(
          mode === "login"
            ? "Cuenta agregada en una nueva pestaña"
            : "Cuenta creada y abierta en una nueva pestaña"
        );
      }

      onAccountAdded?.();
      onClose();
    } catch (err: any) {
      setFormError(err?.message || "No se pudo agregar la cuenta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setFormError(null);
    if (!email.trim()) {
      setFormError("Escribe tu correo primero para enviarte el enlace de recuperación.");
      return;
    }
    setIsSubmitting(true);
    try {
      await resetPassword(email);
      toast.success("Se envió un correo para restablecer tu contraseña");
    } catch (err: any) {
      setFormError(err?.message || "No se pudo enviar el correo de recuperación.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/55 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        className="relative w-full max-w-md bg-gray-900/90 backdrop-blur-2xl border border-white/15 rounded-3xl p-7 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          title="Cerrar"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mb-3 text-blue-300">
            <UserPlus size={22} />
          </div>
          <h2 className="text-xl font-medium text-white tracking-tight">
            Agregar cuenta
          </h2>
          <p className="text-xs text-white/55 mt-1 max-w-xs">
            Se abrirá en su propia pestaña con su espacio sincronizado de forma independiente.
          </p>
        </div>

        {/* Mode Switch */}
        <div className="w-full grid grid-cols-2 p-1 mb-4 bg-white/5 border border-white/10 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setFormError(null);
            }}
            className={`py-2 text-xs font-medium rounded-lg transition-all ${
              mode === "login"
                ? "bg-white/15 text-white shadow"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setFormError(null);
            }}
            className={`py-2 text-xs font-medium rounded-lg transition-all ${
              mode === "register"
                ? "bg-white/15 text-white shadow"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            Crear cuenta
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-3">
          <div className="relative group">
            <Mail
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-white/45 group-focus-within:text-white/80 transition-colors"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Correo electrónico"
              autoComplete="email"
              autoFocus
              disabled={isSubmitting}
              className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus:bg-white/10 focus:ring-2 focus:ring-white/10 transition-all"
            />
          </div>

          <div className="relative group">
            <Lock
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-white/45 group-focus-within:text-white/80 transition-colors"
            />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              disabled={isSubmitting}
              className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus:bg-white/10 focus:ring-2 focus:ring-white/10 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-white/45 hover:text-white/90 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {mode === "login" && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isSubmitting}
                className="text-xs text-white/50 hover:text-white transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {formError && (
            <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs text-center">
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-white text-black hover:bg-white/90 disabled:opacity-60 rounded-xl font-semibold text-sm transition-all transform hover:scale-[1.01] flex items-center justify-center gap-2 shadow-xl shadow-white/10"
          >
            {isSubmitting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : mode === "login" ? (
              "Abrir cuenta en pestaña"
            ) : (
              "Crear y abrir pestaña"
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

