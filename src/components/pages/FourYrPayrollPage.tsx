/**
 * FourYrPayrollPage — 4YouPros Payroll Dashboard
 * Matches GAS 4YRdashboard.html patterns exactly.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useFinance } from "../../context/FinanceContext";
import { getAccessToken } from "../../services/googleAuth";
import { FourYrLogo } from "../EntityLogos";
import { capturePage } from "../../lib/pageScreenshot";
import { ScanToFill } from "../ScanToFill";
const fmt2   = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtAmt = (n: number) => `$${fmt2(n)}`;
const fmtHrs = (n: number) => fmt2(n);

/** GAS parseAmPmToSecs — parses "H:MM[:SS] [AM/PM]" → total seconds.
 *  Accepts 1 or 2 digit seconds so hours updates on first digit typed. */
function parseAmPmSecs(s: string): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{1,2}))?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10), sec = m[3] ? parseInt(m[3], 10) : 0;
  const ap = m[4] ? m[4].toUpperCase() : null;
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 3600 + min * 60 + sec;
}

/** GAS toAmPmWithSecs — converts "H:MM AM/PM" → "H:MM:SS AM/PM" (appends :00) */
function toAmPmWithSecs(s: string): string {
  if (!s) return '';
  if (/^\d{1,2}:\d{2}:\d{2}\s*[AaPp][Mm]$/.test(s.trim())) return s.trim();
  const m = s.trim().match(/^(\d{1,2}:\d{2})\s*([AaPp][Mm])$/);
  if (m) return `${m[1]}:00 ${m[2].toUpperCase()}`;
  return s;
}

/** GAS autoFillEditHours — compute HH:MM[:SS] from two AM/PM time strings */
function editHoursFromAmPm(startStr: string, endStr: string): string {
  const ss = parseAmPmSecs(startStr), es = parseAmPmSecs(endStr);
  if (ss === null || es === null) return '';
  let diff = es - ss;
  if (diff < 0) diff += 86400;
  const hh = Math.floor(diff / 3600);
  const mm = Math.floor((diff % 3600) / 60);
  const sx = diff % 60;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}${sx ? ':' + String(sx).padStart(2,'0') : ''}`;
}

import { fuzzyBest } from "../../utils/fuzzyMatch";

function today() {
  const d = new Date();
  return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
}
function currentYear() { return String(new Date().getFullYear()); }

// ── Company chip ──────────────────────────────────────────────────────────────
const CoChip: React.FC<{ co: string; isLight: boolean }> = ({ co, isLight }) => {
  const cfg =
    co === "4YR" ? { bg: isLight ? "#d8f3dc" : "#16331f50", fg: isLight ? "#1a6b36" : "#7fd99a" } :
    co === "TI"  ? { bg: isLight ? "#fff3cd" : "#78350f50", fg: isLight ? "#7a5900" : "#fbbf24" } :
                   { bg: isLight ? "#e2e8f0" : "#1e293b",   fg: isLight ? "#475569" : "#94a3b8" };
  return (
    <span style={{ background: cfg.bg, color: cfg.fg }}
      className="inline-block text-[10px] font-bold px-1.5 py-px rounded leading-tight whitespace-nowrap">
      {co}
    </span>
  );
};

// ── Flat table row builder (for Weekly Summary) ───────────────────────────────
type TRow =
  | { type:"subcat";  key:string; companySpan:number; jobSpan:number; company:string; job:string; subCat:string; hours:number; amount:number; nameTotals:Record<string,{hrs:number;amt:number}>; isDeduction:boolean; isNonPayroll:boolean; scKey:string; scCollapsed:boolean }
  | { type:"daterow"; key:string; date:string; hours:number; amount:number; nameTotals:Record<string,{hrs:number;amt:number}> }
  | { type:"cototal"; key:string; company:string; hours:number; amount:number; nameTotals:Record<string,{hrs:number;amt:number}> };

function buildTableRows(companies: any[], collapsed: Record<string, boolean>): TRow[] {
  const out: TRow[] = [];
  for (const co of companies) {
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

type Tab     = "grouped" | "pivot" | "detail";
type MainTab = "payroll" | "project";

interface WeekMeta { weekNum:string; year:number; label:string; startDate:string; endDate:string }
interface RawRow {
  rowIndex:number; name:string; job:string; subCat:string; date:string; dateISO:string;
  started:string; finished:string; hoursRaw:number; hrsRed:boolean; rate:number;
  remarks:string; company:string; hours:number; total:number; variance:number; weekNum:string; mo:string;
}
// ─────────────────────────────────────────────────────────────────────────────
export function FourYrPayrollPage() {
  const { theme, handleGoogleSignIn, showToast, showConfirm } = useFinance() as any;
  const isLight = theme === "light";
  const pageRef = useRef<HTMLDivElement>(null);

  const [authError,     setAuthError]     = useState(false);
  const [mainTab,       setMainTab]       = useState<MainTab>("payroll");
  const [activeTab,     setActiveTab]     = useState<Tab>("grouped");
  const [loading,       setLoading]       = useState(false);
  const [dataLoaded,    setDataLoaded]    = useState(false);
  const [ssMenuOpen,    setSsMenuOpen]    = useState(false);
  const [ssCapturing,   setSsCapturing]   = useState(false);
  const [weekDropOpen,  setWeekDropOpen]  = useState(false);
  const [collapsed,     setCollapsed]     = useState<Record<string, boolean>>({});
  const [typeFilters,   setTypeFilters]   = useState<Set<string>>(new Set());

  // ── Filter STATE (for rendering) ──────────────────────────────────────────
  const [yearFilter,    setYearFilter]    = useState(currentYear());
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const [nameFilter,    setNameFilter]    = useState("");
  const [jobFilter,     setJobFilter]     = useState("");
  const [dateFilter,    setDateFilter]    = useState("");

  // ── Filter REF (for synchronous access in doLoad — mirrors GAS _csValues) ─
  const filtersRef = useRef({ year: currentYear(), weekNums: [] as string[], name: "", job: "", date: "" });

  // ── Dropdown data ─────────────────────────────────────────────────────────
  const [years,       setYears]       = useState<number[]>([]);
  const [allWeeks,    setAllWeeks]    = useState<WeekMeta[]>([]);
  const [allNames,    setAllNames]    = useState<string[]>([]);
  const [allJobs,     setAllJobs]     = useState<string[]>([]);
  const [weekContext, setWeekContext] = useState<Record<string, { names:string[]; jobs:string[] }>>({});

  // ── Payroll data ──────────────────────────────────────────────────────────
  const [rows,         setRows]         = useState<RawRow[]>([]);
  const [groupedPivot, setGroupedPivot] = useState<any>(null);
  const [weeklyPivot,  setWeeklyPivot]  = useState<any>(null);
  const [totals,       setTotals]       = useState({ hours:0, amount:0 });

  // ── Project Total state ───────────────────────────────────────────────────
  const [projSearch,   setProjSearch]   = useState("");

  // ── Employee history modal ────────────────────────────────────────────────
  const [empModalOpen,    setEmpModalOpen]    = useState(false);
  const [empModalName,    setEmpModalName]    = useState("");
  const [empModalData,    setEmpModalData]    = useState<any>(null);
  const [empModalLoading, setEmpModalLoading] = useState(false);

  // ── Edit / modal state ────────────────────────────────────────────────────
  const [editingCell,   setEditingCell]   = useState<{ rowIndex:number; field:string }|null>(null);
  const [editVal,       setEditVal]       = useState("");
  const editInputRef                      = useRef<HTMLInputElement>(null);
  const [addModalOpen,  setAddModalOpen]  = useState(false);
  const [scanKey, setScanKey] = useState(0);
  const [tscanResult, setTscanResult] = useState<any>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<RawRow|null>(null);
  const [editingRow,    setEditingRow]    = useState<RawRow|null>(null);
  const [entryDropdowns,setEntryDropdowns]= useState<any>(null);
  const [form, setForm] = useState({ name:"", job:"", subCat:"", date:"", started:"", finished:"", hours:"", remarks:"", amount:"", company:"", recordType:"payroll" });
  const [hoursExplicit, setHoursExplicit] = useState(false); // mirrors GAS _editHoursExplicit
  const [namePickerOpen, setNamePickerOpen] = useState(false);
  const [startingWeek,   setStartingWeek]   = useState(false);
  const [modalBusy,      setModalBusy]      = useState(false); // loading state for add/edit/delete modals

  const debounceRef  = useRef<ReturnType<typeof setTimeout>>();
  const lastKeyRef   = useRef("");
  const weekListRef  = useRef<HTMLDivElement>(null);

  // ── API helpers ───────────────────────────────────────────────────────────
  const apiGet = useCallback(async (path: string) => {
    const tok = getAccessToken();
    const res = await fetch(path, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.status === 500) {
      try { const b = await res.clone().json();
        if (b?.error && /401|token|credential|auth/i.test(String(b.error))) { setAuthError(true); throw new Error("reconnect"); }
      } catch {}
    }
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  }, []);

  const apiPost = useCallback(async (path: string, body: any) => {
    const tok = getAccessToken();
    const res = await fetch(path, { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ ...body, accessToken: tok }) });
    if (res.status === 500) {
      try { const b = await res.clone().json();
        if (b?.error && /401|token|credential|auth/i.test(String(b.error))) { setAuthError(true); throw new Error("reconnect"); }
        else if (b?.error) throw new Error(`${path} → 500: ${b.error}`);
      } catch(inner: any) { if (inner.message) throw inner; }
    }
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  }, []);

  // ── Scroll week dropdown list to first selected item when it opens ─────────
  useEffect(() => {
    if (!weekDropOpen || !weekListRef.current) return;
    const firstSelected = weekListRef.current.querySelector("[data-selected='true']") as HTMLElement | null;
    if (firstSelected) firstSelected.scrollIntoView({ block: "center" });
  }, [weekDropOpen]);

  // ── doLoad — reads from filtersRef (GAS pattern: always uses current values)
  // force=true: skips dedup check and uses a longer delay so Sheets has time
  // to commit a just-written row before we re-read (post-add / post-edit).
  const doLoad = useCallback((force = false) => {
    if (!getAccessToken()) return;
    const f = filtersRef.current;
    const filters: any = {};
    if (f.year)            filters.year     = f.year;
    if (f.weekNums.length) filters.weekNums = f.weekNums;
    if (f.name)            filters.name     = f.name;
    if (f.job)             filters.job      = f.job;
    if (f.date)            filters.date     = f.date;
    const key = JSON.stringify(filters);
    if (!force && key === lastKeyRef.current) return;
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
    }, force ? 1200 : 280); // post-write: 1.2 s lets Sheets commit before re-read
  }, [apiPost, showToast]);

  // ── Filter change handlers (GAS pattern: update ref, update state, call doLoad directly) ──
  const onYearChange = (v: string) => {
    filtersRef.current = { ...filtersRef.current, year: v, weekNums: [] };
    lastKeyRef.current = "";
    setYearFilter(v);
    setSelectedWeeks([]);
    doLoad();
  };

  const onWeekToggle = (wk: string) => {
    const cur = filtersRef.current.weekNums;
    const next = cur.includes(wk) ? cur.filter(x => x !== wk) : [...cur, wk];
    filtersRef.current = { ...filtersRef.current, weekNums: next };
    lastKeyRef.current = "";
    setSelectedWeeks(next);
    doLoad();
  };

  const onWeekClear = () => {
    filtersRef.current = { ...filtersRef.current, weekNums: [] };
    lastKeyRef.current = "";
    setSelectedWeeks([]);
    doLoad();
  };

  const onNameChange = (v: string) => {
    filtersRef.current = { ...filtersRef.current, name: v };
    lastKeyRef.current = "";
    setNameFilter(v);
    doLoad();
  };

  const onJobChange = (v: string) => {
    filtersRef.current = { ...filtersRef.current, job: v };
    lastKeyRef.current = "";
    setJobFilter(v);
    doLoad();
  };

  const onDateChange = (raw: string) => {
    let date = "";
    if (raw) { const [y,m,d] = raw.split("-"); date = `${m}/${d}/${y}`; }
    filtersRef.current = { ...filtersRef.current, date };
    lastKeyRef.current = "";
    setDateFilter(date);
    doLoad();
  };

  const resetFilters = () => {
    const y = currentYear();
    filtersRef.current = { year: y, weekNums: [], name: "", job: "", date: "" };
    lastKeyRef.current = "";
    setYearFilter(y); setSelectedWeeks([]); setNameFilter(""); setJobFilter(""); setDateFilter("");
    doLoad();
  };

  // ── Employee YTD modal ────────────────────────────────────────────────────
  const openEmpModal = useCallback(async (name: string) => {
    setEmpModalName(name); setEmpModalData(null); setEmpModalLoading(true); setEmpModalOpen(true);
    try {
      const data = await apiGet(`/api/4yr/employee-ytd?name=${encodeURIComponent(name)}`);
      setEmpModalData(data);
    } catch(e:any) { setEmpModalData({ error: e.message }); }
    finally { setEmpModalLoading(false); }
  }, [apiGet]);

  // ── Init: load dropdown data, set current week, then load data ────────────
  useEffect(() => {
    if (!getAccessToken()) return;
    apiGet("/api/4yr/dropdown-data").then(data => {
      setAuthError(false);
      setYears(data.years||[]); setAllWeeks(data.weeks||[]);
      setAllNames(data.names||[]); setAllJobs(data.jobs||[]);
      setWeekContext(data.weekContext||{});
      // Auto-select current week
      const now = new Date();
      const toDate = (mmddyyyy: string) => { const p = mmddyyyy.split('/'); return new Date(+p[2], +p[0]-1, +p[1]); };
      const cur = (data.weeks as WeekMeta[]).find(w => {
        const s = toDate(w.startDate), e = toDate(w.endDate);
        e.setHours(23,59,59,999); return now >= s && now <= e;
      });
      if (cur) {
        filtersRef.current = { ...filtersRef.current, weekNums: [cur.weekNum] };
        lastKeyRef.current = "";
        setSelectedWeeks([cur.weekNum]);
      }
      doLoad();
    }).catch(e => { if (!e.message?.includes("reconnect")) showToast(`Dropdown load failed: ${e.message}`, "error"); });
  }, []); // eslint-disable-line

  // ── GAS autoFillEditHours: recompute hours whenever started/finished changes ──
  // Mirrors `oninput="autoFillEditHours()"` on ed-start / ed-end in GAS.
  // Belt-and-suspenders on top of the onChange inline computation.
  useEffect(() => {
    if (!editModalOpen) return;
    if (form.recordType === 'deduction' || form.recordType === 'nonpayroll') return;
    const computed = editHoursFromAmPm(form.started, form.finished);
    if (computed) setForm(f => ({ ...f, hours: computed }));
  }, [form.started, form.finished, form.recordType, editModalOpen]);

  // ── Derived ───────────────────────────────────────────────────────────────
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

  const weekLabel = selectedWeeks.length === 0 ? "All Weeks"
    : selectedWeeks.length === 1 ? (filteredWeeks.find(w => w.weekNum === selectedWeeks[0])?.label || selectedWeeks[0])
    : `${selectedWeeks.length} weeks selected`;

  const filteredGroupedPivot = useMemo(() => {
    if (!groupedPivot || typeFilters.size === 0) return groupedPivot;
    return { ...groupedPivot, companies: groupedPivot.companies.map((co:any) => ({
      ...co, jobs: co.jobs.map((job:any) => ({
        ...job, subCats: job.subCats.filter((sc:any) => {
          if (typeFilters.has("deduction")  && sc.isDeduction)                      return true;
          if (typeFilters.has("nonpayroll") && sc.isNonPayroll)                     return true;
          if (typeFilters.has("payroll")    && !sc.isDeduction && !sc.isNonPayroll) return true;
          return false;
        })
      })).filter((j:any) => j.subCats.length > 0)
    })).filter((co:any) => co.jobs.length > 0) };
  }, [groupedPivot, typeFilters]);

  const tableRows = useMemo(() =>
    filteredGroupedPivot ? buildTableRows(filteredGroupedPivot.companies, collapsed) : [],
    [filteredGroupedPivot, collapsed]);

  // ── Project Total derived ─────────────────────────────────────────────────
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

  const filteredProjectTotals = useMemo(() => {
    if (!projSearch.trim()) return projectTotals;
    const q = projSearch.trim().toLowerCase();
    return projectTotals.filter(p => p.job.toLowerCase().includes(q));
  }, [projectTotals, projSearch]);

  // ── Collapse helpers ──────────────────────────────────────────────────────
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

  // ── Inline edit ───────────────────────────────────────────────────────────
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
      showToast("Saved", "success"); lastKeyRef.current = ""; doLoad();
    } catch(e:any) { showToast(`Save failed: ${e.message}`, "error"); }
  };

  // ── Modal openers ─────────────────────────────────────────────────────────
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
      // Convert decimal hours (e.g. 8.85) → HH:MM (08:51) — matches GAS openEditRecord
      const hDec = Number(row.hours) || 0;
      const hh   = Math.floor(hDec);
      const hm   = Math.round((hDec - hh) * 60);
      const hoursHHMM = hDec ? `${String(hh).padStart(2,'0')}:${String(hm).padStart(2,'0')}` : "";
      // Populate times as "H:MM:SS AM/PM" text — matches GAS toAmPmWithSecs / text input
      const recType = isDed ? "deduction" : isNonPay ? "nonpayroll" : "payroll";
      setForm({ name:row.name,
        // GAS onEditRecordTypeChange: deduction → job is always "Deductions"
        job: recType === "deduction" ? "Deductions" : (row.job || ""),
        subCat: (row.subCat && row.subCat !== "(none)") ? row.subCat : "",
        date:row.date,
        started: toAmPmWithSecs(row.started), finished: toAmPmWithSecs(row.finished),
        hours:hoursHHMM, remarks:row.remarks,
        amount:String(Math.abs(row.total||0)), company:row.company,
        recordType: recType });
      setHoursExplicit(false); // GAS: _editHoursExplicit = false on modal open
      setEditModalOpen(true);
    } catch(e:any) { showToast(`Edit form failed: ${e.message}`, "error"); }
  };

  const submitAdd = async () => {
    const noTime = form.recordType === "deduction" || form.recordType === "nonpayroll";
    const missing: string[] = [];
    if (!form.name)               missing.push("Name");
    if (!form.job)                missing.push("Job / Location");
    if (!form.date)               missing.push("Date");
    if (noTime  && !form.subCat)  missing.push("Sub Cat");
    if (!noTime && !form.started) missing.push("Started");
    if (!noTime && !form.finished)missing.push("End");
    if (!noTime && !form.hours)   missing.push("Hours");
    if (noTime  && !form.amount)  missing.push("Amount");
    if (missing.length) { showToast(`Missing: ${missing.join(", ")}`, "error"); return; }
    // Mirror submitEdit: negate amount for deductions so they subtract from totals
    let finalAmount: number | null = noTime ? parseFloat(form.amount) || null : null;
    if (form.recordType === "deduction" && finalAmount !== null && finalAmount > 0) finalAmount = -finalAmount;
    setModalBusy(true);
    try {
      await apiPost("/api/4yr/add-entry", { ...form, amount: finalAmount });
      showToast("Entry added ✓", "success");
      // If a scan is loaded, keep the modal open so the user can pick the next day
      if (tscanResult) {
        setForm(f => ({ ...f, date: "", started: "", finished: "", hours: "", remarks: "" }));
      } else {
        setAddModalOpen(false);
      }
      doLoad(true); // force: skip dedup + wait 1.2 s for Sheets to commit
    } catch(e:any) { showToast(`Add failed: ${e.message}`,"error"); }
    finally { setModalBusy(false); }
  };

  const submitEdit = async () => {
    if (!editingRow) return;
    // Mirror GAS doSaveEdit: collect missing fields, show "Save anyway?" if any
    const noTime = form.recordType === "deduction" || form.recordType === "nonpayroll";
    const missing: string[] = [];
    if (!form.name)                                                    missing.push("Name");
    if (!form.job)                                                     missing.push("Job / Location");
    if (!form.date)                                                    missing.push("Date");
    if ((form.recordType === "deduction" || form.recordType === "nonpayroll") && !form.subCat)
                                                                       missing.push("Sub Cat");
    if (!noTime && !form.started)  missing.push("Started");
    if (!noTime && !form.finished) missing.push("End");
    if (!noTime && !form.hours)    missing.push("Hours");
    if (noTime  && !form.amount)   missing.push("Amount");
    const doSave = async () => {
      // Mirror GAS _doSaveEditCommit: negate amount for deductions
      let finalAmount: number | null = noTime ? parseFloat(form.amount) || null : null;
      if (form.recordType === "deduction" && finalAmount !== null && finalAmount > 0) finalAmount = -finalAmount;
      setModalBusy(true);
      try {
        await apiPost("/api/4yr/save-edit", {
          ...form,
          amount:               finalAmount,
          rowIndex:             editingRow!.rowIndex,
          hoursExplicitlyEdited: noTime ? false : hoursExplicit, // GAS: noTime ? false : _editHoursExplicit
        });
        showToast("Entry updated", "success");
        setEditModalOpen(false);
        doLoad(true); // force: skip dedup + wait 1.2 s for Sheets to commit
      } catch(e:any) { showToast(`Edit failed: ${e.message}`, "error"); }
      finally { setModalBusy(false); }
    };
    if (missing.length) {
      showConfirm(`Missing fields: ${missing.join(", ")}. Save anyway?`, doSave);
      return;
    }
    doSave();
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setModalBusy(true);
    try { await apiPost("/api/4yr/delete-entry", {rowIndex:deleteConfirm.rowIndex}); showToast("Deleted", "success"); setDeleteConfirm(null); doLoad(true); }
    catch(e:any) { showToast(`Delete failed: ${e.message}`,"error"); setDeleteConfirm(null); }
    finally { setModalBusy(false); }
  };

  // ── Start New Week ────────────────────────────────────────────────────────
  const handleStartNewWeek = async () => {
    const tok = getAccessToken();
    if (!tok) { showToast("Sign in to Google Sheets first", "error"); return; }
    showConfirm(
      "This will copy the TEMPLATE sheet into a new week tab on the Google Spreadsheet. Continue?",
      async () => {
        setStartingWeek(true);
        try {
          const res = await apiPost("/api/4yr/start-new-week", {});
          if (res.ok) {
            showToast(`✅ New week created: "${res.newSheetName}" (${res.startDate} – ${res.endDate})`, "success", 6000);
            // Refresh dropdowns so the new week appears in the selector
            apiGet("/api/4yr/dropdown-data").then(data => {
              setAllWeeks(data.weeks || []);
              setYears(data.years || []);
            }).catch(() => {});
          } else {
            showToast(`Could not start new week: ${res.error}`, "error", 6000);
          }
        } catch(e: any) {
          showToast(`Start new week failed: ${e.message}`, "error");
        } finally {
          setStartingWeek(false);
        }
      }
    );
  };

  // ── Screenshot ────────────────────────────────────────────────────────────
  const takeScreenshot = async (mode: "visible"|"full") => {
    setSsMenuOpen(false); setSsCapturing(true);
    const target = pageRef.current || document.body;
    try {
      const dataUrl = await capturePage(target, mode === "full");
      const link = document.createElement("a");
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
      link.download = `4YR_Payroll_${ts}.png`;
      link.href = dataUrl;
      link.click();
      showToast("Screenshot saved", "success");
    } catch(e:any) { showToast(`Screenshot failed: ${e.message}`, "error"); }
    setSsCapturing(false);
  };

  const isNoTime = form.recordType === "deduction" || form.recordType === "nonpayroll";

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const bg   = isLight ? "bg-white"     : "bg-[#0f0f0f]";
  const bg2  = isLight ? "bg-slate-50"  : "bg-[#0d111a]";
  const bg3  = isLight ? "bg-slate-100" : "bg-[#1a1a1a]";
  const bdr  = isLight ? "border-slate-200" : "border-[#272727]";
  const txt  = isLight ? "text-slate-900"   : "text-slate-100";
  const txt2 = isLight ? "text-slate-500"   : "text-slate-400";
  const txt3 = isLight ? "text-slate-700"   : "text-slate-300";
  const inp  = isLight
    ? "bg-white border-slate-200 text-slate-900 focus:border-[#52b788] focus:ring-1 focus:ring-[#52b788]/20"
    : "bg-[#1c1c1c] border-[#333] text-slate-100 focus:border-[#52b788] focus:ring-1 focus:ring-[#52b788]/20";
  const tbBdr = isLight ? "border-slate-200" : "border-[#1e1e1e]";
  const tbRow = isLight ? "hover:bg-[#d8f3dc]" : "hover:bg-[#1a3320]";
  const btnCls = isLight
    ? "border-slate-200 bg-[#eee] text-slate-600 hover:bg-slate-200"
    : "border-[#333] bg-[#1a1a1a] text-slate-400 hover:bg-[#222]";

  // GAS table palette (matches 4YRdashboard.html CSS exactly)
  const TH1      = isLight ? "#1a6b36" : "#1e4a2a";
  const TH2bg    = isLight ? "#2d8a52" : "#16331f";
  const TH2fg    = isLight ? "#c8e6d0" : "#c8e6d0";
  const COcell   = { bg: isLight ? "#eaf5ec" : "#1e2530", fg: isLight ? "#1a3d22" : "#d8f3dc", bdr: isLight ? "#c8ddd0" : "#2e3340" };
  const JOBcell  = { bg: isLight ? "#f3faf4" : "#20262f", fg: isLight ? "#1b3a22" : "#c8d6cc" };
  const SCcell   = { bg: isLight ? "#ffffff" : "#22262f", fg: isLight ? "#1a6b36" : "#7fd99a" };
  const COTOTbg  = isLight ? "#daeede" : "#16331f";
  const COTOTfg  = isLight ? "#1a3d22" : "#d8f3dc";
  const GRANDbg  = isLight ? "#b7d9bf" : "#0e2417";
  const GRANDfg  = isLight ? "#0e2e17" : "#d8f3dc";
  const DED_BG   = isLight ? "#fff5f5" : "#3a1f22";
  const DED_FG   = isLight ? "#c62828" : "#ff9b9b";
  const NP_BG    = isLight ? "#fff8e6" : "#3a3320";
  const NP_FG    = isLight ? "#7a4f00" : "#ffd27a";

  // ── RENDERERS ─────────────────────────────────────────────────────────────

  const renderGrouped = () => {
    if (!filteredGroupedPivot) return null;
    const { names, grandTotal } = filteredGroupedPivot;

    return (
      <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
        {/* Section header + expand/collapse + legend */}
        <div className={`shrink-0 flex flex-col gap-2 pb-2 border-b ${bdr}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold text-sm ${txt}`}>Weekly Summary</span>
            {selectedWeeks.length > 0 && <span className={`text-xs px-2 py-0.5 rounded font-medium ${isLight?"bg-green-100 text-green-800":"bg-green-900/40 text-green-400"}`}>{weekLabel}</span>}
            <span className={`text-[10px] ml-auto italic ${txt2}`}>* click row to expand · double-click hours to edit</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={expandAll}   className={`text-[11px] px-2.5 py-1 rounded border font-medium transition-colors ${btnCls}`}>⊞ Expand All</button>
            <button onClick={collapseAll} className={`text-[11px] px-2.5 py-1 rounded border font-medium transition-colors ${btnCls}`}>⊟ Collapse All</button>
            <span className={`mx-1 opacity-30`}>|</span>
            {/* GAS-style legend squares + clickable type filters */}
            {[
              {k:"payroll",    l:"Payroll",    bg:isLight?"#d8f3dc":"#16331f", bdr:isLight?"#8cb89a":"#2e6a3f", fg:isLight?"#1a6b36":"#7fd99a"},
              {k:"deduction",  l:"Deduction",  bg:isLight?"#fff5f5":"#3a1f22", bdr:isLight?"#e8a0a0":"#6a2020", fg:isLight?"#c62828":"#ff9b9b"},
              {k:"nonpayroll", l:"Non-Payroll", bg:isLight?"#fff8e6":"#3a3320", bdr:isLight?"#f4a261":"#6a5a20", fg:isLight?"#7a4f00":"#ffd27a"},
            ].map(t => (
              <label key={t.k} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={typeFilters.has(t.k)} onChange={() => toggleTypeFilter(t.k)} className="sr-only" />
                <span style={{ background:t.bg, border:`1px solid ${t.bdr}`, width:12, height:12, display:"inline-block", borderRadius:2, flexShrink:0 }} />
                <span className="text-[11px] font-semibold" style={{ color: typeFilters.has(t.k) ? t.fg : undefined, opacity: typeFilters.has(t.k) ? 1 : 0.65 }}>{t.l}</span>
              </label>
            ))}
            {typeFilters.size > 0 && <button onClick={() => setTypeFilters(new Set())} className={`text-[10px] ${txt2} hover:text-red-500`}>clear</button>}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="text-xs border-collapse" style={{ minWidth:"100%", tableLayout:"auto" }}>
            <thead>
              <tr style={{ background: TH1 }}>
                <th colSpan={3} className="text-left px-3 py-2 font-bold text-[11px] text-white uppercase tracking-wide" style={{ minWidth:370, background:isLight?"#c6dfc8":"#1e4a2a", color:isLight?"#1b3a22":"#d8f3dc" }}>Name</th>
                {names.map((n:string) => (
                  <th key={n} colSpan={2} className="text-center px-2 py-2 font-bold text-[11px] text-white border-l border-white/20 cursor-pointer select-none"
                    style={{ minWidth:160, background:TH1 }}
                    onClick={() => openEmpModal(n)}
                    title={`Click to view ${n}'s YTD history`}>
                    <span className="border-b border-dotted border-white/60 hover:border-white">{n}</span>
                  </th>
                ))}
                <th colSpan={2} className="text-center px-2 py-2 font-bold text-[11px] text-white border-l border-white/20" style={{ minWidth:160, background:TH1 }}>Grand Total</th>
              </tr>
              <tr style={{ background: TH2bg }}>
                <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color:TH2fg, minWidth:100 }}>Company</th>
                <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color:TH2fg, minWidth:130 }}>Job</th>
                <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color:TH2fg, minWidth:180 }}>Sub Cat</th>
                {names.map((n:string) => (
                  <React.Fragment key={n}>
                    <th className="text-right px-2 py-1.5 text-[10px] font-semibold border-l border-black/10" style={{ color:TH2fg, minWidth:70 }}>Hrs</th>
                    <th className="text-right px-2 py-1.5 text-[10px] font-semibold" style={{ color:TH2fg, minWidth:90 }}>Amount</th>
                  </React.Fragment>
                ))}
                <th className="text-right px-2 py-1.5 text-[10px] font-bold border-l border-black/10" style={{ color:TH2fg, minWidth:70 }}>Hrs</th>
                <th className="text-right px-3 py-1.5 text-[10px] font-bold" style={{ color:TH2fg, minWidth:90 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(row => {
                if (row.type === "subcat") {
                  const isDed    = row.isDeduction;
                  const isNonPay = row.isNonPayroll;
                  const rowBg    = isDed ? DED_BG : isNonPay ? NP_BG : (isLight?"#fff":"#22262f");
                  const scFg     = row.scCollapsed ? "#f4a261"    // amber when collapsed (GAS: --amber)
                                 : isDed ? DED_FG : isNonPay ? NP_FG : SCcell.fg;
                  const amtFg   = isDed ? DED_FG : isNonPay ? NP_FG : (isLight?"#1a5c2a":"#7fd99a");
                  return (
                    <tr key={row.key} className={`border-t ${tbBdr}`} style={{ background: rowBg }}>
                      {row.companySpan > 0 && (
                        <td rowSpan={row.companySpan} className="px-3 py-2 font-bold text-[11px] align-top border-r"
                          style={{ background:COcell.bg, color:COcell.fg, borderColor:COcell.bdr, minWidth:100 }}>
                          {row.company}
                        </td>
                      )}
                      {row.jobSpan > 0 && (
                        <td rowSpan={row.jobSpan} className="px-2 py-1.5 text-[11px] align-top border-r"
                          style={{ background:JOBcell.bg, color:JOBcell.fg, borderColor:isLight?"#c8ddd0":"#2e3340", minWidth:130 }}>
                          {row.job}
                        </td>
                      )}
                      {/* Sub Cat cell — click to expand/collapse */}
                      <td className="px-2 py-1.5 cursor-pointer select-none" style={{ background:rowBg, minWidth:180 }}
                        onClick={() => setCollapsed(c => ({...c, [row.scKey]: !c[row.scKey]}))}>
                        <span style={{ color:scFg }} className="text-[11px] font-semibold">
                          <span className="text-[10px] mr-1.5 inline-block w-3 text-center">{row.scCollapsed ? "▶" : "▼"}</span>
                          {(!row.subCat || row.subCat === "—" || row.subCat === "(none)") ? "" : row.subCat}
                        </span>
                      </td>
                      {names.map((n:string) => (
                        <React.Fragment key={n}>
                          <td className="text-right px-2 py-1.5 tabular-nums border-l" style={{ borderColor:isLight?"#c8ddd0":"#2e3340", color:isLight?"#1b3a22":"#c8d6cc", background:rowBg }}>
                            {row.nameTotals[n]?.hrs ? fmtHrs(row.nameTotals[n].hrs) : <span style={{color:isLight?"#aaa":"#555c6b"}}>—</span>}
                          </td>
                          <td className="text-right px-2 py-1.5 tabular-nums" style={{ color:amtFg, background:rowBg }}>
                            {row.nameTotals[n]?.amt ? fmtAmt(row.nameTotals[n].amt) : <span style={{color:isLight?"#ddd":"#3a4150"}}>—</span>}
                          </td>
                        </React.Fragment>
                      ))}
                      <td className="text-right px-2 py-1.5 tabular-nums font-semibold border-l" style={{ borderColor:isLight?"#c8ddd0":"#2e3340", color:isLight?"#1b3a22":"#c8d6cc", background:rowBg }}>
                        {fmtHrs(row.hours)}
                      </td>
                      <td className="text-right px-3 py-1.5 tabular-nums font-semibold" style={{ color:amtFg, background:rowBg }}>
                        {fmtAmt(row.amount)}
                      </td>
                    </tr>
                  );
                }

                if (row.type === "daterow") {
                  const dateBg = isLight ? "#f5faf6" : "#1e2530";
                  return (
                    <tr key={row.key} className={`border-t ${tbBdr}`} style={{ background: dateBg }}>
                      <td className="px-2 py-1 text-[10px] font-semibold pl-7" style={{ color:isLight?"#2d8a52":"#7fd99a", background:isLight?"#f0faf2":"#1e2530" }}>{row.date}</td>
                      {names.map((n:string) => (
                        <React.Fragment key={n}>
                          <td className="text-right px-2 py-1 tabular-nums text-[10px] border-l" style={{ borderColor:isLight?"#c8ddd0":"#2e3340", color:isLight?"#1b3a22":"#c8d6cc", background:dateBg }}>
                            {row.nameTotals[n]?.hrs ? fmtHrs(row.nameTotals[n].hrs) : ""}
                          </td>
                          <td className="text-right px-2 py-1 tabular-nums text-[10px]" style={{ color:isLight?"#1a5c2a":"#7fd99a", background:dateBg }}>
                            {row.nameTotals[n]?.amt ? fmtAmt(row.nameTotals[n].amt) : ""}
                          </td>
                        </React.Fragment>
                      ))}
                      <td className="text-right px-2 py-1 tabular-nums text-[10px] font-semibold border-l" style={{ borderColor:isLight?"#c8ddd0":"#2e3340", color:isLight?"#1b3a22":"#c8d6cc", background:dateBg }}>{fmtHrs(row.hours)}</td>
                      <td className="text-right px-3 py-1 tabular-nums text-[10px] font-semibold" style={{ color:isLight?"#1a5c2a":"#7fd99a", background:dateBg }}>{fmtAmt(row.amount)}</td>
                    </tr>
                  );
                }

                if (row.type === "cototal") {
                  return (
                    <tr key={row.key} className="border-t-2" style={{ background:COTOTbg, borderTopColor:isLight?"#8cb89a":"#2e6a3f" }}>
                      <td colSpan={3} className="px-3 py-2 font-bold text-[11px]" style={{ color:COTOTfg }}>{row.company} Total</td>
                      {names.map((n:string) => (
                        <React.Fragment key={n}>
                          <td className="text-right px-2 py-2 tabular-nums font-semibold border-l" style={{ borderColor:isLight?"#8cb89a":"#2e6a3f", color:COTOTfg }}>
                            {row.nameTotals[n]?.hrs ? fmtHrs(row.nameTotals[n].hrs) : <span style={{opacity:.35}}>—</span>}
                          </td>
                          <td className="text-right px-2 py-2 tabular-nums font-semibold" style={{ color:COTOTfg }}>
                            {row.nameTotals[n]?.amt ? fmtAmt(row.nameTotals[n].amt) : <span style={{opacity:.35}}>—</span>}
                          </td>
                        </React.Fragment>
                      ))}
                      <td className="text-right px-2 py-2 tabular-nums font-bold border-l" style={{ borderColor:isLight?"#8cb89a":"#2e6a3f", color:COTOTfg }}>{fmtHrs(row.hours)}</td>
                      <td className="text-right px-3 py-2 tabular-nums font-bold" style={{ color:COTOTfg }}>{fmtAmt(row.amount)}</td>
                    </tr>
                  );
                }
                return null;
              })}

              {/* Grand total */}
              <tr className="border-t-2" style={{ background:GRANDbg, borderTopColor:isLight?"#5a9870":"#3a8a5a" }}>
                <td colSpan={3} className="px-3 py-2.5 font-bold text-[11px] uppercase tracking-wide" style={{ color:GRANDfg }}>Grand Total</td>
                {filteredGroupedPivot.names.map((n:string) => (
                  <React.Fragment key={n}>
                    <td className="text-right px-2 py-2.5 tabular-nums font-semibold border-l" style={{ borderColor:isLight?"#5a9870":"#3a8a5a", color:GRANDfg }}>
                      {grandTotal.nameTotals[n]?.hrs ? fmtHrs(grandTotal.nameTotals[n].hrs) : <span style={{opacity:.4}}>—</span>}
                    </td>
                    <td className="text-right px-2 py-2.5 tabular-nums font-semibold" style={{ color:GRANDfg }}>
                      {grandTotal.nameTotals[n]?.amt ? fmtAmt(grandTotal.nameTotals[n].amt) : <span style={{opacity:.4}}>—</span>}
                    </td>
                  </React.Fragment>
                ))}
                <td className="text-right px-2 py-2.5 tabular-nums font-bold border-l" style={{ borderColor:isLight?"#5a9870":"#3a8a5a", color:GRANDfg }}>{fmtHrs(grandTotal.hours)}</td>
                <td className="text-right px-3 py-2.5 tabular-nums font-bold" style={{ color:GRANDfg }}>{fmtAmt(grandTotal.amount)}</td>
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
      <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
        <div className={`shrink-0 pb-2 border-b ${bdr}`}>
          <span className={`font-bold text-sm ${txt}`}>Summary by Date</span>
          {selectedWeeks.length > 0 && <span className={`ml-2 text-xs ${txt2}`}>{weekLabel}</span>}
        </div>
        <div className="overflow-auto flex-1 min-h-0">
          <table className="text-xs border-collapse" style={{ minWidth:"100%" }}>
            <thead>
              <tr style={{ background:TH1 }}>
                <th rowSpan={2} className="text-left px-3 py-2 text-[11px] font-bold text-white uppercase tracking-wide" style={{ minWidth:100, position:"sticky", top:0, zIndex:3 }}>Date</th>
                {names.map((n:string) => <th key={n} colSpan={2} className="text-center px-2 py-2 text-[11px] font-bold text-white border-l border-white/20" style={{ minWidth:140 }}>{n}</th>)}
                <th colSpan={2} className="text-center px-2 py-2 text-[11px] font-bold text-white border-l border-white/20" style={{ minWidth:140 }}>Grand Total</th>
              </tr>
              <tr style={{ background:TH2bg, position:"sticky", top:28, zIndex:3 } as any}>
                {names.map((n:string) => (
                  <React.Fragment key={n}>
                    <th className="text-right px-2 py-1.5 text-[10px] font-semibold border-l border-black/10" style={{ color:TH2fg, minWidth:60 }}>Hrs</th>
                    <th className="text-right px-2 py-1.5 text-[10px] font-semibold" style={{ color:TH2fg, minWidth:80 }}>Amount</th>
                  </React.Fragment>
                ))}
                <th className="text-right px-2 py-1.5 text-[10px] font-bold border-l border-black/10" style={{ color:TH2fg, minWidth:60 }}>Hrs</th>
                <th className="text-right px-3 py-1.5 text-[10px] font-bold" style={{ color:TH2fg, minWidth:80 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((d:string, di:number) => {
                const rh = names.reduce((s:number,n:string) => s+(matrix[d]?.[n]?.hours||0),0);
                const ra = names.reduce((s:number,n:string) => s+(matrix[d]?.[n]?.amount||0),0);
                const isNeg = ra < 0;
                const rowBg = isNeg ? DED_BG : (di%2===0 ? (isLight?"#fff":"#22262f") : (isLight?"#f5faf6":"#262b35"));
                return (
                  <tr key={d} className={`border-t ${tbBdr} ${tbRow}`} style={{ background:rowBg }}>
                    <td className="px-3 py-1.5 font-semibold tabular-nums" style={{ color:isLight?"#2d8a52":"#7fd99a", background:isLight?"#f0faf2":"#1e2530", minWidth:100 }}>{d}</td>
                    {names.map((n:string) => {
                      const c = matrix[d]?.[n];
                      return (
                        <React.Fragment key={n}>
                          <td className="text-right px-2 py-1.5 tabular-nums border-l" style={{ borderColor:isLight?"#c8ddd0":"#2e3340", color:isLight?"#1b3a22":"#c8d6cc" }}>
                            {c?.hours ? fmtHrs(c.hours) : <span style={{color:isLight?"#aaa":"#555"}}>—</span>}
                          </td>
                          <td className="text-right px-2 py-1.5 tabular-nums" style={{ color:c?.amount<0?DED_FG:isLight?"#1a5c2a":"#7fd99a" }}>
                            {c?.amount ? fmtAmt(c.amount) : <span style={{color:isLight?"#aaa":"#555"}}>—</span>}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    <td className="text-right px-2 py-1.5 tabular-nums font-bold border-l" style={{ borderColor:isLight?"#c8ddd0":"#2e3340", color:isLight?"#1b3a22":"#c8d6cc" }}>{fmtHrs(rh)}</td>
                    <td className="text-right px-3 py-1.5 tabular-nums font-bold" style={{ color:isNeg?DED_FG:isLight?"#1a5c2a":"#7fd99a" }}>{fmtAmt(ra)}</td>
                  </tr>
                );
              })}
              <tr style={{ background: TH1 }}>
                <td className="px-3 py-2 font-bold text-[11px] text-white uppercase">Total Hrs</td>
                {names.map((n:string) => (
                  <React.Fragment key={n}>
                    <td className="text-right px-2 py-2 tabular-nums text-white font-semibold border-l border-white/20">{fmtHrs(nameTotals[n]?.hours||0)}</td>
                    <td className="text-right px-2 py-2 tabular-nums text-white">{fmtAmt(nameTotals[n]?.amount||0)}</td>
                  </React.Fragment>
                ))}
                <td className="text-right px-2 py-2 tabular-nums text-white font-bold border-l border-white/20">{fmtHrs(grandTotal.hours)}</td>
                <td className="text-right px-3 py-2 tabular-nums text-white font-bold">{fmtAmt(grandTotal.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderDetail = () => (
    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
      <div className={`shrink-0 pb-2 border-b ${bdr} flex items-center gap-4`}>
        <span className={`font-bold text-sm ${txt}`}>Detailed Time Log</span>
        <span className={`text-xs ${txt2}`}>{rows.length} records</span>
        {/* Type filter toggles (GAS style) */}
        <div className="ml-2 flex items-center gap-3">
          {[
            {k:"payroll",    l:"Payroll",    bg:isLight?"#d8f3dc":"#16331f", bdr:isLight?"#8cb89a":"#2e6a3f", fg:isLight?"#1a6b36":"#7fd99a"},
            {k:"deduction",  l:"Deduction",  bg:isLight?"#fff5f5":"#3a1f22", bdr:isLight?"#e8a0a0":"#6a2020", fg:isLight?"#c62828":"#ff9b9b"},
            {k:"nonpayroll", l:"Non-Payroll", bg:isLight?"#fff8e6":"#3a3320", bdr:isLight?"#f4a261":"#6a5a20", fg:isLight?"#7a4f00":"#ffd27a"},
          ].map(t => (
            <label key={t.k} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={typeFilters.has(t.k)} onChange={() => toggleTypeFilter(t.k)} className="sr-only" />
              <span style={{ background:t.bg, border:`1px solid ${t.bdr}`, width:11, height:11, display:"inline-block", borderRadius:2, flexShrink:0 }} />
              <span className="text-[11px] font-semibold" style={{ color:typeFilters.has(t.k)?t.fg:undefined, opacity:typeFilters.has(t.k)?1:0.6 }}>{t.l}</span>
            </label>
          ))}
          {typeFilters.size > 0 && <button onClick={() => setTypeFilters(new Set())} className={`text-[10px] ${txt2} hover:text-red-500`}>clear</button>}
        </div>
      </div>
      <div className="overflow-auto flex-1 min-h-0">
        <table className="text-xs border-collapse" style={{ minWidth:"100%", tableLayout:"fixed" }}>
          <thead>
            <tr style={{ background:TH1 }}>
              {(["Date","Name","Job","Sub Cat","Start","End","Hrs","Rate","Amount","Co","Remarks",""] as const).map((h,i) => {
                const align = ["text-left","text-left","text-left","text-left","text-left","text-left","text-right","text-right","text-right","text-center","text-left","text-center"][i];
                return (
                  <th key={h||i} className={`py-2 px-2 text-[10px] font-bold text-white uppercase tracking-wide ${align}`}
                    style={{ minWidth:[100,130,130,110,75,75,65,80,90,50,145,56][i], position:"sticky", top:0, background:TH1, zIndex:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {h}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const filtered = typeFilters.size === 0 ? rows : rows.filter(r => {
                const isDed  = r.total < 0 || /deduct|loan|rent|penalty|withhold/i.test(r.job+r.subCat);
                const isNP   = !isDed && /reimburse|adjustment|allowance|bonus|incentive|extra|misc/i.test(r.subCat);
                if (typeFilters.has("deduction")  && isDed)  return true;
                if (typeFilters.has("nonpayroll") && isNP)   return true;
                if (typeFilters.has("payroll")    && !isDed && !isNP) return true;
                return false;
              });
              return filtered.map(row => {
                const isDed  = row.total < 0 || /deduct|loan|rent|penalty|withhold/i.test(row.job+row.subCat);
                const isNP   = !isDed && /reimburse|adjustment|allowance|bonus|incentive|extra|misc/i.test(row.subCat);
                const rowBg  = isDed ? DED_BG : isNP ? NP_BG : undefined;
                const amtCls = isDed ? DED_FG : isNP ? NP_FG : isLight?"#1a5c2a":"#7fd99a";
                const isEJ   = editingCell?.rowIndex === row.rowIndex;
                return (
                  <tr key={row.rowIndex} className={`border-t ${tbBdr} ${tbRow}`} style={{ background:rowBg }}>
                    <td className="px-2 py-1.5 tabular-nums" style={{ color:isLight?"#2d8a52":"#7fd99a", whiteSpace:"nowrap" }}>{row.date}</td>
                    <td className={`px-2 py-1.5 font-semibold ${txt3}`} style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{row.name}</td>
                    <td className="px-2 py-1.5" style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {isEJ && editingCell?.field==="job"
                        ? <input ref={editInputRef} value={editVal} className={`w-full rounded border text-xs px-1.5 py-0.5 outline-none ${inp}`}
                            onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit}
                            onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} />
                        : <span className={`cursor-text hover:underline decoration-dashed ${txt3}`} onClick={()=>startEdit(row.rowIndex,"job",row.job)}>{row.job}</span>}
                    </td>
                    <td className={`px-2 py-1.5 ${txt2}`} style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{(!row.subCat || row.subCat==="(none)") ? "" : row.subCat}</td>
                    <td className={`px-2 py-1.5 tabular-nums ${txt2}`} style={{ whiteSpace:"nowrap" }}>{row.started.replace(/(\d{1,2}:\d{2}):\d{2}(\s*[AP]M)$/i, '$1$2')}</td>
                    <td className={`px-2 py-1.5 tabular-nums ${txt2}`} style={{ whiteSpace:"nowrap" }}>{row.finished.replace(/(\d{1,2}:\d{2}):\d{2}(\s*[AP]M)$/i, '$1$2')}</td>
                    <td className="text-right px-2 py-1.5">
                      {isEJ && editingCell?.field==="hours"
                        ? <input ref={editInputRef} value={editVal} className={`w-14 rounded border text-xs px-1 py-0.5 text-right outline-none ${inp}`}
                            onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit}
                            onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} />
                        : <span className={`cursor-text tabular-nums ${row.hrsRed?"text-red-500":txt3}`}
                            onClick={()=>startEdit(row.rowIndex,"hours",String(row.hours))}>{fmtHrs(row.hours)}</span>}
                    </td>
                    <td className={`text-right px-2 py-1.5 tabular-nums ${txt2}`} style={{ whiteSpace:"nowrap" }}>{row.rate ? `$${fmt2(row.rate)}/hr` : "—"}</td>
                    <td className="text-right px-2 py-1.5">
                      {isEJ && editingCell?.field==="total"
                        ? <input ref={editInputRef} value={editVal} className={`w-20 rounded border text-xs px-1 py-0.5 text-right outline-none ${inp}`}
                            onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit}
                            onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} />
                        : <span className="cursor-text tabular-nums font-semibold" style={{ color:amtCls }}
                            onClick={()=>startEdit(row.rowIndex,"total",String(row.total))}>{fmtAmt(row.total)}</span>}
                    </td>
                    <td className="text-center px-2 py-1.5">{row.company && <CoChip co={row.company} isLight={isLight} />}</td>
                    <td className="px-2 py-1.5" style={{ whiteSpace:"normal", overflow:"visible", minWidth:110, maxWidth:180 }}>
                      {isEJ && editingCell?.field==="remark"
                        ? <input ref={editInputRef} value={editVal} className={`w-full rounded border text-xs px-1.5 py-0.5 outline-none ${inp}`}
                            onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit}
                            onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")cancelEdit();}} />
                        : <span className={`cursor-text text-[11px] ${row.remarks?"text-[#c62828] font-semibold":txt2}`}
                            onClick={()=>startEdit(row.rowIndex,"remark",row.remarks)}>
                            {row.remarks || <em className="opacity-40">add note…</em>}
                          </span>}
                    </td>
                    <td className="text-center px-2 py-1.5">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={()=>openEditModal(row)} className="w-6 h-6 flex items-center justify-center rounded text-[10px]" style={{ background:isLight?"#f0f9ff":"rgba(59,130,246,.1)", color:"#3b82f6" }} title="Edit">✏️</button>
                        <button onClick={()=>setDeleteConfirm(row)} className="w-6 h-6 flex items-center justify-center rounded text-[10px]" style={{ background:isLight?"#fff5f5":"rgba(197,50,50,.1)", color:"#c62828" }} title="Delete">🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              });
            })()}
            {rows.length === 0 && (
              <tr><td colSpan={12} className={`text-center py-12 text-sm italic ${txt2}`}>{dataLoaded ? "No records match current filters." : "Loading…"}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderProjectTotal = () => {
    const grandHrs = filteredProjectTotals.reduce((s,p)=>s+p.hours,0);
    const grandAmt = filteredProjectTotals.reduce((s,p)=>s+p.amount,0);
    if (projectTotals.length === 0)
      return <div className={`text-center py-20 text-sm italic ${txt2}`}>{dataLoaded?"No data for selected filters.":"Loading…"}</div>;
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Project Total header + search */}
        <div className={`shrink-0 flex items-center gap-4 flex-wrap mb-3 pb-3 border-b ${bdr}`}>
          <span className={`font-bold text-[15px] ${txt}`}>🏗️ Project Total</span>
          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ color:isLight?"#6b8f71":"#8b96ab" }}>🔍</span>
              <input type="text" value={projSearch} onChange={e=>setProjSearch(e.target.value)}
                placeholder="Filter project / location…"
                className={`rounded border text-xs pl-8 pr-3 py-1.5 outline-none ${inp}`} style={{ minWidth:220 }} />
            </div>
            {projSearch && <button onClick={()=>setProjSearch("")} className={`text-[11px] px-2 py-1 rounded border ${btnCls}`}>✕ Clear</button>}
            <span className={`text-xs ${txt2}`}>{filteredProjectTotals.length} projects · {weekLabel}</span>
          </div>
        </div>

        {/* KPI strip */}
        <div className="shrink-0 flex gap-3 mb-3 flex-wrap">
          {[
            { l:"Projects",    v:String(filteredProjectTotals.length),  c:"#2d8a52" },
            { l:"Total Hours", v:fmtHrs(grandHrs),                     c:"#3b82f6" },
            { l:"Total Amount",v:fmtAmt(grandAmt),                     c:isLight?"#1a6b36":"#52b788" },
          ].map(k => (
            <div key={k.l} className={`flex items-baseline gap-3 rounded-lg border ${bdr} px-4 py-2 ${bg3}`}>
              <span className="text-[17px] font-bold tabular-nums" style={{ color:k.c }}>{k.v}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wide ${txt2}`}>{k.l}</span>
            </div>
          ))}
        </div>

        <div className="overflow-auto flex-1 min-h-0">
          <table className="text-xs border-collapse" style={{ minWidth:"100%" }}>
            <thead>
              <tr style={{ background:TH1 }}>
                <th className="text-left px-3 py-2 text-[11px] font-bold text-white uppercase tracking-wide border" style={{ minWidth:200, maxWidth:200, position:"sticky", left:0, zIndex:4, background:TH1, borderColor:"#145a2c" }}>Job / Location</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold text-white uppercase tracking-wide border" style={{ minWidth:95, position:"sticky", left:200, zIndex:4, background:TH1, borderColor:"#145a2c" }}>Total Hrs</th>
                {projectNames.map(n => (
                  <th key={n} className="text-right px-2 py-2 text-[11px] font-bold text-white border-l border-white/20" style={{ minWidth:90, whiteSpace:"nowrap" }}>{n.split(" ")[0]}</th>
                ))}
                <th className="text-right px-3 py-2 text-[10px] font-bold text-white border-l border-white/20" style={{ minWidth:100 }}>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjectTotals.map((proj, pi) => {
                const isNeg = proj.amount < 0;
                const rowBg = pi%2===0 ? (isLight?"#fff":"#22262f") : (isLight?"#f5faf6":"#262b35");
                return (
                  <tr key={proj.job} className={`border-b ${tbBdr} ${tbRow}`} style={{ background:rowBg }}>
                    <td className="px-3 py-1.5 font-medium border" style={{ minWidth:200, maxWidth:200, position:"sticky", left:0, background:rowBg, borderColor:isLight?"#c8ddd0":"#2e3340", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", zIndex:1, color:isLight?"#1b3a22":"#d8f3dc" }}>{proj.job}</td>
                    <td className="text-right px-3 py-1.5 tabular-nums font-semibold border" style={{ minWidth:95, position:"sticky", left:200, background:rowBg, borderColor:isLight?"#c8ddd0":"#2e3340", zIndex:1, color:isLight?"#1b3a22":"#c8d6cc" }}>{fmtHrs(proj.hours)}</td>
                    {projectNames.map(n => {
                      const e = proj.names[n];
                      return (
                        <td key={n} className="text-right px-2 py-1.5 tabular-nums border-l" style={{ borderColor:isLight?"#c8ddd0":"#2e3340", color:e?.amt<0?DED_FG:isLight?"#1a5c2a":"#7fd99a" }}>
                          {e ? fmtAmt(e.amt) : <span style={{color:isLight?"#aaa":"#555"}}>—</span>}
                        </td>
                      );
                    })}
                    <td className="text-right px-3 py-1.5 tabular-nums font-semibold border-l" style={{ borderColor:isLight?"#c8ddd0":"#2e3340", color:isNeg?DED_FG:isLight?"#1a5c2a":"#7fd99a" }}>{fmtAmt(proj.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:TH1, position:"sticky", bottom:0, zIndex:3 }}>
                <td className="px-3 py-2 text-[11px] font-bold text-white uppercase border" style={{ position:"sticky", left:0, background:TH1, zIndex:5, borderColor:"#145a2c" }}>Grand Total</td>
                <td className="text-right px-3 py-2 tabular-nums font-bold text-white border" style={{ position:"sticky", left:200, background:TH1, zIndex:5, borderColor:"#145a2c" }}>{fmtHrs(grandHrs)}</td>
                {projectNames.map(n => (
                  <td key={n} className="text-right px-2 py-2 tabular-nums font-semibold text-white border-l border-white/20">{fmtAmt(filteredProjectTotals.reduce((s,p)=>s+(p.names[n]?.amt||0),0))}</td>
                ))}
                <td className="text-right px-3 py-2 tabular-nums font-bold text-white border-l border-white/20">{fmtAmt(grandAmt)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  // ── Entry form (matches GAS entry modal layout) ────────────────────────────
  const renderForm = (isEditMode = false) => (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {/* Row 1: Record Type + Date */}
      <div>
        <label className={`block text-[10px] font-bold mb-1 uppercase tracking-widest ${txt2}`}>Record Type</label>
        <select value={form.recordType} onChange={e => {
          const recordType = e.target.value;
          setForm(f => {
            // GAS onEditRecordTypeChange: if switching to deduction, auto-set job to "Deductions" (readonly)
            // If switching away from deduction (and job is still "Deductions"), clear it
            // Applies in both add and edit mode
            let job = f.job;
            if (recordType === "deduction") {
              job = "Deductions";
            } else if (f.recordType === "deduction" && f.job === "Deductions") {
              job = "";
            }
            return { ...f, recordType, job };
          });
        }}
          className={`w-full rounded border text-xs px-2.5 py-2 outline-none ${inp}`}>
          <option value="payroll">Payroll (regular time entry)</option>
          <option value="deduction">Deduction</option>
          <option value="nonpayroll">Non-Payroll / Adjustment</option>
        </select>
      </div>
      <div>
        <label className={`block text-[10px] font-bold mb-1 uppercase tracking-widest ${txt2}`}>Date</label>
        <input type="date" value={form.date.replace(/(\d{2})\/(\d{2})\/(\d{4})/,"$3-$1-$2")}
          onChange={e=>{const v=e.target.value;if(v){const[y,m,d]=v.split("-");setForm(f=>({...f,date:`${m}/${d}/${y}`}));}else setForm(f=>({...f,date:""}));}}
          className={`w-full rounded border text-xs px-2.5 py-2 outline-none ${inp}`} />
      </div>

      {/* Row 2: Name + Company */}
      <div>
        <label className={`block text-[10px] font-bold mb-1 uppercase tracking-widest ${txt2}`}>Name <span style={{color:"#c62828"}}>*</span></label>
        <div className="flex gap-1">
          <input list="en-names" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
            className={`flex-1 rounded border text-xs px-2.5 py-2 outline-none ${inp}`} placeholder="Worker name" />
          {isEditMode && (
            <button type="button" className="px-2 py-1 rounded text-xs font-bold text-white flex-shrink-0"
              style={{ background:"#c62828" }}
              onClick={()=>setNamePickerOpen(true)}>
              ···
            </button>
          )}
        </div>
        <datalist id="en-names">{(entryDropdowns?.names||[]).map((n:string)=><option key={n} value={n}/>)}</datalist>
      </div>
      <div>
        <label className={`block text-[10px] font-bold mb-1 uppercase tracking-widest ${txt2}`}>
          Company {isEditMode && form.company && <span className="ml-1 text-[9px] font-bold px-1.5 py-px rounded" style={{background:"#d8f3dc",color:"#1a6b36"}}>OVERRIDE</span>}
        </label>
        {isEditMode
          ? <>
              <input value={form.company} onChange={e=>setForm(f=>({...f,company:e.target.value}))}
                className={`w-full rounded border text-xs px-2.5 py-2 outline-none ${inp}`} placeholder="e.g. 4YR or TI" />
              <p className={`text-[10px] italic mt-0.5 ${txt2}`}>Company is auto-derived from Job / Location. Enter a value here only to override that logic for this row.</p>
            </>
          : <div className={`w-full rounded border text-xs px-2.5 py-2 flex items-center justify-between gap-2 ${isLight?"bg-slate-50 border-slate-200 text-slate-400":"bg-[#1a1a1a] border-[#2a2a2a] text-slate-500"}`}>
              <span>🔗 Auto-set from Job / Location — No input needed.</span>
              {form.company && <span className="font-bold shrink-0" style={{color:"#1a6b36",fontSize:13}}>→ {form.company}</span>}
            </div>
        }
      </div>

      {/* Row 3: Job + Sub Cat */}
      <div>
        <label className={`block text-[10px] font-bold mb-1 uppercase tracking-widest ${txt2}`}>Job / Location <span style={{color:"#c62828"}}>*</span></label>
        {/* GAS onEditRecordTypeChange: deduction → job is "Deductions", readonly + muted (add + edit) */}
        <input list="en-jobs" value={form.job}
          readOnly={form.recordType === "deduction"}
          onChange={e => {
            if (form.recordType === "deduction") return; // readonly in deduction mode
            const job = e.target.value;
            const jl = job.trim().toLowerCase();
            // Mirror GAS autoFillCompanyPreview: TI for Timm Barn / Skating Rink, else 4YR
            const co = !isEditMode
              ? ((jl === "timm barn" || jl === "skating rink") ? "TI" : job.trim() ? "4YR" : "")
              : form.company; // edit mode keeps manual override
            setForm(f => ({ ...f, job, company: co }));
          }}
          className={`w-full rounded border text-xs px-2.5 py-2 outline-none ${
            form.recordType === "deduction"
              ? (isLight ? "bg-[#f5faf6] text-slate-400 border-slate-200" : "bg-[#1a1a1a] text-slate-500 border-[#272727]")
              : inp
          }`} placeholder="Job / location" />
        <datalist id="en-jobs">{(entryDropdowns?.jobs||[]).map((j:string)=><option key={j} value={j}/>)}</datalist>
      </div>
      <div>
        {/* GAS: subcat is required (*) for deduction and non-payroll */}
        <label className={`block text-[10px] font-bold mb-1 uppercase tracking-widest ${txt2}`}>
          Sub Cat / Function
          {(form.recordType === "deduction" || form.recordType === "nonpayroll") && <span style={{color:"#c62828"}}> *</span>}
        </label>
        <input list="en-subs" value={form.subCat} onChange={e=>setForm(f=>({...f,subCat:e.target.value}))}
          className={`w-full rounded border text-xs px-2.5 py-2 outline-none ${inp}`} placeholder="Optional" />
        <datalist id="en-subs">{(entryDropdowns?.subCats||[]).map((s:string)=><option key={s} value={s}/>)}</datalist>
      </div>

      {/* Time fields (payroll only) */}
      {!isNoTime && (<>
        <div>
          <label className={`block text-[10px] font-bold mb-1 uppercase tracking-widest ${txt2}`}>
            Started (Time){isEditMode && <span className={`ml-1 normal-case font-normal ${txt2}`}>HH:MM:SS AM/PM</span>}
          </label>
          {isEditMode
            ? <input type="text" value={form.started} placeholder="e.g. 01:59:00 PM" autoComplete="off"
                onChange={e => {
                  const started = e.target.value;
                  setForm(f => ({ ...f, started, hours: editHoursFromAmPm(started, f.finished) || f.hours }));
                }}
                className={`w-full rounded border text-xs px-2.5 py-2 outline-none ${inp}`} />
            : <input type="time" value={form.started}
                onChange={e => {
                  const started = e.target.value;
                  setForm(f => {
                    let hours = f.hours;
                    if (started && f.finished) {
                      const [sh,sm] = started.split(':').map(Number);
                      const [eh,em] = f.finished.split(':').map(Number);
                      let mins = (eh*60+em)-(sh*60+sm); if(mins<0) mins+=24*60;
                      hours = `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
                    }
                    return { ...f, started, hours };
                  });
                }}
                className={`w-full rounded border text-xs px-2.5 py-2 outline-none ${inp}`} />
          }
        </div>
        <div>
          <label className={`block text-[10px] font-bold mb-1 uppercase tracking-widest ${txt2}`}>
            End (Time){isEditMode && <span className={`ml-1 normal-case font-normal ${txt2}`}>HH:MM:SS AM/PM</span>}
          </label>
          {isEditMode
            ? <input type="text" value={form.finished} placeholder="e.g. 04:24:00 PM" autoComplete="off"
                onChange={e => {
                  const finished = e.target.value;
                  setForm(f => ({ ...f, finished, hours: editHoursFromAmPm(f.started, finished) || f.hours }));
                }}
                className={`w-full rounded border text-xs px-2.5 py-2 outline-none ${inp}`} />
            : <input type="time" value={form.finished}
                onChange={e => {
                  const finished = e.target.value;
                  setForm(f => {
                    let hours = f.hours;
                    if (f.started && finished) {
                      const [sh,sm] = f.started.split(':').map(Number);
                      const [eh,em] = finished.split(':').map(Number);
                      let mins = (eh*60+em)-(sh*60+sm); if(mins<0) mins+=24*60;
                      hours = `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
                    }
                    return { ...f, finished, hours };
                  });
                }}
                className={`w-full rounded border text-xs px-2.5 py-2 outline-none ${inp}`} />
          }
        </div>
        <div className="col-span-2">
          <label className={`block text-[10px] font-bold mb-1 uppercase tracking-widest ${txt2}`}>
            Hours{isEditMode && <span className={`ml-1 normal-case font-normal ${txt2}`}>HH:MM:SS</span>}
          </label>
          <input type="text" value={form.hours}
            onChange={e => {
              // GAS _editHoursExplicit: one-time flag — if user types here, mark as explicitly edited
              if (isEditMode && !hoursExplicit) setHoursExplicit(true);
              setForm(f => ({...f, hours: e.target.value}));
            }}
            className={`w-full rounded border text-xs px-2.5 py-2 outline-none ${inp}`} placeholder="e.g. 06:00" />
          <p className={`text-[10px] italic mt-0.5 ${txt2}`}>Auto-fills from Start / End — edit to override.</p>
        </div>
      </>)}

      {/* Amount (deduction / non-payroll) */}
      {isNoTime && (
        <div className="col-span-2">
          <label className={`block text-[10px] font-bold mb-1 uppercase tracking-widest ${txt2}`}>Amount ($)</label>
          <input type="number" value={form.amount} step="0.01" onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
            className={`w-full rounded border text-xs px-2.5 py-2 outline-none ${inp}`} placeholder="0.00" />
          <p className={`text-[10px] italic mt-0.5 ${txt2}`}>Enter the dollar amount (positive — will be saved as negative automatically).</p>
        </div>
      )}

      {/* Remarks */}
      <div className="col-span-2">
        <label className={`block text-[10px] font-bold mb-1 uppercase tracking-widest ${txt2}`}>Remarks <span style={{color:"#c62828",fontWeight:800}}>(SHOWN IN RED)</span></label>
        <textarea value={form.remarks} onChange={e=>setForm(f=>({...f,remarks:e.target.value}))}
          className={`w-full rounded border text-xs px-2.5 py-2 outline-none resize-y min-h-[54px] ${inp}`}
          style={{color:form.remarks?"#c62828":undefined}} placeholder="Optional notes…" />
      </div>
    </div>
  );

  // ── MAIN RENDER ────────────────────────────────────────────────────────────
  return (
    <div ref={pageRef} className={`flex flex-col h-full overflow-hidden ${bg} ${txt}`}>

      {/* ── Top bar (GAS: .topbar) ── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-0" style={{ background:"#1a6b36", height:54, boxShadow:"0 2px 8px rgba(0,0,0,.18)" }}>
        {/* Logo on white pill — same pattern as GAS .topbar-logo-fallback */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div style={{ height:38, display:"flex", alignItems:"center", padding:"2px 10px", background:"#fff", borderRadius:5, flexShrink:0 }}>
            <img src="/logos/4yr.png" alt="4YouPros" style={{ maxHeight:30, maxWidth:130, objectFit:"contain", display:"block" }} />
          </div>
          <div className="w-px h-7" style={{ background:"rgba(255,255,255,.25)" }} />
          <span className="text-white font-bold text-[15px] tracking-tight whitespace-nowrap">Payroll Dashboard</span>
        </div>
        {selectedWeeks.length > 0 && (
          <span className="text-[11px] text-white/90 px-2.5 py-1 rounded-full font-semibold" style={{ background:"rgba(255,255,255,.18)" }}>
            {weekLabel}
          </span>
        )}
        {loading && <span className="text-[11px] text-green-200 animate-pulse ml-1">Refreshing…</span>}

        {/* Right side: Open Dashboard link + trademark */}
        <div className="ml-auto flex flex-col items-end gap-0.5">
          <a href="https://docs.google.com/spreadsheets/d/1SITtQDT3iFo5yIOBgjbERbqJjYJ8rk6drXwkLm3sAGE/edit#gid=1484569924"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold text-white no-underline transition-all"
            style={{ background:"rgba(255,255,255,.18)", border:"1px solid rgba(255,255,255,.3)", height:28 }}>
            Open Source Sheet ↗
          </a>
          <span className="text-[9px] font-light opacity-50 tracking-wide text-white pr-0.5">® Made by Finance Team</span>
        </div>
      </div>

      {/* ── Auth error banner ── */}
      {authError && (
        <div className={`shrink-0 flex items-center justify-between px-4 py-2 border-b text-xs font-medium ${isLight?"bg-red-50 border-red-200 text-red-700":"bg-red-950/30 border-red-800/40 text-red-400"}`}>
          <span>🔑 Google Sheets token expired — reconnect to load data.</span>
          <button onClick={async()=>{ setAuthError(false); await handleGoogleSignIn?.(); lastKeyRef.current=""; doLoad(); }}
            className="ml-4 px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold whitespace-nowrap">
            🔄 Reconnect Google
          </button>
        </div>
      )}

      {/* ── Page tabs (GAS: .page-nav / .page-tab) ── */}
      <div className="shrink-0 flex items-center px-4" style={{ background:"#145a2c", borderBottom:"2px solid #0e3d1e" }}>
        {([{id:"payroll",l:"📊 Payroll"},{id:"project",l:"🏗️ Project Total"}] as {id:MainTab;l:string}[]).map(t => (
          <button key={t.id} onClick={() => setMainTab(t.id)}
            className="px-5 py-2.5 text-xs font-bold transition-all whitespace-nowrap"
            style={{
              color: mainTab===t.id ? "#fff" : "rgba(255,255,255,.6)",
              borderBottom: mainTab===t.id ? "3px solid #52b788" : "3px solid transparent",
              marginBottom: -2,
              background: mainTab===t.id ? "rgba(255,255,255,.07)" : "transparent",
            }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── Filter bar (GAS: .filter-bar) ── */}
      <div className={`shrink-0 flex flex-wrap items-end gap-2.5 px-5 py-2.5 border-b ${bdr}`} style={{ background:isLight?"#fff":"#0f0f0f" }}>
        {/* Year */}
        <div className="flex flex-col gap-0.5">
          <label className={`text-[10px] font-bold uppercase tracking-widest ${txt2}`}>Year</label>
          <select value={yearFilter} onChange={e => onYearChange(e.target.value)}
            className={`rounded border text-xs px-2 py-1.5 outline-none cursor-pointer ${inp}`} style={{ minWidth:80 }}>
            <option value="">— All Years —</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Week Range */}
        <div className="flex flex-col gap-0.5" style={{ position:"relative" }}>
          <label className={`text-[10px] font-bold uppercase tracking-widest ${txt2}`}>
            Week Range <span className="normal-case font-normal opacity-70">(click to select multiple)</span>
          </label>
          <button onClick={() => setWeekDropOpen(o=>!o)}
            className={`flex items-center gap-2 rounded border text-xs px-2.5 py-1.5 outline-none ${inp} whitespace-nowrap cursor-pointer`}
            style={{ minWidth:200, justifyContent:"space-between" }}>
            <span className="truncate">{weekLabel}</span>
            <span className={`text-[9px] ml-1 ${txt2}`}>{weekDropOpen ? "▲" : "▼"}</span>
          </button>
          {weekDropOpen && (
            <div className={`absolute top-full left-0 mt-1 z-50 rounded-xl border shadow-2xl overflow-hidden ${bg} ${bdr}`} style={{ minWidth:280, maxHeight:340 }}>
              <div className={`flex items-center justify-between px-3 py-2 border-b ${bdr}`} style={{ background:isLight?"#f5faf6":"#1a1e26" }}>
                <span className={`text-xs font-semibold ${txt}`}>Select Weeks</span>
                <div className="flex gap-2">
                  <button onClick={onWeekClear} className={`text-[11px] ${txt2} hover:text-red-500`}>Clear</button>
                  <button onClick={() => { setWeekDropOpen(false); doLoad(); }} className="text-[11px] px-2 py-0.5 rounded text-white font-bold" style={{ background:TH1 }}>Apply</button>
                </div>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight:280 }} ref={weekListRef}>
                {filteredWeeks.map(w => (
                  <label key={w.weekNum}
                    data-selected={selectedWeeks.includes(w.weekNum) ? "true" : "false"}
                    className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-xs border-b ${tbBdr} ${tbRow}`}
                    onClick={() => onWeekToggle(w.weekNum)}>
                    <div style={{
                      width:13, height:13, borderRadius:3, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9,
                      background: selectedWeeks.includes(w.weekNum) ? TH1 : "transparent",
                      border: `1.5px solid ${selectedWeeks.includes(w.weekNum) ? TH1 : isLight?"#cde0d3":"#2e3340"}`,
                      color:"#fff",
                    }}>
                      {selectedWeeks.includes(w.weekNum) ? "✓" : ""}
                    </div>
                    <span className={selectedWeeks.includes(w.weekNum) ? `font-semibold ${isLight?"text-[#1a6b36]":"text-[#7fd99a]"}` : txt3}>
                      <span className={`font-mono text-[10px] mr-1.5 ${txt2}`}>{w.weekNum}</span>{w.label}
                    </span>
                  </label>
                ))}
                {filteredWeeks.length === 0 && <p className={`text-center py-6 text-xs italic ${txt2}`}>No weeks for selected year</p>}
              </div>
              <div className={`border-t ${bdr}`} style={{ background:isLight?"#f5faf6":"#1a1e26" }}>
                <button onClick={() => { filteredWeeks.forEach(w => { if (!selectedWeeks.includes(w.weekNum)) onWeekToggle(w.weekNum); }); }}
                  className={`w-full text-xs py-1.5 font-medium ${txt2} hover:text-green-600`}>Select All</button>
              </div>
            </div>
          )}
        </div>

        {/* Name */}
        <div className="flex flex-col gap-0.5">
          <label className={`text-[10px] font-bold uppercase tracking-widest ${txt2}`}>Name</label>
          <select value={nameFilter} onChange={e => onNameChange(e.target.value)}
            className={`rounded border text-xs px-2 py-1.5 outline-none cursor-pointer ${inp}`} style={{ minWidth:160 }}>
            <option value="">— All Names —</option>
            {contextNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Job */}
        <div className="flex flex-col gap-0.5">
          <label className={`text-[10px] font-bold uppercase tracking-widest ${txt2}`}>Job / Location</label>
          <select value={jobFilter} onChange={e => onJobChange(e.target.value)}
            className={`rounded border text-xs px-2 py-1.5 outline-none cursor-pointer ${inp}`} style={{ minWidth:160 }}>
            <option value="">— All Jobs —</option>
            {contextJobs.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>

        {/* Specific Date + Reset */}
        <div className="flex flex-col gap-0.5">
          <label className={`text-[10px] font-bold uppercase tracking-widest ${txt2}`}>Specific Date</label>
          <div className="flex items-center gap-1.5">
            <input type="date" value={dateFilter.replace(/(\d{2})\/(\d{2})\/(\d{4})/,"$3-$1-$2")}
              onChange={e => onDateChange(e.target.value)}
              className={`rounded border text-xs px-2 py-1.5 outline-none ${inp}`} style={{ minWidth:140 }} />
            {/* Reset button (GAS: .btn-reset with ↺ icon) */}
            <button onClick={resetFilters} className={`rounded border px-2 py-1.5 transition-colors ${btnCls}`} title="Reset all filters">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Right-side action cluster: Refresh + Screenshot + Add + Delete */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          {/* Refresh — icon only */}
          <button onClick={() => { lastKeyRef.current = ""; doLoad(); }}
            disabled={loading}
            className="flex items-center justify-center w-8 h-8 rounded"
            style={{ background:isLight?"#e3f2fd":"#1a2433", border:`1px solid ${isLight?"#90caf9":"#2e5c8a"}`, color:isLight?"#1565c0":"#90caf9", opacity: loading ? 0.6 : 1, fontSize:16 }}
            title="Refresh data from Google Sheets">
            {loading ? "⏳" : "🔄"}
          </button>
          {/* Screenshot — icon only, with dropdown */}
          <div className="relative flex-shrink-0">
            <button onClick={() => setSsMenuOpen(o=>!o)}
              className="flex items-center justify-center w-8 h-8 rounded"
              style={{ background:isLight?"#e8f5e9":"#1a2a1f", border:`1px solid ${isLight?"#8cb89a":"#2e6a3f"}`, color:isLight?"#1a6b36":"#7fd99a", fontSize:16 }}
              title="Take screenshot">
              {ssCapturing ? "⏳" : "📷"}
            </button>
            {ssMenuOpen && (
              <div className="absolute top-full right-0 mt-1 rounded-xl overflow-hidden z-[600]"
                style={{ background:"#fff", border:"1px solid #e4e8f0", boxShadow:"0 4px 18px rgba(26,73,140,.13)", minWidth:170 }}>
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color:"#b0b8c9" }}>Screenshot</div>
                {[["visible","🖥 Visible Area"],["full","📄 Full Content"]].map(([m,l]) => (
                  <div key={m} className="flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-all hover:bg-[#f0f5ff]"
                    style={{ color:"#333" }} onClick={() => takeScreenshot(m as any)}>
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Add Record — with text */}
          <button onClick={openAddModal}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold text-white whitespace-nowrap"
            style={{ background:"#2d8a52", border:"1px solid #1a6b36" }}>
            ➕ Add Record
          </button>
          {/* Delete Record — with text */}
          <button onClick={() => { setActiveTab("detail"); setMainTab("payroll"); }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold text-white whitespace-nowrap"
            style={{ background:"#e53935", border:"1px solid #b71c1c" }}>
            🗑️ Delete Record
          </button>
          {/* Start New Week — icon-only square */}
          <button onClick={handleStartNewWeek}
            disabled={startingWeek}
            className="flex items-center justify-center w-8 h-8 rounded"
            style={{ background: startingWeek ? "#555" : "#1565c0", border:"1px solid #0d47a1", opacity: startingWeek ? 0.7 : 1, fontSize:16 }}
            title="Start New Week — duplicates TEMPLATE sheet into a new week tab">
            {startingWeek ? "⏳" : "🗓️"}
          </button>
        </div>
      </div>

      {weekDropOpen && <div className="fixed inset-0 z-40" onClick={() => setWeekDropOpen(false)} />}
      {ssMenuOpen   && <div className="fixed inset-0 z-[599]" onClick={() => setSsMenuOpen(false)} />}

      {/* ── KPI Strip (GAS: .kpi-row) ── */}
      <div className={`shrink-0 flex flex-wrap gap-3 px-5 py-3 border-b ${bdr}`} style={{ background:isLight?"#f4f7f5":"#0f0f0f" }}>
        {[
          { label:"Total Hours",  val:fmtHrs(totals.hours),  sub:"Logged hrs",    c:isLight?"#1a6b36":"#52b788" },
          { label:"Total Amount", val:fmtAmt(totals.amount), sub:"Gross payroll", c:isLight?"#1a6b36":"#52b788" },
          { label:"Entries",      val:String(rows.length),   sub:"Time records",  c:"#7c3aed" },
          { label:"Workers",      val:String(kpiWorkers),    sub:"Unique names",  c:"#d97706" },
        ].map(k => (
          <div key={k.label} className={`rounded-lg border ${bdr} px-4 py-3`} style={{ background:isLight?"#fff":"#22262f", boxShadow:"0 2px 8px rgba(0,0,0,.08)", minWidth:130 }}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${txt2}`}>{k.label}</p>
            <p className="text-[22px] font-bold tabular-nums leading-tight" style={{ color:k.c }}>{k.val}</p>
            <p className={`text-[10px] mt-0.5 ${txt2}`}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Main content ── */}
      {mainTab === "payroll" ? (
        <>
          {/* Inner tabs (GAS: .tabs / .tab) */}
          <div className={`shrink-0 flex items-center gap-0.5 px-5 pt-3 border-b ${bdr}`}>
            {([{id:"grouped",l:"🗂️ Weekly Summary"},{id:"pivot",l:"📅 Summary by Date"},{id:"detail",l:"📋 Detail Log"}] as {id:Tab;l:string}[]).map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 text-xs font-semibold rounded-t transition-all -mb-px border border-b-0`}
                style={{
                  background: activeTab===t.id ? (isLight?"#fff":"#22262f") : isLight?"#e8f2eb":"#1a1a1a",
                  color: activeTab===t.id ? (isLight?"#1a6b36":"#52b788") : isLight?"#6b8f71":"#8b96ab",
                  borderColor: activeTab===t.id ? (isLight?"#cde0d3":"#2e3340") : "transparent",
                }}>
                {t.l}
              </button>
            ))}
          </div>
          {/* Tab body (GAS: .tab-body) */}
          <div className={`flex-1 min-h-0 overflow-hidden flex flex-col px-5 py-4 border ${bdr} rounded-bl rounded-br`}
            style={{ background:isLight?"#fff":"#22262f", margin:"0 8px 8px 8px" }}>
            {activeTab==="grouped" && renderGrouped()}
            {activeTab==="pivot"   && renderPivot()}
            {activeTab==="detail"  && renderDetail()}
            {!dataLoaded && !loading && (
              <div className={`text-center py-20 text-sm italic ${txt2}`}>{getAccessToken()?"Initializing…":"Google sign-in required."}</div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-5 py-4">
          {renderProjectTotal()}
        </div>
      )}

      {/* ── Add Modal ── */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>{ if (tscanResult) { setShowCloseConfirm(true); } else { setAddModalOpen(false); setScanKey(k=>k+1); } }} />
          <div className={`relative z-10 rounded-2xl shadow-2xl border ${bdr} ${bg} w-full max-w-lg overflow-hidden`}>
            <div className="h-1.5 w-full" style={{ backgroundColor: TH1 }} />
            <div className={`flex items-center justify-between px-5 py-4 border-b ${bdr}`}>
              <div>
                <h2 className="font-bold text-sm" style={{ color: TH1 }}>➕ Add Record</h2>
                <p className={`text-[11px] mt-0.5 ${txt2}`}>Payroll, deduction, or non-payroll entry</p>
              </div>
              <button onClick={()=>{ if (tscanResult) { setShowCloseConfirm(true); } else { setAddModalOpen(false); setScanKey(k=>k+1); } }} className={`w-7 h-7 flex items-center justify-center rounded text-xl ${isLight ? "text-slate-400 hover:text-slate-700 hover:bg-slate-100" : "text-[#666] hover:text-white hover:bg-[#2a2a2a]"}`}>×</button>
            </div>
            <div className="px-5 py-4 overflow-y-auto space-y-4" style={{ maxHeight:"65vh" }}>
              {/* Scan timesheet to auto-fill */}
              <ScanToFill
                type="timesheet"
                isLight={isLight}
                resetKey={scanKey}
                onFill={(data) => {
                  setTscanResult(data);
                }}
              />
              {/* Day picker after scan */}
              {tscanResult && tscanResult.days && tscanResult.days.length > 0 && (
                <div className={`rounded-lg border p-3 space-y-2 text-xs ${isLight ? "bg-green-50 border-green-200" : "bg-[#0a1a10] border-[#1a3a20]"}`}>
                  <div className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? "text-green-700" : "text-green-400"}`}>
                    ✓ Scanned: <span className="normal-case font-black">{tscanResult.employeeName}</span> — pick a day to fill the form
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tscanResult.days.map((day: any, i: number) => (
                      <button key={i} type="button"
                        onClick={() => {
                          // Normalize time to HH:MM 24-hour format for <input type="time">
                          const normTime = (t: string, isEnd = false) => {
                            if (!t) return "";
                            // Strip seconds if present (HH:MM:SS → HH:MM)
                            const parts = t.replace(/[ap]m/i, "").trim().split(":");
                            let h = parseInt(parts[0] || "0", 10);
                            const m = (parts[1] || "00").slice(0, 2).padStart(2, "0");
                            // If hour is suspiciously small for an end time, assume PM
                            if (isEnd && h > 0 && h < 7) h += 12;
                            // If AM/PM present in original, handle it
                            if (/pm/i.test(t) && h < 12) h += 12;
                            if (/am/i.test(t) && h === 12) h = 0;
                            return `${String(h).padStart(2, "0")}:${m}`;
                          };
                          // Parse date → MM/DD/YYYY for the form
                          const inferYear = () => {
                            // Try to get year from weekStart/weekEnd if they have it
                            const ws = tscanResult.weekStart || tscanResult.weekEnd || "";
                            const y = ws.match(/(\d{4})/);
                            return y ? y[1] : String(new Date().getFullYear());
                          };
                          let dateFmt = "";
                          const raw = (day.date || "").trim();
                          if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                            // YYYY-MM-DD → MM/DD/YYYY
                            const [y,m,d] = raw.split("-");
                            dateFmt = `${m}/${d}/${y}`;
                          } else if (/^\d{1,2}[-/]\d{1,2}$/.test(raw)) {
                            // MM-DD or MM/DD → MM/DD/YYYY using inferred year
                            const [m,d] = raw.split(/[-/]/);
                            dateFmt = `${m.padStart(2,"0")}/${d.padStart(2,"0")}/${inferYear()}`;
                          } else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(raw)) {
                            // MM/DD/YY or MM/DD/YYYY
                            const parts = raw.split(/[-/]/);
                            const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                            dateFmt = `${parts[0].padStart(2,"0")}/${parts[1].padStart(2,"0")}/${y}`;
                          }
                          // Fuzzy-match scanned name/job to closest existing entry
                          const matchedName = tscanResult.employeeName
                            ? fuzzyBest(tscanResult.employeeName, allNames)
                            : "";
                          const matchedJob = tscanResult.job
                            ? fuzzyBest(tscanResult.job, allJobs)
                            : "";
                          setForm(f => ({
                            ...f,
                            name: matchedName || tscanResult.employeeName || f.name,
                            date: dateFmt || f.date,
                            started: normTime(day.clockIn || ""),
                            finished: normTime(day.clockOut || "", true),
                            hours: day.totalHours != null ? String(day.totalHours) : f.hours,
                            job: matchedJob || tscanResult.job || f.job,
                          }));
                          // Keep picker open — user can pick next day after submitting this one
                        }}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${isLight ? "bg-white border-green-300 text-green-800 hover:bg-green-100" : "bg-[#0d1a14] border-[#1e4028] text-green-300 hover:bg-[#143020]"}`}>
                        <span className="font-bold">{day.dayOfWeek}</span>
                        {day.date ? ` · ${day.date}` : ""}
                        {day.totalHours != null ? <span className="ml-1 opacity-70">({day.totalHours}h)</span> : ""}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => { setTscanResult(null); setScanKey(k => k + 1); }} className={`text-[10px] underline opacity-60 hover:opacity-100 ${isLight ? "text-green-700" : "text-green-400"}`}>Dismiss & scan again</button>
                </div>
              )}
              {renderForm(false)}
            </div>
            <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${bdr} ${bg3}`}>
              <button disabled={modalBusy} onClick={()=>{ if (tscanResult) { setShowCloseConfirm(true); } else { setAddModalOpen(false); setScanKey(k=>k+1); } }} className={`text-xs px-4 py-2 rounded border ${bdr} ${txt2} disabled:opacity-40`}>Cancel</button>
              <button disabled={modalBusy} onClick={submitAdd} className="text-xs px-5 py-2 rounded text-white font-semibold flex items-center gap-1.5 disabled:opacity-60" style={{ background:TH1 }}>
                {modalBusy ? <><span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : <>💾 Add to Sheet</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scan Close Confirmation Dialog ── */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCloseConfirm(false)} />
          <div className={`relative z-10 rounded-2xl shadow-2xl border overflow-hidden w-full max-w-sm ${isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#1c2030] border-[#2e3340] text-white"}`}
            style={{ boxShadow: "0 0 0 1px rgba(255,165,0,.15), 0 24px 64px rgba(0,0,0,.5)" }}>
            <div className="h-1 w-full" style={{ background: "#f97316" }} />
            <div className="px-6 py-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none mt-0.5">⚠️</span>
                <div>
                  <h3 className="font-bold text-sm leading-snug">Confirm discard scan results?</h3>
                  <p className={`text-[12px] mt-1.5 leading-relaxed ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                    Closing now will clear the current scan data. Make sure all required entries have been logged — you'll need to re-scan the timesheet if any are missing.
                  </p>
                </div>
              </div>
            </div>
            <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${isLight ? "border-slate-100 bg-slate-50" : "border-[#2e3340] bg-[#161922]"}`}>
              <button
                onClick={() => setShowCloseConfirm(false)}
                className={`text-xs px-4 py-2 rounded border font-medium transition-colors ${isLight ? "border-slate-200 text-slate-600 hover:bg-slate-100" : "border-[#2e3340] text-slate-400 hover:bg-[#22262f]"}`}>
                Continue logging
              </button>
              <button
                onClick={() => { setShowCloseConfirm(false); setAddModalOpen(false); setTscanResult(null); setScanKey(k => k + 1); }}
                className="text-xs px-4 py-2 rounded text-white font-semibold transition-colors"
                style={{ background: "#f97316" }}>
                Discard &amp; close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editModalOpen && editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setEditModalOpen(false)} />
          <div className={`relative z-10 rounded-2xl shadow-2xl border ${bdr} ${bg} w-full max-w-lg overflow-hidden`}>
            <div className="h-1.5 w-full" style={{ backgroundColor: TH1 }} />
            <div className={`flex items-center justify-between px-5 py-4 border-b ${bdr}`}>
              <div>
                <h2 className="font-bold text-sm" style={{ color: TH1 }}>✏️ Edit Record</h2>
                <p className={`text-[11px] mt-0.5 ${txt2}`}>{editingRow.name} · {editingRow.date}</p>
              </div>
              <button onClick={()=>setEditModalOpen(false)} className={`w-7 h-7 flex items-center justify-center rounded text-xl ${isLight ? "text-slate-400 hover:text-slate-700 hover:bg-slate-100" : "text-[#666] hover:text-white hover:bg-[#2a2a2a]"}`}>×</button>
            </div>
            <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight:"65vh" }}>{renderForm(true)}</div>
            <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${bdr} ${bg3}`}>
              <button disabled={modalBusy} onClick={()=>setEditModalOpen(false)} className={`text-xs px-4 py-2 rounded border ${bdr} ${txt2} disabled:opacity-40`}>Cancel</button>
              <button disabled={modalBusy} onClick={submitEdit} className="text-xs px-5 py-2 rounded text-white font-semibold flex items-center gap-1.5 disabled:opacity-60" style={{ background:TH1 }}>
                {modalBusy ? <><span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : <>💾 Save Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Employee YTD History Modal ── */}
      {empModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEmpModalOpen(false)} />
          <div className={`relative z-10 rounded-xl shadow-2xl border ${bdr} ${bg} w-full overflow-hidden flex flex-col`}
            style={{ maxWidth:720, maxHeight:"88vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ background:TH1 }}>
              <h2 className="font-bold text-sm text-white">👤 {empModalName} — YTD History</h2>
              <button onClick={() => setEmpModalOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded text-white/70 hover:text-white text-xl"
                style={{ background:"rgba(255,255,255,.1)" }}>×</button>
            </div>
            {/* Body */}
            <div className="overflow-y-auto p-5 flex-1">
              {empModalLoading && (
                <div className={`text-center py-10 text-sm ${txt2}`}>⏳ Loading history…</div>
              )}
              {empModalData?.error && (
                <div className="text-center py-10 text-sm" style={{ color:"#c62828" }}>⚠ {empModalData.error}</div>
              )}
              {empModalData && !empModalData.error && !empModalLoading && (() => {
                const { payroll=[], deductions=[], nonPayroll=[], totals={} } = empModalData;
                const buildEmpTable = (rows: any[], type: string) => {
                  const isDeduct = type==="deduct", isNonPay = type==="nonpay";
                  const footBg = isDeduct?"#c62828":isNonPay?"#7a4f00":TH1;
                  let tHrs=0, tAmt=0; rows.forEach(r=>{ tHrs+=r.hours||0; tAmt+=r.amount||0; });
                  return (
                    <table key={type} className="text-xs border-collapse w-full mb-1">
                      <thead><tr style={{ background:TH1 }}>
                        {["Job / Location","Sub Category","Hours","Amount"].map((h,i) => (
                          <th key={h} className={`py-2 px-3 text-[11px] font-bold text-white whitespace-nowrap ${i>=2?"text-right":""}`}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {rows.map((r:any, i:number) => {
                          const isNeg = r.amount < 0;
                          const rBg = i%2===0 ? (isLight?"#fff":"#22262f") : (isLight?"#f5faf6":"#262b35");
                          return (
                            <tr key={i} className={`border-b ${tbBdr}`} style={{ background:rBg }}>
                              <td className={`px-3 py-1.5 ${txt3}`}>{r.job||"—"}</td>
                              <td className={`px-3 py-1.5 ${txt2}`}>{r.subCat&&r.subCat!=="(none)"?r.subCat:"—"}</td>
                              <td className={`text-right px-3 py-1.5 tabular-nums ${isNeg?"text-red-500":txt3}`}>{r.hours?fmtHrs(r.hours):"—"}</td>
                              <td className="text-right px-3 py-1.5 tabular-nums font-semibold" style={{ color:isNeg?DED_FG:isLight?"#1a5c2a":"#7fd99a" }}>{r.amount?fmtAmt(r.amount):"—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot><tr style={{ background:footBg }}>
                        <td colSpan={2} className="px-3 py-2 text-[11px] font-bold text-white">Total</td>
                        <td className="text-right px-3 py-2 tabular-nums font-bold text-white">{tHrs?fmtHrs(tHrs):"—"}</td>
                        <td className="text-right px-3 py-2 tabular-nums font-bold text-white">{tAmt<0?`-${fmtAmt(Math.abs(tAmt))}`:fmtAmt(tAmt)}</td>
                      </tr></tfoot>
                    </table>
                  );
                };
                return (
                  <div className="flex flex-col gap-4">
                    {/* KPI row */}
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { l:"YTD Hours", v:fmtHrs(totals.hours||0), cls:"bg-[#f0faf2] border-[#cde0d3]", vc:isLight?"#1a6b36":"#52b788", dark:"bg-[#1e2530] border-[#2e3340]" },
                        { l:"YTD Payroll", v:fmtAmt(totals.amount||0), cls:"bg-[#f0faf2] border-[#cde0d3]", vc:isLight?"#1a6b36":"#52b788", dark:"bg-[#1e2530] border-[#2e3340]" },
                        ...(totals.deductionAmt?[{ l:"YTD Deductions", v:`-${fmtAmt(Math.abs(totals.deductionAmt))}`, cls:"bg-[#fff5f5] border-[#e8a0a0]", vc:"#c62828", dark:"bg-[#3a1f22] border-[#6a2020]" }]:[]),
                        ...(totals.nonPayrollAmt?[{ l:"YTD Non-Payroll", v:fmtAmt(totals.nonPayrollAmt), cls:"bg-[#fff8e6] border-[#f4c26a]", vc:"#7a4f00", dark:"bg-[#3a3320] border-[#6a5a20]" }]:[]),
                      ].map(k => (
                        <div key={k.l} className={`rounded-lg border px-4 py-2 ${isLight?k.cls:k.dark}`}>
                          <div className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${txt2}`}>{k.l}</div>
                          <div className="text-[18px] font-bold" style={{ color:k.vc }}>{k.v}</div>
                        </div>
                      ))}
                    </div>
                    {payroll.length>0 && <div><div className={`text-[11px] font-bold uppercase tracking-wide mb-2 pb-1 border-b-2 ${isLight?"border-[#d8f3dc] text-[#6b8f71]":"border-[#2e3340] text-[#8b96ab]"}`}>Payroll — by Job</div>{buildEmpTable(payroll,"normal")}</div>}
                    {deductions.length>0 && <div><div className="text-[11px] font-bold uppercase tracking-wide mb-2 pb-1 border-b-2 border-[#ffd0d0] text-red-500">Deductions</div>{buildEmpTable(deductions,"deduct")}</div>}
                    {nonPayroll.length>0 && <div><div className="text-[11px] font-bold uppercase tracking-wide mb-2 pb-1 border-b-2 border-[#ffe8a0]" style={{color:"#7a4f00"}}>Non-Payroll / Adjustments</div>{buildEmpTable(nonPayroll,"nonpay")}</div>}
                    {!payroll.length&&!deductions.length&&!nonPayroll.length && (
                      <div className={`text-center py-10 text-sm italic ${txt2}`}>No YTD records found for {empModalName}.</div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Name Picker (replaces native prompt) ── */}
      {namePickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setNamePickerOpen(false)} />
          <div className={`relative z-10 rounded-xl shadow-2xl border ${bdr} ${bg} w-full max-w-xs p-5`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`font-bold text-sm ${txt}`}>Select Name</h2>
              <button onClick={()=>setNamePickerOpen(false)} className={`w-7 h-7 flex items-center justify-center rounded ${bg3} ${txt2} text-xl`}>×</button>
            </div>
            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {(entryDropdowns?.names||[]).map((n:string)=>(
                <button key={n} onClick={()=>{ setForm(f=>({...f,name:n})); setNamePickerOpen(false); }}
                  className={`text-left text-xs px-3 py-2 rounded transition-colors ${form.name===n?(isLight?"bg-blue-100 text-blue-800 font-semibold":"bg-blue-900/40 text-blue-300 font-semibold"):(isLight?"hover:bg-slate-100 text-slate-700":"hover:bg-white/5 text-slate-300")}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setDeleteConfirm(null)} />
          <div className={`relative z-10 rounded-xl shadow-2xl border ${bdr} ${bg} w-full max-w-sm p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-sm" style={{ color:"#c62828" }}>🗑️ Confirm Delete</h2>
              <button onClick={()=>setDeleteConfirm(null)} className={`w-7 h-7 flex items-center justify-center rounded ${bg3} ${txt2} text-xl`}>×</button>
            </div>
            <div className={`text-xs px-3 py-2 rounded mb-4 ${isLight?"bg-slate-50 text-slate-600":"bg-[#1a1a1a] text-slate-400"}`}>
              <strong className={txt}>{deleteConfirm.name}</strong> · {deleteConfirm.date} · {deleteConfirm.job}
            </div>
            <p className="text-xs mb-5" style={{ color:"#c62828", fontWeight:600 }}>⚠ This permanently deletes this row from the sheet and cannot be undone.</p>
            <div className="flex items-center justify-end gap-2">
              <button disabled={modalBusy} onClick={()=>setDeleteConfirm(null)} className={`text-xs px-4 py-2 rounded border ${bdr} ${txt2} disabled:opacity-40`}>Cancel</button>
              <button disabled={modalBusy} onClick={confirmDelete} className="text-xs px-5 py-2 rounded text-white font-semibold flex items-center gap-1.5 disabled:opacity-60" style={{ background:"#e53935" }}>
                {modalBusy ? <><span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting…</> : <>🗑️ Yes, Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
