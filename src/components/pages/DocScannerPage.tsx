/**
 * DocScannerPage — mirrors Fin_Doc_scanner.py exactly.
 *
 * Flow:
 *   1. Enter/load saved keywords (whole-word toggle)
 *   2. Pick a local folder (browser folder picker) — includes subfolders option
 *   3. Scans every supported file's CONTENTS for the keywords
 *   4. Split results: file list left (hits first), detail panel right
 *   5. Export as text report
 *
 * Supported: PDF · DOCX · XLSX · TXT/CSV/MD/LOG · Images (OCR)
 * All processing is 100% in-browser; keywords saved to localStorage.
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  Search, FileText, Loader2, CheckCircle2, AlertCircle,
  ChevronLeft, Download, FileSearch, FolderOpen, X,
  ToggleLeft, ToggleRight, ChevronRight, ChevronDown
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";
import mammoth from "mammoth";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

/* ── Constants ──────────────────────────────────────────────────────── */
const LS_KEYWORDS_KEY = "docscanner_keywords";
const CONTEXT_CHARS   = 80;
const MAX_MATCHES_PER_FILE = 20;
const SUPPORTED_EXTS  = new Set([
  "pdf", "docx", "xlsx", "xls",
  "txt", "csv", "md", "log",
  "png", "jpg", "jpeg", "tif", "tiff", "bmp",
]);

/* ── Types ─────────────────────────────────────────────────────────── */
interface MatchHit {
  keyword: string;
  context: string;
}

interface FileResult {
  id: string;
  name: string;
  relativePath: string;
  status: "pending" | "scanning" | "done" | "error";
  matches: MatchHit[];
  error?: string;
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
    const text = pages.join("\n");
    // If PDF had no text layer, fall back to OCR
    if (text.trim().length < 50) {
      try {
        const { data } = await Tesseract.recognize(file, "eng", { logger: () => {} });
        return data.text;
      } catch { return text; }
    }
    return text;
  }

  if (ext === "docx") {
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value;
  }

  if (["xlsx", "xls"].includes(ext)) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    return wb.SheetNames.map((n) =>
      XLSX.utils.sheet_to_csv(wb.Sheets[n])
    ).join("\n");
  }

  if (["png", "jpg", "jpeg", "tif", "tiff", "bmp"].includes(ext)) {
    const { data } = await Tesseract.recognize(file, "eng", { logger: () => {} });
    return data.text;
  }

  // txt / csv / md / log and fallback
  try { return await file.text(); } catch { return ""; }
}

/* ── Search ─────────────────────────────────────────────────────────── */
function searchText(text: string, keywords: string[], wholeWord: boolean): MatchHit[] {
  const hits: MatchHit[] = [];
  const lower = text.toLowerCase();

  for (const kw of keywords) {
    if (!kw.trim()) continue;
    const pattern = wholeWord
      ? new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")
      : new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      if (hits.length >= MAX_MATCHES_PER_FILE) break;
      const s = Math.max(0, m.index - CONTEXT_CHARS);
      const e = Math.min(text.length, m.index + kw.length + CONTEXT_CHARS);
      let snippet = text.slice(s, e).replace(/\s+/g, " ").trim();
      if (s > 0) snippet = "…" + snippet;
      if (e < text.length) snippet = snippet + "…";
      hits.push({ keyword: kw, context: snippet });
    }
    if (hits.length >= MAX_MATCHES_PER_FILE) break;
  }
  return hits;
}

/* ── Export ─────────────────────────────────────────────────────────── */
function exportReport(results: FileResult[], keywords: string[], folderName: string) {
  const lines: string[] = [
    "KEYWORD SCAN REPORT",
    `Generated : ${new Date().toLocaleString()}`,
    `Folder    : ${folderName}`,
    `Keywords  : ${keywords.join(", ")}`,
    "=".repeat(80),
    "",
  ];

  const sorted = [...results].sort((a, b) => b.matches.length - a.matches.length);
  for (const r of sorted) {
    lines.push(`FILE: ${r.relativePath}`);
    lines.push("=".repeat(80));
    if (r.error) {
      lines.push(`ERROR: ${r.error}`);
    } else if (!r.matches.length) {
      lines.push("No matches found.");
    } else {
      const byKw: Record<string, MatchHit[]> = {};
      for (const h of r.matches) {
        (byKw[h.keyword] = byKw[h.keyword] || []).push(h);
      }
      for (const [kw, hits] of Object.entries(byKw)) {
        lines.push(`\nKeyword: "${kw}"  (${hits.length} match(es))`);
        lines.push("-".repeat(60));
        for (const h of hits) lines.push(`  ${h.context}`);
      }
    }
    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `keyword_scan_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Component ──────────────────────────────────────────────────────── */
export const DocScannerPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { theme } = useFinance() as any;
  const isLight = theme === "light";
  const folderRef = useRef<HTMLInputElement>(null);

  // Keywords (persisted)
  const [keywordsText, setKeywordsText] = useState<string>(() => {
    try { return localStorage.getItem(LS_KEYWORDS_KEY) ?? ""; } catch { return ""; }
  });
  const [wholeWord, setWholeWord] = useState(false);
  const [recursive, setRecursive] = useState(true);

  // Files from selected folder
  const [allFiles, setAllFiles]   = useState<File[]>([]);
  const [folderName, setFolderName] = useState("");

  // Scan state
  const [results, setResults]     = useState<FileResult[]>([]);
  const [scanning, setScanning]   = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Persist keywords
  useEffect(() => {
    try { localStorage.setItem(LS_KEYWORDS_KEY, keywordsText); } catch {}
  }, [keywordsText]);

  const keywords = keywordsText
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  /* Folder picker */
  const onFolderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;

    // Determine folder name from first file's webkitRelativePath
    const firstPath = (files[0] as any).webkitRelativePath as string;
    const name = firstPath ? firstPath.split("/")[0] : "Selected folder";
    setFolderName(name);

    // Filter to supported extensions; optionally filter out subfolders
    const filtered = Array.from(files).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (!SUPPORTED_EXTS.has(ext)) return false;
      if (!recursive) {
        const rel = (f as any).webkitRelativePath as string;
        // top-level only: rel = "folder/file.pdf" (one slash)
        return rel.split("/").length === 2;
      }
      return true;
    });

    setAllFiles(filtered);
    setResults([]);
    setSelectedId(null);
    // Reset input so same folder can be re-picked
    if (folderRef.current) folderRef.current.value = "";
  }, [recursive]);

  const clearFolder = () => {
    setAllFiles([]);
    setFolderName("");
    setResults([]);
    setSelectedId(null);
  };

  /* Scan */
  const runScan = async () => {
    if (!allFiles.length || !keywords.length) return;
    setScanning(true);
    setSelectedId(null);

    const initial: FileResult[] = allFiles.map((f, i) => ({
      id: `${i}`,
      name: f.name,
      relativePath: (f as any).webkitRelativePath || f.name,
      status: "pending",
      matches: [],
    }));
    setResults(initial);

    const updated = [...initial];
    for (let i = 0; i < allFiles.length; i++) {
      updated[i] = { ...updated[i], status: "scanning" };
      setResults([...updated]);
      try {
        const text = await extractText(allFiles[i]);
        const matches = searchText(text, keywords, wholeWord);
        updated[i] = { ...updated[i], status: "done", matches };
      } catch (err: any) {
        updated[i] = { ...updated[i], status: "error", error: err.message ?? "Unknown error" };
      }
      setResults([...updated]);
    }
    setScanning(false);
  };

  /* Derived */
  const hasResults   = results.some((r) => r.status === "done" || r.status === "error");
  const doneCount    = results.filter((r) => r.status === "done" || r.status === "error").length;
  const hitsFirst    = [...results].sort((a, b) => b.matches.length - a.matches.length);
  const selectedResult = results.find((r) => r.id === selectedId) ?? null;

  /* ── Styles ── */
  const bg    = isLight ? "bg-white"           : "bg-[#0a0f1c]";
  const bdr   = isLight ? "border-slate-200"   : "border-[#1a2235]";
  const txt   = isLight ? "text-slate-800"     : "text-[#c8d4e8]";
  const muted = isLight ? "text-slate-500"     : "text-[#5a7090]";
  const panel = isLight ? "bg-white border-slate-200"     : "bg-[#0d111a] border-[#1a2235]";
  const rowHover = isLight ? "hover:bg-slate-50" : "hover:bg-[#0a0e1a]";
  const inp   = isLight
    ? "bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500 placeholder-slate-400"
    : "bg-[#0a0e1a] border-[#1e2c42] text-white focus:border-[#1a73e8] placeholder-[#3d5478]";

  return (
    <div className={`flex flex-col h-full overflow-hidden ${bg} ${txt}`}>

      {/* ── Header ── */}
      <div className={`border-b px-5 py-3.5 flex items-center gap-3 shrink-0 ${isLight ? "bg-white border-slate-200" : "bg-[#070b12] border-[#1a2235]"}`}>
        {onBack && (
          <>
            <button onClick={onBack} className={`flex items-center gap-1 text-xs transition-colors ${isLight ? "text-slate-500 hover:text-slate-800" : "text-[#5a7090] hover:text-white"}`}>
              <ChevronLeft className="w-4 h-4" />Back
            </button>
            <div className={`h-4 w-px ${bdr}`} />
          </>
        )}
        <FileSearch className="w-4 h-4 text-sky-400 shrink-0" />
        <div>
          <div className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>Doc Scanner</div>
          <div className={`text-[11px] ${muted}`}>Search keywords across all documents in a folder — PDF · DOCX · XLSX · Images · TXT</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

        {/* ── Left panel: setup + results list ── */}
        <div className={`flex flex-col w-full md:w-72 md:shrink-0 border-b md:border-b-0 md:border-r overflow-y-auto ${bdr} ${isLight ? "bg-slate-50" : "bg-[#080c14]"}`}>

          {/* Keywords */}
          <div className={`p-3 border-b ${bdr}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Keywords</span>
              <span className={`text-[10px] ${muted}`}>saved automatically</span>
            </div>
            <textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder={"refund\noverdue\nAmazon\nstatement date"}
              rows={5}
              className={`w-full border rounded-lg px-2.5 py-2 text-[11px] font-mono resize-none focus:outline-none ${inp}`}
            />
            {/* Options */}
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => setWholeWord((v) => !v)}
                className={`flex items-center gap-1.5 text-[10px] font-medium transition-colors ${wholeWord ? "text-sky-400" : muted}`}
                title="Match whole words only (e.g. 'tax' won't match 'taxation')"
              >
                {wholeWord ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                Whole word
              </button>
              <button
                onClick={() => setRecursive((v) => !v)}
                className={`flex items-center gap-1.5 text-[10px] font-medium transition-colors ${recursive ? "text-sky-400" : muted}`}
                title="Include files in subfolders"
              >
                {recursive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                Subfolders
              </button>
            </div>
          </div>

          {/* Folder picker */}
          <div className={`p-3 border-b ${bdr}`}>
            <span className={`block text-[10px] font-bold uppercase tracking-wider mb-2 ${muted}`}>Folder to scan</span>
            <input
              ref={folderRef}
              type="file"
              className="hidden"
              // @ts-ignore — webkitdirectory is non-standard but widely supported
              webkitdirectory=""
              multiple
              onChange={onFolderChange}
            />

            {folderName ? (
              <div className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs ${panel}`}>
                <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className={`flex-1 truncate font-mono ${txt}`}>{folderName}</span>
                <span className={`text-[10px] shrink-0 ${muted}`}>{allFiles.length} file{allFiles.length !== 1 ? "s" : ""}</span>
                <button onClick={clearFolder} className={`shrink-0 p-0.5 rounded hover:text-red-400 ${muted}`}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => folderRef.current?.click()}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed text-xs font-medium transition-colors ${
                  isLight ? "border-slate-300 text-slate-500 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50" : "border-[#1a2235] text-[#4a6080] hover:border-sky-600/50 hover:text-sky-400"
                }`}
              >
                <FolderOpen className="w-4 h-4" />
                Choose folder…
              </button>
            )}
          </div>

          {/* Scan button */}
          <div className="p-3">
            <button
              onClick={runScan}
              disabled={scanning || !allFiles.length || !keywords.length}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors"
            >
              {scanning
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{doneCount}/{allFiles.length} scanned…</>
                : <><Search className="w-3.5 h-3.5" />Scan Documents</>
              }
            </button>
          </div>

          {/* Results file list */}
          {hitsFirst.length > 0 && (
            <div className={`md:flex-1 border-t overflow-y-auto max-h-64 md:max-h-none ${bdr}`}>
              <div className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                Results — {hitsFirst.filter(r => r.matches.length > 0).length} of {hitsFirst.filter(r => r.status === "done").length} files matched
              </div>
              {hitsFirst.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors border-b ${bdr} ${rowHover} ${
                    selectedId === r.id
                      ? isLight ? "bg-sky-50 border-l-2 border-l-sky-400" : "bg-sky-950/20 border-l-2 border-l-sky-500"
                      : ""
                  }`}
                >
                  {/* Status icon */}
                  {r.status === "scanning" && <Loader2 className="w-3 h-3 text-sky-400 animate-spin shrink-0" />}
                  {r.status === "done" && r.matches.length > 0 && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                  {r.status === "done" && r.matches.length === 0 && <CheckCircle2 className="w-3 h-3 text-slate-400 shrink-0" />}
                  {r.status === "error" && <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />}
                  {r.status === "pending" && <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${bdr}`} />}

                  <span className={`flex-1 truncate font-mono text-[11px] ${r.matches.length > 0 ? (isLight ? "text-slate-800" : "text-white") : muted}`}>
                    {r.name}
                  </span>

                  {r.status === "done" && (
                    <span className={`shrink-0 text-[10px] font-bold ${r.matches.length > 0 ? "text-emerald-500" : muted}`}>
                      {r.matches.length > 0 ? r.matches.length : "—"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right panel: detail view (hidden on mobile when empty) ── */}
        <div className={`flex-1 flex flex-col overflow-hidden ${bg} ${!selectedResult && !hasResults ? "hidden md:flex" : ""}`}>
          {selectedResult ? (
            <>
              {/* Detail header */}
              <div className={`px-5 py-3 border-b flex items-center justify-between ${bdr}`}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedId(null)}
                    className={`md:hidden flex items-center gap-1 text-xs mr-1 ${muted} hover:text-sky-400`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <div>
                    <div className={`text-xs font-bold ${txt}`}>{selectedResult.name}</div>
                    <div className={`text-[11px] ${muted}`}>{selectedResult.relativePath}</div>
                  </div>
                </div>
                {selectedResult.matches.length > 0 && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isLight ? "bg-emerald-100 text-emerald-700" : "bg-emerald-950/40 text-emerald-400 border border-emerald-800/30"}`}>
                    {selectedResult.matches.length} match{selectedResult.matches.length !== 1 ? "es" : ""}
                  </span>
                )}
              </div>

              {/* Detail body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {selectedResult.error && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {selectedResult.error}
                  </div>
                )}

                {selectedResult.status === "done" && selectedResult.matches.length === 0 && !selectedResult.error && (
                  <p className={`text-sm ${muted}`}>No keyword matches found in this file.</p>
                )}

                {(() => {
                  const byKw: Record<string, MatchHit[]> = {};
                  for (const h of selectedResult.matches) {
                    (byKw[h.keyword] = byKw[h.keyword] || []).push(h);
                  }
                  return Object.entries(byKw).map(([kw, hits]) => (
                    <div key={kw}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${isLight ? "bg-sky-100 text-sky-700" : "bg-sky-950/40 text-sky-300 border border-sky-800/30"}`}>
                          {kw}
                        </span>
                        <span className={`text-[10px] ${muted}`}>{hits.length} occurrence{hits.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="space-y-1.5">
                        {hits.map((h, i) => (
                          <p key={i} className={`text-[11px] font-mono leading-relaxed px-3 py-1.5 rounded-lg ${isLight ? "bg-slate-50 border border-slate-200 text-slate-700" : "bg-[#0d111a] border border-[#1a2235] text-[#9ab0c8]"}`}>
                            {h.context}
                          </p>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
              {!hasResults ? (
                <>
                  <FileSearch className={`w-10 h-10 ${muted}`} />
                  <div className="text-center">
                    <p className={`text-sm font-medium ${txt}`}>Ready to scan</p>
                    <p className={`text-xs mt-1 ${muted}`}>
                      {!keywords.length
                        ? "Enter keywords on the left to get started"
                        : !folderName
                        ? "Choose a folder to scan"
                        : "Click Scan Documents to begin"}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className={`text-center px-4 py-3 rounded-xl border ${panel}`}>
                      <div className={`text-2xl font-black ${isLight ? "text-emerald-600" : "text-emerald-400"}`}>
                        {hitsFirst.filter(r => r.matches.length > 0).length}
                      </div>
                      <div className={`text-[10px] ${muted}`}>files matched</div>
                    </div>
                    <div className={`text-center px-4 py-3 rounded-xl border ${panel}`}>
                      <div className={`text-2xl font-black ${txt}`}>
                        {hitsFirst.filter(r => r.status === "done").length}
                      </div>
                      <div className={`text-[10px] ${muted}`}>files scanned</div>
                    </div>
                    <div className={`text-center px-4 py-3 rounded-xl border ${panel}`}>
                      <div className={`text-2xl font-black ${txt}`}>
                        {hitsFirst.reduce((s, r) => s + r.matches.length, 0)}
                      </div>
                      <div className={`text-[10px] ${muted}`}>total matches</div>
                    </div>
                  </div>
                  <p className={`text-xs ${muted}`}>Click a file on the left to see match details</p>
                  <button
                    onClick={() => exportReport(results, keywords, folderName)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      isLight ? "border-slate-300 text-slate-700 hover:bg-slate-50" : "border-[#1a2235] text-[#c8d4e8] hover:bg-[#0d111a]"
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export text report
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
