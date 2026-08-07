/**
 * FourYrPayrollPage — Portal-integrated replica of the 4YR Payroll GAS dashboard.
 * Reads/writes directly to the Google Sheets spreadsheet via the Express API.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useFinance } from "../../context/FinanceContext";
import { getAccessToken } from "../../services/googleAuth";

// ── GAS dashboard external safety-net URL ─────────────────────────────────────
const GAS_URL =
  "https://script.google.com/a/macros/marktimm.com/s/AKfycbxvL1T_dHYg7s2tQmlfen7Y-eeYT6cU-L3vjv8RJ51pJWu7CydOfT9YyUy0MUJEsyFi/exec";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt2 = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtAmt = (n: number) => `₱${fmt2(n)}`;
const fmtHrs = (n: number) => fmt2(n);

function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${m}/${dy}/${d.getFullYear()}`;
}

function currentYear() {
  return String(new Date().getFullYear());
}

type Tab = "grouped" | "pivot" | "detail";

interface WeekMeta {
  weekNum: string;
  year: number;
  label: string;
  startDate: string;
  endDate: string;
}

interface RawRow {
  rowIndex: number;
  name: string;
  job: string;
  subCat: string;
  date: string;
  dateISO: string;
  started: string;
  finished: string;
  hoursRaw: number;
  hrsRed: boolean;
  rate: number;
  remarks: string;
  company: string;
  hours: number;
  total: number;
  variance: number;
  weekNum: string;
  mo: string;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info";
interface ToastMsg { id: number; msg: string; type: ToastType }

function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const idRef = useRef(0);
  const show = useCallback((msg: string, type: ToastType = "success") => {
    const id = ++idRef.current;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

// ── Main component ────────────────────────────────────────────────────────────
export function FourYrPayrollPage() {
  const { theme } = useFinance();
  const isLight = theme === "light";
  const accessToken = getAccessToken();

  const { toasts, show: showToast } = useToast();

  // Filter state
  const [yearFilter, setYearFilter]     = useState(currentYear());
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const [nameFilter, setNameFilter]     = useState("");
  const [jobFilter, setJobFilter]       = useState("");
  const [dateFilter, setDateFilter]     = useState("");

  // Dropdown data
  const [years, setYears]               = useState<number[]>([]);
  const [allWeeks, setAllWeeks]         = useState<WeekMeta[]>([]);
  const [allNames, setAllNames]         = useState<string[]>([]);
  const [allJobs, setAllJobs]           = useState<string[]>([]);
  const [weekContext, setWeekContext]   = useState<Record<string, { names: string[]; jobs: string[] }>>({});

  // Data
  const [rows, setRows]                 = useState<RawRow[]>([]);
  const [groupedPivot, setGroupedPivot] = useState<any>(null);
  const [weeklyPivot, setWeeklyPivot]   = useState<any>(null);
  const [totals, setTotals]             = useState({ hours: 0, amount: 0 });

  // UI state
  const [activeTab, setActiveTab]       = useState<Tab>("grouped");
  const [loading, setLoading]           = useState(false);
  const [dataLoaded, setDataLoaded]     = useState(false);
  const [weekDropOpen, setWeekDropOpen] = useState(false);

  // Inline edit state
  const [editingCell, setEditingCell]   = useState<{ rowIndex: number; field: string } | null>(null);
  const [editVal, setEditVal]           = useState("");
  const editInputRef                    = useRef<HTMLInputElement>(null);

  // Modal state
  const [addModalOpen, setAddModalOpen]   = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<RawRow | null>(null);
  const [editingRow, setEditingRow]       = useState<RawRow | null>(null);
  const [entryDropdowns, setEntryDropdowns] = useState<any>(null);

  // Add/Edit form state
  const [form, setForm] = useState({
    name: "", job: "", subCat: "", date: "", started: "", finished: "",
    hours: "", remarks: "", amount: "", company: "", recordType: "payroll"
  });

  // Collapsed state for grouped pivot
  const [collapsed, setCollapsed]       = useState<Record<string, boolean>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const lastKeyRef  = useRef("");

  // ── API helpers ─────────────────────────────────────────────────────────────
  const apiGet = useCallback(async (path: string) => {
    const tok = getAccessToken();
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${tok}` }
    });
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

  // ── Load dropdown data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!getAccessToken()) return;
    apiGet("/api/4yr/dropdown-data").then(data => {
      setYears(data.years || []);
      setAllWeeks(data.weeks || []);
      setAllNames(data.names || []);
      setAllJobs(data.jobs  || []);
      setWeekContext(data.weekContext || {});

      // Default: select today's week
      const now = new Date();
      const mmdd = `${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}/${now.getFullYear()}`;
      const todayWeek = (data.weeks as WeekMeta[]).find(w => {
        const start = new Date(w.startDate.replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2'));
        const end   = new Date(w.endDate.replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2'));
        end.setHours(23,59,59,999);
        return now >= start && now <= end;
      });
      if (todayWeek) {
        setSelectedWeeks([todayWeek.weekNum]);
      }
    }).catch(e => showToast(`Failed to load dropdowns: ${e.message}`, "error"));
  }, [accessToken]);

  // ── Load filtered data (debounced) ─────────────────────────────────────────
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
  }, [yearFilter, selectedWeeks, nameFilter, jobFilter, dateFilter, apiPost]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Context names/jobs from selected weeks ─────────────────────────────────
  const contextNames = React.useMemo(() => {
    if (!selectedWeeks.length) return allNames;
    const names = new Set<string>();
    selectedWeeks.forEach(wk => {
      (weekContext[wk]?.names || []).forEach(n => names.add(n));
    });
    return names.size > 0 ? [...names].sort() : allNames;
  }, [selectedWeeks, weekContext, allNames]);

  const contextJobs = React.useMemo(() => {
    if (!selectedWeeks.length) return allJobs;
    const jobs = new Set<string>();
    selectedWeeks.forEach(wk => {
      (weekContext[wk]?.jobs || []).forEach(j => jobs.add(j));
    });
    return jobs.size > 0 ? [...jobs].sort() : allJobs;
  }, [selectedWeeks, weekContext, allJobs]);

  // Clear selected weeks when year changes (weeks belong to a specific year)
  const prevYearRef = useRef(yearFilter);
  useEffect(() => {
    if (prevYearRef.current !== yearFilter) {
      prevYearRef.current = yearFilter;
      setSelectedWeeks([]);
    }
  }, [yearFilter]);

  // Filtered weeks by year
  const filteredWeeks = React.useMemo(() => {
    if (!yearFilter) return allWeeks;
    return allWeeks.filter(w => String(w.year) === String(yearFilter));
  }, [allWeeks, yearFilter]);

  // ── KPI counts ──────────────────────────────────────────────────────────────
  const kpiWorkers = React.useMemo(() => new Set(rows.map(r => r.name)).size, [rows]);
  const kpiEntries = rows.length;

  // ── Inline edit handlers ─────────────────────────────────────────────────────
  const startEdit = (rowIndex: number, field: string, current: string) => {
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
      if (field === "remark") {
        await apiPost("/api/4yr/save-remark", { rowIndex, remark: editVal });
      } else if (field === "hours") {
        await apiPost("/api/4yr/save-hours", { rowIndex, hours: parseFloat(editVal) || 0 });
      } else if (field === "total") {
        await apiPost("/api/4yr/save-total", { rowIndex, total: parseFloat(editVal) || 0 });
      } else if (field === "job") {
        await apiPost("/api/4yr/save-job", { rowIndex, job: editVal });
      }
      showToast("Saved");
      lastKeyRef.current = ""; // force reload
      loadData();
    } catch (e: any) {
      showToast(`Save failed: ${e.message}`, "error");
    }
  };

  // ── Reset filters ────────────────────────────────────────────────────────────
  const resetFilters = () => {
    setYearFilter(currentYear());
    setSelectedWeeks([]);
    setNameFilter("");
    setJobFilter("");
    setDateFilter("");
    lastKeyRef.current = "";
  };

  // ── Add/Edit modal helpers ───────────────────────────────────────────────────
  const openAddModal = async () => {
    try {
      const d = await apiGet("/api/4yr/dropdown-data-for-entry");
      setEntryDropdowns(d);
      setForm({ name: "", job: "", subCat: "", date: today(), started: "", finished: "",
                hours: "", remarks: "", amount: "", company: "", recordType: "payroll" });
      setAddModalOpen(true);
    } catch (e: any) {
      showToast(`Failed to load entry dropdowns: ${e.message}`, "error");
    }
  };

  const openEditModal = async (row: RawRow) => {
    try {
      const d = await apiGet("/api/4yr/dropdown-data-for-entry");
      setEntryDropdowns(d);
      setEditingRow(row);
      const isDeduction = row.total < 0 ||
        /deduct|loan|rent|penalty|withhold/i.test(row.job) ||
        /deduct|loan|rent|penalty|withhold/i.test(row.subCat);
      const isNonPayroll = !isDeduction &&
        /reimburse|reimbursement|adjustment|allowance|bonus|incentive|extra|misc/i.test(row.subCat);
      const recordType = isDeduction ? "deduction" : isNonPayroll ? "nonpayroll" : "payroll";
      setForm({
        name: row.name, job: row.job, subCat: row.subCat, date: row.date,
        started: row.started, finished: row.finished,
        hours: String(row.hours || ""), remarks: row.remarks,
        amount: String(Math.abs(row.total || 0)), company: row.company,
        recordType
      });
      setEditModalOpen(true);
    } catch (e: any) {
      showToast(`Failed to open edit: ${e.message}`, "error");
    }
  };

  const submitAdd = async () => {
    if (!form.name || !form.job) {
      showToast("Name and Job are required", "error"); return;
    }
    try {
      await apiPost("/api/4yr/add-entry", form);
      showToast("Entry added");
      setAddModalOpen(false);
      lastKeyRef.current = "";
      loadData();
    } catch (e: any) {
      showToast(`Add failed: ${e.message}`, "error");
    }
  };

  const submitEdit = async () => {
    if (!editingRow || !form.name || !form.job) {
      showToast("Name and Job are required", "error"); return;
    }
    try {
      await apiPost("/api/4yr/save-edit", {
        ...form,
        rowIndex: editingRow.rowIndex,
        hoursExplicitlyEdited: true
      });
      showToast("Entry updated");
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

  // ── Toggle week selection ────────────────────────────────────────────────────
  const toggleWeek = (wk: string) => {
    setSelectedWeeks(prev =>
      prev.includes(wk) ? prev.filter(x => x !== wk) : [...prev, wk]
    );
    lastKeyRef.current = "";
  };

  const isNoTime = form.recordType === "deduction" || form.recordType === "nonpayroll";

  // ── Theme classes ─────────────────────────────────────────────────────────────
  const bg   = isLight ? "bg-white"          : "bg-[#111]";
  const bg2  = isLight ? "bg-slate-50"       : "bg-[#0d0d0d]";
  const bg3  = isLight ? "bg-slate-100"      : "bg-[#1a1a1a]";
  const bdr  = isLight ? "border-slate-200"  : "border-[#2a2a2a]";
  const txt  = isLight ? "text-slate-900"    : "text-slate-100";
  const txt2 = isLight ? "text-slate-500"    : "text-slate-400";
  const txt3 = isLight ? "text-slate-700"    : "text-slate-300";
  const inp  = isLight
    ? "bg-white border-slate-300 text-slate-900 focus:border-green-500"
    : "bg-[#1a1a1a] border-[#333] text-slate-100 focus:border-green-500";
  const tbHdr = isLight ? "bg-slate-100 text-slate-600" : "bg-[#1e1e1e] text-slate-400";
  const tbRow = isLight ? "hover:bg-slate-50" : "hover:bg-[#1a1a1a]";
  const tbBdr = isLight ? "border-slate-100" : "border-[#222]";

  // ── Week dropdown label ──────────────────────────────────────────────────────
  const weekLabel = selectedWeeks.length === 0
    ? "All Weeks"
    : selectedWeeks.length === 1
    ? (filteredWeeks.find(w => w.weekNum === selectedWeeks[0])?.label || selectedWeeks[0])
    : `${selectedWeeks.length} weeks selected`;

  // ── Render grouped pivot ─────────────────────────────────────────────────────
  const renderGrouped = () => {
    if (!groupedPivot) return null;
    const { names, companies, grandTotal } = groupedPivot;

    return (
      <div className="overflow-x-auto">
        <table className={`w-full text-xs border-collapse`}>
          <thead>
            <tr className={tbHdr}>
              <th className="text-left px-3 py-2 font-semibold sticky left-0 z-10" style={{ minWidth: 220 }}>
                Company / Job / Sub-Cat
              </th>
              <th className="text-right px-3 py-2 font-semibold" style={{ minWidth: 80 }}>Hours</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ minWidth: 100 }}>Amount</th>
              {names.map((n: string) => (
                <th key={n} className="text-right px-2 py-2 font-semibold" style={{ minWidth: 90 }}>
                  {n.split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.map((co: any) => {
              const coKey = `co-${co.company}`;
              const coCollapsed = collapsed[coKey];
              return (
                <React.Fragment key={co.company}>
                  {/* Company row */}
                  <tr
                    className={`cursor-pointer font-bold ${isLight ? "bg-emerald-50 text-emerald-800" : "bg-emerald-950/30 text-emerald-400"} border-t ${tbBdr}`}
                    onClick={() => setCollapsed(c => ({ ...c, [coKey]: !c[coKey] }))}
                  >
                    <td className={`px-3 py-2 sticky left-0 ${isLight ? "bg-emerald-50" : "bg-emerald-950/30"}`}>
                      <span className="mr-1">{coCollapsed ? "▶" : "▼"}</span>
                      {co.company}
                    </td>
                    <td className="text-right px-3 py-2">{fmtHrs(co.hours)}</td>
                    <td className="text-right px-3 py-2">{fmtAmt(co.amount)}</td>
                    {names.map((n: string) => (
                      <td key={n} className="text-right px-2 py-2">
                        {co.nameTotals[n]?.amt ? fmtAmt(co.nameTotals[n].amt) : ""}
                      </td>
                    ))}
                  </tr>

                  {!coCollapsed && co.jobs.map((job: any) => {
                    const jobKey = `job-${co.company}-${job.job}`;
                    const jobCollapsed = collapsed[jobKey];
                    return (
                      <React.Fragment key={job.job}>
                        {/* Job row */}
                        <tr
                          className={`cursor-pointer ${isLight ? "bg-green-50/50 text-green-800" : "bg-green-950/20 text-green-400"} border-t ${tbBdr}`}
                          onClick={() => setCollapsed(c => ({ ...c, [jobKey]: !c[jobKey] }))}
                        >
                          <td className={`px-3 py-1.5 pl-6 sticky left-0 ${isLight ? "bg-green-50/50" : "bg-green-950/20"} font-semibold`}>
                            <span className="mr-1">{jobCollapsed ? "▶" : "▼"}</span>
                            {job.job}
                          </td>
                          <td className="text-right px-3 py-1.5 font-semibold">{fmtHrs(job.hours)}</td>
                          <td className="text-right px-3 py-1.5 font-semibold">{fmtAmt(job.amount)}</td>
                          {names.map((n: string) => (
                            <td key={n} className="text-right px-2 py-1.5">
                              {job.nameTotals[n]?.amt ? fmtAmt(job.nameTotals[n].amt) : ""}
                            </td>
                          ))}
                        </tr>

                        {!jobCollapsed && job.subCats.map((sc: any) => {
                          const scKey = `sc-${co.company}-${job.job}-${sc.subCat}`;
                          const scCollapsed = collapsed[scKey];
                          const scColor = sc.isDeduction
                            ? (isLight ? "text-red-600" : "text-red-400")
                            : sc.isNonPayroll
                            ? (isLight ? "text-blue-600" : "text-blue-400")
                            : txt3;
                          return (
                            <React.Fragment key={sc.subCat}>
                              {/* SubCat row */}
                              <tr
                                className={`border-t ${tbBdr} cursor-pointer ${tbRow}`}
                                onClick={() => setCollapsed(c => ({ ...c, [scKey]: !c[scKey] }))}
                              >
                                <td className={`px-3 py-1 pl-10 sticky left-0 ${bg2} ${scColor} font-medium`}>
                                  <span className="mr-1 text-[10px]">{scCollapsed ? "▶" : "▼"}</span>
                                  {sc.subCat}
                                  {sc.isDeduction  && <span className="ml-1 text-[9px] opacity-60">[deduct]</span>}
                                  {sc.isNonPayroll && <span className="ml-1 text-[9px] opacity-60">[non-pay]</span>}
                                </td>
                                <td className="text-right px-3 py-1">{fmtHrs(sc.hours)}</td>
                                <td className={`text-right px-3 py-1 ${scColor}`}>{fmtAmt(sc.amount)}</td>
                                {names.map((n: string) => (
                                  <td key={n} className={`text-right px-2 py-1 ${scColor}`}>
                                    {sc.nameTotals[n]?.amt ? fmtAmt(sc.nameTotals[n].amt) : ""}
                                  </td>
                                ))}
                              </tr>

                              {/* Date drill-down rows */}
                              {!scCollapsed && sc.dateRows.map((dr: any) => (
                                <tr key={dr.date} className={`border-t ${tbBdr} ${tbRow}`}>
                                  <td className={`px-3 py-0.5 pl-14 sticky left-0 ${bg2} ${txt2} italic`}>
                                    {dr.date}
                                  </td>
                                  <td className={`text-right px-3 py-0.5 ${txt2}`}>{fmtHrs(dr.hours)}</td>
                                  <td className={`text-right px-3 py-0.5 ${txt2}`}>{fmtAmt(dr.amount)}</td>
                                  {names.map((n: string) => (
                                    <td key={n} className={`text-right px-2 py-0.5 ${txt2}`}>
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

            {/* Grand total */}
            <tr className={`border-t-2 ${isLight ? "border-green-400 bg-green-50 font-bold text-green-900" : "border-green-600 bg-green-950/30 font-bold text-green-300"}`}>
              <td className={`px-3 py-2 sticky left-0 ${isLight ? "bg-green-50" : "bg-green-950/30"}`}>GRAND TOTAL</td>
              <td className="text-right px-3 py-2">{fmtHrs(grandTotal.hours)}</td>
              <td className="text-right px-3 py-2">{fmtAmt(grandTotal.amount)}</td>
              {names.map((n: string) => (
                <td key={n} className="text-right px-2 py-2">
                  {grandTotal.nameTotals[n]?.amt ? fmtAmt(grandTotal.nameTotals[n].amt) : ""}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // ── Render weekly pivot ──────────────────────────────────────────────────────
  const renderPivot = () => {
    if (!weeklyPivot) return null;
    const { names, dates, matrix, nameTotals, grandTotal } = weeklyPivot;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className={tbHdr}>
              <th className="text-left px-3 py-2 sticky left-0 z-10" style={{ minWidth: 100 }}>Date</th>
              {names.map((n: string) => (
                <th key={n} className="text-right px-2 py-2" style={{ minWidth: 90 }}>{n.split(" ")[0]}</th>
              ))}
              <th className="text-right px-3 py-2">Total Hrs</th>
              <th className="text-right px-3 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((d: string) => {
              const rowHrs = names.reduce((s: number, n: string) => s + (matrix[d]?.[n]?.hours || 0), 0);
              const rowAmt = names.reduce((s: number, n: string) => s + (matrix[d]?.[n]?.amount || 0), 0);
              return (
                <tr key={d} className={`border-t ${tbBdr} ${tbRow}`}>
                  <td className={`px-3 py-1.5 sticky left-0 ${bg2} font-medium`}>{d}</td>
                  {names.map((n: string) => (
                    <td key={n} className="text-right px-2 py-1.5">
                      {matrix[d]?.[n]?.hours ? fmtHrs(matrix[d][n].hours) : <span className={txt2}>—</span>}
                    </td>
                  ))}
                  <td className="text-right px-3 py-1.5 font-medium">{fmtHrs(rowHrs)}</td>
                  <td className="text-right px-3 py-1.5">{fmtAmt(rowAmt)}</td>
                </tr>
              );
            })}
            {/* Name totals */}
            <tr className={`border-t-2 ${isLight ? "border-green-400 bg-green-50 font-bold" : "border-green-600 bg-green-950/30 font-bold"}`}>
              <td className={`px-3 py-2 sticky left-0 ${isLight ? "bg-green-50" : "bg-green-950/30"} text-green-600`}>TOTAL HRS</td>
              {names.map((n: string) => (
                <td key={n} className="text-right px-2 py-2">{fmtHrs(nameTotals[n]?.hours || 0)}</td>
              ))}
              <td className="text-right px-3 py-2">{fmtHrs(grandTotal.hours)}</td>
              <td className="text-right px-3 py-2"></td>
            </tr>
            <tr className={`border-t ${tbBdr} ${isLight ? "bg-green-50/50 font-bold" : "bg-green-950/20 font-bold"}`}>
              <td className={`px-3 py-2 sticky left-0 ${isLight ? "bg-green-50/50" : "bg-green-950/20"} text-green-600`}>AMOUNT</td>
              {names.map((n: string) => (
                <td key={n} className="text-right px-2 py-2">{fmtAmt(nameTotals[n]?.amount || 0)}</td>
              ))}
              <td className="text-right px-3 py-2"></td>
              <td className="text-right px-3 py-2">{fmtAmt(grandTotal.amount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // ── Render detail rows ───────────────────────────────────────────────────────
  const renderDetail = () => {
    const cols = ["name", "job", "subCat", "date", "started", "finished", "hours", "total", "remarks"];
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className={tbHdr}>
              <th className="text-left px-3 py-2 sticky left-0 z-10" style={{ minWidth: 130 }}>Name</th>
              <th className="text-left px-2 py-2" style={{ minWidth: 110 }}>Job</th>
              <th className="text-left px-2 py-2" style={{ minWidth: 100 }}>Sub Cat</th>
              <th className="text-left px-2 py-2" style={{ minWidth: 90 }}>Date</th>
              <th className="text-left px-2 py-2" style={{ minWidth: 80 }}>Started</th>
              <th className="text-left px-2 py-2" style={{ minWidth: 80 }}>Finished</th>
              <th className="text-right px-2 py-2" style={{ minWidth: 70 }}>Hours</th>
              <th className="text-right px-2 py-2" style={{ minWidth: 90 }}>Amount</th>
              <th className="text-left px-2 py-2" style={{ minWidth: 120 }}>Remarks</th>
              <th className="text-center px-2 py-2" style={{ minWidth: 70 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isEditHours   = editingCell?.rowIndex === row.rowIndex && editingCell.field === "hours";
              const isEditTotal   = editingCell?.rowIndex === row.rowIndex && editingCell.field === "total";
              const isEditRemark  = editingCell?.rowIndex === row.rowIndex && editingCell.field === "remark";
              const isEditJob     = editingCell?.rowIndex === row.rowIndex && editingCell.field === "job";
              const isDeduction   = row.total < 0 ||
                /deduct|loan|rent|penalty|withhold/i.test(row.job) ||
                /deduct|loan|rent|penalty|withhold/i.test(row.subCat);
              const amtColor      = isDeduction ? "text-red-500" : row.total > 0 ? "text-green-500" : "";
              return (
                <tr key={row.rowIndex} className={`border-t ${tbBdr} ${tbRow}`}>
                  <td className={`px-3 py-1.5 sticky left-0 ${bg2} font-medium`}>{row.name}</td>
                  {/* Job — inline editable */}
                  <td className="px-2 py-1.5">
                    {isEditJob ? (
                      <input
                        ref={editInputRef}
                        className={`w-full rounded border text-xs px-1.5 py-0.5 ${inp}`}
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:underline"
                        onClick={() => startEdit(row.rowIndex, "job", row.job)}
                      >{row.job}</span>
                    )}
                  </td>
                  <td className={`px-2 py-1.5 ${txt2}`}>{row.subCat}</td>
                  <td className={`px-2 py-1.5 ${txt2}`}>{row.date}</td>
                  <td className={`px-2 py-1.5 ${txt2}`}>{row.started}</td>
                  <td className={`px-2 py-1.5 ${txt2}`}>{row.finished}</td>
                  {/* Hours — inline editable */}
                  <td className="text-right px-2 py-1.5">
                    {isEditHours ? (
                      <input
                        ref={editInputRef}
                        className={`w-16 rounded border text-xs px-1 py-0.5 text-right ${inp}`}
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : (
                      <span
                        className={`cursor-pointer hover:underline ${row.hrsRed ? "text-red-500" : ""}`}
                        onClick={() => startEdit(row.rowIndex, "hours", String(row.hours))}
                      >{fmtHrs(row.hours)}</span>
                    )}
                  </td>
                  {/* Amount — inline editable */}
                  <td className="text-right px-2 py-1.5">
                    {isEditTotal ? (
                      <input
                        ref={editInputRef}
                        className={`w-20 rounded border text-xs px-1 py-0.5 text-right ${inp}`}
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : (
                      <span
                        className={`cursor-pointer hover:underline ${amtColor}`}
                        onClick={() => startEdit(row.rowIndex, "total", String(row.total))}
                      >{fmtAmt(row.total)}</span>
                    )}
                  </td>
                  {/* Remarks — inline editable */}
                  <td className="px-2 py-1.5">
                    {isEditRemark ? (
                      <input
                        ref={editInputRef}
                        className={`w-full rounded border text-xs px-1.5 py-0.5 ${inp}`}
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : (
                      <span
                        className={`cursor-pointer hover:underline ${row.remarks ? "text-red-400" : txt2}`}
                        onClick={() => startEdit(row.rowIndex, "remark", row.remarks)}
                      >{row.remarks || <span className="text-[#444] italic">add note</span>}</span>
                    )}
                  </td>
                  {/* Actions */}
                  <td className="text-center px-2 py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEditModal(row)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                        title="Edit"
                      >✏️</button>
                      <button
                        onClick={() => setDeleteConfirm(row)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                        title="Delete"
                      >🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className={`text-center py-8 ${txt2}`}>
                  {dataLoaded ? "No records match current filters." : "Loading…"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // ── Entry form (shared by Add & Edit) ────────────────────────────────────────
  const renderForm = () => (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={`block text-xs font-medium mb-1 ${txt2}`}>Record Type</label>
        <div className="flex gap-3">
          {["payroll", "deduction", "nonpayroll"].map(rt => (
            <label key={rt} className="flex items-center gap-1 cursor-pointer text-xs">
              <input type="radio" name="recordType" value={rt}
                checked={form.recordType === rt}
                onChange={() => setForm(f => ({ ...f, recordType: rt }))}
                className="accent-green-500"
              />
              <span className={txt3}>{rt === "nonpayroll" ? "Non-Payroll" : rt.charAt(0).toUpperCase() + rt.slice(1)}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className={`block text-xs font-medium mb-1 ${txt2}`}>Name *</label>
        <input
          list="entry-names" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className={`w-full rounded border text-xs px-2 py-1.5 ${inp}`}
          placeholder="Employee name"
        />
        <datalist id="entry-names">
          {(entryDropdowns?.names || []).map((n: string) => <option key={n} value={n} />)}
        </datalist>
      </div>

      <div>
        <label className={`block text-xs font-medium mb-1 ${txt2}`}>Job / Location *</label>
        <input
          list="entry-jobs" value={form.job}
          onChange={e => setForm(f => ({ ...f, job: e.target.value }))}
          className={`w-full rounded border text-xs px-2 py-1.5 ${inp}`}
          placeholder="Job / location"
        />
        <datalist id="entry-jobs">
          {(entryDropdowns?.jobs || []).map((j: string) => <option key={j} value={j} />)}
        </datalist>
      </div>

      <div>
        <label className={`block text-xs font-medium mb-1 ${txt2}`}>Sub Category</label>
        <input
          list="entry-subcats" value={form.subCat}
          onChange={e => setForm(f => ({ ...f, subCat: e.target.value }))}
          className={`w-full rounded border text-xs px-2 py-1.5 ${inp}`}
          placeholder="Sub category"
        />
        <datalist id="entry-subcats">
          {(entryDropdowns?.subCats || []).map((s: string) => <option key={s} value={s} />)}
        </datalist>
      </div>

      <div>
        <label className={`block text-xs font-medium mb-1 ${txt2}`}>Date</label>
        <input
          type="text" value={form.date} placeholder="MM/DD/YYYY"
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          className={`w-full rounded border text-xs px-2 py-1.5 ${inp}`}
        />
      </div>

      {!isNoTime && (
        <>
          <div>
            <label className={`block text-xs font-medium mb-1 ${txt2}`}>Started</label>
            <input
              type="text" value={form.started} placeholder="HH:MM AM/PM"
              onChange={e => setForm(f => ({ ...f, started: e.target.value }))}
              className={`w-full rounded border text-xs px-2 py-1.5 ${inp}`}
            />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${txt2}`}>Finished</label>
            <input
              type="text" value={form.finished} placeholder="HH:MM AM/PM"
              onChange={e => setForm(f => ({ ...f, finished: e.target.value }))}
              className={`w-full rounded border text-xs px-2 py-1.5 ${inp}`}
            />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${txt2}`}>Hours (override)</label>
            <input
              type="number" value={form.hours} step="0.01"
              onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
              className={`w-full rounded border text-xs px-2 py-1.5 ${inp}`}
            />
          </div>
        </>
      )}

      {isNoTime && (
        <div>
          <label className={`block text-xs font-medium mb-1 ${txt2}`}>Amount</label>
          <input
            type="number" value={form.amount} step="0.01"
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            className={`w-full rounded border text-xs px-2 py-1.5 ${inp}`}
          />
        </div>
      )}

      <div className="col-span-2">
        <label className={`block text-xs font-medium mb-1 ${txt2}`}>Remarks</label>
        <input
          type="text" value={form.remarks}
          onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
          className={`w-full rounded border text-xs px-2 py-1.5 ${inp}`}
          placeholder="Optional remarks"
        />
      </div>

      <div>
        <label className={`block text-xs font-medium mb-1 ${txt2}`}>Company Override</label>
        <input
          list="entry-companies" value={form.company}
          onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
          className={`w-full rounded border text-xs px-2 py-1.5 ${inp}`}
          placeholder="Optional override"
        />
        <datalist id="entry-companies">
          {(entryDropdowns?.companies || []).map((c: string) => <option key={c} value={c} />)}
        </datalist>
      </div>
    </div>
  );

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col h-full overflow-hidden ${bg} ${txt}`}>
      {/* External GAS link banner (safety net) */}
      <div className={`shrink-0 flex items-center justify-between px-4 py-1.5 border-b text-xs ${isLight ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-amber-950/20 border-amber-800/40 text-amber-400"}`}>
        <span>⚠️ This is the portal-integrated 4YR dashboard. Having issues?</span>
        <a
          href={GAS_URL} target="_blank" rel="noopener noreferrer"
          className="underline font-semibold hover:opacity-70 transition-opacity"
        >
          Open original GAS dashboard ↗
        </a>
      </div>

      {/* Header */}
      <div className={`shrink-0 px-4 py-2 border-b ${bdr} flex items-center gap-3`}>
        <div className="flex-1">
          <h1 className="font-bold text-base text-green-500">4YouRos Payroll</h1>
          <p className={`text-[11px] ${txt2}`}>4YR · All data reads from Google Sheets · 'raw' tab</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors"
          >
            + Add Record
          </button>
          {deleteConfirm === null && (
            <button
              onClick={() => {
                if (rows.length === 0) { showToast("No rows in current filter to delete", "info"); return; }
                // allow picking from detail tab
                setActiveTab("detail");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 text-xs font-semibold transition-colors"
            >
              🗑️ Delete Record
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className={`shrink-0 px-4 py-2 border-b ${bdr} flex flex-wrap items-center gap-2`}>
        {/* Year */}
        <select
          value={yearFilter}
          onChange={e => { setYearFilter(e.target.value); lastKeyRef.current = ""; }}
          className={`rounded border text-xs px-2 py-1.5 ${inp}`}
          style={{ minWidth: 90 }}
        >
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Week multi-select dropdown */}
        <div className="relative">
          <button
            className={`flex items-center gap-1.5 rounded border text-xs px-2 py-1.5 ${inp} whitespace-nowrap`}
            style={{ minWidth: 180 }}
            onClick={() => setWeekDropOpen(o => !o)}
          >
            <span className="flex-1 text-left truncate">{weekLabel}</span>
            <span className="text-[10px]">{weekDropOpen ? "▲" : "▼"}</span>
          </button>
          {weekDropOpen && (
            <div
              className={`absolute top-full left-0 mt-1 z-50 rounded-lg border shadow-xl overflow-y-auto ${bg} ${bdr}`}
              style={{ minWidth: 260, maxHeight: 320 }}
            >
              <div className={`flex items-center justify-between px-3 py-2 border-b ${bdr} sticky top-0 ${bg}`}>
                <span className="text-xs font-semibold">Select Weeks</span>
                <div className="flex gap-2">
                  <button
                    className="text-[10px] text-green-500 hover:underline"
                    onClick={() => { setSelectedWeeks([]); lastKeyRef.current = ""; setWeekDropOpen(false); }}
                  >Clear</button>
                  <button
                    className="text-[10px] text-blue-400 hover:underline"
                    onClick={() => setWeekDropOpen(false)}
                  >Apply</button>
                </div>
              </div>
              {filteredWeeks.map(w => (
                <label
                  key={w.weekNum}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs ${tbRow} border-b ${tbBdr}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedWeeks.includes(w.weekNum)}
                    onChange={() => { toggleWeek(w.weekNum); }}
                    className="accent-green-500"
                  />
                  <span className={txt3}>
                    <span className="font-mono text-[10px] mr-1 opacity-60">{w.weekNum}</span>
                    {w.label}
                  </span>
                </label>
              ))}
              {filteredWeeks.length === 0 && (
                <p className={`text-center py-4 text-xs ${txt2}`}>No weeks for selected year</p>
              )}
            </div>
          )}
        </div>

        {/* Name */}
        <select
          value={nameFilter}
          onChange={e => { setNameFilter(e.target.value); lastKeyRef.current = ""; }}
          className={`rounded border text-xs px-2 py-1.5 ${inp}`}
          style={{ minWidth: 140 }}
        >
          <option value="">All Names</option>
          {contextNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        {/* Job */}
        <select
          value={jobFilter}
          onChange={e => { setJobFilter(e.target.value); lastKeyRef.current = ""; }}
          className={`rounded border text-xs px-2 py-1.5 ${inp}`}
          style={{ minWidth: 130 }}
        >
          <option value="">All Jobs</option>
          {contextJobs.map(j => <option key={j} value={j}>{j}</option>)}
        </select>

        {/* Date */}
        <input
          type="text"
          value={dateFilter}
          onChange={e => { setDateFilter(e.target.value); lastKeyRef.current = ""; }}
          placeholder="Date MM/DD/YYYY"
          className={`rounded border text-xs px-2 py-1.5 ${inp}`}
          style={{ minWidth: 140 }}
        />

        <button
          onClick={resetFilters}
          className={`text-xs px-2 py-1.5 rounded border ${bdr} ${txt2} hover:opacity-70 transition-opacity`}
        >Reset</button>

        {loading && (
          <span className="text-xs text-green-500 animate-pulse ml-2">Loading…</span>
        )}
      </div>

      {/* Click outside to close week dropdown */}
      {weekDropOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setWeekDropOpen(false)} />
      )}

      {/* KPI cards */}
      <div className={`shrink-0 grid grid-cols-4 gap-3 px-4 py-2 border-b ${bdr}`}>
        {[
          { label: "Total Hours", value: fmtHrs(totals.hours), color: "text-blue-400" },
          { label: "Total Amount", value: fmtAmt(totals.amount), color: "text-green-400" },
          { label: "Entries", value: String(kpiEntries), color: "text-purple-400" },
          { label: "Workers", value: String(kpiWorkers), color: "text-amber-400" },
        ].map(k => (
          <div key={k.label} className={`rounded-lg border ${bdr} px-3 py-2 ${bg3}`}>
            <p className={`text-[10px] font-medium ${txt2} mb-0.5`}>{k.label}</p>
            <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className={`shrink-0 flex items-center gap-1 px-4 pt-2 border-b ${bdr}`}>
        {(["grouped", "pivot", "detail"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors border-b-2 ${
              activeTab === t
                ? "border-green-500 text-green-500"
                : `border-transparent ${txt2} hover:${txt3}`
            }`}
          >
            {t === "grouped" ? "📊 Grouped" : t === "pivot" ? "📅 Weekly Pivot" : "📋 Detail"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto min-h-0 p-4">
        {activeTab === "grouped" && renderGrouped()}
        {activeTab === "pivot"   && renderPivot()}
        {activeTab === "detail"  && renderDetail()}
        {!dataLoaded && !loading && (
          <div className={`text-center py-16 ${txt2} text-sm`}>
            {getAccessToken() ? "Initializing…" : "Google sign-in required to load data."}
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {/* Add Entry Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => setAddModalOpen(false)} />
          <div className={`relative z-10 rounded-xl shadow-2xl border ${bdr} ${bg} w-full max-w-lg mx-4 overflow-hidden`}>
            <div className={`flex items-center justify-between px-5 py-3 border-b ${bdr}`}>
              <h2 className="font-bold text-sm text-green-500">Add New Record</h2>
              <button onClick={() => setAddModalOpen(false)} className={`${txt2} hover:opacity-70 text-lg leading-none`}>×</button>
            </div>
            <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "70vh" }}>
              {renderForm()}
            </div>
            <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${bdr}`}>
              <button onClick={() => setAddModalOpen(false)} className={`text-xs px-3 py-1.5 rounded border ${bdr} ${txt2}`}>Cancel</button>
              <button onClick={submitAdd} className="text-xs px-4 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white font-semibold">Add Entry</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => setEditModalOpen(false)} />
          <div className={`relative z-10 rounded-xl shadow-2xl border ${bdr} ${bg} w-full max-w-lg mx-4 overflow-hidden`}>
            <div className={`flex items-center justify-between px-5 py-3 border-b ${bdr}`}>
              <h2 className="font-bold text-sm text-blue-400">Edit Record — {editingRow.name}</h2>
              <button onClick={() => setEditModalOpen(false)} className={`${txt2} hover:opacity-70 text-lg leading-none`}>×</button>
            </div>
            <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "70vh" }}>
              {renderForm()}
            </div>
            <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${bdr}`}>
              <button onClick={() => setEditModalOpen(false)} className={`text-xs px-3 py-1.5 rounded border ${bdr} ${txt2}`}>Cancel</button>
              <button onClick={submitEdit} className="text-xs px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => setDeleteConfirm(null)} />
          <div className={`relative z-10 rounded-xl shadow-2xl border ${bdr} ${bg} w-full max-w-sm mx-4 p-5`}>
            <h2 className="font-bold text-sm text-red-400 mb-2">Delete Record?</h2>
            <p className={`text-xs ${txt2} mb-4`}>
              This will permanently delete the record for <strong className={txt}>{deleteConfirm.name}</strong> on <strong className={txt}>{deleteConfirm.date}</strong> ({deleteConfirm.job}).
              This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className={`text-xs px-3 py-1.5 rounded border ${bdr} ${txt2}`}>Cancel</button>
              <button onClick={confirmDelete} className="text-xs px-4 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-xl shadow-xl text-sm font-medium border pointer-events-none ${
              t.type === "error"
                ? "bg-red-900/90 border-red-700 text-red-200"
                : t.type === "info"
                ? "bg-blue-900/90 border-blue-700 text-blue-200"
                : "bg-green-900/90 border-green-700 text-green-200"
            }`}
          >{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
