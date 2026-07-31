import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { ExternalLink, Settings, RefreshCw, Edit2, Check, AlertCircle, EyeOff, Eye, Maximize2, Minimize2 } from "lucide-react";
import { CurcuminLogo, FourYrLogo, ZiglarLogo } from "../EntityLogos";

interface GasDashboardViewProps {
  entityKey: "curcumin" | "fouryr" | "ziglar";
  title: string;
}

const DEFAULT_GAS_URL = "https://script.google.com/a/macros/marktimm.com/s/AKfycbxvL1T_dHYg7s2tQmlfen7Y-eeYT6cU-L3vjv8RJ51pJWu7CydOfT9YyUy0MUJEsyFi/exec";

export const GasDashboardView: React.FC<GasDashboardViewProps> = ({ entityKey, title }) => {
  const { gasUrls, updateGasUrl, theme } = useFinance();
  const isLight = theme === "light";

  const rawUrl = gasUrls?.[entityKey] || DEFAULT_GAS_URL;
  const currentUrl = rawUrl.trim() || DEFAULT_GAS_URL;

  const [keyCounter, setKeyCounter] = useState(0);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [editedUrl, setEditedUrl] = useState(currentUrl);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(true);

  const renderLogo = () => {
    if (entityKey === "curcumin") return <CurcuminLogo className="h-7 max-w-[200px]" isLight={isLight} />;
    if (entityKey === "fouryr") return <FourYrLogo className="h-7 max-w-[200px]" isLight={isLight} />;
    return <ZiglarLogo className="h-7 max-w-[200px]" isLight={isLight} />;
  };

  const headerBg = entityKey === "curcumin"
    ? "bg-[#6d4c41]"
    : entityKey === "fouryr"
    ? "bg-[#0e7a3f]"
    : "bg-[#059669]";

  const handleSaveUrl = () => {
    if (editedUrl.trim()) {
      updateGasUrl(entityKey, editedUrl.trim());
      setIsEditingUrl(false);
      setKeyCounter((prev) => prev + 1);
    }
  };

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#0a0a0a] text-[#e8e8e8]"}`}>
      {!isHeaderCollapsed && (
        <>
          <PageHeader
            title={`${title} Web App Dashboard`}
            bgClass={headerBg}
            moduleId="gas-dashboard"
            showEntityPills={false}
          />

          {/* Top Action Bar */}
          <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b ${isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#111] border-[#262626] text-white"} shrink-0`}>
            <div className="flex items-center gap-3 min-w-0">
              {renderLogo()}
              <span className="text-xs text-slate-400 hidden sm:inline">|</span>
              
              {!isEditingUrl ? (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 truncate max-w-xs md:max-w-md font-mono bg-slate-100 dark:bg-[#181818] px-2 py-0.5 rounded border border-slate-200 dark:border-[#333]">
                    {currentUrl}
                  </span>
                  <button
                    onClick={() => {
                      setEditedUrl(currentUrl);
                      setIsEditingUrl(true);
                    }}
                    className="p-1 text-slate-400 hover:text-purple-500 rounded"
                    title="Edit Web App URL"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-1 min-w-[280px]">
                  <input
                    type="text"
                    value={editedUrl}
                    onChange={(e) => setEditedUrl(e.target.value)}
                    placeholder="Paste Google Apps Script / Dashboard Web App URL..."
                    className={`flex-1 px-2 py-1 text-xs font-mono rounded border ${isLight ? "bg-slate-50 border-purple-300 text-slate-900" : "bg-[#181818] border-purple-500 text-white"} focus:outline-none`}
                  />
                  <button
                    onClick={handleSaveUrl}
                    className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Save
                  </button>
                  <button
                    onClick={() => setIsEditingUrl(false)}
                    className="px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsHeaderCollapsed(true)}
                className={`p-1.5 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  isLight ? "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800" : "bg-[#222] hover:bg-[#2a2a2a] border-[#444] text-gray-200"
                }`}
                title="Hide URL Bar & Maximize Area"
              >
                <EyeOff className="w-3.5 h-3.5 text-purple-500" />
                <span>Hide Bar (Maximize)</span>
              </button>

              <button
                onClick={() => setKeyCounter((prev) => prev + 1)}
                className={`p-1.5 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  isLight ? "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700" : "bg-[#1a1a1a] hover:bg-[#222] border-[#333] text-gray-300"
                }`}
                title="Reload Embedded Frame"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                <span>Reload</span>
              </button>

              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all transform hover:scale-[1.02]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Launch in New Tab</span>
              </a>
            </div>
          </div>

          {/* Info notice for embedded iframe */}
          <div className={`px-4 py-1.5 text-[11px] border-b flex items-center justify-between ${isLight ? "bg-amber-50/60 border-amber-200 text-amber-800" : "bg-amber-950/30 border-amber-900/40 text-amber-300"}`}>
            <div className="flex items-center gap-2 truncate">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
              <span className="truncate">
                If Google Apps Script blocks iframe embedding due to account permissions, click <strong>Launch in New Tab</strong> to open directly.
              </span>
            </div>
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-bold shrink-0 ml-2 hover:opacity-80"
            >
              Open Link &rarr;
            </a>
          </div>
        </>
      )}

      {/* Main Full-Height Embedded Web App View */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-white">
        {isHeaderCollapsed && (
          <button
            onClick={() => setIsHeaderCollapsed(false)}
            className="absolute bottom-3 right-3 z-50 p-1.5 rounded-full bg-black/30 hover:bg-black/60 text-white/60 hover:text-white transition-all backdrop-blur-sm opacity-50 hover:opacity-100"
            title="Show toolbar"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
        <iframe
          key={keyCounter}
          src={currentUrl}
          title={`${title} Live Web App Dashboard`}
          className="w-full h-full border-0 absolute inset-0"
          allow="clipboard-read; clipboard-write; autoplay; geolocation; camera; microphone; payment; fullscreen"
        />
      </div>
    </div>
  );
};
