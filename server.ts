import express from "express";
import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";
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
  ],
  // Runtime sheet ID overrides — set via /api/config/set-sheet-id to switch active sheet
  // without a code redeploy. Keys: "main", "payroll4yr", "calendar", "cc"
  sheetIdOverrides: {} as Record<string, string>,
};

// Notes merge: sheet is the EXCLUSIVE source of truth.
// Only sheet rows are shown. Local data only preserves done-status
// until it has been written back to the sheet.
function mergeNotes(liveList: any[], currentList: any[]) {
  if (!liveList || liveList.length === 0) return [];   // sheet empty → nothing to show

  const currentMap = new Map<string, any>();
  (currentList || []).forEach((item) => {
    if (item?.id) currentMap.set(String(item.id), item);
  });

  // Deduplicate sheet rows by id (guards against duplicate rows in the sheet)
  const seen = new Set<string>();
  return liveList
    .filter((item) => {
      if (!item?.id) return true;
      const id = String(item.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((liveItem) => {
      const itemId = String(liveItem.id || "");
      if (itemId && currentMap.has(itemId)) {
        const currentItem = currentMap.get(itemId)!;
        // Sheet "done" wins; also preserve local "done" until next write-back
        const status = liveItem.status === "done" || currentItem.status === "done" ? "done" : "open";
        const completedAt = status === "done" ? (currentItem.completedAt || liveItem.completedAt) : undefined;
        return { ...liveItem, status, completedAt };
      }
      return liveItem;
    });
  // Local-only notes (not in the sheet) are intentionally excluded.
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

/** Build an authenticated Drive client from the user's OAuth access token. */
function getDriveClient(userAccessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: userAccessToken });
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

// Shared central Drive folder — all bill copies go here regardless of who's logged in
const BILLS_ROOT_FOLDER_ID = "1AzwpWEMdyp1SEeNtXrie5171cSk5L7Za";

/** Ensure the full path exists under the bills root folder, return the leaf folder ID. */
async function ensurePath(drive: any, segments: string[]): Promise<string> {
  let parentId = BILLS_ROOT_FOLDER_ID;
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
  const { imageBase64, mimeType, entity, vendor, invoiceNo, dueDate, amount, userAccessToken } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });
  if (!userAccessToken) return res.status(401).json({ error: "userAccessToken required" });

  let drive: any;
  try { drive = getDriveClient(userAccessToken); }
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
// Vision LLM helper — tries OpenAI first, falls back to Gemini
// =============================================================================

const GEMINI_MODELS = [
  { version: "v1beta", model: "gemini-3.5-flash"      },
  { version: "v1beta", model: "gemini-3.5-flash-lite"  },
  { version: "v1beta", model: "gemini-3.6-flash"      },
  { version: "v1beta", model: "gemini-3.7-flash"      },
  { version: "v1beta", model: "gemini-2.5-flash"      },
  { version: "v1beta", model: "gemini-2.5-flash-lite" },
  { version: "v1beta", model: "gemini-2.5-pro"        },
];

async function callGemini(apiKey: string, prompt: string, imageBase64: string, mimeType: string, maxTokens: number): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const body = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens }
  };
  let lastError = "No available Gemini model";
  for (const { version, model } of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`;
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) {
        const resp = await r.json() as any;
        const text = resp?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        console.log(`[Vision] Gemini model used: ${model} | raw response (first 300): ${text.slice(0, 300)}`);
        return { ok: true, text };
      }
      const errBody = await r.json().catch(() => ({})) as any;
      const status = errBody?.error?.status || "";
      lastError = errBody?.error?.message || `HTTP ${r.status}`;
      console.warn(`[Vision] Gemini ${model} → ${status || r.status}: ${lastError}`);
      if (status !== "NOT_FOUND" && status !== "UNAVAILABLE" && r.status !== 404) return { ok: false, error: lastError };
    } catch (e: any) { lastError = e?.message || String(e); }
  }
  return { ok: false, error: lastError };
}

/**
 * Unified vision LLM call.
 * Uses OpenAI gpt-4o-mini if OPENAI_API_KEY is set; otherwise falls back to Gemini.
 * PDFs are only supported by Gemini — OpenAI will receive image/jpeg for non-image types.
 */
async function callVisionLLM(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  maxTokens: number
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey) {
    try {
      // OpenAI vision supports image/* only; treat PDF/unknown as jpeg
      const imgMime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
      const body = {
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${imgMime};base64,${imageBase64}` } }
          ]
        }],
        max_tokens: maxTokens,
        temperature: 0.1
      };
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
        body: JSON.stringify(body)
      });
      if (r.ok) {
        const resp = await r.json() as any;
        const text = resp?.choices?.[0]?.message?.content || "";
        console.log("[Vision] Used OpenAI gpt-4o-mini");
        return { ok: true, text };
      }
      const err = await r.json().catch(() => ({})) as any;
      console.warn("[Vision] OpenAI failed:", err?.error?.message || r.status, "— falling back to Gemini");
    } catch (e: any) {
      console.warn("[Vision] OpenAI error:", e?.message, "— falling back to Gemini");
    }
  }

  // Fallback: Gemini
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return { ok: false, error: "No vision API key configured. Set OPENAI_API_KEY or GEMINI_API_KEY in Render." };
  return callGemini(geminiKey, prompt, imageBase64, mimeType, maxTokens);
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

// ── Fuzzy name-matching helpers ─────────────────────────────────────────────
function normalizeName(s: string): string {
  return s.toLowerCase().trim().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
function fuzzyScore(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer  = Math.max(na.length, nb.length);
    return 0.7 + 0.3 * (shorter / longer);
  }
  const tokA = new Set(na.split(" ").filter(Boolean));
  const tokB = new Set(nb.split(" ").filter(Boolean));
  const intersection = [...tokA].filter(t => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : intersection / union;
}
function bestMatch(name: string, candidates: string[]): { matched: string | null; confidence: number; isNew: boolean } {
  if (!candidates.length || !name.trim()) return { matched: null, confidence: 0, isNew: true };
  let best: { matched: string | null; confidence: number } = { matched: null, confidence: 0 };
  for (const c of candidates) {
    const score = fuzzyScore(name, c);
    if (score > best.confidence) best = { matched: c, confidence: score };
  }
  return { ...best, isNew: best.confidence < 0.5 };
}
// ────────────────────────────────────────────────────────────────────────────

// POST /api/invoice/scan — Gemini Vision extracts bill/invoice data
app.post("/api/invoice/scan", async (req, res) => {
  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const prompt = `Extract invoice/bill data from this image. Respond with ONLY a raw JSON object — no markdown fences, no explanation, no preamble, just the JSON object starting with { and ending with }.

Schema:
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
- All dates must be in YYYY-MM-DD format (e.g. 2026-08-21). If a date is printed as MM/DD/YYYY or "Month DD, YYYY", convert it
- If the due date is expressed as a NET term (e.g. "NET 30", "Net 60"), output it literally as "NET 30" — the app will compute the actual date
- Be as accurate as possible; leave fields null rather than guessing incorrectly`;

  try {
    const result = await callVisionLLM(prompt, imageBase64, mimeType || "image/jpeg", 4096);
    if (!result.ok) return res.status(502).json({ error: "Vision API error", details: result.error });

    const raw = result.text;
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    let cleaned = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();
    cleaned = cleaned
      .replace(/(\d+)½/g, (_, n) => String(parseFloat(n) + 0.5))
      .replace(/(\d+)¼/g, (_, n) => String(parseFloat(n) + 0.25))
      .replace(/(\d+)¾/g, (_, n) => String(parseFloat(n) + 0.75))
      .replace(/½/g, "0.5").replace(/¼/g, "0.25").replace(/¾/g, "0.75");
    console.log(`[InvoiceScan] Full cleaned (first 800): ${cleaned.slice(0, 800)}`);
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr: any) {
      console.error(`[InvoiceScan] JSON.parse failed: ${parseErr?.message} | cleaned length: ${cleaned.length}`);
      return res.status(422).json({ error: "Could not parse response as JSON", raw, cleaned: cleaned.slice(0, 500) });
    }
    // Match extracted vendor name against known vendors in stored AP data
    const storedForVendor = getStoredData();
    const knownVendors = [...new Set(((storedForVendor.ap || []) as any[]).map((b: any) => b.vendor).filter(Boolean))] as string[];
    const vendorMatch = bestMatch(parsed.vendor || "", knownVendors);
    if (!vendorMatch.isNew && vendorMatch.matched) parsed.vendor = vendorMatch.matched;
    res.json({ ok: true, invoice: { ...parsed, vendorMatch } });
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

// POST /api/ar/add-scanned — save an AI-scanned invoice to AR data
app.post("/api/ar/add-scanned", (req, res) => {
  const inv = req.body || {};
  if (!inv.client && !inv.vendor) return res.status(400).json({ error: "client/vendor required" });
  const data = getStoredData();
  const newInvoice = {
    id: `ar-scan-${Date.now()}`,
    client: inv.client || inv.vendor || "Unknown",
    entity: inv.entity || "",
    amount: typeof inv.amount === "number" ? inv.amount : 0,
    dueDate: inv.dueDate || "",
    issueDate: inv.issueDate || "",
    invoiceNo: inv.invoiceNo || "",
    description: inv.description || "",
    remarks: inv.remarks || "",
    status: "Pending",
    payment: false,
    createdAt: new Date().toISOString(),
    scanned: true,
    source: "email-scanner",
  };
  (data as any).ar = [newInvoice, ...((data as any).ar || [])];
  saveStoredData(data);
  res.json({ ok: true, invoice: newInvoice });
});

// POST /api/pdf/extract — Gemini scans any PDF and extracts all data (tables, KV, text)
app.post("/api/pdf/extract", async (req, res) => {
  const { imageBase64, mimeType, mode } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const focusHint =
    mode === "tables" ? "Focus on extracting structured table data." :
    mode === "kv"     ? "Focus on extracting key-value metadata (invoice numbers, dates, totals, client info, etc.)." :
    mode === "text"   ? "Extract all text content line by line." :
    "Extract everything: tables, key-value data, and important text blocks.";

  const prompt = `You are a precise financial document data extraction engine.
${focusHint}

Analyse this document and return a JSON object with EXACTLY this structure (no markdown, no code fences, raw JSON only):

{
  "documentType": "invoice|bill|timesheet|report|statement|other",
  "sections": [
    {
      "title": "Descriptive section name",
      "type": "table",
      "pageRange": "p.1",
      "headers": ["Column A", "Column B"],
      "rows": [{"Column A": "value", "Column B": "value"}]
    },
    {
      "title": "Document Info",
      "type": "kv",
      "pageRange": "p.1",
      "headers": ["Field", "Value"],
      "rows": [{"Field": "Invoice Number", "Value": "INV-001"}, {"Field": "Date", "Value": "2026-08-26"}]
    },
    {
      "title": "Notes",
      "type": "text",
      "pageRange": "p.1",
      "headers": ["Content"],
      "rows": [{"Content": "line of text here"}]
    }
  ]
}

Critical rules:
- Preserve ALL numeric values exactly as displayed: times as H:MM:SS, amounts with currency symbol, percentages with %, dates in their original format.
- Use the ACTUAL column headers from the document — never auto-generate "Col 1", "Col 2" etc.
- Extract ALL rows — do not truncate or summarise.
- Separate distinct tables into separate sections with descriptive titles.
- Extract document metadata (invoice #, date, vendor, client, total, tax, etc.) as a "kv" section at the top.
- If a table spans multiple pages, merge it into one section with pageRange "p.X-Y".
- Return ONLY valid JSON. No explanation, no markdown, no code fences.`;

  try {
    // Force Gemini for PDFs (OpenAI vision can't read PDFs natively)
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(502).json({ error: "GEMINI_API_KEY not set on server" });
    const result = await callGemini(geminiKey, prompt, imageBase64, mimeType || "application/pdf", 8192);
    if (!result.ok) return res.status(502).json({ error: result.error });

    const raw = result.text;
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    const cleaned = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e: any) {
      console.error("[PDFExtract] JSON parse failed:", e?.message, "| raw:", raw.slice(0, 300));
      return res.status(422).json({ error: "Could not parse Gemini response as JSON", raw: raw.slice(0, 500) });
    }
    res.json({ ok: true, documentType: parsed.documentType || "other", sections: parsed.sections || [] });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/api/timesheet/scan", async (req, res) => {
  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const prompt = `Extract timesheet data from this image. Respond with ONLY a raw JSON object — no markdown fences, no explanation, no preamble, just the JSON object starting with { and ending with }.

IMPORTANT: All numeric values must be plain decimals. Convert fractions before outputting: 8½ → 8.5, 7½ → 7.5, 8¼ → 8.25. Never output fraction characters (½ ¼ ¾) — always convert to decimal numbers.

Schema:
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
- Output all times in 24-hour HH:MM format with leading zeros: "06:30" not "6:30", "15:00" not "3:00"
- Clock-in times are typically morning (06:00–09:00), clock-out times are typically afternoon (14:00–18:00) — use this to infer AM vs PM when converting to 24-hour`;

  try {
    const result = await callVisionLLM(prompt, imageBase64, mimeType || "image/jpeg", 8192);
    if (!result.ok) {
      console.error("[TimesheetScan] Vision error:", result.error);
      return res.status(502).json({ error: "Vision API error", details: result.error });
    }

    const raw = result.text;
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    let cleaned = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();
    // Replace fraction unicode characters that break JSON parsing
    cleaned = cleaned
      .replace(/(\d+)½/g, (_, n) => String(parseFloat(n) + 0.5))
      .replace(/(\d+)¼/g, (_, n) => String(parseFloat(n) + 0.25))
      .replace(/(\d+)¾/g, (_, n) => String(parseFloat(n) + 0.75))
      .replace(/½/g, "0.5").replace(/¼/g, "0.25").replace(/¾/g, "0.75");
    console.log(`[TimesheetScan] Full cleaned (first 800): ${cleaned.slice(0, 800)}`);
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr: any) {
      console.error(`[TimesheetScan] JSON.parse failed: ${parseErr?.message} | cleaned length: ${cleaned.length}`);
      return res.status(422).json({ error: "Could not parse response as JSON", raw, cleaned: cleaned.slice(0, 500) });
    }
    // Match extracted employee name against known employees:
    // 1. explicitly registered via POST /api/known-employees (loaded from payroll portal)
    // 2. names from previously saved timesheets
    const storedForEmp = getStoredData() as any;
    const registeredEmployees: string[] = storedForEmp.knownEmployees || [];
    const savedTsEmployees: string[] = ((storedForEmp.scannedTimesheets || []) as any[]).map((t: any) => t.employeeName).filter(Boolean);
    const knownEmployees = [...new Set([...registeredEmployees, ...savedTsEmployees])];
    const employeeMatch = bestMatch(parsed.employeeName || "", knownEmployees);
    if (!employeeMatch.isNew && employeeMatch.matched) parsed.employeeName = employeeMatch.matched;
    res.json({ ok: true, timesheet: { ...parsed, employeeMatch } });
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
  // Also register the employee name in the known-employees registry
  if (!data.knownEmployees) data.knownEmployees = [];
  const name = String(entry.employeeName).trim();
  if (name && !data.knownEmployees.includes(name)) data.knownEmployees.push(name);
  saveStoredData(data);
  res.json({ ok: true, entry: saved });
});

// POST /api/known-employees — client registers employee names (seeded from 4YR payroll page)
app.post("/api/known-employees", (req, res) => {
  const { names } = req.body || {};
  if (!Array.isArray(names)) return res.status(400).json({ error: "names array required" });
  const data = getStoredData() as any;
  if (!data.knownEmployees) data.knownEmployees = [];
  let added = 0;
  for (const n of names) {
    const name = String(n || "").trim();
    if (name && !data.knownEmployees.includes(name)) {
      data.knownEmployees.push(name);
      added++;
    }
  }
  saveStoredData(data);
  res.json({ ok: true, total: data.knownEmployees.length, added });
});

// GET /api/known-employees — returns the registered employee names
app.get("/api/known-employees", (_req, res) => {
  const data = getStoredData() as any;
  res.json(data.knownEmployees || []);
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

// Activity log — centralized across all users (same file on server)
app.post("/api/activity-log", (req, res) => {
  const data = getStoredData();
  const entry = {
    id: `al-${Date.now()}`,
    timestamp: new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }),
    ...req.body
  };
  if (!data.activityLog) data.activityLog = [];
  data.activityLog = [entry, ...data.activityLog.slice(0, 999)];
  saveStoredData(data);
  res.json({ success: true, entry });
});

app.get("/api/activity-log", (_req, res) => {
  const data = getStoredData();
  res.json(data.activityLog || []);
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

// ────────────────────────────────────────────────────────────
// CC EXPENSES ROUTES
// Spreadsheet: 1gKCKrWw8mkqJDiRl_9xYIhkzmtjOEoauQZgbtW9gIew
// ────────────────────────────────────────────────────────────
const CC_SHEET_ID_DEFAULT = "1gKCKrWw8mkqJDiRl_9xYIhkzmtjOEoauQZgbtW9gIew";
// Read at call time so runtime overrides take effect without restart
function getCCSheetId(): string { return (getStoredData().sheetIdOverrides?.cc) || CC_SHEET_ID_DEFAULT; }

// Parse CSV or XLSX file sent as base64, return rows
app.post("/api/cc-expense/parse", async (req, res) => {
  const { fileBase64, fileName } = req.body || {};
  if (!fileBase64 || !fileName) return res.status(400).json({ error: "Missing fileBase64 or fileName" });
  try {
    const buf = Buffer.from(fileBase64, "base64");
    const wb = XLSX.read(buf, { type: "buffer", raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    res.json({ ok: true, rows, sheetName: wb.SheetNames[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Pull all data from the CC expense Google Sheet
app.post("/api/cc-expense/pull", async (req, res) => {
  const { accessToken } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  const base = "https://sheets.googleapis.com/v4/spreadsheets";
  const headers = { Authorization: `Bearer ${accessToken}` };
  try {
    const ranges = [
      "'Raw Data'!A:K",
      "'_Vendor Map'!A:B",
      "'Weekly Summary'!A:Z",
      "'YTD Summary'!A:Z",
    ];
    const query = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join("&");
    const resp = await fetch(
      `${base}/${getCCSheetId()}/values:batchGet?${query}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
      { headers }
    );
    if (!resp.ok) {
      const err = await resp.text();
      return res.status(resp.status).json({ ok: false, error: err });
    }
    const data: any = await resp.json();
    const [rawDataRange, vendorMapRange, weeklySummaryRange, ytdSummaryRange] = (data.valueRanges || []);
    const rawRows: any[][] = rawDataRange?.values || [];
    const vendorMapRows: any[][] = vendorMapRange?.values || [];
    const weeklySummaryRows: any[][] = weeklySummaryRange?.values || [];
    const ytdSummaryRows: any[][] = ytdSummaryRange?.values || [];
    res.json({ ok: true, rawRows, vendorMapRows, weeklySummaryRows, ytdSummaryRows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Upload rows to Raw Data tab of CC expense sheet (replaces existing data starting at row 3)
app.post("/api/cc-expense/upload", async (req, res) => {
  const { accessToken, rows } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "Missing access token" });
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows must be an array" });
  const base = "https://sheets.googleapis.com/v4/spreadsheets";
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  try {
    // First clear existing raw data rows (row 3 onwards)
    await fetch(
      `${base}/${getCCSheetId()}/values/'Raw Data'!A3:K?valueRenderOption=UNFORMATTED_VALUE`,
      { method: "DELETE", headers }
    );
    if (!rows.length) return res.json({ ok: true, updated: 0 });
    const body = JSON.stringify({
      range: "'Raw Data'!A3",
      majorDimension: "ROWS",
      values: rows,
    });
    const writeResp = await fetch(
      `${base}/${getCCSheetId()}/values/'Raw Data'!A3?valueInputOption=USER_ENTERED`,
      { method: "PUT", headers, body }
    );
    if (!writeResp.ok) {
      const err = await writeResp.text();
      return res.status(writeResp.status).json({ ok: false, error: err });
    }
    const result: any = await writeResp.json();
    res.json({ ok: true, updated: result.updatedRows || rows.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ── AR: Scan invoice (reuses same vision LLM as bill scanner) ────────────────────
app.post("/api/ar/scan-invoice", async (req, res) => {
  const { fileBase64, fileName, mimeType } = req.body || {};
  if (!fileBase64) return res.status(400).json({ ok: false, error: "No file provided" });
  try {
    const prompt = `Extract invoice/receivable information from this document. Return ONLY valid JSON with these fields (use empty string if not found):
{
  "customer": "company or person being billed / who owes money",
  "amount": "total amount due as numeric string e.g. 1500.00",
  "dueDate": "due date in YYYY-MM-DD format",
  "description": "brief description of goods or services",
  "entity": "issuing company if identifiable (e.g. Ruby's, TI, MSDx, Capable DNA)"
}
Return ONLY the JSON object, no markdown, no other text.`;
    const result = await callVisionLLM(prompt, fileBase64, mimeType || "image/jpeg", 512);
    if (!result.ok) return res.status(502).json({ ok: false, error: result.error });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    res.json({ ok: true, parsed });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ── AR: Save invoice file to Google Drive ────────────────────────────────────────
// Parent folder: 17A6yyvoPIlCfegus79yD3Vvt6HJnCoL2 (Invoices root)
// Subfolder: fuzzy-matched against existing subfolders, auto-created if no match.
const INVOICES_DRIVE_FOLDER = "17A6yyvoPIlCfegus79yD3Vvt6HJnCoL2";

/** Normalize a name for fuzzy matching: lowercase, strip punctuation & common suffixes */
function normalizeFolderName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")                                        // smart quotes
    .replace(/\b(inc|llc|ltd|corp|co|the|and|of|&)\b/g, "")      // common biz words
    .replace(/[^a-z0-9\s]/g, " ")                                 // non-alphanum → space
    .replace(/\s+/g, " ")
    .trim();
}

/** Score how well `extracted` matches `folderName`. Higher = better. Returns 0 if no match. */
function matchScore(extracted: string, folderName: string): number {
  const a = normalizeFolderName(extracted);
  const b = normalizeFolderName(folderName);
  if (!a || !b) return 0;
  if (a === b) return 100;                            // exact
  if (b.includes(a) || a.includes(b)) return 80;     // one contains the other
  // token overlap: how many words from `a` appear in `b`
  const tokA = a.split(" ").filter(Boolean);
  const tokB = new Set(b.split(" ").filter(Boolean));
  const overlap = tokA.filter(t => tokB.has(t)).length;
  if (overlap > 0) return 40 + (overlap / tokA.length) * 30;
  // acronym: first letters of folder words match extracted
  const acronym = b.split(" ").map(w => w[0]).join("");
  if (a === acronym || acronym === a) return 70;
  return 0;
}

app.post("/api/ar/save-to-drive", async (req, res) => {
  const { accessToken, fileBase64, fileName, mimeType, customer } = req.body || {};
  if (!accessToken) return res.status(401).json({ ok: false, error: "No access token" });
  if (!fileBase64 || !fileName) return res.status(400).json({ ok: false, error: "Missing file data" });

  try {
    const extractedName = (customer || "Unknown").trim();
    const driveBase = "https://www.googleapis.com/drive/v3";
    const driveUpload = "https://www.googleapis.com/upload/drive/v3";
    const headers = { Authorization: `Bearer ${accessToken}` };

    // 1. List all existing subfolders in the Invoices root
    const listResp = await fetch(
      `${driveBase}/files?q=${encodeURIComponent(`'${INVOICES_DRIVE_FOLDER}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)&pageSize=100`,
      { headers }
    );
    const listData: any = await listResp.json();
    const existingFolders: { id: string; name: string }[] = listData.files || [];

    // 2. Fuzzy-match extracted customer against existing folders (name-only pass)
    const folderScores: { folder: { id: string; name: string }; nameScore: number }[] = [];
    for (const f of existingFolders) {
      const nameScore = matchScore(extractedName, f.name);
      folderScores.push({ folder: f, nameScore });
    }

    // 3. Inspect file names inside top candidate folders (up to 5) to boost scores
    //    e.g. folder "CPRO" containing "CurcuminPro Invoice.pdf" helps match "CurcuminPro"
    const CANDIDATE_THRESHOLD = 15; // low bar to be inspected
    const candidates = folderScores
      .filter(x => x.nameScore >= CANDIDATE_THRESHOLD)
      .sort((a, b) => b.nameScore - a.nameScore)
      .slice(0, 5);

    const folderFinalScores: { folder: { id: string; name: string }; score: number; via: string }[] = [];

    await Promise.all(candidates.map(async ({ folder, nameScore }) => {
      let fileBoost = 0;
      let bestFileName = "";
      try {
        const filesResp = await fetch(
          `${driveBase}/files?q=${encodeURIComponent(`'${folder.id}' in parents and trashed=false`)}&fields=files(name)&pageSize=20`,
          { headers }
        );
        const filesData: any = await filesResp.json();
        const fileNames: string[] = (filesData.files || []).map((f: any) =>
          (f.name as string).replace(/\.[^/.]+$/, "") // strip extension
        );
        for (const fn of fileNames) {
          const s = matchScore(extractedName, fn);
          if (s > fileBoost) { fileBoost = s; bestFileName = fn; }
        }
      } catch {
        // ignore per-folder errors — fall back to name score
      }
      // File name match counts at 90% weight (folder name is more authoritative)
      const combined = Math.max(nameScore, Math.round(fileBoost * 0.9));
      const via = combined > nameScore
        ? `file:"${bestFileName}" score ${fileBoost}→${combined}`
        : `name score ${nameScore}`;
      folderFinalScores.push({ folder, score: combined, via });
    }));

    // Also include folders that didn't make the candidate cut (score stays 0)
    const inspectedIds = new Set(candidates.map(c => c.folder.id));
    for (const { folder, nameScore } of folderScores.filter(x => !inspectedIds.has(x.folder.id))) {
      folderFinalScores.push({ folder, score: nameScore, via: `name score ${nameScore}` });
    }

    let bestMatch: { id: string; name: string } | null = null;
    let bestScore = 0;
    let bestVia = "";
    for (const { folder, score, via } of folderFinalScores) {
      if (score > bestScore) { bestScore = score; bestMatch = folder; bestVia = via; }
    }

    const MATCH_THRESHOLD = 50; // minimum score to reuse an existing folder
    let folderId: string;
    let resolvedFolderName: string;
    let folderCreated = false;

    if (bestMatch && bestScore >= MATCH_THRESHOLD) {
      // Reuse the matched folder
      folderId = bestMatch.id;
      resolvedFolderName = bestMatch.name;
      console.log(`[DriveInvoice] Matched "${extractedName}" → "${resolvedFolderName}" (score ${bestScore}, via ${bestVia})`);
    } else {
      // Create a new subfolder named after the extracted customer
      const createResp = await fetch(`${driveBase}/files`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: extractedName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [INVOICES_DRIVE_FOLDER],
        }),
      });
      const created: any = await createResp.json();
      if (!createResp.ok) throw new Error(`Create folder failed: ${created?.error?.message}`);
      folderId = created.id;
      resolvedFolderName = extractedName;
      folderCreated = true;
      console.log(`[DriveInvoice] No match for "${extractedName}" (best score ${bestScore}) — created new folder`);
    }

    // 3. Upload file via multipart
    const fileBytes = Buffer.from(fileBase64, "base64");
    const boundary = "arInvoiceBoundary";
    const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
      Buffer.from(metadata),
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`),
      fileBytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const uploadResp = await fetch(`${driveUpload}/files?uploadType=multipart&fields=id,name,webViewLink`, {
      method: "POST",
      headers: { ...headers, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    const uploadData: any = await uploadResp.json();
    if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadData?.error?.message}`);

    res.json({
      ok: true,
      fileId: uploadData.id,
      fileName: uploadData.name,
      webViewLink: uploadData.webViewLink,
      resolvedFolderName,
      folderCreated,
      matchScore: bestScore,
      matchVia: bestVia,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ── CC Adjustments: read adjustments from "CC Adjustments" tab ──────────────────
// Row format: [weekStart, vendor, company, delta]
app.post("/api/cc-expense/adjustments/pull", async (req, res) => {
  const { accessToken } = req.body || {};
  if (!accessToken) return res.status(401).json({ ok: false, error: "No access token" });
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${getCCSheetId()}/values/CC%20Adjustments!A2:D?majorDimension=ROWS`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) {
      // If the tab doesn't exist, return empty list
      if (resp.status === 400 || resp.status === 404) return res.json({ ok: true, rows: [] });
      throw new Error(`Sheets error ${resp.status}`);
    }
    const data: any = await resp.json();
    res.json({ ok: true, rows: data.values || [] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ── CC Adjustments: append adjustment rows ────────────────────────────────────────
// Appends rows to "CC Adjustments" tab. Caller passes array of [weekStart, vendor, company, delta].
app.post("/api/cc-expense/adjustments/push", async (req, res) => {
  const { accessToken, rows } = req.body || {};
  if (!accessToken) return res.status(401).json({ ok: false, error: "No access token" });
  if (!rows?.length) return res.json({ ok: true, updated: 0 });
  try {
    // Ensure the CC Adjustments tab exists — if not, create it
    const metaResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${getCCSheetId()}?fields=sheets.properties.title`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meta: any = await metaResp.json();
    const titles: string[] = (meta.sheets || []).map((s: any) => s.properties?.title || "");
    if (!titles.includes("CC Adjustments")) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${getCCSheetId()}:batchUpdate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: "CC Adjustments" } } }] }),
      });
      // Write header row
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${getCCSheetId()}/values/CC%20Adjustments!A1:D1?valueInputOption=RAW`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ range: "CC Adjustments!A1:D1", majorDimension: "ROWS", values: [["WeekStart", "Vendor", "Company", "Delta"]] }),
      });
    }
    // Append the adjustment rows
    const appendResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${getCCSheetId()}/values/CC%20Adjustments!A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ range: "CC Adjustments!A:D", majorDimension: "ROWS", values: rows }),
      }
    );
    const result: any = await appendResp.json();
    res.json({ ok: true, updated: rows.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ── Sheet Continuity: runtime sheet ID override ──────────────────────────────────
// POST /api/config/set-sheet-id  { key: "cc"|"main"|"calendar"|"payroll4yr", id: "..." }
// Persists the new sheet ID to financeops_data.json so it survives server restarts.
// The CC route reads getCCSheetId() on every request, so this takes effect immediately.
// The liveSheetsFetcher constants are read at startup — a manual /api/live-sync call
// will re-fetch with the updated IDs passed via query-time helpers below.
app.post("/api/config/set-sheet-id", (req, res) => {
  const { key, id } = req.body || {};
  const VALID_KEYS = ["main", "payroll4yr", "calendar", "cc"];
  if (!VALID_KEYS.includes(key)) return res.status(400).json({ ok: false, error: `key must be one of ${VALID_KEYS.join(", ")}` });
  if (!id || typeof id !== "string" || !/^[A-Za-z0-9_-]{20,60}$/.test(id)) return res.status(400).json({ ok: false, error: "Invalid sheet ID format" });
  if (!data.sheetIdOverrides) data.sheetIdOverrides = {};
  data.sheetIdOverrides[key] = id;
  persistChanges({ sheetIdOverrides: data.sheetIdOverrides });
  console.log(`[SheetOverride] ${key} → ${id}`);
  res.json({ ok: true, key, id });
});

// GET /api/config/sheet-ids — return current active sheet IDs (overrides + defaults)
app.get("/api/config/sheet-ids", (_req, res) => {
  res.json({
    ok: true,
    ids: {
      main:       data.sheetIdOverrides?.main       || "15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs",
      payroll4yr: data.sheetIdOverrides?.payroll4yr || "1SITtQDT3iFo5yIOBgjbERbqJjYJ8rk6drXwkLm3sAGE",
      calendar:   data.sheetIdOverrides?.calendar   || "1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo",
      cc:         data.sheetIdOverrides?.cc         || "1gKCKrWw8mkqJDiRl_9xYIhkzmtjOEoauQZgbtW9gIew",
    },
  });
});

// ── Sheet Continuity: usage + blank-clone ────────────────────────────────────────
// GET /api/sheets/usage?spreadsheetId=...
// Returns per-tab row/col counts and total cell count vs 10M limit.
app.get("/api/sheets/usage", async (req, res) => {
  const { spreadsheetId } = req.query as { spreadsheetId?: string };
  const accessToken = req.headers.authorization?.replace("Bearer ", "");
  if (!accessToken) return res.status(401).json({ ok: false, error: "No access token" });
  if (!spreadsheetId) return res.status(400).json({ ok: false, error: "spreadsheetId required" });
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties(title),sheets(properties(title,sheetId,gridProperties))`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) {
      const err: any = await resp.json();
      return res.status(resp.status).json({ ok: false, error: err?.error?.message || "Sheets API error" });
    }
    const data: any = await resp.json();
    const tabs = (data.sheets || []).map((s: any) => ({
      title: s.properties.title,
      rows: s.properties.gridProperties?.rowCount ?? 0,
      cols: s.properties.gridProperties?.columnCount ?? 0,
      cells: (s.properties.gridProperties?.rowCount ?? 0) * (s.properties.gridProperties?.columnCount ?? 0),
    }));
    const totalCells = tabs.reduce((sum: number, t: any) => sum + t.cells, 0);
    res.json({ ok: true, title: data.properties?.title, tabs, totalCells, limitCells: 10_000_000 });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/sheets/clone-blank
// 1. Copies the spreadsheet via Drive API (exact data clone → archive)
// 2. Clears rows 2+ from every tab in the copy (keeps headers, structure, formatting)
// Returns the new blank spreadsheet ID and URL.
app.post("/api/sheets/clone-blank", async (req, res) => {
  const { accessToken, spreadsheetId, archiveName } = req.body || {};
  if (!accessToken) return res.status(401).json({ ok: false, error: "No access token" });
  if (!spreadsheetId) return res.status(400).json({ ok: false, error: "spreadsheetId required" });

  try {
    const driveBase = "https://www.googleapis.com/drive/v3";
    const sheetsBase = "https://sheets.googleapis.com/v4/spreadsheets";
    const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    // 1. Get current sheet name
    const metaResp = await fetch(`${sheetsBase}/${spreadsheetId}?fields=properties(title),sheets(properties(title,sheetId,gridProperties))`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaResp.ok) throw new Error("Could not fetch spreadsheet metadata");
    const meta: any = await metaResp.json();
    const originalTitle: string = meta.properties?.title || "Spreadsheet";
    const tabs: { title: string; sheetId: number; rows: number }[] = (meta.sheets || []).map((s: any) => ({
      title: s.properties.title,
      sheetId: s.properties.sheetId,
      rows: s.properties.gridProperties?.rowCount ?? 1000,
    }));

    // 2. Copy via Drive API — this becomes the blank clone (we'll clear data from it)
    const datestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const cloneName = archiveName || `${originalTitle} — Blank Clone ${datestamp}`;
    const copyResp = await fetch(`${driveBase}/files/${spreadsheetId}/copy`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: cloneName }),
    });
    if (!copyResp.ok) {
      const copyErr: any = await copyResp.json();
      throw new Error(`Drive copy failed: ${copyErr?.error?.message}`);
    }
    const copyData: any = await copyResp.json();
    const newId: string = copyData.id;

    // 3. Clear data rows (row 2+) from every tab in the copy
    //    Uses batchClear — keeps row 1 (headers) and all formatting intact
    const ranges = tabs.map(t => `'${t.title}'!A2:ZZZ`);
    const clearResp = await fetch(`${sheetsBase}/${newId}/values:batchClear`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ ranges }),
    });
    if (!clearResp.ok) {
      const clearErr: any = await clearResp.json();
      // Non-fatal: the copy was still created; just log the warning
      console.warn(`[SheetClone] batchClear warning: ${clearErr?.error?.message}`);
    }

    console.log(`[SheetClone] Created blank clone of "${originalTitle}" → ${newId}`);
    res.json({
      ok: true,
      newSpreadsheetId: newId,
      newName: cloneName,
      webViewLink: `https://docs.google.com/spreadsheets/d/${newId}/edit`,
      tabsCleared: tabs.length,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// =============================================================================
// Gmail — Email Inbox Scanner
// =============================================================================

/**
 * POST /api/email/scan-inbox
 * Body: { accessToken: string, maxResults?: number }
 * Returns: { emails: [{ id, subject, from, date, snippet, attachments }] }
 */
app.post("/api/email/scan-inbox", async (req, res) => {
  const { accessToken, maxResults = 50 } = req.body || {};
  if (!accessToken) return res.status(401).json({ error: "accessToken required" });

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth });

    const query = [
      "subject:(invoice OR statement OR bill OR receipt OR remittance OR overdue)",
      `"please pay" OR "payment due" OR "amount due" OR "balance due"`,
      "newer_than:30d",
      "has:attachment",
    ].join(" OR ") + " newer_than:30d";

    const listResp = await gmail.users.messages.list({
      userId: "me",
      q: 'subject:(invoice OR statement OR "please pay" OR "payment due" OR bill OR receipt OR remittance OR "amount due" OR overdue) newer_than:30d',
      maxResults: Math.min(Number(maxResults) || 50, 100),
    });

    const messages = listResp.data.messages || [];
    const emails: any[] = [];

    for (const msg of messages) {
      try {
        const full = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        });

        const headers = full.data.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

        // Collect PDF attachments from parts
        const attachments: any[] = [];
        function collectParts(parts: any[] | undefined) {
          if (!parts) return;
          for (const part of parts) {
            if (part.parts) { collectParts(part.parts); continue; }
            const mime = part.mimeType || "";
            const filename = part.filename || "";
            if (
              part.body?.attachmentId &&
              (mime === "application/pdf" ||
               mime.startsWith("image/") ||
               filename.toLowerCase().endsWith(".pdf"))
            ) {
              attachments.push({
                filename: filename || `attachment.${mime.split("/")[1] || "pdf"}`,
                attachmentId: part.body.attachmentId,
                mimeType: mime,
                size: part.body.size || 0,
              });
            }
          }
        }
        collectParts(full.data.payload?.parts);

        // Include all emails — attachments collected if present, but not required
        emails.push({
          id: msg.id,
          subject: getHeader("Subject") || "(no subject)",
          from: getHeader("From") || "Unknown",
          date: getHeader("Date") || "",
          snippet: full.data.snippet || "",
          attachments,
        });
      } catch (msgErr: any) {
        console.warn(`[GmailScan] skipping message ${msg.id}:`, msgErr?.message);
      }
    }

    res.json({ ok: true, emails, total: emails.length });
  } catch (e: any) {
    console.error("[GmailScan]", e?.message || e);
    res.status(502).json({ error: "Gmail scan failed", details: e?.message });
  }
});

/**
 * GET /api/email/attachment/:messageId/:attachmentId?accessToken=...
 * Returns: { data: base64String, mimeType: string, filename: string }
 */
app.get("/api/email/attachment/:messageId/:attachmentId", async (req, res) => {
  const { messageId, attachmentId } = req.params;
  const accessToken = req.query.accessToken as string;

  if (!accessToken) return res.status(401).json({ error: "accessToken required" });
  if (!messageId || !attachmentId) return res.status(400).json({ error: "messageId and attachmentId required" });

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth });

    const attResp = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });

    // Gmail returns URL-safe base64; convert to standard base64
    const urlSafeB64 = attResp.data.data || "";
    const standardB64 = urlSafeB64.replace(/-/g, "+").replace(/_/g, "/");

    res.json({ ok: true, data: standardB64, size: attResp.data.size });
  } catch (e: any) {
    console.error("[GmailAttachment]", e?.message || e);
    res.status(502).json({ error: "Failed to fetch attachment", details: e?.message });
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
