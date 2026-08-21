import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { fetchFullLiveDataset } from "./src/services/liveSheetsFetcher";
import {
  getRawData as fourYrGetRawData,
  getMasterListWeeks as fourYrGetWeeks,
  getMasterListEmployees,
  getDropdownData as fourYrGetDropdowns,
  getDropdownDataForEntry,
  getFilteredData as fourYrGetFiltered,
  getEmployeeYTD,
  getProjectTotalData,
  saveRemark, saveTime, saveHours, saveHoursOverride, saveTotal, saveJob,
  saveRecordEdit, addRawEntry, deleteRawEntry,
  saveMasterListEmployee, addMasterListEmployee, deleteMasterListEmployee,
  startNewWeek
} from "./src/services/fourYrPayrollService";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json({ limit: "10mb" }));

// Persistent JSON file storage path
const DATA_FILE = process.env.VERCEL
  ? "/tmp/financeops_data.json"
  : path.join(process.cwd(), "financeops_data.json");

// Default initial backend data structure
const DEFAULT_DATA = {
  ap: [],
  banks: [],
  loans: [],
  ar: [],
  statements: [],
  // Calendar change overrides — applied on top of live sheet data on every sync/load.
  // Survives GViz cache staleness. Writes to Google Sheet are best-effort background ops.
  calendarOverrides: {
    deleted: [] as string[],                          // event IDs to hide
    done: {} as Record<string, boolean>,              // id → done state
    edits: {} as Record<string, Record<string, any>>  // id → {title, notes, urgency, type, assignee}
  },
  payrollWeeks: [
    { weekNum: "W28", year: 2026, label: "Jul 6 – Jul 10", startDate: "2026-07-06", endDate: "2026-07-10", sheetName: "Payroll_Jul_W28" },
    { weekNum: "W29", year: 2026, label: "Jul 13 – Jul 17", startDate: "2026-07-13", endDate: "2026-07-17", sheetName: "Payroll_Jul_W29" },
    { weekNum: "W30", year: 2026, label: "Jul 20 – Jul 24", startDate: "2026-07-20", endDate: "2026-07-24", sheetName: "Payroll_Jul_W30" }
  ],
  payrollPivot: {
    "Ruby's": {
      "Operations": { "Warehouse & Packing": { hours: 160, amount: 4800 }, "Quality Control": { hours: 80, amount: 2800 } },
      "Administration": { "Accounting & Admin": { hours: 40, amount: 2200 } }
    },
    "TI": {
      "Engineering": { "Software Devs": { hours: 240, amount: 14400 }, "DevOps & Cloud": { hours: 120, amount: 7800 } },
      "Management": { "Exec & Operations": { hours: 80, amount: 6500 } }
    },
    "MSDx": {
      "Laboratory": { "Research Scientists": { hours: 160, amount: 9600 }, "Lab Technicians": { hours: 120, amount: 5400 } }
    }
  },
  auditLog: [
    { timestamp: new Date().toISOString(), user: "accounting@marktimm.com", action: "System Init", details: "Connected to Google Sheet 15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs" }
  ],
  loginLog: [] as any[],
  sheetMappings: [
    { id: "map-ap", module: "ap", name: "Accounts Payable (Bills)", spreadsheetIdOrUrl: "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit?usp=sharing", tabName: "Ruby's Bills, TI Bills, MSDX Bills", range: "'Ruby''s Bills'!A1:Z500, 'TI Bills'!A1:Z500, 'MSDX Bills'!A1:Z500", status: "connected" },
    { id: "map-banks", module: "banks", name: "Bank Account Balances", spreadsheetIdOrUrl: "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit?usp=sharing", tabName: "Bank Balances", range: "'Bank Balances'!A1:Z50", status: "connected" },
    { id: "map-loans", module: "loans", name: "Loans & Credit Facilities", spreadsheetIdOrUrl: "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit?usp=sharing", tabName: "Loans, Credit Cards", range: "'Loans'!A1:Z50, 'Credit Cards'!A1:Z50", status: "connected" },
    { id: "map-ar", module: "ar", name: "Accounts Receivable (Invoices)", spreadsheetIdOrUrl: "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit?usp=sharing", tabName: "AR Dashboard Data", range: "'AR Dashboard Data'!A1:Z200", status: "connected" },
    { id: "map-statements", module: "statements", name: "Bank Statements Checklist", spreadsheetIdOrUrl: "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit?usp=sharing", tabName: "Bank Statements", range: "'Bank Statements'!A1:Z100", status: "connected" },
    { id: "map-payroll", module: "payroll", name: "4YR Payroll", spreadsheetIdOrUrl: "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit?usp=sharing", tabName: "raw", range: "'raw'!A1:Z500", status: "connected" }
  ]
};

// Special merge for notes: sheet provides base content, but local status/completion wins
function mergeNotes(liveList: any[], currentList: any[]) {
  if (!liveList || liveList.length === 0) return currentList || [];
  if (!currentList || currentList.length === 0) return liveList;

  const currentMap = new Map<string, any>();
  currentList.forEach((item) => {
    if (item?.id) currentMap.set(String(item.id), item);
  });

  const merged = liveList.map((liveItem) => {
    const itemId = String(liveItem.id || "");
    if (itemId && currentMap.has(itemId)) {
      const currentItem = currentMap.get(itemId)!;
      // Sheet "done" flag always wins; if sheet says open, keep local "done" if user marked it
      const status = liveItem.status === "done" || currentItem.status === "done" ? "done" : "open";
      const completedAt = status === "done" ? (currentItem.completedAt || liveItem.completedAt) : undefined;
      return { ...liveItem, status, completedAt };
    }
    return liveItem;
  });

  // Keep locally-created notes that don't exist in the sheet
  const liveIds = new Set(liveList.map((i) => String(i.id || "")));
  currentList.forEach((ci) => {
    if (ci?.id && !liveIds.has(String(ci.id))) {
      merged.unshift(ci);
    }
  });

  return merged;
}

function mergeDatasets(liveList: any[], currentList: any[], idKey = "id") {
  if (!liveList || liveList.length === 0) return currentList || [];
  if (!currentList || currentList.length === 0) return liveList;

  const currentMap = new Map();
  currentList.forEach((item) => {
    if (item && item[idKey]) currentMap.set(String(item[idKey]), item);
  });

  const merged = liveList.map((liveItem) => {
    const itemId = String(liveItem[idKey] || "");
    if (itemId && currentMap.has(itemId)) {
      const currentItem = currentMap.get(itemId);
      const invoiceNo = liveItem.invoiceNo || currentItem.invoiceNo || undefined;
      // Fresh live sheet data overrides stored item data, preserving invoiceNo if live sheet lacks it
      return { ...currentItem, ...liveItem, ...(invoiceNo ? { invoiceNo } : {}) };
    }
    return liveItem;
  });

  const liveIds = new Set(liveList.map((i) => String(i[idKey] || "")));
  currentList.forEach((ci) => {
    const ciId = String(ci[idKey] || "");
    // Preserve local user-created records that are not from Google Sheets
    if (
      ciId &&
      !liveIds.has(ciId) &&
      !ci.sheet &&
      !ciId.startsWith("mnote-") &&
      !ciId.startsWith("ap-") &&
      !ciId.startsWith("b-") &&
      !ciId.startsWith("l-") &&
      !ciId.startsWith("ar-") &&
      !ciId.startsWith("stmt-")
    ) {
      merged.unshift(ci);
    }
  });

  return merged;
}

// Apply stored overrides (done/edit/delete) to a list of calendar events
function applyCalendarOverrides(events: any[], overrides: { deleted: string[]; done: Record<string, boolean>; edits: Record<string, Record<string, any>> }): any[] {
  if (!events) return [];
  const deletedSet = new Set(overrides.deleted || []);
  return events
    .filter(ev => !deletedSet.has(ev.id))
    .map(ev => {
      let result = { ...ev };
      if (overrides.done && overrides.done[ev.id] !== undefined) {
        result.done = overrides.done[ev.id];
      }
      if (overrides.edits && overrides.edits[ev.id]) {
        result = { ...result, ...overrides.edits[ev.id] };
      }
      return result;
    });
}

async function syncLiveDataFromSheets(accessToken?: string) {
  try {
    const method = accessToken ? "Sheets API v4 (FORMATTED_VALUE)" : "GViz public API";
    console.log(`[GoogleSheetSync] Pulling live data from Google Sheets via ${method}...`);
    const liveData = await fetchFullLiveDataset(accessToken);
    console.log(`[GoogleSheetSync] liveData.ap count: ${liveData.ap?.length || 0} (token: ${accessToken ? "yes" : "no"})`);
    const current = getStoredData();
    // When using Sheets API v4 (token present), row indices may differ from cached GViz data.
    // Use v4 data directly for AP — it is complete and has evaluated formula values (invoice numbers).
    const updated = {
      ...current,
      ap: (accessToken && liveData.ap.length > 0) ? liveData.ap : mergeDatasets(liveData.ap, current.ap, "id"),
      banks: mergeDatasets(liveData.banks, current.banks, "id"),
      loans: mergeDatasets(liveData.loans, current.loans, "id"),
      ar: mergeDatasets(liveData.ar, current.ar, "id"),
      statements: mergeDatasets(liveData.statements, current.statements, "id"),
      quickNotes: mergeNotes(liveData.quickNotes, current.quickNotes),
      // Calendar events: use live sheet data, then apply stored overrides on top.
      // This makes done/edit/delete survive GViz cache and server restarts.
      calendarLocalEvents: applyCalendarOverrides(
        (liveData.calendarLocalEvents && liveData.calendarLocalEvents.length > 0)
          ? liveData.calendarLocalEvents
          : current.calendarLocalEvents,
        current.calendarOverrides || { deleted: [], done: {}, edits: {} }
      ),
      payrollPivot: liveData.payrollPivot && Object.keys(liveData.payrollPivot).length > 0 ? liveData.payrollPivot : current.payrollPivot,
      lastSyncedAt: liveData.lastSyncedAt
    };
    saveStoredData(updated);
    console.log(`[GoogleSheetSync] Successfully synced live data: ${updated.ap?.length || 0} AP bills, ${updated.banks?.length || 0} bank accts, ${updated.loans?.length || 0} loans/CCs, ${updated.ar?.length || 0} AR items.`);
    return updated;
  } catch (err) {
    console.error("[GoogleSheetSync] Failed to sync live data:", err);
    return getStoredData();
  }
}

function getStoredData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (!parsed.ap || parsed.ap.length === 0 || parsed.ap.length < 50) {
        // Data file empty or missing live sheet data
        return parsed;
      }
      return parsed;
    }
  } catch (e) {
    console.error("Error reading data file, resetting to default:", e);
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
  return DEFAULT_DATA;
}

function saveStoredData(data: any) {
  try {
    console.log(`[saveStoredData] writing ${(data.ap||[]).length} AP bills to ${DATA_FILE}`);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error writing data file:", e);
  }
}

// API Routes
app.get("/api/calendar-sheet-events", async (_req, res) => {
  try {
    const sheetIds = [
      "1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo",
      "15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs"
    ];
    const tabs = ["Calendar Dashboard", "Local Events", "Calendar Dashboard - Local Events", "Calendar", "Schedule", "Events"];
    const events: any[] = [];
    const seenKeys = new Set<string>();

    for (const sheetId of sheetIds) {
      for (const tab of tabs) {
        try {
          const tabParam = `&sheet=${encodeURIComponent(tab)}`;
          const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json${tabParam}`;
          const response = await fetch(url);
          if (response.ok) {
            const text = await response.text();
            if (!text.includes("{") || !text.includes("}")) continue;
            const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
            const data = JSON.parse(jsonStr);
            const rows = data.table?.rows || [];

            rows.forEach((r: any, idx: number) => {
              const rawCells = r.c || [];
              if (!rawCells || rawCells.length === 0) return;

              let dateStr = "";
              let titleStr = "";
              let descStr = "";

              rawCells.forEach((cell: any) => {
                if (!cell) return;
                const valF = cell.f ? String(cell.f).trim() : "";
                const valV = cell.v !== null && cell.v !== undefined ? String(cell.v).trim() : "";
                const val = valF || valV;
                if (!val) return;

                if (!dateStr && (val.includes("/") || val.includes("-") || val.startsWith("Date(") || /^\d{5}$/.test(val))) {
                  dateStr = val;
                } else if (!titleStr && !val.toLowerCase().includes("date") && !val.toLowerCase().includes("header") && val.length >= 2) {
                  titleStr = val;
                } else if (!descStr && val !== titleStr && val !== dateStr) {
                  descStr = val;
                }
              });

              if (!titleStr && rawCells[0]) titleStr = String(rawCells[0].f || rawCells[0].v || "");
              if (!dateStr && rawCells[1]) dateStr = String(rawCells[1].f || rawCells[1].v || "");

              const lowerTitle = titleStr.toLowerCase().trim();
              if (
                !lowerTitle ||
                lowerTitle.length < 2 ||
                lowerTitle.includes("bills]") ||
                lowerTitle.includes("[ruby's bills]") ||
                lowerTitle.includes("[msdx bills]") ||
                lowerTitle.includes("cheque") ||
                lowerTitle.includes("prepare $") ||
                /^n\d+/i.test(titleStr) ||
                /^note[-_:\s]/i.test(titleStr) ||
                /^id[-_:\s]/i.test(titleStr) ||
                /^memo[-_:\s]/i.test(titleStr) ||
                /^task[-_:\s]/i.test(titleStr) ||
                /^map[-_]/i.test(titleStr) ||
                /^cal\s*:/i.test(titleStr) ||           // e.g. "Cal: Ruby's - Zions" bank-calendar entries
                /^\d+\.?\d*$/.test(titleStr) ||         // pure numeric titles (stray amounts)
                ["title", "vendor", "event title", "date", "id", "remarks", "amount", "status", "company", "description"].includes(lowerTitle)
              ) {
                return;
              }

              let yyyyMmDd = "";
              if (dateStr.startsWith("Date(")) {
                const parts = dateStr.replace("Date(", "").replace(")", "").split(",").map((n: string) => parseInt(n.trim()));
                if (parts.length >= 3) {
                  const y = parts[0];
                  const m = String(parts[1] + 1).padStart(2, "0");
                  const d = String(parts[2]).padStart(2, "0");
                  if (y >= 2000 && y <= 2035) yyyyMmDd = `${y}-${m}-${d}`;
                }
              } else if (/^\d{5}$/.test(dateStr)) {
                const serial = parseInt(dateStr);
                const parsedDate = new Date((serial - 25569) * 86400 * 1000);
                if (!isNaN(parsedDate.getTime())) {
                  yyyyMmDd = parsedDate.toISOString().split("T")[0];
                }
              } else if (dateStr) {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) {
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  if (y >= 2000 && y <= 2035) yyyyMmDd = `${y}-${m}-${day}`;
                }
              }

              if (yyyyMmDd && titleStr) {
                const dupKey = `${yyyyMmDd}_${titleStr.toLowerCase().trim()}`;
                if (!seenKeys.has(dupKey)) {
                  seenKeys.add(dupKey);
                  events.push({
                    id: `sheet-cal-${sheetId.slice(-4)}-${tab}-${idx}`,
                    summary: titleStr,
                    description: descStr || `Scheduled Event (${tab})`,
                    start: { date: yyyyMmDd },
                    end: { date: yyyyMmDd }
                  });
                }
              }
            });
          }
        } catch (e) {
          // ignore individual tab error
        }
      }
    }

    res.json({ success: true, count: events.length, events });
  } catch (err: any) {
    console.error("Error in /api/calendar-sheet-events:", err);
    res.status(500).json({ success: false, error: err?.message || "Failed to fetch sheet events" });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// POST /api/calendar-action — persist calendar changes server-side so they survive GViz cache
// type: "delete" | "done" | "edit"
// id: event ID
// value: boolean (for done) | {title?, notes?, urgency?, type?, assignee?} (for edit) | undefined (for delete)
app.post("/api/calendar-action", (req, res) => {
  try {
    const { type, id, value } = req.body || {};
    if (!type || !id) return res.status(400).json({ error: "type and id required" });

    const data = getStoredData();
    const overrides = data.calendarOverrides || { deleted: [], done: {}, edits: {} };

    if (type === "delete") {
      if (!overrides.deleted.includes(id)) overrides.deleted.push(id);
      // Remove any done/edit overrides for this event (no longer needed)
      delete overrides.done[id];
      delete overrides.edits[id];
      // Also remove from calendarLocalEvents immediately
      data.calendarLocalEvents = (data.calendarLocalEvents || []).filter((e: any) => e.id !== id);
    } else if (type === "done") {
      overrides.done[id] = !!value;
      // Apply immediately to stored calendarLocalEvents
      data.calendarLocalEvents = (data.calendarLocalEvents || []).map((e: any) =>
        e.id === id ? { ...e, done: !!value } : e
      );
    } else if (type === "edit") {
      overrides.edits[id] = { ...(overrides.edits[id] || {}), ...value };
      // Apply immediately to stored calendarLocalEvents
      data.calendarLocalEvents = (data.calendarLocalEvents || []).map((e: any) =>
        e.id === id ? { ...e, ...value } : e
      );
    } else {
      return res.status(400).json({ error: "unknown type" });
    }

    data.calendarOverrides = overrides;
    saveStoredData(data);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Error in /api/calendar-action:", err);
    res.status(500).json({ error: err?.message || "Failed" });
  }
});

app.get("/api/data", (_req, res) => {
  const data = getStoredData();
  res.json(data);
});

app.post("/api/pull-live", async (req, res) => {
  const forceOverwrite = req.body?.force === true;
  const accessToken: string | undefined = req.body?.accessToken || undefined;
  const updated = await syncLiveDataFromSheets(accessToken);
  const existing = getStoredData();

  // Don't overwrite AP/bank/loans/AR if portal already has sufficient data and this isn't
  // a forced pull — prevents the sheet (which may lag behind portal auto-pushes) from
  // reverting portal-side changes.
  const existingAp = existing?.ap || [];
  const hasSufficientExisting = existingAp.length >= 20 &&
    existingAp.filter((b: any) => b.entity === "TI" || b.sheet === "TI Bills").length >= 5;

  const merged = hasSufficientExisting && !forceOverwrite
    ? {
        ...existing,
        // Still bring in non-AP data from the live pull
        quickNotes: updated.quickNotes || existing.quickNotes,
        calendarLocalEvents: updated.calendarLocalEvents || existing.calendarLocalEvents,
        payrollPivot: updated.payrollPivot || existing.payrollPivot,
        payrollWeeks: updated.payrollWeeks || existing.payrollWeeks,
        lastSyncedAt: new Date().toISOString()
      }
    : { ...existing, ...updated, lastSyncedAt: new Date().toISOString() };

  saveStoredData(merged);
  res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
});

app.post("/api/data", (req, res) => {
  const updated = req.body;
  if (updated && typeof updated === "object") {
    // Preserve server-side fields the React app doesn't manage
    const existing = getStoredData();
    const merged = {
      ...updated,
      calendarLocalEvents: updated.calendarLocalEvents?.length
        ? updated.calendarLocalEvents
        : existing.calendarLocalEvents,
      // Never let a client save-data call wipe logs or the sheet ID reference
      logsSheetId: existing.logsSheetId || updated.logsSheetId || null,
      loginLog: existing.loginLog || [],
      auditLog: (updated.auditLog?.length ?? 0) >= (existing.auditLog?.length ?? 0)
        ? updated.auditLog
        : existing.auditLog,
    };
    saveStoredData(merged);
    res.json({ success: true, timestamp: new Date().toISOString() });
  } else {
    res.status(400).json({ error: "Invalid data format" });
  }
});

app.post("/api/audit-log", (req, res) => {
  const { action, details, user } = req.body;
  const data = getStoredData();
  const newLog = {
    timestamp: new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }),
    user: user || "accounting@marktimm.com",
    action: action || "User Action",
    details: details || ""
  };
  data.auditLog = [newLog, ...(data.auditLog || []).slice(0, 499)];
  saveStoredData(data);
  res.json({ success: true, log: newLog });
});

// =============================================================================
// Google Drive — bill/invoice file storage
// =============================================================================

import { google } from "googleapis";

/** Build an authenticated Drive client from the service-account JSON env var. */
function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");
  const creds = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

/** Find a child folder by name under parentId, or create it. Returns folder ID. */
async function getOrCreateFolder(drive: any, parentId: string, name: string): Promise<string> {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const list = await drive.files.list({ q, fields: "files(id,name)", spaces: "drive" });
  if (list.data.files?.length) return list.data.files[0].id as string;
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  });
  return created.data.id as string;
}

/** Ensure the full path exists under root, return the leaf folder ID. */
async function ensurePath(drive: any, segments: string[]): Promise<string> {
  let parentId = "root";
  for (const seg of segments) parentId = await getOrCreateFolder(drive, parentId, seg);
  return parentId;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * POST /api/drive/upload-bill
 * Body: { imageBase64, mimeType, entity, vendor, invoiceNo, dueDate, amount }
 * Returns: { fileId, viewUrl }
 *
 * Folder layout:
 *   FinanceOps Portal / Bills & Invoices / {entity} / {year} / {month} /
 * File name:
 *   {Entity}_{Vendor}_{InvoiceNo}_{YYYY-MM-DD}.{ext}
 */
app.post("/api/drive/upload-bill", async (req, res) => {
  const { imageBase64, mimeType, entity, vendor, invoiceNo, dueDate, amount } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  let drive: any;
  try { drive = getDriveClient(); }
  catch (e: any) { return res.status(500).json({ error: e.message }); }

  try {
    // Determine folder path
    const now = new Date();
    const dateRef = dueDate ? new Date(dueDate) : now;
    const year = String(dateRef.getFullYear());
    const monthIdx = dateRef.getMonth();
    const month = `${String(monthIdx + 1).padStart(2, "0")} - ${MONTH_NAMES[monthIdx]}`;
    const entityFolder = (entity || "Other").replace(/[/\\:*?"<>|]/g, "-");

    const folderId = await ensurePath(drive, [
      "FinanceOps Portal",
      "Bills & Invoices",
      entityFolder,
      year,
      month,
    ]);

    // Build file name
    const safeVendor  = (vendor   || "Unknown").replace(/[/\\:*?"<>|]/g, "-").trim().replace(/\s+/g, "_");
    const safeInvNo   = (invoiceNo|| "").replace(/[/\\:*?"<>|]/g, "-").trim().replace(/\s+/g, "_");
    const dateStr     = dueDate ? dueDate.replace(/\//g, "-") : now.toISOString().split("T")[0];
    const ext         = mimeType === "application/pdf" ? "pdf" : (mimeType?.split("/")[1] || "jpg");
    const fileName    = [entityFolder, safeVendor, safeInvNo, dateStr].filter(Boolean).join("_") + "." + ext;

    // Upload
    const { Readable } = await import("stream");
    const buffer = Buffer.from(imageBase64, "base64");
    const stream = Readable.from(buffer);

    const uploaded = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: mimeType || "image/jpeg", body: stream },
      fields: "id,webViewLink,name",
    });

    const fileId   = uploaded.data.id as string;
    const viewUrl  = uploaded.data.webViewLink as string;

    // Make readable by anyone with the link (so portal can open it)
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });

    return res.json({ ok: true, fileId, viewUrl, fileName });
  } catch (e: any) {
    console.error("[DriveUpload]", e?.message || e);
    return res.status(502).json({ error: "Drive upload failed", details: e?.message });
  }
});

// =============================================================================
// Gemini Vision helper — tries models in order until one succeeds
// =============================================================================

const GEMINI_MODELS = [
  { version: "v1beta", model: "gemini-3.6-flash" },
  { version: "v1beta", model: "gemini-2.5-flash" },
  { version: "v1beta", model: "gemini-2.0-flash" },
  { version: "v1",     model: "gemini-1.5-flash" },
  { version: "v1beta", model: "gemini-2.5-pro"   },
];

async function callGemini(apiKey: string, body: any): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  let lastError = "No available Gemini model";
  for (const { version, model } of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const resp = await r.json() as any;
        const text = resp?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        console.log(`[Gemini] Used model: ${model}`);
        return { ok: true, text };
      }
      const errBody = await r.json().catch(() => ({})) as any;
      const status = errBody?.error?.status || "";
      lastError = errBody?.error?.message || `HTTP ${r.status}`;
      console.warn(`[Gemini] ${model} → ${status || r.status}: ${lastError}`);
      // NOT_FOUND or UNAVAILABLE → try next model; anything else → stop (auth error, quota, etc.)
      if (status !== "NOT_FOUND" && status !== "UNAVAILABLE" && r.status !== 404) {
        return { ok: false, error: lastError };
      }
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }
  return { ok: false, error: lastError };
}

// =============================================================================
// Timesheet Scanner — Gemini Vision API
// =============================================================================

// GET /api/gemini-test — lists available Gemini models to diagnose key issues
app.get("/api/gemini-test", async (_req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.json({ error: "No key set" });

  // Try as ?key= param (traditional API key)
  const r1 = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
  const d1 = await r1.json() as any;

  // Try as Bearer token
  const r2 = await fetch(`https://generativelanguage.googleapis.com/v1/models`, {
    headers: { "Authorization": `Bearer ${apiKey}` }
  });
  const d2 = await r2.json() as any;

  return res.json({
    keyPrefix: apiKey.slice(0, 8),
    keyLength: apiKey.length,
    asQueryParam: { status: r1.status, models: d1.models?.map((m: any) => m.name) || d1 },
    asBearer:     { status: r2.status, models: d2.models?.map((m: any) => m.name) || d2 },
  });
});

// POST /api/invoice/scan — Gemini Vision extracts bill/invoice data
app.post("/api/invoice/scan", async (req, res) => {
  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  const prompt = `You are a bill/invoice data extraction assistant. Extract all data from this invoice or bill image.

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "vendor": "string",
  "invoiceNo": "string or null",
  "amount": number or null,
  "dueDate": "YYYY-MM-DD or MM/DD/YYYY or string, null if not found",
  "issueDate": "YYYY-MM-DD or string, null if not found",
  "entity": "string (which company this bill belongs to, e.g. Ruby's, TI, MSDx — infer from context if possible, otherwise empty string)",
  "description": "string (short description of what the bill is for)",
  "remarks": "string (any additional notes, payment instructions, or reference numbers)"
}

Notes:
- "amount" should be the total due as a number (no $ symbol), null if not clearly readable
- "invoiceNo" is the invoice number, bill number, or reference number — null if absent
- "entity" try to infer from the recipient name on the bill
- Be as accurate as possible; leave fields null rather than guessing incorrectly`;

  try {
    const body = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
    };

    const result = await callGemini(apiKey, body);
    if (!result.ok) return res.status(502).json({ error: "Gemini API error", details: result.error });

    const raw = result.text;
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    const cleaned = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(422).json({ error: "Could not parse Gemini response as JSON", raw });
    }
    res.json({ ok: true, invoice: parsed });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// POST /api/ap/add-scanned-bill — save an AI-scanned bill to AP data
app.post("/api/ap/add-scanned-bill", (req, res) => {
  const bill = req.body || {};
  if (!bill.vendor) return res.status(400).json({ error: "vendor required" });
  const data = getStoredData();
  const newBill = {
    id: `ap-scan-${Date.now()}`,
    vendor: bill.vendor,
    entity: bill.entity || "",
    company: bill.entity || "",
    amount: typeof bill.amount === "number" ? bill.amount : 0,
    dueDate: bill.dueDate || "",
    issueDate: bill.issueDate || "",
    status: "open",
    sheet: "Scanned",
    invoiceNo: bill.invoiceNo || "",
    remarks: bill.remarks || "",
    description: bill.description || "",
    createdAt: new Date().toISOString(),
    scanned: true,
  };
  data.ap = [newBill, ...(data.ap || [])];
  saveStoredData(data);
  res.json({ ok: true, bill: newBill });
});

app.post("/api/timesheet/scan", async (req, res) => {
  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  const prompt = `You are a timesheet data extraction assistant. Extract all data from this handwritten timesheet image.

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "employeeName": "string",
  "weekStart": "YYYY-MM-DD or MM/DD",
  "weekEnd": "YYYY-MM-DD or MM/DD",
  "submittedOn": "MM/DD/YYYY or string",
  "job": "string",
  "weeklyTotalHours": number or null,
  "days": [
    {
      "dayOfWeek": "string",
      "date": "string (MM/DD or MM-DD)",
      "clockIn": "string (HH:MM or H:MM)",
      "clockOut": "string (HH:MM or H:MM)",
      "totalHours": number or null
    }
  ]
}

Notes:
- Extract employee name from the top area
- "weeklyTotalHours" is the grand weekly total, usually at the bottom
- For "totalHours" in each day, try to parse values like "8½" as 8.5
- If a day column is blank/empty, omit it from the days array
- Time like "6:30" stays as "6:30", do not add AM/PM`;

  try {
    const body = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
    };

    const result = await callGemini(apiKey, body);
    if (!result.ok) {
      console.error("[TimesheetScan] Gemini error:", result.error);
      return res.status(502).json({ error: "Gemini API error", details: result.error });
    }

    const raw = result.text;
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    const cleaned = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(422).json({ error: "Could not parse Gemini response as JSON", raw });
    }

    res.json({ ok: true, timesheet: parsed });
  } catch (e: any) {
    console.error("[TimesheetScan] Unexpected error:", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// POST /api/timesheet/save — saves a verified scanned timesheet to a local log
app.post("/api/timesheet/save", (req, res) => {
  const entry = req.body || {};
  if (!entry.employeeName) return res.status(400).json({ error: "employeeName required" });
  const data = getStoredData() as any;
  if (!data.scannedTimesheets) data.scannedTimesheets = [];
  const saved = {
    id: `ts-${Date.now()}`,
    savedAt: new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }),
    ...entry
  };
  data.scannedTimesheets = [saved, ...data.scannedTimesheets.slice(0, 199)];
  saveStoredData(data);
  res.json({ ok: true, entry: saved });
});

// GET /api/timesheet/saved — list saved scanned timesheets
app.get("/api/timesheet/saved", (_req, res) => {
  const data = getStoredData() as any;
  res.json(data.scannedTimesheets || []);
});

// Logs sheet ID — persists the ID of the Google Sheet used as the permanent log store
app.get("/api/logs-sheet-id", (_req, res) => {
  const data = getStoredData();
  res.json({ logsSheetId: data.logsSheetId || null });
});

app.post("/api/logs-sheet-id", (req, res) => {
  const { logsSheetId } = req.body || {};
  if (!logsSheetId || typeof logsSheetId !== "string") {
    return res.status(400).json({ error: "logsSheetId required" });
  }
  const data = getStoredData();
  data.logsSheetId = logsSheetId;
  saveStoredData(data);
  res.json({ success: true, logsSheetId });
});

// Login log — records who signed in, from where, on what device
app.post("/api/login-log", (req, res) => {
  const data = getStoredData();
  const entry = {
    id: `ll-${Date.now()}`,
    timestamp: new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }),
    ...req.body
  };
  data.loginLog = [entry, ...(data.loginLog || []).slice(0, 499)];
  saveStoredData(data);
  res.json({ success: true, entry });
});

app.get("/api/login-log", (_req, res) => {
  const data = getStoredData();
  res.json(data.loginLog || []);
});

// =============================================================================
// 4YR Payroll API Routes
// =============================================================================

// GET /api/4yr/dropdown-data
app.get("/api/4yr/dropdown-data", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || "";
  if (!token) return res.status(401).json({ error: "Missing access token" });
  try {
    const data = await fourYrGetDropdowns(token);
    res.json({ ok: true, ...data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// GET /api/4yr/dropdown-data-for-entry
app.get("/api/4yr/dropdown-data-for-entry", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || "";
  if (!token) return res.status(401).json({ error: "Missing access token" });
  try {
    const data = await getDropdownDataForEntry(token);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/filtered-data
app.post("/api/4yr/filtered-data", async (req, res) => {
  const token = req.body?.accessToken || "";
  if (!token) return res.status(401).json({ error: "Missing access token" });
  try {
    const filters = req.body?.filters || {};
    const data = await fourYrGetFiltered(filters, token);
    res.json({ ok: true, ...data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// GET /api/4yr/master-list
app.get("/api/4yr/master-list", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || "";
  if (!token) return res.status(401).json({ error: "Missing access token" });
  try {
    const data = await getMasterListEmployees(token);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// GET /api/4yr/employee-ytd
app.get("/api/4yr/employee-ytd", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || "";
  if (!token) return res.status(401).json({ error: "Missing access token" });
  const name = String(req.query.name || "");
  if (!name) return res.status(400).json({ error: "Missing name" });
  try {
    const data = await getEmployeeYTD(name, token);
    res.json({ ok: true, ...data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/project-total
app.post("/api/4yr/project-total", async (req, res) => {
  const token = req.body?.accessToken || "";
  if (!token) return res.status(401).json({ error: "Missing access token" });
  try {
    const data = await getProjectTotalData(req.body?.filters || {}, token);
    res.json({ ok: true, ...data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/save-remark
app.post("/api/4yr/save-remark", async (req, res) => {
  const { accessToken, rowIndex, remark } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  try {
    const r = await saveRemark(rowIndex, remark, accessToken);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/save-time
app.post("/api/4yr/save-time", async (req, res) => {
  const { accessToken, rowIndex, started, finished } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  try {
    const r = await saveTime(rowIndex, started, finished, accessToken);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/save-hours
app.post("/api/4yr/save-hours", async (req, res) => {
  const { accessToken, rowIndex, hours } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  try {
    const r = await saveHours(rowIndex, Number(hours), accessToken);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/save-hours-override
app.post("/api/4yr/save-hours-override", async (req, res) => {
  const { accessToken, rowIndex, hours } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  try {
    const r = await saveHoursOverride(rowIndex, Number(hours), accessToken);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/save-total
app.post("/api/4yr/save-total", async (req, res) => {
  const { accessToken, rowIndex, total } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  try {
    const r = await saveTotal(rowIndex, Number(total), accessToken);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/save-job
app.post("/api/4yr/save-job", async (req, res) => {
  const { accessToken, rowIndex, job } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  try {
    const r = await saveJob(rowIndex, job, accessToken);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/save-edit
app.post("/api/4yr/save-edit", async (req, res) => {
  const { accessToken, ...params } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  try {
    const r = await saveRecordEdit(params, accessToken);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/add-entry
app.post("/api/4yr/add-entry", async (req, res) => {
  const { accessToken, ...params } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  try {
    const r = await addRawEntry(params, accessToken);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/delete-entry
app.post("/api/4yr/delete-entry", async (req, res) => {
  const { accessToken, rowIndex } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  try {
    const r = await deleteRawEntry(Number(rowIndex), accessToken);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/save-master-employee
app.post("/api/4yr/save-master-employee", async (req, res) => {
  const { accessToken, ...params } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  try {
    const r = await saveMasterListEmployee(params, accessToken);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/add-master-employee
app.post("/api/4yr/add-master-employee", async (req, res) => {
  const { accessToken, ...params } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  try {
    const r = await addMasterListEmployee(params, accessToken);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/delete-master-employee
app.post("/api/4yr/delete-master-employee", async (req, res) => {
  const { accessToken, sheetRow } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  try {
    const r = await deleteMasterListEmployee(Number(sheetRow), accessToken);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/4yr/start-new-week
app.post("/api/4yr/start-new-week", async (req, res) => {
  const token = req.body?.accessToken || "";
  if (!token) return res.status(401).json({ error: "Missing access token" });
  try {
    const result = await startNewWeek(token);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FinanceOps Hub running on http://0.0.0.0:${PORT}`);
    // Auto-fetch live data from Google Sheets on boot
    syncLiveDataFromSheets();
  });
}

export default app;

if (!process.env.VERCEL) {
  startServer();
}
