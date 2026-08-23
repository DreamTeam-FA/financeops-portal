import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  FolderOpen, FileText, CheckCircle2, AlertTriangle,
  ChevronLeft, RotateCcw, Sparkles, ScanLine, FileCheck,
  Loader2, ArrowRight, X, Trash2, Shield
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import {
  findVendor, findDate, findTotal, detectDocType,
  buildFilename, sanitizeFilename, SUPPORTED_EXTS,
  loadCustomVendors, saveCustomVendor, deleteCustomVendor,
  type CustomVendorEntry,
} from "../../utils/receiptParser";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

/* ── Types ──────────────────────────────────────────────────────────── */
type ScanMethod = "gemini" | "pdftext" | "ocr" | "failed";

interface FileRow {
  id: string;
  fileObj: File;
  handle: FileSystemFileHandle;
  original: string;
  ext: string;
  newName: string;
  vendor: string;
  date: string;
  total: string;
  docType: string;
  complete: boolean;
  rawText: string;
  selected: boolean;
  scanMethod: ScanMethod;
  status: "idle" | "processing" | "done" | "error";
  renamed?: boolean;
  renameError?: string;
}

type Stage = "pick" | "scanning" | "preview" | "applying" | "results";

/* ── Helpers ─────────────────────────────────────────────────────────── */
async function extractPdfText(file: File): Promise<string> {
  try {
    const ab = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it: any) => it.str).join(" ") + "\n";
    }
    return text;
  } catch { return ""; }
}

async function extractImageText(file: File): Promise<string> {
  try {
    const Tesseract = (await import("tesseract.js")).default;
    const { data } = await Tesseract.recognize(file, "eng", { logger: () => {} });
    return data.text || "";
  } catch { return ""; }
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── File → base64 via FileReader (safe for large files) ─────────── */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── Gemini Vision scan (primary AI path) ────────────────────────── */
interface GeminiResult {
  vendor: string | null;
  date: Date | null;
  total: number | null;
  docType: "invoice" | "receipt" | "other";
}

async function tryGeminiScan(file: File): Promise<GeminiResult | null> {
  try {
    const base64   = await fileToBase64(file);
    const mimeType = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");

    const resp = await fetch("/api/invoice/scan", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ imageBase64: base64, mimeType }),
    });

    if (!resp.ok) return null;
    const json = await resp.json();
    if (!json.ok || !json.invoice) return null;

    const inv    = json.invoice as Record<string, any>;
    const vendor = (typeof inv.vendor === "string" && inv.vendor.trim()) ? inv.vendor.trim() : null;

    // Parse date from issueDate or dueDate
    let date: Date | null = null;
    const rawDate = inv.issueDate || inv.dueDate;
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) date = d;
    }

    // Parse amount
    let total: number | null = null;
    if (typeof inv.amount === "number" && !isNaN(inv.amount)) {
      total = inv.amount;
    } else if (typeof inv.amount === "string") {
      const n = parseFloat(inv.amount.replace(/[^0-9.]/g, ""));
      if (!isNaN(n) && n > 0) total = n;
    }

    const docType: "invoice" | "receipt" | "other" = inv.invoiceNo ? "invoice" : (total !== null ? "receipt" : "other");

    // Only trust the result if Gemini returned at least a vendor or a date
    if (!vendor && !date) return null;

    return { vendor, date, total, docType };
  } catch {
    return null;
  }
}

/* ── Component ───────────────────────────────────────────────────────── */
export const ReceiptRenamerPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { theme } = useFinance();
  const isLight = theme === "light";

  const [stage, setStage]     = useState<Stage>("pick");
  const [dirName, setDirName] = useState("");
  const [rows, setRows]       = useState<FileRow[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, file: "", substage: "" });
  const [searchQ, setSearchQ] = useState("");
  const [filter, setFilter]   = useState<"all" | "auto" | "review">("all");
  const [docPreview, setDocPreview] = useState<{ name: string; url: string; isImage: boolean } | null>(null);
  const [showVendorMgr, setShowVendorMgr] = useState(false);
  const [customVendors, setCustomVendors] = useState<CustomVendorEntry[]>([]);
  const [learnPattern, setLearnPattern]   = useState("");
  const [learnName, setLearnName]         = useState("");
  const [pickError, setPickError]         = useState<"blocked" | "unsupported" | null>(null);
  const [resultSummary, setResultSummary] = useState<{ ok: number; errors: FileRow[] }>({ ok: 0, errors: [] });

  /* ── Theme ─────────────────────────────────────────────────────────── */
  const bg    = isLight ? "bg-slate-100"             : "bg-[#070b12]";
  const card  = isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]";
  const text  = isLight ? "text-slate-900"            : "text-white";
  const muted = isLight ? "text-slate-500"            : "text-[#888]";
  const border = isLight ? "border-slate-200"         : "border-[#1a2235]";
  const inputCls = `w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${
    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#111] border-[#333] text-white"
  }`;
  const cl = (...cs: (string | false | undefined)[]) => cs.filter(Boolean).join(" ");

  /* ── Folder picker ──────────────────────────────────────────────────── */
  const pickFolder = async () => {
    if (!("showDirectoryPicker" in window)) {
      setPickError("unsupported");
      return;
    }
    setPickError(null);
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      const entries: { file: File; handle: FileSystemFileHandle }[] = [];

      async function walk(dh: any) {
        for await (const [, entry] of dh.entries()) {
          if (entry.kind === "file") {
            const ext = "." + (entry.name as string).split(".").pop()!.toLowerCase();
            if (SUPPORTED_EXTS.has(ext)) {
              const file = await entry.getFile();
              entries.push({ file, handle: entry as FileSystemFileHandle });
            }
          } else if (entry.kind === "directory") {
            await walk(entry);
          }
        }
      }
      await walk(dirHandle);

      if (!entries.length) {
        alert("No PDF or image files found in that folder.");
        return;
      }

      setDirName(dirHandle.name);
      setStage("scanning");
      setProgress({ current: 0, total: entries.length, file: "", substage: "Starting…" });

      const newRows: FileRow[] = [];
      for (let i = 0; i < entries.length; i++) {
        const { file, handle } = entries[i];
        const name   = file.name;
        const dotIdx = name.lastIndexOf(".");
        const ext    = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : "";
        const isPdf  = ext === ".pdf";

        // ── Strategy ──────────────────────────────────────────────────
        // PDFs: pdfjs text first (fast, free). If text is rich → regex parser.
        //       If sparse (scanned PDF) → try Gemini → fallback Tesseract.
        // Images: try Gemini Vision first (most accurate) → fallback Tesseract.
        // ──────────────────────────────────────────────────────────────

        let vendor:   string | null = null;
        let dateObj:  Date   | null = null;
        let total:    number | null = null;
        let docType   = "other";
        let rawText   = "";
        let scanMethod: ScanMethod = "failed";

        if (isPdf) {
          setProgress(p => ({ ...p, current: i + 1, file: name, substage: "Reading PDF…" }));
          try { rawText = await extractPdfText(file); } catch {}

          const richText = rawText.replace(/\s+/g, " ").trim().length > 150;
          if (richText) {
            // Good text layer — use regex parser
            docType  = detectDocType(rawText);
            vendor   = findVendor(rawText);
            dateObj  = findDate(rawText, docType);
            total    = findTotal(rawText, docType);
            scanMethod = "pdftext";
          } else {
            // Scanned PDF — try Gemini
            setProgress(p => ({ ...p, substage: "AI scanning (scanned PDF)…" }));
            const g = await tryGeminiScan(file);
            if (g) {
              vendor = g.vendor; dateObj = g.date; total = g.total; docType = g.docType;
              scanMethod = "gemini";
            } else {
              // Last resort: Tesseract on PDF
              setProgress(p => ({ ...p, substage: "OCR fallback…" }));
              try { rawText = await extractImageText(file); } catch {}
              docType = detectDocType(rawText);
              vendor  = findVendor(rawText);
              dateObj = findDate(rawText, docType);
              total   = findTotal(rawText, docType);
              scanMethod = rawText.trim().length > 20 ? "ocr" : "failed";
            }
          }
        } else {
          // Image — Gemini first
          setProgress(p => ({ ...p, current: i + 1, file: name, substage: "AI scanning…" }));
          const g = await tryGeminiScan(file);
          if (g) {
            vendor = g.vendor; dateObj = g.date; total = g.total; docType = g.docType;
            scanMethod = "gemini";
          } else {
            // Fallback: Tesseract OCR
            setProgress(p => ({ ...p, substage: "OCR fallback…" }));
            try { rawText = await extractImageText(file); } catch {}
            docType = detectDocType(rawText);
            vendor  = findVendor(rawText);
            dateObj = findDate(rawText, docType);
            total   = findTotal(rawText, docType);
            scanMethod = rawText.trim().length > 20 ? "ocr" : "failed";
          }
        }

        const newName  = sanitizeFilename(buildFilename(vendor, dateObj, total, ext, docType, rawText));
        const complete = vendor !== null && dateObj !== null && (docType === "other" || total !== null);

        newRows.push({
          id: `${i}-${name}`,
          fileObj: file, handle,
          original: name, ext, newName,
          vendor: vendor || "",
          date: dateObj ? formatDate(dateObj) : "",
          total: total != null ? `$${total.toFixed(2)}` : "",
          docType, complete, rawText, scanMethod,
          selected: complete,
          status: "idle",
        });
      }

      setRows(newRows);
      setStage("preview");

    } catch (e: any) {
      if (e?.name === "AbortError") return;
      // SecurityError or NotAllowedError = Shields / permissions blocked
      setPickError("blocked");
    }
  };

  /* ── Apply renames in-place ─────────────────────────────────────────── */
  const applyRenames = async () => {
    const toRename = rows.filter(r => r.selected && r.newName && r.newName !== r.original);
    if (!toRename.length) return;
    setStage("applying");

    // Learn any manual vendor corrections
    for (const row of toRename) {
      const autoVendor = findVendor(row.rawText);
      const userVendor = row.newName.split("_")[0];
      if (userVendor && userVendor !== "?" && userVendor !== autoVendor && row.rawText) {
        const firstLine = row.rawText.split("\n").map(l => l.trim()).filter(l => l.length > 3)[0];
        if (firstLine) saveCustomVendor(firstLine.slice(0, 60), userVendor);
      }
    }

    const updated = [...rows];
    let ok = 0;
    const errors: FileRow[] = [];

    for (const row of toRename) {
      const idx = updated.findIndex(r => r.id === row.id);
      updated[idx] = { ...updated[idx], status: "processing" };
      setRows([...updated]);

      try {
        await (row.handle as any).move(sanitizeFilename(row.newName));
        updated[idx] = { ...updated[idx], status: "done", renamed: true };
        ok++;
      } catch (err: any) {
        updated[idx] = { ...updated[idx], status: "error", renameError: err?.message || "Rename failed" };
        errors.push(updated[idx]);
      }
      setRows([...updated]);
    }

    setResultSummary({ ok, errors });
    setStage("results");
  };

  /* ── Row editing ─────────────────────────────────────────────────────── */
  const updateRow = (id: string, patch: Partial<FileRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const rebuildName = (row: FileRow, patch: Partial<FileRow>) => {
    const merged = { ...row, ...patch };
    const vendor   = merged.vendor || null;
    const dateObj  = merged.date ? new Date(merged.date + "T00:00:00") : null;
    const totalNum = merged.total ? parseFloat(merged.total.replace(/[^0-9.]/g, "")) || null : null;
    const newName  = sanitizeFilename(buildFilename(vendor, dateObj, totalNum, merged.ext, merged.docType as any, merged.rawText));
    return { ...patch, newName };
  };

  /* ── Filtered rows ───────────────────────────────────────────────────── */
  const filteredRows = rows.filter(r => {
    if (filter === "auto"   && !r.complete) return false;
    if (filter === "review" &&  r.complete) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      return r.original.toLowerCase().includes(q) || r.newName.toLowerCase().includes(q) || r.vendor.toLowerCase().includes(q);
    }
    return true;
  });

  const selectedCount = rows.filter(r => r.selected && r.newName !== r.original).length;
  const autoCount     = rows.filter(r => r.complete).length;
  const reviewCount   = rows.length - autoCount;

  /* ── Doc preview ─────────────────────────────────────────────────────── */
  const openDocPreview = (row: FileRow) => {
    const url = URL.createObjectURL(row.fileObj);
    const isImage = [".png",".jpg",".jpeg",".gif",".webp",".bmp",".tiff",".tif"].includes(row.ext);
    setDocPreview({ name: row.original, url, isImage });
  };
  const closeDocPreview = () => {
    if (docPreview) URL.revokeObjectURL(docPreview.url);
    setDocPreview(null);
  };

  /* ── Vendor manager ──────────────────────────────────────────────────── */
  const openVendorMgr = () => { setCustomVendors(loadCustomVendors()); setShowVendorMgr(true); };

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className={cl("flex-1 flex flex-col h-full overflow-hidden", bg, text)}>

      {/* ── Header ── gradient matches portal style ───────────────── */}
      <div className={cl(
        "flex items-center gap-3 px-4 sm:px-6 py-3 border-b shrink-0",
        isLight
          ? "bg-gradient-to-r from-slate-800 via-emerald-950 to-slate-900 border-white/10"
          : "bg-gradient-to-r from-[#070b12] via-emerald-950/60 to-[#070b12] border-white/8"
      )}>
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <ScanLine className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">Receipt Renamer</h1>
            <p className="text-[10px] text-white/50">Renames files directly in your folder · no uploads</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {stage === "preview" && (
            <>
              <span className="text-[11px] text-white/50">{rows.length} files · {dirName}</span>
              <button onClick={openVendorMgr} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-white/15 hover:bg-white/10 text-white/70 hover:text-white transition-colors">
                Vendor Library
              </button>
              <button onClick={() => { setStage("pick"); setRows([]); setDirName(""); }} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors" title="Start over">
                <RotateCcw className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ════ PICK ══════════════════════════════════════════════════════ */}
        {stage === "pick" && (
          <div className="flex flex-col items-center justify-center min-h-full p-6 gap-5">

            {/* Brave Shields error */}
            {pickError === "blocked" && (
              <div className={cl("w-full max-w-lg rounded-xl border p-4", isLight ? "bg-amber-50 border-amber-200" : "bg-amber-950/20 border-amber-700/40")}>
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mb-1">Folder access blocked</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300/80 leading-relaxed">
                      Your browser blocked folder access. To fix this in <strong>Brave</strong>:
                    </p>
                    <ol className="text-xs text-amber-700 dark:text-amber-300/80 mt-1.5 space-y-0.5 list-decimal list-inside leading-relaxed">
                      <li>Click the <strong>Brave lion icon</strong> in the address bar</li>
                      <li>Toggle <strong>Shields</strong> to Off (or set to "Standard" if on Aggressive)</li>
                      <li>Click <strong>Select folder</strong> again</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}

            {/* Unsupported browser */}
            {pickError === "unsupported" && (
              <div className={cl("w-full max-w-lg rounded-xl border p-4 flex items-start gap-3", isLight ? "bg-red-50 border-red-200" : "bg-red-950/20 border-red-700/40")}>
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-500 mb-1">Browser not supported</p>
                  <p className="text-xs text-red-600 dark:text-red-300/80">
                    Direct file rename requires <strong>Chrome, Brave, or Edge</strong>. Firefox and Safari don't support the File System Access API yet.
                  </p>
                </div>
              </div>
            )}

            {/* Hero card */}
            <div className={cl(
              "w-full max-w-lg rounded-2xl border p-8 text-center relative overflow-hidden",
              isLight ? "bg-white border-slate-200 shadow-lg" : "bg-[#0d111a] border-[#1a2235]"
            )}>
              {/* subtle bg glow */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-emerald-500/5 rounded-full blur-3xl" />
              </div>

              <div className="relative">
                <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-emerald-500/30" style={{ width: 72, height: 72 }}>
                  <ScanLine className="w-9 h-9 text-white" />
                </div>
                <h2 className={cl("text-2xl font-extrabold mb-2", text)}>Receipt Renamer</h2>
                <p className={cl("text-sm mb-6 leading-relaxed max-w-sm mx-auto", muted)}>
                  Select a folder of receipts, invoices, or statements. The tool extracts vendor, date & amount — then renames files <strong className={isLight ? "text-emerald-700" : "text-emerald-400"}>directly in your folder</strong>.
                </p>

                <button
                  onClick={pickFolder}
                  className={cl(
                    "w-full py-5 rounded-xl border-2 border-dashed transition-all group mb-4 active:scale-[.99]",
                    isLight
                      ? "border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50 bg-emerald-50/50"
                      : "border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/5"
                  )}
                >
                  <FolderOpen className="w-8 h-8 text-emerald-500 mx-auto mb-2 group-hover:scale-110 transition-transform drop-shadow" />
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Click to select folder</p>
                  <p className={cl("text-xs mt-0.5", muted)}>PDF · PNG · JPG · TIFF · HEIC</p>
                </button>

                <button
                  onClick={pickFolder}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:opacity-90 active:scale-[.98] transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Scan & Detect
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {["Renames files in-place", "80+ vendor patterns", "PDF text extraction", "Image OCR", "Invoice vs receipt", "Learns vendor names"].map(f => (
                <span key={f} className={cl(
                  "px-3 py-1 rounded-full text-[11px] font-medium border",
                  isLight ? "bg-white border-slate-200 text-slate-500 shadow-sm" : "bg-[#0d111a] border-[#1a2235] text-[#888]"
                )}>{f}</span>
              ))}
            </div>
          </div>
        )}

        {/* ════ SCANNING ══════════════════════════════════════════════════ */}
        {stage === "scanning" && (
          <div className="flex flex-col items-center justify-center min-h-full p-8">
            <div className={cl("w-full max-w-md rounded-2xl border p-8", card, "border")}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
                <div>
                  <p className={cl("text-sm font-bold", text)}>Scanning files…</p>
                  <p className={cl("text-xs", muted)}>{progress.substage}</p>
                </div>
              </div>
              <div className={cl("rounded-full h-2 mb-3 overflow-hidden", isLight ? "bg-slate-100" : "bg-[#1a2235]")}>
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-300"
                  style={{ width: progress.total ? `${(progress.current / progress.total) * 100}%` : "5%" }}
                />
              </div>
              <div className="flex justify-between text-[11px] mb-4">
                <span className={muted}>{progress.current} of {progress.total}</span>
                <span className={muted}>{progress.total ? Math.round((progress.current / progress.total) * 100) : 0}%</span>
              </div>
              {progress.file && (
                <p className={cl("text-[11px] truncate px-3 py-2 rounded-lg border", isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-[#111] border-[#222] text-[#777]")}>
                  {progress.file}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ════ PREVIEW ═══════════════════════════════════════════════════ */}
        {stage === "preview" && (
          <div className="p-4 sm:p-6 space-y-4">

            {/* Stats — portal KPI card style */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total files",   value: rows.length,   grad: "from-blue-600 via-blue-700 to-indigo-900",    shadow: "shadow-blue-500/20"   },
                { label: "Auto-detected", value: autoCount,     grad: "from-emerald-500 via-teal-600 to-emerald-900", shadow: "shadow-emerald-500/20"},
                { label: "Needs review",  value: reviewCount,   grad: "from-amber-500 via-orange-600 to-red-900",    shadow: "shadow-amber-500/20"  },
                { label: "Will rename",   value: selectedCount, grad: "from-violet-600 via-indigo-700 to-slate-900", shadow: "shadow-violet-500/20" },
              ].map(({ label, value, grad, shadow }) => (
                <div key={label} className={cl(`rounded-xl border p-4 bg-gradient-to-br ${grad} ${shadow} shadow-lg`, "border-white/10")}>
                  <div className="text-3xl font-black text-white">{value}</div>
                  <div className="text-[11px] font-semibold mt-1 text-white/60">{label}</div>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div className={cl("flex flex-wrap items-center gap-2 p-3 rounded-xl border", card, "border")}>
              <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search files…"
                className={cl("flex-1 min-w-[160px] border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500",
                  isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#111] border-[#333] text-white")} />
              {(["all","auto","review"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cl("px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                    filter === f ? "bg-emerald-500 text-white"
                      : isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#111] text-[#888] hover:bg-[#1a1a1a]")}>
                  {f === "auto" ? "✓ Auto" : f === "review" ? "⚠ Review" : "All"}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1.5">
                {["All","None","Auto"].map(lbl => (
                  <button key={lbl}
                    onClick={() => setRows(prev => prev.map(r => ({ ...r, selected: lbl === "All" ? true : lbl === "None" ? false : r.complete })))}
                    className={cl("px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border",
                      isLight ? "border-slate-200 hover:bg-slate-50 text-slate-600" : "border-[#333] hover:bg-white/5 text-[#aaa]")}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className={cl("rounded-xl border overflow-hidden", card, "border")}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[760px]">
                  <thead>
                    <tr className={cl(isLight ? "bg-slate-50 text-slate-600" : "bg-[#0a0e18] text-[#888]")}>
                      <th className="w-8 px-3 py-2.5 text-center">
                        <input type="checkbox"
                          checked={filteredRows.length > 0 && filteredRows.every(r => r.selected)}
                          onChange={e => { const ids = new Set(filteredRows.map(r => r.id)); setRows(prev => prev.map(r => ids.has(r.id) ? { ...r, selected: e.target.checked } : r)); }}
                          className="accent-emerald-500" />
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Original</th>
                      <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap" style={{ minWidth: 260 }}>New name <span className="font-normal opacity-60">(editable)</span></th>
                      <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Vendor</th>
                      <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Date</th>
                      <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Amount</th>
                      <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">Type</th>
                      <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">Detection</th>
                      <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">Status</th>
                      <th className="w-8 px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(row => (
                      <tr key={row.id} className={cl("border-t transition-colors", border,
                        row.complete
                          ? isLight ? "hover:bg-slate-50" : "hover:bg-white/[0.015]"
                          : isLight ? "bg-amber-50/60 hover:bg-amber-50" : "bg-amber-950/10 hover:bg-amber-950/20"
                      )}>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={row.selected} onChange={e => updateRow(row.id, { selected: e.target.checked })} className="accent-emerald-500" />
                        </td>
                        <td className="px-3 py-2">
                          <span className={cl("font-mono text-[11px] truncate block max-w-[160px]", muted)} title={row.original}>{row.original}</span>
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={row.newName}
                            onChange={e => updateRow(row.id, { newName: e.target.value })}
                            className={cl("w-full border rounded-md px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-emerald-500 transition-colors",
                              row.newName !== row.original
                                ? isLight ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-emerald-700/60 bg-emerald-950/20 text-emerald-300"
                                : isLight ? "border-slate-200 bg-slate-50 text-slate-700" : "border-[#333] bg-[#111] text-[#ccc]")} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={row.vendor}
                            onChange={e => updateRow(row.id, rebuildName(row, { vendor: e.target.value }))}
                            className={cl("w-full border rounded-md px-2 py-1 text-[11px] focus:outline-none focus:border-emerald-500 max-w-[110px]",
                              isLight ? "border-slate-200 bg-slate-50" : "border-[#333] bg-[#111] text-[#ccc]")} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="date" value={row.date}
                            onChange={e => updateRow(row.id, rebuildName(row, { date: e.target.value }))}
                            className={cl("border rounded-md px-2 py-1 text-[11px] focus:outline-none focus:border-emerald-500 w-[118px]",
                              isLight ? "border-slate-200 bg-slate-50" : "border-[#333] bg-[#111] text-[#ccc]")} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={row.total} placeholder="$0.00"
                            onChange={e => updateRow(row.id, rebuildName(row, { total: e.target.value }))}
                            className={cl("border rounded-md px-2 py-1 text-[11px] focus:outline-none focus:border-emerald-500 w-[80px]",
                              isLight ? "border-slate-200 bg-slate-50" : "border-[#333] bg-[#111] text-[#ccc]")} />
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <span className={cl("px-2 py-0.5 rounded-full text-[10px] font-bold capitalize",
                            row.docType === "invoice" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                              : row.docType === "receipt" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          )}>{row.docType}</span>
                        </td>
                        {/* Scan method */}
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {row.scanMethod === "gemini" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">✨ Gemini</span>
                          )}
                          {row.scanMethod === "pdftext" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">📄 PDF text</span>
                          )}
                          {row.scanMethod === "ocr" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">👁 OCR</span>
                          )}
                          {row.scanMethod === "failed" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">✗ no text</span>
                          )}
                        </td>
                        {/* Auto / review */}
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {row.complete
                            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">✓ auto</span>
                            : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">⚠ review</span>
                          }
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button onClick={() => openDocPreview(row)}
                            className={cl("p-1.5 rounded-md transition-colors", isLight ? "hover:bg-slate-100 text-slate-400" : "hover:bg-white/5 text-[#666]")} title="Preview document">
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 && (
                      <tr><td colSpan={10} className={cl("px-4 py-10 text-center text-xs", muted)}>No files match your filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Apply */}
            <button
              onClick={applyRenames}
              disabled={selectedCount === 0}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:opacity-90 active:scale-[.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              <FileCheck className="w-5 h-5" />
              Rename {selectedCount} file{selectedCount !== 1 ? "s" : ""} in-place
            </button>
          </div>
        )}

        {/* ════ APPLYING ══════════════════════════════════════════════════ */}
        {stage === "applying" && (
          <div className="flex flex-col items-center justify-center min-h-full p-8">
            <div className={cl("w-full max-w-md rounded-2xl border p-8 text-center", card, "border")}>
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
              <p className={cl("text-sm font-bold", text)}>Renaming files…</p>
              <p className={cl("text-xs mt-1", muted)}>Applying changes directly in your folder</p>
            </div>
          </div>
        )}

        {/* ════ RESULTS ════════════════════════════════════════════════════ */}
        {stage === "results" && (
          <div className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto w-full">
            <div className={cl("rounded-2xl border p-6 text-center", card, "border")}>
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <h2 className={cl("text-xl font-extrabold mb-1", text)}>
                {resultSummary.ok} file{resultSummary.ok !== 1 ? "s" : ""} renamed
              </h2>
              {resultSummary.errors.length > 0 && (
                <p className={cl("text-sm", muted)}>{resultSummary.errors.length} error{resultSummary.errors.length > 1 ? "s" : ""}</p>
              )}
            </div>
            {resultSummary.errors.length > 0 && (
              <div className={cl("rounded-xl border p-4 space-y-2", card, "border border-red-500/20")}>
                <p className="text-xs font-bold text-red-400 mb-2">Failed renames</p>
                {resultSummary.errors.map(r => (
                  <div key={r.id} className="flex items-start gap-2 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <div><span className={cl("font-semibold", text)}>{r.original}</span><span className="text-red-400"> — {r.renameError}</span></div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStage("preview")} className={cl("flex-1 py-3 rounded-xl border font-semibold text-sm transition-colors", isLight ? "border-slate-200 hover:bg-slate-50 text-slate-700" : "border-[#333] hover:bg-white/5 text-[#ccc]")}>
                ← Back to preview
              </button>
              <button onClick={() => { setStage("pick"); setRows([]); setDirName(""); setPickError(null); }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:opacity-90 transition-all">
                Rename another folder
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Document preview modal ──────────────────────────────────────── */}
      {docPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={closeDocPreview}>
          <div className={cl("w-full max-w-3xl flex flex-col shadow-2xl rounded-2xl border overflow-hidden", card, "border")}
            style={{ height: "85vh" }} onClick={e => e.stopPropagation()}>
            <div className={cl("flex items-center justify-between px-5 py-3 border-b shrink-0", border)}>
              <div>
                <p className={cl("text-sm font-bold", text)}>Document preview</p>
                <p className={cl("text-[11px] truncate max-w-[400px]", muted)}>{docPreview.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={docPreview.url} target="_blank" rel="noopener noreferrer"
                  className={cl("px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors",
                    isLight ? "border-slate-200 hover:bg-slate-50 text-slate-600" : "border-[#333] hover:bg-white/5 text-[#aaa]")}>
                  Open in tab ↗
                </a>
                <button onClick={closeDocPreview} className={cl("p-1.5 rounded-lg", isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-white/5 text-[#888]")}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {docPreview.isImage ? (
                <div className="w-full h-full flex items-center justify-center p-4 overflow-auto bg-[#0a0a0a]">
                  <img src={docPreview.url} alt={docPreview.name} className="max-w-full max-h-full object-contain rounded-lg" />
                </div>
              ) : (
                <iframe src={docPreview.url} title={docPreview.name} className="w-full h-full border-0" style={{ background: "#fff" }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Vendor library modal ─────────────────────────────────────────── */}
      {showVendorMgr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className={cl("w-full max-w-lg max-h-[80vh] rounded-2xl border flex flex-col shadow-2xl", card, "border")}>
            <div className={cl("flex items-center justify-between px-5 py-3 border-b shrink-0", border)}>
              <div>
                <p className={cl("text-sm font-bold", text)}>Vendor Library</p>
                <p className={cl("text-[11px]", muted)}>Learned mappings — checked first when detecting vendors</p>
              </div>
              <button onClick={() => setShowVendorMgr(false)} className={cl("p-1.5 rounded-lg", isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-white/5 text-[#888]")}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className={cl("rounded-xl border p-3 space-y-2", isLight ? "bg-slate-50 border-slate-200" : "bg-[#111] border-[#222]")}>
                <p className={cl("text-[11px] font-bold", muted)}>Add mapping</p>
                <input value={learnPattern} onChange={e => setLearnPattern(e.target.value)} placeholder="Pattern (text that appears in file)…" className={inputCls} />
                <input value={learnName} onChange={e => setLearnName(e.target.value)} placeholder="Canonical name (e.g. McDonalds)…" className={inputCls} />
                <button onClick={() => {
                  if (!learnPattern.trim() || !learnName.trim()) return;
                  saveCustomVendor(learnPattern.trim(), learnName.trim());
                  setCustomVendors(loadCustomVendors());
                  setLearnPattern(""); setLearnName("");
                }} className="w-full py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors">
                  Add to Library
                </button>
              </div>
              {customVendors.length === 0
                ? <p className={cl("text-xs text-center py-4", muted)}>No custom vendors yet — learned automatically when you correct a name.</p>
                : customVendors.map(v => (
                  <div key={v.pattern} className={cl("flex items-center gap-3 p-2.5 rounded-lg border", isLight ? "border-slate-100 bg-white" : "border-[#1a2235] bg-[#0d111a]")}>
                    <div className="flex-1 min-w-0">
                      <p className={cl("text-[11px] font-semibold truncate", text)}>{v.name}</p>
                      <p className={cl("text-[10px] truncate font-mono", muted)}>{v.pattern}</p>
                    </div>
                    <button onClick={() => { deleteCustomVendor(v.pattern); setCustomVendors(loadCustomVendors()); }}
                      className="p-1 rounded hover:bg-red-500/10 text-red-400 hover:text-red-500 shrink-0">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
