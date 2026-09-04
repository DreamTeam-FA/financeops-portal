import https from "https";
import { EntityName } from "../types";

/** Returns the URL if it is a valid Google Drive/Docs link, otherwise undefined. */
function sanitizeDriveUrl(url: string): string | undefined {
  if (!url) return undefined;
  if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(url)) return undefined;
  return url;
}

const SPREADSHEET_ID = "15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs";
const CALENDAR_SPREADSHEET_ID = "1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo";

function cleanRemarks(parts: any[]): string {
  return parts
    .map((v) => String(v || "").trim())
    .filter((v) => v.length > 0)
    .join(" · ");
}

function parseDateVal(val: any, year?: any, month?: any, dayStr?: any): string {
  // Current year used to fill in MM/DD entries that have no year component
  const CY = new Date().getFullYear();

  // Month-name abbreviation → 1-based number ("Jan" → 1, "feb" → 2, …)
  const MONTHS: Record<string, number> = {
    jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
    jul:7, aug:8, sep:9, oct:10, nov:11, dec:12
  };
  const monthNum = (s: string): number => {
    const k = s.trim().toLowerCase().slice(0, 3);
    return (k in MONTHS) ? MONTHS[k] : parseInt(s);
  };

  // Build a validated "YYYY-MM-DD" string, or "" if any component is out of range
  const makeDate = (y: number, m: number, d: number): string => {
    if (!isNaN(y) && !isNaN(m) && !isNaN(d) &&
        y >= 2000 && y <= 2035 && m >= 1 && m <= 12 && d >= 1 && d <= 31)
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return "";
  };

  // --- Structured / numeric inputs ---

  // GViz "Date(y,m,d)" string (month is 0-based from GViz)
  if (typeof val === "string" && val.startsWith("Date(")) {
    const parts = val.replace("Date(", "").replace(")", "").split(",").map(n => parseInt(n.trim()));
    if (parts.length >= 3) {
      const r = makeDate(parts[0], parts[1] + 1, parts[2]);
      if (r) return r;
    }
  }
  // JavaScript ms epoch (large number > 1e12)
  // Interpret in Manila timezone (UTC+8, no DST) so late-night events land on the correct date.
  if (typeof val === "number" && val > 1e12) {
    const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
    const d = new Date(val + MANILA_OFFSET_MS);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      if (y >= 2000 && y <= 2035) {
        const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
        const da = String(d.getUTCDate()).padStart(2, "0");
        return `${y}-${mo}-${da}`;
      }
    }
  }
  // Excel / Google Sheets date serial (30 000 – 80 000 covers ~1982–2119)
  if (typeof val === "number" || (!isNaN(Number(val)) && Number(val) > 30000 && Number(val) < 80000)) {
    const num = Number(val);
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      if (y >= 2000 && y <= 2030) return d.toISOString().split("T")[0];
    }
  }

  // --- String inputs ---
  if (val && typeof val === "string") {
    const str = val.trim();

    // Fast path: already a clean YYYY-MM-DD or YYYY.MM.DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(str)) return str.replace(/\./g, "-");

    // ---------------------------------------------------------------
    // Smart extraction — scan the whole string for every recognisable
    // date pattern, then return the chronologically LATEST one.
    //
    // Covers:
    //   • Free-form text:  "WellsFargo 2026.03.31"
    //   • Batch entries:   "2026.05.19 $9000\n2026.05.22 $7000\n2026.05.26 $9,637.71"
    //                      → returns 2026-05-26 (completion date)
    //   • Short MM/DD:     "06/23" → 2026-06-23 (current year assumed)
    //   • Mixed formats:   "paid Jan/20/2026" or "YYYY/MM/DD"
    // ---------------------------------------------------------------
    const extractAllDates = (text: string): string[] => {
      type Hit = { start: number; end: number; date: string };
      const hits: Hit[] = [];

      const addHit = (start: number, end: number, date: string) => {
        if (date) hits.push({ start, end, date });
      };

      let m: RegExpExecArray | null;

      // Priority 1 — YYYY[-./]MM[-./]DD  (year-first, any separator)
      // e.g. 2026-03-31, 2026.03.31, 2026/04/20
      const re1 = /(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/g;
      while ((m = re1.exec(text)) !== null)
        addHit(m.index, m.index + m[0].length,
          makeDate(parseInt(m[1]), parseInt(m[2]), parseInt(m[3])));

      // Priority 2 — MM/DD/YYYY or MM/DD/YY (month-first with full year)
      // Also handles "Jan/20/2026" via monthNum()
      const re2 = /(\w{1,3})\/(\d{1,2})\/(20\d{2}|\d{2})\b/g;
      while ((m = re2.exec(text)) !== null) {
        let y = parseInt(m[3]);
        if (y < 100) y += 2000;
        addHit(m.index, m.index + m[0].length,
          makeDate(y, monthNum(m[1]), parseInt(m[2])));
      }

      // Priority 3 — MM/DD (no year) — only when not already covered by a longer hit.
      // Uses current year (CY) as the inferred year.
      // e.g. "06/23" → 2026-06-23
      const re3 = /\b(\d{1,2})\/(\d{1,2})\b/g;
      while ((m = re3.exec(text)) !== null) {
        const start = m.index, end = m.index + m[0].length;
        if (!hits.some(h => h.start <= start && h.end >= end))
          addHit(start, end, makeDate(CY, parseInt(m[1]), parseInt(m[2])));
      }

      // Deduplicate (multiple patterns may find the same date)
      return [...new Set(hits.map(h => h.date).filter(Boolean))];
    };

    const allDates = extractAllDates(str);
    if (allDates.length > 0) {
      // Sort ascending (YYYY-MM-DD is lexicographically = chronologically sortable)
      // Return the LAST entry = most recent = payment completion date for batch strings
      allDates.sort();
      return allDates[allDates.length - 1];
    }

    // Final string fallback: native Date() handles "January 20, 2026", etc.
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      if (y >= 2000 && y <= 2030) return d.toISOString().split("T")[0];
    }
  }

  // Context fallback: caller passes year/month/day columns for approximate dating
  if (year && month) {
    const y = parseInt(year);
    const m = String(parseInt(month)).padStart(2, "0");
    let day = "15";
    if (dayStr) {
      const match = String(dayStr).match(/\d+/);
      if (match) day = String(match[0]).padStart(2, "0");
    }
    if (!isNaN(y) && y >= 2000 && y <= 2030 && !isNaN(parseInt(m)) && parseInt(m) >= 1 && parseInt(m) <= 12) {
      return `${y}-${m}-${day}`;
    }
  }

  return "";
}

export function extractInvoiceNumber(val: any, remarksUrl?: string): string {
  if (val === null || val === undefined || val === "") {
    if (!remarksUrl) return "";
  }

  // If val is a plain number, treat it as the invoice number directly
  if (typeof val === "number" && isFinite(val) && val > 0) {
    return String(Math.round(val));
  }

  let str = String(val || "").trim();

  // If cell value is a HYPERLINK formula string (e.g. '=HYPERLINK("http...", "INV-12345")' or '=HYPERLINK("http...")')
  if (/^=HYPERLINK/i.test(str)) {
    const labelMatch = str.match(/,\s*"([^"]+)"\s*\)$/i) || str.match(/,\s*'([^']+)'\s*\)$/i);
    if (labelMatch && labelMatch[1] && !labelMatch[1].startsWith("http")) {
      return labelMatch[1].trim();
    }
    const urlMatch = str.match(/HYPERLINK\s*\(\s*"([^"]+)"/i) || str.match(/HYPERLINK\s*\(\s*'([^']+)'/i);
    if (urlMatch && urlMatch[1]) {
      remarksUrl = urlMatch[1];
      str = "";
    }
  }

  // URL parsing — extract invoice ID from URL parameters or path segments
  const urlToParse = (str.startsWith("http") ? str : "") || remarksUrl || "";
  if (!str || str.startsWith("=") || str.startsWith("http")) {
    if (urlToParse) {
      // Named query params: invoice=, inv=, billNo=, etc.
      const paramMatch = urlToParse.match(/(?:invoiceNumber|invoice_?no|invoice|inv|billNo|bill)[=_]([A-Z0-9_-]+)/i);
      if (paramMatch?.[1]) return paramMatch[1].toUpperCase();
      // Alphanumeric invoice codes in path/URL: e.g. /INV-12345, ALSCO-789, etc.
      const codeMatch = urlToParse.match(/\b([A-Z]{2,}[-]?\d{3,})\b/i);
      if (codeMatch?.[1]) return codeMatch[1].toUpperCase();
      // Pure numeric invoice IDs in URL path segments (4+ digits)
      const numMatch = urlToParse.match(/[\/=](\d{4,})(?:[^0-9]|$)/);
      if (numMatch?.[1]) return numMatch[1];
    }
    if (str.startsWith("=")) return "";
  }

  // str is plain text — return as-is if it looks like an invoice ID
  if (str && !str.startsWith("=") && !str.startsWith("http")) {
    return str;
  }

  return "";
}

export function detectStatus(
  statusVal: string,
  extraStr1: string = "",
  extraStr2: string = "",
  isOnHold: boolean = false
): "unpaid" | "paid" | "hold" {
  if (isOnHold) return "hold";
  const combined = `${statusVal} ${extraStr1} ${extraStr2}`.toLowerCase().trim();
  if (/\b(on hold|hold|on-hold)\b/i.test(combined)) return "hold";
  // Primary status column wins: if explicitly "paid"/"true", don't let extra cols override it
  const primaryStatus = statusVal.toLowerCase().trim();
  if (primaryStatus === "paid" || primaryStatus === "true") return "paid";
  if (combined.includes("unpaid") || combined.includes("pending") || combined.includes("open") || combined.includes("partial") || combined === "false") {
    return "unpaid";
  }
  if (
    /\bpaid\b/i.test(combined) ||
    /\bcleared\b/i.test(combined) ||
    combined.includes("paid via") ||
    combined.includes("paid using") ||
    statusVal.toLowerCase() === "true"
  ) {
    return "paid";
  }
  return "unpaid";
}

function computeBucket(dueDate: string, status: string): string {
  if (status === "paid") return "paid";
  if (status === "hold") return "on-hold";
  if (!dueDate) return "rest-of-year";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate + "T00:00:00");
  if (isNaN(due.getTime())) return "rest-of-year";

  const dow = today.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  // Monday-based week (mirrors GAS: if Sunday go back 6, else go back dow-1)
  const thisWeekMon = new Date(today);
  thisWeekMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  thisWeekMon.setHours(0, 0, 0, 0);

  const thisWeekSun = new Date(thisWeekMon);
  thisWeekSun.setDate(thisWeekMon.getDate() + 6);
  thisWeekSun.setHours(23, 59, 59, 999);

  const nextWeekMon = new Date(thisWeekMon);
  nextWeekMon.setDate(thisWeekMon.getDate() + 7);
  nextWeekMon.setHours(0, 0, 0, 0);

  const nextWeekSun = new Date(thisWeekSun);
  nextWeekSun.setDate(thisWeekSun.getDate() + 7);
  nextWeekSun.setHours(23, 59, 59, 999);

  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  if (due < thisWeekMon) return "past-due";
  if (due >= thisWeekMon && due <= thisWeekSun) return "this-week";
  if (due >= nextWeekMon && due <= nextWeekSun) return "next-week";
  if (due > nextWeekSun && due <= endOfMonth) return "rest-of-month";
  return "rest-of-year";
}

function fetchPublicTab(sheetName: string, spreadsheetId?: string): Promise<any[][]> {
  return new Promise((resolve) => {
    const id = spreadsheetId || SPREADSPREAD_ID_REPLACE;
    const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&tq=select+*&headers=0`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const jsonStr = data.substring(data.indexOf("{"), data.lastIndexOf("}") + 1);
          const parsed = JSON.parse(jsonStr);
          const rows = parsed.table ? parsed.table.rows : [];
          const cleanRows = rows.map((r: any) => (r.c || []).map((cell: any) => {
            if (!cell) return "";
            const v = cell.v;
            if (v !== null && v !== undefined) {
              // Convert GViz date strings "Date(year,month,day)" to ISO "YYYY-MM-DD"
              if (typeof v === "string" && /^Date\(\d+,\d+,\d+\)$/.test(v)) {
                const p = v.replace("Date(", "").replace(")", "").split(",").map(Number);
                return `${p[0]}-${String(p[1] + 1).padStart(2, "0")}-${String(p[2]).padStart(2, "0")}`;
              }
              // For hyperlink cells, GViz puts the URL in v and the display label in f
              if (typeof v === "string" && v.startsWith("http") && cell.f) {
                return cell.f;
              }
              return v;
            }
            if (cell.f) return cell.f;
            return "";
          }));
          resolve(cleanRows);
        } catch {
          resolve([]);
        }
      });
    }).on("error", () => resolve([]));
  });
}

const SPREADSPREAD_ID_REPLACE = SPREADSHEET_ID;

// Fetch a sheet tab via Sheets API v4 — bypasses active sheet filters (GViz respects them).
// Supports two auth modes:
//   1. Bearer token  — pass accessToken (user OAuth token)
//   2. API key       — pass apiKey (server env var GOOGLE_SHEETS_API_KEY); no OAuth needed
//      The sheet must be shared publicly (view access) for the API key mode to work.
function fetchSheetsV4Tab(
  sheetName: string,
  auth: { bearerToken: string } | { apiKey: string },
  spreadsheetId: string
): Promise<any[][]> {
  return new Promise((resolve) => {
    const a1Name = "'" + sheetName.replace(/'/g, "''") + "'";
    const isBearerAuth = "bearerToken" in auth;
    const keyParam = isBearerAuth ? "" : `&key=${encodeURIComponent((auth as any).apiKey)}`;
    const reqPath = `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(a1Name)}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS${keyParam}`;
    const headers: Record<string, string> = {};
    if (isBearerAuth) headers["Authorization"] = `Bearer ${(auth as any).bearerToken}`;
    const req = https.request({
      hostname: "sheets.googleapis.com",
      path: reqPath,
      method: "GET",
      headers
    }, (res) => {
      let data = "";
      res.on("data", (chunk: any) => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            const code = parsed.error.code || "";
            if (code === 401 || code === 403) console.warn(`[SheetsV4] Auth error (${code}) — token may be expired`);
            else console.warn(`[SheetsV4] ${sheetName}: ${parsed.error.message}`);
            resolve([]); return;
          }
          resolve(parsed.values || []);
        } catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.end();
  });
}

export async function fetchFullLiveDataset(accessToken?: string) {
  const tabs = [
    "Calendar Dashboard",
    "Calendar Dashboard - Local Events",
    "Local Events",
    "Ruby's Bills",
    "TI Bills",
    "MSDx Bills",
    "Bank Balances",
    "Loans",
    "Credit Cards",
    "AR Dashboard Data",
    "Bank Statements Data",
    "4YR Payroll",
    "Meeting Notes",
    "Quick Notes",
    "Notes",
    "Action Logs",
    "Headley's",
    "Metadata"
  ];

  // Fetch from both main spreadsheet tabs AND the dedicated calendar spreadsheet in parallel.
  // Try multiple tab name candidates for the calendar sheet (Events, Sheet1, Calendar, Tasks).
  const CAL_TAB_CANDIDATES = ["Events", "Sheet1", "Calendar", "Tasks", "Schedule"];

  // Auth priority for the main spreadsheet:
  //   1. Bearer token (user OAuth — most permissive, includes private sheets)
  //   2. GOOGLE_SHEETS_API_KEY env var (server-side API key — works on public sheets, BYPASSES
  //      active sheet filters that GViz would respect)
  //   3. GViz public API fallback (no key — respects filters, returns only visible rows)
  const serverApiKey = process.env.GOOGLE_SHEETS_API_KEY || process.env.GOOGLE_API_KEY || "";
  const fetchTab = accessToken
    ? (t: string) => fetchSheetsV4Tab(t, { bearerToken: accessToken }, SPREADSHEET_ID)
    : serverApiKey
      ? (t: string) => fetchSheetsV4Tab(t, { apiKey: serverApiKey }, SPREADSHEET_ID)
      : (t: string) => fetchPublicTab(t);
  const [results, calSheetRowsArr] = await Promise.all([
    Promise.all(tabs.map(async (t) => ({ sheetName: t, rows: await fetchTab(t) }))),
    Promise.all(CAL_TAB_CANDIDATES.map(t => fetchPublicTab(t, CALENDAR_SPREADSHEET_ID)))
  ]);
  // Use the first tab that returned data
  const calSheetRows = calSheetRowsArr.find(r => r && r.length > 1) || [];
  const dataByTab: Record<string, any[][]> = {};
  results.forEach(r => dataByTab[r.sheetName] = r.rows);

  // Calendar events from the dedicated calendar spreadsheet
  // Column layout: A(0)=id, C(2)=title, D(3)=description, E(4)=start_ms, F(5)=end_ms,
  //                G(6)=allDay, H(7)=calName, I(8)=urgency, J(9)=category,
  //                L(11)=assigneeName, P(15)=done
  const calendarLocalEvents: any[] = [];

  (calSheetRows || []).forEach((row, i) => {
    if (i < 1) return; // skip header row

    const id = String(row[0] || `cal-${i + 1}`).trim();
    if (!id || id.toLowerCase() === "id") return; // skip header if repeated

    const title = String(row[2] || "").trim();
    if (!title) return;
    // Skip entries with purely numeric titles (e.g. stray amount values in the sheet)
    if (/^\d+\.?\d*$/.test(title)) return;
    // Skip bank-calendar entries (e.g. "Cal: Ruby's - Zions") — not meaningful in portal
    if (/^cal\s*:/i.test(title)) return;

    // Date and time: prefer start_ms (E/col4); fall back to end_ms (F/col5)
    const ms4 = typeof row[4] === "number" ? row[4] : parseFloat(String(row[4] || "0"));
    const ms5 = typeof row[5] === "number" ? row[5] : parseFloat(String(row[5] || "0"));
    const dateMs = ms4 || ms5;
    const date = parseDateVal(dateMs) || parseDateVal(row[4]) || parseDateVal(row[5]) || "";
    if (!date) return; // skip rows without a valid date

    // Extract time from start_ms; if midnight try end_ms.
    // Manila is UTC+8, no DST — shift by +8h and read UTC components.
    const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
    let timeStr: string | undefined;
    for (const ms of [ms4, ms5]) {
      if (ms && !isNaN(ms) && ms > 0) {
        const d = new Date(ms + MANILA_OFFSET_MS);
        const h = d.getUTCHours();
        const m = d.getUTCMinutes();
        if (h !== 0 || m !== 0) { timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; break; }
      }
    }

    const description = String(row[3] || "").trim();
    const isDone = row[15] === true || String(row[15] || "").toLowerCase() === "true";
    const calName = String(row[7] || "").trim();
    const urgency = String(row[8] || "normal").trim();
    const category = String(row[9] || "task").trim();
    const assigneeName = String(row[11] || "").trim();
    const assigneeColor = String(row[12] || "").trim();
    const assigneeIdsRaw = String(row[13] || "").trim();
    let assigneeIds: string[] = [];
    try { if (assigneeIdsRaw) assigneeIds = JSON.parse(assigneeIdsRaw); } catch {}
    const assigneeId = String(row[10] || "").trim();

    // Compute endTime from ms5 (always include even if midnight)
    let endTimeStr: string | undefined;
    if (ms5 && !isNaN(ms5) && ms5 > 0) {
      const ed = new Date(ms5 + MANILA_OFFSET_MS);
      endTimeStr = `${String(ed.getUTCHours()).padStart(2, "0")}:${String(ed.getUTCMinutes()).padStart(2, "0")}`;
    }

    calendarLocalEvents.push({
      id,
      date,
      time: timeStr,
      endTime: endTimeStr,
      title,
      notes: description,
      entity: calName || "Ruby's",
      type: category,
      assignee: assigneeName,
      assigneeId,
      assigneeColor,
      assigneeIds,
      urgency,
      done: isDone,
      vendor: title,
      description: title,
      row: i + 1
    });
  });

  // Also include any rows from main-spreadsheet local event tabs (fallback)
  const rawCalRows = [
    ...(dataByTab["Calendar Dashboard"] || []),
    ...(dataByTab["Calendar Dashboard - Local Events"] || []),
    ...(dataByTab["Local Events"] || [])
  ];
  rawCalRows.forEach((row, i) => {
    if (i < 1) return;
    const id = String(row[0] || `cal-main-${i + 1}`).trim();
    if (!id || id.toLowerCase() === "id" || id.toLowerCase().includes("created")) return;
    const date = parseDateVal(row[3]) || parseDateVal(row[5]) || parseDateVal(row[1]) || "";
    const title = String(row[5] || row[6] || row[2] || "").trim();
    if (!date || !title) return;
    const isDone = row[7] === true || String(row[7]).toLowerCase() === "true";
    calendarLocalEvents.push({
      id: `main-${id}`,
      date,
      title,
      notes: String(row[6] || "").trim(),
      entity: String(row[4] || "Ruby's").trim(),
      type: "task",
      assignee: "",
      urgency: "normal",
      done: isDone,
      vendor: title,
      description: title,
      row: i + 1
    });
  });

  // AP Bills
  const ap: any[] = [];
  
  const CURRENT_YEAR = new Date().getFullYear();

  // 1. Ruby's Bills
  const rubyRows = dataByTab["Ruby's Bills"] || dataByTab["Ruby's"] || Object.entries(dataByTab).find(([k]) => /ruby.*bills/i.test(k))?.[1] || [];
  rubyRows.forEach((row, i) => {
    if (i < 2) return; // row 0 = summary totals, row 1 = column headers
    const rowYear = typeof row[0] === "number" ? row[0] : parseInt(String(row[0] || "0"));
    // Check on-hold early for year-filter decision
    const isOnHold = row[18] === true || String(row[18]).toLowerCase() === "true" || String(row[18]).toLowerCase().includes("hold") || String(row[12]).toLowerCase().includes("hold") || String(row[10]).toLowerCase().includes("hold");
    // Skip historical rows only if they are paid — keep unpaid and on-hold from all years
    const col12Quick = String(row[12] || "").trim().toLowerCase();
    const isHistoricalPaid = col12Quick === "paid" || (row[13] === true && col12Quick !== "");
    if (rowYear !== CURRENT_YEAR && isHistoricalPaid && !isOnHold) return;
    // GAS Layout A: vendor is col D (index 3) only — never fall back to col C (Wk#)
    const rawVendor = String(row[3] || "").trim();
    // Amount is always col J (index 9). Never fall back to col I (index 8) which is the Due Date —
    // a date string like "1/9/2026" would strip to "192026" and become a fake $192,026 amount.
    const amountRaw = row[9];
    let amount = typeof amountRaw === "number" ? amountRaw : parseFloat(String(amountRaw || "0").replace(/[^0-9.-]+/g, "")) || 0;
    if (amount >= 10000000) amount = 0;
    const dueDate = parseDateVal(row[8]) || parseDateVal(row[7]);

    // Skip rows without a vendor name (subtotals, blank rows, week-number rows)
    if (!rawVendor) return;

    const vendor = rawVendor;
    if (/^(vendor|payee|company|total|summary|due date|invoice|\d+)$/i.test(vendor) || vendor.length > 90) return;

    if (amount === 0 && vendor.toLowerCase().includes("payroll")) {
      amount = 35000; // Default $35k payroll auto debit if amount unlisted
    }

    const invoiceNo = String(row[6] || "").trim();
    const col11Raw = String(row[11] || "").trim();
    // Normalise display method to Autodebit/Manual; keep raw col11 for status detection (unchanged behaviour).
    const KNOWN_METHOD_RE = /^(autodebit|auto.?debit|auto.?pay|autopay|manual|check|wire|ach|online|credit.?card|cash)$/i;
    const isKnownMethod = KNOWN_METHOD_RE.test(col11Raw);
    const method = isKnownMethod && /auto/i.test(col11Raw) ? "Autodebit" : "Manual";
    const status = detectStatus(String(row[12] || ""), String(row[11] || ""), String(row[10] || ""), isOnHold);

    const inQBO = row[13] === true || String(row[13]).toLowerCase() === "true" || String(row[13]).toLowerCase() === "qbo";

    // col K (index 10) = Payment Instructions; col L (index 11) = Status 1 (or paid date when paid)
    const paymentInstructions = String(row[10] || "").trim() || undefined;
    const col11Str = String(row[11] || "").trim();
    // Only treat col11 as a date when the raw cell value is unambiguously a date (serial number,
    // clean YYYY-MM-DD / MM/DD/YYYY string, or GViz Date() — NOT via the greedy extractAllDates path).
    const col11IsDate =
      (typeof row[11] === "number" && row[11] > 30000 && row[11] < 80000) ||
      /^\d{4}[-./]\d{2}[-./]\d{2}$/.test(col11Str) ||
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(col11Str) ||
      col11Str.startsWith("Date(");
    const status1 = col11Str && !col11IsDate ? col11Str : undefined;

    const finalDueDate = dueDate || new Date().toISOString().split("T")[0];

    const driveUrlRuby = String(row[38] || "").trim();
    ap.push({
      id: `ap-ruby-${i + 1}`,
      vendor,
      entity: "Ruby's",
      company: "Ruby's",
      amount,
      dueDate: finalDueDate,
      invoiceDate: parseDateVal(row[7]) || undefined,
      paidDate: status === "paid" ? parseDateVal(row[11]) || undefined : undefined, // col L = paid date when paid
      method,
      status,
      inQBO,
      bucket: computeBucket(finalDueDate, status),
      sheet: "Ruby's Bills",
      invoiceNo,
      paymentInstructions,
      status1,
      description: String(row[4] || "").trim() || undefined, // col E
      category:    String(row[5] || "").trim() || undefined, // col F
      driveViewUrl: sanitizeDriveUrl(driveUrlRuby), // col AM (index 38) — strips KNOWN_BAD_DRIVE_URLS
      row: i - 3 // dataStart=5: row 1 = sheet row 5, so bill.row = i+1-(dataStart-1) = i-3
    });
  });

  // 2. TI Bills
  // Known TI sub-entity company names to detect the company column dynamically
  const KNOWN_TI_COMPANIES = /^(4G|4YR|4 ?YR|E1|E-1|Corner|Corner Property|Corner Property Group|TI|TI Bills|Timm|Timm Investments)$/i;
  const HEADER_WORDS = /^(company|vendor|payee|due date|due|amount|invoice|status|method|subentity|bills|total|summary|id|#|week|date|qbo|notes|remarks)$/i;

  const tiTabEntries = Object.entries(dataByTab).filter(([k]) =>
    /ti\s*bills|ti\b|4g|e1|corner/i.test(k) && !/bank|loan|statement|note|calendar|payroll/i.test(k)
  );

  tiTabEntries.forEach(([tabName, rows]) => {
    let currentCompany = "TI"; // track company from group-header rows

    (rows || []).forEach((row, i) => {
      if (i < 1) return; // skip first header row only

      // Detect company header rows: col E (index 4) has text, col F (index 5) is empty, no amount
      // This catches ANY new sub-company, not just the known ones
      const colEVal = String(row[4] || "").trim();
      const colFVal = String(row[5] || "").trim();
      const rawAmt = typeof row[9] === "number" ? row[9] : parseFloat(String(row[9] || "0").replace(/[^0-9.-]+/g, "")) || 0;
      if (colEVal && !colFVal && !rawAmt && !HEADER_WORDS.test(colEVal) && isNaN(Number(colEVal))) {
        currentCompany = colEVal;
        return; // header row — not a bill
      }

      const rowYear = typeof row[0] === "number" ? row[0] : parseInt(String(row[0] || "0"));
      // Skip rows with no valid year — these are description/legend rows, not actual bills
      if (!rowYear || rowYear < 2020) return;
      // Keep historical unpaid/on-hold from all years; only skip confirmed paid historical rows
      const statusRaw13 = String(row[13] || "").trim().toLowerCase();
      const isOnHoldEarlyTI = statusRaw13.includes("hold") ||
        [10, 11, 12, 13, 22].some(c => String(row[c] || "").toLowerCase().includes("hold")) ||
        row[22] === true || String(row[22] || "").toLowerCase() === "true";
      const isHistoricalPaidTI = ["paid", "yes", "y", "true"].includes(statusRaw13);
      if (rowYear !== CURRENT_YEAR && isHistoricalPaidTI && !isOnHoldEarlyTI) return;

      // Detect which column holds company and vendor by scanning candidates
      // Company names are known short strings; vendors are arbitrary text
      let company = "";
      let vendor = "";

      // Check known TI company name positions: try [3], [4], [1] in order
      for (const colIdx of [3, 4, 1, 2]) {
        const v = String(row[colIdx] || "").trim();
        if (v && KNOWN_TI_COMPANIES.test(v)) {
          company = v;
          // Vendor is likely the next column
          for (const vIdx of [colIdx + 1, colIdx + 2]) {
            const vv = String(row[vIdx] || "").trim();
            if (vv && !HEADER_WORDS.test(vv) && !KNOWN_TI_COMPANIES.test(vv) && vv.length <= 90 && isNaN(Number(vv))) {
              vendor = vv;
              break;
            }
          }
          break;
        }
      }

      // If no known company found, check if this is a group-header row (only company populated, no amount)
      if (!company) {
        // TI layout: col E (index 4) = company, col F (index 5) = vendor
        // If both are populated, read them directly (handles any new sub-company like "Co-Alliance")
        const colEText = String(row[4] || "").trim();
        const colFText = String(row[5] || "").trim();
        if (
          colEText && colFText &&
          !HEADER_WORDS.test(colEText) && !HEADER_WORDS.test(colFText) &&
          isNaN(Number(colEText)) && !parseDateVal(colEText) &&
          isNaN(Number(colFText)) && !parseDateVal(colFText)
        ) {
          company = colEText;
          vendor = colFText;
          currentCompany = company; // update for subsequent rows
        } else {
          // Fallback: scan common positions for vendor
          for (const colIdx of [3, 4, 5]) {
            const v = String(row[colIdx] || "").trim();
            if (v && !HEADER_WORDS.test(v) && v.length >= 2 && v.length <= 90 && isNaN(Number(v)) && !parseDateVal(v)) {
              vendor = v;
              company = currentCompany;
              break;
            }
          }
        }
      } else {
        currentCompany = company; // update tracked company
      }

      // Skip header rows, empty rows, or rows where vendor looks like a header
      if (!vendor) return;
      if (HEADER_WORDS.test(vendor)) return;

      // Amount: try col J (9) first, then cols K/L (10, 11) as layout fallbacks.
      // Col I (8) is the Due Date — never use it for amount (date strings like "1/9/2026"
      // strip to "192026" and produce a fake $192,026 amount when the amount cell is blank).
      let amount = 0;
      for (const col of [9, 10, 11]) {
        const v = row[col];
        if (typeof v === "number" && Math.abs(v) < 10000000) { amount = v; break; }
        const parsed = parseFloat(String(v || "").replace(/[^0-9.-]+/g, ""));
        if (!isNaN(parsed) && Math.abs(parsed) > 0 && Math.abs(parsed) < 10000000) { amount = parsed; break; }
      }

      // Due date: try multiple positions
      const dueDate = parseDateVal(row[8]) || parseDateVal(row[7]) || parseDateVal(row[9]) || new Date().toISOString().split("T")[0];

      const invoiceNo = String(row[6] || "").trim();
      const rawMethodTI = String(row[11] || row[10] || row[12] || "Online").trim(); // unchanged for status detection
      const KNOWN_METHOD_RE_TI = /^(autodebit|auto.?debit|auto.?pay|autopay|manual|check|wire|ach|online|credit.?card|cash)$/i;
      const method = /auto/i.test(rawMethodTI) && KNOWN_METHOD_RE_TI.test(rawMethodTI) ? "Autodebit" : "Manual";

      // col 13 = status text ("paid" or empty). col 14 = Gmail reference URL (NOT payment confirmation — do not use for paid detection)
      const statusRaw = String(row[13] || "").trim();
      const isOnHold = statusRaw.toLowerCase().includes("hold") ||
                       [10, 11, 12, 13, 22].some(c => String(row[c] || "").toLowerCase().includes("hold")) ||
                       row[22] === true || String(row[22] || "").toLowerCase() === "true";
      const status = detectStatus(statusRaw, rawMethodTI, "", isOnHold);

      const inQBO = [14, 15, 13].some(c => row[c] === true || String(row[c] || "").toLowerCase() === "true" || String(row[c] || "").toLowerCase() === "qbo");

      let entity: "Ruby's" | "TI" | "MSDx" = "TI";
      if (company.toLowerCase().includes("ruby")) entity = "Ruby's";
      else if (company.toLowerCase().includes("msdx")) entity = "MSDx";

      // col M (index 12) = Payment Via; col O (index 14) = Remarks
      const paidViaTI = String(row[12] || "").trim() || undefined;
      const remarksTI = String(row[14] || "").trim() || undefined;

      const driveUrlTI = String(row[26] || "").trim();
      ap.push({
        id: `ap-ti-${tabName.replace(/\s+/g, "")}-${i + 1}`,
        vendor,
        entity,
        company: company || currentCompany,
        amount,
        dueDate,
        invoiceDate: parseDateVal(row[7]) || undefined,
        paidDate: status === "paid" ? parseDateVal(row[10]) || undefined : undefined, // col K = paid date
        method,
        status,
        inQBO,
        bucket: computeBucket(dueDate, status),
        sheet: tabName,
        invoiceNo,
        paidVia: paidViaTI,
        remarks: remarksTI,
        driveViewUrl: sanitizeDriveUrl(driveUrlTI), // col AA (index 26) — strips KNOWN_BAD_DRIVE_URLS
        row: i - 5 // dataStart=7: row 1 = sheet row 7, so bill.row = i+1-(dataStart-1) = i-5
      });
    });
  });

  // 3. MSDx Bills
  const msdxRows = dataByTab["MSDx Bills"] || dataByTab["MSDx"] || Object.entries(dataByTab).find(([k]) => /msdx.*bills|msdx/i.test(k))?.[1] || [];
  msdxRows.forEach((row, i) => {
    if (i < 2) return; // row 0 = summary totals, row 1 = column headers
    const rowYear = typeof row[0] === "number" ? row[0] : parseInt(String(row[0] || "0"));
    // Keep historical unpaid/on-hold from all years; only skip confirmed paid historical rows
    const isOnHoldEarlyMSDx = row[18] === true || String(row[18] || "").toLowerCase() === "true" || String(row[18] || "").toLowerCase().includes("hold") || String(row[12] || "").toLowerCase().includes("hold") || String(row[10] || "").toLowerCase().includes("hold");
    const col12EarlyQ = String(row[12] || "").trim().toLowerCase();
    const isHistoricalPaidMSDx = ["paid", "yes", "y", "true"].includes(col12EarlyQ);
    if (rowYear !== CURRENT_YEAR && isHistoricalPaidMSDx && !isOnHoldEarlyMSDx) return;
    const vendor = String(row[3] || row[2] || row[4] || "").trim();
    if (!vendor || !isNaN(Number(vendor)) || /^(vendor|payee|company|total|summary|due date|invoice)$/i.test(vendor) || vendor.length > 90) return;
    // Amount is always col J (index 9). Never fall back to col I (index 8) which is the Due Date.
    const amountRawMSDx = row[9];
    let amount = typeof amountRawMSDx === "number" ? amountRawMSDx : parseFloat(String(amountRawMSDx || "0").replace(/[^0-9.-]+/g, "")) || 0;
    if (amount >= 10000000) amount = 0;
    const dueDate = parseDateVal(row[8]) || parseDateVal(row[7]) || parseDateVal("", row[0], row[1], row[19]) || new Date().toISOString().split("T")[0];
    const invoiceNo = String(row[6] || "").trim();

    const col11MSDx = String(row[11] || "").trim();
    const KNOWN_METHOD_RE_MSDX = /^(autodebit|auto.?debit|auto.?pay|autopay|manual|check|wire|ach|online|credit.?card|cash)$/i;
    const isKnownMethodMSDx = KNOWN_METHOD_RE_MSDX.test(col11MSDx);
    const method = isKnownMethodMSDx && /auto/i.test(col11MSDx) ? "Autodebit" : "Manual";

    const isOnHold = row[18] === true || String(row[18]).toLowerCase() === "true" || String(row[18]).toLowerCase().includes("hold") || String(row[12]).toLowerCase().includes("hold") || String(row[10]).toLowerCase().includes("hold");
    const status = detectStatus(String(row[12] || ""), String(row[10] || ""), String(row[11] || ""), isOnHold);

    const inQBO = row[13] === true || String(row[13]).toLowerCase() === "true" || String(row[13]).toLowerCase() === "qbo";

    // col K (index 10) = Payment Instructions; col L (index 11) = Status 1 (or paid date when paid)
    const paymentInstructionsMSDx = String(row[10] || "").trim() || undefined;
    const col11MSDxStr = String(row[11] || "").trim();
    const col11MSDxIsDate =
      (typeof row[11] === "number" && row[11] > 30000 && row[11] < 80000) ||
      /^\d{4}[-./]\d{2}[-./]\d{2}$/.test(col11MSDxStr) ||
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(col11MSDxStr) ||
      col11MSDxStr.startsWith("Date(");
    const status1MSDx = col11MSDxStr && !col11MSDxIsDate ? col11MSDxStr : undefined;

    const driveUrlMSDx = String(row[26] || "").trim();
    ap.push({
      id: `ap-msdx-${i + 1}`,
      vendor,
      entity: "MSDx",
      amount,
      dueDate,
      invoiceDate: parseDateVal(row[7]) || undefined,
      paidDate: status === "paid" ? parseDateVal(row[11]) || undefined : undefined, // col L = paid date when paid
      method,
      status,
      inQBO,
      bucket: computeBucket(dueDate, status),
      sheet: "MSDx Bills",
      invoiceNo,
      paymentInstructions: paymentInstructionsMSDx,
      status1: status1MSDx,
      description: String(row[4] || "").trim() || undefined, // col E
      category:    String(row[5] || "").trim() || undefined, // col F
      driveViewUrl: sanitizeDriveUrl(driveUrlMSDx), // col AA (index 26) — strips KNOWN_BAD_DRIVE_URLS
      row: i - 4 // dataStart=6: row 1 = sheet row 6, so bill.row = i+1-(dataStart-1) = i-4
    });
  });

  // Banks — new sheet layout: Entity(A), Account(B), Balance(C), Yesterday(D), Last Updated(E)
  // Scan up to 10 rows to find the actual header row (handles blank rows 1-3 before header at row 4)
  const banks: any[] = [];
  const bankRows = dataByTab["Bank Balances"] || [];
  // Require both an entity-like AND balance-like header in the same row to avoid
  // matching a title row like "Bank Balances" which only contains one keyword.
  let bankHeaderIdx = 0;
  for (let h = 0; h < Math.min(bankRows.length, 10); h++) {
    const rowStr = (bankRows[h] || []).map((c: any) => String(c || "")).join("|");
    const hasEntity  = /entity|company/i.test(rowStr);
    const hasBal     = /bal|balance|amount/i.test(rowStr);
    const hasAccount = /account|bank|institution/i.test(rowStr);
    if ((hasEntity || hasAccount) && hasBal) { bankHeaderIdx = h; break; }
  }
  const bankHeaders = (bankRows[bankHeaderIdx] || []).map((h: any) => String(h || "").toLowerCase().trim());
  let bEntityIdx = bankHeaders.findIndex((h: string) => /^entity$/i.test(h));
  let bBankIdx   = bankHeaders.findIndex((h: string) => /account|bank|institution|name|company/i.test(h));
  let bBalIdx    = bankHeaders.findIndex((h: string) => /bal|balance|amount|\$/i.test(h));
  let bYestIdx   = bankHeaders.findIndex((h: string) => /yesterday|prev|previous/i.test(h));
  let bAsOfIdx   = bankHeaders.findIndex((h: string) => /updated|as_of|date/i.test(h));
  // Fallbacks for new 5-col layout: Entity(0), Account(1), Balance(2), Yesterday(3), Last Updated(4)
  if (bEntityIdx === -1) bEntityIdx = 0;
  if (bBankIdx   === -1) bBankIdx   = bEntityIdx + 1;
  if (bBalIdx    === -1) bBalIdx    = bEntityIdx + 2;
  if (bYestIdx   === -1) bYestIdx   = bEntityIdx + 3;
  if (bAsOfIdx   === -1) bAsOfIdx   = bEntityIdx + 4;
  bankRows.slice(bankHeaderIdx + 1).forEach((row: any[], i: number) => {
    if (!row || row.every((c: any) => !c || String(c).trim() === "")) return;
    const rawEntity = String(row[bEntityIdx] || "").trim();
    const name      = String(row[bBankIdx]   || "").trim();
    // Skip obvious header/label rows
    if (!rawEntity && !name) return;
    if (/^entity$|^company$|^account$|^bank$/i.test(rawEntity)) return;
    const bal     = typeof row[bBalIdx] === "number" ? row[bBalIdx] : parseFloat(String(row[bBalIdx] || "").replace(/[^0-9.-]+/g, "")) || 0;
    const yestStr = bYestIdx !== -1 ? String(row[bYestIdx] || "").replace(/[^0-9.-]+/g, "") : "";
    const yestVal = yestStr ? (parseFloat(yestStr) || 0) : Math.round(bal * 0.98);
    const asOf    = parseDateVal(row[bAsOfIdx]) || new Date().toISOString().split("T")[0];
    // Entity: use raw value from sheet verbatim; no normalisation collapse
    const entity: EntityName = (rawEntity as EntityName) || "Ruby's";

    banks.push({ id: `b-${i + 1}`, entity, bank: name || rawEntity, type: "Operating", acct: "...", balance: bal, yesterday: yestVal, asOf, status: "Active", trend: bal >= yestVal ? "up" : "down" });
  });

  // Loans & Credit Cards
  const loans: any[] = [];
  (dataByTab["Loans"] || []).forEach((row, i) => {
    const entityRaw = String(row[1] || row[0] || "").trim();
    const lender = String(row[2] || row[1] || "").trim();
    if (!lender || lender.toLowerCase().includes("bank")) return;
    const amountVal = typeof row[3] === "number" ? row[3] : parseFloat(String(row[3]).replace(/[^0-9.-]+/g, "")) || 0;
    const dueDate = String(row[4] || "1st");
    let entity: EntityName = "Ruby's";
    if (entityRaw.includes("TI") || entityRaw.includes("4G") || entityRaw.includes("E1") || entityRaw.includes("4YR")) entity = "TI";
    else if (entityRaw.includes("MSDx")) entity = "MSDx";
    else if (entityRaw.includes("Curcumin")) entity = "CurcuminPro";

    // Principal and Outstanding are not on the sheet yet - amountVal is monthly payment!
    loans.push({ id: `l-${i + 1}`, entity, lender: `${lender} (${entityRaw})`, purpose: "Commercial Loan / Facility", principal: 0, outstanding: 0, monthly: amountVal, nextPay: dueDate, maturity: "2029-12", status: "Active" });
  });

  (dataByTab["Credit Cards"] || []).forEach((row, i) => {
    const cardName = String(row[1] || row[0] || "").trim();
    if (!cardName || cardName.toLowerCase().includes("card name")) return;
    const bal = typeof row[4] === "number" ? row[4] : parseFloat(String(row[4]).replace(/[^0-9.-]+/g, "")) || 0;
    const dueDate = String(row[3] || row[2] || "");
    let entity: EntityName = "Ruby's";
    if (cardName.includes("4G") || cardName.includes("TI") || cardName.includes("E1")) entity = "TI";
    else if (cardName.includes("MSDx")) entity = "MSDx";
    else if (cardName.includes("Curcumin")) entity = "CurcuminPro";

    loans.push({ id: `cc-${i + 1}`, entity, lender: cardName, purpose: "Credit Card Facility", principal: 0, outstanding: 0, monthly: bal, nextPay: dueDate, maturity: "Revolving", status: "Active" });
  });

  // ── AR Items — horizontal month layout ─────────────────────────────────────
  // The sheet has customers as ROWS and months as COLUMN BLOCKS.
  // We scan the actual header row for ALL month names and use their real column
  // positions — no hardcoded offsets. If the sheet gains new months, we find them
  // automatically. Block layout is inferred from the gap between consecutive months:
  //   3-col gap  → simple block: [rem, due, amt]
  //  11-col gap  → full block:   [inv, _, app, _, sen, _, pay, _, rem, due, amt]
  //  other gap   → treat last col as amt, second-to-last as due, rest as prefix

  type ARMonthCfg = {
    name: string; startCol: number;
    amtCol: number; dueCol: number; remCol: number;
    invCol: number; appCol: number; senCol: number; payCol: number;
  };

  // Canonical month spellings + abbreviations we recognise in headers
  const MONTH_LOOKUP: Record<string, string> = {
    january:"January",  jan:"January",
    february:"February",feb:"February",
    march:"March",      mar:"March",
    april:"April",      apr:"April",
    may:"May",
    june:"June",        jun:"June",
    july:"July",        jul:"July",
    august:"August",    aug:"August",
    september:"September", sep:"September", sept:"September",
    october:"October",  oct:"October",
    november:"November",nov:"November",
    december:"December",dec:"December",
  };
  const MONTH_ORDER = ["January","February","March","April","May","June",
                        "July","August","September","October","November","December"];

  const ar: any[] = [];
  const arRawRows = dataByTab["AR Dashboard Data"] || [];

  if (arRawRows.length > 0) {

    // ── Step 1: find header row and collect actual month column positions ──────
    // The header row has sub-column labels like "Apr-Invoice", "Apr-Invoice-TS",
    // "Apr-Approval" … all starting with "Apr". We take only the FIRST occurrence
    // of each month prefix (which is the block's first column, the Invoice col).
    // March is special: its block is labeled "Due Date-Invoice" (no month prefix),
    // so we infer it from April's position: marchCol = aprilCol - 11.
    let arHeaderRowIdx = -1;
    let detectedMonths: { name: string; col: number }[] = [];

    for (let ri = 0; ri < Math.min(6, arRawRows.length); ri++) {
      const row = arRawRows[ri];
      // Dedup: record only the FIRST column index for each month name
      const seen = new Set<string>();
      const found: { name: string; col: number }[] = [];
      for (let ci = 0; ci < row.length; ci++) {
        const raw  = String(row[ci] || "").trim();
        // The sub-column header format is "Apr-Invoice", "Apr-Approval" etc.
        // Split on "-" to extract the month prefix before the dash.
        const prefix = raw.split("-")[0].toLowerCase();
        const full   = MONTH_LOOKUP[raw.toLowerCase()] || MONTH_LOOKUP[prefix];
        if (full && !seen.has(full)) {
          seen.add(full);
          found.push({ name: full, col: ci });
        }
      }
      if (found.length >= 2) {
        found.sort((a, b) => a.col - b.col);
        // Verify the detected months are in strict chronological order
        const ordered = found.every((f, i) =>
          i === 0 || MONTH_ORDER.indexOf(f.name) > MONTH_ORDER.indexOf(found[i - 1].name)
        );
        if (ordered) {
          // Only March is unlabeled (header says "Due Date-Invoice").
          // Prepend it using the gap between the first two labeled months.
          const blockSize = found.length >= 2 ? found[1].col - found[0].col : 11;
          if (found[0].name !== "March") {
            const marchCol = found[0].col - blockSize;
            if (marchCol >= 0) found.unshift({ name: "March", col: marchCol });
          }
          detectedMonths  = found;
          arHeaderRowIdx  = ri;
          break;
        }
      }
    }

    // ── Step 2: build ARMonthCfg[] from real column positions ─────────────────
    const monthConfigs: ARMonthCfg[] = [];

    if (detectedMonths.length >= 2) {
      for (let mi = 0; mi < detectedMonths.length; mi++) {
        const { name, col } = detectedMonths[mi];
        // Block size = distance to next month's start column
        const blockSize = mi < detectedMonths.length - 1
          ? detectedMonths[mi + 1].col - col
          : (mi > 0 ? detectedMonths[mi].col - detectedMonths[mi - 1].col : 11);

        if (blockSize <= 4) {
          // Short block (e.g. 3-col: rem/due/amt)
          monthConfigs.push({
            name, startCol: col,
            remCol: col,
            dueCol: blockSize >= 2 ? col + blockSize - 2 : col,
            amtCol: col + blockSize - 1,
            invCol: -1, appCol: -1, senCol: -1, payCol: -1,
          });
        } else {
          // Full block — last col = amt, second-to-last = due, etc.
          // Standard 11-col: inv(+0), _(+1), app(+2), _(+3), sen(+4), _(+5), pay(+6), _(+7), rem(+8), due(+9), amt(+10)
          const last = col + blockSize - 1;
          monthConfigs.push({
            name, startCol: col,
            amtCol: last,
            dueCol: last - 1,
            remCol: last - 2,
            payCol: blockSize >= 6 ? last - 4 : -1,
            senCol: blockSize >= 8 ? last - 6 : -1,
            appCol: blockSize >= 9 ? last - 8 : -1,
            invCol: blockSize >= 11 ? col       : -1,
          });
        }
      }
    } else {
      // ── Fallback: 11-col blocks starting at col E (index 4) ─────────────────
      // Confirmed layout:
      //   • Columns A–D (0–3): entity, customer, description, occurrence/other
      //   • Column E (index 4): start of March block (and every subsequent month)
      //   • Each month occupies exactly 11 columns:
      //       inv(+0), _(+1), app(+2), _(+3), sen(+4), _(+5),
      //       pay(+6), _(+7), rem(+8), due(+9), amt(+10)
      //   • August (idx=5): startCol = 4 + 5×11 = 59, amtCol = 69
      console.warn("[AR] No month header row detected — using hardcoded 11-col fallback (E-anchored).");
      const MONTHS_FB = ["March","April","May","June","July","August","September","October","November","December"];
      MONTHS_FB.forEach((n, idx) => {
        const b = 4 + idx * 11;   // col E = index 4; each block is 11 wide
        monthConfigs.push({ name:n, startCol:b, invCol:b, appCol:b+2, senCol:b+4, payCol:b+6, remCol:b+8, dueCol:b+9, amtCol:b+10 });
      });
    }

    // ── Step 3: iterate data rows ─────────────────────────────────────────────
    const dataStartIdx = arHeaderRowIdx >= 0 ? arHeaderRowIdx + 1 : 0;

    arRawRows.forEach((row, i) => {
      if (i < dataStartIdx) return;

      const entityRaw = String(row[0] || "").trim();
      const customer  = String(row[1] || "").trim();

      // Skip blank or header/legend rows
      if (!customer) return;
      if (/^(customer|entity|client|name|company|account|payee|description|total|sub.?total)$/i.test(customer)) return;

      const desc = String(row[2] || "Invoice").trim();

      let entity: "Ruby's" | "TI" | "MSDx" = "TI";
      if (/ruby/i.test(entityRaw))  entity = "Ruby's";
      else if (/msdx/i.test(entityRaw)) entity = "MSDx";

      const isTrue = (val: any) =>
        val === true || String(val).toLowerCase() === "true" || val === 1;

      monthConfigs.forEach((mCfg) => {
        // Safely read value; treat out-of-bounds as empty
        const safe = (col: number) => col >= 0 && col < row.length ? row[col] : undefined;

        const amtVal     = safe(mCfg.amtCol);
        const amt        = typeof amtVal === "number"
          ? amtVal
          : parseFloat(String(amtVal || "0").replace(/[^0-9.-]+/g, "")) || 0;
        const remarksVal = String(safe(mCfg.remCol) ?? "").trim();

        if (remarksVal === "__skipped__") return;
        if (amt <= 0 && (!remarksVal || remarksVal === "null" || remarksVal === "")) return;

        const rawDue  = safe(mCfg.dueCol) ?? row[4] ?? "End of Month";
        const invVal  = mCfg.invCol  >= 0 ? safe(mCfg.invCol)  : true;
        const appVal  = mCfg.appCol  >= 0 ? safe(mCfg.appCol)  : true;
        const senVal  = mCfg.senCol  >= 0 ? safe(mCfg.senCol)  : true;
        const payVal  = mCfg.payCol  >= 0 ? safe(mCfg.payCol)  : false;

        // Resolve dueDate to ISO YYYY-MM-DD so overdue comparison in HubPage works.
        // Raw cell values like "End of Month", "Apr 30", or blank all fall through
        // to the end-of-month fallback for the item's own month.
        const resolvedDueDate = (() => {
          const parsed = parseDateVal(rawDue);
          if (parsed) return parsed;
          const mIdx = MONTH_ORDER.indexOf(mCfg.name);
          if (mIdx < 0) return "";
          const cy = new Date().getFullYear();
          const lastDay = new Date(cy, mIdx + 1, 0).getDate();
          return `${cy}-${String(mIdx + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        })();

        ar.push({
          id:          `ar-${i + 1}-${mCfg.name}`,
          entity, customer,
          description: desc,
          amount:      amt,
          dueDate:     resolvedDueDate,
          month:       mCfg.name,
          // Col D (index 3) = occurrence (Monthly / Quarterly / Annual).
          // Old code erroneously used row[6] which falls inside the March-Approval block.
          occurrence:  String(row[3] || "Monthly"),
          invoice:     mCfg.invCol  >= 0 ? isTrue(invVal) : (amt > 0),
          approval:    mCfg.appCol  >= 0 ? isTrue(appVal) : (amt > 0),
          sent:        mCfg.senCol  >= 0 ? isTrue(senVal) : (amt > 0),
          payment:     isTrue(payVal),
          remarks:     remarksVal !== "null" ? remarksVal : "",
          row:         i + 1,
        });
      });
    });
  }

  // Bank Statements Tracker Parsing
  const statements: any[] = [];
  const rawStatementsTab = dataByTab["Bank Statements Data"] || [];

  // Sheet column order for Bank Statements Data (A–I):
  // A(0)=Period, B(1)=Entity, C(2)=Bank Name, D(3)=Occurrence,
  // E(4)=Remarks, F(5)=Statement Date, G(6)=Request Date,
  // H(7)=Downloaded, I(8)=Downloaded timestamp
  if (rawStatementsTab.length > 0) {
    rawStatementsTab.forEach((row, i) => {
      if (!row || row.length < 3) return;
      const period     = String(row[0] || "").trim();
      const entityRaw  = String(row[1] || "").trim();
      const bankName   = String(row[2] || "").trim();
      // Skip blank rows and the header row (header has col A = "Period")
      if (!bankName || !entityRaw) return;
      if (period.toLowerCase() === "period" || entityRaw.toLowerCase() === "entity") return;

      const occurrence     = String(row[3] || "Monthly").trim();
      const remarks        = String(row[4] || "").trim();
      const statementDate  = String(row[5] || "").trim();
      const requestDate    = String(row[6] || "").trim();
      const isDownloaded   = row[7] === true || /^(true|yes|ready)$/i.test(String(row[7] || ""));
      const downloadedAt   = parseDateVal(row[8]) || "";

      let entity: EntityName = "TI";
      if (entityRaw.includes("MSDx")) entity = "MSDx";
      else if (entityRaw.includes("Ruby")) entity = "Ruby's";
      else if (entityRaw.includes("Curcumin")) entity = "CurcuminPro";
      else if (/4YR/i.test(entityRaw)) entity = "4YR" as EntityName;
      else if (/4G/i.test(entityRaw)) entity = "4G" as EntityName;
      else if (/E1/i.test(entityRaw)) entity = "E1" as EntityName;
      else if (/TI/i.test(entityRaw)) entity = "TI";

      statements.push({
        id: `stmt-bsd-${i + 1}`,
        period,
        entity,
        bankName,
        occurrence,
        remarks,
        statementDate,
        requestDate,
        downloaded: isDownloaded,
        downloadedAt,
        rowIndex: i + 1,
      } as any);
    });
  }

  // Extract standard bank template list from columns N–T (indices 13–19) of the same tab
  // N=Entity, O=Bank Name, P=Statement Cycle, Q=Remarks, R=Statement Date, S=Request Date, T=Downloaded
  const statementTemplates: Array<{
    entity: string; bank: string; cycle: string;
    remarks: string; statementDate: string; requestDate: string; downloaded: boolean;
  }> = [];
  rawStatementsTab.forEach((row) => {
    const entity = String(row[13] || "").trim();
    const bank   = String(row[14] || "").trim();
    if (!entity || !bank || entity.toLowerCase() === "entity") return;
    statementTemplates.push({
      entity,
      bank,
      cycle:         String(row[15] || "Monthly").trim(),
      remarks:       String(row[16] || "").trim(),
      statementDate: String(row[17] || "").trim(),
      requestDate:   String(row[18] || "").trim(),
      downloaded:    String(row[19] || "").toLowerCase() === "true",
    });
  });

  // Fallback to "Bank Statements" tab if Bank Statements Data was empty
  if (statements.length === 0) {
    const fallbackTab = dataByTab["Bank Statements"] || [];
    fallbackTab.forEach((row, i) => {
      if (!row || row.length < 3) return;
      const bankName = String(row[2] || row[1] || "").trim();
      if (!bankName || bankName.toLowerCase().includes("bank") || bankName.startsWith("n1")) return;
      const entRaw = String(row[1] || row[0] || "TI").trim();
      let entity: EntityName = "TI";
      if (entRaw.includes("MSDx")) entity = "MSDx";
      else if (entRaw.includes("Ruby")) entity = "Ruby's";
      else if (entRaw.includes("Curcumin")) entity = "CurcuminPro";

      statements.push({
        id: `stmt-bs-${i + 1}`,
        period: "2026-06",
        entity,
        bankName,
        accountName: bankName,
        occurrence: "Monthly",
        statementDate: "2026-06-30",
        requestDate: "2026-07-01",
        downloaded: true,
        downloadedAt: "2026-07-06",
        remarks: "Monthly Statement",
        rowIndex: i + 1
      });
    });
  }

  if (statements.length === 0) {
    const allAccounts = [
      ...banks.map(b => ({ bankName: b.accountName, entity: b.entity })),
      ...loans.map(l => ({ bankName: l.lender, entity: l.entity }))
    ];
    let stIdx = 1;
    ["2026-06", "2026-07"].forEach(period => {
      allAccounts.forEach(acc => {
        statements.push({
          id: `st-${stIdx++}`,
          period,
          entity: acc.entity,
          bankName: acc.bankName,
          occurrence: "Monthly",
          statementDate: `${period}-28`,
          requestDate: `${period}-30`,
          downloaded: period === "2026-06",
          downloadedAt: period === "2026-06" ? `${period}-29` : "",
          remarks: "Monthly Statement"
        });
      });
    });
  }

  // Payroll Pivot and Weeks
  const payrollPivot: Record<string, Record<string, Record<string, { hours: number; amount: number }>>> = {
    "Ruby's": {},
    "TI": {},
    "MSDx": {}
  };

  // Helper to accumulate into payrollPivot
  const addPivotItem = (co: string, job: string, subCat: string, hours: number, amt: number) => {
    let entity = "TI";
    if (co.toLowerCase().includes("ruby")) entity = "Ruby's";
    else if (co.toLowerCase().includes("msdx")) entity = "MSDx";

    if (!payrollPivot[entity]) payrollPivot[entity] = {};
    if (!payrollPivot[entity][job]) payrollPivot[entity][job] = {};
    if (!payrollPivot[entity][job][subCat]) {
      payrollPivot[entity][job][subCat] = { hours: 0, amount: 0 };
    }
    payrollPivot[entity][job][subCat].hours += hours;
    payrollPivot[entity][job][subCat].amount += amt;
  };

  // 1. Parse from "4YR Payroll" raw tab
  const rawPayrollRows = dataByTab["4YR Payroll"] || [];
  if (rawPayrollRows.length > 1) {
    rawPayrollRows.slice(1).forEach((row) => {
      if (!row || row.length === 0 || row.every((c) => !c || String(c).trim() === "")) return;
      const coStr = String(row[0] || row[1] || "").trim();
      const jobStr = String(row[1] || row[2] || "General Operations").trim();
      const subCatStr = String(row[2] || row[3] || "Gross Pay").trim();
      const hrsVal = typeof row[3] === "number" ? row[3] : parseFloat(String(row[3] || "0").replace(/[^0-9.-]+/g, "")) || 0;
      const amtVal = typeof row[4] === "number" ? row[4] : parseFloat(String(row[4] || row[5] || "0").replace(/[^0-9.-]+/g, "")) || 0;

      if (amtVal > 0 || hrsVal > 0) {
        addPivotItem(coStr, jobStr, subCatStr, hrsVal, amtVal);
      }
    });
  }

  // 2. Supplement from AP bills with "Payroll", "Gusto", "ADP", or "Salary" in vendor
  ap.forEach((b) => {
    if (/payroll|gusto|adp|salary|wages|staff/i.test(b.vendor)) {
      addPivotItem(b.entity, "Payroll Line Items", b.vendor, 40, b.amount);
    }
  });

  // Ensure default fallback data if payroll tab is empty
  if (Object.keys(payrollPivot["Ruby's"]).length === 0) {
    addPivotItem("Ruby's", "Operations", "Warehouse & Packing", 160, 4800);
    addPivotItem("Ruby's", "Operations", "Quality Control", 80, 2800);
    addPivotItem("Ruby's", "Administration", "Accounting & Admin", 40, 2200);
  }
  if (Object.keys(payrollPivot["TI"]).length === 0) {
    addPivotItem("TI", "Engineering", "Software Devs", 240, 14400);
    addPivotItem("TI", "Engineering", "DevOps & Cloud", 120, 7800);
    addPivotItem("TI", "Management", "Exec & Operations", 80, 6500);
  }
  if (Object.keys(payrollPivot["MSDx"]).length === 0) {
    addPivotItem("MSDx", "Laboratory", "Research Scientists", 160, 9600);
    addPivotItem("MSDx", "Laboratory", "Lab Technicians", 120, 5400);
  }

  const payrollWeeks = [
    { weekNum: "W28", year: 2026, label: "Jul 6 – Jul 10", startDate: "2026-07-06", endDate: "2026-07-10", sheetName: "4YR Payroll W28" },
    { weekNum: "W27", year: 2026, label: "Jun 29 – Jul 3", startDate: "2026-06-29", endDate: "2026-07-03", sheetName: "4YR Payroll W27" },
    { weekNum: "W26", year: 2026, label: "Jun 22 – Jun 26", startDate: "2026-06-22", endDate: "2026-06-26", sheetName: "4YR Payroll W26" },
    { weekNum: "W25", year: 2026, label: "Jun 15 – Jun 19", startDate: "2026-06-15", endDate: "2026-06-19", sheetName: "4YR Payroll W25" },
    { weekNum: "W24", year: 2026, label: "Jun 8 – Jun 12", startDate: "2026-06-08", endDate: "2026-06-12", sheetName: "4YR Payroll W24" }
  ];

  // Parse Meeting Notes / Quick Notes tab from sheet.
  // Columns are detected dynamically from the header row so the parser
  // survives sheet re-ordering.  Fallback indices match the known layout:
  //   0=ID  1=Created  2=WeekLabel  3=WeekStart  4=Company  5=Vendor
  //   6=NoteText  7=Done(bool)  8=LastUpdated
  const qnRawRows: any[][] =
    (dataByTab["Quick Notes"]?.length   ? dataByTab["Quick Notes"]   : null) ||
    (dataByTab["Meeting Notes"]?.length ? dataByTab["Meeting Notes"] : null) ||
    (dataByTab["Notes"]?.length         ? dataByTab["Notes"]         : null) ||
    [];
  const quickNotes: any[] = [];
  if (qnRawRows.length > 1) {
    // ── detect columns from header ───────────────────────────────────
    const qnHeader = qnRawRows[0].map((h: any) => String(h || "").toLowerCase().trim());
    const qnCol = (candidates: string[], fallback: number) => {
      for (const c of candidates) {
        const idx = qnHeader.findIndex((h: string) => h.includes(c));
        if (idx !== -1) return idx;
      }
      return fallback;
    };
    const COL_ID      = qnCol(["id"], 0);
    const COL_CREATED = qnCol(["created", "timestamp", "date created"], 1);
    const COL_WEEK_LBL= qnCol(["week label", "weeklabel"], 2);
    const COL_WEEK_DT = qnCol(["week start", "weekstart"], 3);
    const COL_COMPANY = qnCol(["company", "entity", "client"], 4);
    const COL_VENDOR  = qnCol(["vendor", "supplier", "payee"], 5);
    const COL_NOTE    = qnCol(["notetext", "note text", "note", "description", "content"], 6);
    // "done" must be exact-matched so it doesn't accidentally hit "doneat"
    const COL_STATUS  = (() => {
      const exact = qnHeader.findIndex((h: string) => h === "done" || h === "status" || h === "completed" || h === "finished");
      if (exact !== -1) return exact;
      return qnCol(["done", "check"], 7);
    })();
    const COL_DONE_AT = qnCol(["doneat", "done at", "completedat", "completed at", "done_at"], 8);

    // Helper: interpret a cell as "done" regardless of format.
    // Google Sheets FORMATTED_VALUE mode returns checkbox as "TRUE"/"FALSE" string.
    const parseDone = (val: any): boolean => {
      if (val === true) return true;
      const s = String(val ?? "").trim().toLowerCase();
      return ["true", "done", "yes", "1", "complete", "completed", "✓", "x", "finished"].includes(s);
    };

    qnRawRows.slice(1).forEach((row: any[], rowIdx: number) => {
      if (!row || row.every((c: any) => !c)) return;
      const rawId = String(row[COL_ID] || "").trim();
      if (!rawId || rawId.toLowerCase() === "id") return;
      const noteText = String(row[COL_NOTE] || "").trim();
      if (!noteText) return;

      const id = `qn-${rawId}`;
      const weekLabel = String(row[COL_WEEK_LBL] || "").trim();
      const weekStart =
        parseDateVal(row[COL_WEEK_DT]) ||
        parseDateVal(row[COL_CREATED]) ||
        new Date().toISOString().split("T")[0];
      const company    = String(row[COL_COMPANY] || "").trim();
      const vendor     = String(row[COL_VENDOR]  || "").trim();
      const isDone     = parseDone(row[COL_STATUS]);
      const status: "open" | "done" = isDone ? "done" : "open";
      const doneAtRaw  = row[COL_DONE_AT];
      const completedAt = isDone && doneAtRaw
        ? String(doneAtRaw).trim()
        : undefined;
      // sheet row = rowIdx + 2 (slice(1) → 0-based; +1 for header; +1 for 1-indexing)
      const sheetRow = rowIdx + 2;

      quickNotes.push({
        id,
        // GAS convention: Column F (vendor/subject) = display title, Column G = body content
        title:     vendor || noteText,
        content:   noteText,
        category:  weekLabel || "General",
        entity:    company   || undefined,
        vendorName: vendor   || undefined,
        status,
        completedAt,
        createdAt: weekStart,
        weekLabel,
        row: sheetRow,
        itemType: "note" as const
      });
    });
  }

  // ── Headley's Sheet ──────────────────────────────────────────────
  // Two-table layout: summary at top, raw data below.
  // Raw data header is detected by a row containing "charging bu", "debit", and "credit".
  // Columns (0-based from startCol): BU, Date, Ref, ST, Type, Desc, Debit, Credit, Amount, DueDate
  const headleys: any[] = [];
  const headleysRawRows = dataByTab["Headley's"] || [];
  if (headleysRawRows.length > 0) {
    let dataHeaderIdx = -1;
    let startCol = 0;
    for (let i = 0; i < headleysRawRows.length; i++) {
      const joined = headleysRawRows[i].join(" ").toLowerCase();
      if (joined.includes("charging bu") && joined.includes("debit") && joined.includes("credit")) {
        dataHeaderIdx = i;
        for (let c = 0; c < headleysRawRows[i].length; c++) {
          if (String(headleysRawRows[i][c] || "").toLowerCase().includes("charging bu")) {
            startCol = c;
            break;
          }
        }
        break;
      }
    }
    if (dataHeaderIdx >= 0) {
      const headerRow = headleysRawRows[dataHeaderIdx];
      // Default offsets from startCol
      let buCol = startCol, dateCol = startCol + 1, refCol = startCol + 2, stCol = startCol + 3;
      let typeCol = startCol + 4, descCol = startCol + 5, debitCol = startCol + 6;
      let creditCol = startCol + 7, amtCol = startCol + 8, dueCol = startCol + 9;
      // Refine from actual header labels
      for (let c = startCol; c < headerRow.length; c++) {
        const h = String(headerRow[c] || "").toLowerCase().trim();
        if (h === "charging bu") buCol = c;
        else if (h === "date") dateCol = c;
        else if (h === "ref") refCol = c;
        else if (h === "amount") amtCol = c;
        else if (h === "due date" || h === "due") dueCol = c;
        else if (h === "description") descCol = c;
        else if (h === "debit") debitCol = c;
        else if (h === "credit") creditCol = c;
      }
      for (let i = dataHeaderIdx + 1; i < headleysRawRows.length; i++) {
        const row = headleysRawRows[i];
        const bu = String(row[buCol] || "").trim();
        if (!bu) continue;
        const parseNum = (v: any) => typeof v === "number" ? v : parseFloat(String(v || "0").replace(/[^0-9.-]+/g, "")) || 0;
        const amt = parseNum(row[amtCol]);
        const debit = parseNum(row[debitCol]);
        const credit = parseNum(row[creditCol]);
        const dueDate = parseDateVal(row[dueCol]) || String(row[dueCol] || "").trim();
        const date = parseDateVal(row[dateCol]) || String(row[dateCol] || "").trim();
        headleys.push({
          id: `hl-${i}`,
          bu,
          date,
          ref: String(row[refCol] || "").trim(),
          st: String(row[stCol] || "").trim(),
          type: String(row[typeCol] || "").trim(),
          description: String(row[descCol] || "").trim(),
          debit,
          credit,
          amount: amt || debit || credit,
          dueDate,
          billingDate: dueDate
        });
      }
    }
  }

  // ── Metadata Sheet — enrich AP bills with recurring / cost / payment type ─
  // GAS META_COLS (1-based) → 0-based for GViz rows:
  //   Ruby: vendor=2, recurring=5, fixedEst=6, debitManual=7
  //   TI:   vendor=13, recurring=15, fixedEst=16, debitManual=17
  //   MSDx: vendor=20, recurring=22, fixedEst=23, debitManual=24
  // Data starts at sheet row 4 → GViz index 3 (row 0 = sheet row 1).
  const metadataRawRows = dataByTab["Metadata"] || [];
  if (metadataRawRows.length > 3) {
    const META_SECTIONS = [
      { vendorCol: 2,  recurCol: 5,  fixedCol: 6,  debitCol: 7  }, // Ruby's
      { vendorCol: 13, recurCol: 15, fixedCol: 16, debitCol: 17 }, // TI
      { vendorCol: 20, recurCol: 22, fixedCol: 23, debitCol: 24 }, // MSDx
    ];
    const normalize = (v: any) => String(v || "").trim().toLowerCase();
    const asBool = (v: string) => v === "true" || v === "yes" || v === "1" || v === "✓";
    const metaLookup: Record<string, { recurringType?: string; costType?: string; paymentType?: string }> = {};

    for (let i = 3; i < metadataRawRows.length; i++) {
      const row = metadataRawRows[i];
      META_SECTIONS.forEach(sec => {
        const vendor = String(row[sec.vendorCol] || "").trim();
        if (!vendor) return;
        const recurRaw = normalize(row[sec.recurCol]);
        const fixedRaw = normalize(row[sec.fixedCol]);
        const debitRaw = normalize(row[sec.debitCol]);
        const recurringType =
          asBool(recurRaw) || recurRaw === "recurring" ? "Recurring" :
          !asBool(recurRaw) && (recurRaw === "false" || recurRaw === "no" || recurRaw === "non-recurring") ? "Non-Recurring" : undefined;
        const costType =
          fixedRaw === "fixed" || asBool(fixedRaw) ? "Fixed" :
          fixedRaw === "estimate" || fixedRaw === "est" || fixedRaw === "no" || fixedRaw === "false" ? "Estimate" : undefined;
        const paymentType =
          debitRaw === "auto" || debitRaw === "autodebit" || debitRaw === "auto-debit" || asBool(debitRaw) ? "Auto-Debit" :
          debitRaw === "manual" || debitRaw === "no" || debitRaw === "false" ? "Manual" : undefined;
        metaLookup[vendor.toLowerCase()] = { recurringType, costType, paymentType };
      });
    }
    // Apply to AP bills
    ap.forEach((bill: any) => {
      const meta = metaLookup[(bill.vendor || "").toLowerCase()];
      if (!meta) return;
      if (meta.recurringType) bill.recurringType = meta.recurringType;
      if (meta.costType) bill.costType = meta.costType;
      if (meta.paymentType) bill.paymentType = meta.paymentType;
    });
  }

  return {
    ap,
    banks,
    loans,
    ar,
    statements,
    statementTemplates,
    quickNotes,
    calendarLocalEvents,
    payrollPivot,
    payrollWeeks,
    headleys,
    lastSyncedAt: new Date().toISOString()
  };
}
