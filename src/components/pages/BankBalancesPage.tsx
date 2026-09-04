import React, { useState, useEffect, useRef, useCallback } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { getBankBalanceWarning } from "../../utils/bankWarning";
import { Landmark, TrendingUp, TrendingDown, Edit2, BarChart3, Trash2, LayoutGrid, Table as TableIcon, AlertTriangle, Download, X } from "lucide-react";
import { exportBanksCSV } from "../../utils/exportUtils";
import { AddBankModal } from "../modals/AddBankModal";
import { Tooltip as AppTooltip } from "../Tooltip";
import { formatCurrency } from "../../utils/formatters";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";

/* ─── Edit Balance Popup Modal ────────────────────────────────────────────── */
interface EditBalanceModalProps {
  bank: { id: string; bank: string; entity: string; acct?: string; balance: number };
  isLight: boolean;
  onSave: (id: string, val: number) => void;
  onClose: () => void;
}
const EditBalanceModal: React.FC<EditBalanceModalProps> = ({ bank, isLight, onSave, onClose }) => {
  const [val, setVal] = useState(String(bank.balance));
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.select(); }, []);

  const bg   = isLight ? "bg-white border-slate-200"           : "bg-[#181c24] border-[#2a3140]";
  const txt  = isLight ? "text-slate-800"                      : "text-slate-100";
  const txt2 = isLight ? "text-slate-500"                      : "text-slate-400";
  const inp  = isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#0d111a] border-[#333] text-white";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 rounded-xl shadow-2xl border w-full max-w-sm p-6 ${bg}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`font-bold text-sm ${txt}`}>✏️ Edit Balance</h2>
          <button onClick={onClose} className={`w-7 h-7 flex items-center justify-center rounded text-lg ${txt2} hover:opacity-70`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`text-xs font-semibold mb-1 ${txt2}`}>{bank.entity} — {bank.bank}{bank.acct ? ` (${bank.acct})` : ""}</div>
        <div className={`text-[11px] mb-4 ${txt2}`}>
          Current: <span className={`font-bold ${txt}`}>{formatCurrency(bank.balance)}</span>
        </div>

        <label className={`block text-[11px] font-semibold mb-1.5 uppercase tracking-wider ${txt2}`}>New Balance ($)</label>
        <input
          ref={inputRef}
          type="number"
          step="0.01"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { const n = parseFloat(val); if (!isNaN(n)) onSave(bank.id, n); } if (e.key === "Escape") onClose(); }}
          className={`w-full px-3 py-2 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0891b2]/50 mb-5 ${inp}`}
          placeholder="0.00"
        />

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className={`text-xs px-4 py-2 rounded border ${isLight ? "border-slate-300 text-slate-600" : "border-[#333] text-slate-400"} hover:opacity-70`}>
            Cancel
          </button>
          <button
            onClick={() => { const n = parseFloat(val); if (!isNaN(n)) onSave(bank.id, n); }}
            className="text-xs px-5 py-2 rounded text-white font-semibold hover:opacity-90"
            style={{ background: "#0891b2" }}
          >
            ✓ Save Balance
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Main Page ───────────────────────────────────────────────────────────── */
export const BankBalancesPage: React.FC = () => {
  const {
    bankAccounts, selectedEntities, updateBankBalance, copyAllBalancesToYesterday,
    deleteBankAccount, theme, showConfirm, searchHighlightId, setSearchHighlightId
  } = useFinance() as any;

  const [editTarget, setEditTarget] = useState<{ id: string; bank: string; entity: string; acct?: string; balance: number } | null>(null);
  const [isAddOpen, setIsAddOpen]   = useState(false);
  const [viewMode, setViewMode]     = useState<"chart" | "table">("chart");
  const isLight = theme === "light";

  // Deep-link: scroll to & flash the item from global search
  useEffect(() => {
    if (!searchHighlightId) return;
    const timer = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-search-id="${searchHighlightId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("search-highlight-flash");
        const cleanup = () => { el.classList.remove("search-highlight-flash"); setSearchHighlightId(null); };
        el.addEventListener("animationend", cleanup, { once: true });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchHighlightId]);

  // 6pm PHT (UTC+8 = 10:00 UTC) auto-copy: fires once per day when the clock ticks to 18:00 PHT
  const copiedTodayRef = useRef<string>("");
  useEffect(() => {
    const checkEOD = () => {
      const now        = new Date();
      // Use the browser's local time — works for any timezone the user is in
      const localHour  = now.getHours();
      const localMin   = now.getMinutes();
      const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      const lastCopy = localStorage.getItem("bank_eod_copy_date") || "";
      if (localHour === 18 && localMin === 0 && lastCopy !== todayLocal) {
        localStorage.setItem("bank_eod_copy_date", todayLocal);
        copiedTodayRef.current = todayLocal;
        copyAllBalancesToYesterday?.();
      }
    };
    // Check immediately in case the page loaded right at 6pm
    checkEOD();
    const interval = setInterval(checkEOD, 30_000); // check every 30 seconds
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveBalance = useCallback((id: string, newVal: number) => {
    updateBankBalance(id, newVal);
    setEditTarget(null);
  }, [updateBankBalance]);

  const filtered = bankAccounts.filter(
    (b: any) => selectedEntities.has("ALL") || selectedEntities.has(b.entity)
  );

  const totalBalance = filtered.reduce((s: number, a: any) => s + a.balance, 0);

  // Prepare chart data
  const accountChartData = filtered.map((b: any) => ({
    name: b.accountName || b.bank,
    balance: b.balance,
    entity: b.entity,
    bank: b.bank,
    acct: b.acct,
    warning: getBankBalanceWarning(b.balance)
  }));

  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const warn = getBankBalanceWarning(data.balance);
      return (
        <div className={`p-3 rounded-xl border shadow-xl space-y-1.5 ${isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`}>
          <div className="font-extrabold text-xs">{data.name}</div>
          <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#999]"}`}>
            {data.entity} {data.bank ? `• ${data.bank}` : ""} {data.acct ? `(${data.acct})` : ""}
          </div>
          <div className="text-sm font-black text-[#0891b2]">{formatCurrency(data.balance)}</div>
          {warn ? (
            <div className={`mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black border ${warn.badgeClass}`}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{warn.label} Balance Warning (&lt;${data.balance < 500 ? "500" : "1,000"})</span>
            </div>
          ) : (
            <div className={`mt-1 text-[10px] font-bold ${isLight ? "text-emerald-600" : "text-emerald-400"} flex items-center gap-1`}>
              ✓ Healthy Cash Reserve (&gt;$1,000)
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Derive entity list dynamically from actual bank accounts (preserves sheet order)
  const allEntities: string[] = Array.from(
    bankAccounts.reduce((seen: Map<string, true>, a: any) => {
      if (a.entity && !seen.has(a.entity)) seen.set(a.entity, true);
      return seen;
    }, new Map<string, true>()).keys()
  );

  // Entity summary chart data — dynamic, not hard-coded
  const entityChartData = allEntities
    .filter((en) => selectedEntities.has("ALL") || selectedEntities.has(en))
    .map((en) => ({
      entity: en,
      total: filtered.filter((a: any) => a.entity === en).reduce((s: number, a: any) => s + a.balance, 0)
    }));

  const getEntityColor = (entity: string) => {
    if (entity.includes("Ruby")) return "#d81b60";
    if (entity.includes("MSDx")) return "#00897b";
    if (entity.includes("Curcumin")) return "#6d4c41";
    return "#1a73e8";
  };

  const getEntityBadge = (entity: string) => {
    if (entity.includes("Ruby")) return "bg-[#d81b60]/20 text-[#e91e63]";
    if (entity.includes("MSDx")) return "bg-[#00897b]/20 text-[#00897b]";
    if (entity.includes("Curcumin")) return "bg-[#6d4c41]/20 text-[#8d6e63]";
    return "bg-[#1a73e8]/20 text-[#1a73e8]";
  };

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader
        title="Bank Balances"
        bgClass="bg-[#0891b2]"
        moduleId="banks"
        showEntityPills={true}
        extraButtons={
          <button onClick={() => exportBanksCSV(bankAccounts)} className="btn-3d btn-3d-ghost font-semibold" title="Export to CSV">
            <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">CSV</span>
          </button>
        }
        onAddClick={() => setIsAddOpen(true)}
        addLabel="Add Bank Account"
        sheetUrl="https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit#gid=573058575"
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>
              Total Cash Position
            </div>
            <div className={`text-2xl font-extrabold ${isLight ? "text-slate-900" : "text-white"} mt-1`}>
              {formatCurrency(totalBalance)}
            </div>
            <div className="text-[11px] text-[#4ade80] mt-1 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> All active accounts
            </div>
          </div>

          {allEntities.slice(0, 3).map((en) => {
            const eTotal = filtered.filter((a: any) => a.entity === en).reduce((s: number, a: any) => s + a.balance, 0);
            return (
              <div key={en} className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
                <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>{en} Total</div>
                <div className={`text-xl font-bold ${isLight ? "text-slate-900" : "text-white"} mt-1`}>{formatCurrency(eTotal)}</div>
                <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"} mt-1`}>{en} Cash Accounts</div>
              </div>
            );
          })}
        </div>

        {/* View Toggle Bar */}
        <div className={`flex items-center justify-between p-2 rounded-xl border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
          <div className={`text-xs font-bold px-2 ${isLight ? "text-slate-600" : "text-gray-300"}`}>Bank Accounts View Mode</div>
          <div className={`flex items-center gap-1 ${isLight ? "bg-slate-100" : "bg-[#0d111a]"} p-1 rounded-lg`}>
            {(["chart", "table"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`flex items-center gap-1 px-3.5 py-1.5 rounded text-xs font-semibold transition-colors ${
                  viewMode === m
                    ? isLight
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                      : "bg-[#262626] text-white shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] border border-[#333]"
                    : isLight ? "text-slate-500 hover:text-slate-900" : "text-[#888] hover:text-white"
                }`}
              >
                {m === "chart" ? <><BarChart3 className="w-3.5 h-3.5" /> Chart View</> : <><TableIcon className="w-3.5 h-3.5" /> Table View</>}
              </button>
            ))}
          </div>
        </div>

        {/* Chart View */}
        {viewMode === "chart" && (
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-sm`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-slate-900" : "text-white"} flex items-center gap-2`}>
                <BarChart3 className="w-4 h-4 text-[#0891b2]" /> Bank Account Balances Visual
              </h3>
              <span className={`text-[10px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>Individual Cash Accounts ($)</span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={accountChartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "#e2e8f0" : "#222"} />
                  <XAxis dataKey="name" stroke={isLight ? "#64748b" : "#888"} fontSize={10} tickLine={false} interval={0} angle={-15} textAnchor="end" />
                  <YAxis stroke={isLight ? "#64748b" : "#888"} fontSize={10} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar dataKey="balance" radius={[4, 4, 0, 0]}>
                    {accountChartData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={getEntityColor(entry.entity)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Table View */}
        {viewMode === "table" && (
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl overflow-hidden shadow-sm`}>
            <div className={`p-3 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border-b flex items-center justify-between`}>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-slate-800" : "text-white"} flex items-center gap-2`}>
                <Landmark className="w-4 h-4 text-[#0891b2]" /> Managed Cash & Deposit Accounts
              </h3>
              <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                EOD copy: auto at 6pm PH Time
              </span>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse min-w-[600px]">
                <thead>
                  <tr className={`${isLight ? "bg-slate-100/70 border-slate-200 text-slate-600" : "bg-[#141414] border-[#1a2235] text-[#888]"} border-b font-semibold`}>
                    <th className="p-3 w-16 whitespace-nowrap">Entity</th>
                    <th className="p-3 min-w-[100px] whitespace-nowrap">Bank Name</th>
                    <th className="p-3 w-24 whitespace-nowrap">Account Type</th>
                    <th className="p-3 min-w-[80px] whitespace-nowrap">Account #</th>
                    <th className="p-3 w-32 whitespace-nowrap">Current Balance</th>
                    <th className="p-3 hidden md:table-cell whitespace-nowrap">Yesterday</th>
                    <th className="p-3 hidden sm:table-cell whitespace-nowrap">As Of</th>
                    <th className="p-3 hidden md:table-cell whitespace-nowrap">Trend</th>
                    <th className="p-3 w-20 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? "divide-slate-200" : "divide-[#222]"}`}>
                  {filtered.map((b: any) => {
                    const yestVal = b.yesterday !== undefined ? b.yesterday : Math.round(b.balance * 0.98);
                    const diff = b.balance - yestVal;

                    return (
                      <tr key={b.id} data-search-id={b.id} className={`${isLight ? "hover:bg-slate-50" : "hover:bg-white/5"} transition-colors`}>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getEntityBadge(b.entity)}`}>{b.entity}</span>
                        </td>
                        <td className={`p-3 font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>{b.bank}</td>
                        <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"}`}>{b.type}</td>
                        <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"} font-mono`}>{b.acct}</td>
                        <td className="p-3">
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-extrabold whitespace-nowrap ${isLight ? "text-slate-900" : "text-white"} text-sm`}>
                              {formatCurrency(b.balance)}
                            </span>
                            {(() => {
                              const warn = getBankBalanceWarning(b.balance);
                              if (!warn) return null;
                              return (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-extrabold border ${warn.badgeClass} w-max`}>
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  {warn.label}
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        <td className={`p-3 font-medium hidden md:table-cell ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>
                          {formatCurrency(yestVal)}
                        </td>
                        <td className={`p-3 hidden sm:table-cell ${isLight ? "text-slate-500" : "text-[#888]"}`}>{b.asOf}</td>
                        <td className="p-3 hidden md:table-cell">
                          {diff >= 0 ? (
                            <span className={`${isLight ? "text-emerald-600" : "text-[#4ade80]"} flex items-center gap-1 font-semibold`}>
                              <TrendingUp className="w-3.5 h-3.5" /> +{formatCurrency(diff)}
                            </span>
                          ) : (
                            <span className={`${isLight ? "text-red-500" : "text-[#f87171]"} flex items-center gap-1 font-semibold`}>
                              <TrendingDown className="w-3.5 h-3.5" /> {formatCurrency(diff)}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <AppTooltip label="Edit Balance">
                              <button
                                onClick={() => setEditTarget({ id: b.id, bank: b.bank, entity: b.entity, acct: b.acct, balance: b.balance })}
                                className={`p-1.5 rounded hover:bg-blue-500/10 ${isLight ? "text-blue-600" : "text-blue-400"} transition-colors`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </AppTooltip>
                            <AppTooltip label="Delete Bank Account">
                              <button
                                onClick={() => showConfirm("Delete this bank account?", () => deleteBankAccount(b.id))}
                                className="p-2 text-red-500 hover:text-red-600 transition-colors touch-manipulation"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </AppTooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AddBankModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />

      {editTarget && (
        <EditBalanceModal
          bank={editTarget}
          isLight={isLight}
          onSave={handleSaveBalance}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
};
