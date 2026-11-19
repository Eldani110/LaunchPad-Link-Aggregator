import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { LaunchpadProvider } from "./context/LaunchpadContext";
import { Home } from "./pages/Home";
import { Toaster } from "sonner";

export default function App() {
  return (
    <LaunchpadProvider>
      <HashRouter>
        <Toaster position="top-center" richColors />
        <Routes>
          {/* Main Desktop/Dashboard View */}
          <Route path="/" element={<Home />} />
          <Route path="/category/:categoryId" element={<Home />} />
          
          {/* Future routes (e.g. /settings, /login) can be added here easily */}
          
        </Routes>
      </HashRouter>
    </LaunchpadProvider>
  );
}