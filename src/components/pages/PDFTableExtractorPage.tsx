import React, { useState, useCallback, useRef } from "react";
import { useFinance } from "../../context/FinanceContext";
import { bumpGeminiCounter } from "../../utils/geminiCounter";
import {
  ChevronLeft, Upload, FileText, Download, CheckCircle2,
  AlertTriangle, Loader2, Trash2, Table2, X, Search,
  FileSpreadsheet, AlignLeft, Hash, Layers, Sparkles
} from "lucide-react";

/* ─────────────────────────────────────────────── Types */
type ExtractMode = "auto" | "tables" | "text" | "kv";

interface DataSection {
  id: string;
  sourceFile: string;
  title: string;
  type: "table" | "text" | "kv";
  headers: string[];
  rows: Record<string, string>[];
  pageRange: string;
}

interface ParsedPDF {
  id: string;
  name: string;
  size: number;
  sections: DataSection[];
  error?: string;
}

/* ─────────────────────────────────────────────── Helpers */
const cl = (...c: (string | undefined | false | null)[]) => c.filter(Boolean).join(" ");
function uid() { return Math.random().toString(36).slice(2); }
function formatBytes(b: number) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}
function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ─────────────────────────────────────────────── Scan via server (same pattern as ScanToFill) */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractFromServer(file: File, mode: ExtractMode): Promise<DataSection[]> {
  const base64 = await fileToBase64(file);
  const resp = await fetch("/api/pdf/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, mimeType: file.type || "application/pdf", mode }),
  });
  const text = await resp.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!resp.ok || !json || !json.ok) {
    throw new Error(json?.error || (resp.status === 413 ? "File too large (max 50MB)" : `Extraction failed (${resp.status})`));
  }
  bumpGeminiCounter("pdf");
  return (json.sections as any[]).map((s: any): DataSection => {
    const headers: string[] = Array.isArray(s.headers) ? s.headers.map(String) : ["Content"];
    const rows: Record<string, string>[] = Array.isArray(s.rows)
      ? s.rows.map((r: any) => {
          const obj: Record<string, string> = {};
          headers.forEach(h => { obj[h] = r[h] != null ? String(r[h]) : ""; });
          return obj;
        })
      : [];
    return {
      id: uid(),
      sourceFile: file.name,
      title: String(s.title || "Section"),
      type: (s.type === "kv" || s.type === "text") ? s.type : "table",
      headers,
      rows,
      pageRange: String(s.pageRange || "p.1"),
    };
  });
}

/* ─────────────────────────────────────────────── Export */
function toCSV(section: DataSection): string {
  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + [
    section.headers.map(escape).join(","),
    ...section.rows.map(r => section.headers.map(h => escape(r[h] ?? "")).join(",")),
  ].join("\n");
}

function downloadBlob(content: BlobPart, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function toXLSX(section: DataSection): Uint8Array {
  const rows = [section.headers, ...section.rows.map(r => section.headers.map(h => r[h] ?? ""))];
  const enc = new TextEncoder();
  const ssMap = new Map<string, number>(); const ssList: string[] = [];
  const si = (s: string) => { if (!ssMap.has(s)) { ssMap.set(s, ssList.length); ssList.push(`<si><t>${escHtml(s)}</t></si>`); } return ssMap.get(s)!; };
  const toCol = (n: number) => { let s = ""; n++; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; };
  const sheetRows = rows.map((row, ri) => `<row r="${ri + 1}">${row.map((cell, ci) => { const ref = `${toCol(ci)}${ri + 1}`; const idx = si(String(cell)); return `<c r="${ref}" t="s"><v>${idx}</v></c>`; }).join("")}</row>`);
  const ssXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${ssList.length}" uniqueCount="${ssList.length}">${ssList.join("")}</sst>`;
  const shXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.join("")}</sheetData></worksheet>`;
  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const wbRXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const ctXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
  const parts = [{ name: "[Content_Types].xml", data: enc.encode(ctXml) }, { name: "_rels/.rels", data: enc.encode(wbRXml) }, { name: "xl/workbook.xml", data: enc.encode(wbXml) }, { name: "xl/_rels/workbook.xml.rels", data: enc.encode(rXml) }, { name: "xl/worksheets/sheet1.xml", data: enc.encode(shXml) }, { name: "xl/sharedStrings.xml", data: enc.encode(ssXml) }];
  const ct = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; ct[i] = c; }
  const crc32 = (buf: Uint8Array) => { let c = 0xFFFFFFFF; for (const b of buf) c = ct[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const u16 = (v: number) => [(v & 0xFF), (v >> 8) & 0xFF]; const u32 = (v: number) => [(v & 0xFF), (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF];
  const central: number[] = [], local: number[] = [], ne = new TextEncoder();
  for (const pt of parts) { const nb = ne.encode(pt.name); const crc = crc32(pt.data); const off = local.length; local.push(0x50,0x4B,0x03,0x04,0x14,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,...u32(crc),...u32(pt.data.length),...u32(pt.data.length),...u16(nb.length),0x00,0x00,...nb,...pt.data); central.push(0x50,0x4B,0x01,0x02,0x3F,0x00,0x14,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,...u32(crc),...u32(pt.data.length),...u32(pt.data.length),...u16(nb.length),0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,...u32(off),...nb); }
  const cdOff = local.length, cdSz = central.length;
  const eocd = [0x50,0x4B,0x05,0x06,0x00,0x00,0x00,0x00,...u16(parts.length),...u16(parts.length),...u32(cdSz),...u32(cdOff),0x00,0x00];
  return new Uint8Array([...local, ...central, ...eocd]);
}

function toDocx(section: DataSection): Uint8Array {
  const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const cellXml = (text: string, bold?: boolean) => `<w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/></w:tcBorders>${bold ? '<w:shd w:val="clear" w:color="auto" w:fill="F3F0FF"/>' : ""}</w:tcPr><w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p></w:tc>`;
  const headerRow = `<w:tr><w:trPr><w:trHeight w:val="400"/></w:trPr>${section.headers.map(h => cellXml(h, true)).join("")}</w:tr>`;
  const dataRows = section.rows.map(row => `<w:tr>${section.headers.map(h => cellXml(row[h] ?? "")).join("")}</w:tr>`).join("");
  const tblXml = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${section.headers.map(() => "<w:gridCol/>").join("")}</w:tblGrid>${headerRow}${dataRows}</w:tbl>`;
  const titlePara = `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${esc(section.title)}</w:t></w:r></w:p>`;
  const sourcePara = `<w:p><w:r><w:rPr><w:color w:val="888888"/><w:sz w:val="18"/></w:rPr><w:t>Source: ${esc(section.sourceFile)} — ${esc(section.pageRange)} — ${section.rows.length} rows</w:t></w:r></w:p>`;
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${titlePara}${sourcePara}<w:p/>${tblXml}<w:p/><w:sectPr/></w:body></w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="5B21B6"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>`;
  const rXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const wbRXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const ctXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const enc = new TextEncoder();
  const parts = [{ name: "[Content_Types].xml", data: enc.encode(ctXml) }, { name: "_rels/.rels", data: enc.encode(wbRXml) }, { name: "word/document.xml", data: enc.encode(docXml) }, { name: "word/_rels/document.xml.rels", data: enc.encode(rXml) }, { name: "word/styles.xml", data: enc.encode(stylesXml) }];
  const ct = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; ct[i] = c; }
  const crc32 = (buf: Uint8Array) => { let c = 0xFFFFFFFF; for (const b of buf) c = ct[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const u16 = (v: number) => [(v & 0xFF), (v >> 8) & 0xFF]; const u32 = (v: number) => [(v & 0xFF), (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF];
  const central: number[] = [], local: number[] = [], ne2 = new TextEncoder();
  for (const pt of parts) { const nb = ne2.encode(pt.name); const crc = crc32(pt.data); const off = local.length; local.push(0x50,0x4B,0x03,0x04,0x14,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,...u32(crc),...u32(pt.data.length),...u32(pt.data.length),...u16(nb.length),0x00,0x00,...nb,...pt.data); central.push(0x50,0x4B,0x01,0x02,0x3F,0x00,0x14,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,...u32(crc),...u32(pt.data.length),...u32(pt.data.length),...u16(nb.length),0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,...u32(off),...nb); }
  const cdOff = local.length, cdSz = central.length;
  const eocd = [0x50,0x4B,0x05,0x06,0x00,0x00,0x00,0x00,...u16(parts.length),...u16(parts.length),...u32(cdSz),...u32(cdOff),0x00,0x00];
  return new Uint8Array([...local, ...central, ...eocd]);
}

/* ─────────────────────────────────────────────── Config */
const MODES: Array<{ key: ExtractMode; label: string; icon: React.ReactNode; desc: string }> = [
  { key: "auto",   label: "Smart Auto",  icon: <Sparkles className="w-4 h-4" />, desc: "Tables + metadata + text" },
  { key: "tables", label: "Tables Only", icon: <Table2 className="w-4 h-4" />,   desc: "Structured grids only" },
  { key: "kv",     label: "Key-Value",   icon: <Hash className="w-4 h-4" />,      desc: "Labels & values" },
  { key: "text",   label: "Full Text",   icon: <AlignLeft className="w-4 h-4" />, desc: "Every line as a row" },
];

const TYPE_BADGES: Record<DataSection["type"], { label: string; color: string }> = {
  table: { label: "Table",     color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  kv:    { label: "Key-Value", color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  text:  { label: "Text",      color: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
};

/* ─────────────────────────────────────────────── Component */
export const PDFTableExtractorPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { theme, showToast } = useFinance() as any;
  const isLight = theme === "light";
  const inputRef = useRef<HTMLInputElement>(null);

  const [pdfs, setPdfs] = useState<ParsedPDF[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processingFile, setProcessingFile] = useState("");
  const [dragging, setDragging] = useState(false);
  const [editingCell, setEditingCell] = useState<{ secId: string; row: number; col: string } | null>(null);
  const [search, setSearch] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [exportFmt, setExportFmt] = useState<"csv" | "xlsx" | "docx">("csv");
  const [mode, setMode] = useState<ExtractMode>("auto");

  const bg   = isLight ? "bg-slate-100 text-slate-900" : "bg-[#07090f] text-white";
  const card = isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]";
  const text = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-[#7a8394]";
  const bdr  = isLight ? "border-slate-200" : "border-[#1a2235]";

  const allSections = pdfs.flatMap(p => p.sections);
  const totalRows = allSections.reduce((s, t) => s + t.rows.length, 0);
  const hasResults = allSections.length > 0;

  const processFiles = useCallback(async (files: File[]) => {
    const pdfFiles = files.filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (!pdfFiles.length) { showToast("Please drop PDF files only", "error"); return; }
    setProcessing(true);
    const results: ParsedPDF[] = [];
    for (const file of pdfFiles) {
      setProcessingFile(file.name);
      try {
        const sections = await extractFromServer(file, mode);
        results.push({ id: uid(), name: file.name, size: file.size, sections, error: sections.length === 0 ? "No data found in PDF" : undefined });
      } catch (e: any) {
        results.push({ id: uid(), name: file.name, size: file.size, sections: [], error: e?.message || "Failed" });
        showToast(`Failed: ${file.name} — ${e?.message || "error"}`, "error");
      }
    }
    setPdfs(prev => {
      const firstSec = results.find(r => r.sections.length)?.sections[0];
      if (firstSec && !expandedSection) setExpandedSection(firstSec.id);
      return [...prev, ...results];
    });
    setProcessingFile("");
    setProcessing(false);
  }, [showToast, mode, expandedSection]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) { processFiles(Array.from(e.target.files)); e.target.value = ""; }
  }, [processFiles]);

  const downloadSection = (sec: DataSection, fmt: "csv" | "xlsx" | "docx") => {
    const safe = sec.title.replace(/[^a-z0-9_-]/gi, "_");
    if (fmt === "csv")  downloadBlob(toCSV(sec),  "text/csv;charset=utf-8;", `${safe}.csv`);
    else if (fmt === "xlsx") downloadBlob(toXLSX(sec), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${safe}.xlsx`);
    else downloadBlob(toDocx(sec), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", `${safe}.docx`);
    showToast(`Downloaded as ${fmt.toUpperCase()}`, "success");
  };

  const downloadAll = () => {
    if (!allSections.length) return;
    allSections.forEach((s, i) => setTimeout(() => downloadSection(s, exportFmt), i * 250));
    showToast(`Downloading ${allSections.length} section${allSections.length !== 1 ? "s" : ""} as ${exportFmt.toUpperCase()}`, "success");
  };

  const updateCell = (secId: string, rowIdx: number, col: string, val: string) => {
    setPdfs(prev => prev.map(pdf => ({
      ...pdf,
      sections: pdf.sections.map(s => s.id !== secId ? s : {
        ...s, rows: s.rows.map((r, i) => i === rowIdx ? { ...r, [col]: val } : r),
      }),
    })));
  };

  const filteredSections = search.trim()
    ? allSections.filter(s =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.sourceFile.toLowerCase().includes(search.toLowerCase()) ||
        s.headers.some(h => h.toLowerCase().includes(search.toLowerCase())) ||
        s.rows.some(r => Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase())))
      )
    : allSections;

  return (
    <div className={cl("flex flex-col h-full overflow-hidden", bg)}>

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-[#070b12] via-violet-950/40 to-[#070b12] border-b border-white/8 px-6 py-4 flex items-center gap-4 shrink-0 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#7a8394] hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="h-5 w-px bg-white/10" />
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-violet-500/30">
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight flex items-center gap-2">
              PDF Data Extractor
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500/25 to-indigo-500/20 border border-violet-500/30 text-violet-300">
                <Sparkles className="w-2.5 h-2.5" /> AI
              </span>
            </h1>
            <p className="text-[#7a8394] text-xs">Drop any PDF · Gemini reads it · Export CSV / XLSX / DOCX</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2.5 flex-wrap">
          {hasResults && (
            <>
              <div className={cl("flex items-center gap-2 px-3 py-1.5 rounded-lg border", isLight ? "bg-white border-slate-200" : "bg-white/5 border-white/10")}>
                <Search className="w-3.5 h-3.5 text-[#7a8394]" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sections…" className="bg-transparent outline-none text-xs w-32 placeholder:text-[#7a8394]" />
                {search && <button onClick={() => setSearch("")}><X className="w-3 h-3 text-[#7a8394] hover:text-white" /></button>}
              </div>
              <div className={cl("flex rounded-lg border overflow-hidden text-xs font-semibold", isLight ? "border-slate-200" : "border-white/10")}>
                {(["csv", "xlsx", "docx"] as const).map(fmt => (
                  <button key={fmt} onClick={() => setExportFmt(fmt)}
                    className={cl("px-3 py-1.5 uppercase transition-colors", exportFmt === fmt ? "bg-violet-600 text-white" : isLight ? "bg-white text-slate-500 hover:bg-slate-50" : "bg-white/4 text-[#7a8394] hover:bg-white/8")}>
                    {fmt}
                  </button>
                ))}
              </div>
              <span className={cl("text-xs shrink-0", muted)}>{allSections.length} section{allSections.length !== 1 ? "s" : ""} · {totalRows} rows</span>
              <button onClick={downloadAll} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold hover:opacity-90 active:scale-[.98] transition-all shadow-lg shadow-violet-500/25">
                <Download className="w-4 h-4" /> Export All {exportFmt.toUpperCase()}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

        {/* Mode selector */}
        <div className={cl("rounded-2xl border p-1 flex gap-1", card)}>
          {MODES.map(m => (
            <button key={m.key} onClick={() => { setMode(m.key); setPdfs([]); setExpandedSection(null); }}
              className={cl("flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all",
                mode === m.key ? "bg-gradient-to-br from-violet-500/25 to-indigo-500/20 border border-violet-500/30 text-violet-300" : isLight ? "text-slate-500 hover:bg-slate-50" : "text-[#7a8394] hover:bg-white/4")}>
              <span className={cl(mode === m.key ? "text-violet-300" : muted)}>{m.icon}</span>
              <span>{m.label}</span>
              <span className={cl("text-[10px] font-normal hidden sm:block", mode === m.key ? "text-violet-400/70" : muted)}>{m.desc}</span>
            </button>
          ))}
        </div>

        {/* Stats */}
        {hasResults && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "PDF Files",   val: pdfs.length,                                       ic: "from-violet-500 to-indigo-600", icon: <FileText className="w-4 h-4" /> },
              { label: "Tables",      val: allSections.filter(s => s.type === "table").length, ic: "from-blue-500 to-cyan-600",     icon: <Table2 className="w-4 h-4" /> },
              { label: "KV Sections", val: allSections.filter(s => s.type === "kv").length,    ic: "from-amber-500 to-orange-600",  icon: <Hash className="w-4 h-4" /> },
              { label: "Total Rows",  val: totalRows,                                          ic: "from-emerald-500 to-teal-600",  icon: <CheckCircle2 className="w-4 h-4" /> },
            ].map(s => (
              <div key={s.label} className={cl("rounded-xl border p-3.5", isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]")}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={cl("w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0 bg-gradient-to-br", s.ic)}>{s.icon}</div>
                  <span className={cl("text-[11px] font-medium", muted)}>{s.label}</span>
                </div>
                <p className={cl("text-xl font-bold", text)}>{s.val.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}

        {/* Drop zone */}
        <div
          className={cl("rounded-2xl border-2 border-dashed transition-all cursor-pointer",
            dragging ? "border-violet-400 bg-violet-500/8 scale-[1.01]" : isLight ? "border-slate-300 hover:border-violet-400 bg-white" : "border-white/12 hover:border-violet-500/50 bg-white/2"
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="py-10 flex flex-col items-center gap-3">
            {processing ? (
              <>
                <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
                <p className={cl("text-sm font-semibold", muted)}>Gemini scanning {processingFile || "PDF"}…</p>
                <p className={cl("text-xs", muted)}>Reading document — tables, metadata and all</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/25 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-violet-400" />
                </div>
                <div className="text-center">
                  <p className={cl("text-sm font-semibold", text)}>
                    {hasResults ? "Drop more PDFs to extract more data" : "Drop a PDF here"}
                  </p>
                  <p className={cl("text-xs mt-1", muted)}>Bills, invoices, timesheets, statements — any PDF · Click to browse</p>
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
              <button onClick={() => { setPdfs([]); setExpandedSection(null); }} className={cl("text-xs flex items-center gap-1 hover:text-red-400 transition-colors", muted)}>
                <Trash2 className="w-3.5 h-3.5" /> Clear all
              </button>
            </div>
            <div className={cl("divide-y", isLight ? "divide-slate-100" : "divide-white/5")}>
              {pdfs.map(pdf => (
                <div key={pdf.id} className={cl("px-5 py-3 flex items-center gap-4", isLight ? "hover:bg-slate-50" : "hover:bg-white/3")}>
                  <div className={cl("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                    pdf.error ? "bg-red-500/10 border border-red-500/20" : "bg-gradient-to-br from-violet-500/15 to-indigo-500/15 border border-violet-500/20")}>
                    {pdf.error ? <AlertTriangle className="w-4 h-4 text-red-400" /> : <FileText className="w-4 h-4 text-violet-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cl("text-sm font-medium truncate", text)}>{pdf.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={cl("text-xs", muted)}>{formatBytes(pdf.size)}</span>
                      {pdf.error
                        ? <span className="text-xs text-red-400">{pdf.error}</span>
                        : <><span className="text-xs text-violet-400 font-semibold">{pdf.sections.length} section{pdf.sections.length !== 1 ? "s" : ""}</span><span className={cl("text-xs", muted)}>{pdf.sections.reduce((s, t) => s + t.rows.length, 0)} rows</span></>
                      }
                    </div>
                  </div>
                  <button onClick={() => setPdfs(prev => prev.filter(p => p.id !== pdf.id))} className={cl("p-1.5 rounded-lg transition-colors hover:text-red-400 hover:bg-red-500/10", muted)}>
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
              <Layers className="w-7 h-7 text-violet-400" />
            </div>
            <h3 className={cl("text-sm font-semibold mb-1.5", text)}>No data extracted yet</h3>
            <p className={cl("text-xs max-w-xs mx-auto", muted)}>
              Drop a PDF above. Gemini AI will read it and extract all tables, key-value pairs, and text — just like scanning a bill or timesheet.
            </p>
          </div>
        )}

        {/* Section cards */}
        {filteredSections.map(sec => {
          const isExp = expandedSection === sec.id;
          const badge = TYPE_BADGES[sec.type];
          return (
            <div key={sec.id} className={cl("rounded-2xl border overflow-hidden", card)}>
              <div
                className={cl("px-5 py-3.5 flex items-center gap-3 border-b cursor-pointer select-none", bdr, isLight ? "hover:bg-slate-50" : "hover:bg-white/3")}
                onClick={() => setExpandedSection(isExp ? null : sec.id)}
              >
                <span className={cl("px-2 py-0.5 rounded-md text-[11px] font-bold border", badge.color)}>{badge.label}</span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/15">{sec.pageRange}</span>
                <span className={cl("text-sm font-semibold flex-1 truncate", text)}>{sec.title}</span>
                <span className={cl("text-xs shrink-0", muted)}>{sec.rows.length} rows · {sec.headers.length} col{sec.headers.length !== 1 ? "s" : ""}</span>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); downloadSection(sec, exportFmt); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/20 hover:bg-violet-500/25 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> {exportFmt.toUpperCase()}
                  </button>
                  <span className={cl("text-xs transition-transform duration-200", isExp ? "rotate-90" : "", muted)}>▶</span>
                </div>
              </div>

              <div className={cl("px-5 py-1.5 border-b flex items-center gap-2", bdr, isLight ? "bg-slate-50" : "bg-white/2")}>
                <FileText className="w-3 h-3 text-[#7a8394] shrink-0" />
                <span className={cl("text-[11px] truncate", muted)}>{sec.sourceFile}</span>
                {isExp && <span className={cl("text-[11px] ml-auto italic shrink-0", muted)}>Click any cell to edit before exporting</span>}
              </div>

              {isExp && (
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="w-full border-collapse text-xs text-left">
                    <thead>
                      <tr className={cl("border-b sticky top-0 z-10", isLight ? "bg-slate-100 border-slate-200 text-slate-600" : "bg-[#0a0d15] border-[#1a2235] text-[#7a8394]")}>
                        <th className={cl("px-3 py-2 w-8 text-center font-normal", muted)}>#</th>
                        {sec.headers.map(h => <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className={cl("divide-y", isLight ? "divide-slate-100" : "divide-[#1a2235]")}>
                      {sec.rows.map((row, ri) => (
                        <tr key={ri} className={cl("transition-colors", isLight ? "hover:bg-violet-50/40" : "hover:bg-violet-500/5")}>
                          <td className={cl("px-3 py-2 text-center text-[10px] w-8", muted)}>{ri + 1}</td>
                          {sec.headers.map(col => {
                            const isEditing = editingCell?.secId === sec.id && editingCell.row === ri && editingCell.col === col;
                            return (
                              <td key={col}
                                className={cl("px-3 py-1.5 whitespace-pre-wrap min-w-[80px] max-w-[320px] cursor-pointer",
                                  isEditing ? (isLight ? "bg-violet-50 outline outline-2 outline-violet-400 rounded" : "bg-violet-500/10 outline outline-2 outline-violet-500 rounded") : "", text)}
                                onClick={() => setEditingCell({ secId: sec.id, row: ri, col })}
                              >
                                {isEditing ? (
                                  <input autoFocus defaultValue={row[col] ?? ""}
                                    onBlur={e => { updateCell(sec.id, ri, col, e.target.value); setEditingCell(null); }}
                                    onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") { updateCell(sec.id, ri, col, (e.target as HTMLInputElement).value); setEditingCell(null); } }}
                                    className="bg-transparent outline-none w-full text-xs" />
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

              {!isExp && (
                <div className={cl("px-5 py-2 text-xs", muted)}>
                  Click to preview · {sec.rows.length} rows · {sec.headers.join(", ")}
                </div>
              )}
            </div>
          );
        })}

        {hasResults && filteredSections.length === 0 && search && (
          <div className={cl("rounded-2xl border p-6 text-center", card)}>
            <Search className="w-8 h-8 mx-auto mb-3 text-[#7a8394]" />
            <p className={cl("text-sm font-semibold mb-1", text)}>No sections match "{search}"</p>
            <button onClick={() => setSearch("")} className="text-xs text-violet-400 hover:underline">Clear search</button>
          </div>
        )}
      </div>
    </div>
  );
};
