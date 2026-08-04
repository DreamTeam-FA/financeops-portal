import React, { useState, useRef, useEffect } from "react";
import { Settings, X, Moon, Sun, FileSpreadsheet, Tag, Database } from "lucide-react";
import { useFinance } from "../../context/FinanceContext";
import { HeadleysPage } from "../pages/HeadleysPage";

const ENTITY_COLORS: Record<string, string> = {
  "Ruby's": "#d81b60",
  TI:       "#1a73e8",
  MSDx:     "#00897b",
};

interface GearDropdownProps {
  variant?: "wide" | "collapsed";
}

export const GearDropdown: React.FC<GearDropdownProps> = ({ variant = "wide" }) => {
  const { theme, toggleTheme, apBills, setCurrentPage } = useFinance();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modal, setModal] = useState<"headleys" | "metadata" | null>(null);
  const [metaSearch, setMetaSearch] = useState("");
  const [metaFilter, setMetaFilter] = useState<"all" | "Ruby's" | "TI" | "MSDx">("all");
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isLight = theme === "light";

  // Derive unique vendor metadata entries from bills
  const vendorMetaMap: Record<string, { entity: string; vendor: string; recurringType?: string; costType?: string; paymentType?: string }> = {};
  apBills.forEach(bill => {
    const key = `${bill.entity}::${bill.vendor}`;
    if (!vendorMetaMap[key] && (bill.recurringType || bill.costType || bill.paymentType)) {
      vendorMetaMap[key] = {
        entity: bill.entity,
        vendor: bill.vendor,
        recurringType: bill.recurringType,
        costType: bill.costType,
        paymentType: bill.paymentType,
      };
    }
  });
  const vendorMetaList = Object.values(vendorMetaMap).sort((a, b) => a.vendor.localeCompare(b.vendor));

  const iconSize = variant === "wide" ? "w-3.5 h-3.5" : "w-4 h-4";
  const btnClass = variant === "wide"
    ? `flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors ${
        dropdownOpen
          ? isLight ? "bg-slate-200 text-slate-800" : "bg-[#1e1e1e] text-white"
          : isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-[#1a1a1a] text-[#888] hover:text-white"
      }`
    : `p-1.5 rounded-lg transition-colors ${
        dropdownOpen
          ? isLight ? "bg-slate-200 text-slate-800" : "bg-[#1e1e1e] text-white"
          : isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-[#1a1a1a] text-[#888] hover:text-white"
      }`;

  return (
    <>
      <div ref={dropRef} className="relative">
        <button
          onClick={() => setDropdownOpen(p => !p)}
          className={btnClass}
          title="Tools & Settings"
        >
          <Settings className={iconSize} />
        </button>

        {dropdownOpen && (
          <div className={`absolute bottom-full mb-2 left-0 w-52 rounded-xl border shadow-2xl overflow-hidden z-[300] py-1 ${
            isLight ? "bg-white border-slate-200 shadow-slate-300/50" : "bg-[#1c1c1c] border-[#2e2e2e] shadow-black/60"
          }`}>
            {/* Section label */}
            <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#555]"}`}>
              Tools
            </div>

            {/* Theme toggle */}
            <button
              onClick={() => { toggleTheme(); setDropdownOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium transition-colors ${
                isLight ? "hover:bg-slate-50 text-slate-700" : "hover:bg-white/5 text-[#ccc]"
              }`}
            >
              {isLight
                ? <Moon className="w-3.5 h-3.5 text-[#1a73e8]" />
                : <Sun className="w-3.5 h-3.5 text-[#1a73e8]" />}
              {isLight ? "Dark Mode" : "Light Mode"}
            </button>

            <div className={`h-px mx-2 my-0.5 ${isLight ? "bg-slate-100" : "bg-[#2a2a2a]"}`} />

            {/* Headley's Invoice */}
            <button
              onClick={() => { setModal("headleys"); setDropdownOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium transition-colors ${
                isLight ? "hover:bg-slate-50 text-slate-700" : "hover:bg-white/5 text-[#ccc]"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#1a73e8]" />
              Headley's Invoice
            </button>

            <div className={`h-px mx-2 my-0.5 ${isLight ? "bg-slate-100" : "bg-[#2a2a2a]"}`} />

            {/* MetaData */}
            <button
              onClick={() => { setModal("metadata"); setDropdownOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium transition-colors ${
                isLight ? "hover:bg-slate-50 text-slate-700" : "hover:bg-white/5 text-[#ccc]"
              }`}
            >
              <Tag className="w-3.5 h-3.5 text-[#1a73e8]" />
              MetaData
            </button>

            <div className={`h-px mx-2 my-0.5 ${isLight ? "bg-slate-100" : "bg-[#2a2a2a]"}`} />

            {/* Settings & Data Sync */}
            <button
              onClick={() => { setCurrentPage("datasync"); setDropdownOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium transition-colors ${
                isLight ? "hover:bg-slate-50 text-slate-700" : "hover:bg-white/5 text-[#ccc]"
              }`}
            >
              <Database className="w-3.5 h-3.5 text-[#1a73e8]" />
              Settings & Data Sync
            </button>
          </div>
        )}
      </div>

      {/* ── Headley's Invoice Modal ─────────────────────────────────── */}
      {modal === "headleys" && (
        <div className="fixed inset-0 z-[500] bg-black/75 backdrop-blur-sm flex">
          <div className={`flex-1 flex flex-col overflow-hidden relative ${isLight ? "bg-slate-100" : "bg-[#0a0a0a]"}`}>
            {/* Close button */}
            <button
              onClick={() => setModal(null)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <HeadleysPage />
          </div>
        </div>
      )}

      {/* ── MetaData Modal ──────────────────────────────────────────── */}
      {modal === "metadata" && (
        <div className="fixed inset-0 z-[500] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl overflow-hidden border shadow-2xl ${
            isLight ? "bg-white border-slate-200" : "bg-[#121212] border-[#2a2a2a]"
          }`}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-[#1a73e8] text-white shrink-0">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                <span className="font-bold text-sm">MetaData</span>
              </div>
              <button
                onClick={() => setModal(null)}
                className="p-1 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Filters */}
            <div className={`flex items-center gap-3 px-5 py-3 border-b shrink-0 ${
              isLight ? "border-slate-200 bg-slate-50" : "border-[#1e1e1e] bg-[#0f0f0f]"
            }`}>
              <input
                type="text"
                placeholder="Search vendor…"
                value={metaSearch}
                onChange={e => setMetaSearch(e.target.value)}
                className={`text-xs px-3 py-1.5 rounded-lg border focus:outline-none flex-1 max-w-[240px] ${
                  isLight ? "bg-white border-slate-300 text-slate-700 placeholder-slate-400" : "bg-[#1e1e1e] border-[#333] text-white placeholder-[#555]"
                }`}
              />
              <div className="flex items-center gap-1">
                {(["all", "Ruby's", "TI", "MSDx"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setMetaFilter(f)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                      metaFilter === f
                        ? "bg-[#1a73e8] text-white"
                        : isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#1e1e1e] text-[#888] hover:bg-[#2a2a2a]"
                    }`}
                  >
                    {f === "all" ? "All" : f}
                  </button>
                ))}
              </div>
            </div>

            {/* Table body */}
            <div className="flex-1 overflow-y-auto">
              {vendorMetaList.length === 0 ? (
                <div className={`flex flex-col items-center justify-center py-16 ${isLight ? "text-slate-400" : "text-[#666]"}`}>
                  <Tag className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-semibold">No metadata found</p>
                  <p className="text-xs mt-1 opacity-60">Pull live data to load metadata from the Metadata sheet.</p>
                </div>
              ) : (() => {
                const filtered = vendorMetaList.filter(r => {
                  if (metaFilter !== "all" && r.entity !== metaFilter) return false;
                  if (metaSearch && !r.vendor.toLowerCase().includes(metaSearch.toLowerCase())) return false;
                  return true;
                });

                return (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className={`sticky top-0 font-bold ${
                        isLight ? "bg-slate-50 text-slate-600 border-b border-slate-200" : "bg-[#161616] text-[#888] border-b border-[#222]"
                      }`}>
                        <th className="px-4 py-2.5">Vendor</th>
                        <th className="px-4 py-2.5">Recurring</th>
                        <th className="px-4 py-2.5">Fixed / Estimate</th>
                        <th className="px-4 py-2.5">Payment</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLight ? "divide-slate-100" : "divide-[#1e1e1e]"}`}>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={4} className={`px-4 py-8 text-center text-xs ${isLight ? "text-slate-400" : "text-[#666]"}`}>
                            No vendors match your filter.
                          </td>
                        </tr>
                      ) : filtered.map((r, i) => {
                        const color = ENTITY_COLORS[r.entity] || "#546e7a";
                        return (
                          <tr key={i} className={`transition-colors ${isLight ? "hover:bg-slate-50" : "hover:bg-white/[0.03]"}`}>
                            <td className={`px-4 py-2.5 font-semibold ${isLight ? "text-slate-800" : "text-white"}`}>
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white shrink-0"
                                  style={{ backgroundColor: color }}
                                >
                                  {r.entity}
                                </span>
                                {r.vendor}
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              {r.recurringType ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.recurringType === "Recurring"
                                    ? "bg-blue-500/15 text-blue-500"
                                    : "bg-slate-500/15 text-slate-500"
                                }`}>
                                  {r.recurringType === "Recurring" ? "🔁 Recurring" : "⬜ Non-Recurring"}
                                </span>
                              ) : <span className={isLight ? "text-slate-300" : "text-[#444]"}>—</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              {r.costType ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.costType === "Fixed"
                                    ? "bg-emerald-500/15 text-emerald-600"
                                    : "bg-amber-500/15 text-amber-600"
                                }`}>
                                  {r.costType === "Fixed" ? "📌 Fixed" : "〜 Estimate"}
                                </span>
                              ) : <span className={isLight ? "text-slate-300" : "text-[#444]"}>—</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              {r.paymentType ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.paymentType === "Auto-Debit"
                                    ? "bg-purple-500/15 text-purple-600"
                                    : "bg-slate-500/15 text-slate-500"
                                }`}>
                                  {r.paymentType === "Auto-Debit" ? "⚡ Auto-Debit" : "✍️ Manual"}
                                </span>
                              ) : <span className={isLight ? "text-slate-300" : "text-[#444]"}>—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Footer */}
            <div className={`px-5 py-2 text-[11px] border-t shrink-0 ${
              isLight ? "border-slate-200 text-slate-400" : "border-[#1e1e1e] text-[#555]"
            }`}>
              {vendorMetaList.length} vendor{vendorMetaList.length !== 1 ? "s" : ""} with metadata
            </div>
          </div>
        </div>
      )}
    </>
  );
};
