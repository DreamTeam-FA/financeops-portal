import React, { useState, useCallback, useRef } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  ChevronLeft, Upload, FileText, Download, CheckCircle2,
  AlertTriangle, Loader2, Trash2, Table2, X, Search,
  FileSpreadsheet, AlignLeft, Hash, Layers
} from "lucide-react";

/* ─────────────────────────────────────────────── Types */
type ExtractMode = "auto" | "tables" | "text" | "kv";

/** A single extracted "section" — could be a table, text block, or KV block */
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

/* ─────────────────────────────────────────────── Text sanitizer
   PDF.js maps unrecognised glyphs to code points in Mathematical Operators
   (U+2200-U+22FF, e.g. ≡ U+2261), Private Use Area (U+E000-U+F8FF), and
   similar "junk" blocks. Strip those and collapse runs of whitespace. */
function sanitizePdfStr(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const cp = raw.charCodeAt(i);
    // Keep: basic printable ASCII (U+0020-U+007E)
    if (cp >= 0x0020 && cp <= 0x007E) { out += raw[i]; continue; }
    // Keep: Latin-1 Supplement printable (U+00A0-U+00FF)
    if (cp >= 0x00A0 && cp <= 0x00FF) { out += raw[i]; continue; }
    // Keep: Latin Extended A/B (U+0100-U+024F)
    if (cp >= 0x0100 && cp <= 0x024F) { out += raw[i]; continue; }
    // Keep: common typographic punctuation — smart quotes, dashes, bullet, ellipsis
    if (cp === 0x2013 || cp === 0x2014 || cp === 0x2018 || cp === 0x2019 ||
        cp === 0x201C || cp === 0x201D || cp === 0x2022 || cp === 0x2026 ||
        cp === 0x00B7 || cp === 0x2F || cp === 0x0027) { out += raw[i]; continue; }
    // Keep: tab/newline
    if (cp === 0x09 || cp === 0x0A || cp === 0x0D) { out += " "; continue; }
    // Drop everything else (Mathematical Operators, Private Use Area, specials, etc.)
    // Replace with a space to avoid merging adjacent real words
    out += " ";
  }
  // Collapse runs of whitespace
  return out.replace(/\s{2,}/g, " ").trim();
}

/* ─────────────────────────────────────────────── PDF.js page text extractor */
async function getPdfPages(file: File) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).href;
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;

  const pages: Array<{
    pageNum: number;
    lines: Array<{ y: number; x: number; text: string }[]>; // lines of clusters
    rawLines: string[];
    viewport: { width: number; height: number };
    nodes: Array<{ str: string; x: number; x2: number; y: number }>;
  }> = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();
    const items = content.items as any[];

    const nodes = items
      .filter(it => it.str?.trim())
      .map(it => {
        const x = it.transform[4];
        const fs = Math.abs(it.transform[0]) || Math.abs(it.transform[3]) || 10;
        const w = it.width || it.str.length * fs * 0.5;
        const str = sanitizePdfStr(it.str);
        return { str, x, x2: x + w, y: vp.height - it.transform[5] };
      })
      .filter(n => n.str.length > 0);

    // Cluster into Y-lines
    nodes.sort((a, b) => a.y - b.y || a.x - b.x);
    const lineMap: Array<{ y: number; items: typeof nodes }> = [];
    for (const n of nodes) {
      const l = lineMap.find(l => Math.abs(l.y - n.y) <= 4);
      if (l) l.items.push(n); else lineMap.push({ y: n.y, items: [n] });
    }
    lineMap.sort((a, b) => a.y - b.y);
    lineMap.forEach(l => l.items.sort((a, b) => a.x - b.x));

    // Merge items into text clusters per line
    const lines = lineMap.map(line => {
      const clusters: Array<{ x: number; x2: number; text: string }> = [];
      let cur: typeof clusters[0] | null = null;
      for (const it of line.items) {
        if (!cur) { cur = { x: it.x, x2: it.x2, text: it.str }; }
        else if (it.x - cur.x2 < 14) { cur.text += " " + it.str; cur.x2 = Math.max(cur.x2, it.x2); }
        else { clusters.push(cur); cur = { x: it.x, x2: it.x2, text: it.str }; }
      }
      if (cur) clusters.push(cur);
      return clusters.map(c => ({ y: line.y, x: c.x, text: c.text }));
    });

    const rawLines = lines.map(l => l.map(c => c.text).join("  ").trim()).filter(Boolean);

    pages.push({ pageNum: p, lines, rawLines, viewport: { width: vp.width, height: vp.height }, nodes });
  }

  return pages;
}

/* ─────────────────────────────────────────────── Table extraction engine */
function extractTablesFromPage(
  pageNum: number,
  lines: Array<{ y: number; x: number; text: string }[]>,
  nodes: Array<{ str: string; x: number; x2: number; y: number }>,
  viewport: { width: number; height: number }
): Array<{ headers: string[]; rows: Record<string, string>[] }> {

  if (!nodes.length) return [];

  // Cluster into line-clusters
  const linesClustered = lines.map(line => {
    const clusters: Array<{ x: number; x2: number; text: string }> = [];
    let cur: typeof clusters[0] | null = null;
    // reconstruct from raw nodes on this Y
    const lineNodes = nodes.filter(n => Math.abs(n.y - (line[0]?.y ?? -999)) <= 5).sort((a, b) => a.x - b.x);
    if (!lineNodes.length) {
      // fallback: use line clusters directly
      for (const it of line) {
        if (!cur) cur = { x: it.x, x2: it.x + it.text.length * 6, text: it.text };
        else if (it.x - cur.x2 < 14) { cur.text += " " + it.text; cur.x2 = it.x + it.text.length * 6; }
        else { clusters.push(cur); cur = { x: it.x, x2: it.x + it.text.length * 6, text: it.text }; }
      }
      if (cur) clusters.push(cur);
      return { y: line[0]?.y ?? 0, clusters };
    }
    for (const it of lineNodes) {
      if (!cur) cur = { x: it.x, x2: it.x2, text: it.str };
      else if (it.x - cur.x2 < 14) { cur.text += " " + it.str; cur.x2 = Math.max(cur.x2, it.x2); }
      else { clusters.push(cur); cur = { x: it.x, x2: it.x2, text: it.str }; }
    }
    if (cur) clusters.push(cur);
    return { y: line[0]?.y ?? 0, clusters };
  });

  const multiCol = linesClustered.filter(l => l.clusters.length >= 2);
  if (multiCol.length < 2) return [];

  const pw = Math.ceil(viewport.width);
  const density = new Float32Array(pw);
  for (const l of multiCol) {
    for (const c of l.clusters) {
      const s = Math.max(0, Math.floor(c.x));
      const e = Math.min(pw - 1, Math.ceil(c.x2));
      for (let i = s; i <= e; i++) density[i] += 1;
    }
  }

  const colIntervals: Array<{ start: number; end: number }> = [];
  let inCol = false, startX = 0;
  for (let x = 0; x < pw; x++) {
    if (density[x] > 0) { if (!inCol) { inCol = true; startX = x; } }
    else if (inCol) {
      let gap = 0;
      while (x + gap < pw && density[x + gap] === 0) gap++;
      if (gap >= 12 || x + gap >= pw) { inCol = false; colIntervals.push({ start: startX, end: x - 1 }); x += gap - 1; }
    }
  }
  if (inCol) colIntervals.push({ start: startX, end: pw - 1 });
  if (colIntervals.length < 2) return [];

  const mappedRows: Array<{ y: number; cells: string[]; count: number }> = [];
  for (const line of linesClustered) {
    const cells = new Array<string>(colIntervals.length).fill("");
    let count = 0;
    for (const c of line.clusters) {
      const mid = (c.x + c.x2) / 2;
      let best = -1, bd = Infinity;
      colIntervals.forEach((iv, idx) => {
        const d = mid >= iv.start && mid <= iv.end ? 0 : Math.min(Math.abs(mid - iv.start), Math.abs(mid - iv.end));
        if (d < bd) { bd = d; best = idx; }
      });
      if (best !== -1) { cells[best] = cells[best] ? cells[best] + " " + c.text : c.text; count++; }
    }
    if (count > 0) mappedRows.push({ y: line.y, cells, count });
  }

  if (mappedRows.length < 2) return [];

  let hdrIdx = mappedRows.findIndex(r => r.count >= 2);
  if (hdrIdx === -1) hdrIdx = 0;

  const rawH = mappedRows[hdrIdx].cells.map((h, i) => h.trim() || `Col ${i + 1}`);
  const seen: Record<string, number> = {};
  const headers = rawH.map(h => { const k = h.trim(); if (seen[k]) { seen[k]++; return `${k}_${seen[k]}`; } seen[k] = 1; return k; });

  const rows: Record<string, string>[] = [];
  let lastRow: Record<string, string> | null = null;
  for (const r of mappedRows.slice(hdrIdx + 1)) {
    const pop = r.cells.map((c, i) => c ? i : -1).filter(i => i !== -1);
    if (lastRow && pop.length === 1 && pop[0] === 0 && r.cells[0]) {
      lastRow[headers[0]] = (lastRow[headers[0]] || "") + "\n" + r.cells[0];
    } else if (r.count >= 1) {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = r.cells[i]?.trim() || ""; });
      rows.push(obj);
      lastRow = obj;
    }
  }

  return rows.length > 0 ? [{ headers, rows }] : [];
}

/* ─────────────────────────────────────────────── Key-Value detection */
// Patterns: "Label: Value", "Label — Value", "Label ......... Value"
const KV_RE = /^(.{2,60}?)[\s:：\-–—\.]{1,}(.+)$/;
const KV_SEP = /^(.{2,60}?)\s*[：:]\s*(.+)$/;
const KV_DOT = /^(.{2,60}?)[\.]{3,}\s*(.+)$/;

function detectKV(rawLines: string[]): Array<{ Key: string; Value: string }> | null {
  const pairs: Array<{ Key: string; Value: string }> = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 4) continue;
    const m = trimmed.match(KV_SEP) || trimmed.match(KV_DOT);
    if (m && m[1].trim() && m[2].trim()) {
      pairs.push({ Key: m[1].trim(), Value: m[2].trim() });
    }
  }
  // Only consider it KV if at least 30% of non-empty lines matched
  const nonEmpty = rawLines.filter(l => l.trim().length > 0);
  if (pairs.length >= 3 && pairs.length / nonEmpty.length >= 0.25) return pairs;
  return null;
}

/* ─────────────────────────────────────────────── Full text extraction */
function extractTextRows(rawLines: string[]): Array<{ Line: string }> {
  return rawLines.filter(l => l.trim().length > 0).map(l => ({ Line: l.trim() }));
}

/* ─────────────────────────────────────────────── Main extractor */
async function extractFromPDF(file: File, mode: ExtractMode): Promise<DataSection[]> {
  const pages = await getPdfPages(file);
  if (!pages.length) return [];

  const sections: DataSection[] = [];

  if (mode === "text") {
    // All pages as raw text rows
    for (const pg of pages) {
      const rows = extractTextRows(pg.rawLines);
      if (!rows.length) continue;
      sections.push({
        id: uid(), sourceFile: file.name, type: "text",
        title: `Page ${pg.pageNum} — Text`,
        headers: ["Line"], rows,
        pageRange: `p.${pg.pageNum}`,
      });
    }
    return sections;
  }

  if (mode === "kv") {
    // All pages as KV pairs
    for (const pg of pages) {
      const pairs = detectKV(pg.rawLines);
      if (!pairs?.length) {
        // Fallback: text rows
        const rows = extractTextRows(pg.rawLines);
        if (!rows.length) continue;
        sections.push({
          id: uid(), sourceFile: file.name, type: "text",
          title: `Page ${pg.pageNum} — Text`,
          headers: ["Line"], rows,
          pageRange: `p.${pg.pageNum}`,
        });
      } else {
        sections.push({
          id: uid(), sourceFile: file.name, type: "kv",
          title: `Page ${pg.pageNum} — Key-Value Data`,
          headers: ["Key", "Value"], rows: pairs,
          pageRange: `p.${pg.pageNum}`,
        });
      }
    }
    return sections;
  }

  if (mode === "tables") {
    // Tables only, merge across pages
    const rawPageTables: Array<{ page: number; headers: string[]; rows: Record<string, string>[] }> = [];
    for (const pg of pages) {
      const tables = extractTablesFromPage(pg.pageNum, pg.lines, pg.nodes, pg.viewport);
      for (const t of tables) rawPageTables.push({ page: pg.pageNum, ...t });
    }
    const merged = mergePageTables(rawPageTables);
    return merged.map(t => ({
      id: uid(), sourceFile: file.name, type: "table",
      title: t.startPage === t.endPage ? `Table — Page ${t.startPage}` : `Table — Pages ${t.startPage}–${t.endPage}`,
      headers: t.headers, rows: t.rows,
      pageRange: t.startPage === t.endPage ? `p.${t.startPage}` : `p.${t.startPage}–${t.endPage}`,
    }));
  }

  // AUTO mode: per page, try table → KV → text
  const rawPageTables: Array<{ page: number; headers: string[]; rows: Record<string, string>[] }> = [];
  const pageHasTable = new Set<number>();

  for (const pg of pages) {
    const tables = extractTablesFromPage(pg.pageNum, pg.lines, pg.nodes, pg.viewport);
    for (const t of tables) { rawPageTables.push({ page: pg.pageNum, ...t }); pageHasTable.add(pg.pageNum); }
  }

  // Merge consecutive table pages
  const mergedTables = mergePageTables(rawPageTables);
  for (const t of mergedTables) {
    sections.push({
      id: uid(), sourceFile: file.name, type: "table",
      title: t.startPage === t.endPage ? `Table — Page ${t.startPage}` : `Table — Pages ${t.startPage}–${t.endPage}`,
      headers: t.headers, rows: t.rows,
      pageRange: t.startPage === t.endPage ? `p.${t.startPage}` : `p.${t.startPage}–${t.endPage}`,
    });
  }

  // Non-table pages: try KV then text
  for (const pg of pages) {
    if (pageHasTable.has(pg.pageNum)) continue;
    const kvPairs = detectKV(pg.rawLines);
    if (kvPairs && kvPairs.length >= 3) {
      sections.push({
        id: uid(), sourceFile: file.name, type: "kv",
        title: `Page ${pg.pageNum} — Key-Value Data`,
        headers: ["Key", "Value"], rows: kvPairs,
        pageRange: `p.${pg.pageNum}`,
      });
    } else {
      const textRows = extractTextRows(pg.rawLines);
      if (textRows.length > 0) {
        sections.push({
          id: uid(), sourceFile: file.name, type: "text",
          title: `Page ${pg.pageNum} — Text`,
          headers: ["Line"], rows: textRows,
          pageRange: `p.${pg.pageNum}`,
        });
      }
    }
  }

  // Sort sections by page number (parse from pageRange)
  sections.sort((a, b) => {
    const pa = parseInt(a.pageRange.replace(/[^0-9].*/, "")) || 0;
    const pb = parseInt(b.pageRange.replace(/[^0-9].*/, "")) || 0;
    return pa - pb;
  });

  return sections;
}

function mergePageTables(rawPageTables: Array<{ page: number; headers: string[]; rows: Record<string, string>[] }>) {
  const merged: Array<{ startPage: number; endPage: number; headers: string[]; rows: Record<string, string>[] }> = [];
  for (const t of rawPageTables) {
    if (!merged.length) {
      merged.push({ startPage: t.page, endPage: t.page, headers: t.headers, rows: [...t.rows] });
    } else {
      const prev = merged[merged.length - 1];
      if (Math.abs(prev.headers.length - t.headers.length) <= 1 && t.page <= prev.endPage + 1) {
        prev.rows.push(...t.rows); prev.endPage = t.page;
      } else {
        merged.push({ startPage: t.page, endPage: t.page, headers: t.headers, rows: [...t.rows] });
      }
    }
  }
  return merged;
}

/* ─────────────────────────────────────────────── Export */
function toCSV(section: DataSection): string {
  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    section.headers.map(escape).join(","),
    ...section.rows.map(r => section.headers.map(h => escape(r[h] ?? "")).join(",")),
  ];
  return "﻿" + lines.join("\n");
}

function downloadBlob(content: BlobPart, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function toDocx(section: DataSection): Uint8Array {
  const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Build table XML
  const cellXml = (text: string, bold?: boolean) =>
    `<w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/></w:tcBorders>${bold ? "<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"F3F0FF\"/>" : ""}</w:tcPr><w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p></w:tc>`;

  const headerRow = `<w:tr><w:trPr><w:trHeight w:val="400"/></w:trPr>${section.headers.map(h => cellXml(h, true)).join("")}</w:tr>`;
  const dataRows = section.rows.map(row => `<w:tr>${section.headers.map(h => cellXml(row[h] ?? "")).join("")}</w:tr>`).join("");
  const tblXml = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/></w:tblBorders></w:tblPr><w:tblGrid>${section.headers.map(() => '<w:gridCol/>').join("")}</w:tblGrid>${headerRow}${dataRows}</w:tbl>`;

  const titlePara = `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${esc(section.title)}</w:t></w:r></w:p>`;
  const sourcePara = `<w:p><w:r><w:rPr><w:color w:val="888888"/><w:sz w:val="18"/></w:rPr><w:t>Source: ${esc(section.sourceFile)} · ${esc(section.pageRange)} · ${section.rows.length} rows</w:t></w:r></w:p>`;
  const spacePara = `<w:p/>`;

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${titlePara}${sourcePara}${spacePara}${tblXml}${spacePara}<w:sectPr/></w:body></w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="5B21B6"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>
</w:styles>`;

  const rXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const wbRXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const ctXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

  const enc = new TextEncoder();
  const parts = [
    { name: "[Content_Types].xml", data: enc.encode(ctXml) },
    { name: "_rels/.rels", data: enc.encode(wbRXml) },
    { name: "word/document.xml", data: enc.encode(docXml) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(rXml) },
    { name: "word/styles.xml", data: enc.encode(stylesXml) },
  ];

  const ct = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; ct[i] = c; }
  const crc32 = (buf: Uint8Array) => { let c = 0xFFFFFFFF; for (const b of buf) c = ct[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const u16 = (v: number) => [(v & 0xFF), (v >> 8) & 0xFF];
  const u32 = (v: number) => [(v & 0xFF), (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF];
  const central: number[] = [], local: number[] = [], ne = new TextEncoder();
  for (const pt of parts) {
    const nb = ne.encode(pt.name); const crc = crc32(pt.data); const off = local.length;
    local.push(0x50,0x4B,0x03,0x04,0x14,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,...u32(crc),...u32(pt.data.length),...u32(pt.data.length),...u16(nb.length),0x00,0x00,...nb,...pt.data);
    central.push(0x50,0x4B,0x01,0x02,0x3F,0x00,0x14,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,...u32(crc),...u32(pt.data.length),...u32(pt.data.length),...u16(nb.length),0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,...u32(off),...nb);
  }
  const cdOff = local.length, cdSz = central.length;
  const eocd = [0x50,0x4B,0x05,0x06,0x00,0x00,0x00,0x00,...u16(parts.length),...u16(parts.length),...u32(cdSz),...u32(cdOff),0x00,0x00];
  return new Uint8Array([...local, ...central, ...eocd]);
}

function toXLSX(section: DataSection): Uint8Array {
  const rows = [section.headers, ...section.rows.map(r => section.headers.map(h => r[h] ?? ""))];
  const enc = new TextEncoder();
  const ssMap = new Map<string, number>();
  const ssList: string[] = [];
  const si = (s: string) => {
    if (!ssMap.has(s)) { ssMap.set(s, ssList.length); ssList.push(`<si><t>${escHtml(s)}</t></si>`); }
    return ssMap.get(s)!;
  };
  const toCol = (n: number) => { let s = ""; n++; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; };
  const sheetRows = rows.map((row, ri) =>
    `<row r="${ri + 1}">${row.map((cell, ci) => { const ref = `${toCol(ci)}${ri + 1}`; const idx = si(String(cell)); return `<c r="${ref}" t="s"><v>${idx}</v></c>`; }).join("")}</row>`
  );
  const ssXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${ssList.length}" uniqueCount="${ssList.length}">${ssList.join("")}</sst>`;
  const shXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.join("")}</sheetData></worksheet>`;
  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const wbRXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const ctXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
  const parts = [
    { name: "[Content_Types].xml", data: enc.encode(ctXml) },
    { name: "_rels/.rels", data: enc.encode(wbRXml) },
    { name: "xl/workbook.xml", data: enc.encode(wbXml) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(rXml) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(shXml) },
    { name: "xl/sharedStrings.xml", data: enc.encode(ssXml) },
  ];
  const ct = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; ct[i] = c; }
  const crc32 = (buf: Uint8Array) => { let c = 0xFFFFFFFF; for (const b of buf) c = ct[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const u16 = (v: number) => [(v & 0xFF), (v >> 8) & 0xFF];
  const u32 = (v: number) => [(v & 0xFF), (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF];
  const central: number[] = [], local: number[] = [], ne = new TextEncoder();
  for (const pt of parts) {
    const nb = ne.encode(pt.name);
    const crc = crc32(pt.data);
    const off = local.length;
    local.push(0x50,0x4B,0x03,0x04,0x14,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,...u32(crc),...u32(pt.data.length),...u32(pt.data.length),...u16(nb.length),0x00,0x00,...nb,...pt.data);
    central.push(0x50,0x4B,0x01,0x02,0x3F,0x00,0x14,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,...u32(crc),...u32(pt.data.length),...u32(pt.data.length),...u16(nb.length),0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,...u32(off),...nb);
  }
  const cdOff = local.length, cdSz = central.length;
  const eocd = [0x50,0x4B,0x05,0x06,0x00,0x00,0x00,0x00,...u16(parts.length),...u16(parts.length),...u32(cdSz),...u32(cdOff),0x00,0x00];
  return new Uint8Array([...local, ...central, ...eocd]);
}

/* ─────────────────────────────────────────────── Mode config */
const MODES: Array<{ key: ExtractMode; label: string; desc: string; icon: React.ReactNode; badge: string }> = [
  { key: "auto",   label: "Smart Auto",  desc: "Tables + KV pairs + text — best for mixed PDFs", icon: <Layers className="w-3.5 h-3.5" />,        badge: "Recommended" },
  { key: "tables", label: "Tables Only", desc: "Structured grid/column data only",                icon: <Table2 className="w-3.5 h-3.5" />,         badge: "" },
  { key: "kv",     label: "Key-Value",   desc: "\"Label: Value\" pair extraction + text fallback",icon: <Hash className="w-3.5 h-3.5" />,           badge: "" },
  { key: "text",   label: "Full Text",   desc: "Every line as a row — great for raw data capture",icon: <AlignLeft className="w-3.5 h-3.5" />,      badge: "" },
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
  const [dragging, setDragging] = useState(false);
  const [editingCell, setEditingCell] = useState<{ secId: string; row: number; col: string } | null>(null);
  const [search, setSearch] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [exportFmt, setExportFmt] = useState<"csv" | "xlsx" | "docx">("csv");
  const [mode, setMode] = useState<ExtractMode>("auto");

  // Theme tokens
  const bg   = isLight ? "bg-slate-100 text-slate-900" : "bg-[#07090f] text-white";
  const card = isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]";
  const text = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-[#7a8394]";
  const bdr  = isLight ? "border-slate-200" : "border-[#1a2235]";

  const allSections = pdfs.flatMap(p => p.sections);
  const totalRows = allSections.reduce((s, t) => s + t.rows.length, 0);
  const hasResults = allSections.length > 0;

  /* ── Processing ── */
  const processFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (!pdfs.length) { showToast("Please drop PDF files only", "error"); return; }
    setProcessing(true);
    const results: ParsedPDF[] = [];

    for (const file of pdfs) {
      try {
        const sections = await extractFromPDF(file, mode);
        results.push({ id: uid(), name: file.name, size: file.size, sections, error: sections.length === 0 ? "No extractable data found" : undefined });
      } catch (e: any) {
        results.push({ id: uid(), name: file.name, size: file.size, sections: [], error: e?.message || "Failed to parse PDF" });
        showToast(`Failed: ${file.name}`, "error");
      }
    }

    setPdfs(prev => {
      const found = results.reduce((s, p) => s + p.sections.length, 0);
      if (found > 0) {
        const firstSec = results.find(r => r.sections.length)?.sections[0];
        if (firstSec && !expandedSection) setExpandedSection(firstSec.id);
      } else {
        showToast("No data could be extracted from the PDF(s)", "error");
      }
      return [...prev, ...results];
    });
    setProcessing(false);
  }, [showToast, mode, expandedSection]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) { processFiles(Array.from(e.target.files)); e.target.value = ""; }
  }, [processFiles]);

  /* ── Export ── */
  const downloadSection = (sec: DataSection, fmt: "csv" | "xlsx" | "docx") => {
    const safe = sec.title.replace(/[^a-z0-9_-]/gi, "_");
    if (fmt === "csv") { downloadBlob(toCSV(sec), "text/csv;charset=utf-8;", `${safe}.csv`); }
    else if (fmt === "xlsx") { downloadBlob(toXLSX(sec), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${safe}.xlsx`); }
    else { downloadBlob(toDocx(sec), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", `${safe}.docx`); }
    showToast(`Downloaded as ${fmt.toUpperCase()}`, "success");
  };

  const downloadAll = () => {
    if (!allSections.length) return;
    allSections.forEach((s, i) => setTimeout(() => downloadSection(s, exportFmt), i * 250));
    showToast(`Downloading ${allSections.length} section${allSections.length !== 1 ? "s" : ""} as ${exportFmt.toUpperCase()}`, "success");
  };

  /* ── Cell editing ── */
  const updateCell = (secId: string, rowIdx: number, col: string, val: string) => {
    setPdfs(prev => prev.map(pdf => ({
      ...pdf,
      sections: pdf.sections.map(s => {
        if (s.id !== secId) return s;
        return { ...s, rows: s.rows.map((r, i) => i === rowIdx ? { ...r, [col]: val } : r) };
      }),
    })));
  };

  /* ── Filter ── */
  const filteredSections = search.trim()
    ? allSections.filter(s =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.sourceFile.toLowerCase().includes(search.toLowerCase()) ||
        s.headers.some(h => h.toLowerCase().includes(search.toLowerCase())) ||
        s.rows.some(r => Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase())))
      )
    : allSections;

  const tableSecs  = allSections.filter(s => s.type === "table");
  const kvSecs     = allSections.filter(s => s.type === "kv");
  const textSecs   = allSections.filter(s => s.type === "text");

  return (
    <div className={cl("flex flex-col h-full overflow-hidden", bg)}>

      {/* ── Header ── */}
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
            <h1 className="text-white font-bold text-base leading-tight">PDF Data Extractor</h1>
            <p className="text-[#7a8394] text-xs">Upload PDF · Auto-extract tables, KV data & text · Export CSV / XLSX / DOCX</p>
          </div>
        </div>

        {hasResults && (
          <div className="ml-auto flex items-center gap-2.5">
            <div className={cl("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm", isLight ? "bg-white border-slate-200" : "bg-white/5 border-white/10")}>
              <Search className="w-3.5 h-3.5 text-[#7a8394]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sections…"
                className="bg-transparent outline-none text-xs w-36 placeholder:text-[#7a8394]" />
              {search && <button onClick={() => setSearch("")}><X className="w-3 h-3 text-[#7a8394] hover:text-white" /></button>}
            </div>
            <div className={cl("flex rounded-lg border overflow-hidden text-xs font-semibold", isLight ? "border-slate-200" : "border-white/10")}>
              {(["csv", "xlsx", "docx"] as const).map(fmt => (
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
              {allSections.length} section{allSections.length !== 1 ? "s" : ""} · {totalRows} rows
            </span>
            <button onClick={downloadAll}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold hover:opacity-90 active:scale-[.98] transition-all shadow-lg shadow-violet-500/25">
              <Download className="w-4 h-4" /> Export All {exportFmt.toUpperCase()}
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

        {/* Extraction Mode Selector */}
        <div className={cl("rounded-2xl border p-1 flex gap-1", card)}>
          {MODES.map(m => (
            <button key={m.key} onClick={() => { setMode(m.key); setPdfs([]); setExpandedSection(null); }}
              className={cl(
                "flex-1 flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all",
                mode === m.key
                  ? "bg-gradient-to-br from-violet-500/25 to-indigo-500/20 border border-violet-500/30 text-violet-300 shadow-inner"
                  : isLight ? "text-slate-500 hover:bg-slate-50" : "text-[#7a8394] hover:bg-white/4"
              )}>
              <div className="flex items-center gap-1.5">
                {m.icon}
                <span>{m.label}</span>
                {m.badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/20 font-bold">{m.badge}</span>}
              </div>
              <span className={cl("text-[10px] font-normal hidden sm:block", mode === m.key ? "text-violet-400/70" : muted)}>{m.desc}</span>
            </button>
          ))}
        </div>

        {/* Stats */}
        {hasResults && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "PDF Files",    val: pdfs.length.toString(),              grad: "from-violet-500/15 to-indigo-500/15", bdr2: "border-violet-500/20", ic: "bg-gradient-to-br from-violet-500 to-indigo-600",  sh: "shadow-violet-500/10", icon: <FileText className="w-4 h-4" /> },
              { label: "Tables",       val: tableSecs.length.toString(),          grad: "from-blue-500/15 to-cyan-500/15",     bdr2: "border-blue-500/20",   ic: "bg-gradient-to-br from-blue-500 to-cyan-600",    sh: "shadow-blue-500/10",   icon: <Table2 className="w-4 h-4" /> },
              { label: "KV Sections",  val: kvSecs.length.toString(),             grad: "from-amber-500/15 to-orange-500/15",  bdr2: "border-amber-500/20",  ic: "bg-gradient-to-br from-amber-500 to-orange-600", sh: "shadow-amber-500/10",  icon: <Hash className="w-4 h-4" /> },
              { label: "Total Rows",   val: totalRows.toLocaleString(),           grad: "from-emerald-500/15 to-teal-500/15",  bdr2: "border-emerald-500/20",ic: "bg-gradient-to-br from-emerald-500 to-teal-600", sh: "shadow-emerald-500/10",icon: <CheckCircle2 className="w-4 h-4" /> },
            ].map(s => (
              <div key={s.label} className={cl("rounded-xl border p-3.5 bg-gradient-to-br shadow-lg", s.grad, s.bdr2, s.sh)}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={cl("w-6 h-6 rounded-lg flex items-center justify-center text-white shadow-md shrink-0 text-[11px]", s.ic)}>{s.icon}</div>
                  <span className={cl("text-[11px] font-medium", muted)}>{s.label}</span>
                </div>
                <p className={cl("text-xl font-bold", text)}>{s.val}</p>
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
                <p className={cl("text-sm font-semibold", muted)}>Extracting data — please wait…</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/25 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-violet-400" />
                </div>
                <div className="text-center">
                  <p className={cl("text-sm font-semibold", text)}>
                    {hasResults ? "Drop more PDFs to extract more data" : "Drop PDF files here"}
                  </p>
                  <p className={cl("text-xs mt-1", muted)}>Multiple files supported · Click to browse</p>
                </div>
                <div className={cl("flex items-center gap-2 text-[11px] px-3 py-1 rounded-full border", isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-white/4 border-white/10 text-[#7a8394]")}>
                  Extracts tables · key-value pairs · raw text — exports CSV / XLSX / DOCX — 100% offline
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
              <button onClick={() => { setPdfs([]); setExpandedSection(null); }}
                className={cl("text-xs flex items-center gap-1 hover:text-red-400 transition-colors", muted)}>
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
                        ? <span className="text-xs text-red-400">⚠ {pdf.error}</span>
                        : <>
                            {pdf.sections.filter(s => s.type === "table").length > 0 && <span className="text-xs text-blue-400 font-semibold">{pdf.sections.filter(s => s.type === "table").length} table{pdf.sections.filter(s => s.type === "table").length !== 1 ? "s" : ""}</span>}
                            {pdf.sections.filter(s => s.type === "kv").length > 0 && <span className="text-xs text-amber-400 font-semibold">{pdf.sections.filter(s => s.type === "kv").length} KV</span>}
                            {pdf.sections.filter(s => s.type === "text").length > 0 && <span className={cl("text-xs font-semibold", muted)}>{pdf.sections.filter(s => s.type === "text").length} text</span>}
                          </>
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
              <FileSpreadsheet className="w-7 h-7 text-violet-400" />
            </div>
            <h3 className={cl("text-sm font-semibold mb-1.5", text)}>No data extracted yet</h3>
            <p className={cl("text-xs max-w-sm mx-auto", muted)}>
              Upload a PDF above. <strong className={text}>Smart Auto</strong> mode detects tables, key-value pairs, and raw text automatically across all pages.
            </p>
          </div>
        )}

        {/* Section results */}
        {filteredSections.map(sec => {
          const isExp = expandedSection === sec.id;
          const badge = TYPE_BADGES[sec.type];
          return (
            <div key={sec.id} className={cl("rounded-2xl border overflow-hidden", card)}>
              {/* Section header */}
              <div className={cl("px-5 py-3.5 flex items-center gap-3 border-b cursor-pointer select-none", bdr, isLight ? "hover:bg-slate-50" : "hover:bg-white/3")}
                onClick={() => setExpandedSection(isExp ? null : sec.id)}>
                <span className={cl("px-2 py-0.5 rounded-md text-[11px] font-bold border", badge.color)}>{badge.label}</span>
                <span className={cl("px-2 py-0.5 rounded-md text-[11px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/15")}>{sec.pageRange}</span>
                <span className={cl("text-sm font-semibold flex-1 truncate", text)}>{sec.title}</span>
                <span className={cl("text-xs shrink-0", muted)}>{sec.rows.length} rows · {sec.headers.length} col{sec.headers.length !== 1 ? "s" : ""}</span>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <button onClick={e => { e.stopPropagation(); downloadSection(sec, exportFmt); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/20 hover:bg-violet-500/25 transition-colors">
                    <Download className="w-3.5 h-3.5" /> {exportFmt.toUpperCase()}
                  </button>
                  <span className={cl("text-xs transition-transform duration-200", isExp ? "rotate-90" : "", muted)}>▶</span>
                </div>
              </div>

              {/* Source file */}
              <div className={cl("px-5 py-1.5 border-b flex items-center gap-2", bdr, isLight ? "bg-slate-50" : "bg-white/2")}>
                <FileText className="w-3 h-3 text-[#7a8394] shrink-0" />
                <span className={cl("text-[11px] truncate", muted)}>{sec.sourceFile}</span>
                {isExp && <span className={cl("text-[11px] ml-auto italic shrink-0", muted)}>Click any cell to edit before export</span>}
              </div>

              {/* Data table (expandable) */}
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
                                  isEditing ? (isLight ? "bg-violet-50 outline outline-2 outline-violet-400 rounded" : "bg-violet-500/10 outline outline-2 outline-violet-500 rounded") : "",
                                  text
                                )}
                                onClick={() => setEditingCell({ secId: sec.id, row: ri, col })}>
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

        {/* No search results */}
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
