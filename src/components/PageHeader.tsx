import React, { useState, useEffect } from "react";
import { useFinance } from "../context/FinanceContext";
import { Plus, RefreshCw, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, AlertCircle, Sun, Moon, RefreshCcw } from "lucide-react";
import { ScreenshotButton } from "./ScreenshotButton";

interface PageHeaderProps {
  title: string;
  bgClass?: string;
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  showEntityPills?: boolean;
  showPayToggle?: boolean;
  onAddClick?: () => void;
  addLabel?: string;
  moduleId?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  bgClass = "bg-[#1a73e8]",
  tabs,
  activeTab,
  onTabChange,
  showEntityPills = false,
  showPayToggle = false,
  onAddClick,
  addLabel = "Add Bill",
  moduleId
}) => {
  const {
    selectedEntities,
    toggleEntityFilter,
    paymentMethodFilter,
    setPaymentMethodFilter,
    setCurrentPage,
    googleUser,
    needsAuth,
    handleGoogleSignIn,
    isSyncing,
    syncModuleFromGoogleSheet,
    syncAllFromGoogleSheets,
    theme,
    toggleTheme
  } = useFinance();

  // Token refresh flash — fires when silent GIS refresh succeeds
  const [tokenFlash, setTokenFlash] = useState(false);
  useEffect(() => {
    const onRefresh = () => {
      setTokenFlash(true);
      setTimeout(() => setTokenFlash(false), 2500);
    };
    window.addEventListener("google-token-refreshed", onRefresh);
    return () => window.removeEventListener("google-token-refreshed", onRefresh);
  }, []);

  const isEntityActive = (entity: string) => {
    if (selectedEntities.has("ALL")) return false;
    return selectedEntities.has(entity);
  };

  return (
    <div className={`${bgClass} text-white shrink-0 transition-colors`}>
      <div className="flex flex-wrap items-center justify-between px-4 pt-3 pb-2 gap-2">
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--font-sans)" }}>{title}</h1>
          {/* Auth / Token Status Badge — always visible */}
          {googleUser ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all duration-500 ${
              tokenFlash
                ? "bg-blue-500/30 text-blue-100 border-blue-400/40"
                : "bg-emerald-500/20 text-emerald-100 border-emerald-400/30"
            }`}>
              {tokenFlash
                ? <RefreshCcw className="w-3 h-3 text-blue-300 animate-spin" />
                : <CheckCircle2 className="w-3 h-3 text-emerald-300" />
              }
              <span className="hidden sm:inline">
                {tokenFlash ? "Token Refreshed" : "Google Sync Active"}
              </span>
            </span>
          ) : (
            <button
              onClick={handleGoogleSignIn}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/30 text-amber-100 hover:bg-amber-500/40 text-[11px] font-medium border border-amber-300/40 transition-colors"
            >
              <AlertCircle className="w-3 h-3 text-amber-300" />
              <span className="hidden sm:inline">Connect Google Sheets</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Entity Filter Pills */}
          {showEntityPills && (
            <div className="flex items-center gap-1.5 bg-black/20 p-0.5 rounded-full border border-white/20">
              <button
                onClick={() => toggleEntityFilter("ALL")}
                className={`h-6 px-3 rounded-full text-[11px] font-semibold transition-all ${
                  selectedEntities.has("ALL")
                    ? "bg-white text-[#1a73e8] shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
              >
                ALL
              </button>
              <button
                onClick={() => toggleEntityFilter("Ruby's")}
                className={`h-6 px-2.5 rounded-full text-[11px] font-semibold transition-all ${
                  isEntityActive("Ruby's")
                    ? "bg-[#d81b60] text-white ring-1 ring-white/50"
                    : "text-white/50 hover:text-white"
                }`}
              >
                Ruby's
              </button>
              <button
                onClick={() => toggleEntityFilter("TI")}
                className={`h-6 px-2.5 rounded-full text-[11px] font-semibold transition-all ${
                  isEntityActive("TI")
                    ? "bg-[#1a73e8] text-white ring-1 ring-white/50"
                    : "text-white/50 hover:text-white"
                }`}
              >
                TI
              </button>
              <button
                onClick={() => toggleEntityFilter("MSDx")}
                className={`h-6 px-2.5 rounded-full text-[11px] font-semibold transition-all ${
                  isEntityActive("MSDx")
                    ? "bg-[#00897b] text-white ring-1 ring-white/50"
                    : "text-white/50 hover:text-white"
                }`}
              >
                MSDx
              </button>
            </div>
          )}

          {/* Payment Method Toggle */}
          {showPayToggle && (
            <div className="flex bg-white/20 rounded-full overflow-hidden p-0.5">
              {["All", "Check", "Online", "Cash"].map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethodFilter(method)}
                  className={`h-6 px-2.5 text-[11px] font-medium rounded-full transition-colors ${
                    paymentMethodFilter === method
                      ? "bg-white text-[#1a73e8] font-semibold"
                      : "text-white/80 hover:text-white"
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          )}

          {/* Refresh / Pull Live Button */}
          <button
            onClick={syncAllFromGoogleSheets}
            disabled={isSyncing}
            className="btn-3d btn-3d-ghost disabled:opacity-40 disabled:cursor-not-allowed"
            title="Pull live data from Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          </button>

          {/* Screenshot Button */}
          <ScreenshotButton />

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="btn-3d btn-3d-ghost"
            title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
          >
            {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5 text-slate-100" />}
            <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
          </button>

          {onAddClick && (
            <button
              onClick={onAddClick}
              className="btn-3d btn-3d-ghost font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              {addLabel}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      {tabs && tabs.length > 0 && (
        <div className="flex px-4 pt-1 gap-1 border-t border-white/10 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange && onTabChange(tab.id)}
              className={`px-4 py-1.5 text-[13px] font-medium border-b-2 transition-all capitalize whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-white text-white font-semibold"
                  : "border-transparent text-white/60 hover:text-white/90"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
