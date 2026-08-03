import https from "https";
import { EntityName } from "../types";

const SPREADSHEET_ID = "15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs";
const CALENDAR_SPREADSHEET_ID = "1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo";

function cleanRemarks(parts: any[]): string {
  return parts
    .map((v) => String(v || "").trim())
    .filter((v) => v.length > 0)
    .join(" · ");
}

function parseDateVal(val: any, year?: any, month?: any, dayStr?: any): string {
  if (typeof val === "string" && val.startsWith("Date(")) {
    const parts = val.replace("Date(", "").replace(")", "").split(",").map((n) => parseInt(n.trim()));
    if (parts.length >= 3) {
      const y = parts[0];
      const m = String(parts[1] + 1).padStart(2, "0");
      const d = String(parts[2]).padStart(2, "0");
      if (y >= 2000 && y <= 2030) return `${y}-${m}-${d}`;
    }
  }
  if (typeof val === "number" && val > 1e12) {
    // JavaScript ms epoch timestamp
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      if (y >= 2000 && y <= 2035) return d.toISOString().split("T")[0];
    }
  }
  if (typeof val === "number" || (!isNaN(Number(val)) && Number(val) > 30000 && Number(val) < 80000)) {
    const num = Number(val);
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      if (y >= 2000 && y <= 2030) return d.toISOString().split("T")[0];
    }
  }
  if (val && typeof val === "string") {
    const str = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(str)) return str.replace(/\./g, "-");
    const slashParts = str.split("/");
    if (slashParts.length === 3) {
      const m = String(parseInt(slashParts[0])).padStart(2, "0");
      const d = String(parseInt(slashParts[1])).padStart(2, "0");
      let y = parseInt(slashParts[2]);
      if (y < 100) y += 2000;
      if (!isNaN(y) && y >= 2000 && y <= 2030) return `${y}-${m}-${d}`;
    }
  }
  if (val && typeof val !== "object") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      if (y >= 2000 && y <= 2030) return d.toISOString().split("T")[0];
    }
  }
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

function fetchSheetsV4Tab(sheetName: string, accessToken: string, spreadsheetId: string): Promise<any[][]> {
  return new Promise((resolve) => {
    // Wrap sheet name in single quotes for A1 notation (required for names with spaces/apostrophes).
    // Escape internal apostrophes by doubling them.
    const a1Name = "'" + sheetName.replace(/'/g, "''") + "'";
    const reqPath = `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(a1Name)}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`;
    const req = https.request({
      hostname: "sheets.googleapis.com",
      path: reqPath,
      method: "GET",
      headers: { "Authorization": `Bearer ${accessToken}` }
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
    "Bank Statements",
    "4YR Payroll",
    "Meeting Notes",
    "Quick Notes",
    "Notes",
    "Action Logs"
  ];

  // Fetch from both main spreadsheet tabs AND the dedicated calendar spreadsheet in parallel.
  // Try multiple tab name candidates for the calendar sheet (Events, Sheet1, Calendar, Tasks).
  const CAL_TAB_CANDIDATES = ["Events", "Sheet1", "Calendar", "Tasks", "Schedule"];
  const fetchTab = accessToken
    ? (t: string) => fetchSheetsV4Tab(t, accessToken, SPREADSHEET_ID)
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

    // Date and time: prefer start_ms (E/col4); fall back to end_ms (F/col5)
    const ms4 = typeof row[4] === "number" ? row[4] : parseFloat(String(row[4] || "0"));
    const ms5 = typeof row[5] === "number" ? row[5] : parseFloat(String(row[5] || "0"));
    const dateMs = ms4 || ms5;
    const date = parseDateVal(dateMs) || parseDateVal(row[4]) || parseDateVal(row[5]) || "";
    if (!date) return; // skip rows without a valid date

    // Extract time from start_ms; if midnight try end_ms
    let timeStr: string | undefined;
    for (const ms of [ms4, ms5]) {
      if (ms && !isNaN(ms) && ms > 0) {
        const d = new Date(ms);
        const h = d.getHours();
        const m = d.getMinutes();
        if (h !== 0 || m !== 0) { timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; break; }
      }
    }

    const description = String(row[3] || "").trim();
    const isDone = row[15] === true || String(row[15] || "").toLowerCase() === "true";
    const calName = String(row[7] || "").trim();
    const urgency = String(row[8] || "normal").trim();
    const category = String(row[9] || "task").trim();
    const assigneeName = String(row[11] || "").trim();

    calendarLocalEvents.push({
      id,
      date,
      time: timeStr,
      title,
      notes: description,
      entity: calName || "Ruby's",
      type: category,
      assignee: assigneeName,
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
    let amount = typeof row[9] === "number" ? row[9] : typeof row[8] === "number" ? row[8] : parseFloat(String(row[9] || row[8] || "0").replace(/[^0-9.-]+/g, "")) || 0;
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

    // GAS Layout A: remarks = col K (Payment Instructions) + col M (Status 1), joined with " · "
    const remarks = cleanRemarks([row[10], row[12]]);

    const finalDueDate = dueDate || new Date().toISOString().split("T")[0];

    ap.push({
      id: `ap-ruby-${i + 1}`,
      vendor,
      entity: "Ruby's",
      company: "Ruby's",
      amount,
      dueDate: finalDueDate,
      method,
      status,
      inQBO,
      bucket: computeBucket(finalDueDate, status),
      sheet: "Ruby's Bills",
      invoiceNo,
      remarks,
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
      // Keep historical unpaid/on-hold from all years; only skip confirmed paid historical rows
      const statusRaw13 = String(row[13] || "").trim().toLowerCase();
      const isOnHoldEarlyTI = statusRaw13.includes("hold") || [10, 11, 12, 13].some(c => String(row[c] || "").toLowerCase().includes("hold"));
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
        // Try to get vendor from common positions [3],[4],[5]
        for (const colIdx of [3, 4, 5]) {
          const v = String(row[colIdx] || "").trim();
          if (v && !HEADER_WORDS.test(v) && v.length >= 2 && v.length <= 90 && isNaN(Number(v)) && !parseDateVal(v)) {
            vendor = v;
            company = currentCompany;
            break;
          }
        }
      } else {
        currentCompany = company; // update tracked company
      }

      // Skip header rows, empty rows, or rows where vendor looks like a header
      if (!vendor) return;
      if (HEADER_WORDS.test(vendor)) return;

      // Amount: try multiple positions
      let amount = 0;
      for (const col of [9, 10, 8, 11]) {
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
                       [10, 11, 12, 13].some(c => String(row[c] || "").toLowerCase().includes("hold"));
      const status = detectStatus(statusRaw, rawMethodTI, "", isOnHold);

      const inQBO = [14, 15, 13].some(c => row[c] === true || String(row[c] || "").toLowerCase() === "true" || String(row[c] || "").toLowerCase() === "qbo");

      let entity: "Ruby's" | "TI" | "MSDx" = "TI";
      if (company.toLowerCase().includes("ruby")) entity = "Ruby's";
      else if (company.toLowerCase().includes("msdx")) entity = "MSDx";

      ap.push({
        id: `ap-ti-${tabName.replace(/\s+/g, "")}-${i + 1}`,
        vendor,
        entity,
        company: company || currentCompany,
        amount,
        dueDate,
        method,
        status,
        inQBO,
        bucket: computeBucket(dueDate, status),
        sheet: tabName,
        invoiceNo,
        remarks: cleanRemarks([row[14], row[15], row[16], row[17]]),
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
    let amount = typeof row[9] === "number" ? row[9] : typeof row[8] === "number" ? row[8] : parseFloat(String(row[9] || row[8] || "0").replace(/[^0-9.-]+/g, "")) || 0;
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

    // GAS Layout A: remarks = col K (Payment Instructions) + col M (Status 1), joined with " · "
    const remarks = cleanRemarks([row[10], row[12]]);

    ap.push({
      id: `ap-msdx-${i + 1}`,
      vendor,
      entity: "MSDx",
      amount,
      dueDate,
      method,
      status,
      inQBO,
      bucket: computeBucket(dueDate, status),
      sheet: "MSDx Bills",
      invoiceNo,
      remarks,
      row: i - 4 // dataStart=6: row 1 = sheet row 6, so bill.row = i+1-(dataStart-1) = i-4
    });
  });

  // Banks
  const banks: any[] = [];
  (dataByTab["Bank Balances"] || []).forEach((row, i) => {
    const name = String(row[0] || "").trim();
    if (!name || name.toLowerCase().includes("company") || name.startsWith("Date")) return;
    const bal = typeof row[1] === "number" ? row[1] : parseFloat(String(row[1]).replace(/[^0-9.-]+/g, "")) || 0;
    const yestVal = typeof row[2] === "number" ? row[2] : parseFloat(String(row[2] || "").replace(/[^0-9.-]+/g, "")) || Math.round(bal * 0.98);
    const asOf = parseDateVal(row[3]) || new Date().toISOString().split("T")[0];
    let entity: EntityName = "Ruby's";
    if (name.includes("4G") || name.includes("E1") || name.includes("TI") || name.includes("4YR")) entity = "TI";
    else if (name.includes("MSDx")) entity = "MSDx";
    else if (name.includes("Curcumin")) entity = "CurcuminPro";

    banks.push({ id: `b-${i + 1}`, entity, bank: name, type: "Operating", acct: "...", balance: bal, yesterday: yestVal, asOf, status: "Active", trend: bal >= yestVal ? "up" : "down" });
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

  // AR Items - Unrolling horizontal month columns (March, April, May, June, July, etc.)
  const ar: any[] = [];
  const arRawRows = dataByTab["AR Dashboard Data"] || [];

  if (arRawRows.length > 0) {
    const monthConfigs = [
      { name: "March", amtCol: 14, dueCol: 13, remCol: 12, invCol: -1, appCol: -1, senCol: -1, payCol: -1 },
      { name: "April", amtCol: 25, dueCol: 24, remCol: 23, invCol: 15, appCol: 17, senCol: 19, payCol: 21 },
      { name: "May", amtCol: 36, dueCol: 35, remCol: 34, invCol: 26, appCol: 28, senCol: 30, payCol: 32 },
      { name: "June", amtCol: 47, dueCol: 46, remCol: 45, invCol: 37, appCol: 39, senCol: 41, payCol: 43 },
      { name: "July", amtCol: 58, dueCol: 57, remCol: 56, invCol: 48, appCol: 50, senCol: 52, payCol: 54 }
    ];

    arRawRows.forEach((row, i) => {
      const entityRaw = String(row[0] || "").trim();
      const customer = String(row[1] || "").trim();
      if (!customer || customer.toLowerCase().includes("customer") || customer.toLowerCase().includes("entity")) return;
      const desc = String(row[2] || "Invoice").trim();

      let entity: "Ruby's" | "TI" | "MSDx" = "TI";
      if (entityRaw.includes("Ruby")) entity = "Ruby's";
      else if (entityRaw.includes("MSDx")) entity = "MSDx";

      monthConfigs.forEach((mCfg) => {
        const amtVal = row[mCfg.amtCol];
        const amt = typeof amtVal === "number" ? amtVal : parseFloat(String(amtVal || "0").replace(/[^0-9.-]+/g, "")) || 0;
        const remarksVal = String(row[mCfg.remCol] || "").trim();

        if (remarksVal === "__skipped__" || (amt <= 0 && (!remarksVal || remarksVal === "null" || remarksVal === ""))) return;

        const rawDue = row[mCfg.dueCol] || row[4] || "End of Month";
        const invVal = mCfg.invCol !== -1 ? row[mCfg.invCol] : true;
        const appVal = mCfg.appCol !== -1 ? row[mCfg.appCol] : true;
        const senVal = mCfg.senCol !== -1 ? row[mCfg.senCol] : true;
        const payVal = mCfg.payCol !== -1 ? row[mCfg.payCol] : false;

        const isTrue = (val: any) => val === true || String(val).toLowerCase() === "true" || val === 1;

        ar.push({
          id: `ar-${i + 1}-${mCfg.name}`,
          entity,
          customer,
          description: desc,
          amount: amt,
          dueDate: String(rawDue),
          month: mCfg.name,
          occurrence: String(row[6] || "Monthly"),
          invoice: isTrue(invVal) || amt > 0,
          approval: isTrue(appVal) || amt > 0,
          sent: isTrue(senVal) || amt > 0,
          payment: isTrue(payVal),
          remarks: remarksVal !== "null" ? remarksVal : ""
        });
      });
    });
  }

  // Bank Statements Tracker Parsing
  const statements: any[] = [];
  const rawStatementsTab = dataByTab["Bank Statements Data"] || [];

  if (rawStatementsTab.length > 0) {
    rawStatementsTab.forEach((row, i) => {
      if (!row || row.length < 3) return;
      const cycleMonth = String(row[0] || "Jul 2026").trim();
      const entityRaw = String(row[1] || "").trim();
      const accountName = String(row[2] || "").trim();
      if (!accountName || accountName.toLowerCase().includes("account") || accountName.toLowerCase().includes("bank")) return;

      const occurrence = String(row[3] || "Monthly").trim();
      const purpose = String(row[4] || "").trim();
      const periodRange = String(row[5] || "").trim();
      const downloadDate = parseDateVal(row[6]);
      const isDownloaded = row[7] === true || String(row[7]).toLowerCase() === "true" || String(row[7]).toLowerCase() === "yes" || String(row[7]).toLowerCase() === "ready";
      const reconciledDate = parseDateVal(row[8]);

      let entity: EntityName = "TI";
      if (entityRaw.includes("MSDx")) entity = "MSDx";
      else if (entityRaw.includes("Ruby")) entity = "Ruby's";
      else if (entityRaw.includes("Curcumin")) entity = "CurcuminPro";
      else if (entityRaw.includes("TI") || entityRaw.includes("E1") || entityRaw.includes("4G")) entity = "TI";

      statements.push({
        id: `stmt-bsd-${i + 1}`,
        period: periodRange || cycleMonth,
        entity,
        bankName: accountName,
        accountName,
        occurrence,
        statementDate: downloadDate || "2026-07-06",
        requestDate: downloadDate || "2026-07-06",
        downloaded: isDownloaded,
        downloadedAt: downloadDate,
        reconciledDate,
        remarks: purpose ? `${cycleMonth} - ${purpose}` : cycleMonth,
        rowIndex: i + 1
      });
    });
  }

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

  // Parse Meeting Notes tab from sheet
  // Column layout (gid=320158278):
  // 0=ID, 1=Created timestamp, 2=WeekLabel, 3=WeekStart date, 4=Company, 5=Vendor, 6=NoteText, 7=Done (bool), 8=LastUpdated
  const qnRawRows: any[][] = dataByTab["Quick Notes"] || dataByTab["Meeting Notes"] || dataByTab["Notes"] || [];
  const quickNotes: any[] = [];
  if (qnRawRows.length > 1) {
    qnRawRows.slice(1).forEach((row: any[], rowIdx: number) => {
      if (!row || row.every((c: any) => !c)) return;
      const rawId = String(row[0] || "").trim();
      if (!rawId || rawId.toLowerCase() === "id") return;
      const noteText = String(row[6] || "").trim();
      if (!noteText) return;

      const id = `qn-${rawId}`;
      const weekLabel = String(row[2] || "").trim();
      const weekStart = parseDateVal(row[3]) || parseDateVal(row[1]) || new Date().toISOString().split("T")[0];
      const company = String(row[4] || "").trim();
      const vendor = String(row[5] || "").trim();
      const isDone = row[7] === true || String(row[7] || "").toLowerCase() === "true";
      const status: "open" | "done" = isDone ? "done" : "open";

      quickNotes.push({
        id,
        title: noteText,
        content: vendor ? `${vendor}${company ? " — " + company : ""}` : company,
        category: weekLabel || "General",
        entity: company || undefined,
        vendorName: vendor || undefined,
        status,
        createdAt: weekStart,
        weekLabel,
        itemType: "note" as const
      });
    });
  }

  return {
    ap,
    banks,
    loans,
    ar,
    statements,
    quickNotes,
    calendarLocalEvents,
    payrollPivot,
    payrollWeeks,
    lastSyncedAt: new Date().toISOString()
  };
}
