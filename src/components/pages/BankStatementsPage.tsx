import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { FileText, CheckCircle2, Clock, Trash2, Filter, Edit2, Zap, X } from "lucide-react";
import { AddStatementModal, EditStatementModal } from "../modals/AddBankModal";
import { formatTimestampLocal } from "../../utils/formatters";

/* ── Hardcoded fallback bank list (used only when sheet columns N–T are empty) */
const FALLBACK_BANKS = [
  { entity: "MSDx",   bank: "ONB 2448",              cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "MSDx",   bank: "Seacoast 9601",          cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "TI",     bank: "ONB 0539",               cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "TI",     bank: "ONB 9304",               cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "E1",     bank: "ONB 1716",               cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "4G",     bank: "ONB 8782",               cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "4G",     bank: "Chase 5074",             cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "4G",     bank: "Citi 4024",              cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "4G",     bank: "Citi 1395 / 0228",       cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "4G",     bank: "AMEX 8008 / 5004/6002",  cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "4G",     bank: "AMEX 3002 / 2004",       cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "4G",     bank: "Citi 4418 / 3678",       cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "Ruby's", bank: "Zion's Bank",            cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "Ruby's", bank: "WF Credit Card",         cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "4YR",    bank: "Citi Costco x8237",      cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "4YR",    bank: "Chase x8676",            cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "4YR",    bank: "TriCounty 232",          cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "4YR",    bank: "ONB 4347",               cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
  { entity: "4G",     bank: "Chase 4011",             cycle: "Monthly", remarks: "", statementDate: "", requestDate: "", downloaded: false },
];

/* ── Generate Monthly Entries Modal ────────────────────────────────────────── */
const GenerateMonthlyModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { addBankStatement, theme, statementTemplates } = useFinance() as any;
  const isLight = theme === "light";

  // Use live sheet data (columns N–T) if available; fall back to hardcoded list
  const BANK_LIST: Array<{ entity: string; bank: string; cycle: string; remarks: string; statementDate: string; requestDate: string; downloaded: boolean }> =
    (statementTemplates && statementTemplates.length > 0) ? statementTemplates : FALLBACK_BANKS;

  // Default target: previous month (statements are requested for the prior month)
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultYear  = prevMonth.getFullYear();
  const defaultMonth = prevMonth.getMonth(); // 0-based

  const [selYear,  setSelYear]  = useState(defaultYear);
  const [selMonth, setSelMonth] = useState(defaultMonth);
  const [requestDate, setRequestDate] = useState(now.toISOString().split("T")[0]);
  const [checked, setChecked]   = useState<boolean[]>(BANK_LIST.map(() => true));
  const [remarks, setRemarks]   = useState<string[]>(BANK_LIST.map(b => b.remarks || ""));
  const [saving,  setSaving]    = useState(false);

  if (!isOpen) return null;

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const years  = [now.getFullYear() - 1, now.getFullYear()];

  // Last day of selected month
  const lastDay = new Date(selYear, selMonth + 1, 0).getDate();
  const periodStart = `${selYear}-${String(selMonth + 1).padStart(2,"0")}-01`;
  const periodEnd   = `${selYear}-${String(selMonth + 1).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
  const periodLabel = `${MONTHS[selMonth]} ${selYear}`;
  const defaultRemark = `For reconciliations - ${periodLabel}`;

  const toggleAll = (val: boolean) => setChecked(BANK_LIST.map(() => val));
  const selectedCount = checked.filter(Boolean).length;

  const handleGenerate = async () => {
    setSaving(true);
    for (let i = 0; i < BANK_LIST.length; i++) {
      if (!checked[i]) continue;
      const entry = BANK_LIST[i];
      // Use sheet's pre-filled statement date if available, otherwise build from period
      const sheetStmtDate = entry.statementDate && entry.statementDate.trim()
        ? entry.statementDate.trim()
        : `${periodStart}|${periodEnd}`;
      addBankStatement({
        entity:        entry.entity,
        bankName:      entry.bank,
        occurrence:    entry.cycle,
        statementDate: sheetStmtDate,
        requestDate:   remarks[i] !== "" ? requestDate : (entry.requestDate || requestDate),
        period:        `${selYear}-${String(selMonth + 1).padStart(2,"0")}`,
        downloaded:    false,
        remarks:       remarks[i] || entry.remarks || defaultRemark,
      });
      // small delay to avoid hammering sheet API
      await new Promise(r => setTimeout(r, 80));
    }
    setSaving(false);
    onClose();
  };

  const getEntityBadge = (entity: string) => {
    if (entity.includes("Ruby")) return "bg-[#d81b60]/20 text-[#e91e63]";
    if (entity.includes("MSDx")) return "bg-[#00897b]/20 text-[#00897b]";
    if (entity === "4YR") return "bg-purple-500/20 text-purple-400";
    if (entity === "E1")  return "bg-orange-500/20 text-orange-400";
    return "bg-[#1a73e8]/20 text-[#1a73e8]";
  };

  const isLiveData = statementTemplates && statementTemplates.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#1a73e8]" />
            <h2 className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>Generate Monthly Statement Entries</h2>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${isLiveData ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
              {isLiveData ? "Live from Sheet" : "Fallback List"}
            </span>
          </div>
          <button onClick={onClose} className={`p-1 rounded ${isLight ? "hover:bg-slate-100" : "hover:bg-white/10"}`}><X className="w-4 h-4" /></button>
        </div>

        {/* Global controls */}
        <div className={`p-4 border-b ${isLight ? "border-slate-200 bg-slate-50" : "border-[#1a2235] bg-[#070b12]"} flex flex-wrap gap-4 items-end`}>
          <div>
            <label className={`block text-[11px] font-semibold mb-1 ${isLight ? "text-slate-600" : "text-[#888]"}`}>Statement Month</label>
            <div className="flex gap-2">
              <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))}
                className={`px-2 py-1.5 rounded-lg text-xs border ${isLight ? "bg-white border-slate-300 text-slate-800" : "bg-[#0d111a] border-[#1a2235] text-white"} focus:outline-none`}>
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}
                className={`px-2 py-1.5 rounded-lg text-xs border ${isLight ? "bg-white border-slate-300 text-slate-800" : "bg-[#0d111a] border-[#1a2235] text-white"} focus:outline-none`}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={`block text-[11px] font-semibold mb-1 ${isLight ? "text-slate-600" : "text-[#888]"}`}>Request Date</label>
            <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)}
              className={`px-2 py-1.5 rounded-lg text-xs border ${isLight ? "bg-white border-slate-300 text-slate-800" : "bg-[#0d111a] border-[#1a2235] text-white"} focus:outline-none`} />
          </div>
          <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>
            Period: <span className={`font-semibold ${isLight ? "text-slate-800" : "text-white"}`}>{periodStart} → {periodEnd}</span>
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => toggleAll(true)}  className="text-[11px] text-[#1a73e8] hover:underline">Select All</button>
            <button onClick={() => toggleAll(false)} className="text-[11px] text-[#888] hover:underline">None</button>
          </div>
        </div>

        {/* Bank list */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={`${isLight ? "bg-slate-100 text-slate-600" : "bg-[#141414] text-[#888]"} text-[11px] font-semibold`}>
                <th className="p-2 text-center w-8">✓</th>
                <th className="p-2 text-left">Entity</th>
                <th className="p-2 text-left">Bank Name</th>
                <th className="p-2 text-left">Cycle</th>
                {isLiveData && <th className="p-2 text-left">Stmt Date (Sheet)</th>}
                <th className="p-2 text-left">Remarks (editable)</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? "divide-slate-100" : "divide-[#1a2235]"}`}>
              {BANK_LIST.map((b, i) => (
                <tr key={i} className={`${!checked[i] ? "opacity-40" : ""} transition-opacity ${isLight ? "hover:bg-slate-50" : "hover:bg-white/5"}`}>
                  <td className="p-2 text-center">
                    <input type="checkbox" checked={checked[i]} onChange={e => setChecked(c => c.map((v,j) => j===i ? e.target.checked : v))} className="accent-[#1a73e8]" />
                  </td>
                  <td className="p-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getEntityBadge(b.entity)}`}>{b.entity}</span>
                  </td>
                  <td className={`p-2 font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>{b.bank}</td>
                  <td className={`p-2 ${isLight ? "text-slate-500" : "text-[#888]"}`}>{b.cycle}</td>
                  {isLiveData && (
                    <td className={`p-2 text-[10px] ${b.statementDate ? (isLight ? "text-slate-700" : "text-[#aaa]") : (isLight ? "text-slate-400" : "text-[#555]")}`}>
                      {b.statementDate || <span className="italic">auto</span>}
                    </td>
                  )}
                  <td className="p-2">
                    <input
                      type="text"
                      value={remarks[i]}
                      placeholder={b.remarks || defaultRemark}
                      onChange={e => setRemarks(r => r.map((v,j) => j===i ? e.target.value : v))}
                      disabled={!checked[i]}
                      className={`w-full px-2 py-1 rounded text-[11px] border ${isLight ? "bg-white border-slate-200 text-slate-800 placeholder-slate-400" : "bg-[#070b12] border-[#1a2235] text-white placeholder-[#555]"} focus:outline-none focus:border-[#1a73e8]`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${isLight ? "border-slate-200" : "border-[#1a2235]"} flex items-center justify-between`}>
          <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>{selectedCount} of {BANK_LIST.length} banks selected</span>
          <div className="flex gap-2">
            <button onClick={onClose} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${isLight ? "border-slate-300 text-slate-700 hover:bg-slate-50" : "border-[#1a2235] text-[#888] hover:bg-white/5"}`}>Cancel</button>
            <button
              onClick={handleGenerate}
              disabled={saving || selectedCount === 0}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#1a73e8] hover:bg-[#1557b0] text-white disabled:opacity-50 flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              {saving ? "Generating..." : `Generate ${selectedCount} Entries`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const BankStatementsPage: React.FC = () => {
  const { bankStatements, selectedEntities, toggleStatementDownload, deleteBankStatement, theme, showConfirm } = useFinance() as any;
  const currentMonthYear = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [editingStatement, setEditingStatement] = useState<any | null>(null);
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
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${isLight ? "text-slate-600" : "text-gray-300"}`}>
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

          <div className="flex items-center gap-3">
            <div className={`text-xs ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              Showing {filtered.length} of {bankStatements.length} statement(s)
            </div>
            <button
              onClick={() => setIsGenerateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a73e8] hover:bg-[#1557b0] text-white transition-colors"
            >
              <Zap className="w-3.5 h-3.5" /> Generate Monthly
            </button>
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

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse min-w-[600px]">
              <thead>
                <tr className={`${isLight ? "bg-slate-100/70 border-slate-200 text-slate-600" : "bg-[#141414] border-[#1a2235] text-[#888]"} border-b font-semibold`}>
                  <th className="p-3 whitespace-nowrap">Entity</th>
                  <th className="p-3 whitespace-nowrap">Bank Name</th>
                  <th className="p-3 whitespace-nowrap">Statement Cycle</th>
                  <th className="p-3 whitespace-nowrap hidden sm:table-cell">Remarks / Details</th>
                  <th className="p-3 whitespace-nowrap">Statement Date</th>
                  <th className="p-3 whitespace-nowrap">Request Date</th>
                  <th className="p-3 whitespace-nowrap">Downloaded</th>
                  <th className="p-3 whitespace-nowrap hidden sm:table-cell">Timestamp</th>
                  <th className="p-3 whitespace-nowrap">Actions</th>
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
                    <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"} hidden sm:table-cell`}>{s.remarks}</td>
                    <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"}`}>{s.statementDate}</td>
                    <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"}`}>{s.requestDate}</td>
                    <td className="p-3">
                      {s.downloaded ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold bg-[#16a34a]/20 ${isLight ? "text-emerald-600" : "text-[#4ade80]"}`}>
                          Downloaded
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#fb923c]/20 text-[#fb923c]">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className={`p-3 ${isLight ? "text-slate-500" : "text-[#666]"} font-mono text-[10px] hidden sm:table-cell`}>
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
                          onClick={() => setEditingStatement(s)}
                          className={`p-1 ${isLight ? "text-blue-600 hover:text-blue-800" : "text-blue-400 hover:text-blue-300"} transition-colors`}
                          title="Edit Statement"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
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
      <GenerateMonthlyModal isOpen={isGenerateOpen} onClose={() => setIsGenerateOpen(false)} />
      <EditStatementModal
        statement={editingStatement}
        isOpen={!!editingStatement}
        onClose={() => setEditingStatement(null)}
      />
    </div>
  );
};
