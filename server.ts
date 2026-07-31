import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { fetchFullLiveDataset } from "./src/services/liveSheetsFetcher";

const app = express();
const PORT = 3000;

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
      calendarLocalEvents: mergeDatasets(liveData.calendarLocalEvents, current.calendarLocalEvents, "id"),
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
  data.auditLog = [newLog, ...(data.auditLog || []).slice(0, 99)];
  saveStoredData(data);
  res.json({ success: true, log: newLog });
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
