/**
 * FourYrPayrollPage — Portal-integrated 4YouPros Payroll dashboard.
 * Reads/writes directly to the Google Sheets 'raw' tab via Express API.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
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
  const { theme } = useFinance();
  const isLight   = theme === "light";

  const { toasts, show: showToast } = useToast();

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [yearFilter,    setYearFilter]    = useState(currentYear());
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const [nameFilter,    setNameFilter]    = useState("");
  const [jobFilter,     setJobFilter]     = useState("");
  const [dateFilter,    setDateFilter]    = useState("");

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

  // ── Collapsed rows in grouped view ────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const lastKeyRef  = useRef("");

  // ── API helpers ───────────────────────────────────────────────────────────────
  const apiGet = useCallback(async (path: string) => {
    const tok = getAccessToken();
    const res = await fetch(path, { headers: { Authorization: `Bearer ${tok}` } });
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
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
    return res.json();
  }, []);

  // ── Load dropdowns ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!getAccessToken()) return;
    apiGet("/api/4yr/dropdown-data").then(data => {
      setYears(data.years || []);
      setAllWeeks(data.weeks || []);
      setAllNames(data.names || []);
      setAllJobs(data.jobs || []);
      setWeekContext(data.weekContext || {});
      // Default to current week
      const now = new Date();
      const todayWeek = (data.weeks as WeekMeta[]).find(w => {
        const start = new Date(w.startDate.replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2"));
        const end   = new Date(w.endDate.replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2"));
        end.setHours(23, 59, 59, 999);
        return now >= start && now <= end;
      });
      if (todayWeek) setSelectedWeeks([todayWeek.weekNum]);
    }).catch(e => showToast(`Failed to load dropdowns: ${e.message}`, "error"));
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
        showToast(`Failed to load data: ${e.message}`, "error");
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
  const filteredWeeks = React.useMemo(() => {
    if (!yearFilter) return allWeeks;
    return allWeeks.filter(w => String(w.year) === String(yearFilter));
  }, [allWeeks, yearFilter]);

  // ── Context-aware name/job dropdowns ─────────────────────────────────────────
  const contextNames = React.useMemo(() => {
    if (!selectedWeeks.length) return allNames;
    const names = new Set<string>();
    selectedWeeks.forEach(wk => (weekContext[wk]?.names || []).forEach(n => names.add(n)));
    return names.size > 0 ? [...names].sort() : allNames;
  }, [selectedWeeks, weekContext, allNames]);

  const contextJobs = React.useMemo(() => {
    if (!selectedWeeks.length) return allJobs;
    const jobs = new Set<string>();
    selectedWeeks.forEach(wk => (weekContext[wk]?.jobs || []).forEach(j => jobs.add(j)));
    return jobs.size > 0 ? [...jobs].sort() : allJobs;
  }, [selectedWeeks, weekContext, allJobs]);

  // ── KPI counts ────────────────────────────────────────────────────────────────
  const kpiWorkers = React.useMemo(() => new Set(rows.map(r => r.name)).size, [rows]);
  const kpiEntries = rows.length;

  // ── Collapse helpers ──────────────────────────────────────────────────────────
  const expandAll = useCallback(() => setCollapsed({}), []);
  const collapseAll = useCallback(() => {
    if (!groupedPivot) return;
    const next: Record<string, boolean> = {};
    groupedPivot.companies.forEach((co: any) => {
      next[`co-${co.company}`] = true;
      co.jobs.forEach((job: any) => {
        next[`job-${co.company}-${job.job}`] = true;
        job.subCats.forEach((sc: any) => {
          next[`sc-${co.company}-${job.job}-${sc.subCat}`] = true;
        });
      });
    });
    setCollapsed(next);
  }, [groupedPivot]);

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
  const tbHdr = isLight ? "bg-slate-100/80 text-slate-500" : "bg-[#1a1a1a] text-slate-500";
  const tbRow = isLight ? "hover:bg-slate-50" : "hover:bg-[#181818]";
  const tbBdr = isLight ? "border-slate-100"  : "border-[#1e1e1e]";

  // ── Week label ────────────────────────────────────────────────────────────────
  const weekLabel = selectedWeeks.length === 0
    ? "All Weeks"
    : selectedWeeks.length === 1
    ? (filteredWeeks.find(w => w.weekNum === selectedWeeks[0])?.label || selectedWeeks[0])
    : `${selectedWeeks.length} weeks selected`;

  // ── Grouped pivot renderer ────────────────────────────────────────────────────
  const renderGrouped = () => {
    if (!groupedPivot) return null;
    const { names, companies, grandTotal } = groupedPivot;
    return (
      <div>
        {/* Collapse / Expand controls */}
        <div className={`flex items-center justify-between mb-2 px-1`}>
          <span className={`text-[11px] font-medium ${txt2}`}>
            Company → Job → Sub-Category
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={expandAll}
              className={`text-[11px] px-2.5 py-1 rounded-md border ${bdr} ${txt2} hover:text-green-500 hover:border-green-500 transition-colors`}
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className={`text-[11px] px-2.5 py-1 rounded-md border ${bdr} ${txt2} hover:text-green-500 hover:border-green-500 transition-colors`}
            >
              Collapse All
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-transparent">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={tbHdr}>
                <th className={`text-left px-3 py-2.5 font-semibold tracking-wide uppercase text-[10px] sticky left-0 z-10 ${tbHdr}`} style={{ minWidth: 240 }}>
                  Company / Job / Sub-Cat
                </th>
                <th className="text-right px-3 py-2.5 font-semibold tracking-wide uppercase text-[10px]" style={{ minWidth: 80 }}>Hours</th>
                <th className="text-right px-3 py-2.5 font-semibold tracking-wide uppercase text-[10px]" style={{ minWidth: 100 }}>Amount</th>
                {names.map((n: string) => (
                  <th key={n} className="text-right px-2 py-2.5 font-semibold tracking-wide uppercase text-[10px]" style={{ minWidth: 90 }}>
                    {n.split(" ")[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map((co: any) => {
                const coKey       = `co-${co.company}`;
                const coCollapsed = collapsed[coKey];
                return (
                  <React.Fragment key={co.company}>
                    {/* ── Company row ── */}
                    <tr
                      className={`cursor-pointer select-none border-t ${tbBdr} ${
                        isLight
                          ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70"
                          : "bg-[#0f2318] text-emerald-400 hover:bg-[#132b1c]"
                      }`}
                      onClick={() => setCollapsed(c => ({ ...c, [coKey]: !c[coKey] }))}
                    >
                      <td className={`px-3 py-2 sticky left-0 ${isLight ? "bg-emerald-50" : "bg-[#0f2318]"} font-bold text-xs`}>
                        <span className={`inline-flex items-center justify-center w-4 h-4 mr-1.5 text-[10px] rounded ${isLight ? "bg-emerald-200 text-emerald-700" : "bg-emerald-900 text-emerald-400"}`}>
                          {coCollapsed ? "▶" : "▼"}
                        </span>
                        {co.company}
                      </td>
                      <td className="text-right px-3 py-2 font-bold tabular-nums">{fmtHrs(co.hours)}</td>
                      <td className="text-right px-3 py-2 font-bold tabular-nums">{fmtAmt(co.amount)}</td>
                      {names.map((n: string) => (
                        <td key={n} className="text-right px-2 py-2 tabular-nums">
                          {co.nameTotals[n]?.amt ? fmtAmt(co.nameTotals[n].amt) : <span className="opacity-20">—</span>}
                        </td>
                      ))}
                    </tr>

                    {!coCollapsed && co.jobs.map((job: any) => {
                      const jobKey       = `job-${co.company}-${job.job}`;
                      const jobCollapsed = collapsed[jobKey];
                      return (
                        <React.Fragment key={job.job}>
                          {/* ── Job row ── */}
                          <tr
                            className={`cursor-pointer select-none border-t ${tbBdr} ${
                              isLight
                                ? "bg-slate-50 text-slate-700 hover:bg-slate-100"
                                : "bg-[#161616] text-slate-300 hover:bg-[#1c1c1c]"
                            }`}
                            onClick={() => setCollapsed(c => ({ ...c, [jobKey]: !c[jobKey] }))}
                          >
                            <td className={`px-3 py-1.5 pl-7 sticky left-0 ${isLight ? "bg-slate-50" : "bg-[#161616]"} font-semibold text-[12px]`}>
                              <span className={`inline-block w-3 mr-1 text-[9px] ${txt2}`}>{jobCollapsed ? "▶" : "▼"}</span>
                              {job.job}
                            </td>
                            <td className="text-right px-3 py-1.5 font-semibold tabular-nums">{fmtHrs(job.hours)}</td>
                            <td className="text-right px-3 py-1.5 font-semibold tabular-nums">{fmtAmt(job.amount)}</td>
                            {names.map((n: string) => (
                              <td key={n} className="text-right px-2 py-1.5 tabular-nums">
                                {job.nameTotals[n]?.amt ? fmtAmt(job.nameTotals[n].amt) : <span className="opacity-20">—</span>}
                              </td>
                            ))}
                          </tr>

                          {!jobCollapsed && job.subCats.map((sc: any) => {
                            const scKey       = `sc-${co.company}-${job.job}-${sc.subCat}`;
                            const scCollapsed = collapsed[scKey];
                            const isDeduct    = sc.isDeduction;
                            const isNonPay    = sc.isNonPayroll;
                            const scColor     = isDeduct
                              ? (isLight ? "text-red-600" : "text-red-400")
                              : isNonPay
                              ? (isLight ? "text-sky-600" : "text-sky-400")
                              : txt3;
                            return (
                              <React.Fragment key={sc.subCat}>
                                {/* ── Sub-category row ── */}
                                <tr
                                  className={`cursor-pointer select-none border-t ${tbBdr} ${tbRow}`}
                                  onClick={() => setCollapsed(c => ({ ...c, [scKey]: !c[scKey] }))}
                                >
                                  <td className={`px-3 py-1.5 pl-12 sticky left-0 ${bg2} ${scColor}`}>
                                    <span className={`inline-block w-3 mr-1 text-[9px] ${txt2}`}>{scCollapsed ? "▶" : "▼"}</span>
                                    <span className="font-medium">{sc.subCat || <em className="opacity-50">(none)</em>}</span>
                                    {isDeduct  && <span className={`ml-1.5 text-[9px] px-1 py-px rounded font-medium ${isLight ? "bg-red-100 text-red-500" : "bg-red-900/30 text-red-400"}`}>deduct</span>}
                                    {isNonPay  && <span className={`ml-1.5 text-[9px] px-1 py-px rounded font-medium ${isLight ? "bg-sky-100 text-sky-500" : "bg-sky-900/30 text-sky-400"}`}>non-pay</span>}
                                  </td>
                                  <td className={`text-right px-3 py-1.5 tabular-nums ${scColor}`}>{fmtHrs(sc.hours)}</td>
                                  <td className={`text-right px-3 py-1.5 tabular-nums ${scColor}`}>{fmtAmt(sc.amount)}</td>
                                  {names.map((n: string) => (
                                    <td key={n} className={`text-right px-2 py-1.5 tabular-nums ${scColor}`}>
                                      {sc.nameTotals[n]?.amt ? fmtAmt(sc.nameTotals[n].amt) : <span className="opacity-20">—</span>}
                                    </td>
                                  ))}
                                </tr>

                                {/* ── Date drill-down rows ── */}
                                {!scCollapsed && sc.dateRows.map((dr: any) => (
                                  <tr key={dr.date} className={`border-t ${tbBdr} ${tbRow}`}>
                                    <td className={`px-3 py-1 pl-16 sticky left-0 ${bg2} ${txt2} text-[11px]`}>
                                      {dr.date}
                                    </td>
                                    <td className={`text-right px-3 py-1 tabular-nums ${txt2} text-[11px]`}>{fmtHrs(dr.hours)}</td>
                                    <td className={`text-right px-3 py-1 tabular-nums ${txt2} text-[11px]`}>{fmtAmt(dr.amount)}</td>
                                    {names.map((n: string) => (
                                      <td key={n} className={`text-right px-2 py-1 tabular-nums ${txt2} text-[11px]`}>
                                        {dr.nameTotals[n]?.amt ? fmtAmt(dr.nameTotals[n].amt) : ""}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              {/* Grand total row */}
              <tr className={`border-t-2 ${isLight ? "border-green-400 bg-green-50 text-green-800" : "border-green-700 bg-[#0a1f12] text-green-300"} font-bold`}>
                <td className={`px-3 py-2.5 sticky left-0 ${isLight ? "bg-green-50" : "bg-[#0a1f12]"} tracking-wide uppercase text-[11px]`}>
                  Grand Total
                </td>
                <td className="text-right px-3 py-2.5 tabular-nums">{fmtHrs(grandTotal.hours)}</td>
                <td className="text-right px-3 py-2.5 tabular-nums">{fmtAmt(grandTotal.amount)}</td>
                {names.map((n: string) => (
                  <td key={n} className="text-right px-2 py-2.5 tabular-nums">
                    {grandTotal.nameTotals[n]?.amt ? fmtAmt(grandTotal.nameTotals[n].amt) : ""}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Weekly pivot renderer ─────────────────────────────────────────────────────
  const renderPivot = () => {
    if (!weeklyPivot) return null;
    const { names, dates, matrix, nameTotals, grandTotal } = weeklyPivot;
    return (
      <div className="overflow-x-auto rounded-lg border border-transparent">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className={tbHdr}>
              <th className={`text-left px-3 py-2.5 sticky left-0 z-10 tracking-wide uppercase text-[10px] ${tbHdr}`} style={{ minWidth: 110 }}>Date</th>
              {names.map((n: string) => (
                <th key={n} className="text-right px-2 py-2.5 tracking-wide uppercase text-[10px]" style={{ minWidth: 90 }}>
                  {n.split(" ")[0]}
                </th>
              ))}
              <th className="text-right px-3 py-2.5 tracking-wide uppercase text-[10px]" style={{ minWidth: 90 }}>Total Hrs</th>
              <th className="text-right px-3 py-2.5 tracking-wide uppercase text-[10px]" style={{ minWidth: 100 }}>Amount</th>
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
                  <td className={`text-right px-3 py-1.5 font-semibold tabular-nums`}>{fmtHrs(rowHrs)}</td>
                  <td className={`text-right px-3 py-1.5 tabular-nums ${rowAmt < 0 ? "text-red-400" : "text-green-400"}`}>
                    {fmtAmt(rowAmt)}
                  </td>
                </tr>
              );
            })}

            {/* Name totals — hours */}
            <tr className={`border-t-2 ${isLight ? "border-green-400 bg-green-50 text-green-800" : "border-green-700 bg-[#0a1f12] text-green-300"} font-bold`}>
              <td className={`px-3 py-2 sticky left-0 ${isLight ? "bg-green-50" : "bg-[#0a1f12]"} tracking-wide uppercase text-[10px]`}>Total Hrs</td>
              {names.map((n: string) => (
                <td key={n} className="text-right px-2 py-2 tabular-nums">{fmtHrs(nameTotals[n]?.hours || 0)}</td>
              ))}
              <td className="text-right px-3 py-2 tabular-nums">{fmtHrs(grandTotal.hours)}</td>
              <td />
            </tr>

            {/* Name totals — amount */}
            <tr className={`border-t ${tbBdr} ${isLight ? "bg-green-50/60 text-green-800" : "bg-[#0a1f12]/70 text-green-300"} font-bold`}>
              <td className={`px-3 py-2 sticky left-0 ${isLight ? "bg-green-50/60" : "bg-[#0a1f12]/70"} tracking-wide uppercase text-[10px]`}>Amount</td>
              {names.map((n: string) => (
                <td key={n} className="text-right px-2 py-2 tabular-nums">{fmtAmt(nameTotals[n]?.amount || 0)}</td>
              ))}
              <td />
              <td className="text-right px-3 py-2 tabular-nums">{fmtAmt(grandTotal.amount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // ── Detail table renderer ─────────────────────────────────────────────────────
  const renderDetail = () => (
    <div className="overflow-x-auto rounded-lg border border-transparent">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className={tbHdr}>
            <th className={`text-left px-3 py-2.5 sticky left-0 z-10 tracking-wide uppercase text-[10px] ${tbHdr}`} style={{ minWidth: 130 }}>Name</th>
            <th className="text-left px-2 py-2.5 tracking-wide uppercase text-[10px]" style={{ minWidth: 120 }}>Job</th>
            <th className="text-left px-2 py-2.5 tracking-wide uppercase text-[10px]" style={{ minWidth: 100 }}>Sub Cat</th>
            <th className="text-left px-2 py-2.5 tracking-wide uppercase text-[10px]" style={{ minWidth: 90 }}>Date</th>
            <th className="text-left px-2 py-2.5 tracking-wide uppercase text-[10px]" style={{ minWidth: 80 }}>Started</th>
            <th className="text-left px-2 py-2.5 tracking-wide uppercase text-[10px]" style={{ minWidth: 80 }}>Finished</th>
            <th className="text-right px-2 py-2.5 tracking-wide uppercase text-[10px]" style={{ minWidth: 70 }}>Hours</th>
            <th className="text-right px-2 py-2.5 tracking-wide uppercase text-[10px]" style={{ minWidth: 90 }}>Amount</th>
            <th className="text-left px-2 py-2.5 tracking-wide uppercase text-[10px]" style={{ minWidth: 130 }}>Remarks</th>
            <th className="text-center px-2 py-2.5 tracking-wide uppercase text-[10px]" style={{ minWidth: 72 }}>Actions</th>
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

            return (
              <tr key={row.rowIndex} className={`border-t ${tbBdr} ${tbRow}`}>
                <td className={`px-3 py-1.5 sticky left-0 ${bg2} font-medium`}>{row.name}</td>

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
                <td className={`px-2 py-1.5 tabular-nums ${txt2}`}>{row.date}</td>
                <td className={`px-2 py-1.5 tabular-nums ${txt2}`}>{row.started}</td>
                <td className={`px-2 py-1.5 tabular-nums ${txt2}`}>{row.finished}</td>

                {/* Hours — inline editable */}
                <td className="text-right px-2 py-1.5">
                  {isEHrs ? (
                    <input ref={editInputRef} value={editVal}
                      className={`w-16 rounded border text-xs px-1 py-0.5 text-right outline-none ${inp}`}
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
                    <span className={`cursor-text hover:underline decoration-dashed tabular-nums ${amtCls}`}
                      onClick={() => startEdit(row.rowIndex, "total", String(row.total))}>
                      {fmtAmt(row.total)}
                    </span>
                  )}
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
                    <span className={`cursor-text hover:underline decoration-dashed ${row.remarks ? "text-amber-400" : txt2}`}
                      onClick={() => startEdit(row.rowIndex, "remark", row.remarks)}>
                      {row.remarks || <em className="opacity-40 text-[11px]">add note…</em>}
                    </span>
                  )}
                </td>

                {/* Actions */}
                <td className="text-center px-2 py-1.5">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => openEditModal(row)}
                      className={`text-[11px] w-6 h-6 flex items-center justify-center rounded transition-colors ${isLight ? "bg-blue-50 text-blue-500 hover:bg-blue-100" : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"}`}
                      title="Edit record"
                    >✏️</button>
                    <button
                      onClick={() => setDeleteConfirm(row)}
                      className={`text-[11px] w-6 h-6 flex items-center justify-center rounded transition-colors ${isLight ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-red-500/10 text-red-400 hover:bg-red-500/20"}`}
                      title="Delete record"
                    >🗑️</button>
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className={`text-center py-12 ${txt2} text-sm`}>
                {dataLoaded ? "No records match current filters." : "Loading…"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

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
                  : `${txt2} hover:${txt3}`
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

      {/* ── GAS safety-net banner ── */}
      <div className={`shrink-0 flex items-center justify-between px-4 py-1.5 border-b text-[11px] ${
        isLight
          ? "bg-amber-50 border-amber-200 text-amber-700"
          : "bg-amber-950/20 border-amber-800/30 text-amber-500"
      }`}>
        <span className="flex items-center gap-1.5">
          <span>⚠️</span>
          <span>Portal-integrated dashboard — data syncs live with Google Sheets</span>
        </span>
        <a href={GAS_URL} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 font-semibold underline hover:opacity-70 transition-opacity whitespace-nowrap ml-4">
          Open original GAS app ↗
        </a>
      </div>

      {/* ── Page header ── */}
      <div className={`shrink-0 flex items-center justify-between px-5 py-3 border-b ${bdr}`}>
        <div>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black ${
              isLight ? "bg-green-600 text-white" : "bg-green-700 text-white"
            }`}>4Y</div>
            <div>
              <h1 className={`font-bold text-sm leading-tight ${isLight ? "text-slate-800" : "text-slate-100"}`}>
                4YouPros Payroll
              </h1>
              <p className={`text-[10px] ${txt2} leading-tight`}>
                Live data from Google Sheets · raw tab
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span className={`text-[11px] ${txt2} animate-pulse`}>Refreshing…</span>
          )}
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-xs font-semibold transition-colors shadow-sm"
          >
            + Add Record
          </button>
          <button
            onClick={() => { if (rows.length === 0) { showToast("No rows in current filter", "info"); return; } setActiveTab("detail"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              isLight ? "border-red-200 text-red-500 hover:bg-red-50" : "border-red-900/50 text-red-400 hover:bg-red-900/20"
            }`}
          >
            🗑 Delete
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className={`shrink-0 px-5 py-2.5 border-b ${bdr} flex flex-wrap items-center gap-2`}>

        {/* Year */}
        <select value={yearFilter}
          onChange={e => { setYearFilter(e.target.value); lastKeyRef.current = ""; }}
          className={`rounded-lg border text-xs px-2.5 py-1.5 outline-none transition-all ${inp} cursor-pointer`}
          style={{ minWidth: 90 }}
        >
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Week multi-select */}
        <div className="relative">
          <button
            onClick={() => setWeekDropOpen(o => !o)}
            className={`flex items-center gap-2 rounded-lg border text-xs px-2.5 py-1.5 outline-none transition-all ${inp} whitespace-nowrap`}
            style={{ minWidth: 180 }}
          >
            <span className="flex-1 text-left truncate">{weekLabel}</span>
            <span className={`text-[9px] ${txt2}`}>{weekDropOpen ? "▲" : "▼"}</span>
          </button>
          {weekDropOpen && (
            <div className={`absolute top-full left-0 mt-1 z-50 rounded-xl border shadow-2xl overflow-hidden ${bg} ${bdr}`}
              style={{ minWidth: 280, maxHeight: 340 }}>
              {/* Header */}
              <div className={`flex items-center justify-between px-3 py-2 border-b ${bdr}`}>
                <span className={`text-xs font-semibold ${txt}`}>Select Weeks</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setSelectedWeeks([]); lastKeyRef.current = ""; setWeekDropOpen(false); }}
                    className={`text-[11px] ${txt2} hover:text-green-500 transition-colors`}>Clear</button>
                  <button onClick={() => setWeekDropOpen(false)}
                    className="text-[11px] px-2 py-0.5 rounded bg-green-600 hover:bg-green-700 text-white font-medium transition-colors">Done</button>
                </div>
              </div>
              {/* Week list */}
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

        {/* Name */}
        <select value={nameFilter}
          onChange={e => { setNameFilter(e.target.value); lastKeyRef.current = ""; }}
          className={`rounded-lg border text-xs px-2.5 py-1.5 outline-none transition-all ${inp} cursor-pointer`}
          style={{ minWidth: 150 }}
        >
          <option value="">All Names</option>
          {contextNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        {/* Job */}
        <select value={jobFilter}
          onChange={e => { setJobFilter(e.target.value); lastKeyRef.current = ""; }}
          className={`rounded-lg border text-xs px-2.5 py-1.5 outline-none transition-all ${inp} cursor-pointer`}
          style={{ minWidth: 140 }}
        >
          <option value="">All Jobs</option>
          {contextJobs.map(j => <option key={j} value={j}>{j}</option>)}
        </select>

        {/* Date */}
        <input type="text" value={dateFilter}
          onChange={e => { setDateFilter(e.target.value); lastKeyRef.current = ""; }}
          placeholder="MM/DD/YYYY"
          className={`rounded-lg border text-xs px-2.5 py-1.5 outline-none transition-all ${inp}`}
          style={{ minWidth: 130 }}
        />

        <button onClick={resetFilters}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            isLight ? "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700" : "border-[#333] text-slate-500 hover:border-[#444] hover:text-slate-300"
          }`}>
          Reset
        </button>
      </div>

      {/* Click-outside to close week dropdown */}
      {weekDropOpen && <div className="fixed inset-0 z-40" onClick={() => setWeekDropOpen(false)} />}

      {/* ── KPI cards ── */}
      <div className={`shrink-0 grid grid-cols-4 gap-3 px-5 py-3 border-b ${bdr}`}>
        {[
          { label: "Total Hours",  value: fmtHrs(totals.hours),   color: "text-blue-400",   icon: "⏱" },
          { label: "Total Amount", value: fmtAmt(totals.amount),  color: "text-green-400",  icon: "💵" },
          { label: "Entries",      value: String(kpiEntries),      color: "text-violet-400", icon: "📋" },
          { label: "Workers",      value: String(kpiWorkers),      color: "text-amber-400",  icon: "👷" },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border ${bdr} px-4 py-2.5 ${bg3}`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[12px]">{k.icon}</span>
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${txt2}`}>{k.label}</p>
            </div>
            <p className={`text-xl font-bold leading-tight tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── Tab bar ── */}
      <div className={`shrink-0 flex items-center gap-0.5 px-5 pt-2 border-b ${bdr}`}>
        {([
          { id: "grouped", label: "📊  Grouped View" },
          { id: "pivot",   label: "📅  Weekly Pivot" },
          { id: "detail",  label: "📋  Detail" },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all border-b-2 -mb-px ${
              activeTab === t.id
                ? `border-green-500 ${isLight ? "text-green-600 bg-green-50" : "text-green-400 bg-green-950/20"}`
                : `border-transparent ${txt2} hover:${txt3}`
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-auto min-h-0 px-5 py-4">
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
              t.type === "success" ? (isLight ? "bg-green-600 text-white" : "bg-green-700 text-white")
              : t.type === "error" ? (isLight ? "bg-red-600 text-white"   : "bg-red-700 text-white")
              :                     (isLight ? "bg-slate-700 text-white"  : "bg-slate-600 text-white")
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
            <div className={`flex items-center justify-between px-5 py-4 border-b ${bdr}`}>
              <div>
                <h2 className="font-bold text-sm text-green-500">Add New Record</h2>
                <p className={`text-[11px] ${txt2} mt-0.5`}>Enter payroll, deduction, or non-payroll entry</p>
              </div>
              <button onClick={() => setAddModalOpen(false)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg ${bg3} ${txt2} hover:${txt} transition-colors text-base leading-none`}>
                ×
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "65vh" }}>
              {renderForm()}
            </div>
            <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${bdr} ${bg3}`}>
              <button onClick={() => setAddModalOpen(false)}
                className={`text-xs px-4 py-2 rounded-lg border ${bdr} ${txt2} hover:${txt} transition-colors`}>
                Cancel
              </button>
              <button onClick={submitAdd}
                className="text-xs px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold transition-colors shadow-sm">
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
                className={`w-7 h-7 flex items-center justify-center rounded-lg ${bg3} ${txt2} hover:${txt} transition-colors text-base leading-none`}>
                ×
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "65vh" }}>
              {renderForm()}
            </div>
            <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${bdr} ${bg3}`}>
              <button onClick={() => setEditModalOpen(false)}
                className={`text-xs px-4 py-2 rounded-lg border ${bdr} ${txt2} hover:${txt} transition-colors`}>
                Cancel
              </button>
              <button onClick={submitEdit}
                className="text-xs px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold transition-colors shadow-sm">
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
                className={`text-xs px-4 py-2 rounded-lg border ${bdr} ${txt2} hover:${txt} transition-colors`}>
                Cancel
              </button>
              <button onClick={confirmDelete}
                className="text-xs px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold transition-colors">
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
