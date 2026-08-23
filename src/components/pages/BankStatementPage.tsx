import React, { useState, useCallback, useRef } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  ChevronLeft, Upload, FileText, Download, CheckCircle2,
  AlertTriangle, Loader2, Trash2, Table2, BarChart3, X,
  Plus, Eye, EyeOff, PanelRightClose, PanelRightOpen
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────── */
interface Transaction {
  Date: string;
  Description: string;
  Debit: number | "";
  Credit: number | "";
}

interface ParsedFile {
  id: string;
  name: string;
  size: number;
  transactions: Transaction[];
  method: "table" | "citi-text" | "generic-text" | "error";
  error?: string;
  fileUrl?: string;   // blob URL for PDF preview
}

/* ── Date helpers ────────────────────────────────────────────────────── */
function normalizeDate(raw: string): string {
  raw = raw.trim().replace(/,$/, "");
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, mo, d, y] = m;
    const yr = y.length === 2 ? "20" + y : y;
    return `${parseInt(mo)}/${parseInt(d)}/${yr}`;
  }
  m = raw.match(/^(\d{2})\/(\d{2})$/);
  if (m) return `${parseInt(m[1])}/${parseInt(m[2])}/2025`;
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${parseInt(m[2])}/${parseInt(m[3])}/${m[1]}`;
  m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${parseInt(m[2])}/${parseInt(m[1])}/${m[3]}`;
  const MONTHS: Record<string, number> = {
    jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12
  };
  m = raw.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s*(\d{4})?$/);
  if (m) {
    const [, mon, day, yr] = m;
    const mo = MONTHS[mon.toLowerCase()] ?? 1;
    return `${mo}/${parseInt(day)}/${yr ?? "2025"}`;
  }
  return raw;
}

function parseAmount(s: string): number | null {
  s = s.trim().replace(/\$/g, "").replace(/,/g, "").replace(/\s/g, "");
  if (s.startsWith("(") && s.endsWith(")")) s = "-" + s.slice(1, -1);
  if (s.endsWith("-")) s = "-" + s.slice(0, -1);
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

/* ── PDF text extraction ─────────────────────────────────────────────── */
async function extractPdfText(file: File): Promise<string[][]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).href;
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  const pages: string[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lineMap = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of content.items as any[]) {
      if (!item.str) continue;
      const bucket = Math.round(item.transform[5] / 4) * 4;
      if (!lineMap.has(bucket)) lineMap.set(bucket, []);
      lineMap.get(bucket)!.push({ x: item.transform[4], str: item.str });
    }
    const sortedBuckets = [...lineMap.keys()].sort((a, b) => b - a);
    const lines = sortedBuckets.map(y => {
      const sorted = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      return sorted.map(it => it.str).join("").replace(/\s+/g, " ").trim();
    }).filter(Boolean);
    pages.push(lines);
  }
  return pages;
}

/* ── Generic text parser ─────────────────────────────────────────────── */
const DATE_PATS = [
  /^(\d{1,2}\/\d{1,2}\/\d{2,4})/,
  /^(\d{2}\/\d{2})\s/,
  /^(\d{4}-\d{2}-\d{2})/,
  /^(\d{2}-\d{2}-\d{4})/,
  /^([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/,
  /^([A-Z][a-z]{2}\s+\d{1,2})\s/,
];
const AMT_RE = /-?\$?[\d,]+\.\d{2}-?/g;

function extractViaGenericText(allLines: string[]): Transaction[] {
  const txns: Transaction[] = [];
  for (const line of allLines) {
    let dateStr: string | null = null;
    let rest = line;
    for (const pat of DATE_PATS) {
      const m = line.match(pat);
      if (m) { dateStr = normalizeDate(m[1]); rest = line.slice(m[0].length).trim(); break; }
    }
    if (!dateStr) continue;
    const amounts = [...rest.matchAll(AMT_RE)].map(m => m[0]);
    if (!amounts.length) continue;
    const rawAmt = amounts[amounts.length - 1];
    const amt = parseAmount(rawAmt);
    if (amt === null) continue;
    const desc = rest.slice(0, rest.lastIndexOf(rawAmt)).trim().replace(/[,\s]+$/, "");
    if (!desc) continue;
    txns.push({ Date: dateStr, Description: desc, Debit: amt >= 0 ? amt : "", Credit: amt < 0 ? amt : "" });
  }
  return txns;
}

/* ── Citi parser ─────────────────────────────────────────────────────── */
const CITI_SKIP = [
  "www.citi","citicards","customer service","cont'd","trans. post",
  "date date description","this period","miles earned","aadvantage",
  "aa.com","american airlines","oneworld","admirals club","flagship",
  "total fees","total interest","interest charge","annual percentage",
  "balance type","standard purch","account messages","days in billing",
  "(v) may vary","balances followed","average daily","redeem miles",
  "log into","loyalty/login","car rentals","reserves the right",
  "six months","accumulate","products or services","third-party",
  "million miler","symbol logo","tail design","service marks",
  "already sent","over the credit limit","minimum payment due","overlimit",
];

function citiShouldSkip(line: string): boolean {
  if (!line) return true;
  const ll = line.toLowerCase();
  return CITI_SKIP.some(p => ll.includes(p));
}

function getCitiDates(allLines: string[]): { sm: number; sy: number; em: number; ey: number } | null {
  const joined = allLines.slice(0, 100).join(" ").replace(/\s+/g, " ");
  let m = joined.match(/Billing Period[:\s]+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[–\-]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (m) {
    const sy = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    const ey = m[6].length === 2 ? 2000 + parseInt(m[6]) : parseInt(m[6]);
    return { sm: parseInt(m[1]), sy, em: parseInt(m[4]), ey };
  }
  m = joined.match(/[Nn]ew\s+balance\s+as\s+of\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (m) {
    const ey = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    const em = parseInt(m[1]);
    return { sm: em > 1 ? em - 1 : 12, sy: em > 1 ? ey : ey - 1, em, ey };
  }
  m = joined.match(/[Ss]tatement\s+[Dd]ate\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (m) {
    const ey = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    const em = parseInt(m[1]);
    return { sm: em > 1 ? em - 1 : 12, sy: em > 1 ? ey : ey - 1, em, ey };
  }
  return null;
}

function citiYearForMonth(month: number, dates: { sm: number; sy: number; em: number; ey: number }): number {
  if (dates.sy === dates.ey) return dates.sy;
  return month >= dates.sm ? dates.sy : dates.ey;
}

function extractViaCitiText(allLines: string[]): Transaction[] {
  const amtRe = /(-?\$[\d,]+\.\d{2})/;
  const dates = getCitiDates(allLines);
  const currentYear = new Date().getFullYear();
  const txns: Transaction[] = [];
  let category: "Purchase" | "Payment/Credit" | "Fee" | "Interest" = "Purchase";

  function fmtDate(mmdd: string): string {
    const mo = parseInt(mmdd.slice(0, 2));
    const d  = parseInt(mmdd.slice(3, 5));
    const yr = dates ? citiYearForMonth(mo, dates) : currentYear;
    return `${mo}/${d}/${yr}`;
  }

  function addTxn(transDate: string, desc: string, amountStr: string) {
    const amt = parseFloat(amountStr.replace(/\$/g, "").replace(/,/g, ""));
    if (isNaN(amt)) return;
    const absAmt = Math.abs(amt);
    if (category === "Payment/Credit") {
      txns.push({ Date: fmtDate(transDate), Description: desc, Debit: "", Credit: absAmt });
    } else {
      txns.push({ Date: fmtDate(transDate), Description: desc, Debit: absAmt, Credit: "" });
    }
  }

  let i = 0;
  while (i < allLines.length) {
    const line = allLines[i];
    const ll   = line.toLowerCase().trim();
    if (ll.includes("payments, credits and adjustments") || ll.includes("payments and credits")) { category = "Payment/Credit"; i++; continue; }
    if ((ll.includes("standard purchases") || ll.includes("purchase transactions")) && !ll.includes("cont'd")) { category = "Purchase"; i++; continue; }
    if (ll === "fees charged" || ll === "fees") { category = "Fee"; i++; continue; }
    if (ll === "interest charged" || ll === "interest charges") { category = "Interest"; i++; continue; }
    if (/^\d{2}\/\d{2} \d{2}\/\d{2} /.test(line)) {
      const m = line.match(amtRe);
      if (m) { const desc = line.slice(12, line.indexOf(m[1])).trim(); if (desc) { addTxn(line.slice(0, 5), desc, m[1]); i++; continue; } }
    }
    if (/^\d{2}\/\d{2} /.test(line)) {
      const m = line.match(amtRe);
      if (m) { const desc = line.slice(6, line.indexOf(m[1])).trim(); if (desc && !citiShouldSkip(desc)) { addTxn(line.slice(0, 5), desc, m[1]); i++; continue; } }
    }
    if (citiShouldSkip(line)) { i++; continue; }
    i++;
  }
  return txns;
}

function isCiti(lines: string[]): boolean {
  const top = lines.slice(0, 50).join(" ").toLowerCase();
  return top.includes("citicards") || top.includes("aadvantage") || top.includes("citibank");
}

async function extractFromFile(file: File): Promise<{ txns: Transaction[]; method: ParsedFile["method"] }> {
  try {
    const pages = await extractPdfText(file);
    const allLines = pages.flat();
    if (isCiti(allLines)) {
      const txns = extractViaCitiText(allLines);
      if (txns.length >= 2) return { txns, method: "citi-text" };
    }
    const txns = extractViaGenericText(allLines);
    if (txns.length >= 2) return { txns, method: "generic-text" };
    return { txns: [], method: "generic-text" };
  } catch (e: any) {
    throw new Error(e?.message ?? "Failed to parse PDF");
  }
}

/* ── CSV export ──────────────────────────────────────────────────────── */
function txnsToCSV(txns: Transaction[]): string {
  const header = ["Date", "Description", " Debit ", " Credit ", "", "", "", "", "", ""].join(",");
  const rows = txns.map(t =>
    [t.Date, `"${t.Description.replace(/"/g, '""')}"`, t.Debit, t.Credit, "", "", "", "", "", ""].join(",")
  );
  return "﻿" + [header, ...rows].join("\r\n");
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function formatBytes(b: number): string {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

/* ── Component ────────────────────────────────────────────────────────── */
export function BankStatementPage({ onBack }: { onBack: () => void }) {
  const { theme } = useFinance();
  const isLight = theme === "light";

  const [files, setFiles]       = useState<ParsedFile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cl = (...cs: (string | false | undefined)[]) => cs.filter(Boolean).join(" ");

  const bg     = isLight ? "bg-slate-100"     : "bg-[#070b12]";
  const card   = isLight ? "bg-white"         : "bg-[#0d111a]";
  const border = isLight ? "border-slate-200" : "border-white/8";
  const text   = isLight ? "text-slate-800"   : "text-[#e8edf5]";
  const muted  = isLight ? "text-slate-500"   : "text-[#7a8394]";
  const rowHover = isLight ? "hover:bg-slate-50" : "hover:bg-white/4";
  const inputCls = `border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-blue-400 transition-colors ${
    isLight ? "bg-slate-50 border-slate-200 text-slate-800" : "bg-[#111] border-white/10 text-[#e8edf5]"
  }`;

  /* ── Computed ─────────────────────────────────────────────────────── */
  const allTxns    = files.flatMap(f => f.transactions);
  const totalDebit  = allTxns.reduce((s, t) => s + (typeof t.Debit  === "number" ? t.Debit  : 0), 0);
  const totalCredit = allTxns.reduce((s, t) => s + (typeof t.Credit === "number" ? t.Credit : 0), 0);
  const previewFile = previewFileId ? files.find(f => f.id === previewFileId) : null;

  /* ── File processing ─────────────────────────────────────────────── */
  const processFiles = useCallback(async (rawFiles: File[]) => {
    const pdfs = rawFiles.filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return;
    setProcessing(true);
    const results: ParsedFile[] = [];
    for (const pdf of pdfs) {
      const fileUrl = URL.createObjectURL(pdf);
      try {
        const { txns, method } = await extractFromFile(pdf);
        results.push({ id: crypto.randomUUID(), name: pdf.name, size: pdf.size, transactions: txns, method, fileUrl });
      } catch (e: any) {
        results.push({ id: crypto.randomUUID(), name: pdf.name, size: pdf.size, transactions: [], method: "error", error: e.message, fileUrl });
      }
    }
    setFiles(prev => [...prev, ...results]);
    // Auto-show the first file's PDF if no preview is open
    setPreviewFileId(prev => prev ?? (results[0]?.id ?? null));
    setProcessing(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    processFiles([...e.dataTransfer.files]);
  }, [processFiles]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles([...e.target.files]);
    e.target.value = "";
  }, [processFiles]);

  const removeFile = (id: string) => {
    const f = files.find(x => x.id === id);
    if (f?.fileUrl) URL.revokeObjectURL(f.fileUrl);
    setFiles(prev => prev.filter(f => f.id !== id));
    if (previewFileId === id) setPreviewFileId(null);
  };

  /* ── Transaction editing ─────────────────────────────────────────── */
  // Each row in the display carries _fileId and _txnIdx for mutation
  const allEditableRows = files.flatMap(f =>
    f.transactions.map((t, i) => ({ ...t, _fileId: f.id, _txnIdx: i }))
  );

  const updateTxn = (fileId: string, idx: number, patch: Partial<Transaction>) =>
    setFiles(prev => prev.map(f =>
      f.id !== fileId ? f : {
        ...f,
        transactions: f.transactions.map((t, i) => i !== idx ? t : { ...t, ...patch })
      }
    ));

  const deleteTxn = (fileId: string, idx: number) =>
    setFiles(prev => prev.map(f =>
      f.id !== fileId ? f : { ...f, transactions: f.transactions.filter((_, i) => i !== idx) }
    ));

  const addTxnToFile = (fileId: string) =>
    setFiles(prev => prev.map(f =>
      f.id !== fileId ? f : {
        ...f,
        transactions: [...f.transactions, { Date: "", Description: "", Debit: "", Credit: "" }]
      }
    ));

  // Add to last file by default (or first if only one)
  const addRow = () => {
    if (!files.length) return;
    addTxnToFile(files[files.length - 1].id);
  };

  /* ── CSV download ────────────────────────────────────────────────── */
  const handleDownloadAll = () => {
    const csv = txnsToCSV(allTxns);
    const name = files.length === 1
      ? files[0].name.replace(/\.pdf$/i, "") + ".csv"
      : "statements_combined.csv";
    downloadCSV(csv, name);
  };

  const handleDownloadOne = (f: ParsedFile) =>
    downloadCSV(txnsToCSV(f.transactions), f.name.replace(/\.pdf$/i, "") + ".csv");

  const METHOD_LABELS: Record<string, { label: string; color: string }> = {
    "citi-text":    { label: "Citi Parser",   color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
    "table":        { label: "Table",         color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    "generic-text": { label: "Generic Text",  color: "text-teal-400 bg-teal-500/10 border-teal-500/20" },
    "error":        { label: "Error",         color: "text-red-400 bg-red-500/10 border-red-500/20" },
  };

  const hasResults = allTxns.length > 0 || files.length > 0;

  return (
    <div className={cl("flex flex-col h-full overflow-hidden", bg)}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#070b12] via-blue-950/60 to-[#070b12] border-b border-white/8 px-6 py-4 flex items-center gap-4 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#7a8394] hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" />Back
        </button>
        <div className="h-5 w-px bg-white/10" />
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-blue-500/30">
            <Table2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">Bank Statement → CSV</h1>
            <p className="text-[#7a8394] text-xs">Upload PDF · Extract · Edit · Download CSV</p>
          </div>
        </div>
        {allTxns.length > 0 && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-[#7a8394]">{allTxns.length} transactions · {files.length} file{files.length !== 1 ? "s" : ""}</span>
            <button onClick={handleDownloadAll}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold hover:opacity-90 active:scale-[.98] transition-all shadow-lg shadow-blue-500/25">
              <Download className="w-4 h-4" />
              {files.length === 1 ? "Download CSV" : "Download All Combined"}
            </button>
          </div>
        )}
      </div>

      {/* ── Top section: stats + drop zone + file list ───────────────── */}
      <div className="shrink-0 overflow-y-auto px-6 py-4 space-y-4">

        {/* Stats */}
        {allTxns.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Transactions", val: allTxns.length.toString(), icon: <FileText className="w-4 h-4" />, grad: "from-blue-500/20 to-indigo-500/20", brd: "border-blue-500/20", ic: "bg-blue-500", sh: "shadow-blue-500/15" },
              { label: "Total Debits",  val: `$${totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: <BarChart3 className="w-4 h-4" />, grad: "from-red-500/20 to-orange-500/20", brd: "border-red-500/20", ic: "bg-red-500", sh: "shadow-red-500/15" },
              { label: "Total Credits", val: `$${Math.abs(totalCredit).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: <CheckCircle2 className="w-4 h-4" />, grad: "from-emerald-500/20 to-teal-500/20", brd: "border-emerald-500/20", ic: "bg-emerald-500", sh: "shadow-emerald-500/15" },
            ].map(s => (
              <div key={s.label} className={cl("rounded-xl border p-4 bg-gradient-to-br shadow-lg", s.grad, s.brd, s.sh)}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={cl("w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-md", s.ic)}>{s.icon}</div>
                  <span className={cl("text-xs font-medium", muted)}>{s.label}</span>
                </div>
                <p className={cl("text-2xl font-bold", text)}>{s.val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Drop zone */}
        <div
          className={cl(
            "rounded-2xl border-2 border-dashed transition-all cursor-pointer",
            dragging
              ? "border-blue-400 bg-blue-500/8 scale-[1.01]"
              : isLight ? "border-slate-300 hover:border-blue-400 bg-white" : "border-white/15 hover:border-blue-400/60 bg-white/2"
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="py-6 flex flex-col items-center gap-2.5">
            {processing ? (
              <>
                <Loader2 className="w-9 h-9 text-blue-400 animate-spin" />
                <p className="text-sm font-medium text-blue-400">Extracting transactions…</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-blue-400" />
                </div>
                <div className="text-center">
                  <p className={cl("text-sm font-semibold", text)}>{hasResults ? "Drop more PDFs to add" : "Drop PDF bank statements here"}</p>
                  <p className={cl("text-xs mt-0.5", muted)}>or click to browse · Multiple files OK · merged into one CSV</p>
                </div>
                <div className={cl("flex items-center gap-2 text-xs px-3 py-1 rounded-full border", isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-white/4 border-white/10 text-[#7a8394]")}>
                  Citi · Chase · BofA · Wells Fargo · Amex · Capital One · Discover
                </div>
              </>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".pdf" multiple className="hidden" onChange={onInputChange} />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className={cl("rounded-2xl border overflow-hidden", card, border)}>
            <div className={cl("px-5 py-3 border-b flex items-center justify-between", border)}>
              <h3 className={cl("text-sm font-semibold", text)}>Processed Files</h3>
              <button onClick={() => { files.forEach(f => f.fileUrl && URL.revokeObjectURL(f.fileUrl)); setFiles([]); setPreviewFileId(null); }}
                className={cl("text-xs flex items-center gap-1 hover:text-red-400 transition-colors", muted)}>
                <Trash2 className="w-3.5 h-3.5" /> Clear all
              </button>
            </div>
            <div className="divide-y divide-white/5">
              {files.map(f => {
                const ml = METHOD_LABELS[f.method] ?? METHOD_LABELS["generic-text"];
                const isPreviewing = previewFileId === f.id;
                return (
                  <div key={f.id} className={cl("px-5 py-3 flex items-center gap-4 transition-colors", rowHover)}>
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/15 to-indigo-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cl("text-sm font-medium truncate", text)}>{f.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={cl("text-xs", muted)}>{formatBytes(f.size)}</span>
                        <span className={cl("text-xs px-2 py-0.5 rounded-full border font-medium", ml.color)}>{ml.label}</span>
                        {f.error
                          ? <span className="text-xs text-red-400">⚠ {f.error}</span>
                          : <span className={cl("text-xs", muted)}>{f.transactions.length} transactions</span>
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Toggle PDF preview */}
                      <button
                        onClick={() => setPreviewFileId(isPreviewing ? null : f.id)}
                        title={isPreviewing ? "Hide PDF" : "Preview PDF"}
                        className={cl(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                          isPreviewing
                            ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                            : isLight ? "border-slate-200 text-slate-500 hover:bg-slate-100" : "border-white/10 text-[#7a8394] hover:bg-white/5"
                        )}
                      >
                        {isPreviewing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {isPreviewing ? "Hide" : "PDF"}
                      </button>
                      {f.transactions.length > 0 && (
                        <button onClick={() => handleDownloadOne(f)}
                          className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors">
                          <Download className="w-3.5 h-3.5" /> CSV
                        </button>
                      )}
                      <button onClick={() => removeFile(f.id)} className={cl("p-1.5 rounded-lg hover:text-red-400 transition-colors", muted)}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Side-by-side: PDF preview + Editable transaction table ──────── */}
      {allEditableRows.length > 0 && (
        <div className="flex-1 min-h-0 flex gap-4 px-6 pb-6 overflow-hidden">

          {/* Editable transaction table */}
          <div className={cl("flex-1 flex flex-col rounded-2xl border overflow-hidden", card, border)}>
            {/* Table header */}
            <div className={cl("flex items-center justify-between px-4 py-2.5 border-b shrink-0", border, isLight ? "bg-slate-50" : "bg-[#0a0e18]")}>
              <div className="flex items-center gap-3">
                <h3 className={cl("text-sm font-semibold", text)}>Transaction Preview</h3>
                <span className={cl("text-xs px-2 py-0.5 rounded-full border", isLight ? "bg-slate-100 border-slate-200 text-slate-500" : "bg-white/5 border-white/10 text-[#7a8394]")}>
                  {allEditableRows.length} rows · editable
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Show PDF button when no preview open */}
                {!previewFile && files.length > 0 && (
                  <button
                    onClick={() => setPreviewFileId(files[0].id)}
                    className={cl("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors", isLight ? "border-slate-200 text-slate-500 hover:bg-slate-100" : "border-white/10 text-[#7a8394] hover:bg-white/5")}
                  >
                    <PanelRightOpen className="w-3.5 h-3.5" /> Show PDF
                  </button>
                )}
                <button
                  onClick={addRow}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
                <button onClick={handleDownloadAll}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:opacity-90 transition-all shadow-md shadow-blue-500/25">
                  <Download className="w-3.5 h-3.5" />
                  {files.length === 1 ? "CSV" : "All CSV"}
                </button>
              </div>
            </div>

            {/* Table body — scrollable */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs border-separate border-spacing-0">
                <thead className="sticky top-0 z-10">
                  <tr className={cl(isLight ? "bg-slate-100 text-slate-500" : "bg-[#0a0e18] text-[#7a8394]")}>
                    {files.length > 1 && <th className="px-3 py-2 text-left font-medium border-b border-white/8 w-20">File</th>}
                    <th className="px-3 py-2 text-left font-medium border-b border-white/8 w-28">Date</th>
                    <th className="px-3 py-2 text-left font-medium border-b border-white/8">Description</th>
                    <th className="px-3 py-2 text-right font-medium border-b border-white/8 w-28">Debit</th>
                    <th className="px-3 py-2 text-right font-medium border-b border-white/8 w-28">Credit</th>
                    <th className="px-2 py-2 border-b border-white/8 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {allEditableRows.map((row, displayIdx) => {
                    const fileLabel = files.find(f => f.id === row._fileId)?.name.replace(/\.pdf$/i, "").slice(0, 12);
                    return (
                      <tr key={`${row._fileId}-${row._txnIdx}`}
                        className={cl("group border-b transition-colors", isLight ? "border-slate-100" : "border-white/4", rowHover)}>

                        {/* File badge (multi-file only) */}
                        {files.length > 1 && (
                          <td className="px-3 py-1.5">
                            <span className={cl("text-[10px] px-1.5 py-0.5 rounded font-mono truncate block max-w-[80px]", isLight ? "bg-blue-50 text-blue-600" : "bg-blue-500/10 text-blue-400")}>
                              {fileLabel}
                            </span>
                          </td>
                        )}

                        {/* Date */}
                        <td className="px-3 py-1.5">
                          <input
                            value={row.Date}
                            onChange={e => updateTxn(row._fileId, row._txnIdx, { Date: e.target.value })}
                            placeholder="MM/DD/YYYY"
                            className={cl(inputCls, "w-full tabular-nums")}
                          />
                        </td>

                        {/* Description */}
                        <td className="px-3 py-1.5">
                          <input
                            value={row.Description}
                            onChange={e => updateTxn(row._fileId, row._txnIdx, { Description: e.target.value })}
                            placeholder="Description"
                            className={cl(inputCls, "w-full")}
                          />
                        </td>

                        {/* Debit */}
                        <td className="px-3 py-1.5 text-right">
                          <input
                            value={row.Debit === "" ? "" : String(row.Debit)}
                            onChange={e => {
                              const v = e.target.value === "" ? "" : parseFloat(e.target.value);
                              updateTxn(row._fileId, row._txnIdx, { Debit: isNaN(v as number) ? "" : v });
                            }}
                            placeholder="0.00"
                            type="number"
                            step="0.01"
                            min="0"
                            className={cl(inputCls, "w-full text-right tabular-nums", row.Debit !== "" ? "text-red-400" : "")}
                          />
                        </td>

                        {/* Credit */}
                        <td className="px-3 py-1.5 text-right">
                          <input
                            value={row.Credit === "" ? "" : String(row.Credit)}
                            onChange={e => {
                              const v = e.target.value === "" ? "" : parseFloat(e.target.value);
                              updateTxn(row._fileId, row._txnIdx, { Credit: isNaN(v as number) ? "" : v });
                            }}
                            placeholder="0.00"
                            type="number"
                            step="0.01"
                            min="0"
                            className={cl(inputCls, "w-full text-right tabular-nums", row.Credit !== "" ? "text-emerald-400" : "")}
                          />
                        </td>

                        {/* Delete */}
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => deleteTxn(row._fileId, row._txnIdx)}
                            className={cl("p-1 rounded opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all", muted)}
                            title="Delete row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Add row footer */}
                  <tr>
                    <td colSpan={files.length > 1 ? 6 : 5} className="px-3 py-2">
                      <button
                        onClick={addRow}
                        className={cl(
                          "flex items-center gap-2 text-xs font-medium w-full py-1.5 rounded-lg border border-dashed transition-colors",
                          isLight ? "border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50"
                                  : "border-white/10 text-[#7a8394] hover:border-blue-500/40 hover:text-blue-400 hover:bg-blue-500/5"
                        )}
                      >
                        <Plus className="w-3.5 h-3.5 ml-2" /> Add row
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Table footer — totals */}
            <div className={cl("shrink-0 border-t px-4 py-2 flex items-center gap-6 text-xs", border, isLight ? "bg-slate-50" : "bg-[#0a0e18]")}>
              <span className={muted}>Totals:</span>
              <span className="text-red-400 font-semibold tabular-nums">
                Debit: ${totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-emerald-400 font-semibold tabular-nums">
                Credit: ${Math.abs(totalCredit).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className={cl("ml-auto", muted)}>{allEditableRows.length} rows</span>
            </div>
          </div>

          {/* PDF preview panel — right side */}
          {previewFile && previewFile.fileUrl && (
            <div className={cl("w-[42%] flex flex-col rounded-2xl border overflow-hidden shrink-0", card, border)}>
              <div className={cl("flex items-center justify-between px-4 py-2.5 border-b shrink-0", border, isLight ? "bg-slate-50" : "bg-[#0a0e18]")}>
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className={cl("text-xs font-semibold truncate", text)}>{previewFile.name}</span>
                </div>
                <button
                  onClick={() => setPreviewFileId(null)}
                  className={cl("p-1 rounded-md hover:text-red-400 transition-colors shrink-0 ml-2", muted)}
                  title="Hide PDF"
                >
                  <PanelRightClose className="w-4 h-4" />
                </button>
              </div>
              <iframe
                src={previewFile.fileUrl}
                title={previewFile.name}
                className="flex-1 border-0 w-full"
                style={{ background: "#fff" }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────── */}
      {files.length === 0 && !processing && (
        <div className="flex-1 px-6 pb-6 flex items-center justify-center">
          <div className={cl("rounded-2xl border p-8 text-center w-full max-w-lg", card, border)}>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/15 to-indigo-500/15 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <Table2 className="w-8 h-8 text-blue-400" />
            </div>
            <p className={cl("text-sm font-semibold mb-1", text)}>No statements uploaded yet</p>
            <p className={cl("text-xs mb-4", muted)}>Upload PDF bank statements to extract editable transactions and export as CSV</p>
            <div className="flex flex-wrap justify-center gap-2">
              {["Citi","Chase","Bank of America","Wells Fargo","Amex","Capital One","Discover"].map(b => (
                <span key={b} className={cl("text-xs px-3 py-1 rounded-full border", isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-white/4 border-white/10 text-[#7a8394]")}>{b}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
