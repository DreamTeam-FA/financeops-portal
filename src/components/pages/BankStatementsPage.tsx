import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import {
  FileText, CheckCircle2, Clock, Trash2, Filter, Edit2, Zap, X, ChevronDown, ChevronRight,
} from "lucide-react";
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

/** Format a raw statementDate value (may be "YYYY-MM-DD|YYYY-MM-DD" pipe range, ISO, or plain text). */
function formatStmtDate(raw: string): string {
  if (!raw) return "—";
  if (raw.includes("|")) {
    const [start, end] = raw.split("|");
    const fmt = (iso: string) => {
      const d = new Date(iso + "T00:00:00");
      return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };
    return `${fmt(start)} – ${fmt(end)}`;
  }
  const d = new Date(raw + (raw.includes("T") ? "" : "T00:00:00"));
  return isNaN(d.getTime()) ? raw : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Format a cut-off date for display */
function formatCutOffDate(raw: string): string {
  if (!raw) return "—";
  const d = new Date(raw.includes("T") ? raw : raw + "T00:00:00");
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return raw;
}

/* ── Generate Monthly Entries Modal ────────────────────────────────────────── */
const GenerateMonthlyModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { addBankStatementsBatch, theme, statementTemplates } = useFinance() as any;
  const isLight = theme === "light";

  const BANK_LIST: Array<{ entity: string; bank: string; cycle: string; remarks: string; statementDate: string; requestDate: string; downloaded: boolean }> =
    (statementTemplates && statementTemplates.length > 0) ? statementTemplates : FALLBACK_BANKS;

  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultYear  = prevMonth.getFullYear();
  const defaultMonth = prevMonth.getMonth();

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const years  = [now.getFullYear() - 1, now.getFullYear()];

  const buildPeriodDates = (y: number, m: number) => {
    const lastDay = new Date(y, m + 1, 0).getDate();
    const mm = String(m + 1).padStart(2, "0");
    return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
  };

  const parseSheetDate = (raw: string, y: number, m: number) => {
    if (raw && raw.includes("|")) {
      const [s, e] = raw.split("|");
      if (s.trim() && e.trim()) return { start: s.trim(), end: e.trim() };
    }
    return buildPeriodDates(y, m);
  };

  const [selYear,     setSelYear]     = useState(defaultYear);
  const [selMonth,    setSelMonth]    = useState(defaultMonth);
  const [requestDate, setRequestDate] = useState(now.toISOString().split("T")[0]);
  const [checked,     setChecked]     = useState<boolean[]>(BANK_LIST.map(() => true));
  const [remarks,     setRemarks]     = useState<string[]>(BANK_LIST.map(b => b.remarks || ""));
  const [stmtDates,   setStmtDates]   = useState<Array<{ start: string; end: string }>>(
    () => BANK_LIST.map(b => parseSheetDate(b.statementDate, defaultYear, defaultMonth))
  );
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const periodLabel   = `${MONTHS[selMonth]} ${selYear}`;
  const defaultRemark = `For reconciliations - ${periodLabel}`;

  const handlePeriodChange = (newYear: number, newMonth: number) => {
    setSelYear(newYear);
    setSelMonth(newMonth);
    setStmtDates(prev => prev.map((d, i) => {
      if (BANK_LIST[i].statementDate) return d;
      return buildPeriodDates(newYear, newMonth);
    }));
  };

  const updateStmtDate = (i: number, field: "start" | "end", val: string) =>
    setStmtDates(prev => prev.map((d, j) => j === i ? { ...d, [field]: val } : d));

  const toggleAll = (val: boolean) => setChecked(BANK_LIST.map(() => val));
  const selectedCount = checked.filter(Boolean).length;

  const handleGenerate = () => {
    setSaving(true);
    const batch = BANK_LIST
      .map((entry, i) => {
        if (!checked[i]) return null;
        const { start, end } = stmtDates[i];
        return {
          entity:        entry.entity,
          bankName:      entry.bank,
          occurrence:    entry.cycle,
          statementDate: start && end ? `${start}|${end}` : "",
          requestDate:   entry.requestDate || requestDate,
          period:        `${selYear}-${String(selMonth + 1).padStart(2,"0")}`,
          downloaded:    false,
          remarks:       remarks[i] || entry.remarks || "",
        };
      })
      .filter(Boolean) as Array<Omit<import("../../types").BankStatement, "id">>;

    addBankStatementsBatch(batch);
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
      <div className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
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
              <select value={selMonth} onChange={e => handlePeriodChange(selYear, Number(e.target.value))}
                className={`px-2 py-1.5 rounded-lg text-xs border ${isLight ? "bg-white border-slate-300 text-slate-800" : "bg-[#0d111a] border-[#1a2235] text-white"} focus:outline-none`}>
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={selYear} onChange={e => handlePeriodChange(Number(e.target.value), selMonth)}
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
            Period: <span className={`font-semibold ${isLight ? "text-slate-800" : "text-white"}`}>{periodLabel}</span>
            <span className={`ml-1 ${isLight ? "text-slate-400" : "text-[#555]"}`}>(dates auto-fill per row, editable below)</span>
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
                <th className="p-2 text-left">Stmt Start</th>
                <th className="p-2 text-left">Stmt End</th>
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
                  <td className="p-1.5">
                    <input type="date" value={stmtDates[i]?.start || ""} onChange={e => updateStmtDate(i, "start", e.target.value)} disabled={!checked[i]}
                      className={`w-[120px] px-1.5 py-1 rounded text-[11px] border ${isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#070b12] border-[#1a2235] text-white"} focus:outline-none focus:border-[#1a73e8]`} />
                  </td>
                  <td className="p-1.5">
                    <input type="date" value={stmtDates[i]?.end || ""} onChange={e => updateStmtDate(i, "end", e.target.value)} disabled={!checked[i]}
                      className={`w-[120px] px-1.5 py-1 rounded text-[11px] border ${isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#070b12] border-[#1a2235] text-white"} focus:outline-none focus:border-[#1a73e8]`} />
                  </td>
                  <td className="p-2">
                    <input type="text" value={remarks[i]} placeholder={b.remarks || defaultRemark}
                      onChange={e => setRemarks(r => r.map((v,j) => j===i ? e.target.value : v))} disabled={!checked[i]}
                      className={`w-full px-2 py-1 rounded text-[11px] border ${isLight ? "bg-white border-slate-200 text-slate-800 placeholder-slate-400" : "bg-[#070b12] border-[#1a2235] text-white placeholder-[#555]"} focus:outline-none focus:border-[#1a73e8]`} />
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
            <button onClick={handleGenerate} disabled={saving || selectedCount === 0}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#1a73e8] hover:bg-[#1557b0] text-white disabled:opacity-50 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              {saving ? "Generating..." : `Generate ${selectedCount} Entries`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Statement Table ─────────────────────────────────────────────────────────── */
interface TableProps {
  entries: any[];
  isLight: boolean;
  showCutOff: boolean;
  onToggle: (id: string) => void;
  onEdit: (s: any) => void;
  onDelete: (id: string) => void;
  getEntityBadge: (entity: string) => string;
  cleanBankName: (bankName: string, entity: string) => string;
}

const StatementTable: React.FC<TableProps> = ({
  entries, isLight, showCutOff, onToggle, onEdit, onDelete, getEntityBadge, cleanBankName,
}) => {
  if (entries.length === 0) return null;
  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full text-left text-xs border-collapse min-w-[600px]">
        <thead>
          <tr className={`${isLight ? "bg-slate-100/70 border-slate-200 text-slate-600" : "bg-[#141414] border-[#1a2235] text-[#888]"} border-b font-semibold`}>
            <th className="p-3 whitespace-nowrap">Entity</th>
            <th className="p-3 whitespace-nowrap">Bank Name</th>
            <th className="p-3 whitespace-nowrap">Statement Cycle</th>
            <th className="p-3 whitespace-nowrap hidden sm:table-cell">Remarks / Details</th>
            <th className="p-3 whitespace-nowrap">Statement Date</th>
            {showCutOff && <th className="p-3 whitespace-nowrap">Cut-Off Date</th>}
            <th className="p-3 whitespace-nowrap">Downloaded</th>
            <th className="p-3 whitespace-nowrap hidden sm:table-cell">Timestamp</th>
            <th className="p-3 whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${isLight ? "divide-slate-200" : "divide-[#222]"}`}>
          {entries.map((s) => (
            <tr key={s.id} className={`${isLight ? "hover:bg-slate-50" : "hover:bg-white/5"} transition-colors`}>
              <td className="p-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getEntityBadge(s.entity)}`}>{s.entity}</span>
              </td>
              <td className={`p-3 font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>{cleanBankName(s.bankName, s.entity)}</td>
              <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"}`}>{s.occurrence}</td>
              <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"} hidden sm:table-cell`}>{s.remarks}</td>
              <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"}`}>{formatStmtDate(s.statementDate)}</td>
              {showCutOff && (
                <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"}`}>{formatCutOffDate(s.cutOffDate)}</td>
              )}
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
                    onClick={() => onToggle(s.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      s.downloaded
                        ? isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-[#0d111a] hover:bg-[#222] text-[#888] hover:text-white"
                        : "bg-[#1a73e8] hover:bg-[#1557b0] text-white"
                    }`}
                  >
                    {s.downloaded ? "Mark Pending" : "Mark Downloaded"}
                  </button>
                  <button onClick={() => onEdit(s)} className={`p-1 ${isLight ? "text-blue-600 hover:text-blue-800" : "text-blue-400 hover:text-blue-300"} transition-colors`} title="Edit Statement">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onDelete(s.id)} className="p-1 text-red-500 hover:text-red-600 transition-colors" title="Delete Statement">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ── Main Page ───────────────────────────────────────────────────────────────── */
export const BankStatementsPage: React.FC = () => {
  const { bankStatements, selectedEntities, toggleStatementDownload, deleteBankStatement, theme, showConfirm } = useFinance() as any;

  const [isAddOpen,         setIsAddOpen]         = useState(false);
  const [isGenerateOpen,    setIsGenerateOpen]     = useState(false);
  const [editingStatement,  setEditingStatement]   = useState<any | null>(null);
  const [selectedMonth,     setSelectedMonth]      = useState<string>("ALL");
  const [selectedBank,      setSelectedBank]       = useState<string>("ALL");
  const [selectedEntity,    setSelectedEntity]     = useState<string>("ALL");
  const [isLegacyExpanded,  setIsLegacyExpanded]  = useState(false); // collapsed by default

  const isLight = theme === "light";

  /* ── Helpers ── */
  const cleanBankName = (bankName: string, entity: string): string => {
    if (!bankName || /^n?\d{10,}$/i.test(bankName.trim()) || bankName.startsWith("n17") || bankName.startsWith("n18")) {
      if (entity.includes("Ruby"))     return "Chase Operating Account";
      if (entity.includes("MSDx"))     return "Wells Fargo Operating";
      if (entity.includes("Curcumin")) return "Brex Corporate Account";
      return "First Interstate Bank";
    }
    return bankName;
  };

  const getEntityBadge = (entity: string): string => {
    if (entity.includes("Ruby"))     return "bg-[#d81b60]/20 text-[#e91e63]";
    if (entity.includes("MSDx"))     return "bg-[#00897b]/20 text-[#00897b]";
    if (entity.includes("Curcumin")) return "bg-[#6d4c41]/20 text-[#8d6e63]";
    if (entity === "4YR")            return "bg-purple-500/20 text-purple-400";
    if (entity === "E1")             return "bg-orange-500/20 text-orange-400";
    return "bg-[#1a73e8]/20 text-[#1a73e8]";
  };

  /**
   * Returns "Month YYYY" label for filtering.
   * New entries (has cutOffDate) → use cutOffDate month.
   * Legacy entries → use statementDate end / requestDate / period.
   */
  const getStatementMonth = (s: any): string => {
    // New entries: cut-off date drives the month
    if (s.cutOffDate) {
      const d = new Date(s.cutOffDate.includes("T") ? s.cutOffDate : s.cutOffDate + "T00:00:00");
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) {
        return d.toLocaleString("en-US", { month: "long", year: "numeric" });
      }
    }

    // Legacy entries: try statementDate (use end part of pipe range), then requestDate, then period
    const candidates: string[] = [];
    if (s.statementDate) {
      candidates.push(s.statementDate.includes("|") ? s.statementDate.split("|")[1] : s.statementDate);
    }
    if (s.requestDate) candidates.push(s.requestDate);
    if (s.period)      candidates.push(s.period);

    for (const raw of candidates) {
      const str = String(raw).trim();
      // YYYY-MM or YYYY-MM-DD
      const dashParts = str.split("-");
      if (dashParts.length >= 2 && dashParts[0].length === 4) {
        const y = parseInt(dashParts[0]);
        const m = parseInt(dashParts[1]) - 1;
        if (!isNaN(y) && !isNaN(m) && y >= 2000 && y <= 2035 && m >= 0 && m <= 11) {
          return new Date(y, m, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
        }
      }
      // MM/DD/YYYY or MM/YYYY
      const slashParts = str.split("/");
      if (slashParts.length >= 2) {
        const m = parseInt(slashParts[0]) - 1;
        const y = slashParts.length >= 3 ? parseInt(slashParts[2]) : 2026;
        if (!isNaN(m) && !isNaN(y) && m >= 0 && m <= 11 && y >= 2000) {
          return new Date(y < 100 ? y + 2000 : y, m, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
        }
      }
      // Try generic parse
      const d = new Date(str);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) {
        return d.toLocaleString("en-US", { month: "long", year: "numeric" });
      }
    }
    return "";
  };

  /* ── Split legacy vs new ── */
  // Legacy: entries with no cutOffDate (all current/existing entries)
  // New: entries with a cutOffDate (auto-generated future entries)
  const legacyStatements: any[] = (bankStatements || []).filter((s: any) => !s.cutOffDate);
  const newStatements:    any[] = (bankStatements || []).filter((s: any) => !!s.cutOffDate);

  /* ── Filter ── */
  const applyFilters = (entries: any[]): any[] =>
    entries.filter((s) => {
      const isGlobalEntityMatch = selectedEntities.has("ALL") || selectedEntities.has(s.entity);
      const isLocalEntityMatch  = selectedEntity === "ALL" || s.entity === selectedEntity;
      const monthLabel          = getStatementMonth(s);
      const isMonthMatch        = selectedMonth === "ALL" || monthLabel === selectedMonth;
      const bank                = cleanBankName(s.bankName, s.entity);
      const isBankMatch         = selectedBank === "ALL" || bank.toLowerCase() === selectedBank.toLowerCase();
      return isGlobalEntityMatch && isLocalEntityMatch && isMonthMatch && isBankMatch;
    });

  /* ── Sort: pending first (alpha bank), then downloaded (by entity) ── */
  const sortEntries = (entries: any[]): any[] =>
    [...entries].sort((a, b) => {
      if (a.downloaded !== b.downloaded) return a.downloaded ? 1 : -1;
      if (!a.downloaded) {
        return cleanBankName(a.bankName, a.entity).localeCompare(cleanBankName(b.bankName, b.entity));
      }
      return (a.entity || "").localeCompare(b.entity || "");
    });

  const filteredLegacy = sortEntries(applyFilters(legacyStatements));
  const filteredNew    = sortEntries(applyFilters(newStatements));
  const allFiltered    = [...filteredLegacy, ...filteredNew];

  /* ── KPI totals (across both sections) ── */
  const totalTracked    = allFiltered.length;
  const downloadedCount = allFiltered.filter((s) => s.downloaded).length;
  const pendingCount    = totalTracked - downloadedCount;

  /* ── Dropdown options ── */
  const availableMonths: string[] = Array.from(
    new Set((bankStatements || []).map((s: any) => getStatementMonth(s)).filter(Boolean))
  ).sort((a: any, b: any) => new Date((b as string) + " 1").getTime() - new Date((a as string) + " 1").getTime()) as string[];

  const availableBanks: string[] = Array.from(
    new Set((bankStatements || []).map((s: any) => cleanBankName(s.bankName, s.entity)).filter(Boolean))
  ).sort() as string[];

  const availableEntities: string[] = Array.from(
    new Set((bankStatements || []).map((s: any) => s.entity).filter(Boolean))
  ).sort() as string[];

  /* ── Handlers ── */
  const handleToggle = (id: string) => toggleStatementDownload(id);
  const handleDelete = (id: string) => showConfirm("Delete this statement record?", () => deleteBankStatement(id));

  /* ── Shared select class ── */
  const selectCls = `px-2.5 py-1 rounded-md text-xs font-semibold border focus:outline-none ${
    isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#0d111a] border-[#1a2235] text-white"
  }`;

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

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>Total Statements Tracked</div>
            <div className={`text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"} mt-1`}>{totalTracked}</div>
            <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"} mt-1`}>Monthly bank statement cycles</div>
          </div>
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>Pending Download</div>
            <div className="text-2xl font-bold text-[#fb923c] mt-1">{pendingCount}</div>
            <div className="text-[11px] text-[#fb923c] mt-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Awaiting statement retrieval</div>
          </div>
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>Downloaded & Archived</div>
            <div className="text-2xl font-bold text-[#4ade80] mt-1">{downloadedCount}</div>
            <div className="text-[11px] text-[#4ade80] mt-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Verified in folder</div>
          </div>
        </div>

        {/* ── Filter Bar ── */}
        <div className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${isLight ? "text-slate-600" : "text-gray-300"}`}>
              <Filter className="w-3.5 h-3.5 text-slate-400" /> Filter:
            </div>

            {/* Month */}
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>Month:</span>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className={selectCls}>
                <option value="ALL">All Months</option>
                {availableMonths.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Bank Name */}
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>Bank:</span>
              <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)} className={selectCls}>
                <option value="ALL">All Banks</option>
                {availableBanks.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            {/* Entity */}
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>Entity:</span>
              <select value={selectedEntity} onChange={(e) => setSelectedEntity(e.target.value)} className={selectCls}>
                <option value="ALL">All Entities</option>
                {availableEntities.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`text-xs ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              Showing {allFiltered.length} of {(bankStatements || []).length} statement(s)
            </div>
            <button
              onClick={() => setIsGenerateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a73e8] hover:bg-[#1557b0] text-white transition-colors"
            >
              <Zap className="w-3.5 h-3.5" /> Generate Monthly
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            LEGACY SECTION — collapsible, collapsed by default
            All pre-redesign entries live here until all are downloaded.
        ══════════════════════════════════════════════════════════════ */}
        <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl overflow-hidden shadow-sm`}>
          {/* Toggle header */}
          <button
            onClick={() => setIsLegacyExpanded(!isLegacyExpanded)}
            className={`w-full flex items-center justify-between p-3 border-b text-left transition-colors ${
              isLight ? "bg-slate-50 border-slate-200 hover:bg-slate-100" : "bg-[#0d1117] border-[#1a2235] hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2">
              {isLegacyExpanded
                ? <ChevronDown className={`w-4 h-4 ${isLight ? "text-slate-500" : "text-[#666]"}`} />
                : <ChevronRight className={`w-4 h-4 ${isLight ? "text-slate-500" : "text-[#666]"}`} />
              }
              <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-slate-700" : "text-[#aaa]"}`}>
                Legacy Entries
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]"}`}>
                {filteredLegacy.length} record{filteredLegacy.length !== 1 ? "s" : ""}
              </span>
              <span className={`text-[10px] hidden sm:inline ${isLight ? "text-slate-400" : "text-[#555]"}`}>
                — Pre-redesign entries. Once all are downloaded they will be archived.
              </span>
            </div>
            <span className={`text-[10px] font-semibold ${isLight ? "text-slate-400" : "text-[#555]"}`}>
              {isLegacyExpanded ? "Collapse" : "Expand"}
            </span>
          </button>

          {/* Legacy table — shown only when expanded */}
          {isLegacyExpanded && (
            filteredLegacy.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-8 gap-2 ${isLight ? "text-slate-400" : "text-[#555]"}`}>
                <FileText className="w-6 h-6 opacity-40" />
                <p className="text-xs">No legacy entries match the current filters.</p>
              </div>
            ) : (
              <StatementTable
                entries={filteredLegacy}
                isLight={isLight}
                showCutOff={false}
                onToggle={handleToggle}
                onEdit={setEditingStatement}
                onDelete={handleDelete}
                getEntityBadge={getEntityBadge}
                cleanBankName={cleanBankName}
              />
            )
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            NEW ENTRIES SECTION — primary tracker going forward
            Auto-generated entries appear here once setup is complete.
        ══════════════════════════════════════════════════════════════ */}
        <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl overflow-hidden shadow-sm`}>
          {/* Section header */}
          <div className={`p-3 border-b flex items-center justify-between ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-slate-800" : "text-white"} flex items-center gap-2`}>
              <FileText className="w-4 h-4 text-[#9ca3af]" /> Statement Tracker
              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]"}`}>
                {filteredNew.length} record{filteredNew.length !== 1 ? "s" : ""}
              </span>
            </h3>
            <span className={`text-[11px] hidden sm:inline ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              Click button to toggle downloaded status and sync with Google Sheets
            </span>
          </div>

          {/* New entries table or empty state */}
          {filteredNew.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-12 gap-3 ${isLight ? "text-slate-400" : "text-[#555]"}`}>
              <Zap className="w-8 h-8 opacity-30" />
              <p className={`text-sm font-semibold ${isLight ? "text-slate-500" : "text-[#666]"}`}>No auto-generated entries yet</p>
              <p className="text-xs text-center max-w-xs">
                New statement entries will appear here once the reference table is complete and auto-generation is set up.
              </p>
            </div>
          ) : (
            <StatementTable
              entries={filteredNew}
              isLight={isLight}
              showCutOff={true}
              onToggle={handleToggle}
              onEdit={setEditingStatement}
              onDelete={handleDelete}
              getEntityBadge={getEntityBadge}
              cleanBankName={cleanBankName}
            />
          )}
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
