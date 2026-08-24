import {
  APBill,
  BankAccount,
  Loan,
  ARItem,
  BankStatement,
  EntityName,
  PaymentMethod,
  PayrollPivot,
  DashboardNote
} from "../types";
import { extractInvoiceNumber } from "./liveSheetsFetcher";
import { bumpApiCounter } from "../utils/apiCounter";

// Extract Google Spreadsheet ID from URL or return ID as-is
export const extractSpreadsheetId = (urlOrId: string): string => {
  if (!urlOrId) return "";
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return urlOrId.trim();
};

export const parseDateVal = (val: any, year?: any, month?: any, dayStr?: any): string => {
  if (typeof val === "string" && val.startsWith("Date(")) {
    const parts = val.replace("Date(", "").replace(")", "").split(",").map((n) => parseInt(n.trim()));
    if (parts.length >= 3) {
      const y = parts[0];
      const m = String(parts[1] + 1).padStart(2, "0");
      const d = String(parts[2]).padStart(2, "0");
      if (y >= 2000 && y <= 2030) return `${y}-${m}-${d}`;
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
};

export interface SheetTabInfo {
  title: string;
  rowCount: number;
  columnCount: number;
}

// Auto-detect all worksheet tabs inside a Google Spreadsheet along with cell range suggestions
export const fetchSpreadsheetTabs = async (
  spreadsheetId: string,
  accessToken: string
): Promise<{ title: string; rowCount: number; columnCount: number; rangeSuggestion: string }[]> => {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) throw new Error("Invalid or empty Google Spreadsheet ID");

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=sheets.properties`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody?.error?.message || `Failed to fetch sheet metadata (${res.status})`);
  }

  const data = await res.json();
  const sheets = data.sheets || [];
  return sheets.map((s: any) => {
    const title = s.properties?.title || "Sheet1";
    const rowCount = s.properties?.gridProperties?.rowCount || 200;
    const columnCount = s.properties?.gridProperties?.columnCount || 26;

    let colLetter = "Z";
    let colIdx = columnCount;
    let temp = 0;
    let letter = "";
    while (colIdx > 0) {
      temp = (colIdx - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      colIdx = Math.floor((colIdx - temp) / 26);
    }
    colLetter = letter || "Z";

    return {
      title,
      rowCount,
      columnCount,
      rangeSuggestion: `'${title}'!A1:${colLetter}${Math.min(rowCount, 500)}`
    };
  });
};

// Fetch raw 2D values from Google Sheets API v4
export const fetchSheetValues = async (
  spreadsheetId: string,
  range: string,
  accessToken: string
): Promise<any[][]> => {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) throw new Error("Invalid or empty Google Spreadsheet ID");

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody?.error?.message || `Google Sheets API Error (${res.status})`);
  }

  const data = await res.json();
  bumpApiCounter("read");
  return data.values || [];
};

// Write / Update raw 2D values to Google Sheets API v4
export const updateSheetValues = async (
  spreadsheetId: string,
  range: string,
  values: any[][],
  accessToken: string
): Promise<any> => {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) throw new Error("Invalid or empty Google Spreadsheet ID");

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      range,
      majorDimension: "ROWS",
      values
    })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody?.error?.message || `Google Sheets Update Failed (${res.status})`);
  }

  bumpApiCounter("write");
  return await res.json();
};

// Append rows to Google Sheets API v4
export const appendSheetValues = async (
  spreadsheetId: string,
  range: string,
  values: any[][],
  accessToken: string
): Promise<any> => {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) throw new Error("Invalid or empty Google Spreadsheet ID");

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      range,
      majorDimension: "ROWS",
      values
    })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody?.error?.message || `Google Sheets Append Failed (${res.status})`);
  }

  bumpApiCounter("write");
  return await res.json();
};

export const computeBucket = (dueDate: string, status: string): APBill["bucket"] => {
  if (status === "paid") return "paid";
  if (status === "hold") return "on-hold";
  if (!dueDate) return "rest-of-year";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate + "T00:00:00");
  if (isNaN(due.getTime())) return "rest-of-year";

  // Monday-based week (matches GAS: if Sunday go back 6, else go back dow-1)
  const dow = today.getDay();
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
  if (due <= thisWeekSun) return "this-week";
  if (due >= nextWeekMon && due <= nextWeekSun) return "next-week";
  if (due > nextWeekSun && due <= endOfMonth) return "rest-of-month";
  return "rest-of-year";
};

// --- ENTITY NORMALIZER ---
export const normalizeEntityName = (input?: string, fallback: EntityName = "TI"): EntityName => {
  if (!input) return fallback;
  const str = String(input).trim().toLowerCase();
  if (str.includes("ruby") || str.includes("pizzeria")) return "Ruby's";
  if (str.includes("msdx") || str.includes("mobile") || str.includes("swallowing") || str.includes("diagnostics")) return "MSDx";
  if (str.includes("curcumin")) return "CurcuminPro";
  if (str.includes("ziglar")) return "Ziglar";
  if (
    str.includes("ti") ||
    str.includes("timm") ||
    str.includes("investments") ||
    str.includes("4g") ||
    str.includes("4yr") ||
    str.includes("corner") ||
    str.includes("e1")
  ) return "TI";
  return fallback;
};

// --- PARSERS (Google Sheet Rows -> Portal Models) ---

export const parseAPSheetRows = (
  rows: any[][],
  defaultEntity?: string,
  tabNameSource?: string
): APBill[] => {
  if (!rows || rows.length === 0) return [];

  const fallbackFromTab = normalizeEntityName(tabNameSource, (defaultEntity as EntityName) || "TI");
  const bills: APBill[] = [];

  // Search top 5 rows for a header row
  let headerRowIdx = -1;
  let vendorCol = -1;
  let entityCol = -1;
  let amountCol = -1;
  let dueCol = -1;
  let statusCol = -1;
  let invoiceCol = -1;
  let remarksCol = -1;

  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const rowStr = rows[r].map((c) => String(c || "").toLowerCase().trim());
    let vIdx = rowStr.findIndex((c) => /vendor|payee|biller|supplier/i.test(c));
    if (vIdx === -1) {
      vIdx = rowStr.findIndex((c) => /company|name/i.test(c));
    }
    const aIdx = rowStr.findIndex((c) => /amount|total|cost|price|\$/i.test(c));
    if (vIdx !== -1 || aIdx !== -1) {
      headerRowIdx = r;
      vendorCol = vIdx;
      amountCol = aIdx;
      entityCol = rowStr.findIndex((c) => /entity|business|company/i.test(c));
      dueCol = rowStr.findIndex((c) => /due|date/i.test(c));
      statusCol = rowStr.findIndex((c) => /status|paid|cleared|state/i.test(c));
      invoiceCol = rowStr.findIndex((c) => /invoice|inv_no|bill_no|ref/i.test(c));
      remarksCol = rowStr.findIndex((c) => /remark|note|comment|instruction/i.test(c));
      break;
    }
  }

  const startIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

  // If header detection missed (range starts after header row), use known column positions per entity
  if (invoiceCol === -1) invoiceCol = 6; // col G = Invoice# for Ruby's, TI, MSDx
  if (remarksCol === -1) {
    if (tabNameSource && /ruby|msdx/i.test(tabNameSource)) remarksCol = 10; // col K = Payment Instructions
    else if (tabNameSource && /ti/i.test(tabNameSource)) remarksCol = 14;   // col O = Remarks
  }

  rows.slice(startIdx).forEach((row, idx) => {
    if (!row || row.length === 0) return;

    const rowStr = row.map((c) => String(c || "")).join(" ").toLowerCase();
    if (
      rowStr.includes("vendor") && rowStr.includes("amount") ||
      rowStr.includes("subtotal") ||
      rowStr.includes("grand total") ||
      rowStr.includes("ruby's bills") ||
      rowStr.includes("ti bills") ||
      rowStr.includes("msdx bills")
    ) {
      return;
    }

    let vendor = "";
    let amount = 0;
    let dueDate = "2026-07-25";
    let status: "unpaid" | "paid" | "hold" = "unpaid";
    let entity: EntityName = fallbackFromTab;
    const invoiceNo = String(row[6] || "").trim();

    // Check header column if found
    if (vendorCol !== -1 && row[vendorCol]) {
      vendor = String(row[vendorCol]).trim();
    }
    if (amountCol !== -1 && row[amountCol] !== undefined) {
      const aVal = row[amountCol];
      amount = typeof aVal === "number" ? aVal : parseFloat(String(aVal || "0").replace(/[^0-9.-]+/g, "")) || 0;
    }

    // Fallbacks based on tab source if header columns not found
    if (!vendor) {
      if (tabNameSource && tabNameSource.toLowerCase().includes("ruby")) {
        vendor = String(row[3] || row[2] || "").trim();
        entity = "Ruby's";
      } else if (tabNameSource && tabNameSource.toLowerCase().includes("ti")) {
        vendor = String(row[5] || row[4] || row[3] || "").trim();
        const entRaw = String(row[4] || "");
        if (entRaw.includes("Ruby")) entity = "Ruby's";
        else if (entRaw.includes("MSDx")) entity = "MSDx";
        else entity = "TI";
      } else if (tabNameSource && tabNameSource.toLowerCase().includes("msdx")) {
        vendor = String(row[3] || row[2] || "").trim();
        entity = "MSDx";
      } else {
        vendor = String(row[0] || row[1] || "").trim();
      }
    }

    if (!amount) {
      amount = typeof row[9] === "number" ? row[9] : parseFloat(String(row[9] || row[1] || row[2] || "0").replace(/[^0-9.-]+/g, "")) || 0;
    }

    if (dueCol !== -1 && row[dueCol]) {
      dueDate = parseDateVal(row[dueCol]) || dueDate;
    } else {
      dueDate = parseDateVal(row[8]) || parseDateVal(row[7]) || parseDateVal(row[11]) || parseDateVal("", row[0], row[1], row[19]) || dueDate;
    }

    // Status Detection
    const statusVal = statusCol !== -1 && row[statusCol] ? String(row[statusCol]).toLowerCase() : "";
    const extra1 = String(row[11] || "");
    const extra2 = String(row[12] || "");
    const isOnHold = row[18] === true || String(row[18]).toLowerCase() === "true" || row[22] === true || String(row[22]).toLowerCase() === "true";
    
    const combined = `${statusVal} ${extra1} ${extra2}`.toLowerCase().trim();
    if (isOnHold || combined.includes("hold")) {
      status = "hold";
    } else if (combined.includes("unpaid") || combined.includes("pending") || combined.includes("open") || combined === "false") {
      status = "unpaid";
    } else if (
      /\bpaid\b/i.test(combined) ||
      /\bcleared\b/i.test(combined) ||
      combined.includes("paid via") ||
      combined.includes("paid using")
    ) {
      status = "paid";
    } else {
      status = "unpaid";
    }

    // Extract sub-company name if present
    const companyVal = String(row[4] || "").trim();
    const company = companyVal || (tabNameSource && tabNameSource.includes("TI") ? "TI" : undefined);

    // Extract remarks/notes — only human-written text, no URLs or status metadata
    let remarks = "";
    const isUrl = (v: string) => /^https?:\/\//i.test(v) || /^mailto:/i.test(v);
    const isMetadata = (v: string) => {
      const lc = v.toLowerCase();
      return ["true", "false", "check", "online", "paid", "unpaid", "hold", "qbo",
        "recurring", "non-recurring", "manual", "auto-debit", "fixed", "estimate"].includes(lc);
    };
    if (remarksCol !== -1 && row[remarksCol]) {
      const raw = String(row[remarksCol]).trim();
      if (!isUrl(raw) && !isMetadata(raw)) remarks = raw;
    }
    if (!remarks) {
      // Collect only human-readable non-URL text from supplementary columns
      const remarksParts = [row[14], row[15], row[16], row[17]]
        .map((v) => String(v || "").trim())
        .filter((v) => v && v.length > 2 && !isUrl(v) && !isMetadata(v));
      remarks = remarksParts.join(" | ");
    }

    // Clean up vendor string
    vendor = vendor.replace(/^["']|["']$/g, "").replace(/^\d+\s*-\s*/, "").trim();
    if (
      !vendor ||
      vendor.length > 90 ||
      vendor.toLowerCase() === "vendor" ||
      vendor.toLowerCase() === "payee" ||
      vendor.toLowerCase() === "company" ||
      vendor.toLowerCase() === "total" ||
      vendor.toLowerCase().includes("total paid")
    ) {
      return;
    }

    // inQBO — Layout A: col 13; Layout B (TI): col 15; fall back to col 14
    const inQBOVal = String(row[13] || row[15] || row[14] || "").toLowerCase();
    const inQBO = inQBOVal === "true" || inQBOVal === "qbo";

    // Payment method (Check/Online/Cash) — Layout B col 12 (payvia); Layout A has none
    const payviaRaw = String(row[12] || "").trim();
    const methodMap: Record<string, string> = {
      "check": "Check", "online": "Online", "cash": "Cash", "wire": "Wire",
      "ach": "ACH", "credit card": "Credit Card", "autodebit": "Autodebit",
      "auto-debit": "Autodebit", "auto debit": "Autodebit"
    };
    const method = methodMap[payviaRaw.toLowerCase()] || "Check";

    // paytype col 17 (Layout A) or col 19 (TI) — Auto-Debit vs Manual
    const paytypeRaw = String(row[17] || row[19] || "").trim().toLowerCase();
    const paymentType: "Auto-Debit" | "Manual" = paytypeRaw.includes("auto") ? "Auto-Debit" : "Manual";

    // Paid date — Layout A col 11, Layout B col 10
    const paidDate = status === "paid"
      ? (parseDateVal(row[11]) || parseDateVal(row[10]) || undefined)
      : undefined;

    // col F (5) = category for Layout A (Ruby's/MSDx); col H (7) = invoice date for all layouts
    const categoryVal = String(row[5] || "").trim();
    const invoiceDateVal = String(row[7] || "").trim();

    bills.push({
      id: `ap-gs-${idx + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      vendor,
      entity,
      company,
      amount,
      dueDate,
      paidDate,
      method: method as any,
      paymentType,
      status,
      inQBO,
      bucket: computeBucket(dueDate, status),
      sheet: tabNameSource || `${entity} Bills`,
      row: startIdx + idx + 1,
      invoiceNo,
      remarks,
      category: categoryVal || undefined,
      invoiceDate: invoiceDateVal || undefined,
    });
  });

  return bills;
};

export const parseBankSheetRows = (rows: any[][]): BankAccount[] => {
  if (!rows || rows.length <= 1) return [];
  const headers = rows[0].map((h) => String(h || "").toLowerCase().trim());

  let entityIdx = headers.findIndex((h) => /entity|company|business/i.test(h));
  let bankIdx = headers.findIndex((h) => /bank|institution|lender|name/i.test(h));
  let typeIdx = headers.findIndex((h) => /type|account_type|category/i.test(h));
  let acctIdx = headers.findIndex((h) => /acct|account|number|#|last4|last_4/i.test(h));
  let balIdx = headers.findIndex((h) => /bal|balance|amount|current_balance|\$/i.test(h));
  let asOfIdx = headers.findIndex((h) => /as_of|updated|as_of_date|date/i.test(h));

  if (bankIdx === -1) bankIdx = 0;
  if (typeIdx === -1) typeIdx = bankIdx === 0 ? 1 : 0;
  if (acctIdx === -1) acctIdx = 2;
  if (balIdx === -1) balIdx = 3;
  if (asOfIdx === -1) asOfIdx = 4;

  const accounts: BankAccount[] = [];
  const dataRows = rows.slice(1);

  dataRows.forEach((row, idx) => {
    if (!row || row.length === 0 || row.every((c) => !c || String(c).trim() === "")) return;

    const entity = normalizeEntityName(entityIdx !== -1 ? String(row[entityIdx]) : undefined, "Ruby's");
    const bank = String(row[bankIdx] || "Bank");
    const type = String(row[typeIdx] || "Checking");
    const acct = String(row[acctIdx] || "...0000");
    const balStr = String(row[balIdx] || "0").replace(/[^0-9.-]+/g, "");
    const balance = parseFloat(balStr) || 0;
    const asOf = row[asOfIdx] || new Date().toISOString().split("T")[0];

    accounts.push({
      id: `b-gs-${idx + 1}-${Date.now()}`,
      entity,
      bank,
      type,
      acct,
      balance,
      asOf,
      status: "Active",
      trend: "up",
      row: idx + 2 // 1-indexed within fetched range (row 1 = header, row 2 = first data row)
    });
  });

  return accounts;
};

export const parseLoanSheetRows = (rows: any[][]): Loan[] => {
  if (!rows || rows.length <= 1) return [];
  const headers = rows[0].map((h) => String(h || "").toLowerCase().trim());

  let entityIdx = headers.findIndex((h) => /entity|company/i.test(h));
  let lenderIdx = headers.findIndex((h) => /lender|bank|institution|creditor|card|issuer|name/i.test(h));
  let purposeIdx = headers.findIndex((h) => /purpose|facility|description|note|account/i.test(h));
  let prinIdx = headers.findIndex((h) => /principal|original|initial|limit|credit_limit/i.test(h));
  let outIdx = headers.findIndex((h) => /outstanding|balance|remaining|current|\$/i.test(h));
  let mIdx = headers.findIndex((h) => /monthly|payment|installment|min_payment/i.test(h));
  let nextPayIdx = headers.findIndex((h) => /next|due|payment_date|due_date/i.test(h));
  let maturityIdx = headers.findIndex((h) => /maturity|term|end_date/i.test(h));

  if (lenderIdx === -1) lenderIdx = 0;
  if (purposeIdx === -1) purposeIdx = 1;
  if (prinIdx === -1) prinIdx = 2;
  if (outIdx === -1) outIdx = 3;
  if (mIdx === -1) mIdx = 4;

  const loans: Loan[] = [];
  const dataRows = rows.slice(1);

  dataRows.forEach((row, idx) => {
    if (!row || row.length === 0 || row.every((c) => !c || String(c).trim() === "")) return;
    
    const entity = normalizeEntityName(entityIdx !== -1 ? String(row[entityIdx]) : undefined, "Ruby's");
    const lender = String(row[lenderIdx] || "Lender / Card");
    const purpose = String(row[purposeIdx] || "Facility");
    const prinStr = String(row[prinIdx] || "0").replace(/[^0-9.-]+/g, "");
    const outStr = String(row[outIdx] || "0").replace(/[^0-9.-]+/g, "");
    const mStr = String(row[mIdx] || "0").replace(/[^0-9.-]+/g, "");
    const nextPay = nextPayIdx !== -1 && row[nextPayIdx] ? String(row[nextPayIdx]) : new Date().toISOString().split("T")[0];
    const maturity = maturityIdx !== -1 && row[maturityIdx] ? String(row[maturityIdx]) : "2029-12";

    const prinVal = parseFloat(prinStr) || 0;
    const outVal = parseFloat(outStr) || 0;
    const mVal = parseFloat(mStr) || 0;
    // Sheet currently provides monthly payment amount in column 3/4, without principal/outstanding
    const monthly = mVal || outVal || prinVal || 0;

    loans.push({
      id: `l-gs-${idx + 1}-${Date.now()}`,
      entity,
      lender,
      purpose,
      principal: 0,
      outstanding: 0,
      monthly,
      nextPay,
      maturity,
      status: "Active",
      row: idx + 2 // 1-indexed within fetched range (row 1 = header, row 2 = first data row)
    });
  });

  return loans;
};

export const parseARSheetRows = (rows: any[][]): ARItem[] => {
  if (!rows || rows.length <= 1) return [];
  const rawHeaders = rows[0].map((h) => String(h || "").toLowerCase().trim());

  // Check if sheet uses horizontal month columns (e.g. Mar-Amount, Apr-Amount, etc.)
  const monthNamesMap: Record<string, string> = {
    mar: "March", apr: "April", may: "May", jun: "June", jul: "July",
    aug: "August", sep: "September", oct: "October", nov: "November", dec: "December",
    jan: "January", feb: "February"
  };

  const monthConfigs: {
    monthName: string;
    amtIdx: number;
    dueIdx: number;
    remIdx: number;
    invIdx: number;
    appIdx: number;
    senIdx: number;
    payIdx: number;
  }[] = [];

  Object.entries(monthNamesMap).forEach(([shortName, fullName]) => {
    const amtIdx = rawHeaders.findIndex((h) => h.startsWith(shortName) && h.includes("amount"));
    if (amtIdx !== -1) {
      const dueIdx = rawHeaders.findIndex((h) => h.startsWith(shortName) && (h.includes("due") || h.includes("date")));
      const remIdx = rawHeaders.findIndex((h) => h.startsWith(shortName) && (h.includes("remark") || h.includes("note")));
      const invIdx = rawHeaders.findIndex((h) => h.startsWith(shortName) && h.includes("invoice"));
      const appIdx = rawHeaders.findIndex((h) => h.startsWith(shortName) && h.includes("approval"));
      const senIdx = rawHeaders.findIndex((h) => h.startsWith(shortName) && h.includes("sent"));
      const payIdx = rawHeaders.findIndex((h) => h.startsWith(shortName) && h.includes("payment"));

      monthConfigs.push({
        monthName: fullName,
        amtIdx,
        dueIdx,
        remIdx,
        invIdx,
        appIdx,
        senIdx,
        payIdx
      });
    }
  });

  const items: ARItem[] = [];
  const dataRows = rows.slice(1);

  if (monthConfigs.length > 0) {
    dataRows.forEach((row, idx) => {
      if (!row || row.length === 0 || row.every((c) => !c || String(c).trim() === "")) return;

      const entity = normalizeEntityName(String(row[0] || ""), "Ruby's");
      const customer = String(row[1] || "").trim();
      const description = String(row[2] || "").trim();
      if (!customer) return;

      monthConfigs.forEach((mCfg) => {
        const amtVal = row[mCfg.amtIdx];
        const amt = typeof amtVal === "number" ? amtVal : parseFloat(String(amtVal || "0").replace(/[^0-9.-]+/g, "")) || 0;
        const remarksVal = String(mCfg.remIdx !== -1 ? row[mCfg.remIdx] || "" : "");
        if (remarksVal === "__skipped__" || (amt <= 0 && (!remarksVal || remarksVal === "null"))) return;

        const rawDue = mCfg.dueIdx !== -1 && row[mCfg.dueIdx] ? row[mCfg.dueIdx] : row[4] || "End of Month";
        const invVal = mCfg.invIdx !== -1 ? row[mCfg.invIdx] : true;
        const appVal = mCfg.appIdx !== -1 ? row[mCfg.appIdx] : true;
        const senVal = mCfg.senIdx !== -1 ? row[mCfg.senIdx] : true;
        const payVal = mCfg.payIdx !== -1 ? row[mCfg.payIdx] : false;

        const isTrue = (val: any) => val === true || String(val).toLowerCase() === "true" || val === 1;

        items.push({
          id: `ar-gs-${idx + 1}-${mCfg.monthName}`,
          entity,
          customer,
          description,
          amount: amt,
          dueDate: String(rawDue),
          month: mCfg.monthName,
          occurrence: String(row[6] || "Monthly"),
          invoice: isTrue(invVal) || amt > 0,
          approval: isTrue(appVal) || amt > 0,
          sent: isTrue(senVal) || amt > 0,
          payment: isTrue(payVal),
          remarks: remarksVal !== "null" ? remarksVal : ""
        });
      });
    });

    return items;
  }

  // Fallback vertical format
  let entityIdx = rawHeaders.findIndex((h) => /entity|company/i.test(h));
  let customerIdx = rawHeaders.findIndex((h) => /customer|client|debtor|name/i.test(h));
  let descIdx = rawHeaders.findIndex((h) => /desc|description|invoice|item/i.test(h));
  let amtIdx = rawHeaders.findIndex((h) => /amt|amount|total|\$/i.test(h));
  let dueDateIdx = rawHeaders.findIndex((h) => /due|date/i.test(h));
  let monthIdx = rawHeaders.findIndex((h) => /month|period/i.test(h));
  let occIdx = rawHeaders.findIndex((h) => /occurrence|frequency|type/i.test(h));

  let invoiceIdx = rawHeaders.findIndex((h) => /invoice|created/i.test(h));
  let approvalIdx = rawHeaders.findIndex((h) => /approval|approved/i.test(h));
  let sentIdx = rawHeaders.findIndex((h) => /sent|delivered/i.test(h));
  let paymentIdx = rawHeaders.findIndex((h) => /payment|received|paid/i.test(h));
  let remarksIdx = rawHeaders.findIndex((h) => /remark|notes|comment/i.test(h));

  if (customerIdx === -1) customerIdx = 0;
  if (descIdx === -1) descIdx = 1;
  if (amtIdx === -1) amtIdx = 2;
  if (dueDateIdx === -1) dueDateIdx = 3;
  if (monthIdx === -1) monthIdx = 4;
  if (occIdx === -1) occIdx = 5;

  dataRows.forEach((row, idx) => {
    if (!row || row.length === 0 || row.every((c) => !c || String(c).trim() === "")) return;

    const entity = normalizeEntityName(entityIdx !== -1 ? String(row[entityIdx]) : undefined, "Ruby's");
    const customer = String(row[customerIdx] || "Customer");
    const description = String(row[descIdx] || "Invoice");
    const amtStr = String(row[amtIdx] || "0").replace(/[^0-9.-]+/g, "");
    const dueDate = dueDateIdx !== -1 && row[dueDateIdx] ? String(row[dueDateIdx]) : new Date().toISOString().split("T")[0];
    const month = monthIdx !== -1 && row[monthIdx] ? String(row[monthIdx]) : "July";
    const occurrence = occIdx !== -1 && row[occIdx] ? String(row[occIdx]) : "Monthly";

    const getBool = (colIdx: number, defaultCol: number) => {
      const cell = row[colIdx !== -1 ? colIdx : defaultCol];
      if (cell === undefined || cell === null) return false;
      const str = String(cell).toLowerCase().trim();
      return str === "true" || str === "yes" || str === "1" || cell === true || cell === 1;
    };

    const invoice = getBool(invoiceIdx, 7);
    const approval = getBool(approvalIdx, 8);
    const sent = getBool(sentIdx, 9);
    const payment = getBool(paymentIdx, 10);
    const remarks = remarksIdx !== -1 && row[remarksIdx] ? String(row[remarksIdx]) : String(row[11] || "");

    items.push({
      id: `ar-gs-${idx + 1}-${Date.now()}`,
      entity,
      customer,
      description,
      amount: parseFloat(amtStr) || 0,
      dueDate,
      month,
      occurrence,
      invoice,
      approval,
      sent,
      payment,
      remarks,
      row: idx + 2 // 1-indexed within fetched range (row 1 = header, row 2 = first data row)
    });
  });

  return items;
};

export const parseStatementSheetRows = (rows: any[][]): BankStatement[] => {
  if (!rows || rows.length === 0) return [];

  // Find header row in top 5 rows
  let headerRowIdx = -1;
  let periodIdx = -1;
  let entityIdx = -1;
  let bankIdx = -1;
  let occIdx = -1;
  let stmtDateIdx = -1;
  let reqDateIdx = -1;
  let dlIdx = -1;
  let dlAtIdx = -1;
  let remarksIdx = -1;

  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const rowStr = rows[r].map((h) => String(h || "").toLowerCase().trim());
    const bIdx = rowStr.findIndex((h) => /bank|institution|account_name/i.test(h));
    const eIdx = rowStr.findIndex((h) => /entity|company|business/i.test(h));
    if (bIdx !== -1 || eIdx !== -1) {
      headerRowIdx = r;
      bankIdx = bIdx;
      entityIdx = eIdx;
      periodIdx = rowStr.findIndex((h) => /period|month|cycle/i.test(h));
      occIdx = rowStr.findIndex((h) => /occurrence|frequency/i.test(h));
      stmtDateIdx = rowStr.findIndex((h) => /statement_date|stmt_date|as_of|date/i.test(h));
      reqDateIdx = rowStr.findIndex((h) => /request|requested/i.test(h));
      dlIdx = rowStr.findIndex((h) => /downloaded|status|done|complete/i.test(h));
      dlAtIdx = rowStr.findIndex((h) => /downloaded_at|time/i.test(h));
      remarksIdx = rowStr.findIndex((h) => /remarks|notes|comments/i.test(h));
      break;
    }
  }

  const startIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
  const dataRows = rows.slice(startIdx);
  const statements: BankStatement[] = [];

  dataRows.forEach((row, idx) => {
    if (!row || row.length === 0 || row.every((c) => !c || String(c).trim() === "")) return;

    let entity: EntityName = "Ruby's";
    let bankName = "";
    let occurrence = "Monthly";
    let remarks = "";
    let stmtDate = "";
    let reqDate = "";
    let downloaded = false;
    let downloadedAt = "";
    let period = "";

    if (periodIdx !== -1 && row[periodIdx]) period = String(row[periodIdx]).trim();
    if (entityIdx !== -1 && row[entityIdx]) entity = normalizeEntityName(String(row[entityIdx]), "Ruby's");
    if (bankIdx !== -1 && row[bankIdx]) bankName = String(row[bankIdx]).trim();
    if (occIdx !== -1 && row[occIdx]) occurrence = String(row[occIdx]).trim();
    if (stmtDateIdx !== -1 && row[stmtDateIdx]) stmtDate = parseDateVal(row[stmtDateIdx]);
    if (reqDateIdx !== -1 && row[reqDateIdx]) reqDate = parseDateVal(row[reqDateIdx]);
    if (dlIdx !== -1 && row[dlIdx] !== undefined) {
      const dlRaw = String(row[dlIdx]).toLowerCase();
      downloaded = dlRaw.includes("true") || dlRaw.includes("yes") || dlRaw.includes("done") || row[dlIdx] === 1 || row[dlIdx] === true;
    }
    if (dlAtIdx !== -1 && row[dlAtIdx]) downloadedAt = parseDateVal(row[dlAtIdx]);
    if (remarksIdx !== -1 && row[remarksIdx]) remarks = String(row[remarksIdx]).trim();

    // Secondary scan across row cells if required fields missing
    row.forEach((cellVal) => {
      const val = String(cellVal || "").trim();
      if (!val) return;

      if (!entity || entity === "TI") {
        if (val.includes("Ruby")) entity = "Ruby's";
        else if (val.includes("MSDx")) entity = "MSDx";
        else if (val.includes("Curcumin")) entity = "CurcuminPro";
      }

      if (val.startsWith("Date(") || /^\d{4}-\d{2}-\d{2}$/.test(val) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(val)) {
        const d = parseDateVal(val);
        if (!stmtDate) stmtDate = d;
        else if (!reqDate) reqDate = d;
      } else if (val === "true" || cellVal === true) {
        downloaded = true;
      }
    });

    if (!bankName) {
      const candidate = row.find(
        (c) =>
          c &&
          typeof c === "string" &&
          c.trim().length >= 3 &&
          !c.toLowerCase().includes("ruby") &&
          !c.toLowerCase().includes("msdx") &&
          !c.toLowerCase().includes("monthly") &&
          !c.toLowerCase().includes("company") &&
          !c.toLowerCase().includes("bank name") &&
          !c.toLowerCase().includes("period") &&
          !c.startsWith("Date(")
      );
      bankName = candidate ? String(candidate).trim() : "Operating Account";
    }

    if (!period) {
      period = stmtDate ? stmtDate.slice(0, 7) : "2026-06";
    }

    if (bankName.toLowerCase().includes("bank name") || bankName.toLowerCase().includes("company")) return;

    statements.push({
      id: `st-gs-${idx + 1}-${Date.now()}`,
      period,
      entity,
      bankName,
      occurrence,
      statementDate: stmtDate || "2026-06-30",
      requestDate: reqDate || "2026-07-01",
      downloaded,
      downloadedAt,
      remarks,
      rowIndex: startIdx + idx + 1
    });
  });

  return statements;
};

// --- FORMATTERS (Portal Models -> Google Sheet Rows) ---

// Per-entity column map — sourced from APcode.gs LAYOUT A/B + CALcode.gs BILL_SHEETS:
//
//  Layout A (Ruby's bills, MSDx Bills):
//    yr:0  mo:1  day:2  vendor:3  cat:5  inv:6  idate:7  ddate:8  amt:9
//    instr/remarks:10  pdate(paid date):11  paid(status):12  inQBO:13
//    paytype(Auto-Debit/Manual):17  hold:17(Ruby's) / hold:18(MSDx)
//
//  Layout B (TI Bills):
//    yr:0  mo:1  day:2  co(company):4  vendor:5  inv:6  idate:7  ddate:8  amt:9
//    pdate(paid date):10  payvia(method):12  paid(status):13
//    remarks:14  inQBO:15  paytype:19  hold:22(CALcode)
//
//  Data start rows (CALcode):  Ruby's=5  TI=7  MSDx=6

interface APColMap {
  vendor: number;
  company: number | null;
  invoiceNo: number;
  invoiceDateCol: number;    // idate — invoice date column
  categoryCol: number | null;    // cat — null means entity has no separate category column
  descriptionCol: number | null; // description (col E for Ruby's/MSDx) — null if not in sheet
  dueDate: number;
  amount: number;
  paidDateCol: number;       // column that receives the paid date (pdate)
  methodCol: number | null;  // payment via (Check/Online/Cash) — null if not in sheet
  paytypeCol: number;        // Auto-Debit vs Manual
  status: number;
  inQBO: number;
  onHold: number;
  remarksCol: number;
  payInstCol: number;
  status1Col: number;
  totalCols: number;
  dataRange: string;
}

const AP_COL_MAPS: Record<string, APColMap> = {
  "Ruby's": {
    vendor: 3, company: null, invoiceNo: 6, invoiceDateCol: 7, categoryCol: 5, descriptionCol: 4,
    dueDate: 8, amount: 9,
    paidDateCol: 11, methodCol: null, paytypeCol: 17,
    status: 12, inQBO: 13, onHold: 18,  // col S = On Hold
    remarksCol: 10, payInstCol: 14, status1Col: 11, totalCols: 19,
    dataRange: "'Ruby''s Bills'!A5:S1504"   // 1500 data rows starting row 5
  },
  "TI": {
    vendor: 5, company: 4, invoiceNo: 6, invoiceDateCol: 7, categoryCol: null, descriptionCol: null,
    dueDate: 8, amount: 9,
    paidDateCol: 10, methodCol: 12, paytypeCol: 19,
    status: 13, inQBO: 15, onHold: 22,  // holdCol:22 per CALcode
    remarksCol: 14, payInstCol: 16, status1Col: 17, totalCols: 23,
    dataRange: "'TI Bills'!A7:W1506"    // 1500 data rows starting row 7
  },
  "MSDx": {
    vendor: 3, company: null, invoiceNo: 6, invoiceDateCol: 7, categoryCol: 5, descriptionCol: 4,
    dueDate: 8, amount: 9,
    paidDateCol: 11, methodCol: null, paytypeCol: 17,
    status: 12, inQBO: 13, onHold: 18,  // holdCol:18 per CALcode
    remarksCol: 10, payInstCol: 14, status1Col: 11, totalCols: 19,
    dataRange: "'MSDx Bills'!A6:S1505"  // 1500 data rows starting row 6
  }
};

// Returns the column map for a known entity, or Layout A defaults for any new entity
export const getAPColMap = (entity: string): APColMap => {
  if (AP_COL_MAPS[entity]) return AP_COL_MAPS[entity];
  // Unknown entity: Layout A (Ruby's columns), tab name derived from entity name
  const sheetTitle = `${entity} Bills`;
  const quoted = /[ ']/.test(sheetTitle) ? `'${sheetTitle.replace(/'/g, "''")}'` : sheetTitle;
  return { ...AP_COL_MAPS["Ruby's"], dataRange: `${quoted}!A5:S1504` };
};

// Fetch the list of "* Bills" tab names from the spreadsheet (for dynamic entity detection)
export const fetchAvailableAPTabs = async (
  spreadsheetId: string,
  accessToken: string
): Promise<string[]> => {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) return [];
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.sheets || [])
      .map((s: any) => (s.properties?.title || "") as string)
      .filter((t: string) => /\bbills\b/i.test(t))
      .map((t: string) => t.replace(/\s*bills\s*$/i, "").trim())
      .filter((t: string) => t.length > 0);
  } catch {
    return [];
  }
};

function resolveRemarksCol(
  raw: string,
  map: APColMap
): { col: number; text: string } {
  const m = raw.match(/^\[([^\]]+)\]\s*([\s\S]*)/);
  if (!m) return { col: map.remarksCol, text: raw };
  switch (m[1]) {
    case "Payment Instructions": return { col: map.payInstCol, text: m[2] };
    case "Status 1":             return { col: map.status1Col, text: m[2] };
    default:                     return { col: map.remarksCol, text: m[2] };
  }
}

// Build a single formatted row array for one AP bill (shared by per-item and full-tab writers)
export const buildAPBillRow = (b: APBill, entity: string): any[] => {
  const map = getAPColMap(entity);
  const row: any[] = new Array(map.totalCols).fill("");

  const dueParts = b.dueDate ? b.dueDate.split("-") : [];
  row[0] = dueParts[0] || "";
  row[1] = dueParts[1] ? String(parseInt(dueParts[1])) : "";
  // col C (index 2) = Wk# is formula-driven — do not write

  row[map.vendor]      = b.vendor;
  if (map.company !== null) row[map.company] = b.company || "";
  if (map.descriptionCol !== null) row[map.descriptionCol] = b.description || "";
  if (map.categoryCol !== null) row[map.categoryCol] = b.category || "";
  if (b.invoiceNo) row[map.invoiceNo] = b.invoiceNo;       // skip col G when empty (writeSingleAPBill handles split)
  if (b.invoiceDate) row[map.invoiceDateCol] = b.invoiceDate; // skip col H when empty to preserve existing sheet value
  row[map.dueDate]        = b.dueDate;
  row[map.amount]         = b.amount;
  row[map.paidDateCol]    = b.paidDate || "";
  if (map.methodCol !== null) row[map.methodCol] = b.method || "";
  // paytypeCol (Manual/Aut.) is formula-driven in the sheet — do not write
  // Status col: "Paid" when paid; blank for unpaid/hold (never write "UNPAID" — keep sheet clean)
  if (b.status === "paid") {
    row[map.status] = "Paid";
  }
  // unpaid → status col stays blank; hold → status col stays blank (on-hold col set below)
  if (b.inQBO) row[map.inQBO] = "TRUE";
  if (b.status === "hold") row[map.onHold] = "on hold";

  // Remarks routing per layout
  if (entity === "TI") {
    // Layout B: b.remarks → col O (remarksCol=14); method/payVia already written above via methodCol
    const rem = (b.remarks || b.notes || "").replace(/^\[[^\]]+\]\s*/, "").trim();
    if (rem) row[map.remarksCol] = rem;
  } else {
    // Layout A (Ruby's/MSDx): paymentInstructions → col K (remarksCol=10); status1 → col M (status1Col)
    const instr = (b.paymentInstructions || b.remarks || b.notes || "").replace(/^\[[^\]]+\]\s*/, "").trim();
    if (instr) row[map.remarksCol] = instr;
    if (b.status1) row[map.status1Col] = b.status1;
  }
  return row;
};

// Compute the exact single-row range for a bill (e.g. "'Ruby''s Bills'!A5:S5")
// Returns null if the bill has no sheet row number yet (newly added, not in sheet)
export const getAPBillSingleRowRange = (
  bill: APBill,
  entity: string
): string | null => {
  if (!bill.row || bill.row < 1) return null;
  const map = getAPColMap(entity);
  const tabPart    = map.dataRange.split("!")[0];
  const rangeBody  = map.dataRange.split("!")[1];            // e.g. "A5:S1504"
  const dataStart  = parseInt(rangeBody.split(":")[0].replace(/\D/g, "")); // 5
  const sheetRow   = dataStart + bill.row - 1;
  const colLetter  = String.fromCharCode(64 + map.totalCols); // 19→S, 23→W
  return `${tabPart}!A${sheetRow}:${colLetter}${sheetRow}`;
};

// Write ONE bill to its exact sheet row — touches only that row, nothing else
export const writeSingleAPBill = async (
  bill: APBill,
  entity: string,
  spreadsheetId: string,
  accessToken: string
): Promise<void> => {
  const range = getAPBillSingleRowRange(bill, entity);
  if (!range) throw new Error(`Bill "${bill.vendor}" has no sheet row — use appendAPBill for new bills`);
  const map = getAPColMap(entity);
  const fullRow = buildAPBillRow(bill, entity);

  // Skip col G (invoiceNo) and/or col H (invoiceDate) when empty to preserve existing sheet values.
  // G=index 6, H=index 7 — both are optional; split the write around whichever are blank.
  const skipG = !fullRow[map.invoiceNo];
  const skipH = !fullRow[map.invoiceDateCol];
  const tabPart = range.split("!")[0];
  const rowNum  = range.match(/\d+/)?.[0];
  const colEnd  = String.fromCharCode(64 + map.totalCols); // S (Ruby's/MSDx) or W (TI)

  if (skipG && skipH) {
    // Skip both G and H → write A-F, then I-end
    await Promise.all([
      updateSheetValues(spreadsheetId, `${tabPart}!A${rowNum}:F${rowNum}`, [fullRow.slice(0, 6)], accessToken),
      updateSheetValues(spreadsheetId, `${tabPart}!I${rowNum}:${colEnd}${rowNum}`, [fullRow.slice(8)], accessToken),
    ]);
  } else if (skipG) {
    // Skip G only → write A-F, then H-end
    await Promise.all([
      updateSheetValues(spreadsheetId, `${tabPart}!A${rowNum}:F${rowNum}`, [fullRow.slice(0, 6)], accessToken),
      updateSheetValues(spreadsheetId, `${tabPart}!H${rowNum}:${colEnd}${rowNum}`, [fullRow.slice(7)], accessToken),
    ]);
  } else if (skipH) {
    // Skip H only → write A-G, then I-end
    await Promise.all([
      updateSheetValues(spreadsheetId, `${tabPart}!A${rowNum}:G${rowNum}`, [fullRow.slice(0, 7)], accessToken),
      updateSheetValues(spreadsheetId, `${tabPart}!I${rowNum}:${colEnd}${rowNum}`, [fullRow.slice(8)], accessToken),
    ]);
  } else {
    await updateSheetValues(spreadsheetId, range, [fullRow], accessToken);
  }
};

// Append a NEW bill as a row right after the last row with vendor data
export const appendAPBill = async (
  bill: APBill,
  entity: string,
  spreadsheetId: string,
  accessToken: string
): Promise<void> => {
  const map = getAPColMap(entity);
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) throw new Error("Invalid spreadsheet ID");

  const tabName = map.dataRange.split("!")[0]; // e.g. "'Ruby''s Bills'"
  const dataStart = parseInt(map.dataRange.split("!")[1].replace(/^[A-Z]+/, "")); // e.g. 5
  const vendorCol = String.fromCharCode(65 + map.vendor); // e.g. D
  const lastDataCol = String.fromCharCode(64 + map.totalCols); // e.g. S

  // Read only the vendor column to find the last row that actually has bill data
  const vendorRange = `${tabName}!${vendorCol}${dataStart}:${vendorCol}`;
  const readRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(vendorRange)}?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!readRes.ok) throw new Error(`Failed to read vendor column: ${readRes.status}`);
  const readData = await readRes.json();
  const vendorRows: any[][] = readData.values || [];
  const nextRow = dataStart + vendorRows.length; // first empty row after last bill

  // Write the new bill directly to that row
  const writeRange = `${tabName}!A${nextRow}:${lastDataCol}${nextRow}`;
  await updateSheetValues(spreadsheetId, writeRange, [buildAPBillRow(bill, entity)], accessToken);

  // Add checkbox validation to the inQBO cell of the new row
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) return;
  const meta = await metaRes.json();
  const tabTitle = tabName.replace(/^'|'$/g, "").replace(/''/g, "'");
  const sheetMeta = (meta.sheets || []).find((s: any) => s.properties?.title === tabTitle);
  if (!sheetMeta) return;

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        setDataValidation: {
          range: { sheetId: sheetMeta.properties.sheetId, startRowIndex: nextRow - 1, endRowIndex: nextRow, startColumnIndex: map.inQBO, endColumnIndex: map.inQBO + 1 },
          rule: { condition: { type: "BOOLEAN" }, strict: true, showCustomUi: true }
        }
      }]
    })
  });
};

// Delete a bill's row from the sheet (removes the row, shifting rows above down)
export const clearSingleAPBill = async (
  bill: APBill,
  entity: string,
  spreadsheetId: string,
  accessToken: string
): Promise<void> => {
  if (!bill.row || bill.row < 1) return; // new bill that was never synced
  const map = getAPColMap(entity);
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) return;

  const dataStart = parseInt(map.dataRange.split("!")[1].replace(/^[A-Z]+/, ""));
  const sheetRowNumber = dataStart + bill.row - 1; // 1-indexed sheet row
  const rowIndex = sheetRowNumber - 1;              // 0-indexed for API

  // Fetch sheet metadata to get the numeric sheetId for the tab
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) {
    // Fallback: blank the row content
    const range = getAPBillSingleRowRange(bill, entity);
    if (range) await updateSheetValues(spreadsheetId, range, [new Array(map.totalCols).fill("")], accessToken);
    return;
  }
  const meta = await metaRes.json();
  const tabTitle = map.dataRange.split("!")[0].replace(/^'|'$/g, "").replace(/''/g, "'");
  const sheetMeta = (meta.sheets || []).find((s: any) => s.properties?.title === tabTitle);
  if (!sheetMeta) {
    const range = getAPBillSingleRowRange(bill, entity);
    if (range) await updateSheetValues(spreadsheetId, range, [new Array(map.totalCols).fill("")], accessToken);
    return;
  }

  const deleteRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetMeta.properties.sheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      })
    }
  );
  if (!deleteRes.ok) {
    const errBody = await deleteRes.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `Delete row failed (${deleteRes.status})`);
  }
};

// --- Generic per-item row helper for non-AP modules ---
// Parses a range string like "'Sheet'!A2:L500" or "Sheet1!A1:J100"
// and computes the targeted range for a single item (by its row within the fetched data).
// itemRowInRange: 1-indexed row number within the fetched range (e.g. row 1 = first row incl. header,
//                row 2 = first data row when header is at row 1).
export const computeSingleItemRange = (
  mappingRange: string,
  itemRowInRange: number,
  numCols: number
): string | null => {
  if (!mappingRange || itemRowInRange < 1) return null;
  // Extract tab part and cell range (handles both plain and quoted tab names)
  const bangIdx = mappingRange.indexOf("!");
  if (bangIdx === -1) return null;
  const tabPart = mappingRange.slice(0, bangIdx);
  const cellRange = mappingRange.slice(bangIdx + 1); // e.g. "A2:L500"
  const startMatch = cellRange.match(/^([A-Za-z]+)(\d+)/);
  if (!startMatch) return null;
  const rangeStartRow = parseInt(startMatch[2], 10);
  const absoluteRow = rangeStartRow + itemRowInRange - 1;
  const endColLetter = String.fromCharCode(64 + numCols); // 1→A, 12→L, 9→I
  return `${tabPart}!A${absoluteRow}:${endColLetter}${absoluteRow}`;
};

// Write a single bank account to its exact sheet row (only touches that row).
// mappingRange is from the user's SheetMappingConfig (e.g. "'Banks'!A1:D100").
export const writeSingleBankAccount = async (
  account: BankAccount,
  mappingRange: string,
  spreadsheetId: string,
  accessToken: string
): Promise<void> => {
  if (!account.row) return;
  const row: any[] = new Array(4).fill("");
  row[0] = account.bank;
  row[1] = account.balance;
  row[3] = account.asOf;
  const range = computeSingleItemRange(mappingRange, account.row, 4);
  if (!range) return;
  await updateSheetValues(spreadsheetId, range, [row], accessToken);
};

// Append a new bank account row at the end of the sheet tab.
export const appendBankAccount = async (
  account: BankAccount,
  mappingRange: string,
  spreadsheetId: string,
  accessToken: string
): Promise<void> => {
  const bangIdx = mappingRange.indexOf("!");
  const tabPart = bangIdx !== -1 ? mappingRange.slice(0, bangIdx) : mappingRange;
  const row: any[] = new Array(4).fill("");
  row[0] = account.bank;
  row[1] = account.balance;
  row[3] = account.asOf;
  await appendSheetValues(spreadsheetId, `${tabPart}!A:A`, [row], accessToken);
};

// Write a single loan to its exact sheet row.
export const writeSingleLoan = async (
  loan: Loan,
  mappingRange: string,
  spreadsheetId: string,
  accessToken: string
): Promise<void> => {
  if (!loan.row) return;
  const cleanLender = loan.lender.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const row: any[] = new Array(5).fill("");
  row[1] = loan.entity;
  row[2] = cleanLender;
  row[3] = loan.monthly;
  row[4] = loan.nextPay;
  const range = computeSingleItemRange(mappingRange, loan.row, 5);
  if (!range) return;
  await updateSheetValues(spreadsheetId, range, [row], accessToken);
};

// Append a new loan row at the end of the sheet tab.
export const appendLoan = async (
  loan: Loan,
  mappingRange: string,
  spreadsheetId: string,
  accessToken: string
): Promise<void> => {
  const bangIdx = mappingRange.indexOf("!");
  const tabPart = bangIdx !== -1 ? mappingRange.slice(0, bangIdx) : mappingRange;
  const cleanLender = loan.lender.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const row: any[] = new Array(5).fill("");
  row[1] = loan.entity;
  row[2] = cleanLender;
  row[3] = loan.monthly;
  row[4] = loan.nextPay;
  await appendSheetValues(spreadsheetId, `${tabPart}!A:A`, [row], accessToken);
};

// 0-indexed column number → A1-notation column letter (A=0, Z=25, AA=26, …)
const zeroIdxColLetter = (c: number): string => {
  let n = c + 1;
  let result = "";
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
};

// Column indices (0-based) for each month — generated from the same pattern as the fetcher.
const AR_MONTH_COLS: Record<string, { invCol: number; appCol: number; senCol: number; payCol: number; remCol: number }> = (() => {
  const names = ["March","April","May","June","July","August","September","October","November","December"];
  const map: Record<string, { invCol: number; appCol: number; senCol: number; payCol: number; remCol: number }> = {};
  map["March"] = { invCol: -1, appCol: -1, senCol: -1, payCol: -1, remCol: 12 };
  let prevAmt = 14;
  for (let i = 1; i < names.length; i++) {
    const b = prevAmt + 1;
    map[names[i]] = { invCol: b, appCol: b+2, senCol: b+4, payCol: b+6, remCol: b+8 };
    prevAmt = b + 10;
  }
  return map;
})();

// Write a single AR item back to its exact cells in the horizontal AR Dashboard Data sheet.
export const writeSingleARItem = async (
  item: ARItem,
  mappingRange: string,
  spreadsheetId: string,
  accessToken: string
): Promise<void> => {
  if (!item.row) return;
  const bangIdx = mappingRange.indexOf("!");
  const tabPart = bangIdx !== -1 ? mappingRange.slice(0, bangIdx) : "'AR Dashboard Data'";
  const mCfg = AR_MONTH_COLS[item.month];
  if (!mCfg) return;
  const sheetRow = item.row;
  const updates: Promise<any>[] = [];
  const writeCell = (colIdx: number, val: any) => {
    if (colIdx < 0) return;
    const cl = zeroIdxColLetter(colIdx);
    updates.push(updateSheetValues(spreadsheetId, `${tabPart}!${cl}${sheetRow}`, [[val]], accessToken));
  };
  writeCell(mCfg.invCol, item.invoice ? "TRUE" : "FALSE");
  writeCell(mCfg.appCol, item.approval ? "TRUE" : "FALSE");
  writeCell(mCfg.senCol, item.sent ? "TRUE" : "FALSE");
  writeCell(mCfg.payCol, item.payment ? "TRUE" : "FALSE");
  writeCell(mCfg.remCol, item.remarks || "");
  await Promise.all(updates);
};

// Append a new AR item row.
export const appendARItem = async (
  item: ARItem,
  mappingRange: string,
  spreadsheetId: string,
  accessToken: string
): Promise<void> => {
  const bangIdx = mappingRange.indexOf("!");
  const tabPart = bangIdx !== -1 ? mappingRange.slice(0, bangIdx) : mappingRange;
  const dataRow = [
    item.entity, item.customer, item.description, item.amount, item.dueDate,
    item.month, item.occurrence,
    item.invoice ? "TRUE" : "FALSE",
    item.approval ? "TRUE" : "FALSE",
    item.sent ? "TRUE" : "FALSE",
    item.payment ? "TRUE" : "FALSE",
    item.remarks
  ];
  await appendSheetValues(spreadsheetId, `${tabPart}!A:A`, [dataRow], accessToken);
};

// Write a single bank statement to its exact sheet row.
export const writeSingleStatement = async (
  statement: BankStatement,
  mappingRange: string,
  spreadsheetId: string,
  accessToken: string
): Promise<void> => {
  // BankStatement uses rowIndex (1-indexed within fetched range, including header at pos 0 of range)
  if (!statement.rowIndex) return;
  const parts = (statement.remarks || "").split(" - ");
  const cycleMonth = parts[0]?.trim() || "";
  const purpose = parts.slice(1).join(" - ").trim();
  const row: any[] = new Array(9).fill("");
  row[0] = cycleMonth;
  row[1] = statement.entity;
  row[2] = statement.bankName;
  row[3] = statement.occurrence;
  row[4] = purpose;
  row[5] = statement.period;
  row[6] = statement.downloadedAt || "";
  row[7] = statement.downloaded ? "TRUE" : "FALSE";
  row[8] = (statement as any).reconciledDate || "";
  const range = computeSingleItemRange(mappingRange, statement.rowIndex, 9);
  if (!range) return;
  await updateSheetValues(spreadsheetId, range, [row], accessToken);
};

// Append a new statement row.
export const appendStatement = async (
  statement: BankStatement,
  mappingRange: string,
  spreadsheetId: string,
  accessToken: string
): Promise<void> => {
  const bangIdx = mappingRange.indexOf("!");
  const tabPart = bangIdx !== -1 ? mappingRange.slice(0, bangIdx) : mappingRange;
  const parts = (statement.remarks || "").split(" - ");
  const cycleMonth = parts[0]?.trim() || "";
  const purpose = parts.slice(1).join(" - ").trim();
  const row: any[] = new Array(9).fill("");
  row[0] = cycleMonth;
  row[1] = statement.entity;
  row[2] = statement.bankName;
  row[3] = statement.occurrence;
  row[4] = purpose;
  row[5] = statement.period;
  row[6] = statement.downloadedAt || "";
  row[7] = statement.downloaded ? "TRUE" : "FALSE";
  row[8] = (statement as any).reconciledDate || "";
  await appendSheetValues(spreadsheetId, `${tabPart}!A:A`, [row], accessToken);
};

/**
 * Formats AP bills for a single entity tab into the correct sheet column layout.
 * Returns ONLY data rows (no header) — caller writes to the entity-specific range
 * that preserves the sheet's existing summary/header rows above.
 * Pads with blank rows up to MAX_DATA_ROWS to clear any stale data from prior syncs.
 * Use this only for a full-tab sync (DataSync page). For edits, use writeSingleAPBill.
 */
const MAX_AP_ROWS = 1500;

export const formatAPSheetRowsForTab = (
  bills: APBill[],
  entity: string
): any[][] => {
  const map = getAPColMap(entity);
  const dataRows: any[][] = bills.slice(0, MAX_AP_ROWS).map((b) => buildAPBillRow(b, entity));

  // Pad with blank rows so stale rows from a previous (larger) dataset are cleared
  const blank = new Array(map.totalCols).fill("");
  while (dataRows.length < MAX_AP_ROWS) dataRows.push([...blank]);

  return dataRows;
};

/** Returns the per-entity data range (for use in updateSheetValues). */
export const getAPTabRange = (entity: string): string =>
  getAPColMap(entity).dataRange;

export const formatBankSheetRows = (accounts: BankAccount[]): any[][] => {
  // Live reader (liveSheetsFetcher): col0=name, col1=balance, col2=yesterday, col3=asOf
  // No header row — reader filters rows by name content, not by row index.
  return accounts.map((a) => {
    const row: any[] = new Array(4).fill("");
    row[0] = a.bank;      // col 0: bank/account name
    row[1] = a.balance;   // col 1: current balance
                          // col 2: yesterday balance — not stored in portal model; leave blank
    row[3] = a.asOf;      // col 3: as-of date
    return row;
  });
};

export const formatLoanSheetRows = (loans: Loan[]): any[][] => {
  // Live reader (liveSheetsFetcher): col1=entity, col2=lender, col3=monthly, col4=nextPay
  // Portal stores lender as "Bank Name (Entity)" — strip the "(Entity)" suffix before writing back.
  return loans.map((l) => {
    const row: any[] = new Array(5).fill("");
    const cleanLender = l.lender.replace(/\s*\([^)]*\)\s*$/, "").trim();
    row[1] = l.entity;    // col 1: entity name (reader: entityRaw = row[1] || row[0])
    row[2] = cleanLender; // col 2: lender name (reader: lender = row[2] || row[1])
    row[3] = l.monthly;   // col 3: monthly payment amount (reader: amountVal = row[3])
    row[4] = l.nextPay;   // col 4: next payment date (reader: dueDate = row[4])
    return row;
  });
};

export const formatARSheetRows = (items: ARItem[]): any[][] => {
  const header = ["Entity", "Customer", "Description", "Amount", "Due Date", "Month", "Occurrence", "Invoice Created", "Approval Received", "Sent to Customer", "Payment Received", "Remarks"];
  const rows = items.map((i) => [
    i.entity,
    i.customer,
    i.description,
    i.amount,
    i.dueDate,
    i.month,
    i.occurrence,
    i.invoice ? "TRUE" : "FALSE",
    i.approval ? "TRUE" : "FALSE",
    i.sent ? "TRUE" : "FALSE",
    i.payment ? "TRUE" : "FALSE",
    i.remarks
  ]);
  return [header, ...rows];
};

export const formatStatementSheetRows = (statements: BankStatement[]): any[][] => {
  // Live reader column map:
  //   col0=cycleMonth  col1=entity  col2=accountName  col3=occurrence
  //   col4=purpose     col5=periodRange  col6=downloadDate  col7=isDownloaded  col8=reconciledDate
  // remarks is derived by reader as `${cycleMonth} - ${purpose}`; split remarks to recover both.
  return statements.map((s) => {
    const row: any[] = new Array(9).fill("");
    const parts = (s.remarks || "").split(" - ");
    const cycleMonth = parts[0]?.trim() || "";
    const purpose = parts.slice(1).join(" - ").trim();
    row[0] = cycleMonth;                         // col 0: cycle month (e.g. "Jul 2026")
    row[1] = s.entity;                           // col 1: entity name
    row[2] = s.bankName;                         // col 2: account/bank name
    row[3] = s.occurrence;                        // col 3: occurrence (e.g. "Monthly")
    row[4] = purpose;                             // col 4: purpose text (used in reader remarks)
    row[5] = s.period;                            // col 5: period range
    row[6] = s.downloadedAt || "";               // col 6: download date (parseDateVal)
    row[7] = s.downloaded ? "TRUE" : "FALSE";    // col 7: is-downloaded flag
    row[8] = (s as any).reconciledDate || "";    // col 8: reconciled date (parseDateVal)
    return row;
  });
};

export const parsePayrollSheetRows = (rows: any[][]): PayrollPivot => {
  if (!rows || rows.length <= 1) return {};
  const headers = rows[0].map((h) => String(h || "").toLowerCase().trim());

  let companyIdx = headers.findIndex((h) => /company|entity|business|branch/i.test(h));
  let jobIdx = headers.findIndex((h) => /job|employee|role|worker|person|name|staff/i.test(h));
  let subCatIdx = headers.findIndex((h) => /subcat|category|type|pay_type|item|description/i.test(h));
  let hoursIdx = headers.findIndex((h) => /hour|hrs|time|logged/i.test(h));
  let amtIdx = headers.findIndex((h) => /amount|amt|gross|pay|total|earning|\$/i.test(h));

  const pivot: PayrollPivot = {};
  const dataRows = rows.slice(1);

  dataRows.forEach((row) => {
    if (!row || row.length === 0 || row.every((c) => !c || String(c).trim() === "")) return;
    
    let rawCompany = companyIdx !== -1 ? String(row[companyIdx] || "") : "";
    if (!rawCompany) {
      for (let c = 0; c < Math.min(3, row.length); c++) {
        const val = String(row[c] || "").trim();
        if (/ruby|ti|msdx|curcumin/i.test(val)) {
          rawCompany = val;
          break;
        }
      }
    }
    const company = normalizeEntityName(rawCompany, "TI");

    const job = jobIdx !== -1 && row[jobIdx] ? String(row[jobIdx]).trim() : String(row[1] || row[0] || "General Payroll").trim();
    const subCat = subCatIdx !== -1 && row[subCatIdx] ? String(row[subCatIdx]).trim() : String(row[2] || "Gross Pay").trim();

    const hrsStr = hoursIdx !== -1 && row[hoursIdx] ? String(row[hoursIdx]).replace(/[^0-9.-]+/g, "") : "0";
    const amtStr = amtIdx !== -1 && row[amtIdx] ? String(row[amtIdx]).replace(/[^0-9.-]+/g, "") : "0";
    const hours = parseFloat(hrsStr) || 0;
    const amount = parseFloat(amtStr) || 0;

    if (!pivot[company]) pivot[company] = {};
    if (!pivot[company][job]) pivot[company][job] = {};
    if (!pivot[company][job][subCat]) {
      pivot[company][job][subCat] = { hours: 0, amount: 0 };
    }
    pivot[company][job][subCat].hours += hours;
    pivot[company][job][subCat].amount += amount;
  });

  return pivot;
};

export const formatPayrollSheetRows = (pivot: PayrollPivot): any[][] => {
  const header = ["Company", "Job / Role", "SubCategory", "Total Hours", "Total Amount"];
  const rows: any[][] = [];

  Object.entries(pivot).forEach(([company, jobs]) => {
    Object.entries(jobs).forEach(([job, subCats]) => {
      Object.entries(subCats).forEach(([subCat, val]) => {
        rows.push([company, job, subCat, val.hours, val.amount]);
      });
    });
  });

  return [header, ...rows];
};

// ── Meeting Notes / Quick Notes sheet sync ───────────────────────────────────
// Tab column layout (0-indexed):
//   A(0)=ID  B(1)=Created  C(2)=WeekLabel  D(3)=WeekStart
//   E(4)=Company  F(5)=Vendor  G(6)=NoteText  H(7)=Done  I(8)=LastUpdated

export const buildNoteRow = (note: DashboardNote): any[] => {
  // Strip the "qn-" prefix to get the raw sheet ID value
  const rawId = note.id.replace(/^qn-/, "");
  const today = new Date().toISOString().split("T")[0];
  // GAS convention: Column F = vendor/subject (= note title), Column G = body/instructions (= note.content)
  // note.title holds the vendor/subject; note.content holds the instruction body.
  const vendor  = note.vendorName || note.title || "";
  const company = note.entity || "";
  const noteBody = note.content?.trim() || "";
  return [
    rawId,
    note.createdAt  || today,
    note.weekLabel  || note.category || "",
    note.createdAt  || today,
    company,   // Column E — Company/Entity
    vendor,    // Column F — Vendor/Subject (= note title)
    noteBody,  // Column G — NoteText/Instructions body
    note.status === "done" ? "TRUE" : "FALSE",
    note.completedAt || (note.status === "done" ? today : ""),
  ];
};

/** Append a new note row at the end of the tab's data. */
export const appendNoteToSheet = async (
  note: DashboardNote,
  spreadsheetId: string,
  token: string,
  tabName = "Meeting Notes"
): Promise<void> => {
  await appendSheetValues(spreadsheetId, `'${tabName}'!A:I`, [buildNoteRow(note)], token);
};

/** Overwrite the note at its exact sheet row; falls back to append if row is unknown. */
export const writeSingleNote = async (
  note: DashboardNote,
  spreadsheetId: string,
  token: string,
  tabName = "Meeting Notes"
): Promise<void> => {
  if (!note.row) {
    await appendNoteToSheet(note, spreadsheetId, token, tabName);
    return;
  }
  const range = `'${tabName}'!A${note.row}:I${note.row}`;
  await updateSheetValues(spreadsheetId, range, [buildNoteRow(note)], token);
};

/** Clear a note row (soft-delete — empties the cells, row stays). */
export const clearNoteRow = async (
  rowNum: number,
  spreadsheetId: string,
  token: string,
  tabName = "Meeting Notes"
): Promise<void> => {
  const range = `'${tabName}'!A${rowNum}:I${rowNum}`;
  await updateSheetValues(spreadsheetId, range, [["", "", "", "", "", "", "", "", ""]], token);
};
