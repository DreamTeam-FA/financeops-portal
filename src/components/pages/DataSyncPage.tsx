import React, { useState, useCallback } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import {
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  FileSpreadsheet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Key,
  LogOut,
  Save,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  Zap,
  ExternalLink,
  Link as LinkIcon,
  Copy,
  Archive,
  BarChart3,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  FolderSearch,
  FlaskConical,

  CheckCircle,
  XCircle,
  ShieldAlert,
} from "lucide-react";
import { SheetMappingConfig } from "../../types";
import { emailPasswordSignIn } from "../../services/googleAuth";

export const DataSyncPage: React.FC = () => {
  const {
    apBills,
    bankAccounts,
    loans,
    arItems,
    bankStatements,
    importSheetData,
    logAction,
    googleUser,
    handleGoogleSignIn,
    handleGoogleSignOut,
    sheetMappings,
    updateSheetMapping,
    addCustomSheetMapping,
    deleteSheetMapping,
    syncModuleFromGoogleSheet,
    syncModuleToGoogleSheet,
    autoDetectSheetTabs,
    syncAllFromGoogleSheets,
    syncAllToGoogleSheets,
    isSyncing,
    syncLogs,
    autoPushEnabled,
    setAutoPushEnabled,
    theme,
    externalLinks,
    addExternalLink,
    updateExternalLink,
    deleteExternalLink,
    gasUrls,
    updateGasUrl
  } = useFinance();

  const isLight = theme === "light";

  const [pasteData, setPasteData] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // ── Sheet Continuity state ───────────────────────────────────────────────────
  // configKey matches the key accepted by /api/config/set-sheet-id
  // mappingMatch: string that appears in sheetMappings[].spreadsheetIdOrUrl for bulk-switch
  const TRACKED_SHEETS = [
    { id: "15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs", label: "Main Finance", desc: "AP, AR, Banks, Loans, Bank Statements (6 mappings)",    configKey: "main",       mappingMatch: "15uYsYttv4x" },
    { id: "1SITtQDT3iFo5yIOBgjbERbqJjYJ8rk6drXwkLm3sAGE", label: "4YR Payroll",  desc: "Payroll data, timesheets, employee records",            configKey: "payroll4yr", mappingMatch: "1SITtQDT3iFo" },
    { id: "1gKCKrWw8mkqJDiRl_9xYIhkzmtjOEoauQZgbtW9gIew", label: "CC Expense",   desc: "Credit card transactions & adjustments",                configKey: "cc",         mappingMatch: "1gKCKrWw8mkq" },
    { id: "1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo", label: "Calendar",     desc: "Events, schedule & calendar overrides",                 configKey: "calendar",   mappingMatch: "1ChoHr7dsfai" },
  ];
  const LIMIT = 10_000_000;

  type SheetUsage = { title: string; tabs: { title: string; rows: number; cols: number; cells: number }[]; totalCells: number; };
  const [usageMap, setUsageMap]     = useState<Record<string, SheetUsage>>({});
  const [loadingUsage, setLoadingUsage] = useState<Record<string, boolean>>({});
  const [cloningSheet, setCloningSheet] = useState<Record<string, boolean>>({});
  const [cloneResults, setCloneResults] = useState<Record<string, { name: string; url: string; newId: string } | null>>({});
  const [mappingsSwitched, setMappingsSwitched] = useState<Record<string, boolean>>({});
  // Manual switch: { [sheetId]: inputValue }
  const [manualIds, setManualIds]       = useState<Record<string, string>>({});
  const [manualSwitching, setManualSwitching] = useState<Record<string, boolean>>({});
  const [showManual, setShowManual]     = useState<Record<string, boolean>>({});

  // ── 3-layer confirmation modal state ────────────────────────────────────────
  type ConfirmTarget = {
    sheet: typeof TRACKED_SHEETS[number];
    newId: string;
    newUrl: string;
    isManual: boolean;
  };
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [confirmStep, setConfirmStep] = useState<1 | 2 | 3>(1);
  const [confirmTyped, setConfirmTyped] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmShowPw, setConfirmShowPw] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmVerifying, setConfirmVerifying] = useState(false);

  // ── Integration Test state ───────────────────────────────────────────────────
  type TestCheck = { name: string; ok: boolean; detail: string };
  type TestResult = { ok: boolean; passed: number; failed: number; total: number; checks: TestCheck[]; runAt: string } | null;
  const [testRunning, setTestRunning]   = useState(false);
  const [testResult, setTestResult]     = useState<TestResult>(null);
  const [testError, setTestError]       = useState<string | null>(null);

  const runIntegrationTest = useCallback(async () => {
    setTestRunning(true);
    setTestResult(null);
    setTestError(null);
    try {
      const res = await fetch("/api/integration-test");
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data: TestResult = await res.json();
      setTestResult(data);
    } catch (e: any) {
      setTestError(e?.message || "Unknown error");
    } finally {
      setTestRunning(false);
    }
  }, []);

  // ── Bill Link Manager state ──────────────────────────────────────────────────
  const [billPasteLinks, setBillPasteLinks] = useState("");
  const [billResolveLoading, setBillResolveLoading] = useState(false);
  const [billResolveError, setBillResolveError] = useState<string | null>(null);
  type BillMatchRow = { fileId: string; fileName: string; url: string; matchedBill: any | null; reason: string };
  const [billMatchPreview, setBillMatchPreview] = useState<BillMatchRow[]>([]);
  const [billApplying, setBillApplying] = useState(false);
  const [billApplyResult, setBillApplyResult] = useState<{ cleared: number; written: number } | null>(null);
  const [billApplyError, setBillApplyError] = useState<string | null>(null);

  const extractFileIds = (text: string): string[] => {
    const pattern = /\/file\/d\/([A-Za-z0-9_\-]+)\//g;
    const ids = new Set<string>();
    let m;
    while ((m = pattern.exec(text)) !== null) ids.add(m[1]);
    return [...ids];
  };

  const resolveAndMatch = useCallback(async () => {
    const fileIds = extractFileIds(billPasteLinks);
    if (!fileIds.length) { setBillResolveError("No valid Drive file links found. Paste links like https://drive.google.com/file/d/.../view"); return; }
    setBillResolveLoading(true);
    setBillResolveError(null);
    setBillMatchPreview([]);
    setBillApplyResult(null);
    try {
      const { getAccessToken } = await import("../../services/googleAuth");
      const token = await getAccessToken();
      if (!token) throw new Error("Not signed in to Google. Connect your account first.");
      const resp = await fetch("/api/drive/resolve-file-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, userAccessToken: token }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error);
      const files: { id: string; name: string; webViewLink: string }[] = data.files;

      const n = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

      const preview: BillMatchRow[] = files.map(f => {
        const bare = f.name.replace(/\.[^.]+$/, "");
        const parts = bare.split("_");

        if (parts.length < 2) return { fileId: f.id, fileName: f.name, url: f.webViewLink, matchedBill: null, reason: "filename too short to parse" };

        // Last segment must be YYYY-MM-DD
        const datePart = parts[parts.length - 1];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return { fileId: f.id, fileName: f.name, url: f.webViewLink, matchedBill: null, reason: "no YYYY-MM-DD date at end of filename" };

        const entityPart = parts[0];
        const middle = parts.slice(1, -1); // between entity and date

        // If 2+ middle segments and the last middle segment contains digits → treat as invoice#
        let invoicePart: string | null = null;
        let vendorParts = middle;
        if (middle.length >= 2 && /\d/.test(middle[middle.length - 1])) {
          invoicePart = middle[middle.length - 1];
          vendorParts = middle.slice(0, -1);
        }
        const vendorStr = vendorParts.join(" ");

        const feN = n(entityPart);
        const fiN = invoicePart ? n(invoicePart) : null;
        const fvN = n(vendorStr);

        // ── Step 1: Invoice# match (most reliable) ──────────────────────────
        if (fiN) {
          const invMatches = (apBills as any[]).filter((b: any) =>
            n(b.entity) === feN && b.invoiceNo && n(b.invoiceNo) === fiN
          );
          if (invMatches.length === 1)
            return { fileId: f.id, fileName: f.name, url: f.webViewLink, matchedBill: invMatches[0], reason: `✓ Invoice# match: ${invoicePart}` };
          if (invMatches.length > 1)
            return { fileId: f.id, fileName: f.name, url: f.webViewLink, matchedBill: null, reason: `Ambiguous — ${invMatches.length} bills share invoice# ${invoicePart}` };
        }

        // ── Step 2: Date + vendor match ──────────────────────────────────────
        if (fvN) {
          const dateVendorMatches = (apBills as any[]).filter((b: any) => {
            if (n(b.entity) !== feN) return false;
            const dateOk = b.dueDate === datePart || b.invoiceDate === datePart;
            if (!dateOk) return false;
            const bvN = n(b.vendor || "");
            return bvN === fvN || bvN.includes(fvN) || fvN.includes(bvN);
          });
          if (dateVendorMatches.length === 1)
            return { fileId: f.id, fileName: f.name, url: f.webViewLink, matchedBill: dateVendorMatches[0], reason: `✓ Date + vendor match` };
          if (dateVendorMatches.length > 1)
            return { fileId: f.id, fileName: f.name, url: f.webViewLink, matchedBill: null, reason: `Ambiguous — ${dateVendorMatches.length} bills match date+vendor` };
        }

        // ── Step 3: Vendor-only (low confidence, flag it) ───────────────────
        if (fvN) {
          const vendorOnly = (apBills as any[]).filter((b: any) => {
            if (n(b.entity) !== feN) return false;
            const bvN = n(b.vendor || "");
            return bvN === fvN || bvN.includes(fvN) || fvN.includes(bvN);
          });
          if (vendorOnly.length === 1)
            return { fileId: f.id, fileName: f.name, url: f.webViewLink, matchedBill: vendorOnly[0], reason: `⚠ Vendor-only match (no date match — verify before applying)` };
        }

        return { fileId: f.id, fileName: f.name, url: f.webViewLink, matchedBill: null, reason: "no matching bill found" };
      });

      setBillMatchPreview(preview);
    } catch (e: any) {
      setBillResolveError(e?.message || "Unknown error");
    } finally {
      setBillResolveLoading(false);
    }
  }, [billPasteLinks, apBills]);

  const applyBillLinks = useCallback(async () => {
    setBillApplying(true);
    setBillApplyResult(null);
    setBillApplyError(null);
    try {
      const { getAccessToken } = await import("../../services/googleAuth");
      const token = await getAccessToken();
      if (!token) throw new Error("Not signed in to Google.");
      const AP_SHEET_ID = "15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs";

      // Only write the matched rows — do NOT bulk-clear the portal's local state
      // (stale local state writing back is what causes links to reappear on sheet)
      const writeItems = billMatchPreview
        .filter(p => p.matchedBill?.row && p.matchedBill?.entity)
        .map(p => ({ row: p.matchedBill.row, entity: p.matchedBill.entity, driveViewUrl: p.url }));

      if (!writeItems.length) { setBillApplyError("No matched bills to write."); return; }

      // Use batch-write (overwrites existing values on the matched rows only)
      const resp = await fetch("/api/drive/batch-write-drive-urls", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAccessToken: token, spreadsheetId: AP_SHEET_ID, items: writeItems }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || "Server error");
      setBillApplyResult({ cleared: 0, written: data.written || writeItems.length });
    } catch (e: any) {
      setBillApplyError(e?.message || "Unknown error");
    } finally {
      setBillApplying(false);
    }
  }, [billMatchPreview]);

  const openConfirm = useCallback((target: ConfirmTarget) => {
    setConfirmTarget(target);
    setConfirmStep(1);
    setConfirmTyped("");
    setConfirmEmail(googleUser?.email || "");
    setConfirmPassword("");
    setConfirmShowPw(false);
    setConfirmError(null);
  }, [googleUser]);

  const closeConfirm = () => {
    setConfirmTarget(null);
    setConfirmTyped("");
    setConfirmPassword("");
    setConfirmError(null);
  };

  const fetchUsage = useCallback(async (sheetId: string) => {
    setLoadingUsage(m => ({ ...m, [sheetId]: true }));
    try {
      const { getAccessToken } = await import("../../services/googleAuth");
      const token = await getAccessToken();
      if (!token) throw new Error("Not signed in to Google");
      const resp = await fetch(`/api/sheets/usage?spreadsheetId=${sheetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error);
      setUsageMap(m => ({ ...m, [sheetId]: data }));
    } catch (e: any) {
      alert(`Usage check failed: ${e?.message}`);
    } finally {
      setLoadingUsage(m => ({ ...m, [sheetId]: false }));
    }
  }, []);

  const cloneBlank = useCallback(async (sheetId: string, label: string) => {
    if (!confirm(`Create a blank clone of "${label}"?\n\nThis will:\n• Make an exact copy of the spreadsheet\n• Clear all data rows (keeps headers + formatting)\n• Leave the original untouched\n\nThe clone URL will be shown — update your sheet mappings to use it.`)) return;
    setCloningSheet(m => ({ ...m, [sheetId]: true }));
    setCloneResults(m => ({ ...m, [sheetId]: null }));
    try {
      const { getAccessToken } = await import("../../services/googleAuth");
      const token = await getAccessToken();
      if (!token) throw new Error("Not signed in to Google");
      const resp = await fetch("/api/sheets/clone-blank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token, spreadsheetId: sheetId }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error);
      setCloneResults(m => ({ ...m, [sheetId]: { name: data.newName, url: data.webViewLink, newId: data.newSpreadsheetId } }));
    } catch (e: any) {
      alert(`Clone failed: ${e?.message}`);
    } finally {
      setCloningSheet(m => ({ ...m, [sheetId]: false }));
    }
  }, []);

  // The actual switch — only called after all 3 confirmation layers pass
  const executeSwitch = useCallback(async (
    sheet: typeof TRACKED_SHEETS[number],
    newSheetId: string,
    newSheetUrl: string,
    authorEmail: string,
  ) => {
    // 1. Update any sheetMappings that reference the old ID
    const affected = sheetMappings.filter(m => m.spreadsheetIdOrUrl.includes(sheet.mappingMatch));
    affected.forEach(m => updateSheetMapping(m.id, { spreadsheetIdOrUrl: newSheetUrl }));

    // 2. Persist the override on the server
    try {
      await fetch("/api/config/set-sheet-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: sheet.configKey, id: newSheetId }),
      });
    } catch { /* non-fatal */ }

    // 3. Audit log — records who authorised the switch and full details
    logAction(
      "Sheet Source Switched",
      `[${sheet.label}] switched from ${sheet.id} → ${newSheetId} | Authorised by: ${authorEmail} | Affected mappings: ${affected.length} | New URL: ${newSheetUrl}`
    );

    setMappingsSwitched(s => ({ ...s, [sheet.id]: true }));
  }, [sheetMappings, updateSheetMapping, logAction]);

  // Opens the 3-layer confirm modal (called from "Switch Portal" button and manual switch)
  const switchAllMappings = useCallback((
    oldSheetId: string,
    newSheetId: string,
    newSheetUrl: string,
    configKey: string,
    mappingMatch: string,
  ) => {
    const sheet = TRACKED_SHEETS.find(s => s.id === oldSheetId);
    if (!sheet) return;
    openConfirm({ sheet, newId: newSheetId, newUrl: newSheetUrl, isManual: false });
  }, [openConfirm]);

  // Manually switch to any sheet ID the user pastes in — routes through confirm modal
  const manualSwitch = useCallback((sheet: typeof TRACKED_SHEETS[number]) => {
    const rawInput = (manualIds[sheet.id] || "").trim();
    const idMatch = rawInput.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,60})/);
    const newId = idMatch ? idMatch[1] : rawInput;
    if (!newId || !/^[A-Za-z0-9_-]{20,60}$/.test(newId)) {
      alert("Paste a valid Google Sheets URL or spreadsheet ID.");
      return;
    }
    if (newId === sheet.id) {
      alert("That's the same sheet that's already active.");
      return;
    }
    const newUrl = `https://docs.google.com/spreadsheets/d/${newId}/edit`;
    setShowManual(s => ({ ...s, [sheet.id]: false }));
    setManualIds(m => ({ ...m, [sheet.id]: "" }));
    openConfirm({ sheet, newId, newUrl, isManual: true });
  }, [manualIds, openConfirm]);

  // Local state for editing sheet configs keyed by mapping.id
  const [editingConfigs, setEditingConfigs] = useState<Record<string, SheetMappingConfig>>({});

  // New custom mapping form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMappingName, setNewMappingName] = useState("");
  const [newMappingModule, setNewMappingModule] = useState<SheetMappingConfig["module"]>("ap");
  const [newMappingUrl, setNewMappingUrl] = useState("");
  const [newMappingTab, setNewMappingTab] = useState("");

  // New External Link modal state
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkCategory, setNewLinkCategory] = useState<"entities" | "quicklinks">("entities");
  const [newLinkIcon, setNewLinkIcon] = useState<"sheet" | "mail" | "calendar" | "users" | "link">("sheet");

  const handleCreateExternalLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkName || !newLinkUrl) return;
    addExternalLink({
      name: newLinkName,
      url: newLinkUrl,
      category: newLinkCategory,
      iconType: newLinkIcon
    });
    setNewLinkName("");
    setNewLinkUrl("");
    setShowAddLinkModal(false);
  };

  const handleConfigChange = (id: string, field: keyof SheetMappingConfig, value: string) => {
    const current = editingConfigs[id] || sheetMappings.find((m) => m.id === id);
    if (!current) return;
    setEditingConfigs((prev) => ({
      ...prev,
      [id]: {
        ...current,
        [field]: value
      }
    }));
  };

  const handleSaveConfig = (id: string) => {
    const updated = editingConfigs[id];
    if (updated) {
      updateSheetMapping(id, updated);
    }
  };

  const handleCreateCustomMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMappingName || !newMappingUrl) {
      return;
    }
    addCustomSheetMapping({
      module: newMappingModule,
      name: newMappingName,
      spreadsheetIdOrUrl: newMappingUrl,
      tabName: newMappingTab || "Sheet1",
      range: "",
      status: "connected"
    });
    setNewMappingName("");
    setNewMappingUrl("");
    setNewMappingTab("");
    setShowAddModal(false);

  };

  const handleExportJSON = () => {
    const fullState = {
      ap: apBills,
      banks: bankAccounts,
      loans,
      ar: arItems,
      statements: bankStatements
    };
    const jsonStr = JSON.stringify(fullState, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FinanceOps_Portal_Export_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    logAction("Exported JSON Data", "Downloaded full FinanceOps dataset.");
  };

  const handleImportPastedJSON = () => {
    if (!pasteData) return;
    try {
      const parsed = JSON.parse(pasteData);
      importSheetData(parsed);
      setImportStatus("Successfully imported and updated portal data!");
      setPasteData("");
    } catch (e) {
      setImportStatus("Error parsing JSON data. Please ensure valid format.");
    }
  };


  // ── Shared style tokens ──────────────────────────────────────────────────────
  const card  = isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]";
  const inner = isLight ? "bg-slate-50 border-slate-200" : "bg-[#070b12] border-[#1a2235]";
  const divider = isLight ? "border-slate-100" : "border-[#1a2235]";
  const label = isLight ? "text-slate-500" : "text-[#666]";
  const muted = isLight ? "text-slate-400" : "text-[#555]";
  const heading = isLight ? "text-slate-900" : "text-white";
  const sub   = isLight ? "text-slate-500" : "text-[#888]";
  const inp   = `w-full rounded-lg border px-3 py-2 text-xs focus:outline-none transition-colors ${isLight ? "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-[#1a73e8]" : "bg-[#070b12] border-[#1a2235] text-white placeholder-[#444] focus:border-[#1a73e8]"}`;
  const btnGhost = `px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200" : "bg-[#0d111a] hover:bg-[#1a2235] text-[#aaa] hover:text-white border border-[#1a2235]"}`;

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-50 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader title="Settings & Data Sync" bgClass={isLight ? "bg-slate-800 text-white" : "bg-[#0d111a] border-b border-[#1a2235]"} />

      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* ── 1. Google Connection ─────────────────────────────────────────── */}
        <div className={`border rounded-2xl overflow-hidden ${card}`}>
          {/* Header row */}
          <div className={`flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b ${divider}`}>
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${googleUser ? "bg-emerald-500/15 text-emerald-500" : "bg-[#1a73e8]/15 text-[#1a73e8]"}`}>
                <Key className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm font-bold ${heading}`}>Google Workspace</h2>
                  {googleUser
                    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">Connected</span>
                    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/20">Not connected</span>
                  }
                </div>
                <p className={`text-xs mt-0.5 ${sub}`}>
                  {googleUser
                    ? `${googleUser.email || "accounting@marktimm.com"} · read & write access granted`
                    : "Connect your Google account to enable live 2-way sync with Google Sheets."}
                </p>
              </div>
            </div>
            {googleUser ? (
              <button onClick={handleGoogleSignOut} className={btnGhost}>
                <LogOut className="w-3.5 h-3.5" /> Sign Out
              </button>
            ) : (
              <button onClick={handleGoogleSignIn} className="px-4 py-2 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold flex items-center gap-2 transition-colors">
                <Key className="w-4 h-4" /> Sign in with Google
              </button>
            )}
          </div>

          {/* Sync controls */}
          <div className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 ${isLight ? "bg-slate-50" : "bg-[#070b12]/60"}`}>
            <button
              onClick={() => setAutoPushEnabled(!autoPushEnabled)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                autoPushEnabled
                  ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/25"
                  : isLight ? "bg-white text-slate-500 border-slate-200 hover:border-slate-300" : "bg-[#0d111a] text-[#666] border-[#1a2235] hover:text-[#aaa]"
              }`}
              title="When enabled, dashboard edits instantly push back to Google Sheets"
            >
              <Zap className={`w-3.5 h-3.5 ${autoPushEnabled ? "fill-emerald-500" : ""}`} />
              Auto-Push {autoPushEnabled ? "ON" : "OFF"}
            </button>
            <div className="flex items-center gap-2">
              <button onClick={syncAllFromGoogleSheets} disabled={isSyncing}
                className="px-4 py-2 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50">
                <ArrowDownToLine className={`w-3.5 h-3.5 ${isSyncing ? "animate-bounce" : ""}`} />
                Pull All
              </button>
              <button onClick={() => syncAllToGoogleSheets(true)} disabled={isSyncing}
                className="px-4 py-2 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50">
                <ArrowUpFromLine className="w-3.5 h-3.5" />
                Push All
              </button>
            </div>
          </div>
        </div>

        {/* ── 2. GAS Dashboard URLs ────────────────────────────────────────── */}
        <div className={`border rounded-2xl p-6 space-y-4 ${card}`}>
          <div className="flex items-start gap-3">
            <Zap className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <h3 className={`text-sm font-bold ${heading}`}>GAS Dashboard URLs</h3>
              <p className={`text-xs mt-0.5 ${sub}`}>Google Apps Script web app URLs for each entity dashboard. Changes are saved cross-user via the shared config sheet.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { key: "curcumin", label: "CurcuminPRO",               color: "text-amber-500",   dot: "bg-amber-500" },
              { key: "fouryr",   label: "4YR Payroll",                color: "text-emerald-500", dot: "bg-emerald-500" },
              { key: "ziglar",   label: "Ziglar",                     color: "text-purple-400",  dot: "bg-purple-400" },
              { key: "msdx",     label: "Mobile Swallowing (MSDx)",   color: "text-teal-400",    dot: "bg-teal-400" },
            ].map(({ key, label: lbl, color, dot }) => (
              <div key={key} className={`rounded-xl border p-4 space-y-2.5 ${inner}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  <span className={`text-xs font-bold ${color}`}>{lbl}</span>
                </div>
                <input
                  type="url"
                  value={(gasUrls as any)?.[key] || ""}
                  onChange={(e) => updateGasUrl(key as any, e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className={`${inp} font-mono text-[11px]`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── 3. Sheet Mappings ────────────────────────────────────────────── */}
        <div className={`border rounded-2xl overflow-hidden ${card}`}>
          <div className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b ${divider}`}>
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-4 h-4 text-[#1a73e8] shrink-0" />
              <div>
                <h3 className={`text-sm font-bold ${heading}`}>Sheet Mappings</h3>
                <p className={`text-xs ${sub}`}>Configure the source Google Sheet for each module. Auto-Detect reads tab names directly from the Sheets API.</p>
              </div>
            </div>
            <button onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Mapping
            </button>
          </div>

          <div className={`divide-y ${isLight ? "divide-slate-100" : "divide-[#0f1520]"}`}>
            {sheetMappings.map((cfg) => {
              const currentEdit = editingConfigs[cfg.id] || cfg;
              return (
                <div key={cfg.id} className={`px-6 py-4 space-y-3 transition-colors ${isLight ? "hover:bg-slate-50" : "hover:bg-white/[.02]"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wide ${isLight ? "bg-[#1a73e8]/10 text-[#1a73e8]" : "bg-[#1a73e8]/15 text-[#60a5fa]"}`}>
                        {cfg.name}
                      </span>
                      {cfg.lastSyncedAt && (
                        <span className={`text-[11px] flex items-center gap-1 ${muted}`}>
                          <Clock className="w-3 h-3" /> {cfg.lastSyncedAt}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={async () => {
                          const detected = await autoDetectSheetTabs(cfg.id);
                          if (detected?.length > 0) {
                            const updated = sheetMappings.find(m => m.id === cfg.id);
                            if (updated) setEditingConfigs(p => ({ ...p, [cfg.id]: updated }));
                          }
                        }}
                        disabled={isSyncing}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20"
                      >
                        <Sparkles className="w-3 h-3" /> Auto-Detect
                      </button>
                      <button onClick={() => handleSaveConfig(cfg.id)} className={btnGhost}>
                        <Save className="w-3 h-3" /> Save
                      </button>
                      <button onClick={() => syncModuleFromGoogleSheet(cfg.id)} disabled={isSyncing}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                        <ArrowDownToLine className="w-3 h-3" /> Pull
                      </button>
                      <button onClick={() => syncModuleToGoogleSheet(cfg.id, true)} disabled={isSyncing}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 bg-[#1a73e8]/10 hover:bg-[#1a73e8]/20 text-[#60a5fa] border border-[#1a73e8]/20">
                        <ArrowUpFromLine className="w-3 h-3" /> Push
                      </button>
                      {cfg.id.startsWith("map-custom-") && (
                        <button onClick={() => deleteSheetMapping(cfg.id)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/15 transition-colors" title="Delete mapping">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {[
                      { field: "spreadsheetIdOrUrl", ph: "Spreadsheet URL or ID", lbl: "Spreadsheet" },
                      { field: "tabName",            ph: "Tab name (e.g. AP Bills)", lbl: "Tab" },
                    ].map(({ field, ph, lbl: fl }) => (
                      <div key={field}>
                        <label className={`block text-[10px] font-semibold uppercase tracking-wide mb-1 ${label}`}>{fl}</label>
                        <input type="text"
                          value={(currentEdit as any)[field]}
                          onChange={e => handleConfigChange(cfg.id, field as any, e.target.value)}
                          placeholder={ph}
                          className={inp}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 4. Sync Log ──────────────────────────────────────────────────── */}
        <div className={`border rounded-2xl p-6 space-y-3 ${card}`}>
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-orange-400 shrink-0" />
            <h3 className={`text-sm font-bold ${heading}`}>Sync Activity Log</h3>
          </div>
          <div className={`rounded-xl border p-4 max-h-52 overflow-y-auto space-y-2 font-mono text-[11px] ${inner}`}>
            {syncLogs.length > 0 ? syncLogs.map(log => (
              <div key={log.id} className={`flex items-start justify-between gap-2 pb-2 border-b last:border-0 last:pb-0 ${divider}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${log.status === "SUCCESS" ? "bg-emerald-400" : "bg-red-400"}`} />
                  <span className={`font-bold uppercase ${heading}`}>{log.module}</span>
                  <span className={sub}>{log.direction}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className={`block ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>{log.details}</span>
                  <span className={`text-[10px] ${muted}`}>{log.timestamp}</span>
                </div>
              </div>
            )) : (
              <p className={`text-center py-4 ${muted}`}>No sync activity yet. Pull or Push a module to get started.</p>
            )}
          </div>
        </div>

        {/* ── 5. Integration Test ──────────────────────────────────────────── */}
        <div className={`border rounded-2xl p-6 space-y-4 ${card}`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <FlaskConical className="w-4 h-4 text-violet-400 shrink-0" />
              <div>
                <h3 className={`text-sm font-bold ${heading}`}>Integration Test</h3>
                <p className={`text-xs ${sub}`}>8 live server checks — no OAuth required. Run after any deploy or config change.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {testResult && (
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${testResult.ok ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20" : "bg-red-500/15 text-red-400 border border-red-500/20"}`}>
                  {testResult.ok ? `✓ All ${testResult.total} passed` : `✗ ${testResult.failed}/${testResult.total} failed`}
                </span>
              )}
              <button onClick={runIntegrationTest} disabled={testRunning}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50">
                {testRunning ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</> : <><FlaskConical className="w-3.5 h-3.5" /> Run Test</>}
              </button>
            </div>
          </div>

          {testError && (
            <div className={`rounded-xl px-4 py-3 text-xs flex items-start gap-2 border ${isLight ? "bg-red-50 border-red-200 text-red-700" : "bg-red-900/15 border-red-700/25 text-red-300"}`}>
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{testError}</span>
            </div>
          )}

          {testResult && (
            <div className="space-y-1.5">
              {testResult.checks.map((check, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border ${check.ok
                  ? (isLight ? "bg-emerald-50 border-emerald-100" : "bg-emerald-900/10 border-emerald-700/15")
                  : (isLight ? "bg-red-50 border-red-100" : "bg-red-900/10 border-red-700/20")}`}>
                  {check.ok
                    ? <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                    : <XCircle    className="w-3.5 h-3.5 shrink-0 text-red-400" />}
                  <span className={`text-xs font-semibold ${check.ok ? (isLight ? "text-slate-700" : "text-slate-300") : (isLight ? "text-red-700" : "text-red-300")}`}>{check.name}</span>
                  {check.detail && <span className={`text-xs ml-auto ${muted}`}>{check.detail}</span>}
                </div>
              ))}
              <p className={`text-[10px] pt-1 ${muted}`}>Run at {new Date(testResult.runAt).toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* ── 6. Sheet Continuity ──────────────────────────────────────────── */}
        <div className={`border rounded-2xl p-6 space-y-4 ${card}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Archive className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <h3 className={`text-sm font-bold ${heading}`}>Sheet Continuity</h3>
                <p className={`text-xs ${sub}`}>Monitor cell usage and clone sheets before they hit the 10M cell limit. Original stays as archive.</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {TRACKED_SHEETS.map(sheet => {
              const usage = usageMap[sheet.id];
              const pct = usage ? Math.round((usage.totalCells / LIMIT) * 100) : null;
              const isHigh = pct !== null && pct >= 70;
              const isCritical = pct !== null && pct >= 90;
              const cloneResult = cloneResults[sheet.id];
              return (
                <div key={sheet.id} className={`rounded-xl border p-4 space-y-3 ${inner}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className={`w-3.5 h-3.5 ${isLight ? "text-slate-400" : "text-[#555]"}`} />
                        <span className={`text-[13px] font-bold ${heading}`}>{sheet.label}</span>
                        {isCritical && <span className="flex items-center gap-1 text-[10px] font-bold text-red-500"><AlertTriangle className="w-3 h-3" />CRITICAL</span>}
                        {isHigh && !isCritical && <span className="text-[10px] font-bold text-amber-500">HIGH</span>}
                      </div>
                      <span className={`text-[11px] ${muted}`}>{sheet.desc}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => fetchUsage(sheet.id)} disabled={loadingUsage[sheet.id]} className={btnGhost}>
                        {loadingUsage[sheet.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
                        Check Usage
                      </button>
                      <button onClick={() => cloneBlank(sheet.id, sheet.label)} disabled={cloningSheet[sheet.id]}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-white disabled:opacity-50 transition-colors">
                        {cloningSheet[sheet.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                        {cloningSheet[sheet.id] ? "Cloning…" : "Clone"}
                      </button>
                    </div>
                  </div>

                  {showManual[sheet.id] ? (
                    <div className="flex items-center gap-2">
                      <input type="text" value={manualIds[sheet.id] || ""} autoFocus
                        onChange={e => setManualIds(m => ({ ...m, [sheet.id]: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && manualSwitch(sheet)}
                        placeholder="Paste sheet URL or ID…"
                        className={`flex-1 ${inp}`} />
                      <button onClick={() => manualSwitch(sheet)} disabled={manualSwitching[sheet.id]}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-white disabled:opacity-50">
                        {manualSwitching[sheet.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Switch
                      </button>
                      <button onClick={() => setShowManual(s => ({ ...s, [sheet.id]: false }))} className={`text-xs ${muted} hover:underline`}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowManual(s => ({ ...s, [sheet.id]: true }))}
                      className={`text-[11px] underline ${muted} hover:${isLight ? "text-slate-600" : "text-slate-400"}`}>
                      Switch to an existing sheet manually…
                    </button>
                  )}

                  {usage && (
                    <div className="space-y-1.5">
                      <div className={`flex justify-between text-[11px] ${sub}`}>
                        <span>{usage.tabs.length} tab{usage.tabs.length !== 1 ? "s" : ""} · {usage.totalCells.toLocaleString()} cells</span>
                        <span className={`font-bold ${isCritical ? "text-red-500" : isHigh ? "text-amber-500" : isLight ? "text-slate-600" : "text-slate-300"}`}>{pct}%</span>
                      </div>
                      <div className={`h-1.5 rounded-full overflow-hidden ${isLight ? "bg-slate-200" : "bg-[#1a2235]"}`}>
                        <div className={`h-full rounded-full transition-all ${isCritical ? "bg-red-500" : isHigh ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {usage.tabs.map(t => (
                          <span key={t.title} className={`text-[10px] px-2 py-0.5 rounded-md ${isLight ? "bg-slate-100 text-slate-500" : "bg-[#1a2235] text-[#666]"}`}>
                            {t.title}: {t.rows.toLocaleString()} rows
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {cloneResult && (() => {
                    const switched = mappingsSwitched[sheet.id];
                    const affectedCount = sheetMappings.filter(m => m.spreadsheetIdOrUrl.includes(sheet.mappingMatch)).length;
                    return (
                      <div className={`rounded-xl border p-3 space-y-2.5 ${isLight ? "bg-emerald-50 border-emerald-200" : "bg-emerald-900/10 border-emerald-700/20"}`}>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                          <div className="space-y-0.5 min-w-0">
                            <p className={`text-[11px] font-bold ${isLight ? "text-emerald-700" : "text-emerald-400"}`}>Blank clone ready</p>
                            <p className={`text-[11px] break-all ${isLight ? "text-slate-600" : "text-slate-300"}`}>{cloneResult.name}</p>
                            <a href={cloneResult.url} target="_blank" rel="noreferrer"
                              className={`inline-flex items-center gap-1 text-[11px] underline ${isLight ? "text-emerald-700" : "text-emerald-400"}`}>
                              <ExternalLink className="w-3 h-3" /> Open new sheet
                            </a>
                          </div>
                        </div>
                        {switched ? (
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-500">
                            <CheckCircle2 className="w-3.5 h-3.5" /> All {affectedCount} mapping{affectedCount !== 1 ? "s" : ""} updated
                          </div>
                        ) : (
                          <button onClick={() => switchAllMappings(sheet.id, cloneResult.newId, cloneResult.url, sheet.configKey, sheet.mappingMatch)}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold bg-[#16a34a] hover:bg-[#15803d] text-white transition-colors">
                            <RefreshCw className="w-3.5 h-3.5" />
                            Switch Portal to New Sheet
                            {affectedCount > 0 && <span className="font-normal opacity-75">({affectedCount} mapping{affectedCount !== 1 ? "s" : ""})</span>}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 7. Bill Link Manager ─────────────────────────────────────────── */}
        <div className={`border rounded-2xl p-6 space-y-4 ${card}`}>
          <div className="flex items-start gap-3">
            <LinkIcon className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
            <div>
              <h3 className={`text-sm font-bold ${heading}`}>Bill Link Manager</h3>
              <p className={`text-xs ${sub}`}>Paste Drive file links below. They'll be resolved to filenames, matched to the right AP bills, and written to the sheet — clearing any wrong links first.</p>
            </div>
          </div>

          {!googleUser && (
            <p className={`text-xs flex items-center gap-1.5 ${isLight ? "text-amber-600" : "text-amber-400/70"}`}>
              <AlertTriangle className="w-3.5 h-3.5" /> Connect your Google account above first.
            </p>
          )}

          {/* Paste area */}
          <div className="space-y-2">
            <label className={`block text-[10px] font-semibold uppercase tracking-wide ${label}`}>Paste Drive links (one per line)</label>
            <textarea
              rows={6}
              value={billPasteLinks}
              onChange={e => { setBillPasteLinks(e.target.value); setBillMatchPreview([]); setBillApplyResult(null); }}
              placeholder={"https://drive.google.com/file/d/1abc.../view\nhttps://drive.google.com/file/d/1xyz.../view\n…"}
              className={`${inp} font-mono resize-none text-[11px]`}
            />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className={`text-[11px] ${muted}`}>
                {billPasteLinks.trim() ? `${extractFileIds(billPasteLinks).length} unique file IDs detected from ${billPasteLinks.trim().split("\n").filter(l => l.trim()).length} lines` : "Paste links above"}
              </span>
              <button
                onClick={resolveAndMatch}
                disabled={billResolveLoading || !googleUser || !billPasteLinks.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-40">
                {billResolveLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Resolving…</> : <><FolderSearch className="w-3.5 h-3.5" /> Resolve &amp; Match</>}
              </button>
            </div>
          </div>

          {billResolveError && (
            <div className={`rounded-xl px-4 py-3 text-xs flex items-start gap-2 border ${isLight ? "bg-red-50 border-red-200 text-red-700" : "bg-red-900/15 border-red-700/25 text-red-300"}`}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{billResolveError}</span>
            </div>
          )}

          {/* Match preview table */}
          {billMatchPreview.length > 0 && (
            <div className="space-y-3">
              <div className={`rounded-xl border overflow-hidden ${inner}`}>
                <div className={`grid grid-cols-[1fr_1fr_auto] text-[10px] font-bold uppercase tracking-wide px-4 py-2 border-b ${isLight ? "bg-slate-100 border-slate-200 text-slate-500" : "bg-[#0f1520] border-[#1a2235] text-[#555]"}`}>
                  <span>File Name</span>
                  <span>Matched Bill</span>
                  <span>Status</span>
                </div>
                <div className={`divide-y max-h-64 overflow-y-auto ${isLight ? "divide-slate-100" : "divide-[#0f1520]"}`}>
                  {billMatchPreview.map((row, i) => (
                    <div key={i} className={`grid grid-cols-[1fr_1fr_auto] gap-2 items-center px-4 py-2.5 text-[11px] ${isLight ? "hover:bg-slate-50" : "hover:bg-white/[.02]"}`}>
                      <span className={`truncate font-mono text-[10px] ${sub}`}>{row.fileName}</span>
                      <span className={`truncate ${row.matchedBill ? (isLight ? "text-slate-700" : "text-slate-200") : muted}`}>
                        {row.matchedBill ? `${row.matchedBill.entity} / ${row.matchedBill.vendor} (row ${row.matchedBill.row})` : "—"}
                      </span>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${row.matchedBill ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"}`}>
                        {row.matchedBill ? "matched" : "no match"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className={`flex flex-wrap gap-4 text-xs px-1 ${sub}`}>
                <span><span className="font-bold text-emerald-500">{billMatchPreview.filter(r => r.matchedBill).length}</span> matched</span>
                <span><span className="font-bold text-amber-500">{billMatchPreview.filter(r => !r.matchedBill).length}</span> unmatched</span>
                <span className={`text-[11px] ${muted}`}>Applying will write {billMatchPreview.filter(r => r.matchedBill).length} link(s) directly to the matched rows only — does not touch any other bills.</span>
              </div>

              {billApplyError && (
                <div className={`rounded-xl px-4 py-3 text-xs flex items-start gap-2 border ${isLight ? "bg-red-50 border-red-200 text-red-700" : "bg-red-900/15 border-red-700/25 text-red-300"}`}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{billApplyError}</span>
                </div>
              )}

              {billApplyResult ? (
                <div className={`rounded-xl border px-4 py-3 flex flex-wrap gap-4 text-xs ${isLight ? "bg-emerald-50 border-emerald-200" : "bg-emerald-900/10 border-emerald-700/20"}`}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className={`font-bold ${isLight ? "text-emerald-700" : "text-emerald-400"}`}>Done!</span>
                  <span className={sub}>Cleared {billApplyResult.cleared} bill cells · Wrote {billApplyResult.written} correct links to sheet</span>
                </div>
              ) : (
                <button
                  onClick={applyBillLinks}
                  disabled={billApplying || billMatchPreview.filter(r => r.matchedBill).length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40">
                  {billApplying ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Applying…</> : <><RefreshCw className="w-3.5 h-3.5" /> Write {billMatchPreview.filter(r => r.matchedBill).length} Matched Link{billMatchPreview.filter(r => r.matchedBill).length !== 1 ? "s" : ""} to Sheet</>}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── 8. Sidebar Links Manager ─────────────────────────────────────── */}
        <div className={`border rounded-2xl p-6 space-y-4 ${card}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <LinkIcon className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
              <div>
                <h3 className={`text-sm font-bold ${heading}`}>Sidebar Links</h3>
                <p className={`text-xs ${sub}`}>Manage external links in the sidebar (entity dashboards, Gmail, Calendar, etc.). Changes update instantly.</p>
              </div>
            </div>
            <button onClick={() => setShowAddLinkModal(true)}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Link
            </button>
          </div>
          <div className={`rounded-xl border overflow-hidden divide-y ${inner} ${isLight ? "divide-slate-100" : "divide-[#0f1520]"}`}>
            {externalLinks.length === 0 && (
              <p className={`text-xs text-center py-5 ${muted}`}>No links yet. Add one above.</p>
            )}
            {externalLinks.map(link => (
              <div key={link.id} className={`flex items-center gap-2 px-4 py-2.5 transition-colors ${isLight ? "hover:bg-slate-50" : "hover:bg-white/[.02]"}`}>
                <input type="text" value={link.name}
                  onChange={e => updateExternalLink(link.id, { name: e.target.value })}
                  className={`w-32 shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold focus:outline-none transition-colors ${isLight ? "bg-white border-slate-200 text-slate-900 focus:border-[#1a73e8]" : "bg-[#070b12] border-[#1a2235] text-white focus:border-[#1a73e8]"}`} />
                <input type="text" value={link.url}
                  onChange={e => updateExternalLink(link.id, { url: e.target.value })}
                  className={`flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-mono focus:outline-none transition-colors ${isLight ? "bg-white border-slate-200 text-slate-600 focus:border-[#1a73e8]" : "bg-[#070b12] border-[#1a2235] text-[#aaa] focus:border-[#1a73e8]"}`} />
                <a href={link.url} target="_blank" rel="noopener noreferrer"
                  className={`p-1.5 rounded-lg transition-colors shrink-0 ${isLight ? "text-slate-400 hover:text-sky-500" : "text-[#555] hover:text-sky-400"}`} title="Open link">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button onClick={() => deleteExternalLink(link.id)}
                  className={`p-1.5 rounded-lg transition-colors shrink-0 ${isLight ? "text-slate-300 hover:text-red-500" : "text-[#444] hover:text-red-400"}`} title="Remove">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── 9. Data Backup ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`border rounded-2xl p-6 space-y-4 ${card}`}>
            <div className="flex items-center gap-3">
              <Download className="w-4 h-4 text-[#1a73e8] shrink-0" />
              <div>
                <h3 className={`text-sm font-bold ${heading}`}>Export Backup</h3>
                <p className={`text-xs ${sub}`}>Download full portal state (AP, Banks, Loans, AR, Statements) as JSON.</p>
              </div>
            </div>
            <button onClick={handleExportJSON}
              className="px-4 py-2 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold flex items-center gap-2 transition-colors">
              <Download className="w-3.5 h-3.5" /> Download JSON
            </button>
          </div>

          <div className={`border rounded-2xl p-6 space-y-4 ${card}`}>
            <div className="flex items-center gap-3">
              <Upload className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <h3 className={`text-sm font-bold ${heading}`}>Import Payload</h3>
                <p className={`text-xs ${sub}`}>Paste exported JSON to update all portal tables instantly.</p>
              </div>
            </div>
            <textarea rows={3} value={pasteData} onChange={e => setPasteData(e.target.value)}
              placeholder="Paste JSON here…"
              className={`${inp} font-mono resize-none`} />
            {importStatus && (
              <div className="text-xs font-semibold text-emerald-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> {importStatus}
              </div>
            )}
            <button onClick={handleImportPastedJSON}
              className="px-4 py-2 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-semibold flex items-center gap-2 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Apply to Portal
            </button>
          </div>
        </div>

      </div>

      {/* ── Add External Link Modal ──────────────────────────────────────────────── */}
      {showAddLinkModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${card}`}>
            <div className={`px-6 py-4 border-b ${divider}`}>
              <h3 className={`text-sm font-bold flex items-center gap-2 ${heading}`}>
                <LinkIcon className="w-4 h-4 text-purple-400" /> Add Sidebar Link
              </h3>
            </div>
            <form onSubmit={handleCreateExternalLink} className="px-6 py-5 space-y-4">
              <div className="space-y-1">
                <label className={`block text-[10px] font-semibold uppercase tracking-wide ${label}`}>Label</label>
                <input type="text" required placeholder="e.g. CurcuminPRO Sheet"
                  value={newLinkName} onChange={e => setNewLinkName(e.target.value)} className={inp} />
              </div>
              <div className="space-y-1">
                <label className={`block text-[10px] font-semibold uppercase tracking-wide ${label}`}>URL</label>
                <input type="url" required placeholder="https://…"
                  value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={`block text-[10px] font-semibold uppercase tracking-wide ${label}`}>Section</label>
                  <select value={newLinkCategory} onChange={e => setNewLinkCategory(e.target.value as any)} className={inp}>
                    <option value="entities">Entities</option>
                    <option value="quicklinks">Quick Links</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className={`block text-[10px] font-semibold uppercase tracking-wide ${label}`}>Icon</label>
                  <select value={newLinkIcon} onChange={e => setNewLinkIcon(e.target.value as any)} className={inp}>
                    <option value="sheet">Google Sheet</option>
                    <option value="users">Payroll / Users</option>
                    <option value="mail">Mail</option>
                    <option value="calendar">Calendar</option>
                    <option value="link">Generic Link</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowAddLinkModal(false)} className={btnGhost}>Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition-colors">Add Link</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Sheet Mapping Modal ───────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${card}`}>
            <div className={`px-6 py-4 border-b ${divider}`}>
              <h3 className={`text-sm font-bold flex items-center gap-2 ${heading}`}>
                <FileSpreadsheet className="w-4 h-4 text-[#1a73e8]" /> Add Sheet Mapping
              </h3>
            </div>
            <form onSubmit={handleCreateCustomMapping} className="px-6 py-5 space-y-4">
              <div className="space-y-1">
                <label className={`block text-[10px] font-semibold uppercase tracking-wide ${label}`}>Name</label>
                <input type="text" required placeholder="e.g. Custom Payroll Sheet"
                  value={newMappingName} onChange={e => setNewMappingName(e.target.value)} className={inp} />
              </div>
              <div className="space-y-1">
                <label className={`block text-[10px] font-semibold uppercase tracking-wide ${label}`}>Module</label>
                <select value={newMappingModule} onChange={e => setNewMappingModule(e.target.value as any)} className={inp}>
                  <option value="ap">Accounts Payable (AP)</option>
                  <option value="banks">Bank Balances</option>
                  <option value="loans">Loans & Credit</option>
                  <option value="ar">Accounts Receivable (AR)</option>
                  <option value="statements">Bank Statements</option>
                  <option value="payroll">Payroll Summary</option>
                  <option value="calendar">Financial Calendar</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className={`block text-[10px] font-semibold uppercase tracking-wide ${label}`}>Spreadsheet URL or ID</label>
                <input type="text" required placeholder="https://docs.google.com/spreadsheets/d/…"
                  value={newMappingUrl} onChange={e => setNewMappingUrl(e.target.value)} className={inp} />
              </div>
              <div className="space-y-1">
                <label className={`block text-[10px] font-semibold uppercase tracking-wide ${label}`}>Tab Name (optional)</label>
                <input type="text" placeholder="Auto-detected if blank"
                  value={newMappingTab} onChange={e => setNewMappingTab(e.target.value)} className={inp} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowAddModal(false)} className={btnGhost}>Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-xs font-semibold text-white transition-colors">Add Mapping</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 3-Layer Sheet Switch Confirmation Modal ─────────────────────────────── */}
    {confirmTarget && (() => {
      const { sheet, newId, newUrl, isManual } = confirmTarget;
      const affectedCount = sheetMappings.filter(m => m.spreadsheetIdOrUrl.includes(sheet.mappingMatch)).length;
      const CONFIRM_WORD = "SWITCH";

      const handleStep2 = () => {
        if (confirmTyped.trim().toUpperCase() !== CONFIRM_WORD) {
          setConfirmError(`Type "${CONFIRM_WORD}" exactly to proceed.`);
          return;
        }
        setConfirmError(null);
        setConfirmStep(3);
      };

      const handleStep3 = async () => {
        if (!confirmEmail.trim() || !confirmPassword) {
          setConfirmError("Enter your email and password.");
          return;
        }
        setConfirmVerifying(true);
        setConfirmError(null);
        try {
          const user = await emailPasswordSignIn(confirmEmail.trim(), confirmPassword);
          // All layers passed — execute the switch
          await executeSwitch(sheet, newId, newUrl, user.email || confirmEmail.trim());
          closeConfirm();
        } catch (e: any) {
          const msg = e?.code === "auth/wrong-password" || e?.code === "auth/invalid-credential"
            ? "Incorrect password. Try again."
            : e?.code === "auth/user-not-found"
            ? "No account found for that email."
            : e?.code === "auth/too-many-requests"
            ? "Too many attempts. Try again later."
            : `Authentication failed: ${e?.message || "Unknown error"}`;
          setConfirmError(msg);
        } finally {
          setConfirmVerifying(false);
        }
      };

      return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#2a2a2a]"}`}>
            {/* Red accent bar */}
            <div className="h-1.5 bg-red-500" />

            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isLight ? "border-slate-100" : "border-[#222]"}`}>
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                <span className={`text-sm font-black ${isLight ? "text-slate-900" : "text-white"}`}>
                  Sheet Switch — Step {confirmStep} of 3
                </span>
              </div>
              <div className="flex gap-1">
                {[1,2,3].map(s => (
                  <div key={s} className={`w-2 h-2 rounded-full ${confirmStep >= s ? "bg-red-500" : isLight ? "bg-slate-200" : "bg-[#333]"}`} />
                ))}
              </div>
            </div>

            <div className="px-5 py-5 space-y-4">

              {/* Step 1 — Warning */}
              {confirmStep === 1 && (
                <>
                  <div className={`rounded-lg p-3 space-y-2 border ${isLight ? "bg-red-50 border-red-200" : "bg-red-900/10 border-red-800/30"}`}>
                    <p className="text-[12px] font-bold text-red-500 uppercase tracking-wide">⚠ Critical Action — Read Before Continuing</p>
                    <ul className={`text-[12px] space-y-1 list-disc list-inside ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                      <li>This will switch <strong>{sheet.label}</strong> to a different source sheet.</li>
                      <li><strong>{affectedCount > 0 ? `${affectedCount} sheet mapping${affectedCount !== 1 ? "s" : ""}` : "Service-level routing"}</strong> will be updated immediately.</li>
                      <li>Data from the old sheet will <strong>no longer be pulled or pushed</strong> by the portal.</li>
                      <li>The old sheet is not deleted — it remains as an archive.</li>
                      <li>This action is <strong>logged and attributed to your credentials</strong>.</li>
                    </ul>
                  </div>
                  <div className={`text-[11px] space-y-0.5 ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                    <p><span className="font-semibold">Current:</span> <code className="text-[10px]">{sheet.id}</code></p>
                    <p><span className="font-semibold">New:</span> <code className="text-[10px]">{newId}</code></p>
                    {isManual && <p className="text-amber-500 font-semibold">⚠ Manually specified ID — verify this is correct before proceeding.</p>}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={closeConfirm} className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold ${isLight ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-[#1a2235] text-slate-300 hover:bg-[#1e2a40]"}`}>
                      Cancel
                    </button>
                    <button onClick={() => { setConfirmStep(2); setConfirmError(null); }} className="px-4 py-1.5 rounded-lg text-[12px] font-semibold bg-red-500 hover:bg-red-600 text-white">
                      I understand — Continue
                    </button>
                  </div>
                </>
              )}

              {/* Step 2 — Type SWITCH */}
              {confirmStep === 2 && (
                <>
                  <p className={`text-[13px] font-semibold ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                    Type <strong className="text-red-500">"{CONFIRM_WORD}"</strong> to confirm you intend to switch the <strong>{sheet.label}</strong> source sheet.
                  </p>
                  <input
                    autoFocus
                    type="text"
                    value={confirmTyped}
                    onChange={e => { setConfirmTyped(e.target.value); setConfirmError(null); }}
                    onKeyDown={e => e.key === "Enter" && handleStep2()}
                    placeholder={`Type ${CONFIRM_WORD} here…`}
                    className={`w-full rounded-lg px-3 py-2 text-[13px] font-mono font-bold border focus:outline-none focus:border-red-400 ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`}
                  />
                  {confirmError && <p className="text-[11px] text-red-500">{confirmError}</p>}
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setConfirmStep(1); setConfirmError(null); }} className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold ${isLight ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-[#1a2235] text-slate-300 hover:bg-[#1e2a40]"}`}>
                      Back
                    </button>
                    <button onClick={handleStep2} className="px-4 py-1.5 rounded-lg text-[12px] font-semibold bg-red-500 hover:bg-red-600 text-white">
                      Confirm Word
                    </button>
                  </div>
                </>
              )}

              {/* Step 3 — Re-authenticate */}
              {confirmStep === 3 && (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <Lock className={`w-4 h-4 ${isLight ? "text-slate-500" : "text-slate-400"}`} />
                    <p className={`text-[13px] font-semibold ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                      Re-confirm your identity to authorise this change.
                    </p>
                  </div>
                  <p className={`text-[11px] ${isLight ? "text-slate-400" : "text-[#666]"}`}>
                    Your email and the timestamp will be recorded in the portal audit log.
                  </p>
                  <div className="space-y-2">
                    <input
                      type="email"
                      value={confirmEmail}
                      onChange={e => { setConfirmEmail(e.target.value); setConfirmError(null); }}
                      placeholder="your@email.com"
                      className={`w-full rounded-lg px-3 py-2 text-[12px] border focus:outline-none focus:border-red-400 ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`}
                    />
                    <div className="relative">
                      <input
                        autoFocus
                        type={confirmShowPw ? "text" : "password"}
                        value={confirmPassword}
                        onChange={e => { setConfirmPassword(e.target.value); setConfirmError(null); }}
                        onKeyDown={e => e.key === "Enter" && handleStep3()}
                        placeholder="Password"
                        className={`w-full rounded-lg px-3 py-2 pr-9 text-[12px] border focus:outline-none focus:border-red-400 ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`}
                      />
                      <button type="button" onClick={() => setConfirmShowPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                        {confirmShowPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  {confirmError && <p className="text-[11px] text-red-500 font-medium">{confirmError}</p>}
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setConfirmStep(2); setConfirmError(null); setConfirmPassword(""); }} className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold ${isLight ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-[#1a2235] text-slate-300 hover:bg-[#1e2a40]"}`}>
                      Back
                    </button>
                    <button onClick={handleStep3} disabled={confirmVerifying} className="px-4 py-1.5 rounded-lg text-[12px] font-semibold bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 flex items-center gap-1.5">
                      {confirmVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                      {confirmVerifying ? "Verifying…" : "Verify & Switch"}
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      );
    })()}
    </div>
  );
};
