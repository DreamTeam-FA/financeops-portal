// Tracks Gemini AI API call counts per day, stored in localStorage.
// Each successful scan call bumps the relevant bucket.

const GEMINI_COUNTER_KEY = "financeops_gemini_counter";

export interface GeminiDayCounter {
  date: string;         // "YYYY-MM-DD"
  invoiceScans: number; // /api/invoice/scan — bill scans, receipt renames, invoice scanner
  pdfExtracts: number;  // /api/pdf/extract
  timesheetScans: number; // /api/timesheet/scan
  emailScans: number;   // /api/invoice/scan triggered from email inbox scanner
  total: number;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getGeminiCounter(): GeminiDayCounter {
  try {
    const raw = localStorage.getItem(GEMINI_COUNTER_KEY);
    if (raw) {
      const parsed: GeminiDayCounter = JSON.parse(raw);
      if (parsed.date === today()) return parsed;
    }
  } catch {}
  return { date: today(), invoiceScans: 0, pdfExtracts: 0, timesheetScans: 0, emailScans: 0, total: 0 };
}

export function bumpGeminiCounter(type: "invoice" | "pdf" | "timesheet" | "email"): void {
  try {
    const c = getGeminiCounter();
    if      (type === "invoice")   c.invoiceScans   += 1;
    else if (type === "pdf")       c.pdfExtracts     += 1;
    else if (type === "timesheet") c.timesheetScans  += 1;
    else if (type === "email")     c.emailScans      += 1;
    c.total = c.invoiceScans + c.pdfExtracts + c.timesheetScans + c.emailScans;
    localStorage.setItem(GEMINI_COUNTER_KEY, JSON.stringify(c));
  } catch {}
}
