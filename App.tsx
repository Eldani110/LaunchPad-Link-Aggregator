import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { LaunchpadProvider, useLaunchpad } from "./context/LaunchpadContext";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { DesktopUpdateBanner } from "./components/DesktopUpdateBanner";
import { Toaster } from "sonner";

const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthReady, isCloudConnected } = useLaunchpad();

  if (!isAuthReady) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-900">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!isCloudConnected) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default function App() {
  return (
    <LaunchpadProvider>
      <HashRouter>
        <Toaster position="top-center" richColors />
        <DesktopUpdateBanner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/category/:categoryId"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </LaunchpadProvider>
  );
}
