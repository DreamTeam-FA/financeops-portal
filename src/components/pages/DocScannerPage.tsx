/**
 * DocScannerPage — keyword search across uploaded documents.
 * Mirrors Fin_Doc_scanner.py: supports PDF, DOCX, XLSX, images, TXT.
 * All processing runs in-browser; no server needed.
 */
import React, { useState, useRef, useCallback } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  Upload, Search, FileText, Loader2, CheckCircle2,
  AlertCircle, X, Download, FileSearch, ChevronDown, ChevronRight, ChevronLeft
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";
import mammoth from "mammoth";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

/* ── Types ─────────────────────────────────────────────────────────── */
interface KeywordHit {
  keyword: string;
  count: number;
  snippets: string[];
}

interface ScanResult {
  id: string;
  file: File;
  status: "pending" | "scanning" | "done" | "error";
  hits: KeywordHit[];
  totalMatches: number;
  error?: string;
  expanded: boolean;
}

/* ── Text extraction ────────────────────────────────────────────────── */
async function extractText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: any) => item.str).join(" "));
    }
    return pages.join("\n");
  }

  if (ext === "docx") {
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value;
  }

  if (["xlsx", "xls", "csv"].includes(ext)) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    return wb.SheetNames.map((name) =>
      XLSX.utils.sheet_to_csv(wb.Sheets[name])
    ).join("\n");
  }

  if (["jpg", "jpeg", "png", "bmp", "tiff", "tif", "gif", "webp"].includes(ext)) {
    const { data } = await Tesseract.recognize(file, "eng", { logger: () => {} });
    return data.text;
  }

  if (["txt", "md", "log", "csv"].includes(ext)) {
    return await file.text();
  }

  // fallback: try as plain text
  try { return await file.text(); } catch { return ""; }
}

/* ── Keyword search ─────────────────────────────────────────────────── */
function searchKeywords(text: string, keywords: string[]): KeywordHit[] {
  const lower = text.toLowerCase();
  return keywords
    .map((kw) => kw.trim())
    .filter(Boolean)
    .map((kw) => {
      const lkw = kw.toLowerCase();
      let idx = 0;
      let count = 0;
      const snippets: string[] = [];
      while ((idx = lower.indexOf(lkw, idx)) !== -1) {
        count++;
        if (snippets.length < 3) {
          const s = Math.max(0, idx - 60);
          const e = Math.min(text.length, idx + kw.length + 60);
          const raw = text.slice(s, e).replace(/\s+/g, " ").trim();
          // highlight the keyword in the snippet
          const highlighted = raw.replace(
            new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
            (m) => `«${m}»`
          );
          snippets.push(highlighted);
        }
        idx += lkw.length;
      }
      return { keyword: kw, count, snippets };
    })
    .filter((h) => h.count > 0);
}

/* ── CSV export ─────────────────────────────────────────────────────── */
function exportCSV(results: ScanResult[], keywords: string[]) {
  const rows: string[][] = [["File", "Status", ...keywords, "Total Matches"]];
  results.forEach((r) => {
    const hitMap = Object.fromEntries(r.hits.map((h) => [h.keyword.toLowerCase(), h.count]));
    rows.push([
      r.file.name,
      r.status === "error" ? `Error: ${r.error}` : r.status,
      ...keywords.map((kw) => String(hitMap[kw.toLowerCase()] ?? 0)),
      String(r.totalMatches),
    ]);
  });
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `doc-scan-results-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Component ──────────────────────────────────────────────────────── */
export const DocScannerPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { theme } = useFinance() as any;
  const isLight = theme === "light";
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [keywordsText, setKeywordsText] = useState("");
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const keywords = keywordsText
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      const novel = Array.from(incoming).filter(
        (f) => !existing.has(f.name + f.size)
      );
      return [...prev, ...novel];
    });
    setResults([]);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setResults([]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const toggleExpand = (id: string) => {
    setResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, expanded: !r.expanded } : r))
    );
  };

  const runScan = async () => {
    if (!files.length || !keywords.length) return;
    setScanning(true);

    const initial: ScanResult[] = files.map((f, i) => ({
      id: `${i}-${f.name}`,
      file: f,
      status: "pending",
      hits: [],
      totalMatches: 0,
      expanded: false,
    }));
    setResults(initial);

    const updated = [...initial];
    for (let i = 0; i < files.length; i++) {
      updated[i] = { ...updated[i], status: "scanning" };
      setResults([...updated]);
      try {
        const text = await extractText(files[i]);
        const hits = searchKeywords(text, keywords);
        const totalMatches = hits.reduce((s, h) => s + h.count, 0);
        updated[i] = { ...updated[i], status: "done", hits, totalMatches };
      } catch (err: any) {
        updated[i] = { ...updated[i], status: "error", error: err.message ?? "Unknown error" };
      }
      setResults([...updated]);
    }
    setScanning(false);
  };

  const hasResults = results.some((r) => r.status === "done");
  const filesWithHits = results.filter((r) => r.totalMatches > 0);
  const filesScanned = results.filter((r) => r.status === "done" || r.status === "error").length;

  /* ── Styles ── */
  const bg    = isLight ? "bg-white"           : "bg-[#0a0f1c]";
  const bdr   = isLight ? "border-slate-200"   : "border-[#1a2235]";
  const txt   = isLight ? "text-slate-800"     : "text-[#c8d4e8]";
  const muted = isLight ? "text-slate-500"     : "text-[#5a7090]";
  const card  = isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]";
  const inp   = isLight
    ? "bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500 placeholder-slate-400"
    : "bg-[#0a0e1a] border-[#1e2c42] text-white focus:border-[#1a73e8] placeholder-[#3d5478]";

  return (
    <div className={`flex flex-col h-full overflow-hidden ${bg} ${txt}`}>
      {/* Header */}
      <div className={`border-b px-5 py-3.5 flex items-center gap-3 shrink-0 ${isLight ? "bg-white border-slate-200" : "bg-[#070b12] border-[#1a2235]"}`}>
        {onBack && (
          <button onClick={onBack} className={`flex items-center gap-1 text-xs transition-colors ${isLight ? "text-slate-500 hover:text-slate-800" : "text-[#5a7090] hover:text-white"}`}>
            <ChevronLeft className="w-4 h-4" />Back
          </button>
        )}
        {onBack && <div className={`h-4 w-px ${isLight ? "bg-slate-200" : "bg-[#1a2235]"}`} />}
        <FileSearch className="w-4 h-4 text-sky-400 shrink-0" />
        <div>
          <div className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>Doc Scanner</div>
          <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#5a7090]"}`}>Search for keywords across PDF, DOCX, XLSX, images & text files — all in-browser</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Top panel: file upload + keywords side by side on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* File upload */}
          <div className={`border rounded-xl p-4 space-y-3 ${card}`}>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${muted}`}>Files to scan</h3>
            <div
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
                dragOver
                  ? isLight ? "border-sky-400 bg-sky-50" : "border-sky-500 bg-sky-950/20"
                  : isLight ? "border-slate-200 hover:border-sky-400 hover:bg-sky-50/50" : "border-[#1a2235] hover:border-sky-600/50 hover:bg-sky-950/10"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.jpg,.jpeg,.png,.bmp,.tiff,.tif,.gif,.webp"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
              <Upload className={`w-6 h-6 mx-auto mb-1.5 ${dragOver ? "text-sky-500" : muted}`} />
              <p className={`text-xs font-medium ${txt}`}>Drop files or click to browse</p>
              <p className={`text-[10px] mt-0.5 ${muted}`}>PDF · DOCX · XLSX · Images · TXT</p>
            </div>

            {files.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {files.map((f, i) => (
                  <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs ${isLight ? "bg-slate-50" : "bg-[#0a0e1a]"}`}>
                    <FileText className={`w-3.5 h-3.5 shrink-0 ${muted}`} />
                    <span className={`flex-1 truncate font-mono text-[11px] ${txt}`}>{f.name}</span>
                    <span className={`shrink-0 text-[10px] ${muted}`}>{(f.size / 1024).toFixed(0)}KB</span>
                    <button onClick={() => removeFile(i)} className={`shrink-0 p-0.5 rounded hover:text-red-400 ${muted}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Keywords */}
          <div className={`border rounded-xl p-4 space-y-3 ${card}`}>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${muted}`}>Keywords to search</h3>
            <textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder={"Enter keywords, one per line or comma-separated:\n\nrefund\noverdue\nAmazon\nstatement date"}
              rows={7}
              className={`w-full border rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none ${inp}`}
            />
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {keywords.map((kw) => (
                  <span key={kw} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isLight ? "bg-sky-100 text-sky-700" : "bg-sky-950/40 text-sky-300 border border-sky-800/30"}`}>
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Scan button */}
        <div className="flex items-center gap-3">
          <button
            onClick={runScan}
            disabled={scanning || !files.length || !keywords.length}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {scanning ? `Scanning ${filesScanned}/${files.length}…` : "Scan Documents"}
          </button>
          {hasResults && (
            <button
              onClick={() => exportCSV(results, keywords)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                isLight ? "border-slate-300 text-slate-700 hover:bg-slate-50" : "border-[#1a2235] text-[#c8d4e8] hover:bg-[#0d111a]"
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
          {hasResults && (
            <span className={`text-xs ${muted}`}>
              {filesWithHits.length} of {results.filter(r => r.status === "done").length} files contain matches
            </span>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-2">
            <h3 className={`text-xs font-bold uppercase tracking-wider ${muted}`}>Results</h3>
            {results.map((r) => (
              <div key={r.id} className={`border rounded-xl overflow-hidden ${card}`}>
                {/* Row header */}
                <div
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    r.hits.length > 0
                      ? isLight ? "hover:bg-slate-50" : "hover:bg-[#0a0e1a]"
                      : ""
                  }`}
                  onClick={() => r.hits.length > 0 && toggleExpand(r.id)}
                >
                  {/* Status icon */}
                  {r.status === "scanning" && <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />}
                  {r.status === "done" && r.totalMatches > 0 && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                  {r.status === "done" && r.totalMatches === 0 && <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0" />}
                  {r.status === "error" && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                  {r.status === "pending" && <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${bdr}`} />}

                  {/* File name */}
                  <span className={`flex-1 text-xs font-mono truncate ${txt}`}>{r.file.name}</span>

                  {/* Match count badge */}
                  {r.status === "done" && (
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                      r.totalMatches > 0
                        ? isLight ? "bg-emerald-100 text-emerald-700" : "bg-emerald-950/40 text-emerald-400 border border-emerald-800/30"
                        : isLight ? "bg-slate-100 text-slate-500" : "bg-[#1a2235] text-[#4a6080]"
                    }`}>
                      {r.totalMatches > 0 ? `${r.totalMatches} match${r.totalMatches !== 1 ? "es" : ""}` : "no matches"}
                    </span>
                  )}
                  {r.status === "error" && (
                    <span className="shrink-0 text-xs text-red-400">{r.error}</span>
                  )}

                  {/* Expand toggle */}
                  {r.hits.length > 0 && (
                    r.expanded
                      ? <ChevronDown className={`w-4 h-4 shrink-0 ${muted}`} />
                      : <ChevronRight className={`w-4 h-4 shrink-0 ${muted}`} />
                  )}
                </div>

                {/* Expanded hits */}
                {r.expanded && r.hits.length > 0 && (
                  <div className={`border-t px-4 py-3 space-y-3 ${isLight ? "border-slate-100 bg-slate-50" : "border-[#1a2235] bg-[#080c14]"}`}>
                    {r.hits.map((hit) => (
                      <div key={hit.keyword}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${isLight ? "bg-sky-100 text-sky-700" : "bg-sky-950/40 text-sky-300 border border-sky-800/30"}`}>
                            {hit.keyword}
                          </span>
                          <span className={`text-[10px] ${muted}`}>{hit.count} occurrence{hit.count !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="space-y-1">
                          {hit.snippets.map((s, i) => (
                            <p key={i} className={`text-[11px] font-mono leading-relaxed px-2 py-1 rounded ${isLight ? "bg-white border border-slate-200 text-slate-700" : "bg-[#0d111a] border border-[#1a2235] text-[#9ab0c8]"}`}>
                              …{s}…
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
