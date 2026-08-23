import React, { useState, useRef } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  FolderOpen, FileText, CheckCircle2, AlertTriangle,
  ChevronLeft, RotateCcw, Sparkles, ScanLine, FileCheck, Loader2,
  ArrowRight, X, Trash2, Download, Upload
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import {
  findVendor, findDate, findTotal, detectDocType,
  buildFilename, sanitizeFilename, SUPPORTED_EXTS,
  loadCustomVendors, saveCustomVendor, deleteCustomVendor,
  type CustomVendorEntry,
} from "../../utils/receiptParser";

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

/* ── Types ──────────────────────────────────────────────────────────── */
interface FileRow {
  id: string;
  fileObj: File;
  handle?: FileSystemFileHandle;   // only when picked via showDirectoryPicker
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
  status: "idle" | "processing" | "done" | "error";
  renamed?: boolean;
  renameError?: string;
}

type Stage = "pick" | "scanning" | "preview" | "applying" | "results";
type PickMode = "input" | "api";   // input = <input webkitdirectory>; api = showDirectoryPicker

const FS_API = typeof window !== "undefined" && "showDirectoryPicker" in window;

/* ── Text extraction ─────────────────────────────────────────────── */
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

async function extractText(file: File, ext: string): Promise<string> {
  return ext === ".pdf" ? extractPdfText(file) : extractImageText(file);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── Download helper (fallback mode) ─────────────────────────────── */
function downloadBlob(file: File, newName: string) {
  return new Promise<void>((resolve) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = newName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); resolve(); }, 300);
  });
}

/* ── Main component ──────────────────────────────────────────────── */
export const ReceiptRenamerPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { theme } = useFinance();
  const isLight = theme === "light";

  const [stage, setStage]         = useState<Stage>("pick");
  const [pickMode, setPickMode]   = useState<PickMode>("input");
  const [dirName, setDirName]     = useState("");
  const [rows, setRows]           = useState<FileRow[]>([]);
  const [progress, setProgress]   = useState({ current: 0, total: 0, file: "", substage: "" });
  const [searchQ, setSearchQ]     = useState("");
  const [filter, setFilter]       = useState<"all" | "auto" | "review">("all");
  const [rawPreview, setRawPreview] = useState<{ name: string; text: string } | null>(null);
  const [docPreview, setDocPreview] = useState<{ name: string; url: string; isImage: boolean } | null>(null);

  // Cleanup blob URL when modal closes
  const closeDocPreview = () => {
    if (docPreview) URL.revokeObjectURL(docPreview.url);
    setDocPreview(null);
  };

  const openDocPreview = (row: FileRow) => {
    const url = URL.createObjectURL(row.fileObj);
    const isImage = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".heic", ".tiff", ".tif"].includes(row.ext);
    setDocPreview({ name: row.original, url, isImage });
  };
  const [showVendorMgr, setShowVendorMgr] = useState(false);
  const [customVendors, setCustomVendors] = useState<CustomVendorEntry[]>([]);
  const [learnPattern, setLearnPattern]   = useState("");
  const [learnName, setLearnName]         = useState("");
  const [resultSummary, setResultSummary] = useState<{ ok: number; skipped: number; errors: FileRow[] }>({ ok: 0, skipped: 0, errors: [] });
  const [apiBlocked, setApiBlocked]       = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Theme aliases ──────────────────────────────────────────────── */
  const bg    = isLight ? "bg-slate-100"  : "bg-[#070b12]";
  const card  = isLight ? "bg-white border-slate-200"  : "bg-[#0d111a] border-[#1a2235]";
  const text  = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-[#888]";
  const border = isLight ? "border-slate-200" : "border-[#1a2235]";
  const inputCls = `w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#1a73e8] ${
    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#111] border-[#333] text-white"
  }`;
  const cl = (...cs: (string | false | undefined)[]) => cs.filter(Boolean).join(" ");

  /* ── Process file list ──────────────────────────────────────────── */
  const processFiles = async (entries: { file: File; handle?: FileSystemFileHandle }[], mode: PickMode, folderName: string) => {
    setPickMode(mode);
    setDirName(folderName);
    setStage("scanning");
    setProgress({ current: 0, total: entries.length, file: "", substage: "Extracting text…" });

    const newRows: FileRow[] = [];

    for (let i = 0; i < entries.length; i++) {
      const { file, handle } = entries[i];
      const name = file.name;
      const dotIdx = name.lastIndexOf(".");
      const ext = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : "";

      setProgress(p => ({ ...p, current: i + 1, file: name, substage: ext === ".pdf" ? "Reading PDF…" : "Running OCR…" }));

      let rawText = "";
      try { rawText = await extractText(file, ext); } catch { rawText = ""; }

      const docType = detectDocType(rawText);
      const vendor  = findVendor(rawText);
      const dateObj = findDate(rawText, docType);
      const total   = findTotal(rawText, docType);
      const newName = sanitizeFilename(buildFilename(vendor, dateObj, total, ext, docType, rawText));
      const complete = vendor !== null && dateObj !== null && (docType === "other" || total !== null);

      newRows.push({
        id: `${i}-${name}`,
        fileObj: file,
        handle,
        original: name,
        ext,
        newName,
        vendor: vendor || "",
        date: dateObj ? formatDate(dateObj) : "",
        total: total != null ? `$${total.toFixed(2)}` : "",
        docType,
        complete,
        rawText,
        selected: complete,
        status: "idle",
      });
    }

    setRows(newRows);
    setStage("preview");
  };

  /* ── Folder picker via File System Access API ───────────────────── */
  const pickViaAPI = async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      const entries: { file: File; handle: FileSystemFileHandle }[] = [];
      async function walk(dh: any) {
        for await (const [, entry] of dh.entries()) {
          if (entry.kind === "file") {
            const ext = "." + (entry.name as string).split(".").pop()!.toLowerCase();
            if (SUPPORTED_EXTS.has(ext)) {
              const file = await entry.getFile();
              entries.push({ file, handle: entry });
            }
          } else if (entry.kind === "directory") {
            await walk(entry);
          }
        }
      }
      await walk(dirHandle);
      if (!entries.length) { alert("No PDF or image files found in that folder."); return; }
      await processFiles(entries, "api", dirHandle.name);
    } catch (e: any) {
      if (e?.name === "AbortError") return; // user cancelled
      // Blocked by Brave Shields or unsupported
      setApiBlocked(true);
      fileInputRef.current?.click();
    }
  };

  /* ── File input change (universal fallback) ─────────────────────── */
  const onFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => {
      const ext = "." + f.name.split(".").pop()!.toLowerCase();
      return SUPPORTED_EXTS.has(ext);
    });
    if (!files.length) return;
    const folderName = (files[0] as any).webkitRelativePath?.split("/")[0] || "Selected files";
    await processFiles(files.map(f => ({ file: f })), "input", folderName);
    e.target.value = "";
  };

  /* ── Apply renames (API mode = move; input mode = download) ─────── */
  const applyRenames = async () => {
    const toProcess = rows.filter(r => r.selected && r.newName && r.newName !== r.original);
    if (!toProcess.length) return;
    setStage("applying");

    const updated = [...rows];
    let ok = 0, skipped = 0;
    const errors: FileRow[] = [];

    // Learn corrections
    for (const row of toProcess) {
      const autoVendor = findVendor(row.rawText);
      const userVendor = row.newName.split("_")[0];
      if (userVendor && userVendor !== "?" && userVendor !== autoVendor && row.rawText) {
        const firstLine = row.rawText.split("\n").map(l => l.trim()).filter(l => l.length > 3)[0];
        if (firstLine) saveCustomVendor(firstLine.slice(0, 60), userVendor);
      }
    }

    for (const row of toProcess) {
      const idx = updated.findIndex(r => r.id === row.id);
      updated[idx] = { ...updated[idx], status: "processing" };
      setRows([...updated]);

      try {
        if (row.handle && pickMode === "api") {
          // In-place rename via File System Access API
          await (row.handle as any).move(sanitizeFilename(row.newName));
          updated[idx] = { ...updated[idx], status: "done", renamed: true };
          ok++;
        } else {
          // Download with new name
          await downloadBlob(row.fileObj, sanitizeFilename(row.newName));
          updated[idx] = { ...updated[idx], status: "done", renamed: true };
          ok++;
        }
      } catch (err: any) {
        updated[idx] = { ...updated[idx], status: "error", renameError: err?.message || "Failed" };
        errors.push(updated[idx]);
      }
      setRows([...updated]);
    }

    setResultSummary({ ok, skipped, errors });
    setStage("results");
  };

  /* ── Row field updates ──────────────────────────────────────────── */
  const updateRow = (id: string, patch: Partial<FileRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const rebuildName = (row: FileRow, patch: Partial<FileRow>) => {
    const merged = { ...row, ...patch };
    const vendor = merged.vendor || null;
    const dateObj = merged.date ? new Date(merged.date + "T00:00:00") : null;
    const totalNum = merged.total ? parseFloat(merged.total.replace(/[^0-9.]/g, "")) || null : null;
    const newName = sanitizeFilename(buildFilename(vendor, dateObj, totalNum, merged.ext, merged.docType as any, merged.rawText));
    return { ...patch, newName };
  };

  /* ── Filtered rows ──────────────────────────────────────────────── */
  const filteredRows = rows.filter(r => {
    if (filter === "auto" && !r.complete) return false;
    if (filter === "review" && r.complete) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      return r.original.toLowerCase().includes(q) || r.newName.toLowerCase().includes(q) || r.vendor.toLowerCase().includes(q);
    }
    return true;
  });

  const selectedCount = rows.filter(r => r.selected && r.newName !== r.original).length;
  const autoCount   = rows.filter(r => r.complete).length;
  const reviewCount = rows.length - autoCount;

  /* ── Vendor manager ─────────────────────────────────────────────── */
  const openVendorMgr = () => { setCustomVendors(loadCustomVendors()); setShowVendorMgr(true); };
  const addVendor = () => {
    if (!learnPattern.trim() || !learnName.trim()) return;
    saveCustomVendor(learnPattern.trim(), learnName.trim());
    setCustomVendors(loadCustomVendors());
    setLearnPattern(""); setLearnName("");
  };

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className={cl("flex-1 flex flex-col h-full overflow-hidden", bg, text)}>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        {...{ webkitdirectory: "", multiple: "" } as any}
        accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.heic,.bmp,.gif,.webp"
        onChange={onFileInputChange}
      />

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className={cl("flex items-center gap-3 px-4 sm:px-6 py-3 border-b shrink-0", card, "border")}>
        <button onClick={onBack} className={cl("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-white/5 text-[#888]")}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow">
            <ScanLine className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className={cl("text-sm font-bold", text)}>Receipt Renamer</h1>
            <p className={cl("text-[10px]", muted)}>AI-powered batch rename for receipts, invoices & statements</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {stage === "preview" && (
            <>
              <span className={cl("text-[11px]", muted)}>{rows.length} files</span>
              {pickMode === "input" && (
                <span className={cl("px-2 py-0.5 rounded-full text-[10px] font-bold border", isLight ? "border-amber-300 text-amber-700 bg-amber-50" : "border-amber-700/40 text-amber-400 bg-amber-950/20")}>
                  ↓ Download mode
                </span>
              )}
              <button onClick={openVendorMgr} className={cl("px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors", isLight ? "border-slate-200 hover:bg-slate-50 text-slate-600" : "border-[#333] hover:bg-white/5 text-[#aaa]")}>
                Vendor Library
              </button>
              <button onClick={() => { setStage("pick"); setRows([]); setDirName(""); setApiBlocked(false); }} className={cl("p-1.5 rounded-lg transition-colors", isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-white/5 text-[#888]")} title="Start over">
                <RotateCcw className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ════ PICK ══════════════════════════════════════════════ */}
        {stage === "pick" && (
          <div className="flex flex-col items-center justify-center min-h-full p-6 gap-5">

            {/* Brave/shields notice */}
            {apiBlocked && (
              <div className={cl("w-full max-w-lg rounded-xl border p-3 flex items-start gap-2.5", isLight ? "bg-amber-50 border-amber-200" : "bg-amber-950/20 border-amber-700/40")}>
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-600 dark:text-amber-400">Folder access blocked</p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-0.5">
                    Brave Shields may be blocking the folder picker. Either lower Shields for this site, or use the file selector below instead.
                  </p>
                </div>
              </div>
            )}

            {/* Hero card */}
            <div className={cl("w-full max-w-lg rounded-2xl border p-8 text-center", card, "border")}>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-emerald-500/20">
                <ScanLine className="w-8 h-8 text-white" />
              </div>
              <h2 className={cl("text-xl font-extrabold mb-2", text)}>Receipt Renamer</h2>
              <p className={cl("text-sm mb-6", muted)}>
                Select your receipts, invoices, or statements. The tool reads each file, extracts vendor, date & amount, then renames everything — no uploads, no servers.
              </p>

              {/* Primary: select folder (API) */}
              {FS_API && (
                <button
                  onClick={pickViaAPI}
                  className="w-full py-4 rounded-xl border-2 border-dashed border-emerald-400/60 hover:border-emerald-400 hover:bg-emerald-500/5 transition-all group mb-3"
                >
                  <FolderOpen className="w-6 h-6 text-emerald-400 mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
                  <p className="text-sm font-bold text-emerald-500">Select folder → rename in-place</p>
                  <p className={cl("text-xs mt-0.5", muted)}>Uses browser folder access for direct rename</p>
                </button>
              )}

              {/* Secondary / Universal: file input */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className={cl(
                  "w-full py-4 rounded-xl border-2 border-dashed transition-all group",
                  FS_API
                    ? isLight ? "border-slate-200 hover:border-slate-300 hover:bg-slate-50" : "border-[#1a2235] hover:border-[#2a3245] hover:bg-white/[0.02]"
                    : "border-emerald-400/60 hover:border-emerald-400 hover:bg-emerald-500/5"
                )}
              >
                <Upload className={cl("w-6 h-6 mx-auto mb-1.5 group-hover:scale-110 transition-transform", FS_API ? muted : "text-emerald-400")} />
                <p className={cl("text-sm font-bold", FS_API ? muted : "text-emerald-500")}>
                  {FS_API ? "Or select files / folder" : "Select files or folder"}
                </p>
                <p className={cl("text-xs mt-0.5", muted)}>
                  {FS_API ? "Renamed copies downloaded to your Downloads folder" : "Works in all browsers — renamed files download automatically"}
                </p>
              </button>

              <p className={cl("text-[11px] mt-4", muted)}>PDF, PNG, JPG, TIFF, HEIC supported</p>
            </div>

            {/* Feature chips */}
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {["80+ vendor patterns", "PDF text extraction", "Image OCR", "Invoice vs receipt", "Editable before applying", "Learns vendor names"].map(f => (
                <span key={f} className={cl("px-3 py-1 rounded-full text-[11px] font-medium border", isLight ? "bg-white border-slate-200 text-slate-500" : "bg-[#0d111a] border-[#1a2235] text-[#888]")}>{f}</span>
              ))}
            </div>
          </div>
        )}

        {/* ════ SCANNING ══════════════════════════════════════════ */}
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
                  style={{ width: progress.total ? `${(progress.current / progress.total) * 100}%` : "10%" }}
                />
              </div>
              <div className="flex justify-between text-[11px] mb-4">
                <span className={muted}>{progress.current} of {progress.total || "?"}</span>
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

        {/* ════ PREVIEW ════════════════════════════════════════════ */}
        {stage === "preview" && (
          <div className="p-4 sm:p-6 space-y-4">

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total files",   value: rows.length,   color: "from-blue-500 to-blue-600"     },
                { label: "Auto-detected", value: autoCount,     color: "from-emerald-500 to-teal-600"  },
                { label: "Needs review",  value: reviewCount,   color: "from-amber-500 to-orange-500"  },
                { label: pickMode === "api" ? "Will rename" : "Will download", value: selectedCount, color: "from-purple-500 to-violet-600" },
              ].map(({ label, value, color }) => (
                <div key={label} className={cl("rounded-xl border p-4", card, "border")}>
                  <div className={`text-2xl font-black bg-gradient-to-br ${color} bg-clip-text text-transparent`}>{value}</div>
                  <div className={cl("text-[11px] font-medium mt-0.5", muted)}>{label}</div>
                </div>
              ))}
            </div>

            {/* Download-mode notice */}
            {pickMode === "input" && (
              <div className={cl("flex items-start gap-2.5 p-3 rounded-xl border", isLight ? "bg-amber-50 border-amber-200" : "bg-amber-950/15 border-amber-700/30")}>
                <Download className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  <strong>Download mode:</strong> Renamed copies will be saved to your Downloads folder. Original files stay untouched.
                  {FS_API && <span className="ml-1">For in-place rename, use "Select folder" on the previous screen.</span>}
                </p>
              </div>
            )}

            {/* Toolbar */}
            <div className={cl("flex flex-wrap items-center gap-2 p-3 rounded-xl border", card, "border")}>
              <input
                type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder="Search files…"
                className={cl("flex-1 min-w-[160px] border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500",
                  isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#111] border-[#333] text-white")}
              />
              {(["all", "auto", "review"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cl("px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                    filter === f ? "bg-emerald-500 text-white"
                      : isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#111] text-[#888] hover:bg-[#1a1a1a]"
                  )}>
                  {f === "auto" ? "✓ Auto" : f === "review" ? "⚠ Review" : "All"}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1.5">
                {["All", "None", "Auto"].map((lbl) => (
                  <button key={lbl}
                    onClick={() => setRows(prev => prev.map(r => ({ ...r, selected: lbl === "All" ? true : lbl === "None" ? false : r.complete })))}
                    className={cl("px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border",
                      isLight ? "border-slate-200 hover:bg-slate-50 text-slate-600" : "border-[#333] hover:bg-white/5 text-[#aaa]")}
                  >{lbl}</button>
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
                                : isLight ? "border-slate-200 bg-slate-50 text-slate-700" : "border-[#333] bg-[#111] text-[#ccc]"
                            )} />
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
                      <tr><td colSpan={9} className={cl("px-4 py-10 text-center text-xs", muted)}>No files match your filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Apply button */}
            <button
              onClick={applyRenames}
              disabled={selectedCount === 0}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:opacity-90 active:scale-[.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              {pickMode === "api" ? <FileCheck className="w-5 h-5" /> : <Download className="w-5 h-5" />}
              {pickMode === "api"
                ? `Rename ${selectedCount} file${selectedCount !== 1 ? "s" : ""} in-place`
                : `Download ${selectedCount} renamed file${selectedCount !== 1 ? "s" : ""}`
              }
            </button>
          </div>
        )}

        {/* ════ APPLYING ═══════════════════════════════════════════ */}
        {stage === "applying" && (
          <div className="flex flex-col items-center justify-center min-h-full p-8">
            <div className={cl("w-full max-w-md rounded-2xl border p-8 text-center", card, "border")}>
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
              <p className={cl("text-sm font-bold", text)}>{pickMode === "api" ? "Renaming files…" : "Downloading renamed files…"}</p>
              <p className={cl("text-xs mt-1", muted)}>
                {pickMode === "api" ? "Applying changes in-place" : "Files saving to your Downloads folder"}
              </p>
            </div>
          </div>
        )}

        {/* ════ RESULTS ════════════════════════════════════════════ */}
        {stage === "results" && (
          <div className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto w-full">
            <div className={cl("rounded-2xl border p-6 text-center", card, "border")}>
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <h2 className={cl("text-xl font-extrabold mb-1", text)}>
                {resultSummary.ok} file{resultSummary.ok !== 1 ? "s" : ""} {pickMode === "api" ? "renamed" : "downloaded"}
              </h2>
              {resultSummary.errors.length > 0 && (
                <p className={cl("text-sm", muted)}>{resultSummary.errors.length} error{resultSummary.errors.length > 1 ? "s" : ""}</p>
              )}
            </div>
            {resultSummary.errors.length > 0 && (
              <div className={cl("rounded-xl border p-4 space-y-2", card, "border border-red-500/20")}>
                <p className="text-xs font-bold text-red-400 mb-2">Failed</p>
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
                ← Back
              </button>
              <button onClick={() => { setStage("pick"); setRows([]); setDirName(""); setApiBlocked(false); }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:opacity-90 transition-all">
                Process another folder
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Document preview modal ──────────────────────────────── */}
      {docPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={closeDocPreview}>
          <div
            className={cl("w-full max-w-3xl flex flex-col shadow-2xl rounded-2xl border overflow-hidden", card, "border")}
            style={{ height: "85vh" }}
            onClick={e => e.stopPropagation()}
          >
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

      {/* ── Vendor library modal ────────────────────────────────── */}
      {showVendorMgr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className={cl("w-full max-w-lg max-h-[80vh] rounded-2xl border flex flex-col shadow-2xl", card, "border")}>
            <div className={cl("flex items-center justify-between px-5 py-3 border-b shrink-0", border)}>
              <div>
                <p className={cl("text-sm font-bold", text)}>Vendor Library</p>
                <p className={cl("text-[11px]", muted)}>Learned mappings — checked first when detecting vendors</p>
              </div>
              <button onClick={() => setShowVendorMgr(false)} className={cl("p-1.5 rounded-lg", isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-white/5 text-[#888]")}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className={cl("rounded-xl border p-3 space-y-2", isLight ? "bg-slate-50 border-slate-200" : "bg-[#111] border-[#222]")}>
                <p className={cl("text-[11px] font-bold", muted)}>Add mapping</p>
                <input value={learnPattern} onChange={e => setLearnPattern(e.target.value)} placeholder="Pattern (text that appears in file)…" className={inputCls} />
                <input value={learnName} onChange={e => setLearnName(e.target.value)} placeholder="Canonical name (e.g. McDonalds)…" className={inputCls} />
                <button onClick={addVendor} className="w-full py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors">Add to Library</button>
              </div>
              {customVendors.length === 0
                ? <p className={cl("text-xs text-center py-4", muted)}>No custom vendors yet — they're learned automatically when you correct a vendor name.</p>
                : customVendors.map(v => (
                  <div key={v.pattern} className={cl("flex items-center gap-3 p-2.5 rounded-lg border", isLight ? "border-slate-100 bg-white" : "border-[#1a2235] bg-[#0d111a]")}>
                    <div className="flex-1 min-w-0">
                      <p className={cl("text-[11px] font-semibold truncate", text)}>{v.name}</p>
                      <p className={cl("text-[10px] truncate font-mono", muted)}>{v.pattern}</p>
                    </div>
                    <button onClick={() => { deleteCustomVendor(v.pattern); setCustomVendors(loadCustomVendors()); }} className="p-1 rounded hover:bg-red-500/10 text-red-400 hover:text-red-500 shrink-0">
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
