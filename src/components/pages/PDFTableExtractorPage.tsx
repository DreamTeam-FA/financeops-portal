import React, { useState, useCallback, useRef } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  ChevronLeft, Upload, FileText, Download, CheckCircle2,
  AlertTriangle, Loader2, Trash2, Table2, X, Search,
  FileSpreadsheet, RefreshCw, Eye, EyeOff, Pencil
} from "lucide-react";

/* ─────────────────────────────────────────────── Types */
interface ExtractedTable {
  id: string;
  sourceFile: string;
  title: string;
  headers: string[];
  rows: Record<string, string>[];
  pageRange: string;
}

interface ParsedPDF {
  id: string;
  name: string;
  size: number;
  tables: ExtractedTable[];
  error?: string;
}

/* ─────────────────────────────────────────────── Helpers */
const cl = (...classes: (string | undefined | false | null)[]) =>
  classes.filter(Boolean).join(" ");

function uid() {
  return Math.random().toString(36).slice(2);
}

function formatBytes(b: number) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ─────────────────────────────────────────────── PDF Extraction Engine */
async function extractTablesFromPDF(file: File): Promise<ExtractedTable[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).href;

  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  const rawPageTables: Array<{ page: number; headers: string[]; rows: Record<string, string>[] }> = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();
    const items = content.items as any[];

    if (!items.length) continue;

    // Convert PDF coords (bottom-left origin) to top-down
    const nodes = items
      .filter(it => it.str?.trim())
      .map(it => {
        const x = it.transform[4];
        const yBottom = it.transform[5];
        const fontSize = Math.abs(it.transform[0]) || Math.abs(it.transform[3]) || 10;
        const w = it.width || it.str.length * fontSize * 0.5;
        return { str: it.str.trim(), x, x2: x + w, y: viewport.height - yBottom, fs: fontSize };
      });

    if (!nodes.length) continue;

    // 1. Cluster into lines (Y-tolerance = 4px)
    nodes.sort((a, b) => a.y - b.y || a.x - b.x);
    const lineMap: Array<{ y: number; items: typeof nodes }> = [];
    for (const node of nodes) {
      const line = lineMap.find(l => Math.abs(l.y - node.y) <= 4);
      if (line) line.items.push(node);
      else lineMap.push({ y: node.y, items: [node] });
    }
    lineMap.sort((a, b) => a.y - b.y);
    lineMap.forEach(l => l.items.sort((a, b) => a.x - b.x));

    // 2. Merge items within a line into clusters (gap < 15px)
    const linesClustered = lineMap.map(line => {
      const clusters: Array<{ x: number; x2: number; text: string }> = [];
      let cur: typeof clusters[0] | null = null;
      for (const it of line.items) {
        if (!cur) { cur = { x: it.x, x2: it.x2, text: it.str }; }
        else if (it.x - cur.x2 < 15) { cur.text += " " + it.str; cur.x2 = Math.max(cur.x2, it.x2); }
        else { clusters.push(cur); cur = { x: it.x, x2: it.x2, text: it.str }; }
      }
      if (cur) clusters.push(cur);
      return { y: line.y, clusters };
    });

    // Only lines with ≥2 clusters are candidates for table rows
    const multiCol = linesClustered.filter(l => l.clusters.length >= 2);
    if (multiCol.length < 2) continue;

    // 3. Column projection histogram
    const pw = Math.ceil(viewport.width);
    const density = new Float32Array(pw);
    for (const l of multiCol) {
      for (const c of l.clusters) {
        const s = Math.max(0, Math.floor(c.x));
        const e = Math.min(pw - 1, Math.ceil(c.x2));
        for (let i = s; i <= e; i++) density[i] += 1;
      }
    }

    // Find column intervals from density gaps
    const colIntervals: Array<{ start: number; end: number }> = [];
    let inCol = false, startX = 0;
    const MIN_GAP = 12;
    for (let x = 0; x < pw; x++) {
      if (density[x] > 0) {
        if (!inCol) { inCol = true; startX = x; }
      } else if (inCol) {
        let gap = 0;
        while (x + gap < pw && density[x + gap] === 0) gap++;
        if (gap >= MIN_GAP || x + gap >= pw) {
          inCol = false;
          colIntervals.push({ start: startX, end: x - 1 });
          x += gap - 1;
        }
      }
    }
    if (inCol) colIntervals.push({ start: startX, end: pw - 1 });
    if (colIntervals.length < 2) continue;

    // 4. Assign clusters to columns
    const mappedRows: Array<{ y: number; cells: string[]; count: number }> = [];
    for (const line of linesClustered) {
      const cells = new Array<string>(colIntervals.length).fill("");
      let count = 0;
      for (const c of line.clusters) {
        const mid = (c.x + c.x2) / 2;
        let best = -1, bestDist = Infinity;
        colIntervals.forEach((iv, idx) => {
          const d = mid >= iv.start && mid <= iv.end
            ? 0
            : Math.min(Math.abs(mid - iv.start), Math.abs(mid - iv.end));
          if (d < bestDist) { bestDist = d; best = idx; }
        });
        if (best !== -1) {
          cells[best] = cells[best] ? cells[best] + " " + c.text : c.text;
          count++;
        }
      }
      if (count > 0) mappedRows.push({ y: line.y, cells, count });
    }

    if (mappedRows.length < 2) continue;

    // 5. Detect header row and build table
    let hdrIdx = mappedRows.findIndex(r => r.count >= 2);
    if (hdrIdx === -1) hdrIdx = 0;

    const rawHeaders = mappedRows[hdrIdx].cells.map((h, i) => h.trim() || `Col ${i + 1}`);

    // Deduplicate header names
    const seen: Record<string, number> = {};
    const headers = rawHeaders.map(h => {
      const k = h.trim();
      if (seen[k]) { seen[k]++; return `${k}_${seen[k]}`; }
      seen[k] = 1; return k;
    });

    const dataRowsRaw = mappedRows.slice(hdrIdx + 1);
    const rows: Record<string, string>[] = [];
    let lastRow: Record<string, string> | null = null;

    for (const r of dataRowsRaw) {
      const populated = r.cells.map((c, i) => c ? i : -1).filter(i => i !== -1);
      if (lastRow && populated.length === 1 && populated[0] === 0 && r.cells[0]) {
        // continuation of first column
        lastRow[headers[0]] = (lastRow[headers[0]] || "") + "\n" + r.cells[0];
      } else if (r.count >= 1) {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = r.cells[i]?.trim() || ""; });
        rows.push(obj);
        lastRow = obj;
      }
    }

    if (rows.length > 0) {
      rawPageTables.push({ page: p, headers, rows });
    }
  }

  if (rawPageTables.length === 0) return [];

  // 6. Merge consecutive pages with same column count
  const merged: Array<{ startPage: number; endPage: number; headers: string[]; rows: Record<string, string>[] }> = [];
  for (const t of rawPageTables) {
    if (!merged.length) {
      merged.push({ startPage: t.page, endPage: t.page, headers: t.headers, rows: [...t.rows] });
    } else {
      const prev = merged[merged.length - 1];
      if (Math.abs(prev.headers.length - t.headers.length) <= 1 && t.page <= prev.endPage + 1) {
        prev.rows.push(...t.rows);
        prev.endPage = t.page;
      } else {
        merged.push({ startPage: t.page, endPage: t.page, headers: t.headers, rows: [...t.rows] });
      }
    }
  }

  return merged.map(t => ({
    id: uid(),
    sourceFile: file.name,
    title: t.startPage === t.endPage ? `Table — Page ${t.startPage}` : `Table — Pages ${t.startPage}–${t.endPage}`,
    headers: t.headers,
    rows: t.rows,
    pageRange: t.startPage === t.endPage ? `p.${t.startPage}` : `p.${t.startPage}–${t.endPage}`,
  }));
}

/* ─────────────────────────────────────────────── CSV / XLSX helpers */
function toCSV(table: ExtractedTable): string {
  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    table.headers.map(escape).join(","),
    ...table.rows.map(r => table.headers.map(h => escape(r[h] ?? "")).join(",")),
  ];
  return "﻿" + lines.join("\n");
}

function downloadBlob(content: BlobPart, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toXLSX(table: ExtractedTable): Uint8Array {
  // Minimal XLSX writer (no dependency required)
  const rows = [table.headers, ...table.rows.map(r => table.headers.map(h => r[h] ?? ""))];

  const xmlSharedStrings: string[] = [];
  const ssMap = new Map<string, number>();
  const si = (s: string) => {
    if (!ssMap.has(s)) { ssMap.set(s, xmlSharedStrings.length); xmlSharedStrings.push(`<si><t>${escHtml(s)}</t></si>`); }
    return ssMap.get(s)!;
  };

  const toCol = (n: number) => {
    let s = ""; n++;
    while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };

  const sheetRows = rows.map((row, ri) =>
    `<row r="${ri + 1}">${row.map((cell, ci) => {
      const ref = `${toCol(ci)}${ri + 1}`;
      const idx = si(String(cell));
      return `<c r="${ref}" t="s"><v>${idx}</v></c>`;
    }).join("")}</row>`
  );

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${xmlSharedStrings.length}" uniqueCount="${xmlSharedStrings.length}">${xmlSharedStrings.join("")}</sst>`;
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.join("")}</sheetData></worksheet>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;

  // Build zip manually using a minimal implementation
  const enc = new TextEncoder();
  const parts: Array<{ name: string; data: Uint8Array }> = [
    { name: "[Content_Types].xml", data: enc.encode(contentTypesXml) },
    { name: "_rels/.rels", data: enc.encode(wbRelsXml) },
    { name: "xl/workbook.xml", data: enc.encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(relsXml) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXml) },
    { name: "xl/sharedStrings.xml", data: enc.encode(sharedStringsXml) },
  ];

  // Minimal ZIP writer (store-only, no compression)
  const crc32Table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  const crc32 = (buf: Uint8Array) => {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = crc32Table[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const u16le = (v: number) => [(v & 0xFF), (v >> 8) & 0xFF];
  const u32le = (v: number) => [(v & 0xFF), (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF];

  const central: number[] = [];
  const local: number[] = [];
  const nameEnc = new TextEncoder();

  for (const part of parts) {
    const nameBuf = nameEnc.encode(part.name);
    const crc = crc32(part.data);
    const offset = local.length;
    // Local file header
    local.push(0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      ...u32le(crc), ...u32le(part.data.length), ...u32le(part.data.length),
      ...u16le(nameBuf.length), 0x00, 0x00,
      ...nameBuf, ...part.data);
    // Central dir entry
    central.push(0x50, 0x4B, 0x01, 0x02, 0x3F, 0x00, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      ...u32le(crc), ...u32le(part.data.length), ...u32le(part.data.length),
      ...u16le(nameBuf.length), 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      ...u32le(offset), ...nameBuf);
  }

  const cdOffset = local.length;
  const cdSize = central.length;
  const eocd = [0x50, 0x4B, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
    ...u16le(parts.length), ...u16le(parts.length),
    ...u32le(cdSize), ...u32le(cdOffset), 0x00, 0x00];

  return new Uint8Array([...local, ...central, ...eocd]);
}

/* ─────────────────────────────────────────────── Component */
export const PDFTableExtractorPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { theme, showToast } = useFinance() as any;
  const isLight = theme === "light";
  const inputRef = useRef<HTMLInputElement>(null);

  const [pdfs, setPdfs] = useState<ParsedPDF[]>([]);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [editingCell, setEditingCell] = useState<{ tableId: string; row: number; col: string } | null>(null);
  const [search, setSearch] = useState("");
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [exportFmt, setExportFmt] = useState<"csv" | "xlsx">("csv");

  // Theme tokens
  const bg    = isLight ? "bg-slate-100 text-slate-900" : "bg-[#07090f] text-white";
  const card  = isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]";
  const surf  = isLight ? "bg-slate-50 border-slate-200" : "bg-[#0a0d15] border-[#141b28]";
  const text  = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-[#7a8394]";
  const bdr   = isLight ? "border-slate-200" : "border-[#1a2235]";

  const allTables = pdfs.flatMap(p => p.tables);
  const totalRows = allTables.reduce((s, t) => s + t.rows.length, 0);

  /* ── File processing ── */
  const processFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (!pdfs.length) { showToast("Please drop PDF files only", "error"); return; }

    setProcessing(true);
    const results: ParsedPDF[] = [];

    for (const file of pdfs) {
      showToast(`Scanning ${file.name}…`, "info", 2500);
      try {
        const tables = await extractTablesFromPDF(file);
        results.push({ id: uid(), name: file.name, size: file.size, tables, error: tables.length === 0 ? "No tables detected" : undefined });
      } catch (e: any) {
        results.push({ id: uid(), name: file.name, size: file.size, tables: [], error: e?.message || "Failed to parse PDF" });
        showToast(`Failed: ${file.name}`, "error");
      }
    }

    setPdfs(prev => {
      const next = [...prev, ...results];
      const found = results.reduce((s, p) => s + p.tables.length, 0);
      if (found > 0) {
        showToast(`Extracted ${found} table${found !== 1 ? "s" : ""} from ${results.length} file${results.length !== 1 ? "s" : ""}`, "success");
        if (!expandedTable && results[0]?.tables[0]) setExpandedTable(results[0].tables[0].id);
      } else {
        showToast("No structured tables found in the PDF(s)", "error");
      }
      return next;
    });

    setProcessing(false);
  }, [showToast, expandedTable]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) { processFiles(Array.from(e.target.files)); e.target.value = ""; }
  }, [processFiles]);

  /* ── Export ── */
  const downloadTable = (table: ExtractedTable, fmt: "csv" | "xlsx") => {
    const safeName = table.title.replace(/[^a-z0-9_-]/gi, "_");
    if (fmt === "csv") {
      downloadBlob(toCSV(table), "text/csv;charset=utf-8;", `${safeName}.csv`);
      showToast(`Downloaded ${table.title} as CSV`, "success");
    } else {
      downloadBlob(toXLSX(table), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${safeName}.xlsx`);
      showToast(`Downloaded ${table.title} as XLSX`, "success");
    }
  };

  const downloadAll = () => {
    if (!allTables.length) return;
    allTables.forEach((t, i) => {
      setTimeout(() => downloadTable(t, exportFmt), i * 250);
    });
    showToast(`Downloading ${allTables.length} table${allTables.length !== 1 ? "s" : ""} as ${exportFmt.toUpperCase()}`, "success");
  };

  /* ── Cell editing ── */
  const updateCell = (tableId: string, rowIdx: number, col: string, val: string) => {
    setPdfs(prev => prev.map(pdf => ({
      ...pdf,
      tables: pdf.tables.map(t => {
        if (t.id !== tableId) return t;
        const rows = t.rows.map((r, i) => i === rowIdx ? { ...r, [col]: val } : r);
        return { ...t, rows };
      }),
    })));
  };

  /* ── Search filter ── */
  const filteredTables = search.trim()
    ? allTables.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.sourceFile.toLowerCase().includes(search.toLowerCase()) ||
        t.headers.some(h => h.toLowerCase().includes(search.toLowerCase())) ||
        t.rows.some(r => Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase())))
      )
    : allTables;

  const hasResults = allTables.length > 0;

  return (
    <div className={cl("flex flex-col h-full overflow-hidden", bg)}>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#070b12] via-violet-950/40 to-[#070b12] border-b border-white/8 px-6 py-4 flex items-center gap-4 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#7a8394] hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="h-5 w-px bg-white/10" />
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-violet-500/30">
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">PDF Table Extractor</h1>
            <p className="text-[#7a8394] text-xs">Upload PDF · Auto-detect tables · Edit · Export CSV / XLSX</p>
          </div>
        </div>

        {/* Toolbar */}
        {hasResults && (
          <div className="ml-auto flex items-center gap-2.5">
            {/* Search */}
            <div className={cl("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm", isLight ? "bg-white border-slate-200" : "bg-white/5 border-white/10")}>
              <Search className="w-3.5 h-3.5 text-[#7a8394]" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search tables…"
                className="bg-transparent outline-none text-xs w-36 placeholder:text-[#7a8394]"
              />
              {search && <button onClick={() => setSearch("")}><X className="w-3 h-3 text-[#7a8394] hover:text-white" /></button>}
            </div>

            {/* Format picker */}
            <div className={cl("flex rounded-lg border overflow-hidden text-xs font-semibold", isLight ? "border-slate-200" : "border-white/10")}>
              {(["csv", "xlsx"] as const).map(fmt => (
                <button key={fmt} onClick={() => setExportFmt(fmt)}
                  className={cl("px-3 py-1.5 uppercase transition-colors",
                    exportFmt === fmt
                      ? "bg-violet-600 text-white"
                      : isLight ? "bg-white text-slate-500 hover:bg-slate-50" : "bg-white/4 text-[#7a8394] hover:bg-white/8"
                  )}>
                  {fmt}
                </button>
              ))}
            </div>

            <span className={cl("text-xs", muted)}>
              {allTables.length} table{allTables.length !== 1 ? "s" : ""} · {totalRows} rows
            </span>

            <button onClick={downloadAll}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold hover:opacity-90 active:scale-[.98] transition-all shadow-lg shadow-violet-500/25">
              <Download className="w-4 h-4" />
              Export All {exportFmt.toUpperCase()}
            </button>
          </div>
        )}
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Stats strip */}
        {hasResults && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "PDF Files",    val: pdfs.length.toString(),                     grad: "from-violet-500/15 to-indigo-500/15", bdr: "border-violet-500/20", ic: "bg-gradient-to-br from-violet-500 to-indigo-600",  sh: "shadow-violet-500/10", icon: <FileText className="w-4 h-4" /> },
              { label: "Tables Found", val: allTables.length.toString(),                  grad: "from-blue-500/15 to-cyan-500/15",     bdr: "border-blue-500/20",   ic: "bg-gradient-to-br from-blue-500 to-cyan-600",    sh: "shadow-blue-500/10",   icon: <Table2 className="w-4 h-4" /> },
              { label: "Total Rows",   val: totalRows.toLocaleString(),                   grad: "from-emerald-500/15 to-teal-500/15",  bdr: "border-emerald-500/20",ic: "bg-gradient-to-br from-emerald-500 to-teal-600", sh: "shadow-emerald-500/10",icon: <CheckCircle2 className="w-4 h-4" /> },
            ].map(s => (
              <div key={s.label} className={cl("rounded-xl border p-4 bg-gradient-to-br shadow-lg", s.grad, s.bdr, s.sh)}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={cl("w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-md shrink-0", s.ic)}>{s.icon}</div>
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
              ? "border-violet-400 bg-violet-500/8 scale-[1.01]"
              : isLight ? "border-slate-300 hover:border-violet-400 bg-white" : "border-white/12 hover:border-violet-500/50 bg-white/2"
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="py-8 flex flex-col items-center gap-3">
            {processing ? (
              <>
                <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
                <p className={cl("text-sm font-semibold", muted)}>Extracting tables — please wait…</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/25 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-violet-400" />
                </div>
                <div className="text-center">
                  <p className={cl("text-sm font-semibold", text)}>
                    {hasResults ? "Drop more PDFs to add more tables" : "Drop PDF files here to extract tables"}
                  </p>
                  <p className={cl("text-xs mt-1", muted)}>Multiple files supported · Click to browse</p>
                </div>
                <div className={cl("flex items-center gap-2 text-[11px] px-3 py-1 rounded-full border", isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-white/4 border-white/10 text-[#7a8394]")}>
                  Works offline · No data sent anywhere · 100% in-browser extraction
                </div>
              </>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={onInputChange} />
        </div>

        {/* File list */}
        {pdfs.length > 0 && (
          <div className={cl("rounded-2xl border overflow-hidden", card)}>
            <div className={cl("px-5 py-3 border-b flex items-center justify-between", bdr)}>
              <h3 className={cl("text-sm font-semibold", text)}>Processed Files</h3>
              <button onClick={() => { setPdfs([]); setExpandedTable(null); }}
                className={cl("text-xs flex items-center gap-1 hover:text-red-400 transition-colors", muted)}>
                <Trash2 className="w-3.5 h-3.5" /> Clear all
              </button>
            </div>
            <div className={cl("divide-y", isLight ? "divide-slate-100" : "divide-white/5")}>
              {pdfs.map(pdf => (
                <div key={pdf.id} className={cl("px-5 py-3 flex items-center gap-4", isLight ? "hover:bg-slate-50" : "hover:bg-white/3")}>
                  <div className={cl("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                    pdf.error
                      ? "bg-red-500/10 border border-red-500/20"
                      : "bg-gradient-to-br from-violet-500/15 to-indigo-500/15 border border-violet-500/20")}>
                    {pdf.error
                      ? <AlertTriangle className="w-4 h-4 text-red-400" />
                      : <FileText className="w-4 h-4 text-violet-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cl("text-sm font-medium truncate", text)}>{pdf.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cl("text-xs", muted)}>{formatBytes(pdf.size)}</span>
                      {pdf.error
                        ? <span className="text-xs text-red-400">⚠ {pdf.error}</span>
                        : <span className="text-xs text-violet-400 font-semibold">{pdf.tables.length} table{pdf.tables.length !== 1 ? "s" : ""}</span>
                      }
                    </div>
                  </div>
                  <button onClick={() => setPdfs(prev => prev.filter(p => p.id !== pdf.id))}
                    className={cl("p-1.5 rounded-lg transition-colors hover:text-red-400 hover:bg-red-500/10", muted)}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasResults && !processing && (
          <div className={cl("rounded-2xl border p-8 text-center", card)}>
            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
              <Table2 className="w-7 h-7 text-violet-400" />
            </div>
            <h3 className={cl("text-sm font-semibold mb-1.5", text)}>No tables extracted yet</h3>
            <p className={cl("text-xs max-w-xs mx-auto", muted)}>
              Upload a PDF with structured tables above. The engine detects columns automatically using spatial layout analysis.
            </p>
          </div>
        )}

        {/* Table results */}
        {filteredTables.length > 0 && filteredTables.map(table => {
          const isExpanded = expandedTable === table.id;
          return (
            <div key={table.id} className={cl("rounded-2xl border overflow-hidden", card)}>
              {/* Table header */}
              <div className={cl("px-5 py-3.5 flex items-center gap-3 border-b cursor-pointer select-none", bdr, isLight ? "hover:bg-slate-50" : "hover:bg-white/3")}
                onClick={() => setExpandedTable(isExpanded ? null : table.id)}>
                <div className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/20">
                  {table.pageRange}
                </div>
                <span className={cl("text-sm font-semibold flex-1", text)}>{table.title}</span>
                <span className={cl("text-xs", muted)}>{table.rows.length} rows · {table.headers.length} cols</span>
                <div className="flex items-center gap-2 ml-2">
                  <button onClick={e => { e.stopPropagation(); downloadTable(table, exportFmt); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/20 hover:bg-violet-500/25 transition-colors">
                    <Download className="w-3.5 h-3.5" /> {exportFmt.toUpperCase()}
                  </button>
                  <span className={cl("text-xs transition-transform duration-200", isExpanded ? "rotate-90" : "", muted)}>▶</span>
                </div>
              </div>

              {/* Source file label */}
              <div className={cl("px-5 py-1.5 border-b flex items-center gap-2", bdr, isLight ? "bg-slate-50" : "bg-white/2")}>
                <FileText className="w-3 h-3 text-[#7a8394]" />
                <span className={cl("text-[11px] truncate", muted)}>{table.sourceFile}</span>
                <span className={cl("text-[11px] ml-auto italic", muted)}>Click any cell to edit before export</span>
              </div>

              {/* Table body (collapsible) */}
              {isExpanded && (
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <table className="w-full border-collapse text-xs text-left">
                    <thead>
                      <tr className={cl("border-b sticky top-0 z-10", isLight ? "bg-slate-100 border-slate-200 text-slate-600" : "bg-[#0a0d15] border-[#1a2235] text-[#7a8394]")}>
                        <th className={cl("px-3 py-2 w-8 text-center font-normal", muted)}>#</th>
                        {table.headers.map(h => (
                          <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className={cl("divide-y", isLight ? "divide-slate-100" : "divide-[#1a2235]")}>
                      {table.rows.map((row, ri) => (
                        <tr key={ri} className={cl("transition-colors", isLight ? "hover:bg-violet-50/40" : "hover:bg-violet-500/5")}>
                          <td className={cl("px-3 py-2 text-center text-[10px] w-8", muted)}>{ri + 1}</td>
                          {table.headers.map(col => {
                            const isEditing = editingCell?.tableId === table.id && editingCell.row === ri && editingCell.col === col;
                            return (
                              <td key={col}
                                className={cl("px-3 py-2 whitespace-pre-wrap min-w-[80px] max-w-[300px] cursor-pointer",
                                  isEditing ? (isLight ? "bg-violet-50 outline outline-2 outline-violet-400 rounded" : "bg-violet-500/10 outline outline-2 outline-violet-500 rounded") : "",
                                  text
                                )}
                                onClick={() => setEditingCell({ tableId: table.id, row: ri, col })}
                              >
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    defaultValue={row[col] ?? ""}
                                    onBlur={e => { updateCell(table.id, ri, col, e.target.value); setEditingCell(null); }}
                                    onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") { updateCell(table.id, ri, col, (e.target as HTMLInputElement).value); setEditingCell(null); } }}
                                    className="bg-transparent outline-none w-full text-xs"
                                  />
                                ) : row[col] ?? ""}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!isExpanded && (
                <div className={cl("px-5 py-2 text-xs", muted)}>
                  Click header to preview and edit table data
                </div>
              )}
            </div>
          );
        })}

        {/* No search results */}
        {hasResults && filteredTables.length === 0 && search && (
          <div className={cl("rounded-2xl border p-6 text-center", card)}>
            <Search className="w-8 h-8 mx-auto mb-3 text-[#7a8394]" />
            <p className={cl("text-sm font-semibold mb-1", text)}>No tables match "{search}"</p>
            <button onClick={() => setSearch("")} className="text-xs text-violet-400 hover:underline">Clear search</button>
          </div>
        )}
      </div>
    </div>
  );
};
