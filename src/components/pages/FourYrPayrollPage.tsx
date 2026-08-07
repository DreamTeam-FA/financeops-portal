/**
 * FourYrPayrollPage — Portal-integrated 4YouPros Payroll dashboard.
 * Matches the GAS Payroll Dashboard visually and functionally.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useFinance } from "../../context/FinanceContext";
import { getAccessToken } from "../../services/googleAuth";

const GAS_URL =
  "https://script.google.com/a/macros/marktimm.com/s/AKfycbxvL1T_dHYg7s2tQmlfen7Y-eeYT6cU-L3vjv8RJ51pJWu7CydOfT9YyUy0MUJEsyFi/exec";

const fmt2   = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtAmt = (n: number) => `$${fmt2(n)}`;
const fmtHrs = (n: number) => fmt2(n);

function today() {
  const d = new Date();
  return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
}
function currentYear() { return String(new Date().getFullYear()); }

// ── Company chip ──────────────────────────────────────────────────────────────
const CoChip: React.FC<{ co: string; isLight: boolean }> = ({ co, isLight }) => {
  const cfg =
    co === "4YR" ? { bg: isLight ? "#d1fae5" : "#064e2250", fg: isLight ? "#065f46" : "#34d399" } :
    co === "TI"  ? { bg: isLight ? "#fef3c7" : "#78350f50", fg: isLight ? "#92400e" : "#fbbf24" } :
                   { bg: isLight ? "#e2e8f0" : "#1e293b",   fg: isLight ? "#475569" : "#94a3b8" };
  return (
    <span style={{ background: cfg.bg, color: cfg.fg }}
      className="inline-block text-[9px] font-bold px-1.5 py-px rounded leading-tight whitespace-nowrap">
      {co}
    </span>
  );
};

// ── Flat table row types ──────────────────────────────────────────────────────
type TRow =
  | { type:"subcat";  key:string; companySpan:number; jobSpan:number; company:string; job:string; subCat:string; hours:number; amount:number; nameTotals:Record<string,{hrs:number;amt:number}>; isDeduction:boolean; isNonPayroll:boolean; scKey:string; scCollapsed:boolean }
  | { type:"daterow"; key:string; date:string; hours:number; amount:number; nameTotals:Record<string,{hrs:number;amt:number}> }
  | { type:"cototal"; key:string; company:string; hours:number; amount:number; nameTotals:Record<string,{hrs:number;amt:number}> };

function buildTableRows(companies: any[], collapsed: Record<string, boolean>): TRow[] {
  const out: TRow[] = [];
  for (const co of companies) {
    // total visible rows for this company (subcats + visible date rows)
    let coSpan = 0;
    for (const job of co.jobs)
      for (const sc of job.subCats) {
        coSpan++;
        if (!collapsed[`sc-${co.company}-${job.job}-${sc.subCat}`]) coSpan += sc.dateRows.length;
      }

    let firstCo = true;
    for (const job of co.jobs) {
      let jobSpan = 0;
      for (const sc of job.subCats) {
        jobSpan++;
        if (!collapsed[`sc-${co.company}-${job.job}-${sc.subCat}`]) jobSpan += sc.dateRows.length;
      }
      let firstJob = true;
      for (const sc of job.subCats) {
        const scKey = `sc-${co.company}-${job.job}-${sc.subCat}`;
        const scCollapsed = !!collapsed[scKey];
        out.push({ type:"subcat", key:scKey, companySpan: firstCo ? coSpan : 0, jobSpan: firstJob ? jobSpan : 0,
          company:co.company, job:job.job, subCat:sc.subCat||"—",
          hours:sc.hours, amount:sc.amount, nameTotals:sc.nameTotals||{},
          isDeduction:!!sc.isDeduction, isNonPayroll:!!sc.isNonPayroll, scKey, scCollapsed });
        firstCo = false; firstJob = false;
        if (!scCollapsed)
          for (const dr of sc.dateRows)
            out.push({ type:"daterow", key:`dr-${co.company}-${job.job}-${sc.subCat}-${dr.date}`,
              date:dr.date, hours:dr.hours, amount:dr.amount, nameTotals:dr.nameTotals||{} });
      }
    }
    out.push({ type:"cototal", key:`ct-${co.company}`, company:co.company,
      hours:co.hours, amount:co.amount, nameTotals:co.nameTotals||{} });
  }
  return out;
}

type Tab      = "grouped" | "pivot" | "detail";
type MainTab  = "payroll" | "project-total";

interface WeekMeta { weekNum:string; year:number; label:string; startDate:string; endDate:string }
interface RawRow {
  rowIndex:number; name:string; job:string; subCat:string; date:string; dateISO:string;
  started:string; finished:string; hoursRaw:number; hrsRed:boolean; rate:number;
  remarks:string; company:string; hours:number; total:number; variance:number; weekNum:string; mo:string;
}
type ToastType = "success"|"error"|"info";
interface Toast { id:number; msg:string; type:ToastType }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const show = useCallback((msg:string, type:ToastType="success") => {
    const id = ++idRef.current;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

// ─────────────────────────────────────────────────────────────────────────────
export function FourYrPayrollPage() {
  const { theme, handleGoogleSignIn } = useFinance() as any;
  const isLight = theme === "light";
  const { toasts, show: showToast } = useToast();

  const [authError,     setAuthError]     = useState(false);
  const [mainTab,       setMainTab]       = useState<MainTab>("payroll");
  const [activeTab,     setActiveTab]     = useState<Tab>("grouped");
  const [yearFilter,    setYearFilter]    = useState(currentYear());
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const [nameFilter,    setNameFilter]    = useState("");
  const [jobFilter,     setJobFilter]     = useState("");
  const [dateFilter,    setDateFilter]    = useState("");
  const [typeFilters,   setTypeFilters]   = useState<Set<string>>(new Set());
  const [loading,       setLoading]       = useState(false);
  const [dataLoaded,    setDataLoaded]    = useState(false);
  const [weekDropOpen,  setWeekDropOpen]  = useState(false);
  const [collapsed,     setCollapsed]     = useState<Record<string, boolean>>({});

  const [years,       setYears]       = useState<number[]>([]);
  const [allWeeks,    setAllWeeks]    = useState<WeekMeta[]>([]);
  const [allNames,    setAllNames]    = useState<string[]>([]);
  const [allJobs,     setAllJobs]     = useState<string[]>([]);
  const [weekContext, setWeekContext] = useState<Record<string, { names:string[]; jobs:string[] }>>({});

  const [rows,         setRows]         = useState<RawRow[]>([]);
  const [groupedPivot, setGroupedPivot] = useState<any>(null);
  const [weeklyPivot,  setWeeklyPivot]  = useState<any>(null);
  const [totals,       setTotals]       = useState({ hours:0, amount:0 });

  const [editingCell, setEditingCell] = useState<{ rowIndex:number; field:string }|null>(null);
  const [editVal,     setEditVal]     = useState("");
  const editInputRef                  = useRef<HTMLInputElement>(null);

  const [addModalOpen,   setAddModalOpen]   = useState(false);
  const [editModalOpen,  setEditModalOpen]  = useState(false);
  const [deleteConfirm,  setDeleteConfirm]  = useState<RawRow|null>(null);
  const [editingRow,     setEditingRow]     = useState<RawRow|null>(null);
  const [entryDropdowns, setEntryDropdowns] = useState<any>(null);
  const [form, setForm] = useState({
    name:"", job:"", subCat:"", date:"", started:"", finished:"",
    hours:"", remarks:"", amount:"", company:"", recordType:"payroll"
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const lastKeyRef  = useRef("");
  const prevYearRef = useRef(yearFilter);

  // ── API ───────────────────────────────────────────────────────────────────────
  const apiGet = useCallback(async (path: string) => {
    const tok = getAccessToken();
    const res = await fetch(path, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.status === 500) {
      try { const b = await res.clone().json();
        if (b?.error && /401|token|credential|auth/i.test(String(b.error))) { setAuthError(true); throw new Error("reconnect"); }
      } catch {}
    }
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
    return res.json();
  }, []);

  const apiPost = useCallback(async (path: string, body: any) => {
    const tok = getAccessToken();
    const res = await fetch(path, { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ ...body, accessToken: tok }) });
    if (res.status === 500) {
      try { const b = await res.clone().json();
        if (b?.error && /401|token|credential|auth/i.test(String(b.error))) { setAuthError(true); throw new Error("reconnect"); }
      } catch {}
    }
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
    return res.json();
  }, []);

  // ── Init dropdowns ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!getAccessToken()) return;
    apiGet("/api/4yr/dropdown-data").then(data => {
      setAuthError(false);
      setYears(data.years||[]); setAllWeeks(data.weeks||[]);
      setAllNames(data.names||[]); setAllJobs(data.jobs||[]);
      setWeekContext(data.weekContext||{});
      const now = new Date();
      const cur = (data.weeks as WeekMeta[]).find(w => {
        const s = new Date(w.startDate.replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2"));
        const e = new Date(w.endDate.replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2"));
        e.setHours(23,59,59,999); return now >= s && now <= e;
      });
      if (cur) setSelectedWeeks([cur.weekNum]);
    }).catch(e => { if (!e.message?.includes("reconnect")) showToast(`Dropdown load failed: ${e.message}`, "error"); });
  }, []); // eslint-disable-line

  // ── Load data ────────────────────────────────────────────────────────────────
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
        setRows(data.rows||[]); setGroupedPivot(data.groupedPivot||null);
        setWeeklyPivot(data.pivot||null); setTotals(data.totals||{hours:0,amount:0});
        setDataLoaded(true);
      } catch(e:any) { if (!e.message?.includes("reconnect")) showToast(`Load failed: ${e.message}`, "error"); }
      finally { setLoading(false); }
    }, 280);
  }, [yearFilter, selectedWeeks, nameFilter, jobFilter, dateFilter, apiPost]); // eslint-disable-line

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (prevYearRef.current !== yearFilter) { prevYearRef.current = yearFilter; setSelectedWeeks([]); }
  }, [yearFilter]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const filteredWeeks = useMemo(() =>
    yearFilter ? allWeeks.filter(w => String(w.year) === String(yearFilter)) : allWeeks,
    [allWeeks, yearFilter]);

  const contextNames = useMemo(() => {
    if (!selectedWeeks.length) return allNames;
    const s = new Set<string>(); selectedWeeks.forEach(wk => (weekContext[wk]?.names||[]).forEach(n => s.add(n)));
    return s.size ? [...s].sort() : allNames;
  }, [selectedWeeks, weekContext, allNames]);

  const contextJobs = useMemo(() => {
    if (!selectedWeeks.length) return allJobs;
    const s = new Set<string>(); selectedWeeks.forEach(wk => (weekContext[wk]?.jobs||[]).forEach(j => s.add(j)));
    return s.size ? [...s].sort() : allJobs;
  }, [selectedWeeks, weekContext, allJobs]);

  const kpiWorkers = useMemo(() => new Set(rows.map(r => r.name)).size, [rows]);

  const filteredGroupedPivot = useMemo(() => {
    if (!groupedPivot || typeFilters.size === 0) return groupedPivot;
    return { ...groupedPivot, companies: groupedPivot.companies.map((co:any) => ({
      ...co, jobs: co.jobs.map((job:any) => ({
        ...job, subCats: job.subCats.filter((sc:any) => {
          if (typeFilters.has("deduction")  && sc.isDeduction)                       return true;
          if (typeFilters.has("nonpayroll") && sc.isNonPayroll)                      return true;
          if (typeFilters.has("payroll")    && !sc.isDeduction && !sc.isNonPayroll)  return true;
          return false;
        })
      })).filter((j:any) => j.subCats.length > 0)
    })).filter((co:any) => co.jobs.length > 0) };
  }, [groupedPivot, typeFilters]);

  const tableRows = useMemo(() =>
    filteredGroupedPivot ? buildTableRows(filteredGroupedPivot.companies, collapsed) : [],
    [filteredGroupedPivot, collapsed]);

  // Project Total derived from rows
  const projectTotals = useMemo(() => {
    const map: Record<string, {job:string; hours:number; amount:number; names:Record<string,{hrs:number;amt:number}>}> = {};
    for (const row of rows) {
      if (!map[row.job]) map[row.job] = { job:row.job, hours:0, amount:0, names:{} };
      map[row.job].hours  += row.hours||0;
      map[row.job].amount += row.total||0;
      if (!map[row.job].names[row.name]) map[row.job].names[row.name] = {hrs:0, amt:0};
      map[row.job].names[row.name].hrs += row.hours||0;
      map[row.job].names[row.name].amt += row.total||0;
    }
    return Object.values(map).sort((a,b) => b.amount - a.amount);
  }, [rows]);

  const projectNames = useMemo(() => {
    const s = new Set<string>(); rows.forEach(r => s.add(r.name)); return [...s].sort();
  }, [rows]);

  const weekLabel = selectedWeeks.length === 0 ? "All Weeks"
    : selectedWeeks.length === 1
    ? (filteredWeeks.find(w => w.weekNum === selectedWeeks[0])?.label || selectedWeeks[0])
    : `${selectedWeeks.length} weeks selected`;

  // ── Collapse helpers ──────────────────────────────────────────────────────────
  const expandAll   = useCallback(() => setCollapsed({}), []);
  const collapseAll = useCallback(() => {
    if (!filteredGroupedPivot) return;
    const next: Record<string,boolean> = {};
    filteredGroupedPivot.companies.forEach((co:any) =>
      co.jobs.forEach((job:any) =>
        job.subCats.forEach((sc:any) => { next[`sc-${co.company}-${job.job}-${sc.subCat}`] = true; })));
    setCollapsed(next);
  }, [filteredGroupedPivot]);

  const toggleTypeFilter = useCallback((t:string) => {
    setTypeFilters(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });
  }, []);

  // ── Inline edit ───────────────────────────────────────────────────────────────
  const startEdit  = (ri:number, field:string, val:string) => { setEditingCell({rowIndex:ri,field}); setEditVal(val); setTimeout(()=>editInputRef.current?.focus(),30); };
  const cancelEdit = () => setEditingCell(null);
  const commitEdit = async () => {
    if (!editingCell) return;
    const { rowIndex, field } = editingCell; setEditingCell(null);
    try {
      if      (field==="remark") await apiPost("/api/4yr/save-remark", {rowIndex, remark:editVal});
      else if (field==="hours")  await apiPost("/api/4yr/save-hours",  {rowIndex, hours:parseFloat(editVal)||0});
      else if (field==="total")  await apiPost("/api/4yr/save-total",  {rowIndex, total:parseFloat(editVal)||0});
      else if (field==="job")    await apiPost("/api/4yr/save-job",    {rowIndex, job:editVal});
      showToast("Saved"); lastKeyRef.current = ""; loadData();
    } catch(e:any) { showToast(`Save failed: ${e.message}`, "error"); }
  };

  const resetFilters = () => {
    setYearFilter(currentYear()); setSelectedWeeks([]); setNameFilter(""); setJobFilter(""); setDateFilter("");
    lastKeyRef.current = "";
  };

  // ── Modal openers ─────────────────────────────────────────────────────────────
  const openAddModal = async () => {
    try {
      const d = await apiGet("/api/4yr/dropdown-data-for-entry");
      setEntryDropdowns(d);
      setForm({ name:"", job:"", subCat:"", date:today(), started:"", finished:"", hours:"", remarks:"", amount:"", company:"", recordType:"payroll" });
      setAddModalOpen(true);
    } catch(e:any) { showToast(`Form load failed: ${e.message}`, "error"); }
  };

  const openEditModal = async (row: RawRow) => {
    try {
      const d = await apiGet("/api/4yr/dropdown-data-for-entry");
      setEntryDropdowns(d); setEditingRow(row);
      const isDed    = row.total < 0 || /deduct|loan|rent|penalty|withhold/i.test(row.job+row.subCat);
      const isNonPay = !isDed && /reimburse|reimbursement|adjustment|allowance|bonus|incentive|extra|misc/i.test(row.subCat);
      setForm({ name:row.name, job:row.job, subCat:row.subCat, date:row.date, started:row.started,
        finished:row.finished, hours:String(row.hours||""), remarks:row.remarks,
        amount:String(Math.abs(row.total||0)), company:row.company,
        recordType: isDed ? "deduction" : isNonPay ? "nonpayroll" : "payroll" });
      setEditModalOpen(true);
    } catch(e:any) { showToast(`Edit form failed: ${e.message}`, "error"); }
  };

  const submitAdd = async () => {
    if (!form.name||!form.job) { showToast("Name and Job are required","error"); return; }
    try { await apiPost("/api/4yr/add-entry", form); showToast("Entry added"); setAddModalOpen(false); lastKeyRef.current=""; loadData(); }
    catch(e:any) { showToast(`Add failed: ${e.message}`,"error"); }
  };

  const submitEdit = async () => {
    if (!editingRow||!form.name||!form.job) { showToast("Name and Job are required","error"); return; }
    try { await apiPost("/api/4yr/save-edit", {...form, rowIndex:editingRow.rowIndex, hoursExplicitlyEdited:true}); showToast("Entry updated"); setEditModalOpen(false); lastKeyRef.current=""; loadData(); }
    catch(e:any) { showToast(`Edit failed: ${e.message}`,"error"); }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try { await apiPost("/api/4yr/delete-entry", {rowIndex:deleteConfirm.rowIndex}); showToast("Deleted"); setDeleteConfirm(null); lastKeyRef.current=""; loadData(); }
    catch(e:any) { showToast(`Delete failed: ${e.message}`,"error"); setDeleteConfirm(null); }
  };

  const toggleWeek = (wk:string) => { setSelectedWeeks(prev => prev.includes(wk) ? prev.filter(x=>x!==wk) : [...prev,wk]); lastKeyRef.current=""; };
  const isNoTime = form.recordType === "deduction" || form.recordType === "nonpayroll";

  // ── Theme tokens (neutral, not overriding GAS-matched inline styles) ─────────
  const bg   = isLight ? "bg-white"     : "bg-[#0f0f0f]";
  const bg2  = isLight ? "bg-slate-50"  : "bg-[#111]";
  const bg3  = isLight ? "bg-slate-100" : "bg-[#1a1a1a]";
  const bdr  = isLight ? "border-slate-200" : "border-[#272727]";
  const txt  = isLight ? "text-slate-900"   : "text-slate-100";
  const txt2 = isLight ? "text-slate-500"   : "text-slate-400";
  const txt3 = isLight ? "text-slate-700"   : "text-slate-300";
  const inp  = isLight
    ? "bg-white border-slate-200 text-slate-900 focus:border-[#2d6a4f] focus:ring-1 focus:ring-[#2d6a4f]/20"
    : "bg-[#1c1c1c] border-[#333] text-slate-100 focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80]/20";
  const tbBdr = isLight ? "border-slate-200" : "border-[#1e1e1e]";
  const tbRow = isLight ? "hover:bg-slate-50" : "hover:bg-[#181818]";
  const btnCls = isLight
    ? "border-slate-300 bg-white text-slate-600 hover:border-[#2d6a4f] hover:text-[#2d6a4f]"
    : "border-[#333] bg-[#1a1a1a] text-slate-400 hover:border-[#4ade80] hover:text-[#4ade80]";

  // GAS table palette
  const TH1  = "#2d6a4f";
  const TH2bg = isLight ? "#a8d8b0" : "#1a3320";
  const TH2fg = isLight ? "#374151" : "#9ca3af";
  const COcell = { bg: isLight ? "#e8f5e9" : "#0f2318", fg: isLight ? "#166534" : "#6ee7b7", bdr: isLight ? "#c8e6c9" : "#1a3320" };
  const JOBcell = { bg: isLight ? "#f0fdf4" : "#0a1f10", fg: isLight ? "#374151" : "#d1fae5", bdr: isLight ? "#dcfce7" : "#1a3320" };
  const COTOTbg = isLight ? "#c8e6c9" : "#0c2016";
  const COTOTfg = isLight ? "#15803d" : "#34d399";

  // ── RENDERERS ─────────────────────────────────────────────────────────────────

  const renderGrouped = () => {
    if (!filteredGroupedPivot) return null;
    const { names, grandTotal } = filteredGroupedPivot;
    const nCols = names.length; // each name has 2 columns (Hrs + Amt)

    return (
      <div className="flex flex-col gap-3">
        {/* Section header */}
        <div className={`flex flex-col gap-2 pb-2.5 border-b ${bdr}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold text-sm ${txt}`}>Weekly Summary</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${isLight ? "bg-green-100 text-green-700" : "bg-green-900/40 text-green-400"}`}>{weekLabel}</span>
            <span className={`text-[10px] ml-auto italic ${txt2}`}>* click a cell to edit inline</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={expandAll}   className={`text-[11px] px-2.5 py-1 rounded border font-medium transition-colors ${btnCls}`}>⊞ Expand All</button>
            <button onClick={collapseAll} className={`text-[11px] px-2.5 py-1 rounded border font-medium transition-colors ${btnCls}`}>⊟ Collapse All</button>
            <span className={`mx-0.5 ${txt2}`}>|</span>
            {[{k:"payroll",l:"Payroll"},{k:"deduction",l:"Deduction"},{k:"nonpayroll",l:"Non-Payroll"}].map(t => (
              <label key={t.k} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={typeFilters.has(t.k)} onChange={() => toggleTypeFilter(t.k)} className="w-3.5 h-3.5 accent-green-600" />
                <span className={`text-[11px] ${typeFilters.has(t.k) ? (isLight?"text-green-700":"text-green-400") : txt2}`}>{t.l}</span>
              </label>
            ))}
            {typeFilters.size > 0 && <button onClick={() => setTypeFilters(new Set())} className={`text-[10px] ${txt2} hover:text-red-500 transition-colors`}>clear</button>}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ minWidth:"100%", tableLayout:"auto" }}>
            <thead>
              {/* Row 1 – employee name headers */}
              <tr style={{ background: TH1 }}>
                <th colSpan={3} className="text-left px-3 py-2 font-bold text-[11px] text-white uppercase tracking-wide" style={{ minWidth:370 }}>Name</th>
                {names.map((n:string) => (
                  <th key={n} colSpan={2} className="text-center px-2 py-2 font-bold text-[11px] text-white border-l border-white/20" style={{ minWidth:160 }}>{n}</th>
                ))}
                <th colSpan={2} className="text-center px-2 py-2 font-bold text-[11px] text-white border-l border-white/20" style={{ minWidth:160 }}>Grand Total</th>
              </tr>
              {/* Row 2 – column sub-headers */}
              <tr style={{ background: TH2bg }}>
                <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color:TH2fg, minWidth:100 }}>Company</th>
                <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color:TH2fg, minWidth:130 }}>Job</th>
                <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color:TH2fg, minWidth:140 }}>Sub Cat</th>
                {names.map((n:string) => (
                  <React.Fragment key={n}>
                    <th className="text-right px-2 py-1.5 text-[10px] font-medium border-l border-black/10" style={{ color:TH2fg, minWidth:70 }}>Hrs</th>
                    <th className="text-right px-2 py-1.5 text-[10px] font-medium" style={{ color:TH2fg, minWidth:90 }}>Amount</th>
                  </React.Fragment>
                ))}
                <th className="text-right px-2 py-1.5 text-[10px] font-bold border-l border-black/10" style={{ color:TH2fg, minWidth:70 }}>Hrs</th>
                <th className="text-right px-3 py-1.5 text-[10px] font-bold" style={{ color:TH2fg, minWidth:90 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(row => {
                // ── Subcat row ──
                if (row.type === "subcat") {
                  const isDed    = row.isDeduction;
                  const isNonPay = row.isNonPayroll;
                  const amtFg    = isDed ? "#dc2626" : isNonPay ? (isLight?"#0369a1":"#38bdf8") : (isLight?"#1f2937":"#e2e8f0");
                  const scFg     = row.scCollapsed ? "#d97706" : amtFg;
                  return (
                    <tr key={row.key} className={`border-t ${tbBdr}`} style={{ background: isLight?"#ffffff":"#0f0f0f" }}>
                      {row.companySpan > 0 && (
                        <td rowSpan={row.companySpan} className="px-3 py-2 font-bold text-[11px] align-top border-r"
                          style={{ background:COcell.bg, color:COcell.fg, borderColor:COcell.bdr, minWidth:100 }}>
                          {row.company}
                        </td>
                      )}
                      {row.jobSpan > 0 && (
                        <td rowSpan={row.jobSpan} className="px-2 py-1.5 text-[11px] align-top border-r"
                          style={{ background:JOBcell.bg, color:JOBcell.fg, borderColor:JOBcell.bdr, minWidth:130 }}>
                          {row.job}
                        </td>
                      )}
                      <td className="px-2 py-1.5 cursor-pointer select-none" style={{ minWidth:140 }}
                        onClick={() => setCollapsed(c => ({...c, [row.scKey]: !c[row.scKey]}))}>
                        <span style={{ color:scFg }} className={row.scCollapsed ? "font-semibold" : ""}>
                          <span className="text-[9px] mr-1">{row.scCollapsed ? "▶" : "▼"}</span>
                          {row.subCat}
                          {!row.scCollapsed && isDed    && <span className="ml-1.5 text-[8px] px-1 py-px rounded" style={{background:"#fee2e2",color:"#dc2626"}}>deduct</span>}
                          {!row.scCollapsed && isNonPay && <span className="ml-1.5 text-[8px] px-1 py-px rounded" style={{background:"#e0f2fe",color:"#0369a1"}}>non-pay</span>}
                        </span>
                      </td>
                      {names.map((n:string) => (
                        <React.Fragment key={n}>
                          <td className="text-right px-2 py-1.5 tabular-nums border-l" style={{ borderColor:isLight?"#e5e7eb":"#1e1e1e", color:isLight?"#374151":"#d1d5db" }}>
                            {row.nameTotals[n]?.hrs ? fmtHrs(row.nameTotals[n].hrs) : <span style={{opacity:0.2}}>—</span>}
                          </td>
                          <td className="text-right px-2 py-1.5 tabular-nums" style={{ color:amtFg }}>
                            {row.nameTotals[n]?.amt ? fmtAmt(row.nameTotals[n].amt) : <span style={{opacity:0.2}}>—</span>}
                          </td>
                        </React.Fragment>
                      ))}
                      <td className="text-right px-2 py-1.5 tabular-nums font-semibold border-l" style={{ borderColor:isLight?"#e5e7eb":"#1e1e1e", color:isLight?"#1f2937":"#f3f4f6" }}>
                        {fmtHrs(row.hours)}
                      </td>
                      <td className="text-right px-3 py-1.5 tabular-nums font-semibold" style={{ color:amtFg }}>
                        {fmtAmt(row.amount)}
                      </td>
                    </tr>
                  );
                }

                // ── Date row ──
                if (row.type === "daterow") {
                  return (
                    <tr key={row.key} className={`border-t ${tbBdr}`} style={{ background: isLight?"#fafafa":"#0d0d0d" }}>
                      <td className="px-2 py-1 text-[10px] italic pl-8" style={{ color:isLight?"#9ca3af":"#6b7280" }}>{row.date}</td>
                      {names.map((n:string) => (
                        <React.Fragment key={n}>
                          <td className="text-right px-2 py-1 tabular-nums text-[10px] border-l" style={{ borderColor:isLight?"#e5e7eb":"#1e1e1e", color:isLight?"#9ca3af":"#6b7280" }}>
                            {row.nameTotals[n]?.hrs ? fmtHrs(row.nameTotals[n].hrs) : ""}
                          </td>
                          <td className="text-right px-2 py-1 tabular-nums text-[10px]" style={{ color:isLight?"#9ca3af":"#6b7280" }}>
                            {row.nameTotals[n]?.amt ? fmtAmt(row.nameTotals[n].amt) : ""}
                          </td>
                        </React.Fragment>
                      ))}
                      <td className="text-right px-2 py-1 tabular-nums text-[10px] border-l" style={{ borderColor:isLight?"#e5e7eb":"#1e1e1e", color:isLight?"#9ca3af":"#6b7280" }}>{fmtHrs(row.hours)}</td>
                      <td className="text-right px-3 py-1 tabular-nums text-[10px]" style={{ color:isLight?"#9ca3af":"#6b7280" }}>{fmtAmt(row.amount)}</td>
                    </tr>
                  );
                }

                // ── Company total row ──
                if (row.type === "cototal") {
                  return (
                    <tr key={row.key} className="border-t-2" style={{ background:COTOTbg, borderTopColor: isLight?"#86efac":"#166534" }}>
                      <td colSpan={3} className="px-3 py-2 font-bold text-[11px]" style={{ color:COTOTfg }}>
                        {row.company} Total
                      </td>
                      {names.map((n:string) => (
                        <React.Fragment key={n}>
                          <td className="text-right px-2 py-2 tabular-nums font-semibold border-l" style={{ borderColor:isLight?"#a7d7a9":"#1a3320", color:COTOTfg }}>
                            {row.nameTotals[n]?.hrs ? fmtHrs(row.nameTotals[n].hrs) : <span style={{opacity:0.35}}>—</span>}
                          </td>
                          <td className="text-right px-2 py-2 tabular-nums font-semibold" style={{ color:COTOTfg }}>
                            {row.nameTotals[n]?.amt ? fmtAmt(row.nameTotals[n].amt) : <span style={{opacity:0.35}}>—</span>}
                          </td>
                        </React.Fragment>
                      ))}
                      <td className="text-right px-2 py-2 tabular-nums font-bold border-l" style={{ borderColor:isLight?"#a7d7a9":"#1a3320", color:COTOTfg }}>{fmtHrs(row.hours)}</td>
                      <td className="text-right px-3 py-2 tabular-nums font-bold" style={{ color:COTOTfg }}>{fmtAmt(row.amount)}</td>
                    </tr>
                  );
                }
                return null;
              })}

              {/* Grand total */}
              <tr style={{ background: TH1 }}>
                <td colSpan={3} className="px-3 py-2.5 font-bold text-[11px] text-white uppercase tracking-wide">Grand Total</td>
                {filteredGroupedPivot.names.map((n:string) => (
                  <React.Fragment key={n}>
                    <td className="text-right px-2 py-2.5 tabular-nums font-semibold text-white border-l border-white/20">
                      {grandTotal.nameTotals[n]?.hrs ? fmtHrs(grandTotal.nameTotals[n].hrs) : <span style={{opacity:0.4}}>—</span>}
                    </td>
                    <td className="text-right px-2 py-2.5 tabular-nums font-semibold text-white">
                      {grandTotal.nameTotals[n]?.amt ? fmtAmt(grandTotal.nameTotals[n].amt) : <span style={{opacity:0.4}}>—</span>}
                    </td>
                  </React.Fragment>
                ))}
                <td className="text-right px-2 py-2.5 tabular-nums font-bold text-white border-l border-white/20">{fmtHrs(grandTotal.hours)}</td>
                <td className="text-right px-3 py-2.5 tabular-nums font-bold text-white">{fmtAmt(grandTotal.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderPivot = () => {
    if (!weeklyPivot) return null;
    const { names, dates, matrix, nameTotals, grandTotal } = weeklyPivot;
    return (
      <div className="flex flex-col gap-3">
        <div className={`pb-2 border-b ${bdr}`}>
          <span className={`font-bold text-sm ${txt}`}>Summary by Date</span>
          <span className={`ml-2 text-xs ${txt2}`}>{weekLabel}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: TH1 }}>
                <th className="text-left px-3 py-2 text-[10px] font-bold text-white uppercase tracking-wide sticky left-0 z-10" style={{ background:TH1, minWidth:110 }}>Date</th>
                {names.map((n:string) => <th key={n} className="text-right px-2 py-2 text-[11px] font-bold text-white border-l border-white/20" style={{ minWidth:90 }}>{n.split(" ")[0]}</th>)}
                <th className="text-right px-2 py-2 text-[10px] font-bold text-white border-l border-white/20" style={{ minWidth:90 }}>Total Hrs</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold text-white border-l border-white/20" style={{ minWidth:100 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((d:string) => {
                const rh = names.reduce((s:number,n:string) => s+(matrix[d]?.[n]?.hours||0),0);
                const ra = names.reduce((s:number,n:string) => s+(matrix[d]?.[n]?.amount||0),0);
                return (
                  <tr key={d} className={`border-t ${tbBdr} ${tbRow}`}>
                    <td className={`px-3 py-1.5 sticky left-0 ${bg2} font-medium tabular-nums ${txt3}`}>{d}</td>
                    {names.map((n:string) => (
                      <td key={n} className={`text-right px-2 py-1.5 tabular-nums ${txt3}`}>
                        {matrix[d]?.[n]?.hours ? fmtHrs(matrix[d][n].hours) : <span style={{opacity:0.2}}>—</span>}
                      </td>
                    ))}
                    <td className={`text-right px-2 py-1.5 tabular-nums font-semibold ${txt}`}>{fmtHrs(rh)}</td>
                    <td className={`text-right px-3 py-1.5 tabular-nums font-semibold ${ra<0?"text-red-500":"text-green-600"}`}>{fmtAmt(ra)}</td>
                  </tr>
                );
              })}
              <tr style={{ background: TH1 }}>
                <td className="px-3 py-2 text-[10px] text-white font-bold uppercase tracking-wide">Total Hrs</td>
                {names.map((n:string) => <td key={n} className="text-right px-2 py-2 tabular-nums text-white font-semibold">{fmtHrs(nameTotals[n]?.hours||0)}</td>)}
                <td className="text-right px-2 py-2 tabular-nums text-white font-bold border-l border-white/20">{fmtHrs(grandTotal.hours)}</td>
                <td />
              </tr>
              <tr style={{ background: COTOTbg }}>
                <td className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide" style={{color:COTOTfg}}>Amount</td>
                {names.map((n:string) => <td key={n} className="text-right px-2 py-2 tabular-nums font-semibold" style={{color:COTOTfg}}>{fmtAmt(nameTotals[n]?.amount||0)}</td>)}
                <td />
                <td className="text-right px-3 py-2 tabular-nums font-bold border-l" style={{borderColor:isLight?"#a7d7a9":"#1a3320",color:COTOTfg}}>{fmtAmt(grandTotal.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderDetail = () => (
    <div className="flex flex-col gap-3">
      <div className={`pb-2 border-b ${bdr}`}>
        <span className={`font-bold text-sm ${txt}`}>Detail Log</span>
        <span className={`ml-2 text-xs ${txt2}`}>{rows.length} records · {weekLabel}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ background: TH1 }}>
              {["Date","Name","Job","Sub Cat","Start","End","Hrs","Rate","Amount","Co","Remarks","Edit"].map((h,i) => (
                <th key={h} className={`py-2 text-[10px] font-bold text-white uppercase tracking-wide ${i===0?"text-left px-3":"i===11"?"text-center px-2":"text-left px-2"}`}
                  style={{ minWidth: [100,130,130,110,80,80,65,75,90,50,160,56][i] }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isEJ   = editingCell?.rowIndex === row.rowIndex;
              const isEHrs = isEJ && editingCell?.field === "hours";
              const isEAmt = isEJ && editingCell?.field === "total";
              const isERmk = isEJ && editingCell?.field === "remark";
              const isEJob = isEJ && editingCell?.field === "job";
              const isDed  = row.total < 0 || /deduct|loan|rent|penalty|withhold/i.test(row.job+row.subCat);
              const amtCls = isDed ? "text-red-500 font-semibold" : "text-green-600 font-semibold";
              return (
                <tr key={row.rowIndex} className={`border-t ${tbBdr} ${tbRow}`}>
                  <td className={`px-3 py-1.5 tabular-nums text-[11px] ${txt2}`}>{row.date}</td>
                  <td className={`px-2 py-1.5 font-medium ${txt3}`}>{row.name}</td>
                  <td className="px-2 py-1.5">
                    {isEJob
                      ? <input ref={editInputRef} value={editVal} className={`w-full rounded border text-xs px-1.5 py-0.5 outline-none ${inp}`}
                          onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit}
                          onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} />
                      : <span className={`cursor-text hover:underline decoration-dashed ${txt3}`} onClick={()=>startEdit(row.rowIndex,"job",row.job)}>{row.job}</span>}
                  </td>
                  <td className={`px-2 py-1.5 ${txt2}`}>{row.subCat}</td>
                  <td className={`px-2 py-1.5 tabular-nums ${txt2}`}>{row.started}</td>
                  <td className={`px-2 py-1.5 tabular-nums ${txt2}`}>{row.finished}</td>
                  <td className="text-right px-2 py-1.5">
                    {isEHrs
                      ? <input ref={editInputRef} value={editVal} className={`w-14 rounded border text-xs px-1 py-0.5 text-right outline-none ${inp}`}
                          onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit}
                          onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} />
                      : <span className={`cursor-text hover:underline decoration-dashed tabular-nums ${row.hrsRed?"text-red-500":txt3}`}
                          onClick={()=>startEdit(row.rowIndex,"hours",String(row.hours))}>{fmtHrs(row.hours)}</span>}
                  </td>
                  <td className={`text-right px-2 py-1.5 tabular-nums ${txt2}`}>{row.rate ? `$${fmt2(row.rate)}/hr` : "—"}</td>
                  <td className="text-right px-2 py-1.5">
                    {isEAmt
                      ? <input ref={editInputRef} value={editVal} className={`w-20 rounded border text-xs px-1 py-0.5 text-right outline-none ${inp}`}
                          onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit}
                          onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} />
                      : <span className={`cursor-text hover:underline decoration-dashed tabular-nums ${amtCls}`}
                          onClick={()=>startEdit(row.rowIndex,"total",String(row.total))}>{fmtAmt(row.total)}</span>}
                  </td>
                  <td className="text-center px-2 py-1.5">{row.company && <CoChip co={row.company} isLight={isLight} />}</td>
                  <td className="px-2 py-1.5">
                    {isERmk
                      ? <input ref={editInputRef} value={editVal} className={`w-full rounded border text-xs px-1.5 py-0.5 outline-none ${inp}`}
                          onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit}
                          onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} />
                      : <span className={`cursor-text hover:underline decoration-dashed text-[11px] ${row.remarks?"text-amber-500":txt2}`}
                          onClick={()=>startEdit(row.rowIndex,"remark",row.remarks)}>
                          {row.remarks || <em className="opacity-40">add note…</em>}
                        </span>}
                  </td>
                  <td className="text-center px-2 py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={()=>openEditModal(row)} className={`w-6 h-6 flex items-center justify-center rounded text-[11px] ${isLight?"bg-blue-50 text-blue-600 hover:bg-blue-100":"bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"}`} title="Edit">✏️</button>
                      <button onClick={()=>setDeleteConfirm(row)} className={`w-6 h-6 flex items-center justify-center rounded text-[11px] ${isLight?"bg-red-50 text-red-500 hover:bg-red-100":"bg-red-500/10 text-red-400 hover:bg-red-500/20"}`} title="Delete">🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={12} className={`text-center py-12 text-sm ${txt2}`}>{dataLoaded ? "No records match current filters." : "Loading…"}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderProjectTotal = () => {
    const grandHrs = projectTotals.reduce((s,p)=>s+p.hours,0);
    const grandAmt = projectTotals.reduce((s,p)=>s+p.amount,0);
    if (projectTotals.length === 0)
      return <div className={`text-center py-20 text-sm ${txt2}`}>{dataLoaded?"No data for selected filters.":"Loading…"}</div>;
    return (
      <div className="flex flex-col gap-3">
        <div className={`pb-2 border-b ${bdr}`}>
          <span className={`font-bold text-sm ${txt}`}>Project Total</span>
          <span className={`ml-2 text-xs ${txt2}`}>{weekLabel} · {projectTotals.length} projects</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: TH1 }}>
                <th className="text-left px-3 py-2 text-[11px] font-bold text-white uppercase tracking-wide" style={{ minWidth:180 }}>Job / Location</th>
                {projectNames.map(n => (
                  <th key={n} className="text-right px-2 py-2 text-[11px] font-bold text-white border-l border-white/20" style={{ minWidth:90 }}>{n.split(" ")[0]}</th>
                ))}
                <th className="text-right px-2 py-2 text-[10px] font-bold text-white border-l border-white/20" style={{ minWidth:80 }}>Total Hrs</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold text-white border-l border-white/20" style={{ minWidth:100 }}>Total Amt</th>
              </tr>
            </thead>
            <tbody>
              {projectTotals.map(proj => {
                const isNeg = proj.amount < 0;
                return (
                  <tr key={proj.job} className={`border-t ${tbBdr} ${tbRow}`}>
                    <td className={`px-3 py-1.5 font-medium ${txt3}`}>{proj.job}</td>
                    {projectNames.map(n => {
                      const e = proj.names[n];
                      return (
                        <td key={n} className={`text-right px-2 py-1.5 tabular-nums border-l ${tbBdr} ${txt2}`}>
                          {e ? fmtAmt(e.amt) : <span style={{opacity:0.2}}>—</span>}
                        </td>
                      );
                    })}
                    <td className={`text-right px-2 py-1.5 tabular-nums font-semibold border-l ${tbBdr} ${txt3}`}>{fmtHrs(proj.hours)}</td>
                    <td className={`text-right px-3 py-1.5 tabular-nums font-semibold ${isNeg?"text-red-500":"text-green-600"}`}>{fmtAmt(proj.amount)}</td>
                  </tr>
                );
              })}
              <tr style={{ background: TH1 }}>
                <td className="px-3 py-2 text-[11px] font-bold text-white uppercase tracking-wide">Grand Total</td>
                {projectNames.map(n => <td key={n} className="text-right px-2 py-2 tabular-nums text-white border-l border-white/20">{fmtAmt(projectTotals.reduce((s,p)=>s+(p.names[n]?.amt||0),0))}</td>)}
                <td className="text-right px-2 py-2 tabular-nums font-bold text-white border-l border-white/20">{fmtHrs(grandHrs)}</td>
                <td className="text-right px-3 py-2 tabular-nums font-bold text-white border-l border-white/20">{fmtAmt(grandAmt)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Entry form (unchanged) ────────────────────────────────────────────────────
  const renderForm = () => (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={`block text-[11px] font-semibold mb-1.5 ${txt2} uppercase tracking-wide`}>Record Type</label>
        <div className={`flex gap-1 p-1 rounded-lg ${bg3}`}>
          {[{v:"payroll",l:"Payroll"},{v:"deduction",l:"Deduction"},{v:"nonpayroll",l:"Non-Payroll"}].map(rt => (
            <label key={rt.v} className="flex-1">
              <input type="radio" name="recordType" value={rt.v} checked={form.recordType===rt.v}
                onChange={()=>setForm(f=>({...f,recordType:rt.v}))} className="sr-only" />
              <span className={`flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all ${form.recordType===rt.v?"text-white shadow-sm":"text-slate-400"}`}
                style={form.recordType===rt.v?{background:"#2d6a4f"}:{}}>
                {rt.l}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Employee Name *</label>
        <input list="en-names" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
          className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none ${inp}`} placeholder="Employee name" />
        <datalist id="en-names">{(entryDropdowns?.names||[]).map((n:string)=><option key={n} value={n}/>)}</datalist>
      </div>
      <div>
        <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Job / Location *</label>
        <input list="en-jobs" value={form.job} onChange={e=>setForm(f=>({...f,job:e.target.value}))}
          className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none ${inp}`} placeholder="Job / location" />
        <datalist id="en-jobs">{(entryDropdowns?.jobs||[]).map((j:string)=><option key={j} value={j}/>)}</datalist>
      </div>
      <div>
        <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Sub Category</label>
        <input list="en-subs" value={form.subCat} onChange={e=>setForm(f=>({...f,subCat:e.target.value}))}
          className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none ${inp}`} placeholder="Optional" />
        <datalist id="en-subs">{(entryDropdowns?.subCats||[]).map((s:string)=><option key={s} value={s}/>)}</datalist>
      </div>
      <div>
        <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Date</label>
        <input type="text" value={form.date} placeholder="MM/DD/YYYY" onChange={e=>setForm(f=>({...f,date:e.target.value}))}
          className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none ${inp}`} />
      </div>
      {!isNoTime && (<>
        <div>
          <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Started</label>
          <input type="text" value={form.started} placeholder="HH:MM AM/PM" onChange={e=>setForm(f=>({...f,started:e.target.value}))}
            className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none ${inp}`} />
        </div>
        <div>
          <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Finished</label>
          <input type="text" value={form.finished} placeholder="HH:MM AM/PM" onChange={e=>setForm(f=>({...f,finished:e.target.value}))}
            className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none ${inp}`} />
        </div>
        <div>
          <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Hours Override</label>
          <input type="number" value={form.hours} step="0.01" onChange={e=>setForm(f=>({...f,hours:e.target.value}))}
            className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none ${inp}`} placeholder="Leave blank to auto-calculate" />
        </div>
      </>)}
      {isNoTime && (
        <div>
          <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Amount ($)</label>
          <input type="number" value={form.amount} step="0.01" onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
            className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none ${inp}`} placeholder="0.00" />
        </div>
      )}
      <div className="col-span-2">
        <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Remarks</label>
        <input type="text" value={form.remarks} onChange={e=>setForm(f=>({...f,remarks:e.target.value}))}
          className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none ${inp}`} placeholder="Optional" />
      </div>
      <div className="col-span-2">
        <label className={`block text-[11px] font-semibold mb-1 ${txt2}`}>Company Override</label>
        <input list="en-cos" value={form.company} onChange={e=>setForm(f=>({...f,company:e.target.value}))}
          className={`w-full rounded-lg border text-xs px-2.5 py-2 outline-none ${inp}`} placeholder="Optional — auto-detected from employee" />
        <datalist id="en-cos">{(entryDropdowns?.companies||[]).map((c:string)=><option key={c} value={c}/>)}</datalist>
      </div>
    </div>
  );

  // ── MAIN RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col h-full overflow-hidden ${bg} ${txt}`}>

      {/* ── Header bar ── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5" style={{ background:"#1e4d2b" }}>
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg flex flex-col items-center justify-center text-white font-black leading-none"
              style={{ background:"#155c33", fontSize:11 }}>
              <span>4YR</span>
            </div>
            <div>
              <div className="text-white font-bold text-[15px] leading-tight">4YouPros</div>
              <div className="text-green-300 text-[10px] leading-tight tracking-wide">Payroll Dashboard</div>
            </div>
          </div>
          {selectedWeeks.length > 0 && (
            <span className="text-[10px] px-2.5 py-0.5 rounded-full font-medium text-white/90"
              style={{ background:"rgba(255,255,255,0.15)" }}>{weekLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-[11px] text-green-300 animate-pulse">Refreshing…</span>}
          <a href={GAS_URL} target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-green-200 hover:text-white transition-colors font-medium flex items-center gap-1">
            Open GAS ↗
          </a>
          <span className="text-green-600 text-[10px] hidden lg:block">© Made by Finance Team</span>
        </div>
      </div>

      {/* ── Auth error ── */}
      {authError && (
        <div className={`shrink-0 flex items-center justify-between px-4 py-2 border-b text-xs font-medium ${isLight?"bg-red-50 border-red-200 text-red-700":"bg-red-950/30 border-red-800/40 text-red-400"}`}>
          <span className="flex items-center gap-2">🔑 Google Sheets token expired — reconnect to load data.</span>
          <button onClick={async()=>{ setAuthError(false); await handleGoogleSignIn?.(); lastKeyRef.current=""; loadData(); }}
            className="ml-4 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold transition-colors whitespace-nowrap">
            🔄 Reconnect Google
          </button>
        </div>
      )}

      {/* ── Secondary nav: Payroll | Project Total ── */}
      <div className={`shrink-0 flex items-center gap-0 px-4 border-b ${bdr} ${isLight?"bg-white":"bg-[#0f0f0f]"}`}>
        {([{id:"payroll",label:"📊 Payroll"},{id:"project-total",label:"📋 Project Total"}] as {id:MainTab;label:string}[]).map(t => (
          <button key={t.id} onClick={() => setMainTab(t.id)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-all ${
              mainTab === t.id
                ? "border-green-600 text-green-700 dark:text-green-400"
                : `border-transparent ${txt2}`
            }`} style={mainTab===t.id?{borderBottomColor:"#2d6a4f",color:isLight?"#166534":"#4ade80"}:{}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div className={`shrink-0 px-4 py-2 border-b ${bdr} flex flex-wrap items-end gap-2.5`}>
        <div className="flex flex-col gap-0.5">
          <span className={`text-[9px] font-bold uppercase tracking-widest ${txt2}`}>Year</span>
          <select value={yearFilter} onChange={e=>{setYearFilter(e.target.value);lastKeyRef.current="";}}
            className={`rounded border text-xs px-2 py-1.5 outline-none ${inp} cursor-pointer`} style={{minWidth:80}}>
            <option value="">All</option>
            {years.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={`text-[9px] font-bold uppercase tracking-widest ${txt2}`}>Week Range <span className="normal-case font-normal opacity-70">(click to select multiple)</span></span>
          <div className="relative">
            <button onClick={()=>setWeekDropOpen(o=>!o)}
              className={`flex items-center gap-2 rounded border text-xs px-2 py-1.5 outline-none ${inp} whitespace-nowrap`} style={{minWidth:200}}>
              <span className="flex-1 text-left truncate">{weekLabel}</span>
              <span className={`text-[9px] ${txt2}`}>{weekDropOpen?"▲":"▼"}</span>
            </button>
            {weekDropOpen && (
              <div className={`absolute top-full left-0 mt-1 z-50 rounded-xl border shadow-2xl overflow-hidden ${bg} ${bdr}`} style={{minWidth:280,maxHeight:340}}>
                <div className={`flex items-center justify-between px-3 py-2 border-b ${bdr}`}>
                  <span className={`text-xs font-semibold ${txt}`}>Select Weeks</span>
                  <div className="flex gap-2">
                    <button onClick={()=>{setSelectedWeeks([]);lastKeyRef.current="";setWeekDropOpen(false);}} className={`text-[11px] ${txt2} hover:text-red-500`}>Clear</button>
                    <button onClick={()=>setWeekDropOpen(false)} className="text-[11px] px-2 py-0.5 rounded text-white font-medium" style={{background:"#2d6a4f"}}>Done</button>
                  </div>
                </div>
                <div className="overflow-y-auto" style={{maxHeight:280}}>
                  {filteredWeeks.map(w => (
                    <label key={w.weekNum} className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-xs border-b ${tbBdr} ${tbRow}`}>
                      <input type="checkbox" checked={selectedWeeks.includes(w.weekNum)} onChange={()=>toggleWeek(w.weekNum)} className="accent-green-600 rounded" />
                      <span className={txt3}><span className={`font-mono text-[10px] mr-1.5 ${txt2}`}>{w.weekNum}</span>{w.label}</span>
                    </label>
                  ))}
                  {filteredWeeks.length===0 && <p className={`text-center py-6 text-xs ${txt2}`}>No weeks for selected year</p>}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={`text-[9px] font-bold uppercase tracking-widest ${txt2}`}>Name</span>
          <select value={nameFilter} onChange={e=>{setNameFilter(e.target.value);lastKeyRef.current="";}}
            className={`rounded border text-xs px-2 py-1.5 outline-none ${inp} cursor-pointer`} style={{minWidth:150}}>
            <option value="">— All Names —</option>
            {contextNames.map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={`text-[9px] font-bold uppercase tracking-widest ${txt2}`}>Job / Location</span>
          <select value={jobFilter} onChange={e=>{setJobFilter(e.target.value);lastKeyRef.current="";}}
            className={`rounded border text-xs px-2 py-1.5 outline-none ${inp} cursor-pointer`} style={{minWidth:150}}>
            <option value="">— All Jobs —</option>
            {contextJobs.map(j=><option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={`text-[9px] font-bold uppercase tracking-widest ${txt2}`}>Specific Date</span>
          <input type="date" value={dateFilter.replace(/(\d{2})\/(\d{2})\/(\d{4})/,"$3-$1-$2")}
            onChange={e=>{const v=e.target.value;if(v){const[y,m,d]=v.split("-");setDateFilter(`${m}/${d}/${y}`);}else setDateFilter("");lastKeyRef.current="";}}
            className={`rounded border text-xs px-2 py-1.5 outline-none ${inp}`} style={{minWidth:140}} />
        </div>
        <div className="flex items-end gap-1.5">
          <button onClick={()=>{lastKeyRef.current="";loadData();}} className={`text-sm px-2 py-1.5 rounded border transition-colors ${btnCls}`} title="Refresh">↻</button>
          <button onClick={openAddModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white whitespace-nowrap"
            style={{background:"#2d6a4f"}}>
            + Add Record
          </button>
          <button onClick={()=>{if(rows.length===0){showToast("No rows","info");return;}setActiveTab("detail");setMainTab("payroll");}}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-semibold whitespace-nowrap ${isLight?"border-red-300 text-red-600 hover:bg-red-50":"border-red-800/50 text-red-400 hover:bg-red-900/20"}`}>
            🗑 Delete Record
          </button>
        </div>
      </div>

      {weekDropOpen && <div className="fixed inset-0 z-40" onClick={()=>setWeekDropOpen(false)} />}

      {/* ── KPI cards ── */}
      <div className={`shrink-0 grid grid-cols-4 gap-3 px-4 py-3 border-b ${bdr}`}>
        {[
          { label:"TOTAL HOURS",  val:fmtHrs(totals.hours),  sub:"Logged hrs",    c:"#3b82f6" },
          { label:"TOTAL AMOUNT", val:fmtAmt(totals.amount), sub:"Gross payroll", c:"#16a34a" },
          { label:"ENTRIES",      val:String(rows.length),   sub:"Time records",  c:"#7c3aed" },
          { label:"WORKERS",      val:String(kpiWorkers),    sub:"Unique names",  c:"#d97706" },
        ].map(k => (
          <div key={k.label} className={`rounded-lg border ${bdr} px-4 py-3 ${bg3}`}>
            <p className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${txt2}`}>{k.label}</p>
            <p className="text-2xl font-bold tabular-nums leading-tight" style={{ color:k.c }}>{k.val}</p>
            <p className={`text-[10px] mt-0.5 ${txt2}`}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Content ── */}
      {mainTab === "payroll" ? (
        <>
          {/* Sub-tab bar */}
          <div className={`shrink-0 flex items-center gap-0 px-4 pt-2 border-b ${bdr}`}>
            {([{id:"grouped",l:"📊 Weekly Summary"},{id:"pivot",l:"📅 Summary by Date"},{id:"detail",l:"📋 Detail Log"}] as {id:Tab;l:string}[]).map(t => (
              <button key={t.id} onClick={()=>setActiveTab(t.id)}
                className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px rounded-t transition-all ${activeTab===t.id?`border-[#2d6a4f] ${isLight?"text-[#166534] bg-green-50":"text-[#4ade80] bg-green-950/20"}`:`border-transparent ${txt2}`}`}>
                {t.l}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto min-h-0 px-4 py-4">
            {activeTab==="grouped" && renderGrouped()}
            {activeTab==="pivot"   && renderPivot()}
            {activeTab==="detail"  && renderDetail()}
            {!dataLoaded && !loading && (
              <div className={`text-center py-20 text-sm ${txt2}`}>{getAccessToken()?"Initializing…":"Google sign-in required."}</div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-auto min-h-0 px-4 py-4">
          {renderProjectTotal()}
        </div>
      )}

      {/* ── Toasts ── */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2.5 rounded-xl shadow-xl text-xs font-medium flex items-center gap-2 pointer-events-auto ${t.type==="success"?"bg-green-700 text-white":t.type==="error"?"bg-red-700 text-white":"bg-slate-700 text-white"}`}>
            {t.type==="success"?"✓":t.type==="error"?"✕":"ℹ"} {t.msg}
          </div>
        ))}
      </div>

      {/* ── Add Modal ── */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={()=>setAddModalOpen(false)} />
          <div className={`relative z-10 rounded-2xl shadow-2xl border ${bdr} ${bg} w-full max-w-lg overflow-hidden`}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{background:"#1e4d2b",borderColor:"#155c33"}}>
              <div><h2 className="font-bold text-sm text-white">Add New Record</h2><p className="text-[11px] text-green-300 mt-0.5">Payroll, deduction, or non-payroll entry</p></div>
              <button onClick={()=>setAddModalOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-green-300 hover:text-white transition-colors" style={{background:"rgba(255,255,255,0.1)"}}>×</button>
            </div>
            <div className="px-5 py-4 overflow-y-auto" style={{maxHeight:"65vh"}}>{renderForm()}</div>
            <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${bdr} ${bg3}`}>
              <button onClick={()=>setAddModalOpen(false)} className={`text-xs px-4 py-2 rounded-lg border ${bdr} ${txt2}`}>Cancel</button>
              <button onClick={submitAdd} className="text-xs px-5 py-2 rounded-lg text-white font-semibold" style={{background:"#2d6a4f"}}>Add Entry</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editModalOpen && editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={()=>setEditModalOpen(false)} />
          <div className={`relative z-10 rounded-2xl shadow-2xl border ${bdr} ${bg} w-full max-w-lg overflow-hidden`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${bdr}`}>
              <div><h2 className="font-bold text-sm text-blue-500">Edit Record</h2><p className={`text-[11px] ${txt2} mt-0.5`}>{editingRow.name} · {editingRow.date}</p></div>
              <button onClick={()=>setEditModalOpen(false)} className={`w-7 h-7 flex items-center justify-center rounded-lg ${bg3} ${txt2}`}>×</button>
            </div>
            <div className="px-5 py-4 overflow-y-auto" style={{maxHeight:"65vh"}}>{renderForm()}</div>
            <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${bdr} ${bg3}`}>
              <button onClick={()=>setEditModalOpen(false)} className={`text-xs px-4 py-2 rounded-lg border ${bdr} ${txt2}`}>Cancel</button>
              <button onClick={submitEdit} className="text-xs px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={()=>setDeleteConfirm(null)} />
          <div className={`relative z-10 rounded-2xl shadow-2xl border ${bdr} ${bg} w-full max-w-sm p-6`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl mb-4 ${isLight?"bg-red-50":"bg-red-900/20"}`}>🗑️</div>
            <h2 className="font-bold text-sm mb-1">Delete Record?</h2>
            <p className={`text-xs ${txt2} mb-5 leading-relaxed`}>
              Permanently delete the entry for <strong className={txt}>{deleteConfirm.name}</strong> on <strong className={txt}>{deleteConfirm.date}</strong> ({deleteConfirm.job}). This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={()=>setDeleteConfirm(null)} className={`text-xs px-4 py-2 rounded-lg border ${bdr} ${txt2}`}>Cancel</button>
              <button onClick={confirmDelete} className="text-xs px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold">Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
