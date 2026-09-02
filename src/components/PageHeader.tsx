import React, { useState, useEffect, useRef } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  Plus, RefreshCw, CheckCircle2, AlertCircle, Sun, Moon,
  RefreshCcw, ExternalLink, ChevronDown, MoreHorizontal
} from "lucide-react";
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
  /** Google Sheets URL — renders "Open Source Sheet" inside the More dropdown */
  sheetUrl?: string;
  /** Extra action buttons rendered inside the More dropdown */
  extraButtons?: React.ReactNode;
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
  moduleId,
  sheetUrl,
  extraButtons
}) => {
  const {
    selectedEntities,
    toggleEntityFilter,
    paymentMethodFilter,
    setPaymentMethodFilter,
    googleUser,
    needsAuth,
    handleGoogleSignIn,
    isSyncing,
    syncAllFromGoogleSheets,
    theme,
    toggleTheme
  } = useFinance();

  const isLight = theme === "light";

  const [tokenFlash, setTokenFlash] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onRefresh = () => {
      setTokenFlash(true);
      setTimeout(() => setTokenFlash(false), 2500);
    };
    window.addEventListener("google-token-refreshed", onRefresh);
    return () => window.removeEventListener("google-token-refreshed", onRefresh);
  }, []);

  // Close More dropdown when clicking outside
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const isEntityActive = (entity: string) => {
    if (selectedEntities.has("ALL")) return false;
    return selectedEntities.has(entity);
  };

  // Whether the More menu has anything to show
  const hasMore = !!(extraButtons || sheetUrl);

  return (
    <div className={`${bgClass} text-white shrink-0 transition-colors`}>
      <div className="flex flex-wrap items-center justify-between px-4 pt-3 pb-2 gap-2">

        {/* Left: Title + auth badge */}
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--font-sans)" }}>{title}</h1>
          {googleUser && !needsAuth ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all duration-500 ${
              tokenFlash
                ? "bg-blue-500/30 text-blue-100 border-blue-400/40"
                : "bg-emerald-500/20 text-emerald-100 border-emerald-400/30"
            }`}>
              {tokenFlash
                ? <RefreshCcw className="w-3 h-3 text-blue-300 animate-spin" />
                : <CheckCircle2 className="w-3 h-3 text-emerald-300" />}
              <span className="hidden sm:inline">
                {tokenFlash ? "Token Refreshed" : "Google Sync Active"}
              </span>
            </span>
          ) : (
            <button
              onClick={handleGoogleSignIn}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/30 text-amber-100 hover:bg-amber-500/40 text-[11px] font-medium border border-amber-300/40 transition-colors cursor-pointer"
            >
              <AlertCircle className="w-3 h-3 text-amber-300" />
              <span className="hidden sm:inline">
                {needsAuth && googleUser ? "Reconnect Google" : "Connect Google Sheets"}
              </span>
            </button>
          )}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end">

          {/* Entity Filter Pills */}
          {showEntityPills && (
            <div className="flex items-center gap-1 bg-black/20 p-0.5 rounded-full border border-white/20">
              {[
                { id: "ALL",    label: "ALL",    active: selectedEntities.has("ALL"), color: "bg-white text-[#1a73e8]" },
                { id: "Ruby's", label: "Ruby's", active: isEntityActive("Ruby's"), color: "bg-[#d81b60] text-white ring-1 ring-white/50" },
                { id: "TI",     label: "TI",     active: isEntityActive("TI"),     color: "bg-[#1a73e8] text-white ring-1 ring-white/50" },
                { id: "MSDx",   label: "MSDx",   active: isEntityActive("MSDx"),   color: "bg-[#00897b] text-white ring-1 ring-white/50" },
              ].map(e => (
                <button
                  key={e.id}
                  onClick={() => toggleEntityFilter(e.id)}
                  className={`h-6 px-2.5 rounded-full text-[11px] font-semibold transition-all ${
                    e.active ? e.color : "text-white/60 hover:text-white"
                  }`}
                >
                  {e.label}
                </button>
              ))}
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

          {/* ── ALWAYS VISIBLE ── */}

          {/* Refresh */}
          <button
            onClick={syncAllFromGoogleSheets}
            disabled={isSyncing}
            className="btn-3d btn-3d-ghost disabled:opacity-40 disabled:cursor-not-allowed"
            title="Pull live data from Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          </button>

          {/* Screenshot */}
          <ScreenshotButton />

          {/* Primary Add action */}
          {onAddClick && (
            <button onClick={onAddClick} className="btn-3d btn-3d-ghost font-bold">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{addLabel}</span>
            </button>
          )}

          {/* ── MORE DROPDOWN ── theme + extras + sheet link */}
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(o => !o)}
              className={`btn-3d btn-3d-ghost gap-1 ${moreOpen ? "bg-white/20" : ""}`}
              title="More options"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`} />
            </button>

            {moreOpen && (
              <div
                className={`ph-more-menu absolute right-0 top-full mt-2 z-50 min-w-[190px] rounded-xl border py-1.5 overflow-hidden ${
                  isLight
                    ? "bg-white border-slate-200 shadow-[0_8px_32px_rgba(0,0,0,.15)]"
                    : "bg-[#0d111a] border-[#1a2235] shadow-[0_8px_32px_rgba(0,0,0,.6)]"
                }`}
                onClick={() => setMoreOpen(false)}
              >
                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] transition-colors ${
                    isLight ? "text-slate-700 hover:bg-slate-100" : "text-[#c8d4e8] hover:bg-[#1a2235]"
                  }`}
                >
                  {theme === "dark"
                    ? <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    : <Moon className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                  Switch to {theme === "dark" ? "Light" : "Dark"} Mode
                </button>

                {/* Divider before page-specific extras */}
                {(extraButtons || sheetUrl) && (
                  <div className={`my-1 mx-3 border-t ${isLight ? "border-slate-200" : "border-[#1a2235]"}`} />
                )}

                {/* Extra buttons (CSV, etc.) — passed as ReactNode; wrap in a context div */}
                {extraButtons && (
                  <div className="flex flex-col">
                    {extraButtons}
                  </div>
                )}

                {/* Open Source Sheet */}
                {sheetUrl && (
                  <a
                    href={sheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] transition-colors no-underline ${
                      isLight ? "text-slate-700 hover:bg-slate-100" : "text-[#c8d4e8] hover:bg-[#1a2235]"
                    }`}
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    Open Source Sheet
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      {tabs && tabs.length > 0 && (
        <div className="relative border-t border-white/10">
          {/* Fade gradient — hints at horizontal scroll on mobile */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black/25 to-transparent z-10 sm:hidden" />
          <div className="flex px-4 pt-1 gap-1 overflow-x-auto scrollbar-none">
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
        </div>
      )}
    </div>
  );
};
