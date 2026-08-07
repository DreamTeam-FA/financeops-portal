/**
 * FourYrPayrollPage — Portal-integrated 4YouPros Payroll dashboard.
 * Reads/writes directly to the Google Sheets 'raw' tab via Express API.
 * Visual layout matches the GAS Payroll Dashboard.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useFinance } from "../../context/FinanceContext";
import { getAccessToken } from "../../services/googleAuth";

// ── GAS external safety-net URL ───────────────────────────────────────────────
const GAS_URL =
  "https://script.google.com/a/macros/marktimm.com/s/AKfycbxvL1T_dHYg7s2tQmlfen7Y-eeYT6cU-L3vjv8RJ51pJWu7CydOfT9YyUy0MUJEsyFi/exec";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt2    = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtAmt  = (n: number) => `$${fmt2(n)}`;
const fmtHrs  = (n: number) => fmt2(n);

function today() {
  const d  = new Date();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${m}/${dy}/${d.getFullYear()}`;
}
function currentYear() { return String(new Date().getFullYear()); }

// ── Employee color palette ────────────────────────────────────────────────────
const EMP_COLORS = [
  "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6",
  "#ec4899", "#f97316", "#06b6d4", "#84cc16",
];
function getEmpColor(name: string, names: string[]): string {
  const idx = names.indexOf(name);
  return idx >= 0 ? EMP_COLORS[idx % EMP_COLORS.length] : "#94a3b8";
}

// ── Company chip ──────────────────────────────────────────────────────────────
const CoChip: React.FC<{ co: string }> = ({ co }) => {
  const style =
    co === "4YR" ? { bg: "#064e2250", color: "#34d399" } :
    co === "TI"  ? { bg: "#78350f50", color: "#fbbf24" } :
                   { bg: "#1e293b",   color: "#94a3b8" };
  return (
    <span style={{ background: style.bg, color: style.color }}
      className="text-[9px] font-bold px-1.5 py-px rounded leading-tight whitespace-nowrap">
      {co}
    </span>
  );
};

type Tab = "grouped" | "pivot" | "detail";

interface WeekMeta {
  weekNum: string; year: number; label: string; startDate: string; endDate: string;
}
interface RawRow {
  rowIndex: number; name: string; job: string; subCat: string;
  date: string; dateISO: string; started: string; finished: string;
  hoursRaw: number; hrsRed: boolean; rate: number; remarks: string;
  company: string; hours: number; total: number; variance: number;
  weekNum: string; mo: string;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info";
interface ToastMsg { id: number; msg: string; type: ToastType }

function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const idRef = useRef(0);
  const show  = useCallback((msg: string, type: ToastType = "success") => {
    const id = ++idRef.current;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

// ── Main component ────────────────────────────────────────────────────────────
export function FourYrPayrollPage() {
  const { theme, handleGoogleSignIn } = useFinance() as any;
  const isLight   = theme === "light";

  const { toasts, show: showToast } = useToast();
  const [authError, setAuthError] = useState(false);

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [yearFilter,    setYearFilter]    = useState(currentYear());
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const [nameFilter,    setNameFilter]    = useState("");
  const [jobFilter,     setJobFilter]     = useState("");
  const [dateFilter,    setDateFilter]    = useState("");

  // ── Type filter (payroll, deduction, nonpayroll) ──────────────────────────
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());

  const toggleTypeFilter = useCallback((type: string) => {
    setTypeFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }, []);

  // ── Dropdown data ─────────────────────────────────────────────────────────────
  const [years,       setYears]       = useState<number[]>([]);
  const [allWeeks,    setAllWeeks]    = useState<WeekMeta[]>([]);
  const [allNames,    setAllNames]    = useState<string[]>([]);
  const [allJobs,     setAllJobs]     = useState<string[]>([]);
  const [weekContext, setWeekContext] = useState<Record<string, { names: string[]; jobs: string[] }>>({});

  // ── Data ──────────────────────────────────────────────────────────────────────
  const [rows,         setRows]         = useState<RawRow[]>([]);
  const [groupedPivot, setGroupedPivot] = useState<any>(null);
  const [weeklyPivot,  setWeeklyPivot]  = useState<any>(null);
  const [totals,       setTotals]       = useState({ hours: 0, amount: 0 });

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [activeTab,    setActiveTab]   = useState<Tab>("grouped");
  const [loading,      setLoading]     = useState(false);
  const [dataLoaded,   setDataLoaded]  = useState(false);
  const [weekDropOpen, setWeekDropOpen] = useState(false);

  // ── Inline edit ───────────────────────────────────────────────────────────────
  const [editingCell,  setEditingCell] = useState<{ rowIndex: number; field: string } | null>(null);
  const [editVal,      setEditVal]     = useState("");
  const editInputRef                   = useRef<HTMLInputElement>(null);

  // ── Modal state ───────────────────────────────────────────────────────────────
  const [addModalOpen,    setAddModalOpen]   = useState(false);
  const [editModalOpen,   setEditModalOpen]  = useState(false);
  const [deleteConfirm,   setDeleteConfirm]  = useState<RawRow | null>(null);
  const [editingRow,      setEditingRow]     = useState<RawRow | null>(null);
  const [entryDropdowns,  setEntryDropdowns] = useState<any>(null);

  // ── Form state ────────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: "", job: "", subCat: "", date: "", started: "", finished: "",
    hours: "", remarks: "", amount: "", company: "", recordType: "payroll"
  });

  // ── Collapsed subcats in grouped view ─────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const lastKeyRef  = useRef("");

  // ── API helpers ───────────────────────────────────────────────────────────────
  const apiGet = useCallback(async (path: string) => {
    const tok = getAccessToken();
    const res = await fetch(path, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.status === 500) {
      try {
        const body = await res.clone().json();
        if (body?.error && /401|token|credential|auth/i.test(String(body.error))) {
          setAuthError(true);
          throw new Error("Google token expired — please reconnect");
        }
      } catch {}
    }
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
    return res.json();
  }, []);

  const apiPost = useCallback(async (path: string, body: any) => {
    const tok = getAccessToken();
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, accessToken: tok })
    });
    if (res.status === 500) {
      try {
        const b = await res.clone().json();
        if (b?.error && /401|token|credential|auth/i.test(String(b.error))) {
          setAuthError(true);
          throw new Error("Google token expired — please reconnect");
        }
      } catch {}
    }
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
    return res.json();
  }, []);

  // ── Load dropdowns ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!getAccessToken()) return;
    apiGet("/api/4yr/dropdown-data").then(data => {
      setAuthError(false);
      setYears(data.years || []);
      setAllWeeks(data.weeks || []);
      setAllNames(data.names || []);
      setAllJobs(data.jobs || []);
      setWeekContext(data.weekContext || {});
      const now = new Date();
      const todayWeek = (data.weeks as WeekMeta[]).find(w => {
        const start = new Date(w.startDate.replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2"));
        const end   = new Date(w.endDate.replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2"));
        end.setHours(23, 59, 59, 999);
        return now >= start && now <= end;
      });
      if (todayWeek) setSelectedWeeks([todayWeek.weekNum]);
    }).catch(e => {
      if (!e.message?.includes("reconnect")) {
        showToast(`Failed to load dropdowns: ${e.message}`, "error");
      }
    });
  }, []); // eslint-disable-line

  // ── Load filtered data (debounced) ────────────────────────────────────────────
  const loadData = useCallback(() => {
    if (!getAccessToken()) return;
    const filters: any = {};
    if (yearFilter)           filters.year     = yearFilter;
    if (selectedWeeks.length) filters.weekNums = selectedWeeks;
    if (nameFilter)           filters.name     = nameFilter;
    if (jobFilter)            filters.job      = jobFilter;
    if (dateFilter)           filters.date     = dateFilter;

    const key = JSON.stringify(filters);
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiPost("/api/4yr/filtered-data", { filters });
        setRows(data.rows || []);
        setGroupedPivot(data.groupedPivot || null);
        setWeeklyPivot(data.pivot || null);
        setTotals(data.totals || { hours: 0, amount: 0 });
        setDataLoaded(true);
      } catch (e: any) {
        if (!e.message?.includes("reconnect")) {
          showToast(`Failed to load data: ${e.message}`, "error");
        }
      } finally {
        setLoading(false);
      }
    }, 280);
  }, [yearFilter, selectedWeeks, nameFilter, jobFilter, dateFilter, apiPost]); // eslint-disable-line

  useEffect(() => { loadData(); }, [loadData]);

  // ── Clear weeks when year changes ─────────────────────────────────────────────
  const prevYearRef = useRef(yearFilter);
  useEffect(() => {
    if (prevYearRef.current !== yearFilter) {
      prevYearRef.current = yearFilter;
      setSelectedWeeks([]);
    }
  }, [yearFilter]);

  // ── Filtered weeks by year ────────────────────────────────────────────────────
  const filteredWeeks = useMemo(() => {
    if (!yearFilter) return allWeeks;
    return allWeeks.filter(w => String(w.year) === String(yearFilter));
  }, [allWeeks, yearFilter]);

  // ── Context-aware name/job dropdowns ─────────────────────────────────────────
  const contextNames = useMemo(() => {
    if (!selectedWeeks.length) return allNames;
    const names = new Set<string>();
    selectedWeeks.forEach(wk => (weekContext[wk]?.names || []).forEach(n => names.add(n)));
    return names.size > 0 ? [...names].sort() : allNames;
  }, [selectedWeeks, weekContext, allNames]);

  const contextJobs = useMemo(() => {
    if (!selectedWeeks.length) return allJobs;
    const jobs = new Set<string>();
    selectedWeeks.forEach(wk => (weekContext[wk]?.jobs || []).forEach(j => jobs.add(j)));
    return jobs.size > 0 ? [...jobs].sort() : allJobs;
  }, [selectedWeeks, weekContext, allJobs]);

  // ── KPI counts ────────────────────────────────────────────────────────────────
  const kpiWorkers = useMemo(() => new Set(rows.map(r => r.name)).size, [rows]);
  const kpiEntries = rows.length;

  // ── Type-filtered grouped pivot ───────────────────────────────────────────────
  const filteredGroupedPivot = useMemo(() => {
    if (!groupedPivot || typeFilters.size === 0) return groupedPivot;
    const filtered = {
      ...groupedPivot,
      companies: groupedPivot.companies.map((co: any) => ({
        ...co,
        jobs: co.jobs.map((job: any) => ({
          ...job,
          subCats: job.subCats.filter((sc: any) => {
            if (typeFilters.has("deduction")  && sc.isDeduction)                      return true;
            if (typeFilters.has("nonpayroll") && sc.isNonPayroll)                     return true;
            if (typeFilters.has("payroll")    && !sc.isDeduction && !sc.isNonPayroll) return true;
            return false;
          }),
        })).filter((job: any) => job.subCats.length > 0),
      })).filter((co: any) => co.jobs.length > 0),
    };
    return filtered;
  }, [groupedPivot, typeFilters]);

  // ── Collapse helpers ──────────────────────────────────────────────────────────
  const expandAll = useCallback(() => setCollapsed({}), []);
  const collapseAll = useCallback(() => {
    if (!filteredGroupedPivot) return;
    const next: Record<string, boolean> = {};
    filteredGroupedPivot.companies.forEach((co: any) =>
      co.jobs.forEach((job: any) =>
        job.subCats.forEach((sc: any) => {
          next[`sc-${co.company}-${job.job}-${sc.subCat}`] = true;
        })
      )
    );
    setCollapsed(next);
  }, [filteredGroupedPivot]);

  // ── Inline edit handlers ──────────────────────────────────────────────────────
  const startEdit  = (rowIndex: number, field: string, current: string) => {
    setEditingCell({ rowIndex, field });
    setEditVal(current);
    setTimeout(() => editInputRef.current?.focus(), 30);
  };
  const cancelEdit = () => setEditingCell(null);
  const commitEdit = async () => {
    if (!editingCell) return;
    const { rowIndex, field } = editingCell;
    setEditingCell(null);
    try {
      if      (field === "remark") await apiPost("/api/4yr/save-remark",  { rowIndex, remark: editVal });
      else if (field === "hours")  await apiPost("/api/4yr/save-hours",   { rowIndex, hours: parseFloat(editVal) || 0 });
      else if (field === "total")  await apiPost("/api/4yr/save-total",   { rowIndex, total: parseFloat(editVal) || 0 });
      else if (field === "job")    await apiPost("/api/4yr/save-job",     { rowIndex, job: editVal });
      showToast("Saved");
      lastKeyRef.current = "";
      loadData();
    } catch (e: any) {
      showToast(`Save failed: ${e.message}`, "error");
    }
  };

  // ── Reset filters ─────────────────────────────────────────────────────────────
  const resetFilters = () => {
    setYearFilter(currentYear());
    setSelectedWeeks([]);
    setNameFilter("");
    setJobFilter("");
    setDateFilter("");
    lastKeyRef.current = "";
  };

  // ── Modal helpers ─────────────────────────────────────────────────────────────
  const openAddModal = async () => {
    try {
      const d = await apiGet("/api/4yr/dropdown-data-for-entry");
      setEntryDropdowns(d);
      setForm({ name: "", job: "", subCat: "", date: today(), started: "", finished: "",
                hours: "", remarks: "", amount: "", company: "", recordType: "payroll" });
      setAddModalOpen(true);
    } catch (e: any) {
      showToast(`Failed to load entry form: ${e.message}`, "error");
    }
  };

  const openEditModal = async (row: RawRow) => {
    try {
      const d = await apiGet("/api/4yr/dropdown-data-for-entry");
      setEntryDropdowns(d);
      setEditingRow(row);
      const isDeduction  = row.total < 0 ||
        /deduct|loan|rent|penalty|withhold/i.test(row.job) ||
        /deduct|loan|rent|penalty|withhold/i.test(row.subCat);
      const isNonPayroll = !isDeduction &&
        /reimburse|reimbursement|adjustment|allowance|bonus|incentive|extra|misc/i.test(row.subCat);
      const recordType   = isDeduction ? "deduction" : isNonPayroll ? "nonpayroll" : "payroll";
      setForm({
        name: row.name, job: row.job, subCat: row.subCat, date: row.date,
        started: row.started, finished: row.finished,
        hours: String(row.hours || ""), remarks: row.remarks,
        amount: String(Math.abs(row.total || 0)), company: row.company,
        recordType
      });
      setEditModalOpen(true);
    } catch (e: any) {
      showToast(`Failed to open edit form: ${e.message}`, "error");
    }
  };

  const submitAdd = async () => {
    if (!form.name || !form.job) { showToast("Name and Job are required", "error"); return; }
    try {
      await apiPost("/api/4yr/add-entry", form);
      showToast("Entry added successfully");
      setAddModalOpen(false);
      lastKeyRef.current = "";
      loadData();
    } catch (e: any) {
      showToast(`Add failed: ${e.message}`, "error");
    }
  };

  const submitEdit = async () => {
    if (!editingRow || !form.name || !form.job) { showToast("Name and Job are required", "error"); return; }
    try {
      await apiPost("/api/4yr/save-edit", { ...form, rowIndex: editingRow.rowIndex, hoursExplicitlyEdited: true });
      showToast("Entry updated successfully");
      setEditModalOpen(false);
      lastKeyRef.current = "";
      loadData();
    } catch (e: any) {
      showToast(`Edit failed: ${e.message}`, "error");
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await apiPost("/api/4yr/delete-entry", { rowIndex: deleteConfirm.rowIndex });
      showToast("Entry deleted");
      setDeleteConfirm(null);
      lastKeyRef.current = "";
      loadData();
    } catch (e: any) {
      showToast(`Delete failed: ${e.message}`, "error");
      setDeleteConfirm(null);
    }
  };

  const toggleWeek = (wk: string) => {
    setSelectedWeeks(prev => prev.includes(wk) ? prev.filter(x => x !== wk) : [...prev, wk]);
    lastKeyRef.current = "";
  };

  const isNoTime = form.recordType === "deduction" || form.recordType === "nonpayroll";

  // ── Theme tokens ──────────────────────────────────────────────────────────────
  const bg    = isLight ? "bg-white"         : "bg-[#0f0f0f]";
  const bg2   = isLight ? "bg-slate-50"      : "bg-[#111]";
  const bg3   = isLight ? "bg-slate-100"     : "bg-[#1a1a1a]";
  const bdr   = isLight ? "border-slate-200" : "border-[#272727]";
  const txt   = isLight ? "text-slate-900"   : "text-slate-100";
  const txt2  = isLight ? "text-slate-500"   : "text-slate-500";
  const txt3  = isLight ? "text-slate-700"   : "text-slate-300";
  const inp   = isLight
    ? "bg-white border-slate-200 text-slate-900 focus:border-green-500 focus:ring-1 focus:ring-green-500/20"
    : "bg-[#1c1c1c] border-[#333] text-slate-100 focus:border-green-500 focus:ring-1 focus:ring-green-500/20";
  const tbHdr = isLight ? "bg-slate-100 text-slate-500" : "bg-[#1a1a1a] text-slate-400";
  const tbRow = isLight ? "hover:bg-slate-50/80" : "hover:bg-[#181818]";
  const tbBdr = isLight ? "border-slate-100"      : "border-[#1e1e1e]";

  // ── Week label ────────────────────────────────────────────────────────────────
  const weekLabel = selectedWeeks.length === 0
    ? "All Weeks"
    : selectedWeeks.length === 1
    ? (filteredWeeks.find(w => w.weekNum === selectedWeeks[0])?.label || selectedWeeks[0])
    : `${selectedWeeks.length} weeks selected`;

  // ── Grouped pivot renderer ────────────────────────────────────────────────────
  const renderGrouped = () => {
    if (!filteredGroupedPivot) return null;
    const { names, companies, grandTotal } = filteredGroupedPivot;
    const numEmpCols = names.length * 2; // Hrs + Amt per employee

    return (
      <div className="flex flex-col gap-3">
        {/* ── Section header ── */}
        <div className={`flex flex-col gap-2 pb-2 border-b ${bdr}`}>
          <div className="flex items-center gap-2">
            <h2 className={`text-sm font-bold ${txt}`}>Weekly Summary</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isLight ? "bg-green-100 text-green-700" : "bg-green-900/40 text-green-400"
            }`}>{weekLabel}</span>
            <span className={`text-[10px] ${txt2} ml-auto italic`}>* click a cell to edit inline</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Expand / Collapse */}
            <div className="flex items-center gap-1">
              <button onClick={expandAll}
                className={`text-[11px] px-2.5 py-1 rounded border font-medium transition-colors ${
                  isLight
                    ? "border-slate-300 text-slate-600 hover:border-green-400 hover:text-green-600 bg-white"
                    : "border-[#333] text-slate-400 hover:border-green-600 hover:text-green-400 bg-[#1a1a1a]"
                }`}>
                ≡ Expand All
              </button>
              <button onClick={collapseAll}
                className={`text-[11px] px-2.5 py-1 rounded border font-medium transition-colors ${
                  isLight
                    ? "border-slate-300 text-slate-600 hover:border-green-400 hover:text-green-600 bg-white"
                    : "border-[#333] text-slate-400 hover:border-green-600 hover:text-green-400 bg-[#1a1a1a]"
                }`}>
                ⊟ Collapse All
              </button>
            </div>
            <span className={`text-[11px] ${txt2}`}>|</span>
            {/* Type filters */}
            {[
              { key: "payroll",    label: "Payroll",    color: isLight ? "text-green-600" : "text-green-400" },
              { key: "deduction",  label: "Deduction",  color: isLight ? "text-red-600"   : "text-red-400"   },
              { key: "nonpayroll", label: "Non-Payroll",color: isLight ? "text-sky-600"   : "text-sky-400"   },
            ].map(t => (
              <label key={t.key} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox"
                  checked={typeFilters.has(t.key)}
                  onChange={() => toggleTypeFilter(t.key)}
                  className="accent-green-500 w-3.5 h-3.5"
                />
                <span className={`text-[11px] font-medium ${typeFilters.has(t.key) ? t.color : txt2}`}>
                  {t.label}
                </span>
              </label>
            ))}
            {typeFilters.size > 0 && (
              <button onClick={() => setTypeFilters(new Set())}
                className={`text-[10px] ml-1 ${txt2} hover:text-red-400 transition-colors`}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="overflow-x-auto rounded-lg">
          <table className="text-xs border-collapse" style={{ minWidth: "100%" }}>
            <thead>
              {/* Row 1 — group headers + employee name headers */}
              <tr className={tbHdr}>
                <th className={`text-left px-3 py-2 font-semibold text-[10px] uppercase tracking-wide sticky left-0 z-10 ${tbHdr}`} style={{ minWidth: 110 }}>Company</th>
                <th className={`text-left px-2 py-2 font-semibold text-[10px] uppercase tracking-wide ${tbHdr}`} style={{ minWidth: 130 }}>Job</th>
                <th className={`text-left px-2 py-2 font-semibold text-[10px] uppercase tracking-wide ${tbHdr}`} style={{ minWidth: 130 }}>Sub Cat</th>
                {names.map((n: string) => (
                  <th key={n} colSpan={2} className={`text-center px-2 py-2 font-semibold text-[11px] border-l ${tbBdr} ${tbHdr}`} style={{ minWidth: 160 }}>
                    {n.split(" ")[0]}
                  </th>
                ))}
                <th colSpan={2} className={`text-center px-2 py-2 font-bold text-[10px] uppercase tracking-wide border-l ${tbBdr} ${isLight ? "bg-green-50 text-green-700" : "bg-[#0f2318] text-green-400"}`} style={{ minWidth: 160 }}>
                  Grand Total
                </th>
              </tr>
              {/* Row 2 — Hrs / Amt sub-headers */}
              <tr className={tbHdr}>
                <th className={`sticky left-0 z-10 ${tbHdr} py-1`} />
                <th className={`${tbHdr} py-1`} />
                <th className={`${tbHdr} py-1`} />
                {names.map((n: string) => (
                  <React.Fragment key={n}>
                    <th className={`text-right px-2 py-1 text-[10px] font-medium border-l ${tbBdr} ${tbHdr} opacity-70`} style={{ minWidth: 70 }}>Hrs</th>
                    <th className={`text-right px-2 py-1 text-[10px] font-medium ${tbHdr} opacity-70`} style={{ minWidth: 90 }}>Amt</th>
                  </React.Fragment>
                ))}
                <th className={`text-right px-2 py-1 text-[10px] font-medium border-l ${tbBdr} ${isLight ? "bg-green-50 text-green-600" : "bg-[#0f2318] text-green-500"}`} style={{ minWidth: 70 }}>Hrs</th>
                <th className={`text-right px-3 py-1 text-[10px] font-medium ${isLight ? "bg-green-50 text-green-600" : "bg-[#0f2318] text-green-500"}`} style={{ minWidth: 90 }}>Amt</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((co: any) => (
                <React.Fragment key={co.company}>
                  {co.jobs.map((job: any, ji: number) => (
                    <React.Fragment key={job.job}>
                      {job.subCats.map((sc: any, si: number) => {
                        const scKey       = `sc-${co.company}-${job.job}-${sc.subCat}`;
                        const scCollapsed = !!collapsed[scKey];
                        const isDed       = sc.isDeduction;
                        const isNonPay    = sc.isNonPayroll;
                        const typeColor   = isDed
                          ? (isLight ? "text-red-600"   : "text-red-400")
                          : isNonPay
                          ? (isLight ? "text-sky-600"   : "text-sky-400")
                          : txt3;
                        return (
                          <React.Fragment key={sc.subCat}>
                            {/* ── Sub-category row ── */}
                            <tr className={`border-t ${tbBdr} ${tbRow}`}>
                              {/* Company cell — only on first row */}
                              {ji === 0 && si === 0 && (
                                <td
                                  rowSpan={co.jobs.reduce((a: number, j: any) => a + j.subCats.length, 0)}
                                  className={`px-3 py-2 sticky left-0 z-10 font-bold text-[11px] align-top border-r ${tbBdr} ${
                                    isLight ? "bg-emerald-50 text-emerald-800" : "bg-[#0f2318] text-emerald-400"
                                  }`}
                                >
                                  {co.company}
                                </td>
                              )}
                              {/* Job cell — only on first subcat of this job */}
                              {si === 0 && (
                                <td
                                  rowSpan={job.subCats.length}
                                  className={`px-2 py-1.5 font-semibold text-[11px] align-top border-r ${tbBdr} ${
                                    isLight ? "bg-slate-50 text-slate-700" : "bg-[#161616] text-slate-300"
                                  }`}
                                >
                                  {job.job}
                                </td>
                              )}
                              {/* Sub-cat cell */}
                              <td
                                className={`px-2 py-1.5 cursor-pointer ${typeColor}`}
                                onClick={() => setCollapsed(c => ({ ...c, [scKey]: !c[scKey] }))}
                              >
                                <span className={`inline-block w-3 mr-0.5 text-[9px] ${txt2}`}>
                                  {scCollapsed ? "▶" : "▼"}
                                </span>
                                <span className="font-medium">{sc.subCat || <em className="opacity-50 text-[10px]">—</em>}</span>
                                {isDed    && <span className={`ml-1 text-[8px] px-1 py-px rounded ${isLight ? "bg-red-100 text-red-500" : "bg-red-900/30 text-red-400"}`}>deduct</span>}
                                {isNonPay && <span className={`ml-1 text-[8px] px-1 py-px rounded ${isLight ? "bg-sky-100 text-sky-500" : "bg-sky-900/30 text-sky-400"}`}>non-pay</span>}
                              </td>
                              {/* Per-employee Hrs + Amt */}
                              {names.map((n: string) => (
                                <React.Fragment key={n}>
                                  <td className={`text-right px-2 py-1.5 tabular-nums border-l ${tbBdr} ${typeColor}`}>
                                    {sc.nameTotals[n]?.hrs ? fmtHrs(sc.nameTotals[n].hrs) : <span className="opacity-20">—</span>}
                                  </td>
                                  <td className={`text-right px-2 py-1.5 tabular-nums ${typeColor}`}>
                                    {sc.nameTotals[n]?.amt ? fmtAmt(sc.nameTotals[n].amt) : <span className="opacity-20">—</span>}
                                  </td>
                                </React.Fragment>
                              ))}
                              {/* Grand total */}
                              <td className={`text-right px-2 py-1.5 tabular-nums border-l ${tbBdr} ${typeColor} font-semibold`}>{fmtHrs(sc.hours)}</td>
                              <td className={`text-right px-3 py-1.5 tabular-nums ${typeColor} font-semibold`}>{fmtAmt(sc.amount)}</td>
                            </tr>
                            {/* ── Date drill-down rows ── */}
                            {!scCollapsed && sc.dateRows.map((dr: any) => (
                              <tr key={dr.date} className={`border-t ${tbBdr} ${tbRow} ${isLight ? "bg-slate-50/50" : "bg-[#0d0d0d]/50"}`}>
                                <td colSpan={3} className={`px-3 py-1 pl-14 ${txt2} text-[10px] italic`}>{dr.date}</td>
                                {names.map((n: string) => (
                                  <React.Fragment key={n}>
                                    <td className={`text-right px-2 py-1 tabular-nums border-l ${tbBdr} ${txt2} text-[10px]`}>
                                      {dr.nameTotals[n]?.hrs ? fmtHrs(dr.nameTotals[n].hrs) : ""}
                                    </td>
                                    <td className={`text-right px-2 py-1 tabular-nums ${txt2} text-[10px]`}>
                                      {dr.nameTotals[n]?.amt ? fmtAmt(dr.nameTotals[n].amt) : ""}
                                    </td>
                                  </React.Fragment>
                                ))}
                                <td className={`text-right px-2 py-1 tabular-nums border-l ${tbBdr} ${txt2} text-[10px]`}>{fmtHrs(dr.hours)}</td>
                                <td className={`text-right px-3 py-1 tabular-nums ${txt2} text-[10px]`}>{fmtAmt(dr.amount)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  ))}

                  {/* ── Company total row ── */}
                  <tr className={`border-t-2 ${isLight ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-emerald-800 bg-[#0c2016] text-emerald-400"} font-bold`}>
                    <td className={`px-3 py-2 sticky left-0 z-10 text-[11px] tracking-wide ${isLight ? "bg-emerald-50" : "bg-[#0c2016]"}`} colSpan={3}>
                      {co.company} Total
                    </td>
                    {names.map((n: string) => (
                      <React.Fragment key={n}>
                        <td className={`text-right px-2 py-2 tabular-nums border-l ${tbBdr}`}>
                          {co.nameTotals[n]?.hrs ? fmtHrs(co.nameTotals[n].hrs) : <span className="opacity-30">—</span>}
                        </td>
                        <td className="text-right px-2 py-2 tabular-nums">
                          {co.nameTotals[n]?.amt ? fmtAmt(co.nameTotals[n].amt) : <span className="opacity-30">—</span>}
                        </td>
                      </React.Fragment>
                    ))}
                    <td className={`text-right px-2 py-2 tabular-nums border-l ${tbBdr}`}>{fmtHrs(co.hours)}</td>
                    <td className="text-right px-3 py-2 tabular-nums">{fmtAmt(co.amount)}</td>
                  </tr>
                </React.Fragment>
              ))}

              {/* ── Grand total row ── */}
              <tr className={`border-t-2 ${isLight ? "border-green-500 bg-green-600 text-white" : "border-green-600 bg-green-800 text-white"} font-bold`}>
                <td className={`px-3 py-2.5 sticky left-0 z-10 text-[11px] tracking-widest uppercase ${isLight ? "bg-green-600" : "bg-green-800"}`} colSpan={3}>
                  Grand Total
                </td>
                {names.map((n: string) => (
                  <React.Fragment key={n}>
                    <td className="text-right px-2 py-2.5 tabular-nums border-l border-green-500/40">
                      {grandTotal.nameTotals[n]?.hrs ? fmtHrs(grandTotal.nameTotals[n].hrs) : <span className="opacity-40">—</span>}
                    </td>
                    <td className="text-right px-2 py-2.5 tabular-nums">
                      {grandTotal.nameTotals[n]?.amt ? fmtAmt(grandTotal.nameTotals[n].amt) : <span className="opacity-40">—</span>}
                    </td>
                  </React.Fragment>
                ))}
                <td className="text-right px-2 py-2.5 tabular-nums border-l border-green-500/40">{fmtHrs(grandTotal.hours)}</td>
                <td className="text-right px-3 py-2.5 tabular-nums">{fmtAmt(grandTotal.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Summary by Date renderer ──────────────────────────────────────────────────
  const renderPivot = () => {
    if (!weeklyPivot) return null;
    const { names, dates, matrix, nameTotals, grandTotal } = weeklyPivot;
    return (
      <div className="flex flex-col gap-3">
        <div className={`pb-2 border-b ${bdr}`}>
          <h2 className={`text-sm font-bold ${txt}`}>Summary by Date</h2>
          <p className={`text-[11px] ${txt2} mt-0.5`}>{weekLabel}</p>
        </div>
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={tbHdr}>
                <th className={`text-left px-3 py-2.5 sticky left-0 z-10 tracking-wide uppercase text-[10px] font-semibold ${tbHdr}`} style={{ minWidth: 110 }}>Date</th>
                {names.map((n: string) => (
                  <th key={n} className="text-right px-2 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 90 }}>
                    {n.split(" ")[0]}
                  </th>
                ))}
                <th className="text-right px-3 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 90 }}>Total Hrs</th>
                <th className="text-right px-3 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 100 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((d: string) => {
                const rowHrs = names.reduce((s: number, n: string) => s + (matrix[d]?.[n]?.hours  || 0), 0);
                const rowAmt = names.reduce((s: number, n: string) => s + (matrix[d]?.[n]?.amount || 0), 0);
                return (
                  <tr key={d} className={`border-t ${tbBdr} ${tbRow}`}>
                    <td className={`px-3 py-1.5 sticky left-0 ${bg2} font-medium tabular-nums`}>{d}</td>
                    {names.map((n: string) => (
                      <td key={n} className={`text-right px-2 py-1.5 tabular-nums ${txt3}`}>
                        {matrix[d]?.[n]?.hours
                          ? fmtHrs(matrix[d][n].hours)
                          : <span className={`${txt2} opacity-30`}>—</span>}
                      </td>
                    ))}
                    <td className="text-right px-3 py-1.5 font-semibold tabular-nums">{fmtHrs(rowHrs)}</td>
                    <td className={`text-right px-3 py-1.5 tabular-nums ${rowAmt < 0 ? "text-red-400" : "text-green-400"}`}>
                      {fmtAmt(rowAmt)}
                    </td>
                  </tr>
                );
              })}
              <tr className={`border-t-2 ${isLight ? "border-green-500 bg-green-600 text-white" : "border-green-600 bg-green-800 text-white"} font-bold`}>
                <td className={`px-3 py-2 sticky left-0 tracking-wide uppercase text-[10px] ${isLight ? "bg-green-600" : "bg-green-800"}`}>Total Hrs</td>
                {names.map((n: string) => (
                  <td key={n} className="text-right px-2 py-2 tabular-nums">{fmtHrs(nameTotals[n]?.hours || 0)}</td>
                ))}
                <td className="text-right px-3 py-2 tabular-nums">{fmtHrs(grandTotal.hours)}</td>
                <td />
              </tr>
              <tr className={`border-t ${tbBdr} ${isLight ? "bg-green-50 text-green-800" : "bg-[#0a1f12]/70 text-green-300"} font-bold`}>
                <td className={`px-3 py-2 sticky left-0 tracking-wide uppercase text-[10px] ${isLight ? "bg-green-50" : "bg-[#0a1f12]/70"}`}>Amount</td>
                {names.map((n: string) => (
                  <td key={n} className="text-right px-2 py-2 tabular-nums">{fmtAmt(nameTotals[n]?.amount || 0)}</td>
                ))}
                <td />
                <td className="text-right px-3 py-2 tabular-nums">{fmtAmt(grandTotal.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Detail Log renderer ───────────────────────────────────────────────────────
  const renderDetail = () => {
    const empNames = groupedPivot?.names || [...new Set(rows.map(r => r.name))];
    return (
      <div className="flex flex-col gap-3">
        <div className={`pb-2 border-b ${bdr}`}>
          <h2 className={`text-sm font-bold ${txt}`}>Detail Log</h2>
          <p className={`text-[11px] ${txt2} mt-0.5`}>{rows.length} records · {weekLabel}</p>
        </div>
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={tbHdr}>
                <th className={`text-left px-3 py-2.5 tracking-wide uppercase text-[10px] font-semibold`} style={{ minWidth: 100 }}>Date</th>
                <th className={`text-left px-2 py-2.5 tracking-wide uppercase text-[10px] font-semibold sticky left-0 z-10 ${tbHdr}`} style={{ minWidth: 130 }}>Name</th>
                <th className="text-left px-2 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 130 }}>Job</th>
                <th className="text-left px-2 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 110 }}>Sub Cat</th>
                <th className="text-left px-2 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 80 }}>Start</th>
                <th className="text-left px-2 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 80 }}>End</th>
                <th className="text-right px-2 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 65 }}>Hrs</th>
                <th className="text-right px-2 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 75 }}>Rate</th>
                <th className="text-right px-2 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 90 }}>Amount</th>
                <th className="text-center px-2 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 50 }}>Co</th>
                <th className="text-left px-2 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 140 }}>Remarks</th>
                <th className="text-center px-2 py-2.5 tracking-wide uppercase text-[10px] font-semibold" style={{ minWidth: 56 }}>Edit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isEJ   = editingCell?.rowIndex === row.rowIndex;
                const isEHrs = isEJ && editingCell?.field === "hours";
                const isEAmt = isEJ && editingCell?.field === "total";
                const isERmk = isEJ && editingCell?.field === "remark";
                const isEJob = isEJ && editingCell?.field === "job";
                const isDed  = row.total < 0 ||
                  /deduct|loan|rent|penalty|withhold/i.test(row.job) ||
                  /deduct|loan|rent|penalty|withhold/i.test(row.subCat);
                const amtCls = isDed ? "text-red-400" : row.total > 0 ? "text-green-400" : txt3;
                const nameColor = getEmpColor(row.name, empNames);

                return (
                  <tr key={row.rowIndex} className={`border-t ${tbBdr} ${tbRow}`}>
                    {/* Date */}
                    <td className={`px-3 py-1.5 tabular-nums ${txt2} text-[11px]`}>{row.date}</td>

                    {/* Name — colored */}
                    <td className="px-2 py-1.5 sticky left-0 z-10" style={{ background: isLight ? "#fff" : "#0f0f0f" }}>
                      <span className="font-semibold text-[11px]" style={{ color: nameColor }}>{row.name}</span>
                    </td>

                    {/* Job — inline editable */}
                    <td className="px-2 py-1.5">
                      {isEJob ? (
                        <input ref={editInputRef} value={editVal}
                          className={`w-full rounded border text-xs px-1.5 py-0.5 outline-none ${inp}`}
                          onChange={e => setEditVal(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                        />
                      ) : (
                        <span className={`cursor-text hover:underline decoration-dashed ${txt3}`}
                          onClick={() => startEdit(row.rowIndex, "job", row.job)}>
                          {row.job}
                        </span>
                      )}
                    </td>

                    <td className={`px-2 py-1.5 ${txt2}`}>{row.subCat}</td>
                    <td className={`px-2 py-1.5 tabular-nums ${txt2}`}>{row.started}</td>
                    <td className={`px-2 py-1.5 tabular-nums ${txt2}`}>{row.finished}</td>

                    {/* Hours — inline editable */}
                    <td className="text-right px-2 py-1.5">
                      {isEHrs ? (
                        <input ref={editInputRef} value={editVal}
                          className={`w-14 rounded border text-xs px-1 py-0.5 text-right outline-none ${inp}`}
                          onChange={e => setEditVal(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                        />
                      ) : (
                        <span className={`cursor-text hover:underline decoration-dashed tabular-nums ${row.hrsRed ? "text-red-400" : txt3}`}
                          onClick={() => startEdit(row.rowIndex, "hours", String(row.hours))}>
                          {fmtHrs(row.hours)}
                        </span>
                      )}
                    </td>

                    {/* Rate */}
                    <td className={`text-right px-2 py-1.5 tabular-nums ${txt2}`}>
                      {row.rate ? `$${fmt2(row.rate)}/hr` : <span className="opacity-30">—</span>}
                    </td>

                    {/* Amount — inline editable */}
                    <td className="text-right px-2 py-1.5">
                      {isEAmt ? (
                        <input ref={editInputRef} value={editVal}
                          className={`w-20 rounded border text-xs px-1 py-0.5 text-right outline-none ${inp}`}
                          onChange={e => setEditVal(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                        />
                      ) : (
                        <span className={`cursor-text hover:underline decoration-dashed tabular-nums font-medium ${amtCls}`}
                          onClick={() => startEdit(row.rowIndex, "total", String(row.total))}>
                          {fmtAmt(row.total)}
                        </span>
                      )}
                    </td>

                    {/* Company chip */}
                    <td className="text-center px-2 py-1.5">
                      {row.company && <CoChip co={row.company} />}
                    </td>

                    {/* Remarks — inline editable */}
                    <td className="px-2 py-1.5">
                      {isERmk ? (
                        <input ref={editInputRef} value={editVal}
                          className={`w-full rounded border text-xs px-1.5 py-0.5 outline-none ${inp}`}
                          onChange={e => setEditVal(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                        />
                      ) : (
                        <span className={`cursor-text hover:underline decoration-dashed text-[11px] ${row.remarks ? "text-amber-400" : txt2}`}
                          onClick={() => startEdit(row.rowIndex, "remark", row.remarks)}>
                          {row.remarks || <em className="opacity-40">add note…</em>}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="text-center px-2 py-1.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(row)}
                          className={`text-[11px] w-6 h-6 flex items-center justify-center rounded transition-colors ${isLight ? "bg-blue-50 text-blue-500 hover:bg-blue-100" : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"}`}
                          title="Edit"
                        >✏️</button>
                        <button
                          onClick={() => setDeleteConfirm(row)}
                          className={`text-[11px] w-6 h-6 flex items-center justify-center rounded transition-colors ${isLight ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-red-500/10 text-red-400 hover:bg-red-500/20"}`}
                          title="Delete"
                        >🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className={`text-center py-12 ${txt2} text-sm`}>
                    {dataLoaded ? "No records match current filters." : "Loading…"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Entry form (shared by Add & Edit modals) ──────────────────────────────────
  const renderForm = () => (
    <div className="grid grid-cols-2 gap-3">
      {/* Record type */}
      <div className="col-span-2">
        <label className={`block text-[11px] font-semibold mb-1.5 ${txt2} uppercase tracking-wide`}>Record Type</label>
        <div className={`flex gap-1 p-1 rounded-lg ${bg3}`}>
          {[
            { val: "payroll",    label: "Payroll" },
            { val: "deduction",  label: "Deduction" },
            { val: "nonpayroll", label: "Non-Payroll" },
          ].map(rt => (
            <label key={rt.val} className="flex-1">
              <input type="radio" name="recordType" value={rt.val}
                checked={form.recordType === rt.val}
                onChange={() => setForm(f => ({ ...f, recordType: rt.val }))}
                className="sr-only"
              />
              <span className={`flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all ${
                form.recordType === rt.val
                  ? "bg-green-600 text-white shadow-sm"
                  : `${txt2}`
              }`}>
                {rt.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Employee Name *</label>
        <input list="entry-names" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none transition-all ${inp}`}
          placeholder="Employee name"
        />
        <datalist id="entry-names">
          {(entryDropdowns?.names || []).map((n: string) => <option key={n} value={n} />)}
        </datalist>
      </div>

      {/* Job */}
      <div>
        <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Job / Location *</label>
        <input list="entry-jobs" value={form.job}
          onChange={e => setForm(f => ({ ...f, job: e.target.value }))}
          className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none transition-all ${inp}`}
          placeholder="Job / location"
        />
        <datalist id="entry-jobs">
          {(entryDropdowns?.jobs || []).map((j: string) => <option key={j} value={j} />)}
        </datalist>
      </div>

      {/* Sub category */}
      <div>
        <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Sub Category</label>
        <input list="entry-subcats" value={form.subCat}
          onChange={e => setForm(f => ({ ...f, subCat: e.target.value }))}
          className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none transition-all ${inp}`}
          placeholder="Optional"
        />
        <datalist id="entry-subcats">
          {(entryDropdowns?.subCats || []).map((s: string) => <option key={s} value={s} />)}
        </datalist>
      </div>

      {/* Date */}
      <div>
        <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Date</label>
        <input type="text" value={form.date} placeholder="MM/DD/YYYY"
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none transition-all ${inp}`}
        />
      </div>

      {/* Time fields (payroll only) */}
      {!isNoTime && (
        <>
          <div>
            <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Started</label>
            <input type="text" value={form.started} placeholder="HH:MM AM/PM"
              onChange={e => setForm(f => ({ ...f, started: e.target.value }))}
              className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none transition-all ${inp}`}
            />
          </div>
          <div>
            <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Finished</label>
            <input type="text" value={form.finished} placeholder="HH:MM AM/PM"
              onChange={e => setForm(f => ({ ...f, finished: e.target.value }))}
              className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none transition-all ${inp}`}
            />
          </div>
          <div>
            <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Hours Override</label>
            <input type="number" value={form.hours} step="0.01"
              onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
              className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none transition-all ${inp}`}
              placeholder="Leave blank to auto-calculate"
            />
          </div>
        </>
      )}

      {/* Amount (deductions / non-payroll) */}
      {isNoTime && (
        <div>
          <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Amount ($)</label>
          <input type="number" value={form.amount} step="0.01"
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none transition-all ${inp}`}
            placeholder="0.00"
          />
        </div>
      )}

      {/* Remarks */}
      <div className="col-span-2">
        <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Remarks</label>
        <input type="text" value={form.remarks}
          onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
          className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none transition-all ${inp}`}
          placeholder="Optional"
        />
      </div>

      {/* Company override */}
      <div className="col-span-2">
        <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Company Override</label>
        <input list="entry-companies" value={form.company}
          onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
          className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none transition-all ${inp}`}
          placeholder="Optional — auto-detected from employee"
        />
        <datalist id="entry-companies">
          {(entryDropdowns?.companies || []).map((c: string) => <option key={c} value={c} />)}
        </datalist>
      </div>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col h-full overflow-hidden ${bg} ${txt}`}>

      {/* ── GAS-style header bar ── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5"
        style={{ background: "#1e4d2b" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white"
              style={{ background: "#155c33" }}>
              4YR
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight">4YouPros</div>
              <div className="text-green-300 text-[10px] leading-tight">Payroll Dashboard</div>
            </div>
          </div>
          {selectedWeeks.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              {weekLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-[11px] text-green-300 animate-pulse">Refreshing…</span>
          )}
          <a href={GAS_URL} target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-green-200 hover:text-white transition-colors flex items-center gap-1 font-medium">
            Open GAS ↗
          </a>
          <span className="text-green-600 text-[10px] hidden lg:block">® Made by Finance Team</span>
        </div>
      </div>

      {/* ── Auth error banner ── */}
      {authError && (
        <div className={`shrink-0 flex items-center justify-between px-4 py-2 border-b text-[12px] font-medium ${
          isLight
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-red-950/30 border-red-800/40 text-red-400"
        }`}>
          <span className="flex items-center gap-2">
            <span>🔑</span>
            <span>Google Sheets token expired — data cannot load until you reconnect.</span>
          </span>
          <button
            onClick={async () => {
              setAuthError(false);
              await handleGoogleSignIn?.();
              lastKeyRef.current = "";
              loadData();
            }}
            className="ml-4 flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold transition-colors whitespace-nowrap"
          >
            🔄 Reconnect Google
          </button>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className={`shrink-0 px-4 py-2 border-b ${bdr} ${isLight ? "bg-white" : "bg-[#0f0f0f]"} flex flex-wrap items-end gap-2`}>

        {/* Year */}
        <div className="flex flex-col gap-0.5">
          <span className={`text-[9px] font-semibold uppercase tracking-wider ${txt2}`}>Year</span>
          <select value={yearFilter}
            onChange={e => { setYearFilter(e.target.value); lastKeyRef.current = ""; }}
            className={`rounded-lg border text-xs px-2.5 py-1.5 outline-none transition-all ${inp} cursor-pointer`}
            style={{ minWidth: 90 }}
          >
            <option value="">All</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Week multi-select */}
        <div className="flex flex-col gap-0.5">
          <span className={`text-[9px] font-semibold uppercase tracking-wider ${txt2}`}>Week Range <span className="normal-case font-normal">(click to select multiple)</span></span>
          <div className="relative">
            <button
              onClick={() => setWeekDropOpen(o => !o)}
              className={`flex items-center gap-2 rounded-lg border text-xs px-2.5 py-1.5 outline-none transition-all ${inp} whitespace-nowrap`}
              style={{ minWidth: 200 }}
            >
              <span className="flex-1 text-left truncate">{weekLabel}</span>
              <span className={`text-[9px] ${txt2}`}>{weekDropOpen ? "▲" : "▼"}</span>
            </button>
            {weekDropOpen && (
              <div className={`absolute top-full left-0 mt-1 z-50 rounded-xl border shadow-2xl overflow-hidden ${bg} ${bdr}`}
                style={{ minWidth: 280, maxHeight: 340 }}>
                <div className={`flex items-center justify-between px-3 py-2 border-b ${bdr}`}>
                  <span className={`text-xs font-semibold ${txt}`}>Select Weeks</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setSelectedWeeks([]); lastKeyRef.current = ""; setWeekDropOpen(false); }}
                      className={`text-[11px] ${txt2} hover:text-green-500 transition-colors`}>Clear</button>
                    <button onClick={() => setWeekDropOpen(false)}
                      className="text-[11px] px-2 py-0.5 rounded bg-green-600 hover:bg-green-700 text-white font-medium transition-colors">Done</button>
                  </div>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
                  {filteredWeeks.map(w => (
                    <label key={w.weekNum}
                      className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-xs border-b ${tbBdr} ${tbRow}`}>
                      <input type="checkbox"
                        checked={selectedWeeks.includes(w.weekNum)}
                        onChange={() => toggleWeek(w.weekNum)}
                        className="accent-green-500 rounded"
                      />
                      <span className={txt3}>
                        <span className={`font-mono text-[10px] mr-1.5 ${txt2}`}>{w.weekNum}</span>
                        {w.label}
                      </span>
                    </label>
                  ))}
                  {filteredWeeks.length === 0 && (
                    <p className={`text-center py-6 text-xs ${txt2}`}>No weeks for selected year</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Name */}
        <div className="flex flex-col gap-0.5">
          <span className={`text-[9px] font-semibold uppercase tracking-wider ${txt2}`}>Name</span>
          <select value={nameFilter}
            onChange={e => { setNameFilter(e.target.value); lastKeyRef.current = ""; }}
            className={`rounded-lg border text-xs px-2.5 py-1.5 outline-none transition-all ${inp} cursor-pointer`}
            style={{ minWidth: 150 }}
          >
            <option value="">All Names</option>
            {contextNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Job */}
        <div className="flex flex-col gap-0.5">
          <span className={`text-[9px] font-semibold uppercase tracking-wider ${txt2}`}>Job / Location</span>
          <select value={jobFilter}
            onChange={e => { setJobFilter(e.target.value); lastKeyRef.current = ""; }}
            className={`rounded-lg border text-xs px-2.5 py-1.5 outline-none transition-all ${inp} cursor-pointer`}
            style={{ minWidth: 150 }}
          >
            <option value="">All Jobs</option>
            {contextJobs.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>

        {/* Specific date */}
        <div className="flex flex-col gap-0.5">
          <span className={`text-[9px] font-semibold uppercase tracking-wider ${txt2}`}>Specific Date</span>
          <input type="text" value={dateFilter}
            onChange={e => { setDateFilter(e.target.value); lastKeyRef.current = ""; }}
            placeholder="MM/DD/YYYY"
            className={`rounded-lg border text-xs px-2.5 py-1.5 outline-none transition-all ${inp}`}
            style={{ minWidth: 130 }}
          />
        </div>

        {/* Refresh + Actions */}
        <div className="flex items-end gap-1.5 pb-0">
          <button onClick={() => { lastKeyRef.current = ""; loadData(); }}
            className={`text-sm px-2 py-1.5 rounded-lg border transition-colors ${
              isLight ? "border-slate-200 text-slate-500 hover:text-green-600 hover:border-green-300" : "border-[#333] text-slate-500 hover:text-green-400 hover:border-green-700"
            }`} title="Refresh">
            ↻
          </button>
          <button onClick={openAddModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors shadow-sm whitespace-nowrap"
            style={{ background: "#1e7e4a" }}>
            + Add Record
          </button>
          <button
            onClick={() => { if (rows.length === 0) { showToast("No rows in current filter", "info"); return; } setActiveTab("detail"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
              isLight ? "border-red-200 text-red-500 hover:bg-red-50" : "border-red-900/50 text-red-400 hover:bg-red-900/20"
            }`}>
            🗑 Delete Record
          </button>
        </div>
      </div>

      {/* Click-outside to close week dropdown */}
      {weekDropOpen && <div className="fixed inset-0 z-40" onClick={() => setWeekDropOpen(false)} />}

      {/* ── KPI cards ── */}
      <div className={`shrink-0 grid grid-cols-4 gap-3 px-4 py-3 border-b ${bdr}`}>
        {[
          { label: "TOTAL HOURS",  value: fmtHrs(totals.hours),  subtitle: "Logged hrs",    color: "#3b82f6" },
          { label: "TOTAL AMOUNT", value: fmtAmt(totals.amount), subtitle: "Gross payroll", color: "#10b981" },
          { label: "ENTRIES",      value: String(kpiEntries),     subtitle: "Time records",  color: "#8b5cf6" },
          { label: "WORKERS",      value: String(kpiWorkers),     subtitle: "Unique names",  color: "#f59e0b" },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border ${bdr} px-4 py-3 ${bg3}`}>
            <p className={`text-[9px] font-bold uppercase tracking-widest ${txt2} mb-1`}>{k.label}</p>
            <p className="text-2xl font-bold leading-tight tabular-nums" style={{ color: k.color }}>{k.value}</p>
            <p className={`text-[10px] mt-0.5 ${txt2}`}>{k.subtitle}</p>
          </div>
        ))}
      </div>

      {/* ── Tab bar ── */}
      <div className={`shrink-0 flex items-center gap-0.5 px-4 pt-2 border-b ${bdr}`}>
        {([
          { id: "grouped", label: "📊  Weekly Summary" },
          { id: "pivot",   label: "📅  Summary by Date" },
          { id: "detail",  label: "📋  Detail Log" },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all border-b-2 -mb-px ${
              activeTab === t.id
                ? `border-green-500 ${isLight ? "text-green-700 bg-green-50" : "text-green-400 bg-green-950/20"}`
                : `border-transparent ${txt2} hover:${txt3}`
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-auto min-h-0 px-4 py-4">
        {activeTab === "grouped" && renderGrouped()}
        {activeTab === "pivot"   && renderPivot()}
        {activeTab === "detail"  && renderDetail()}
        {!dataLoaded && !loading && (
          <div className={`text-center py-20 ${txt2} text-sm`}>
            {getAccessToken() ? "Initializing…" : "Google sign-in required."}
          </div>
        )}
      </div>

      {/* ── Toasts ── */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`px-4 py-2.5 rounded-xl shadow-xl text-xs font-medium flex items-center gap-2 pointer-events-auto animate-in slide-in-from-right-5 ${
              t.type === "success" ? "bg-green-700 text-white"
              : t.type === "error" ? "bg-red-700 text-white"
              :                     "bg-slate-700 text-white"
            }`}>
            <span>{t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}</span>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Add Record Modal ── */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAddModalOpen(false)} />
          <div className={`relative z-10 rounded-2xl shadow-2xl border ${bdr} ${bg} w-full max-w-lg overflow-hidden`}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: "#1e4d2b", borderColor: "#155c33" }}>
              <div>
                <h2 className="font-bold text-sm text-white">Add New Record</h2>
                <p className="text-[11px] text-green-300 mt-0.5">Enter payroll, deduction, or non-payroll entry</p>
              </div>
              <button onClick={() => setAddModalOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-green-300 hover:text-white transition-colors text-base leading-none"
                style={{ background: "rgba(255,255,255,0.1)" }}>
                ×
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "65vh" }}>
              {renderForm()}
            </div>
            <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${bdr} ${bg3}`}>
              <button onClick={() => setAddModalOpen(false)}
                className={`text-xs px-4 py-2 rounded-lg border ${bdr} ${txt2} transition-colors`}>
                Cancel
              </button>
              <button onClick={submitAdd}
                className="text-xs px-5 py-2 rounded-lg text-white font-semibold transition-colors shadow-sm"
                style={{ background: "#1e7e4a" }}>
                Add Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Record Modal ── */}
      {editModalOpen && editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />
          <div className={`relative z-10 rounded-2xl shadow-2xl border ${bdr} ${bg} w-full max-w-lg overflow-hidden`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${bdr}`}>
              <div>
                <h2 className="font-bold text-sm text-blue-400">Edit Record</h2>
                <p className={`text-[11px] ${txt2} mt-0.5`}>{editingRow.name} · {editingRow.date}</p>
              </div>
              <button onClick={() => setEditModalOpen(false)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg ${bg3} ${txt2} transition-colors text-base leading-none`}>
                ×
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "65vh" }}>
              {renderForm()}
            </div>
            <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${bdr} ${bg3}`}>
              <button onClick={() => setEditModalOpen(false)}
                className={`text-xs px-4 py-2 rounded-lg border ${bdr} ${txt2} transition-colors`}>
                Cancel
              </button>
              <button onClick={submitEdit}
                className="text-xs px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors shadow-sm">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className={`relative z-10 rounded-2xl shadow-2xl border ${bdr} ${bg} w-full max-w-sm p-6`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl mb-4 ${isLight ? "bg-red-50" : "bg-red-900/20"}`}>
              🗑️
            </div>
            <h2 className="font-bold text-sm mb-1">Delete Record?</h2>
            <p className={`text-xs ${txt2} mb-5 leading-relaxed`}>
              This will permanently delete the entry for{" "}
              <strong className={txt}>{deleteConfirm.name}</strong> on{" "}
              <strong className={txt}>{deleteConfirm.date}</strong>{" "}
              ({deleteConfirm.job}). This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className={`text-xs px-4 py-2 rounded-lg border ${bdr} ${txt2} transition-colors`}>
                Cancel
              </button>
              <button onClick={confirmDelete}
                className="text-xs px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors">
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
