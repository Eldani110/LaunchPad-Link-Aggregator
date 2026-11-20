import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, Mail, X } from "lucide-react";
import { useLaunchpad } from "../context/LaunchpadContext";
import { getDesktopWindow, isDesktopApp } from "../services/platform";
import { toast } from "sonner";

export const Login: React.FC = () => {
  const {
    appTitle,
    backgroundImage,
    logoImage,
    isAuthReady,
    isCloudConnected,
    loginWithEmail,
    registerWithEmail,
    resetPassword,
    error,
  } = useLaunchpad();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLauncherMode, setIsLauncherMode] = useState(false);

  useEffect(() => {
    if (!isDesktopApp()) return;
    const winBridge = getDesktopWindow();
    if (!winBridge) return;
    let active = true;
    winBridge.getPrefs().then((p) => {
      if (active) setIsLauncherMode(p.windowMode === "launcher");
    }).catch(() => {});
    const unsub = winBridge.onPrefsChange((p) => {
      if (active) setIsLauncherMode(p.windowMode === "launcher");
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-900">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (isCloudConnected) {
    return <Navigate to="/" replace />;
  }

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
      if (mode === "login") {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password);
        toast.success("Cuenta creada con éxito");
      }
    } catch (err: any) {
      setFormError(err?.message || "No se pudo completar la autenticación.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setFormError(null);
    if (!email.trim()) {
      setFormError("Escribe tu correo electrónico primero para enviarte el enlace de recuperación.");
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

  const displayError = formError || error;

  return (
    <div
      className={`relative w-full overflow-hidden font-sans text-slate-100 flex items-center justify-center ${
        isLauncherMode
          ? "h-screen bg-transparent p-0"
          : "min-h-screen bg-gray-900 p-4"
      }`}
    >
      {/* Background (full wallpaper in normal/web mode; rounded translucent shell in floating launcher mode) */}
      {isLauncherMode ? (
        <div
          className="electron-drag absolute inset-0 z-0 rounded-[22px] bg-neutral-900/55"
          style={{
            boxShadow:
              "inset 0 0.75px 0 0 rgba(255, 255, 255, 0.34), inset 0 0 0 0.75px rgba(255, 255, 255, 0.14)",
          }}
        >
          <button
            type="button"
            onClick={() => void getDesktopWindow()?.hide()}
            className="electron-no-drag absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
            title="Ocultar"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${backgroundImage}')` }}
        >
          <div className="absolute inset-0 bg-gray-900/65 backdrop-blur-3xl" />
        </div>
      )}

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md bg-black/45 border border-white/10 rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-500 flex flex-col items-center text-center">
        <div className="w-20 h-20 mb-4 rounded-3xl overflow-hidden shadow-2xl border border-white/10">
          <img src={logoImage} alt="Logo" className="w-full h-full object-cover" />
        </div>

        <h1 className="text-2xl font-thin text-white mb-1 tracking-tight">
          Bienvenido a <span className="font-normal">{appTitle}</span>
        </h1>

        <p className="text-white/60 mb-6 text-xs leading-relaxed max-w-xs">
          Inicia sesión para acceder a tus enlaces y recursos sincronizados en la nube.
        </p>

        {/* Login / Register Switch */}
        <div className="w-full grid grid-cols-2 p-1 mb-5 bg-white/5 border border-white/10 rounded-xl">
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

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-3 text-left">
          <div className="relative group">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-white/45 group-focus-within:text-white/80 transition-colors" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Correo electrónico"
              autoComplete="email"
              disabled={isSubmitting}
              className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus:bg-white/10 focus:ring-2 focus:ring-white/10 transition-all"
            />
          </div>

          <div className="relative group">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-white/45 group-focus-within:text-white/80 transition-colors" />
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

          {displayError && (
            <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs text-center">
              {displayError}
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
              "Iniciar sesión"
            ) : (
              "Crear cuenta"
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/5 w-full">
          <p className="text-[10px] text-white/20 uppercase tracking-widest">
            Seguro • Privado • Sincronizado
          </p>
        </div>
      </div>
    </div>
  );
};

