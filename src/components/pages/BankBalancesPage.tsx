import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { getBankBalanceWarning } from "../../utils/bankWarning";
import { Landmark, TrendingUp, TrendingDown, Edit2, BarChart3, Trash2, LayoutGrid, Table as TableIcon, AlertTriangle } from "lucide-react";
import { AddBankModal } from "../modals/AddBankModal";
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

export const BankBalancesPage: React.FC = () => {
  const { bankAccounts, selectedEntities, updateBankBalance, deleteBankAccount, theme, showConfirm } = useFinance() as any;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newVal, setNewVal] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");

  const isLight = theme === "light";

  const filtered = bankAccounts.filter(
    (b) => selectedEntities.has("ALL") || selectedEntities.has(b.entity)
  );

  const totalBalance = filtered.reduce((s, a) => s + a.balance, 0);

  const handleSaveBalance = (id: string) => {
    if (!newVal) return;
    updateBankBalance(id, parseFloat(newVal));
    setEditingId(null);
    setNewVal("");
  };

  // Prepare chart data for each bank account
  const accountChartData = filtered.map((b) => ({
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
          <div className="text-sm font-black text-[#0891b2]">
            {formatCurrency(data.balance)}
          </div>
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

  // Prepare entity summary chart data
  const entityChartData = ["Ruby's", "TI", "MSDx"]
    .filter((en) => selectedEntities.has("ALL") || selectedEntities.has(en))
    .map((en) => ({
      entity: en,
      total: filtered.filter((a) => a.entity === en).reduce((s, a) => s + a.balance, 0)
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
        onAddClick={() => setIsAddOpen(true)}
        addLabel="Add Bank Account"
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

          {["Ruby's", "TI", "MSDx"].map((en) => {
            const eTotal = filtered
              .filter((a) => a.entity === en)
              .reduce((s, a) => s + a.balance, 0);

            return (
              <div key={en} className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
                <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>
                  {en} Total
                </div>
                <div className={`text-xl font-bold ${isLight ? "text-slate-900" : "text-white"} mt-1`}>
                  {formatCurrency(eTotal)}
                </div>
                <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"} mt-1`}>{en} Cash Accounts</div>
              </div>
            );
          })}
        </div>

        {/* View Toggle Bar */}
        <div className={`flex items-center justify-between p-2 rounded-xl border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
          <div className="text-xs font-bold px-2 text-slate-600 dark:text-gray-300">
            Bank Accounts View Mode
          </div>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#0d111a] p-1 rounded-lg">
            <button
              onClick={() => setViewMode("chart")}
              className={`flex items-center gap-1 px-3.5 py-1.5 rounded text-xs font-semibold transition-colors ${
                viewMode === "chart"
                  ? "bg-white dark:bg-[#262626] text-slate-900 dark:text-white shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] border border-slate-200 dark:border-[#333]"
                  : "text-slate-500 hover:text-slate-900 dark:text-[#888] dark:hover:text-white"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Chart View
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1 px-3.5 py-1.5 rounded text-xs font-semibold transition-colors ${
                viewMode === "table"
                  ? "bg-white dark:bg-[#262626] text-slate-900 dark:text-white shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] border border-slate-200 dark:border-[#333]"
                  : "text-slate-500 hover:text-slate-900 dark:text-[#888] dark:hover:text-white"
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" /> Table View
            </button>
          </div>
        </div>

        {/* Visual Bar Graph Section - Single Full Width Chart */}
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
                  <XAxis
                    dataKey="name"
                    stroke={isLight ? "#64748b" : "#888"}
                    fontSize={10}
                    tickLine={false}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis
                    stroke={isLight ? "#64748b" : "#888"}
                    fontSize={10}
                    tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar dataKey="balance" radius={[4, 4, 0, 0]}>
                    {accountChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getEntityColor(entry.entity)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Bank Table */}
        {viewMode === "table" && (
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl overflow-hidden shadow-sm`}>
            <div className={`p-3 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border-b flex items-center justify-between`}>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-slate-800" : "text-white"} flex items-center gap-2`}>
                <Landmark className="w-4 h-4 text-[#0891b2]" /> Managed Cash & Deposit Accounts
              </h3>
              <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>Updated in real-time</span>
            </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`${isLight ? "bg-slate-100/70 border-slate-200 text-slate-600" : "bg-[#141414] border-[#1a2235] text-[#888]"} border-b font-semibold`}>
                  <th className="p-3">Entity</th>
                  <th className="p-3">Bank Name</th>
                  <th className="p-3">Account Type</th>
                  <th className="p-3">Account #</th>
                  <th className="p-3">Current Balance</th>
                  <th className="p-3">Yesterday's Balance</th>
                  <th className="p-3">As Of Date</th>
                  <th className="p-3">Trend</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? "divide-slate-200" : "divide-[#222]"}`}>
                {filtered.map((b) => {
                  const yestVal = b.yesterday !== undefined ? b.yesterday : Math.round(b.balance * 0.98);
                  const diff = b.balance - yestVal;

                  return (
                    <tr key={b.id} className={`${isLight ? "hover:bg-slate-50" : "hover:bg-white/5"} transition-colors`}>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getEntityBadge(b.entity)}`}>
                          {b.entity}
                        </span>
                      </td>
                      <td className={`p-3 font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>{b.bank}</td>
                      <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"}`}>{b.type}</td>
                      <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"} font-mono`}>{b.acct}</td>
                      <td className="p-3">
                        {editingId === b.id ? (
                          <input
                            type="number"
                            step="0.01"
                            defaultValue={b.balance}
                            onChange={(e) => setNewVal(e.target.value)}
                            className={`border border-[#1a73e8] rounded px-2 py-0.5 text-xs w-28 ${isLight ? "bg-white text-slate-900" : "bg-[#0d111a] text-white"}`}
                          />
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-extrabold ${isLight ? "text-slate-900" : "text-white"} text-sm`}>
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
                        )}
                      </td>
                      <td className={`p-3 font-medium ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>
                        {formatCurrency(yestVal)}
                      </td>
                      <td className={`p-3 ${isLight ? "text-slate-500" : "text-[#888]"}`}>{b.asOf}</td>
                      <td className="p-3">
                        {diff >= 0 ? (
                          <span className="text-emerald-600 dark:text-[#4ade80] flex items-center gap-1 font-semibold">
                            <TrendingUp className="w-3.5 h-3.5" /> +{formatCurrency(diff)}
                          </span>
                        ) : (
                          <span className="text-red-500 dark:text-[#f87171] flex items-center gap-1 font-semibold">
                            <TrendingDown className="w-3.5 h-3.5" /> {formatCurrency(diff)}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          {editingId === b.id ? (
                            <button
                              onClick={() => handleSaveBalance(b.id)}
                              className="px-2.5 py-1 rounded bg-[#16a34a] hover:bg-[#15803d] text-[11px] font-bold text-white"
                            >
                              Save
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingId(b.id);
                                setNewVal(String(b.balance));
                              }}
                              className="p-1.5 rounded hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => showConfirm("Delete this bank account?", () => deleteBankAccount(b.id))}
                            className="p-1 text-red-500 hover:text-red-600 transition-colors"
                            title="Delete Bank Account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
    </div>
  );
};
