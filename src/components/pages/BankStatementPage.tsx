import React, { useState, useCallback, useRef } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  ChevronLeft, Upload, FileText, Download, CheckCircle2,
  AlertTriangle, Loader2, Trash2, Table2, BarChart3, X, ArrowRight
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
}

/* ── Date helpers ────────────────────────────────────────────────────── */
function normalizeDate(raw: string): string {
  raw = raw.trim().replace(/,$/, "");
  // MM/DD/YY or MM/DD/YYYY
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, mo, d, y] = m;
    const yr = y.length === 2 ? "20" + y : y;
    return `${parseInt(mo)}/${parseInt(d)}/${yr}`;
  }
  // MM/DD (no year — assume current year)
  m = raw.match(/^(\d{2})\/(\d{2})$/);
  if (m) return `${parseInt(m[1])}/${parseInt(m[2])}/2025`;
  // YYYY-MM-DD
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${parseInt(m[2])}/${parseInt(m[3])}/${m[1]}`;
  // DD-MM-YYYY
  m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${parseInt(m[2])}/${parseInt(m[1])}/${m[3]}`;
  // Jan 5, 2025 / Jan 5 2025 / Jan 5
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
  if (s.endsWith("-")) s = "-" + s.slice(0, -1); // trailing minus (some bank formats)
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

/* ── PDF text extraction — groups items into visual lines ─────────── */
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

    // Group text items into lines using 4-pt Y buckets.
    // PDF items within ±4pt of each other are on the same visual line.
    // Items within a line are sorted left-to-right by X.
    const lineMap = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of content.items as any[]) {
      if (!item.str) continue;
      const bucket = Math.round(item.transform[5] / 4) * 4;
      if (!lineMap.has(bucket)) lineMap.set(bucket, []);
      lineMap.get(bucket)!.push({ x: item.transform[4], str: item.str });
    }

    const sortedBuckets = [...lineMap.keys()].sort((a, b) => b - a); // top→bottom
    const lines = sortedBuckets.map(y => {
      const sorted = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      // Concatenate without separator first (items already carry spacing),
      // then collapse any run of whitespace to a single space.
      return sorted.map(it => it.str).join("").replace(/\s+/g, " ").trim();
    }).filter(Boolean);

    pages.push(lines);
  }
  return pages;
}

/* ── Strategy 1: Generic table detection from text lines ──────────── */
const DATE_PATS = [
  /^(\d{1,2}\/\d{1,2}\/\d{2,4})/,
  /^(\d{2}\/\d{2})\s/,
  /^(\d{4}-\d{2}-\d{2})/,
  /^(\d{2}-\d{2}-\d{4})/,
  /^([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/,
  /^([A-Z][a-z]{2}\s+\d{1,2})\s/,
];
// Match amounts including trailing-minus format (e.g. "1,288.70-")
const AMT_RE = /-?\$?[\d,]+\.\d{2}-?/g;

function extractViaGenericText(allLines: string[]): Transaction[] {
  const txns: Transaction[] = [];
  for (const line of allLines) {
    let dateStr: string | null = null;
    let rest = line;
    for (const pat of DATE_PATS) {
      const m = line.match(pat);
      if (m) {
        dateStr = normalizeDate(m[1]);
        rest = line.slice(m[0].length).trim();
        break;
      }
    }
    if (!dateStr) continue;
    const amounts = [...rest.matchAll(AMT_RE)].map(m => m[0]);
    if (!amounts.length) continue;
    const rawAmt = amounts[amounts.length - 1];
    const amt = parseAmount(rawAmt);
    if (amt === null) continue;
    const desc = rest.slice(0, rest.lastIndexOf(rawAmt)).trim().replace(/[,\s]+$/, "");
    if (!desc) continue;
    txns.push({
      Date: dateStr,
      Description: desc,
      Debit: amt >= 0 ? amt : "",
      Credit: amt < 0 ? amt : "",
    });
  }
  return txns;
}

/* ── Strategy 2: Citi-specific parser ─────────────────────────────── */
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
  const joined = allLines.slice(0, 50).join(" ");
  let m = joined.match(/Billing Period[:\s]+(\d{2})\/(\d{2})\/(\d{2,4})[–\-](\d{2})\/(\d{2})\/(\d{2,4})/);
  if (m) {
    const sy = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    const ey = m[6].length === 2 ? 2000 + parseInt(m[6]) : parseInt(m[6]);
    return { sm: parseInt(m[1]), sy, em: parseInt(m[4]), ey };
  }
  m = joined.match(/[Nn]ew balance as of\s+(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (m) {
    const ey = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    const em = parseInt(m[1]);
    const sm = em > 1 ? em - 1 : 12;
    const sy = em > 1 ? ey : ey - 1;
    return { sm, sy, em, ey };
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
  const txns: Transaction[] = [];
  let category: "Purchase" | "Payment/Credit" | "Fee" | "Interest" = "Purchase";

  function fmtDate(mmdd: string): string {
    const mo = parseInt(mmdd.slice(0, 2));
    const d = parseInt(mmdd.slice(3, 5));
    const yr = dates ? citiYearForMonth(mo, dates) : 2025;
    return `${mo}/${d}/${yr}`;
  }

  function addTxn(transDate: string, desc: string, amountStr: string) {
    const amt = parseFloat(amountStr.replace(/\$/g, "").replace(/,/g, ""));
    if (category === "Payment/Credit") {
      txns.push({ Date: fmtDate(transDate), Description: desc, Debit: "", Credit: amt });
    } else {
      txns.push({ Date: fmtDate(transDate), Description: desc, Debit: amt, Credit: "" });
    }
  }

  let i = 0;
  while (i < allLines.length) {
    const line = allLines[i];
    if (line.includes("Payments, Credits and Adjustments")) { category = "Payment/Credit"; i++; continue; }
    if (line.includes("Standard Purchases") && !line.includes("cont'd")) { category = "Purchase"; i++; continue; }
    if (line.trim() === "Fees charged") { category = "Fee"; i++; continue; }
    if (line.trim() === "Interest charged") { category = "Interest"; i++; continue; }

    // Two-date transaction
    if (/^\d{2}\/\d{2}\s+\d{2}\/\d{2}\s+/.test(line)) {
      const m = line.match(amtRe);
      if (m) {
        const desc = line.slice(12, line.indexOf(m[1])).trim();
        addTxn(line.slice(0, 5), desc, m[1]);
        i++; continue;
      }
    }

    // Single-date transaction
    if (/^\d{2}\/\d{2}\s+/.test(line)) {
      const m = line.match(amtRe);
      if (m) {
        const desc = line.slice(6, line.indexOf(m[1])).trim();
        if (desc && !citiShouldSkip(desc)) {
          addTxn(line.slice(0, 5), desc, m[1]);
          i++; continue;
        }
      }
    }

    if (citiShouldSkip(line)) { i++; continue; }
    i++;
  }
  return txns;
}

/* ── Is Citi? ────────────────────────────────────────────────────────── */
function isCiti(lines: string[]): boolean {
  const top = lines.slice(0, 20).join(" ").toLowerCase();
  return top.includes("citicards") || top.includes("aadvantage");
}

/* ── Main extract ─────────────────────────────────────────────────── */
async function extractFromFile(file: File): Promise<{ txns: Transaction[]; method: ParsedFile["method"] }> {
  try {
    const pages = await extractPdfText(file);
    const allLines = pages.flat();

    // 1. Citi-specific
    if (isCiti(allLines)) {
      const txns = extractViaCitiText(allLines);
      if (txns.length >= 2) return { txns, method: "citi-text" };
    }

    // 2. Generic text parser (date + amount on same line)
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
  a.href = url;
  a.download = filename;
  a.click();
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

  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<"upload" | "results">("upload");
  const inputRef = useRef<HTMLInputElement>(null);

  const cl = (...cs: (string | false | undefined)[]) => cs.filter(Boolean).join(" ");

  /* ── Colour tokens ─────────────────────────────────────────── */
  const bg        = isLight ? "bg-slate-100"      : "bg-[#070b12]";
  const card      = isLight ? "bg-white"          : "bg-[#0d111a]";
  const border    = isLight ? "border-slate-200"  : "border-white/8";
  const text      = isLight ? "text-slate-800"    : "text-[#e8edf5]";
  const muted     = isLight ? "text-slate-500"    : "text-[#7a8394]";
  const rowBg     = isLight ? "bg-slate-50 hover:bg-slate-100" : "bg-white/2 hover:bg-white/4";

  /* ── File processing ─────────────────────────────────────────── */
  const processFiles = useCallback(async (rawFiles: File[]) => {
    const pdfs = rawFiles.filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return;
    setProcessing(true);
    setStage("upload");

    const results: ParsedFile[] = [];
    for (const pdf of pdfs) {
      try {
        const { txns, method } = await extractFromFile(pdf);
        results.push({ id: crypto.randomUUID(), name: pdf.name, size: pdf.size, transactions: txns, method });
      } catch (e: any) {
        results.push({ id: crypto.randomUUID(), name: pdf.name, size: pdf.size, transactions: [], method: "error", error: e.message });
      }
    }

    setFiles(prev => [...prev, ...results]);
    setProcessing(false);
    setStage("results");
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    processFiles([...e.dataTransfer.files]);
  }, [processFiles]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles([...e.target.files]);
    e.target.value = "";
  }, [processFiles]);

  const removeFile = (id: string) => setFiles(prev => prev.filter(f => f.id !== id));

  const allTxns = files.flatMap(f => f.transactions);
  const totalDebit = allTxns.reduce((s, t) => s + (typeof t.Debit === "number" ? t.Debit : 0), 0);
  const totalCredit = allTxns.reduce((s, t) => s + (typeof t.Credit === "number" ? t.Credit : 0), 0);

  const handleDownloadAll = () => {
    const csv = txnsToCSV(allTxns);
    const name = files.length === 1
      ? files[0].name.replace(/\.pdf$/i, "") + ".csv"
      : "statements_combined.csv";
    downloadCSV(csv, name);
  };

  const handleDownloadOne = (f: ParsedFile) => {
    const csv = txnsToCSV(f.transactions);
    downloadCSV(csv, f.name.replace(/\.pdf$/i, "") + ".csv");
  };

  const METHOD_LABELS: Record<string, { label: string; color: string }> = {
    "citi-text":    { label: "Citi Parser", color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
    "table":        { label: "Table", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    "generic-text": { label: "Generic Text", color: "text-teal-400 bg-teal-500/10 border-teal-500/20" },
    "error":        { label: "Error", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  };

  return (
    <div className={cl("min-h-screen flex flex-col", bg)}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#070b12] via-blue-950/60 to-[#070b12] border-b border-white/8 px-6 py-4 flex items-center gap-4 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[#7a8394] hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="h-5 w-px bg-white/10" />
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-blue-500/30">
            <Table2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">Bank Statement → CSV</h1>
            <p className="text-[#7a8394] text-xs">Upload PDF statements · Extract transactions · Download CSV</p>
          </div>
        </div>

        {allTxns.length > 0 && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-[#7a8394]">{allTxns.length} transactions · {files.length} file{files.length !== 1 ? "s" : ""}</span>
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold hover:opacity-90 active:scale-[.98] transition-all shadow-lg shadow-blue-500/25"
            >
              <Download className="w-4 h-4" />
              {files.length === 1 ? "Download CSV" : "Download All Combined"}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">

        {/* ── Stats row ─────────────────────────────────────────────── */}
        {allTxns.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Total Transactions", val: allTxns.length.toString(), icon: <FileText className="w-4 h-4" />, grad: "from-blue-500/20 to-indigo-500/20", border: "border-blue-500/20", icon_bg: "bg-blue-500", shadow: "shadow-blue-500/15" },
              { label: "Total Debits",       val: `$${totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: <BarChart3 className="w-4 h-4" />, grad: "from-red-500/20 to-orange-500/20", border: "border-red-500/20", icon_bg: "bg-red-500", shadow: "shadow-red-500/15" },
              { label: "Total Credits",      val: `$${Math.abs(totalCredit).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: <CheckCircle2 className="w-4 h-4" />, grad: "from-emerald-500/20 to-teal-500/20", border: "border-emerald-500/20", icon_bg: "bg-emerald-500", shadow: "shadow-emerald-500/15" },
            ].map(s => (
              <div key={s.label} className={cl("rounded-xl border p-4 bg-gradient-to-br", s.grad, s.border, "shadow-lg", s.shadow)}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={cl("w-7 h-7 rounded-lg flex items-center justify-center text-white", s.icon_bg, "shadow-md")}>{s.icon}</div>
                  <span className={cl("text-xs font-medium", muted)}>{s.label}</span>
                </div>
                <p className={cl("text-2xl font-bold", text)}>{s.val}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Drop zone ─────────────────────────────────────────────── */}
        <div
          className={cl(
            "rounded-2xl border-2 border-dashed transition-all cursor-pointer mb-6",
            dragging
              ? "border-blue-400 bg-blue-500/8 scale-[1.01]"
              : isLight ? "border-slate-300 hover:border-blue-400 bg-white" : "border-white/15 hover:border-blue-400/60 bg-white/2"
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="py-10 flex flex-col items-center gap-3">
            {processing ? (
              <>
                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                <p className="text-sm font-medium text-blue-400">Extracting transactions…</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-blue-400" />
                </div>
                <div className="text-center">
                  <p className={cl("text-sm font-semibold", text)}>
                    {allTxns.length > 0 ? "Drop more PDFs to add" : "Drop PDF bank statements here"}
                  </p>
                  <p className={cl("text-xs mt-1", muted)}>or click to browse · Multiple files OK · merged into one CSV</p>
                </div>
                <div className={cl("flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border", isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-white/4 border-white/10 text-[#7a8394]")}>
                  Works with: Citi · Chase · Bank of America · Wells Fargo · Amex · Capital One · Discover · and more
                </div>
              </>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".pdf" multiple className="hidden" onChange={onInputChange} />
        </div>

        {/* ── File list ─────────────────────────────────────────────── */}
        {files.length > 0 && (
          <div className={cl("rounded-2xl border overflow-hidden mb-6", card, border)}>
            <div className={cl("px-5 py-3 border-b flex items-center justify-between", border)}>
              <h3 className={cl("text-sm font-semibold", text)}>Processed Files</h3>
              <button
                onClick={() => { setFiles([]); setStage("upload"); }}
                className={cl("text-xs flex items-center gap-1 hover:text-red-400 transition-colors", muted)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear all
              </button>
            </div>
            <div className="divide-y divide-white/5">
              {files.map(f => {
                const ml = METHOD_LABELS[f.method] ?? METHOD_LABELS["generic-text"];
                return (
                  <div key={f.id} className={cl("px-5 py-3.5 flex items-center gap-4", rowBg)}>
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/15 to-indigo-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                      <FileText className="w-4.5 h-4.5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cl("text-sm font-medium truncate", text)}>{f.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={cl("text-xs", muted)}>{formatBytes(f.size)}</span>
                        <span className={cl("text-xs px-2 py-0.5 rounded-full border font-medium", ml.color)}>{ml.label}</span>
                        {f.error ? (
                          <span className="text-xs text-red-400">⚠ {f.error}</span>
                        ) : (
                          <span className={cl("text-xs", muted)}>{f.transactions.length} transactions</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {f.transactions.length > 0 && (
                        <button
                          onClick={() => handleDownloadOne(f)}
                          className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
                        >
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

        {/* ── Transaction preview table ─────────────────────────────── */}
        {allTxns.length > 0 && (
          <div className={cl("rounded-2xl border overflow-hidden", card, border)}>
            <div className={cl("px-5 py-3 border-b flex items-center justify-between", border)}>
              <h3 className={cl("text-sm font-semibold", text)}>Transaction Preview</h3>
              <span className={cl("text-xs", muted)}>Showing {Math.min(allTxns.length, 100)} of {allTxns.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={cl("border-b", border, isLight ? "bg-slate-50 text-slate-500" : "bg-white/3 text-[#7a8394]")}>
                    <th className="px-4 py-2.5 text-left font-medium w-28">Date</th>
                    <th className="px-4 py-2.5 text-left font-medium">Description</th>
                    <th className="px-4 py-2.5 text-right font-medium w-28">Debit</th>
                    <th className="px-4 py-2.5 text-right font-medium w-28">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/4">
                  {allTxns.slice(0, 100).map((t, i) => (
                    <tr key={i} className={rowBg}>
                      <td className={cl("px-4 py-2 whitespace-nowrap tabular-nums", muted)}>{t.Date}</td>
                      <td className={cl("px-4 py-2 max-w-xs truncate", text)}>{t.Description}</td>
                      <td className={cl("px-4 py-2 text-right tabular-nums", t.Debit !== "" ? "text-red-400" : muted)}>
                        {t.Debit !== "" ? `$${(t.Debit as number).toFixed(2)}` : ""}
                      </td>
                      <td className={cl("px-4 py-2 text-right tabular-nums", t.Credit !== "" ? "text-emerald-400" : muted)}>
                        {t.Credit !== "" ? `$${Math.abs(t.Credit as number).toFixed(2)}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allTxns.length > 100 && (
                <div className={cl("px-4 py-3 text-center text-xs border-t", border, muted)}>
                  + {allTxns.length - 100} more rows — download CSV for full list
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────── */}
        {files.length === 0 && !processing && (
          <div className={cl("rounded-2xl border p-8 text-center", card, border)}>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/15 to-indigo-500/15 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <Table2 className="w-8 h-8 text-blue-400" />
            </div>
            <p className={cl("text-sm font-semibold mb-1", text)}>No statements uploaded yet</p>
            <p className={cl("text-xs", muted)}>Upload one or more PDF bank statements to extract transactions into a CSV</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {["Citi","Chase","Bank of America","Wells Fargo","Amex","Capital One","Discover"].map(b => (
                <span key={b} className={cl("text-xs px-3 py-1 rounded-full border", isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-white/4 border-white/10 text-[#7a8394]")}>{b}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
