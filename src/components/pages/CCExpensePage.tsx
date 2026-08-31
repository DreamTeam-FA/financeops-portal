import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, RefreshCw, ChevronDown, Eye, EyeOff, AlertCircle,
  CheckCircle2, X, FileText, UploadCloud, CreditCard, Search
} from "lucide-react";
import { useFinance } from "../../context/FinanceContext";
import { getAccessToken } from "../../services/googleAuth";

// ── Constants ────────────────────────────────────────────────────────────────
const COMPANIES = [
  "4Grace Holdings Inc",
  "Timm Investments",
  "Elevate One",
  "Ruby's",
  "4YouRentals LLC",
  "Integrimedical",
  "MSDx",
  "Capable DNA",
] as const;

const RAW_HEADERS = [
  "Category",
  "Transaction Date",
  "Transaction Type",
  "Num",
  "Name",
  "Location",
  "Class/Company",
  "Description",
  "Account",
  "Amount",
  "Balance",
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface Adjustment {
  weekStart: string;
  vendor: string;
  company: string;
  delta: number;  // positive = increase, negative = decrease
}

interface RawRow {
  category: string;
  transactionDate: string;
  transactionType: string;
  num: string;
  name: string;
  location: string;
  classCompany: string;
  description: string;
  account: string;
  amount: number;
  balance: number;
}

interface WeekEntry {
  weekLabel: string;       // e.g. "Week of Aug 18, 2024"
  weekStart: string;       // ISO "YYYY-MM-DD" (Sunday)
  rows: RawRow[];
}

interface VendorWeekRow {
  vendor: string;
  grandTotal: number;
  byCompany: Record<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseMoney(v: any): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = String(v).replace(/[$,\s]/g, "").replace(/\((.+)\)/, "-$1");
  return parseFloat(s) || 0;
}

function parseDate(v: any): Date | null {
  if (!v) return null;
  // Handle serial numbers from Excel
  if (typeof v === "number" && v > 1000) {
    // Excel serial: days since 1900-01-01 (with 1900 leap year bug)
    const d = new Date((v - 25569) * 86400 * 1000);
    return d;
  }
  const s = String(v).trim();
  if (!s) return null;
  // Try MM/DD/YYYY or MM/DD/YY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yr = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    return new Date(yr, parseInt(m[1]) - 1, parseInt(m[2]));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function getSunday(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(d.getDate() - d.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMoney(n: number): string {
  if (n === 0) return "-";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtMoneyRaw(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function rawRowsFromSheetRows(rows: any[][]): RawRow[] {
  // rows is raw from sheets API; skip header rows (first 2 rows are headers)
  return rows.slice(2).filter(r => r && r.length > 0 && (r[1] || r[4])).map(r => ({
    category: String(r[0] || "").trim(),
    transactionDate: String(r[1] || "").trim(),
    transactionType: String(r[2] || "").trim(),
    num: String(r[3] || "").trim(),
    name: String(r[4] || "").trim(),
    location: String(r[5] || "").trim(),
    classCompany: String(r[6] || "").trim(),
    description: String(r[7] || "").trim(),
    account: String(r[8] || "").trim(),
    amount: parseMoney(r[9]),
    balance: parseMoney(r[10]),
  }));
}

function rawRowsFromUploadedRows(rows: any[][], headerRowIdx: number): RawRow[] {
  return rows.slice(headerRowIdx + 1).filter(r => r && r.length > 0 && (r[1] || r[4])).map(r => ({
    category: String(r[0] || "").trim(),
    transactionDate: String(r[1] || "").trim(),
    transactionType: String(r[2] || "").trim(),
    num: String(r[3] || "").trim(),
    name: String(r[4] || "").trim(),
    location: String(r[5] || "").trim(),
    classCompany: String(r[6] || "").trim(),
    description: String(r[7] || "").trim(),
    account: String(r[8] || "").trim(),
    amount: parseMoney(r[9]),
    balance: parseMoney(r[10]),
  }));
}

function groupIntoWeeks(rawRows: RawRow[]): WeekEntry[] {
  const ccOnly = rawRows.filter(isCCRow);
  const byWeek = new Map<string, RawRow[]>();
  for (const row of ccOnly) {
    const d = parseDate(row.transactionDate);
    if (!d) continue;
    const sun = getSunday(d);
    const key = sun.toISOString().slice(0, 10);
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key)!.push(row);
  }
  const entries: WeekEntry[] = [];
  for (const [key, rows] of byWeek.entries()) {
    const d = new Date(key + "T00:00:00");
    entries.push({ weekLabel: `Week of ${fmtDate(d)}`, weekStart: key, rows });
  }
  entries.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  return entries;
}

// Approved CC accounts — only these cards are tracked in this dashboard.
// Matched against the Account field by last-4 digits or card name.
const CC_ACCOUNT_PATTERNS = [
  /x5074/i,            // Chase Visa SW
  /x5004/i,            // AMEX
  /x6002/i,            // AMEX
  /x3002/i,            // AMEX
  /x2004/i,            // Marriott AMEX
  /x4024/i,            // Chase Visa Citi Costco
  /x3678/i,            // AAdvantage Aviator MC Barclay
  /x4418/i,            // Citi/AAdvantage
  /x5082/i,            // Chase Visa SW Ann
  /8782/i,             // 4 Grace (8782)
  /x4011/i,            // Chase Marriott Bonvoy
  /x0228/i,            // Citi AAdvantage
];

// User-approved accounts stored in localStorage (exact account strings)
function loadApprovedAccounts(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem("cc_approved_accounts") || "[]")); }
  catch { return new Set(); }
}
function saveApprovedAccounts(s: Set<string>) {
  localStorage.setItem("cc_approved_accounts", JSON.stringify([...s]));
}

// Module-level mutable set so isCCRow can access it without prop-drilling
let _approvedAccounts: Set<string> = loadApprovedAccounts();

function isCCRow(row: RawRow): boolean {
  return CC_ACCOUNT_PATTERNS.some(p => p.test(row.account))
    || _approvedAccounts.has(row.account);
}

function buildWeekTable(rows: RawRow[], vendorMap: Record<string, string>): VendorWeekRow[] {
  const ccRows = rows.filter(isCCRow);
  const byVendor = new Map<string, Record<string, number>>();
  for (const row of ccRows) {
    const cleanVendor = vendorMap[row.name] || row.name || "(unknown)";
    const company = row.classCompany.trim() || "(unassigned)";
    if (!byVendor.has(cleanVendor)) byVendor.set(cleanVendor, {});
    const vc = byVendor.get(cleanVendor)!;
    vc[company] = (vc[company] || 0) + row.amount;
  }
  const result: VendorWeekRow[] = [];
  for (const [vendor, byCompany] of byVendor.entries()) {
    const grandTotal = Object.values(byCompany).reduce((s, n) => s + n, 0);
    result.push({ vendor, grandTotal, byCompany });
  }
  result.sort((a, b) => a.vendor.localeCompare(b.vendor));
  return result;
}

function buildYTDTable(allRows: RawRow[], vendorMap: Record<string, string>): VendorWeekRow[] {
  return buildWeekTable(allRows.filter(isCCRow), vendorMap);
}

// ── Main Component ────────────────────────────────────────────────────────────
export const CCExpensePage: React.FC = () => {
  const { theme, showToast } = useFinance();
  const isLight = theme === "light";

  // Data state
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [vendorMap, setVendorMap] = useState<Record<string, string>>({});
  const [weeks, setWeeks] = useState<WeekEntry[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"weekly" | "ytd" | "raw">("weekly");
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);

  // Adjustment helpers
  const getAdjustedValue = (weekStart: string, vendor: string, company: string, rawVal: number): number => {
    const delta = adjustments
      .filter(a => a.weekStart === weekStart && a.vendor === vendor && a.company === company)
      .reduce((s, a) => s + a.delta, 0);
    return rawVal + delta;
  };

  const pushAdjustment = async (adj: Adjustment) => {
    setAdjustments(prev => [...prev, adj]);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) { showToast("Not signed in to Google", "error"); return; }
      await fetch("/api/cc-expense/adjustments/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          rows: [[adj.weekStart, adj.vendor, adj.company, adj.delta]],
        }),
      });
    } catch {
      showToast("Adjustment saved locally but failed to sync to sheet", "error");
    }
  };

  // Remarks: keyed by `${weekStart}||${vendor}`, persisted in localStorage
  const [remarks, setRemarks] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("cc_expense_remarks") || "{}"); } catch { return {}; }
  });

  const remarkKey = (weekStart: string, vendor: string) => `${weekStart}||${vendor}`;

  const setRemark = (weekStart: string, vendor: string, text: string) => {
    const key = remarkKey(weekStart, vendor);
    const updated = { ...remarks, [key]: text };
    setRemarks(updated);
    localStorage.setItem("cc_expense_remarks", JSON.stringify(updated));
  };

  // User-approved extra card accounts (persisted in localStorage)
  const [approvedAccounts, setApprovedAccounts] = useState<Set<string>>(loadApprovedAccounts);

  const approveAccount = (account: string) => {
    _approvedAccounts.add(account);
    const next = new Set(_approvedAccounts);
    saveApprovedAccounts(next);
    setApprovedAccounts(next);
    // Re-group now that this account is approved
    setRawRows(prev => {
      const grouped = groupIntoWeeks(prev);
      setWeeks(grouped);
      if (grouped.length > 0) setSelectedWeek(w => grouped.some(g => g.weekStart === w) ? w : grouped[0].weekStart);
      return prev;
    });
    showToast(`Approved: ${account}`, "success", 2000);
  };

  // UI state
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hideZero, setHideZero] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Inline editing state: key = "weekStart||vendor||company"
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  // Drag state
  const [dragSource, setDragSource] = useState<{ vendor: string; company: string; amount: number } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // "vendor||company"

  // Transfer confirm modal
  const [transferModal, setTransferModal] = useState<{
    vendor: string; fromCompany: string; toCompany: string; amount: number;
  } | null>(null);

  // Vendor breakdown modal (Weekly tab)
  const [vendorModal, setVendorModal] = useState<{ vendor: string; rows: RawRow[] } | null>(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsedUploadRows, setParsedUploadRows] = useState<any[][] | null>(null);
  const [uploadHeaderRow, setUploadHeaderRow] = useState(0);
  const [uploadPreviewOpen, setUploadPreviewOpen] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived
  const weekEntries = weeks;
  const currentWeek = weekEntries.find(w => w.weekStart === selectedWeek);
  const weekTable = currentWeek ? buildWeekTable(currentWeek.rows, vendorMap) : [];
  const ytdTable = buildYTDTable(rawRows, vendorMap);

  const weekTotal = weekTable.reduce((s, r) => s + r.grandTotal, 0);
  const ytdTotal = ytdTable.reduce((s, r) => s + r.grandTotal, 0);

  // ── Inline edit: save new value for a company cell ─────────────────────────
  const cellKey = (vendor: string, company: string) => `${selectedWeek}||${vendor}||${company}`;

  const startEdit = (vendor: string, company: string, currentVal: number) => {
    if (activeTab !== "weekly") return;
    setEditingCell(cellKey(vendor, company));
    setEditingValue(currentVal === 0 ? "" : String(currentVal.toFixed(2)));
  };

  const commitEdit = async (vendor: string, company: string, rawVal: number) => {
    if (!editingCell) return;
    const newVal = parseFloat(editingValue.replace(/[$,]/g, "")) || 0;
    const delta = newVal - rawVal;
    setEditingCell(null);
    setEditingValue("");
    if (delta === 0) return;
    await pushAdjustment({ weekStart: selectedWeek, vendor, company, delta });
    showToast(`Updated ${vendor} / ${company}`, "success", 2000);
  };

  // ── Drag to transfer amount between companies ────────────────────────────────
  const handleDragStart = (vendor: string, company: string, amount: number) => {
    if (activeTab !== "weekly" || amount === 0) return;
    setDragSource({ vendor, company, amount });
  };

  const handleCellDrop = (vendor: string, company: string) => {
    if (!dragSource || dragSource.company === company || dragSource.vendor !== vendor) {
      setDragSource(null); setDragOver(null); return;
    }
    setTransferModal({
      vendor,
      fromCompany: dragSource.company,
      toCompany: company,
      amount: dragSource.amount,
    });
    setDragSource(null);
    setDragOver(null);
  };

  const confirmTransfer = async () => {
    if (!transferModal) return;
    const { vendor, fromCompany, toCompany, amount } = transferModal;
    setTransferModal(null);
    // Debit source, credit target
    await pushAdjustment({ weekStart: selectedWeek, vendor, company: fromCompany, delta: -amount });
    await pushAdjustment({ weekStart: selectedWeek, vendor, company: toCompany, delta: amount });
    showToast(`Transferred ${fmtMoneyRaw(amount)} from ${fromCompany} → ${toCompany}`, "success", 3000);
  };

  // ── Pull live data ──────────────────────────────────────────────────────────
  const pullFromSheet = useCallback(async () => {
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s hard timeout
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        showToast("Not signed in to Google — upload a CSV to view data", "error");
        return;
      }
      const resp = await fetch("/api/cc-expense/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
        signal: controller.signal,
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || "Unknown error");
      const rows = rawRowsFromSheetRows(data.rawRows || []);
      const vMap: Record<string, string> = {};
      for (const r of (data.vendorMapRows || []).slice(1)) {
        if (r[0]) vMap[String(r[0]).trim()] = String(r[1] || r[0]).trim();
      }
      setRawRows(rows);
      setVendorMap(vMap);
      const grouped = groupIntoWeeks(rows);
      setWeeks(grouped);
      if (grouped.length > 0) setSelectedWeek(grouped[0].weekStart);

      // Also pull adjustments
      try {
        const adjResp = await fetch("/api/cc-expense/adjustments/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const adjData = await adjResp.json();
        if (adjData.ok && adjData.rows) {
          setAdjustments(adjData.rows.map((r: any[]) => ({
            weekStart: String(r[0] || ""),
            vendor: String(r[1] || ""),
            company: String(r[2] || ""),
            delta: parseFloat(String(r[3] || "0")) || 0,
          })));
        }
      } catch { /* adjustments tab may not exist yet */ }

      showToast(`Loaded ${rows.length} transactions from sheet`, "success");
    } catch (e: any) {
      const msg = e?.name === "AbortError"
        ? "Sheet load timed out — upload a CSV to view data"
        : `Pull failed: ${e?.message || String(e)}`;
      showToast(msg, "error");
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [showToast]);

  // Load on mount — only if Google auth is already cached (don't block with a slow sheet pull)
  useEffect(() => {
    const token = localStorage.getItem("google_access_token");
    if (token) pullFromSheet();
  }, []);

  // ── File selection ──────────────────────────────────────────────────────────
  /** Minimal RFC-4180 CSV parser — handles quoted fields with embedded commas/newlines. */
  const parseCSVText = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      if (inQuote) {
        if (ch === '"' && next === '"') { field += '"'; i++; }        // escaped quote
        else if (ch === '"')            { inQuote = false; }          // close quote
        else                            { field += ch; }
      } else {
        if      (ch === '"')                        { inQuote = true; }
        else if (ch === ',')                        { row.push(field); field = ""; }
        else if (ch === '\r' && next === '\n')      { row.push(field); field = ""; rows.push(row); row = []; i++; }
        else if (ch === '\n' || ch === '\r')        { row.push(field); field = ""; rows.push(row); row = []; }
        else                                        { field += ch; }
      }
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ""));
  };

  const handleFileSelect = useCallback(async (file: File) => {
    setUploadFile(file);
    setParseError(null);
    setParsedUploadRows(null);
    setUploadPreviewOpen(false);
    try {
      let rows: any[][];

      const isCSV = /\.csv$/i.test(file.name);
      if (isCSV) {
        // Parse CSV entirely in the browser — no server round-trip, no base64 encoding
        const text = await file.text();
        rows = parseCSVText(text);
      } else {
        // XLSX / XLS — send to server for parsing (requires XLSX library)
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk)
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        const base64 = btoa(binary);
        const resp = await fetch("/api/cc-expense/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
        });
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error || "Parse failed");
        rows = data.rows || [];
      }

      setParsedUploadRows(rows);
      // Find header row (row that contains "Transaction Date" or "Name")
      let hdr = 0;
      for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const row = rows[i];
        if (row.some((c: any) => String(c).toLowerCase().includes("transaction date") || String(c).toLowerCase() === "name")) {
          hdr = i;
          break;
        }
      }
      setUploadHeaderRow(hdr);
      setUploadPreviewOpen(true);
    } catch (e: any) {
      setParseError(e?.message || String(e));
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  // ── Confirm upload → write to sheet ────────────────────────────────────────
  const handleConfirmUpload = useCallback(async () => {
    if (!parsedUploadRows) return;
    setUploading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) { showToast("Not signed in to Google", "error"); return; }
      // Build rows to write (skip header, include all data rows)
      const dataRows = parsedUploadRows.slice(uploadHeaderRow + 1).filter(r => r.some(c => c !== ""));
      const resp = await fetch("/api/cc-expense/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, rows: dataRows }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || "Upload failed");
      showToast(`Saved ${data.updated} rows to Raw Data tab`, "success");

      // Load directly from the parsed CSV rows — no sheet round-trip needed.
      // This avoids any sheet row-limit issues and makes the view update instantly.
      const csvRows = rawRowsFromUploadedRows(parsedUploadRows, uploadHeaderRow);
      setRawRows(csvRows);
      const grouped = groupIntoWeeks(csvRows);
      setWeeks(grouped);
      if (grouped.length > 0) setSelectedWeek(grouped[0].weekStart);

      setUploadFile(null);
      setParsedUploadRows(null);
      setUploadPreviewOpen(false);
    } catch (e: any) {
      showToast(`Upload failed: ${e?.message || String(e)}`, "error");
    } finally {
      setUploading(false);
    }
  }, [parsedUploadRows, uploadHeaderRow, showToast, pullFromSheet]);

  // ── Styling helpers ─────────────────────────────────────────────────────────
  const cardCls = isLight
    ? "bg-white border border-slate-200 rounded-lg"
    : "bg-[#111318] border border-[#1e2535] rounded-lg";
  const headerCls = isLight ? "bg-slate-50 border-b border-slate-200" : "bg-[#0d1117] border-b border-[#1e2535]";
  const thCls = `px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide ${isLight ? "text-slate-500" : "text-slate-400"}`;
  const tdCls = `px-3 py-1.5 text-right text-[12px] tabular-nums`;
  const rowHoverCls = isLight ? "hover:bg-slate-50" : "hover:bg-white/[0.03]";

  // Company columns that have any data in the current view
  const activeCompanies = COMPANIES.filter(co => {
    const table = activeTab === "weekly" ? weekTable : ytdTable;
    return table.some(r => (r.byCompany[co] || 0) !== 0);
  });
  const displayCompanies = hideZero ? activeCompanies : [...COMPANIES];

  const sq = searchQuery.trim().toLowerCase();

  const displayTable = (activeTab === "weekly" ? weekTable : ytdTable).filter(r => {
    const matchesZero = !hideZero || displayCompanies.some(co => (r.byCompany[co] || 0) !== 0) || r.grandTotal !== 0;
    const matchesSearch = !sq || r.vendor.toLowerCase().includes(sq);
    return matchesZero && matchesSearch;
  });

  const filteredRawRows = !sq
    ? rawRows
    : rawRows.filter(r =>
        [r.name, r.category, r.transactionType, r.description, r.account, r.classCompany, r.location, r.transactionDate]
          .some(v => v.toLowerCase().includes(sq))
      );

  // Accounts present in raw data that don't match any CC pattern — shown as a warning
  // so the user can approve them directly from the banner.
  const unrecognizedAccounts = Array.from(
    new Set(rawRows.filter(r => r.account && !isCCRow(r)).map(r => r.account))
  ).sort();

  const columnTotals: Record<string, number> = {};
  for (const co of displayCompanies) {
    columnTotals[co] = displayTable.reduce((s, r) => s + (r.byCompany[co] || 0), 0);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-900" : "bg-[#0a0c10] text-white"}`}>

      {/* ── Header ── */}
      <div className={`shrink-0 px-5 py-3 border-b flex items-center justify-between gap-3 ${isLight ? "bg-white border-slate-200" : "bg-[#0d1117] border-[#1e2535]"}`}>
        <div className="flex items-center gap-2.5">
          <CreditCard className={`w-5 h-5 ${isLight ? "text-[#1a73e8]" : "text-[#4f9cf9]"}`} />
          <h1 className="text-[15px] font-semibold">CC Expenses</h1>
          <span className={`text-[11px] px-1.5 py-0.5 rounded ${isLight ? "bg-slate-100 text-slate-500" : "bg-[#1a2235] text-slate-400"}`}>
            4Grace_CC_Expense
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={pullFromSheet}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${
              isLight
                ? "bg-[#1a73e8] hover:bg-[#1557b0] text-white"
                : "bg-[#1a73e8]/90 hover:bg-[#1a73e8] text-white"
            } disabled:opacity-50`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Pull from Sheet"}
          </button>
        </div>
      </div>

      {/* ── Upload bar ── */}
      <div className={`shrink-0 px-5 py-2.5 border-b ${isLight ? "bg-white border-slate-200" : "bg-[#0d1117] border-[#1e2535]"}`}>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`flex items-center gap-3 border-2 border-dashed rounded-lg px-4 py-2.5 cursor-pointer transition-colors ${
            isLight
              ? "border-slate-300 hover:border-[#1a73e8] hover:bg-blue-50/50"
              : "border-[#2a3550] hover:border-[#4f9cf9]/60 hover:bg-[#1a2235]/40"
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud className={`w-4 h-4 shrink-0 ${isLight ? "text-slate-400" : "text-slate-500"}`} />
          {uploadFile ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FileText className="w-3.5 h-3.5 shrink-0 text-blue-400" />
              <span className="text-[12px] truncate">{uploadFile.name}</span>
              {parsedUploadRows && (
                <span className={`text-[11px] shrink-0 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  {parsedUploadRows.length - uploadHeaderRow - 1} rows parsed
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); setUploadFile(null); setParsedUploadRows(null); setUploadPreviewOpen(false); }}
                className="ml-auto shrink-0 p-0.5 rounded hover:bg-slate-200/40"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          ) : (
            <span className={`text-[12px] ${isLight ? "text-slate-400" : "text-slate-500"}`}>
              Drop CSV or XLSX here, or click to browse — uploads to Raw Data tab
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
        />
        {parseError && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-500">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {parseError}
          </div>
        )}
      </div>

      {/* ── Upload preview panel ── */}
      {uploadPreviewOpen && parsedUploadRows && (
        <div className={`shrink-0 border-b px-5 py-3 ${isLight ? "bg-amber-50 border-amber-200" : "bg-amber-950/20 border-amber-800/40"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[12px] font-medium ${isLight ? "text-amber-800" : "text-amber-300"}`}>
                Preview — {parsedUploadRows.length - uploadHeaderRow - 1} data rows from {uploadFile?.name}
              </p>
              <p className={`text-[11px] mt-0.5 ${isLight ? "text-amber-700" : "text-amber-400"}`}>
                Confirming will overwrite the Raw Data tab in the Google Sheet.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setUploadPreviewOpen(false)}
                className={`px-3 py-1.5 rounded text-[12px] font-medium ${isLight ? "bg-white border border-slate-300 text-slate-700" : "bg-[#1a2235] border border-[#2a3550] text-slate-300"}`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUpload}
                disabled={uploading}
                className="px-3 py-1.5 rounded text-[12px] font-medium bg-[#1a73e8] text-white hover:bg-[#1557b0] disabled:opacity-50 flex items-center gap-1.5"
              >
                {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploading ? "Saving…" : "Confirm & Save to Sheet"}
              </button>
            </div>
          </div>
          {/* Preview table */}
          <div className="mt-2 overflow-x-auto rounded border border-amber-200 dark:border-amber-800/40 max-h-40">
            <table className="text-[11px] w-full">
              <thead>
                <tr className={isLight ? "bg-amber-100" : "bg-amber-900/30"}>
                  {(parsedUploadRows[uploadHeaderRow] || RAW_HEADERS).map((h: any, i: number) => (
                    <th key={i} className="px-2 py-1 text-left font-semibold whitespace-nowrap">{String(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedUploadRows.slice(uploadHeaderRow + 1, uploadHeaderRow + 6).map((row: any[], ri: number) => (
                  <tr key={ri} className={isLight ? "border-t border-amber-200" : "border-t border-amber-900/30"}>
                    {row.map((cell: any, ci: number) => (
                      <td key={ci} className="px-2 py-1 whitespace-nowrap">{String(cell ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tabs + Controls ── */}
      <div className={`shrink-0 px-5 pt-3 pb-0 border-b flex items-end justify-between gap-3 ${isLight ? "bg-white border-slate-200" : "bg-[#0d1117] border-[#1e2535]"}`}>
        <div className="flex items-end gap-0">
          {(["weekly", "ytd", "raw"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? isLight
                    ? "border-[#1a73e8] text-[#1a73e8]"
                    : "border-[#4f9cf9] text-[#4f9cf9]"
                  : isLight
                    ? "border-transparent text-slate-500 hover:text-slate-700"
                    : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab === "weekly" ? "Weekly" : tab === "ytd" ? "YTD" : "Raw Data"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 pb-2">
          {/* Search — visible on all tabs */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className={`pl-8 pr-3 py-1.5 text-[12px] rounded border w-44 outline-none ${
                isLight
                  ? "bg-white border-slate-300 text-slate-700 placeholder-slate-400 focus:border-[#1a73e8]"
                  : "bg-[#111318] border-[#2a3550] text-slate-200 placeholder-slate-500 focus:border-[#4f9cf9]/60"
              }`}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {activeTab === "weekly" && (
            <div className="relative">
              <select
                value={selectedWeek}
                onChange={e => setSelectedWeek(e.target.value)}
                className={`appearance-none pr-7 pl-3 py-1.5 text-[12px] rounded border ${
                  isLight
                    ? "bg-white border-slate-300 text-slate-700"
                    : "bg-[#111318] border-[#2a3550] text-slate-200"
                }`}
              >
                {weekEntries.length === 0 && <option value="">No data</option>}
                {weekEntries.map(w => (
                  <option key={w.weekStart} value={w.weekStart}>{w.weekLabel}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
            </div>
          )}
          <button
            onClick={() => setHideZero(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] transition-colors ${
              isLight
                ? "bg-slate-100 hover:bg-slate-200 text-slate-600"
                : "bg-[#1a2235] hover:bg-[#1e2a40] text-slate-400"
            }`}
          >
            {hideZero ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {hideZero ? "Showing active" : "Showing all"}
          </button>
        </div>
      </div>

      {/* ── Unrecognized account warning ── */}
      {unrecognizedAccounts.length > 0 && (
        <div className={`shrink-0 px-5 py-2 border-b flex flex-wrap items-center gap-2 ${isLight ? "bg-amber-50 border-amber-200" : "bg-amber-900/10 border-amber-700/20"}`}>
          <span className={`text-[11px] font-semibold shrink-0 ${isLight ? "text-amber-700" : "text-amber-400"}`}>
            ⚠ Unrecognized card accounts (hidden from weekly/YTD):
          </span>
          {unrecognizedAccounts.map(acct => (
            <span key={acct} className="flex items-center gap-1">
              <code className={`text-[11px] px-2 py-0.5 rounded font-mono ${isLight ? "bg-amber-100 text-amber-800" : "bg-amber-900/30 text-amber-300"}`}>
                {acct}
              </code>
              <button
                onClick={() => approveAccount(acct)}
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                  isLight
                    ? "bg-green-100 text-green-700 hover:bg-green-200 border border-green-300"
                    : "bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-700/40"
                }`}
                title="Approve this card — its transactions will appear in Weekly/YTD views"
              >
                ✓ Approve
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Summary pills ── */}
      {(activeTab === "weekly" || activeTab === "ytd") && (
        <div className={`shrink-0 px-5 py-2 border-b flex items-center gap-4 ${isLight ? "bg-white border-slate-200" : "bg-[#0d1117] border-[#1e2535]"}`}>
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              {activeTab === "weekly" ? "Week Total:" : "YTD Total:"}
            </span>
            <span className={`text-[13px] font-semibold ${isLight ? "text-slate-800" : "text-white"}`}>
              {fmtMoneyRaw(activeTab === "weekly" ? weekTotal : ytdTotal)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>Vendors:</span>
            <span className={`text-[12px] ${isLight ? "text-slate-700" : "text-slate-300"}`}>
              {displayTable.length}
            </span>
          </div>
          {activeTab === "weekly" && currentWeek && (
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}>Transactions:</span>
              <span className={`text-[12px] ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                {currentWeek.rows.length}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Transfer Confirm Modal ── */}
      {transferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)" }}>
          <div className={`w-full max-w-sm rounded-xl shadow-2xl border p-5 ${isLight ? "bg-white border-slate-200" : "bg-[#111318] border-[#1e2535]"}`}>
            <h2 className={`text-[15px] font-semibold mb-1 ${isLight ? "text-slate-800" : "text-white"}`}>Transfer Amount</h2>
            <p className={`text-[13px] mb-4 ${isLight ? "text-slate-600" : "text-slate-300"}`}>
              Move <span className="font-semibold">{fmtMoneyRaw(Math.abs(transferModal.amount))}</span> for{" "}
              <span className="font-semibold">{transferModal.vendor}</span> from{" "}
              <span className={isLight ? "text-[#1a73e8]" : "text-[#4f9cf9]"}>{transferModal.fromCompany}</span>{" "}→{" "}
              <span className={isLight ? "text-[#1a73e8]" : "text-[#4f9cf9]"}>{transferModal.toCompany}</span>?
            </p>
            <p className={`text-[11px] mb-4 ${isLight ? "text-slate-400" : "text-slate-500"}`}>
              This adjustment will be saved to the CC Adjustments tab in the Google Sheet.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTransferModal(null)}
                className={`px-4 py-1.5 rounded text-[12px] font-medium ${isLight ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-[#1a2235] text-slate-300 hover:bg-[#1e2a40]"}`}
              >
                Cancel
              </button>
              <button
                onClick={confirmTransfer}
                className="px-4 py-1.5 rounded text-[12px] font-medium bg-[#1a73e8] text-white hover:bg-[#1557b0]"
              >
                Confirm Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vendor Breakdown Modal ── */}
      {vendorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)" }}>
          <div className={`w-full max-w-3xl max-h-[80vh] flex flex-col rounded-xl shadow-2xl border ${
            isLight ? "bg-white border-slate-200" : "bg-[#111318] border-[#1e2535]"
          }`}>
            {/* Modal header */}
            <div className={`flex items-center justify-between px-5 py-3.5 border-b ${isLight ? "border-slate-200" : "border-[#1e2535]"}`}>
              <div>
                <h2 className={`text-[15px] font-semibold ${isLight ? "text-slate-800" : "text-white"}`}>
                  {vendorModal.vendor}
                </h2>
                <p className={`text-[12px] mt-0.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                  {currentWeek?.weekLabel} · {vendorModal.rows.length} transaction{vendorModal.rows.length !== 1 ? "s" : ""} ·{" "}
                  <span className="font-semibold">
                    {fmtMoneyRaw(vendorModal.rows.reduce((s, r) => s + r.amount, 0))}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setVendorModal(null)}
                className={`p-1.5 rounded-lg transition-colors ${isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-[#1e2535] text-slate-400"}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Modal table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead className={`sticky top-0 ${isLight ? "bg-slate-50 border-b border-slate-200" : "bg-[#0d1117] border-b border-[#1e2535]"}`}>
                  <tr>
                    {["Date", "Name", "Description", "Account / Card", "Company", "Amount"].map(h => (
                      <th key={h} className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${isLight ? "text-slate-500" : "text-slate-400"} ${h === "Amount" ? "text-right" : ""}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendorModal.rows
                    .slice()
                    .sort((a, b) => {
                      const da = parseDate(a.transactionDate)?.getTime() || 0;
                      const db = parseDate(b.transactionDate)?.getTime() || 0;
                      return da - db;
                    })
                    .map((r, i) => (
                      <tr key={i} className={`border-t ${isLight ? "border-slate-100 hover:bg-slate-50" : "border-[#1a2030] hover:bg-white/[0.03]"}`}>
                        <td className="px-3 py-2 whitespace-nowrap">{r.transactionDate}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium">{r.name}</td>
                        <td className={`px-3 py-2 max-w-[220px] truncate ${isLight ? "text-slate-600" : "text-slate-400"}`} title={r.description}>{r.description || "—"}</td>
                        <td className={`px-3 py-2 whitespace-nowrap ${isLight ? "text-slate-600" : "text-slate-400"}`}>{r.account || "—"}</td>
                        <td className={`px-3 py-2 whitespace-nowrap ${isLight ? "text-slate-600" : "text-slate-400"}`}>{r.classCompany || "—"}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap ${r.amount < 0 ? "text-red-500" : isLight ? "text-slate-800" : "text-white"}`}>
                          {fmtMoneyRaw(r.amount)}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
                {/* Footer total */}
                <tfoot className={`sticky bottom-0 border-t-2 ${isLight ? "bg-slate-50 border-slate-300" : "bg-[#0d1117] border-[#2a3550]"}`}>
                  <tr>
                    <td colSpan={5} className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wide ${isLight ? "text-slate-600" : "text-slate-300"}`}>
                      Total
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-bold text-[13px] ${isLight ? "text-slate-800" : "text-white"}`}>
                      {fmtMoneyRaw(vendorModal.rows.reduce((s, r) => s + r.amount, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Main table area ── */}
      <div className="flex-1 overflow-auto">
        {rawRows.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
            <CreditCard className={`w-10 h-10 ${isLight ? "text-slate-300" : "text-slate-600"}`} />
            <p className={`text-[14px] font-medium ${isLight ? "text-slate-500" : "text-slate-400"}`}>No data loaded</p>
            <p className={`text-[12px] ${isLight ? "text-slate-400" : "text-slate-500"}`}>
              Click "Pull from Sheet" to load CC expense data, or upload a CSV/XLSX file.
            </p>
          </div>
        ) : activeTab === "raw" ? (
          /* Raw data table */
          <div className="min-w-max">
            <table className="w-full border-collapse text-[12px]">
              <thead className={`sticky top-0 z-10 ${headerCls}`}>
                <tr>
                  {RAW_HEADERS.map((h, i) => (
                    <th key={i} className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide ${isLight ? "text-slate-500" : "text-slate-400"} whitespace-nowrap`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRawRows.map((row, ri) => (
                  <tr key={ri} className={`border-t ${isLight ? "border-slate-100" : "border-[#1a2030]"} ${rowHoverCls}`}>
                    <td className="px-3 py-1.5 whitespace-nowrap">{row.category}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{row.transactionDate}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{row.transactionType}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{row.num}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap font-medium">{row.name}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{row.location}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{row.classCompany}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate">{row.description}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{row.account}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${row.amount < 0 ? "text-red-500" : ""}`}>
                      {fmtMoneyRaw(row.amount)}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${isLight ? "text-slate-500" : "text-slate-500"}`}>
                      {fmtMoneyRaw(row.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Weekly / YTD pivot table */
          <div className="min-w-max">
            <table className="w-full border-collapse text-[12px]">
              <thead className={`sticky top-0 z-10 ${headerCls}`}>
                <tr>
                  <th className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide sticky left-0 ${isLight ? "bg-slate-50 text-slate-500" : "bg-[#0d1117] text-slate-400"} whitespace-nowrap`}>
                    Vendor
                  </th>
                  {activeTab === "weekly" && (
                    <th className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${isLight ? "text-slate-500" : "text-slate-400"}`} style={{minWidth: 160}}>
                      Remarks
                    </th>
                  )}
                  <th className={`${thCls} font-bold ${isLight ? "text-slate-700" : "text-slate-200"}`}>Grand Total</th>
                  {displayCompanies.map(co => (
                    <th key={co} className={`${thCls} whitespace-nowrap`}>{co}</th>
                  ))}
                </tr>
                {/* Totals row */}
                <tr className={`border-t ${isLight ? "border-slate-200 bg-blue-50/50" : "border-[#1e2535] bg-[#1a2235]/60"}`}>
                  <td className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide sticky left-0 ${isLight ? "bg-blue-50/50 text-slate-700" : "bg-[#1a2235]/60 text-slate-300"}`}>
                    TOTAL
                  </td>
                  {activeTab === "weekly" && <td />}
                  <td className={`px-3 py-1.5 text-right font-bold tabular-nums text-[12px] ${isLight ? "text-slate-800" : "text-white"}`}>
                    {fmtMoneyRaw(activeTab === "weekly" ? weekTotal : ytdTotal)}
                  </td>
                  {displayCompanies.map(co => (
                    <td key={co} className={`px-3 py-1.5 text-right font-semibold tabular-nums ${columnTotals[co] < 0 ? "text-red-500" : isLight ? "text-slate-700" : "text-slate-200"}`}>
                      {fmtMoney(columnTotals[co])}
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayTable.map((row, ri) => {
                  const isHighlighted = Math.abs(row.grandTotal) >= 500;
                  return (
                    <tr
                      key={ri}
                      className={`border-t transition-colors ${
                        isLight ? "border-slate-100" : "border-[#1a2030]"
                      } ${isHighlighted
                        ? isLight
                          ? "bg-pink-50 hover:bg-pink-100/50"
                          : "bg-pink-950/20 hover:bg-pink-950/30"
                        : rowHoverCls
                      }`}
                    >
                      <td className={`px-3 py-1.5 font-medium whitespace-nowrap sticky left-0 ${
                        isHighlighted
                          ? isLight ? "bg-pink-50 text-pink-900" : "bg-pink-950/20 text-pink-200"
                          : isLight ? "bg-white text-slate-800" : "bg-[#0a0c10] text-slate-200"
                      }`}>
                        {activeTab === "weekly" ? (
                          <button
                            onClick={() => {
                              const vendorRows = (currentWeek?.rows || []).filter(r =>
                                (vendorMap[r.name] || r.name) === row.vendor
                              );
                              setVendorModal({ vendor: row.vendor, rows: vendorRows });
                            }}
                            className={`text-left underline decoration-dotted underline-offset-2 hover:no-underline transition-colors ${
                              isHighlighted
                                ? isLight ? "text-pink-700 hover:text-pink-900" : "text-pink-300 hover:text-pink-100"
                                : isLight ? "text-[#1a73e8] hover:text-[#1557b0]" : "text-[#4f9cf9] hover:text-white"
                            }`}
                          >
                            {row.vendor}
                          </button>
                        ) : (
                          row.vendor
                        )}
                      </td>
                      {activeTab === "weekly" && (
                        <td className="px-2 py-1">
                          <textarea
                            rows={1}
                            value={remarks[remarkKey(selectedWeek, row.vendor)] || ""}
                            onChange={e => setRemark(selectedWeek, row.vendor, e.target.value)}
                            placeholder="Add remark…"
                            className={`w-full min-w-[150px] resize-none rounded px-2 py-1 text-[11px] leading-snug outline-none transition-colors ${
                              isLight
                                ? "bg-slate-100 border border-slate-200 focus:border-blue-400 text-slate-700 placeholder-slate-400"
                                : "bg-[#1a2030] border border-[#2a3550] focus:border-[#4f9cf9]/60 text-slate-300 placeholder-slate-600"
                            }`}
                            onInput={e => {
                              const t = e.currentTarget;
                              t.style.height = "auto";
                              t.style.height = t.scrollHeight + "px";
                            }}
                          />
                        </td>
                      )}
                      <td className={`${tdCls} font-semibold ${
                        (activeTab === "weekly"
                          ? displayCompanies.reduce((s, co) => s + getAdjustedValue(selectedWeek, row.vendor, co, row.byCompany[co] || 0), 0)
                          : row.grandTotal) < 0
                          ? "text-red-500" : isLight ? "text-slate-800" : "text-white"
                      }`}>
                        {fmtMoneyRaw(
                          activeTab === "weekly"
                            ? displayCompanies.reduce((s, co) => s + getAdjustedValue(selectedWeek, row.vendor, co, row.byCompany[co] || 0), 0)
                            : row.grandTotal
                        )}
                      </td>
                      {displayCompanies.map(co => {
                        const rawVal = row.byCompany[co] || 0;
                        const val = activeTab === "weekly"
                          ? getAdjustedValue(selectedWeek, row.vendor, co, rawVal)
                          : rawVal;
                        const ck = cellKey(row.vendor, co);
                        const isEditing = editingCell === ck && activeTab === "weekly";
                        const isDragOver = dragOver === `${row.vendor}||${co}`;
                        const hasAdjustment = activeTab === "weekly" && val !== rawVal;
                        return (
                          <td
                            key={co}
                            className={`${tdCls} relative transition-colors ${
                              val < 0 ? "text-red-500" : isLight ? "text-slate-700" : "text-slate-300"
                            } ${isDragOver ? (isLight ? "bg-blue-100 ring-1 ring-blue-400" : "bg-blue-900/30 ring-1 ring-blue-400") : ""}`}
                            draggable={activeTab === "weekly" && val !== 0}
                            onDragStart={() => handleDragStart(row.vendor, co, val)}
                            onDragOver={e => { if (dragSource && dragSource.vendor === row.vendor && dragSource.company !== co) { e.preventDefault(); setDragOver(`${row.vendor}||${co}`); } }}
                            onDragLeave={() => setDragOver(null)}
                            onDrop={(_e) => handleCellDrop(row.vendor, co)}
                            onDragEnd={() => { setDragSource(null); setDragOver(null); }}
                            onDoubleClick={() => startEdit(row.vendor, co, val)}
                            title={activeTab === "weekly" ? "Double-click to edit · Drag to transfer" : undefined}
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                type="text"
                                value={editingValue}
                                onChange={e => setEditingValue(e.target.value)}
                                onBlur={() => commitEdit(row.vendor, co, val)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") commitEdit(row.vendor, co, val);
                                  if (e.key === "Escape") { setEditingCell(null); setEditingValue(""); }
                                }}
                                className={`w-full text-right text-[11px] tabular-nums rounded px-1 py-0.5 outline-none border ${
                                  isLight
                                    ? "bg-blue-50 border-blue-400 text-slate-800"
                                    : "bg-[#1a2540] border-[#4f9cf9] text-white"
                                }`}
                              />
                            ) : (
                              <span className={hasAdjustment ? "underline decoration-dotted underline-offset-2 decoration-amber-400" : ""}>
                                {fmtMoney(val)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
