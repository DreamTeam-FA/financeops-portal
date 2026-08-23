import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  FolderOpen, FileText, CheckCircle2, AlertTriangle,
  ChevronLeft, RotateCcw, Sparkles, ScanLine, FileCheck,
  Loader2, ArrowRight, X, Trash2, ChevronRight
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import {
  findVendor, findDate, findTotal, detectDocType,
  buildFilename, sanitizeFilename, SUPPORTED_EXTS,
  loadCustomVendors, saveCustomVendor, deleteCustomVendor,
  type CustomVendorEntry,
} from "../../utils/receiptParser";
import { getAccessToken } from "../../services/googleAuth";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

/* ── Types ──────────────────────────────────────────────────────────── */
type ScanMethod = "gemini" | "pdftext" | "ocr" | "failed";

interface FileRow {
  id: string;
  fileObj: File;
  driveFileId: string;
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

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
}

interface SharedDrive {
  id: string;
  name: string;
}

type BrowseSection = "myDrive" | "sharedDrives" | "sharedWithMe";
type Stage = "pick" | "scanning" | "preview" | "applying" | "results";

/* ── Drive API helpers ───────────────────────────────────────────────── */
const FOLDER_MIME = "application/vnd.google-apps.folder";
// Always include shared drive support params
const SD_PARAMS = "supportsAllDrives=true&includeItemsFromAllDrives=true";

async function driveList(
  folderId: string,
  token: string,
  driveId?: string
): Promise<DriveItem[]> {
  const q   = `'${folderId}' in parents and trashed=false`;
  const fld = "files(id,name,mimeType)";
  let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fld)}&pageSize=500&orderBy=folder,name&${SD_PARAMS}`;
  if (driveId) url += `&driveId=${encodeURIComponent(driveId)}&corpora=drive`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive list error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.files ?? [];
}

async function listSharedDrives(token: string): Promise<SharedDrive[]> {
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/drives?pageSize=100&fields=drives(id,name)",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.drives ?? [];
}

async function listSharedWithMe(token: string): Promise<DriveItem[]> {
  const q   = "sharedWithMe=true and trashed=false and mimeType='application/vnd.google-apps.folder'";
  const fld = "files(id,name,mimeType)";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fld)}&pageSize=200&orderBy=name&${SD_PARAMS}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.files ?? [];
}

async function driveDownload(fileId: string, name: string, token: string): Promise<File> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&${SD_PARAMS}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive download error ${res.status} for "${name}"`);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type });
}

async function driveRename(fileId: string, newName: string, token: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?${SD_PARAMS}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    }
  );
  if (!res.ok) throw new Error(`Drive rename error ${res.status}: ${await res.text()}`);
}

/* ── Other helpers ───────────────────────────────────────────────────── */
async function extractPdfText(file: File): Promise<string> {
  try {
    const ab  = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    let text  = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve((e.target?.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
    const resp     = await fetch("/api/invoice/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (!json.ok || !json.invoice) return null;
    const inv    = json.invoice as Record<string, any>;
    const vendor = (typeof inv.vendor === "string" && inv.vendor.trim()) ? inv.vendor.trim() : null;
    let date: Date | null = null;
    const rawDate = inv.issueDate || inv.dueDate;
    if (rawDate) { const d = new Date(rawDate); if (!isNaN(d.getTime())) date = d; }
    let total: number | null = null;
    if (typeof inv.amount === "number" && !isNaN(inv.amount)) { total = inv.amount; }
    else if (typeof inv.amount === "string") { const n = parseFloat(inv.amount.replace(/[^0-9.]/g, "")); if (!isNaN(n) && n > 0) total = n; }
    const docType: "invoice" | "receipt" | "other" = inv.invoiceNo ? "invoice" : (total !== null ? "receipt" : "other");
    if (!vendor && !date) return null;
    return { vendor, date, total, docType };
  } catch { return null; }
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
  const [resultSummary, setResultSummary] = useState<{ ok: number; errors: FileRow[] }>({ ok: 0, errors: [] });
  const [driveError, setDriveError]       = useState<string | null>(null);

  // Drive folder browser
  const [browseOpen, setBrowseOpen]       = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseSection, setBrowseSection] = useState<BrowseSection>("myDrive");
  const [browseFolderId, setBrowseFolderId] = useState("root");
  const [browseFolderName, setBrowseFolderName] = useState("My Drive");
  const [browseSharedDriveId, setBrowseSharedDriveId] = useState<string | null>(null);
  const [browsePath, setBrowsePath]       = useState<{ id: string; name: string; driveId?: string }[]>([]);
  const [browseItems, setBrowseItems]     = useState<DriveItem[]>([]);
  const [browseSharedDrives, setBrowseSharedDrives] = useState<SharedDrive[]>([]);
  const [browseError, setBrowseError]     = useState<string | null>(null);

  /* ── Theme ─────────────────────────────────────────────────────────── */
  const bg    = isLight ? "bg-slate-100"              : "bg-[#070b12]";
  const card  = isLight ? "bg-white border-slate-200"  : "bg-[#0d111a] border-[#1a2235]";
  const text  = isLight ? "text-slate-900"             : "text-white";
  const muted = isLight ? "text-slate-500"             : "text-[#888]";
  const border = isLight ? "border-slate-200"          : "border-[#1a2235]";
  const inputCls = `w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${
    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#111] border-[#333] text-white"
  }`;
  const cl = (...cs: (string | false | undefined)[]) => cs.filter(Boolean).join(" ");

  /* ── Drive browser ──────────────────────────────────────────────────── */
  const openDriveBrowser = async () => {
    setDriveError(null);
    const token = getAccessToken();
    if (!token) {
      setDriveError("Not signed in to Google. Please sign in from the main dashboard first.");
      return;
    }
    setBrowseOpen(true);
    setBrowseSection("myDrive");
    setBrowsePath([]);
    setBrowseFolderId("root");
    setBrowseFolderName("My Drive");
    setBrowseSharedDriveId(null);
    setBrowseSharedDrives([]);
    await loadBrowseFolder("root", "myDrive", null, token);
  };

  const loadBrowseFolder = async (
    folderId: string,
    section: BrowseSection,
    sharedDriveId: string | null,
    token?: string
  ) => {
    const tok = token || getAccessToken();
    if (!tok) { setBrowseError("No access token — please sign in again."); return; }
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      if (section === "sharedDrives" && folderId === "shared-drives") {
        // List shared drives themselves
        const drives = await listSharedDrives(tok);
        setBrowseSharedDrives(drives);
        setBrowseItems([]);
      } else if (section === "sharedWithMe" && folderId === "shared-with-me") {
        // List folders shared with me
        const items = await listSharedWithMe(tok);
        setBrowseItems(items);
      } else {
        const items = await driveList(folderId, tok, sharedDriveId ?? undefined);
        setBrowseItems(items);
      }
    } catch (e: any) {
      setBrowseError(e?.message || "Failed to load Drive folder.");
    } finally {
      setBrowseLoading(false);
    }
  };

  const browseInto = async (item: DriveItem) => {
    if (item.mimeType !== FOLDER_MIME) return;
    const tok = getAccessToken();
    if (!tok) return;
    setBrowsePath(prev => [...prev, { id: browseFolderId, name: browseFolderName, driveId: browseSharedDriveId ?? undefined }]);
    setBrowseFolderId(item.id);
    setBrowseFolderName(item.name);
    await loadBrowseFolder(item.id, browseSection, browseSharedDriveId, tok);
  };

  const browseIntoSharedDrive = async (drive: SharedDrive) => {
    const tok = getAccessToken();
    if (!tok) return;
    setBrowsePath([{ id: "shared-drives", name: "Shared drives" }]);
    setBrowseFolderId(drive.id);
    setBrowseFolderName(drive.name);
    setBrowseSharedDriveId(drive.id);
    setBrowseSection("sharedDrives");
    await loadBrowseFolder(drive.id, "sharedDrives", drive.id, tok);
  };

  const goToSection = async (section: BrowseSection) => {
    const tok = getAccessToken();
    if (!tok) return;
    setBrowseSection(section);
    setBrowsePath([]);
    setBrowseSharedDriveId(null);
    if (section === "myDrive") {
      setBrowseFolderId("root");
      setBrowseFolderName("My Drive");
      await loadBrowseFolder("root", "myDrive", null, tok);
    } else if (section === "sharedDrives") {
      setBrowseFolderId("shared-drives");
      setBrowseFolderName("Shared drives");
      await loadBrowseFolder("shared-drives", "sharedDrives", null, tok);
    } else {
      setBrowseFolderId("shared-with-me");
      setBrowseFolderName("Shared with me");
      await loadBrowseFolder("shared-with-me", "sharedWithMe", null, tok);
    }
  };

  const browseBack = async (toIndex: number) => {
    const tok = getAccessToken();
    if (!tok) return;
    if (toIndex < 0) {
      // Back to section root
      if (browseSection === "myDrive") {
        setBrowsePath([]);
        setBrowseFolderId("root");
        setBrowseFolderName("My Drive");
        setBrowseSharedDriveId(null);
        await loadBrowseFolder("root", "myDrive", null, tok);
      } else if (browseSection === "sharedDrives") {
        setBrowsePath([]);
        setBrowseFolderId("shared-drives");
        setBrowseFolderName("Shared drives");
        setBrowseSharedDriveId(null);
        setBrowseSharedDrives([]);
        await loadBrowseFolder("shared-drives", "sharedDrives", null, tok);
      } else {
        setBrowsePath([]);
        setBrowseFolderId("shared-with-me");
        setBrowseFolderName("Shared with me");
        await loadBrowseFolder("shared-with-me", "sharedWithMe", null, tok);
      }
    } else {
      const target = browsePath[toIndex];
      setBrowsePath(prev => prev.slice(0, toIndex));
      setBrowseFolderId(target.id);
      setBrowseFolderName(target.name);
      const driveId = target.driveId ?? browseSharedDriveId;
      setBrowseSharedDriveId(driveId ?? null);
      await loadBrowseFolder(target.id, browseSection, driveId ?? null, tok);
    }
  };

  const selectDriveFolder = async () => {
    const tok = getAccessToken();
    if (!tok) { setBrowseError("No access token."); return; }

    // For shared drive root listing (driveId = folderId), need to list all files in drive root
    // browseItems already contains the listed files/folders from loadBrowseFolder
    const supportedFiles = browseItems.filter(item => {
      if (item.mimeType === FOLDER_MIME) return false;
      const ext = "." + item.name.split(".").pop()!.toLowerCase();
      return SUPPORTED_EXTS.has(ext);
    });

    if (!supportedFiles.length) {
      setBrowseError("No PDF or image files found in this folder. Navigate into a subfolder.");
      return;
    }

    setBrowseOpen(false);
    setDirName(browseFolderName);
    setStage("scanning");
    setProgress({ current: 0, total: supportedFiles.length, file: "", substage: "Starting…" });

    try {
      const newRows: FileRow[] = [];

      for (let i = 0; i < supportedFiles.length; i++) {
        const driveFile = supportedFiles[i];
        const name   = driveFile.name;
        const dotIdx = name.lastIndexOf(".");
        const ext    = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : "";
        const isPdf  = ext === ".pdf";

        setProgress(p => ({ ...p, current: i + 1, file: name, substage: "Downloading from Drive…" }));

        let file: File;
        try {
          file = await driveDownload(driveFile.id, name, tok);
        } catch (e: any) {
          // Skip files that fail to download
          console.warn(`Skip "${name}":`, e?.message);
          continue;
        }

        let vendor:   string | null = null;
        let dateObj:  Date   | null = null;
        let total:    number | null = null;
        let docType   = "other";
        let rawText   = "";
        let scanMethod: ScanMethod = "failed";

        if (isPdf) {
          setProgress(p => ({ ...p, substage: "Reading PDF…" }));
          try { rawText = await extractPdfText(file); } catch {}

          const richText = rawText.replace(/\s+/g, " ").trim().length > 150;
          if (richText) {
            docType  = detectDocType(rawText);
            vendor   = findVendor(rawText);
            dateObj  = findDate(rawText, docType);
            total    = findTotal(rawText, docType);
            scanMethod = "pdftext";
          } else {
            setProgress(p => ({ ...p, substage: "AI scanning (scanned PDF)…" }));
            const g = await tryGeminiScan(file);
            if (g) {
              vendor = g.vendor; dateObj = g.date; total = g.total; docType = g.docType;
              scanMethod = "gemini";
            } else {
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
          setProgress(p => ({ ...p, substage: "AI scanning…" }));
          const g = await tryGeminiScan(file);
          if (g) {
            vendor = g.vendor; dateObj = g.date; total = g.total; docType = g.docType;
            scanMethod = "gemini";
          } else {
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
          fileObj: file,
          driveFileId: driveFile.id,
          original: name, ext, newName,
          vendor: vendor || "",
          date: dateObj ? formatDate(dateObj) : "",
          total: total != null ? `$${total.toFixed(2)}` : "",
          docType, complete, rawText, scanMethod,
          selected: complete,
          status: "idle",
        });
      }

      if (!newRows.length) {
        alert("No files could be read from Drive. Check your access and try again.");
        setStage("pick");
        return;
      }

      setRows(newRows);
      setStage("preview");

    } catch (e: any) {
      console.error("Receipt Renamer Drive scan error:", e);
      alert(`Scan failed: ${(e as Error)?.message ?? String(e)}`);
      setStage("pick");
    }
  };

  /* ── Apply renames via Drive API ─────────────────────────────────── */
  const applyRenames = async () => {
    const toRename = rows.filter(r => r.selected && r.newName && r.newName !== r.original);
    if (!toRename.length) return;

    const tok = getAccessToken();
    if (!tok) {
      alert("Not signed in to Google. Please sign in from the main dashboard first.");
      return;
    }

    setStage("applying");

    // Learn manual vendor corrections
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
        await driveRename(row.driveFileId, sanitizeFilename(row.newName), tok);
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
    const merged  = { ...row, ...patch };
    const vendor  = merged.vendor || null;
    const dateObj = merged.date ? new Date(merged.date + "T00:00:00") : null;
    const totalNum = merged.total ? parseFloat(merged.total.replace(/[^0-9.]/g, "")) || null : null;
    const newName = sanitizeFilename(buildFilename(vendor, dateObj, totalNum, merged.ext, merged.docType as any, merged.rawText));
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

  // Drive browser: folders first, then supported files
  const browseFolders = browseItems.filter(i => i.mimeType === FOLDER_MIME);
  const browseFiles   = browseItems.filter(i => {
    if (i.mimeType === FOLDER_MIME) return false;
    const ext = "." + i.name.split(".").pop()!.toLowerCase();
    return SUPPORTED_EXTS.has(ext);
  });
  const browseOther   = browseItems.filter(i => {
    if (i.mimeType === FOLDER_MIME) return false;
    const ext = "." + i.name.split(".").pop()!.toLowerCase();
    return !SUPPORTED_EXTS.has(ext);
  });

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className={cl("flex-1 flex flex-col h-full overflow-hidden", bg, text)}>

      {/* ── Header ── */}
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
            <p className="text-[10px] text-white/50">Renames files directly in Google Drive · AI-powered</p>
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

      <div className="flex-1 overflow-y-auto">

        {/* ════ PICK ══════════════════════════════════════════════════════ */}
        {stage === "pick" && (
          <div className="flex flex-col items-center justify-center min-h-full p-6 gap-5">

            {driveError && (
              <div className={cl("w-full max-w-lg rounded-xl border p-4 flex items-start gap-3", isLight ? "bg-red-50 border-red-200" : "bg-red-950/20 border-red-700/40")}>
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-500 mb-1">Drive access error</p>
                  <p className="text-xs text-red-600 dark:text-red-300/80">{driveError}</p>
                </div>
              </div>
            )}

            <div className={cl(
              "w-full max-w-lg rounded-2xl border p-8 text-center relative overflow-hidden",
              isLight ? "bg-white border-slate-200 shadow-lg" : "bg-[#0d111a] border-[#1a2235]"
            )}>
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-emerald-500/5 rounded-full blur-3xl" />
              </div>
              <div className="relative">
                <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-emerald-500/30" style={{ width: 72, height: 72 }}>
                  <ScanLine className="w-9 h-9 text-white" />
                </div>
                <h2 className={cl("text-2xl font-extrabold mb-2", text)}>Receipt Renamer</h2>
                <p className={cl("text-sm mb-6 leading-relaxed max-w-sm mx-auto", muted)}>
                  Pick a folder in your Google Drive. The tool reads vendor, date & amount — then renames files{" "}
                  <strong className={isLight ? "text-emerald-700" : "text-emerald-400"}>directly in Drive</strong>.
                </p>

                <button
                  onClick={openDriveBrowser}
                  className={cl(
                    "w-full py-5 rounded-xl border-2 border-dashed transition-all group mb-4 active:scale-[.99]",
                    isLight
                      ? "border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50 bg-emerald-50/50"
                      : "border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/5"
                  )}
                >
                  <FolderOpen className="w-8 h-8 text-emerald-500 mx-auto mb-2 group-hover:scale-110 transition-transform drop-shadow" />
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Browse Google Drive</p>
                  <p className={cl("text-xs mt-0.5", muted)}>PDF · PNG · JPG · TIFF · HEIC</p>
                </button>

                <button
                  onClick={openDriveBrowser}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:opacity-90 active:scale-[.98] transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Select Drive Folder & Scan
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {["Renames in Google Drive", "80+ vendor patterns", "PDF text extraction", "Image OCR", "Invoice vs receipt", "Learns vendor names"].map(f => (
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
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {row.scanMethod === "gemini"   && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">✨ Gemini</span>}
                          {row.scanMethod === "pdftext"  && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">📄 PDF text</span>}
                          {row.scanMethod === "ocr"      && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">👁 OCR</span>}
                          {row.scanMethod === "failed"   && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">✗ no text</span>}
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
                      <tr><td colSpan={10} className={cl("px-4 py-10 text-center text-xs", muted)}>No files match your filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              onClick={applyRenames}
              disabled={selectedCount === 0}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:opacity-90 active:scale-[.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              <FileCheck className="w-5 h-5" />
              Rename {selectedCount} file{selectedCount !== 1 ? "s" : ""} in Google Drive
            </button>
          </div>
        )}

        {/* ════ APPLYING ══════════════════════════════════════════════════ */}
        {stage === "applying" && (
          <div className="flex flex-col items-center justify-center min-h-full p-8">
            <div className={cl("w-full max-w-md rounded-2xl border p-8 text-center", card, "border")}>
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
              <p className={cl("text-sm font-bold", text)}>Renaming files in Google Drive…</p>
              <p className={cl("text-xs mt-1", muted)}>Applying changes via Drive API</p>
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
                {resultSummary.ok} file{resultSummary.ok !== 1 ? "s" : ""} renamed in Drive
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
              <button onClick={() => { setStage("pick"); setRows([]); setDirName(""); }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:opacity-90 transition-all">
                Rename another folder
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Drive Folder Browser Modal ──────────────────────────────────── */}
      {browseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className={cl("w-full max-w-lg flex flex-col shadow-2xl rounded-2xl border overflow-hidden", card, "border")} style={{ height: "70vh" }}>

            {/* Modal header */}
            <div className={cl("flex items-center justify-between px-4 py-3 border-b shrink-0", border)}>
              <div>
                <p className={cl("text-sm font-bold", text)}>Select Drive Folder</p>
                <p className={cl("text-[11px]", muted)}>Navigate to the folder with your receipts</p>
              </div>
              <button onClick={() => setBrowseOpen(false)} className={cl("p-1.5 rounded-lg", isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-white/5 text-[#888]")}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section tabs */}
            <div className={cl("flex gap-1 px-3 py-2 border-b shrink-0", border, isLight ? "bg-slate-50" : "bg-[#0a0e18]")}>
              {([
                { key: "myDrive",      label: "My Drive",        icon: "🗂" },
                { key: "sharedDrives", label: "Shared drives",   icon: "🏢" },
                { key: "sharedWithMe", label: "Shared with me",  icon: "👥" },
              ] as const).map(tab => (
                <button key={tab.key} onClick={() => goToSection(tab.key)}
                  className={cl(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap",
                    browseSection === tab.key
                      ? "bg-emerald-500 text-white"
                      : isLight ? "text-slate-600 hover:bg-slate-200" : "text-[#888] hover:bg-white/5"
                  )}>
                  <span>{tab.icon}</span>{tab.label}
                </button>
              ))}
            </div>

            {/* Breadcrumb */}
            {browsePath.length > 0 && (
              <div className={cl("flex items-center gap-1 px-4 py-1.5 border-b flex-wrap shrink-0 text-[11px]", border)}>
                <button onClick={() => browseBack(-1)} className={cl("font-semibold hover:text-emerald-500 transition-colors", muted)}>
                  {browseSection === "myDrive" ? "My Drive" : browseSection === "sharedDrives" ? "Shared drives" : "Shared with me"}
                </button>
                {browsePath.map((seg, idx) => (
                  <React.Fragment key={seg.id}>
                    <ChevronRight className="w-3 h-3 text-[#555]" />
                    <button onClick={() => browseBack(idx)} className={cl("font-semibold hover:text-emerald-500 transition-colors", muted)}>
                      {seg.name}
                    </button>
                  </React.Fragment>
                ))}
                <ChevronRight className="w-3 h-3 text-[#555]" />
                <span className={cl("font-bold", text)}>{browseFolderName}</span>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-2">
              {browseLoading && (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                </div>
              )}
              {browseError && !browseLoading && (
                <div className={cl("m-3 rounded-lg p-3 border text-xs", isLight ? "bg-red-50 border-red-200 text-red-600" : "bg-red-950/20 border-red-700/40 text-red-400")}>
                  {browseError}
                </div>
              )}
              {!browseLoading && !browseError && (
                <>
                  {/* Shared drives list (root of sharedDrives section) */}
                  {browseSection === "sharedDrives" && browseFolderId === "shared-drives" && (
                    <>
                      {browseSharedDrives.map(drive => (
                        <button key={drive.id} onClick={() => browseIntoSharedDrive(drive)}
                          className={cl("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors", isLight ? "hover:bg-slate-100" : "hover:bg-white/5")}>
                          <span className="text-lg shrink-0">🏢</span>
                          <div className="flex-1 min-w-0">
                            <p className={cl("text-xs font-semibold truncate", text)}>{drive.name}</p>
                            <p className={cl("text-[10px]", muted)}>Shared drive</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-[#666] shrink-0" />
                        </button>
                      ))}
                      {browseSharedDrives.length === 0 && (
                        <p className={cl("text-xs text-center py-8", muted)}>No shared drives found.</p>
                      )}
                    </>
                  )}

                  {/* Regular folder/file listing */}
                  {!(browseSection === "sharedDrives" && browseFolderId === "shared-drives") && (
                    <>
                      {/* Folders */}
                      {browseFolders.map(item => (
                        <button key={item.id} onClick={() => browseInto(item)}
                          className={cl("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors", isLight ? "hover:bg-slate-100" : "hover:bg-white/5")}>
                          <span className="text-lg shrink-0">📁</span>
                          <div className="flex-1 min-w-0">
                            <p className={cl("text-xs font-semibold truncate", text)}>{item.name}</p>
                            <p className={cl("text-[10px]", muted)}>Folder</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-[#666] shrink-0" />
                        </button>
                      ))}
                      {/* Supported files */}
                      {browseFiles.map(item => (
                        <div key={item.id} className={cl("flex items-center gap-3 px-3 py-2 rounded-lg", isLight ? "opacity-60" : "opacity-50")}>
                          <span className="text-lg shrink-0">📄</span>
                          <div className="flex-1 min-w-0">
                            <p className={cl("text-xs font-medium truncate", text)}>{item.name}</p>
                            <p className="text-[10px] text-emerald-500">Will be scanned</p>
                          </div>
                        </div>
                      ))}
                      {/* Other files */}
                      {browseOther.map(item => (
                        <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-lg opacity-30">
                          <span className="text-lg shrink-0">📎</span>
                          <p className={cl("text-xs truncate flex-1", muted)}>{item.name}</p>
                        </div>
                      ))}
                      {browseItems.length === 0 && (
                        <p className={cl("text-xs text-center py-8", muted)}>This folder is empty.</p>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Footer — select this folder */}
            <div className={cl("px-4 py-3 border-t shrink-0", border)}>
              {browseFiles.length > 0 && (
                <p className={cl("text-[11px] mb-2", muted)}>
                  {browseFiles.length} file{browseFiles.length !== 1 ? "s" : ""} will be scanned in <strong className={text}>{browseFolderName}</strong>
                </p>
              )}
              <button
                onClick={selectDriveFolder}
                disabled={browseFiles.length === 0 || browseLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:opacity-90 active:scale-[.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Scan {browseFiles.length} file{browseFiles.length !== 1 ? "s" : ""} in "{browseFolderName}"
              </button>
            </div>
          </div>
        </div>
      )}

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
