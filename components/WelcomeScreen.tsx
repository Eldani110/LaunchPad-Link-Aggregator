
import React from "react";
import { ArrowRight, HardDrive } from "lucide-react";
import { useLaunchpad } from "../context/LaunchpadContext";

export const WelcomeScreen: React.FC = () => {
  const { 
    appTitle, 
    logoImage, 
    connectDrive, 
    enterGuestMode 
  } = useLaunchpad();

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
      {/* Background Overlay */}
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-3xl" />

      {/* Card */}
      <div className="relative w-full max-w-md bg-black/40 border border-white/10 rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-500 flex flex-col items-center text-center">
        
        <div className="w-24 h-24 mb-6 rounded-3xl overflow-hidden shadow-2xl border border-white/10">
            <img src={logoImage} alt="Logo" className="w-full h-full object-cover" />
        </div>

        <h1 className="text-3xl font-thin text-white mb-2 tracking-tight">
          Bienvenido a <span className="font-normal">{appTitle}</span>
        </h1>
        
        <p className="text-white/60 mb-8 text-sm leading-relaxed max-w-xs">
          Tu espacio personal para organizar enlaces y recursos. Sincroniza tus datos en la nube para acceder desde cualquier lugar.
        </p>

        <div className="w-full space-y-3">
          <button
            onClick={connectDrive}
            className="w-full py-3.5 bg-white text-black hover:bg-white/90 rounded-xl font-semibold transition-all transform hover:scale-[1.02] flex items-center justify-center gap-3 shadow-xl shadow-white/10"
          >
             <img src="https://www.google.com/favicon.ico" alt="G" className="w-5 h-5" />
             <span>Continuar con Google</span>
          </button>

          <button
            onClick={enterGuestMode}
            className="w-full py-3.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 border border-white/5"
          >
             <HardDrive size={18} />
             <span>Usar modo offline</span>
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-white/5 w-full">
            <p className="text-[10px] text-white/20 uppercase tracking-widest">
                Seguro • Privado • Sincronizado
            </p>
        </div>
      </div>
    </div>
  );
};
