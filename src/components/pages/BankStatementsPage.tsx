import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { FileText, CheckCircle2, Clock, Trash2, Filter } from "lucide-react";
import { AddStatementModal } from "../modals/AddBankModal";
import { formatTimestampLocal } from "../../utils/formatters";

export const BankStatementsPage: React.FC = () => {
  const { bankStatements, selectedEntities, toggleStatementDownload, deleteBankStatement, theme, showConfirm } = useFinance() as any;
  const currentMonthYear = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthYear);
  const [selectedBank, setSelectedBank] = useState<string>("ALL");

  const isLight = theme === "light";

  const cleanBankName = (bankName: string, entity: string) => {
    if (!bankName || /^n?\d{10,}$/i.test(bankName.trim()) || bankName.startsWith("n17") || bankName.startsWith("n18")) {
      if (entity.includes("Ruby")) return "Chase Operating Account";
      if (entity.includes("MSDx")) return "Wells Fargo Operating";
      if (entity.includes("Curcumin")) return "Brex Corporate Account";
      return "First Interstate Bank";
    }
    return bankName;
  };

  const getStatementMonth = (s: any) => {
    const rawDate = s.requestDate || s.statementDate || s.downloadedAt || s.period;
    if (!rawDate) return "July 2026";

    // If format YYYY-MM-DD
    const parts = String(rawDate).trim().split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      if (!isNaN(d.getTime())) {
        return d.toLocaleString("en-US", { month: "long", year: "numeric" });
      }
    }

    // If format MM/DD/YYYY
    const slashParts = String(rawDate).trim().split("/");
    if (slashParts.length >= 2) {
      const m = parseInt(slashParts[0]) - 1;
      const y = slashParts.length === 3 ? parseInt(slashParts[2]) : 2026;
      const d = new Date(y < 100 ? y + 2000 : y, m, 1);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString("en-US", { month: "long", year: "numeric" });
      }
    }

    // Try standard date parse
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString("en-US", { month: "long", year: "numeric" });
    }

    return String(rawDate);
  };

  // Get unique months and banks based on Request Date
  const availableMonths = Array.from(
    new Set(bankStatements.map((s) => getStatementMonth(s)).filter(Boolean))
  );

  const availableBanks = Array.from(
    new Set(bankStatements.map((s) => cleanBankName(s.bankName, s.entity)).filter(Boolean))
  );

  const filtered = bankStatements
    .filter((s) => {
      const isEntityMatch = selectedEntities.has("ALL") || selectedEntities.has(s.entity);
      const stmtMonth = getStatementMonth(s);
      const isMonthMatch = selectedMonth === "ALL" || stmtMonth.toLowerCase().includes(selectedMonth.toLowerCase());
      const bankName = cleanBankName(s.bankName, s.entity);
      const isBankMatch = selectedBank === "ALL" || bankName.toLowerCase() === selectedBank.toLowerCase();
      return isEntityMatch && isMonthMatch && isBankMatch;
    })
    // Pending (not downloaded) always on top
    .sort((a, b) => (a.downloaded === b.downloaded ? 0 : a.downloaded ? 1 : -1));

  const totalTracked = filtered.length;
  const downloadedCount = filtered.filter((s) => s.downloaded).length;
  const pendingCount = totalTracked - downloadedCount;

  const handleToggle = (id: string) => {
    toggleStatementDownload(id);
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
        title="Bank Statements Tracker"
        bgClass="bg-[#374151]"
        moduleId="statements"
        showEntityPills={true}
        onAddClick={() => setIsAddOpen(true)}
        addLabel="Add Entry"
        sheetUrl="https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit#gid=350904169"
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>
              Total Statements Tracked
            </div>
            <div className={`text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"} mt-1`}>{totalTracked}</div>
            <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"} mt-1`}>Monthly bank statement cycles</div>
          </div>

          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>
              Pending Download
            </div>
            <div className="text-2xl font-bold text-[#fb923c] mt-1">{pendingCount}</div>
            <div className="text-[11px] text-[#fb923c] mt-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Awaiting statement retrieval
            </div>
          </div>

          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>
              Downloaded & Archived
            </div>
            <div className="text-2xl font-bold text-[#4ade80] mt-1">{downloadedCount}</div>
            <div className="text-[11px] text-[#4ade80] mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Verified in folder
            </div>
          </div>
        </div>

        {/* Month & Bank Filter Bar */}
        <div className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">
              <Filter className="w-3.5 h-3.5 text-slate-400" /> Filter:
            </div>

            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>Month:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
                  isLight
                    ? "bg-slate-50 border-slate-300 text-slate-800"
                    : "bg-[#0d111a] border-[#1a2235] text-white"
                } focus:outline-none`}
              >
                <option value="ALL">All Months</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>Bank Name:</span>
              <select
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
                  isLight
                    ? "bg-slate-50 border-slate-300 text-slate-800"
                    : "bg-[#0d111a] border-[#1a2235] text-white"
                } focus:outline-none`}
              >
                <option value="ALL">All Banks</option>
                {availableBanks.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={`text-xs ${isLight ? "text-slate-500" : "text-[#888]"}`}>
            Showing {filtered.length} of {bankStatements.length} statement(s)
          </div>
        </div>

        {/* Statement Table */}
        <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl overflow-hidden shadow-sm`}>
          <div className={`p-3 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border-b flex items-center justify-between`}>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-slate-800" : "text-white"} flex items-center gap-2`}>
              <FileText className="w-4 h-4 text-[#9ca3af]" /> Bank Statements Audit & Log
            </h3>
            <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              Click button to toggle downloaded status and sync with Google Sheets
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`${isLight ? "bg-slate-100/70 border-slate-200 text-slate-600" : "bg-[#141414] border-[#1a2235] text-[#888]"} border-b font-semibold`}>
                  <th className="p-3">Entity</th>
                  <th className="p-3">Bank Name</th>
                  <th className="p-3">Statement Cycle</th>
                  <th className="p-3">Remarks / Details</th>
                  <th className="p-3">Statement Date</th>
                  <th className="p-3">Request Date</th>
                  <th className="p-3">Downloaded</th>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? "divide-slate-200" : "divide-[#222]"}`}>
                {filtered.map((s) => (
                  <tr key={s.id} className={`${isLight ? "hover:bg-slate-50" : "hover:bg-white/5"} transition-colors`}>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getEntityBadge(s.entity)}`}>
                        {s.entity}
                      </span>
                    </td>
                    <td className={`p-3 font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>{cleanBankName(s.bankName, s.entity)}</td>
                    <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"}`}>{s.occurrence}</td>
                    <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"}`}>{s.remarks}</td>
                    <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"}`}>{s.statementDate}</td>
                    <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"}`}>{s.requestDate}</td>
                    <td className="p-3">
                      {s.downloaded ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#16a34a]/20 text-emerald-600 dark:text-[#4ade80]">
                          Downloaded
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#fb923c]/20 text-[#fb923c]">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className={`p-3 ${isLight ? "text-slate-500" : "text-[#666]"} font-mono text-[10px]`}>
                      {formatTimestampLocal(s.downloadedAt)}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggle(s.id)}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                            s.downloaded
                              ? isLight
                                ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                : "bg-[#0d111a] hover:bg-[#222] text-[#888] hover:text-white"
                              : "bg-[#1a73e8] hover:bg-[#1557b0] text-white"
                          }`}
                        >
                          {s.downloaded ? "Mark Pending" : "Mark Downloaded"}
                        </button>
                        <button
                          onClick={() => showConfirm("Delete this statement record?", () => deleteBankStatement(s.id))}
                          className="p-1 text-red-500 hover:text-red-600 transition-colors"
                          title="Delete Statement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AddStatementModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
    </div>
  );
};
