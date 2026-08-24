import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, RefreshCw, ChevronDown, Eye, EyeOff, AlertCircle,
  CheckCircle2, X, FileText, UploadCloud, ShoppingCart
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
  const byWeek = new Map<string, RawRow[]>();
  for (const row of rawRows) {
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

function buildWeekTable(rows: RawRow[], vendorMap: Record<string, string>): VendorWeekRow[] {
  const byVendor = new Map<string, Record<string, number>>();
  for (const row of rows) {
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
  return buildWeekTable(allRows, vendorMap);
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

  // UI state
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hideZero, setHideZero] = useState(true);

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

  // ── Pull live data ──────────────────────────────────────────────────────────
  const pullFromSheet = useCallback(async () => {
    setLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) { showToast("Not signed in to Google", "error"); return; }
      const resp = await fetch("/api/cc-expense/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
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
      showToast(`Loaded ${rows.length} transactions from sheet`, "success");
    } catch (e: any) {
      showToast(`Pull failed: ${e?.message || String(e)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Load on mount
  useEffect(() => { pullFromSheet(); }, []);

  // ── File selection ──────────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (file: File) => {
    setUploadFile(file);
    setParseError(null);
    setParsedUploadRows(null);
    setUploadPreviewOpen(false);
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const resp = await fetch("/api/cc-expense/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || "Parse failed");
      setParsedUploadRows(data.rows || []);
      // Find header row (row that contains "Transaction Date" or "Name")
      const rows: any[][] = data.rows || [];
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
      setUploadFile(null);
      setParsedUploadRows(null);
      setUploadPreviewOpen(false);
      // Re-pull to refresh local state
      await pullFromSheet();
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

  const displayTable = (activeTab === "weekly" ? weekTable : ytdTable).filter(r =>
    !hideZero || displayCompanies.some(co => (r.byCompany[co] || 0) !== 0) || r.grandTotal !== 0
  );

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
          <ShoppingCart className={`w-5 h-5 ${isLight ? "text-[#1a73e8]" : "text-[#4f9cf9]"}`} />
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

      {/* ── Main table area ── */}
      <div className="flex-1 overflow-auto">
        {rawRows.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
            <ShoppingCart className={`w-10 h-10 ${isLight ? "text-slate-300" : "text-slate-600"}`} />
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
                {rawRows.map((row, ri) => (
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
                        {row.vendor}
                      </td>
                      <td className={`${tdCls} font-semibold ${row.grandTotal < 0 ? "text-red-500" : isLight ? "text-slate-800" : "text-white"}`}>
                        {fmtMoneyRaw(row.grandTotal)}
                      </td>
                      {displayCompanies.map(co => {
                        const val = row.byCompany[co] || 0;
                        return (
                          <td key={co} className={`${tdCls} ${val < 0 ? "text-red-500" : isLight ? "text-slate-700" : "text-slate-300"}`}>
                            {fmtMoney(val)}
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
