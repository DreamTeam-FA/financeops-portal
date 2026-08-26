import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  BookOpen, ExternalLink, ChevronDown, ChevronRight,
  Table2, Layers, GitBranch, AlertTriangle, Server,
  FileText, BarChart3, Database, ArrowRight,
  HelpCircle, MessageCircleQuestion, Wrench
} from "lucide-react";

/* ── FAQ data ─────────────────────────────────────────────────────────── */
const FAQ = [
  {
    q: "Why is the portal taking 30–60 seconds to load?",
    a: "The portal runs on Render's free tier, which spins the server down after 15 minutes of inactivity. The first request after sleep wakes it up — that cold-start delay is normal. Once it's up, navigation is instant. Upgrade to Render Starter ($7/mo) to keep it always-on.",
  },
  {
    q: "Why isn't my data syncing to Google Sheets?",
    a: "Most sync failures are a disconnected Google token. Look for the amber 'Google Auth' toast at the bottom of the screen and click 'Reconnect Google Sheets.' If no toast appears, try refreshing the page and signing in again. Your data is always saved locally even when sync fails.",
  },
  {
    q: "Is my data safe if the portal goes down?",
    a: "Yes. All data lives in Google Sheets — the portal only reads and writes to it. Even if the portal is completely unreachable, you can open the sheets directly and your data is untouched. The portal also caches a local copy in your browser for offline viewing.",
  },
  {
    q: "How do I mark a bill as paid?",
    a: "Open the AP page, find the bill, and click the green 'Mark Paid' button. A date picker will appear — confirm the payment date and the bill moves to the Paid section and writes back to the sheet immediately.",
  },
  {
    q: "What's the difference between Ruby's, TI, and MSDx tabs?",
    a: "Each tab represents a separate legal entity: Ruby's Pizzeria & Grill, Timm Investments LLC, and Mobile Swallowing Diagnostics. They each have their own column layout in the sheet (see AP Column Maps in the Reference tab), their own bills, and their own vendor metadata.",
  },
  {
    q: "What does 'On Hold' mean for a bill?",
    a: "On Hold flags a bill as temporarily paused — it won't appear in the due-soon buckets or urgent lists. The flag is written to column S (Ruby's/MSDx) or W (TI) in the sheet. Use it for disputed invoices or intentionally delayed payments.",
  },
  {
    q: "How do I reconnect Google Sheets after a token expires?",
    a: "Click the ⚙️ gear icon → your profile area or wait for the amber 'Google Auth' toast to appear. Click 'Reconnect Google Sheets' and complete the Google OAuth flow. Tokens expire every hour — the portal will prompt you automatically.",
  },
  {
    q: "Why are some bills not showing up in the portal?",
    a: "Check that the bill's row is within the data range (e.g. Ruby's: A5:S1504). Rows outside that range are ignored. Also verify the Due Date column has a valid date — rows with blank due dates may be filtered out by the bucket logic.",
  },
  {
    q: "Can multiple people use the portal at the same time?",
    a: "Yes, but writes are not real-time collaborative. If two people edit the same bill simultaneously, the last write wins in the sheet. For coordinated edits, use the Activity Log (⚙️ → Portal Logs) to see what was changed and when.",
  },
  {
    q: "How do I clear the portal cache if something looks wrong?",
    a: "Go to ⚙️ → Settings & Data Sync and use the clear cache option there. In an emergency (page won't load), the Error screen has a 'Clear cache & reload' button. This resets local state but does not affect your Google Sheets data.",
  },
  {
    q: "How do I use the PDF Data Extractor?",
    a: "Go to the PDF Data Extractor page from the sidebar. Upload one or more PDFs (financial documents, reports, invoices, or timesheets). Gemini AI automatically scans each file and extracts all tables and text. Choose an extraction mode — Auto, Tables Only, Text Only, or Key-Value — before or after upload. Review the extracted sections in the panel on the right; you can rename or delete individual sections. When ready, export everything as CSV, XLSX (Excel), or DOCX (Word) using the export buttons at the top.",
  },
  {
    q: "How does the AI Invoice Scanner work?",
    a: "On the AR / Invoices page, click 'Add Invoice' and then choose 'Scan with AI'. Upload a photo or PDF of the invoice. Gemini AI reads all fields — vendor, amount, due date, invoice number, etc. — and pre-fills the Add Invoice form automatically. Review every field and make any corrections, then click Save. Nothing is written until you confirm.",
  },
  {
    q: "How does the AI Bill Scanner work?",
    a: "Same workflow as the Invoice Scanner but for Accounts Payable. On the AP / Bills page, click 'Add Bill' → 'Scan with AI'. Upload a photo, scanned PDF, or digital PDF of the bill. Gemini AI extracts vendor, amount, due date, and other fields and pre-fills the form. Review and save to confirm.",
  },
  {
    q: "How does the AI Timesheet Scanner work?",
    a: "On the Timesheets page, click 'Add Timesheet' → 'Scan with AI'. Upload a photo or PDF of a physical or printed timesheet. Gemini AI extracts employee names, hours worked, and dates and pre-fills the timesheet form. Review all fields before saving.",
  },
  {
    q: "How do I track bank statements?",
    a: "Open the Bank Statements Tracker page from the sidebar. It tracks monthly bank statement requests and downloads per entity. Click 'Add Entry' to log a new statement request for a bank and month. When you receive and file the statement, mark the entry as 'Downloaded'. Use the month and bank name filters to quickly find any entry. You can edit or delete entries at any time.",
  },
  {
    q: "How does the Email Invoice Scanner work?",
    a: "The Email Invoice Scanner automatically scans your Gmail inbox for financial emails — it searches for messages containing keywords like invoice, statement, payment due, bill, and receipt. Found emails appear in a review queue; nothing is saved automatically. For each email you can: view the message, scan any PDF attachments with Gemini AI, and create a Bill or Invoice directly from the extracted data. You review and confirm every action before anything is written to the portal or your sheets.",
  },
  {
    q: "What is Gemini AI used for in the portal?",
    a: "Gemini AI powers all of the AI scanning features: bill scanner, invoice scanner, timesheet scanner, PDF data extractor, and email invoice scanner. No setup is needed on your end — the portal uses a server-side API key stored securely in the Render environment. If the primary quota is exceeded, the portal falls back to backup Gemini models automatically. You can check current API status and usage on the Service Limits & Usage page.",
  },
  {
    q: "What is the Workspace / Member Workspace?",
    a: "The Workspace is a shared area where team members can upload files directly to Google Drive from inside the portal. Files are organized automatically by category and entity. Members see only their own uploads, while admins can see all uploads across all members. Access it from the Workspace section in the sidebar.",
  },
];

/* ── How-To data ──────────────────────────────────────────────────────── */
const HOWTOS = [
  {
    title: "Mark a Bill as Paid",
    steps: [
      "Go to the AP page and find the bill (use search or filter by entity).",
      "Click the green 'Mark Paid' button on the bill card.",
      "A date picker will appear — select the payment date and confirm.",
      "The bill immediately moves to the Paid section and the change is written to the Google Sheet.",
    ],
  },
  {
    title: "Add a New Bill",
    steps: [
      "On the AP page, click the '+ Add Bill' button in the top-right header.",
      "Fill in the vendor name, amount, due date, entity, and category.",
      "Click Save — the bill is added to localStorage and appended to the correct entity tab in the sheet.",
    ],
  },
  {
    title: "Sync / Pull Live Data from Sheets",
    steps: [
      "Click the ⟳ Refresh button in any page header to re-fetch that module's data.",
      "For a full sync across all modules, go to ⚙️ → Settings & Data Sync.",
      "Hit 'Pull Live from Sheets' — this fetches all modules in one pass.",
      "A toast notification will confirm success or report any partial failures.",
    ],
  },
  {
    title: "Reconnect Google Sheets After Token Expiry",
    steps: [
      "Look for the amber 'Google Auth' toast at the bottom of the screen.",
      "Click 'Reconnect Google Sheets' inside the toast.",
      "Complete the Google sign-in flow in the popup.",
      "If no toast appears, refresh the page — you'll be prompted to sign in again.",
    ],
  },
  {
    title: "Add a Note, Link, or Folder to a Member Workspace",
    steps: [
      "Open the member's workspace from the sidebar or Hub.",
      "Click '+ Add Item' in the top-right header.",
      "Choose the item type: Note, URL / Link, or Folder.",
      "Fill in the title, content/URL, and category — then click Save.",
      "Items appear grouped by type (Folders → Links → Notes) on the All Items tab.",
    ],
  },
  {
    title: "Import a Headley's Invoice",
    steps: [
      "Click ⚙️ (gear icon) → Headley's Invoices.",
      "Paste the raw Headley's report text into the input field.",
      "Select the Billing Unit (TI or 4YR) and verify the parsed rows.",
      "Click 'Write to Sheet' — rows are appended to the Headley's tab in the Main F&A Sheet.",
    ],
  },
  {
    title: "Add a Calendar Event",
    steps: [
      "Go to the Calendar page.",
      "Click '+ Add Event' in the header.",
      "Enter the title, date, time, type, and linked entity.",
      "Save — the event is written to the Events tab in the Calendar Sheet.",
    ],
  },
  {
    title: "Put a Bill On Hold",
    steps: [
      "Find the bill on the AP page.",
      "Open the bill's edit modal (click the ✏️ pencil icon).",
      "Toggle the 'On Hold' switch.",
      "Save — the bill moves to the On Hold bucket and the flag is written to the sheet (col S for Ruby's/MSDx, col W for TI).",
    ],
  },
  {
    title: "Extract Data from a PDF",
    steps: [
      "Open the PDF Data Extractor from the sidebar.",
      "Click 'Upload PDF' and select one or more financial documents, reports, invoices, or timesheets.",
      "Choose an extraction mode: Auto (recommended), Tables Only, Text Only, or Key-Value pairs.",
      "Wait for Gemini AI to scan the file — extracted sections appear in the results panel.",
      "Rename or delete any sections you don't need using the edit controls next to each section.",
      "Click Export and choose CSV, XLSX (Excel), or DOCX (Word) to download your data.",
    ],
  },
  {
    title: "Scan a Bill or Invoice with AI",
    steps: [
      "Go to the AP page (for bills) or AR / Invoices page (for invoices).",
      "Click '+ Add Bill' or '+ Add Invoice', then choose 'Scan with AI'.",
      "Upload a photo, scanned PDF, or digital PDF of the document.",
      "Gemini AI extracts all fields and pre-fills the form — review each field carefully.",
      "Make any corrections, then click Save to write the entry to the portal and sheet.",
    ],
  },
  {
    title: "Scan Emails for Invoices and Bills",
    steps: [
      "Open the Email Invoice Scanner from the sidebar or the gear menu.",
      "Click 'Scan Inbox' — the tool searches Gmail for emails matching financial keywords.",
      "Review each email in the queue. Nothing is saved at this step.",
      "For emails with PDF attachments, click 'Scan Attachment' to run Gemini AI on the PDF.",
      "Once fields are extracted, choose 'Create Bill' or 'Create Invoice' to open a pre-filled form.",
      "Review and confirm — then Save to write the record to the portal.",
    ],
  },
  {
    title: "Track a Bank Statement Download",
    steps: [
      "Open the Bank Statements Tracker from the sidebar.",
      "Click 'Add Entry' and select the entity, bank name, and statement month.",
      "Save the entry — it appears in the tracker with a 'Pending' status.",
      "When you receive and file the statement, find the entry and click 'Mark Downloaded'.",
      "Use the month and bank filters at the top to search for specific entries.",
    ],
  },
];

/* ── Breakage data ─────────────────────────────────────────────────────── */
const BREAKAGE = [
  { symptom: "AP bills load empty",    cause: "Tab renamed from Ruby's / TI / MSDx Bills",  fix: "Restore exact tab name OR update AP_COL_MAPS.dataRange in googleSheetsService.ts" },
  { symptom: "AP amounts show wrong",  cause: "Column added/removed in AP tab",              fix: "Update the relevant entry in AP_COL_MAPS (0-indexed)" },
  { symptom: "Notes don't sync",       cause: "Meeting Notes tab renamed",                   fix: "Restore tab name OR update tabName default in appendNoteToSheet / writeSingleNote" },
  { symptom: "Calendar empty",         cause: "Events tab renamed or moved",                 fix: "Restore OR update CAL_TAB_CANDIDATES in liveSheetsFetcher.ts" },
  { symptom: "Banks/Loans/AR wrong",   cause: "Column headers changed in sheet",             fix: "Update regex patterns in parseBankSheetRows / parseLoanSheetRows / parseARSheetRows" },
  { symptom: "MetaData tool breaks",   cause: "Columns shifted in Metadata tab",             fix: "Update META_READ / META_WRITE in src/components/modals/GearDropdown.tsx" },
  { symptom: "Headley's import fails", cause: "Header row moved or text changed",            fix: 'Parser looks for a row with "charging bu", "debit", "credit" — restore those' },
  { symptom: "Portal takes 30–60 s",   cause: "Render free tier woke from sleep",            fix: "Normal — upgrade to Render Starter ($7/mo) to eliminate" },
];

/* ── Sheet reference data ──────────────────────────────────────────────── */
const SHEETS = [
  {
    name: "Main F&A Sheet",
    id: "15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs",
    emoji: "📋",
    gradient: "from-[#1a3a6b] to-[#0d1f40]",
    glow: "rgba(26,115,232,0.18)",
    accent: "#4da3ff",
    border: "border-[#1a73e8]/25",
    badgeBg: "bg-[#1a73e8]/10",
    badgeText: "text-[#4da3ff]",
    purpose: "AP Bills · AR · Banks · Loans · Notes · Statements",
    tabs: [
      { name: "Ruby's Bills",         gid: "1244424272", note: "AP bills — Ruby's Pizzeria & Grill" },
      { name: "TI Bills",             gid: "1881273371", note: "AP bills — Timm Investments LLC" },
      { name: "MSDx Bills",           gid: "626198915",  note: "AP bills — Mobile Swallowing Dx" },
      { name: "AR Dashboard Data",    gid: "1095820813", note: "Accounts Receivable" },
      { name: "Bank Balances",        gid: "573058575",  note: "Bank account balances" },
      { name: "Loans",                gid: "860453470",  note: "Loans & credit card dues" },
      { name: "Bank Statements Data", gid: "350904169",  note: "Statement download tracker" },
      { name: "Meeting Notes",        gid: "320158278",  note: "Quick Notes from the portal" },
      { name: "Metadata",             gid: "dynamic",    note: "Vendor metadata (due dates, recurring)" },
      { name: "Headley's",            gid: "dynamic",    note: "Headley's invoice raw data" },
      { name: "Activity Log",         gid: "dynamic",    note: "Portal audit log" },
    ],
  },
  {
    name: "4YR Payroll Sheet",
    id: "1SITtQDT3iFo5yIOBgjbERbqJjYJ8rk6drXwkLm3sAGE",
    emoji: "💼",
    gradient: "from-[#064e3b] to-[#022c22]",
    glow: "rgba(16,185,129,0.16)",
    accent: "#34d399",
    border: "border-emerald-500/25",
    badgeBg: "bg-emerald-500/10",
    badgeText: "text-emerald-400",
    purpose: "4You Pros payroll raw data & weekly summaries",
    tabs: [
      { name: "Raw payroll tab", gid: "1484569924", note: "Weekly payroll entries — fourYrPayrollService.ts" },
    ],
  },
  {
    name: "Calendar Sheet",
    id: "1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo",
    emoji: "📅",
    gradient: "from-[#3b1f6b] to-[#1e0d40]",
    glow: "rgba(139,92,246,0.16)",
    accent: "#a78bfa",
    border: "border-violet-500/25",
    badgeBg: "bg-violet-500/10",
    badgeText: "text-violet-400",
    purpose: "Finance & schedule events · Calendar notes",
    tabs: [
      { name: "Events", gid: "0",          note: "Primary calendar events (read & write)" },
      { name: "Notes",  gid: "1248704539", note: "Calendar notes (read-only)" },
    ],
  },
];

const SERVICE_FILES = [
  { file: "googleSheetsService.ts",   path: "src/services/", role: "All Sheets API calls, all parsers, all column maps", color: "#4da3ff" },
  { file: "liveSheetsFetcher.ts",     path: "src/services/", role: "Full dataset fetch used by the sync button",         color: "#4da3ff" },
  { file: "googleCalendarService.ts", path: "src/services/", role: "Calendar sheet reads/writes + Google Calendar API",  color: "#34d399" },
  { file: "fourYrPayrollService.ts",  path: "src/services/", role: "4YR Payroll-specific reads/writes",                  color: "#34d399" },
  { file: "googleAuth.ts",            path: "src/services/", role: "Firebase Auth, Google OAuth, token refresh",         color: "#fb923c" },
  { file: "logsSheetService.ts",      path: "src/services/", role: "Activity log sheet appends",                         color: "#94a3b8" },
  { file: "FinanceContext.tsx",        path: "src/context/",  role: "All state, all mutations, sync orchestration",       color: "#a78bfa" },
  { file: "apiCounter.ts",            path: "src/utils/",    role: "Lightweight daily read/write call counter",          color: "#94a3b8" },
];

/* ── Collapsible section ─────────────────────────────────────────────────── */
const Section: React.FC<{
  title: string; icon: React.ReactNode; iconBg: string;
  isLight: boolean; children: React.ReactNode; defaultOpen?: boolean;
}> = ({ title, icon, iconBg, isLight, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const border   = isLight ? "border-slate-200" : "border-[#1a2235]";
  const hdrBg    = isLight ? "bg-white hover:bg-slate-50" : "bg-[#0d111a] hover:bg-[#111827]";
  const bodyBg   = isLight ? "bg-slate-50"   : "bg-[#070b12]";
  const titleCol = isLight ? "text-slate-800" : "text-white";
  const chevBg   = isLight ? "bg-slate-100 group-hover:bg-slate-200" : "bg-[#1a2235] group-hover:bg-[#243050]";
  const chevCol  = isLight ? "text-slate-400" : "text-[#5a6a80]";
  return (
    <div className={`rounded-2xl border overflow-hidden mb-4 shadow-[0_2px_12px_rgba(0,0,0,.1)] ${border}`}>
      <button onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 transition-colors text-left group ${hdrBg}`}
      >
        <span className="flex items-center gap-3">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</span>
          <span className={`text-[13px] font-bold ${titleCol}`}>{title}</span>
        </span>
        <span className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${chevBg}`}>
          {open ? <ChevronDown className={`w-3.5 h-3.5 ${chevCol}`} /> : <ChevronRight className={`w-3.5 h-3.5 ${chevCol}`} />}
        </span>
      </button>
      {open && <div className={`px-5 py-5 border-t ${border} ${bodyBg}`}>{children}</div>}
    </div>
  );
};

/* ── How-To accordion item ───────────────────────────────────────────────── */
const HowToItem: React.FC<{ title: string; steps: string[]; isLight: boolean; index: number }> = ({ title, steps, isLight, index }) => {
  const [open, setOpen] = useState(false);
  const border  = isLight ? "border-slate-200" : "border-[#1a2235]";
  const cardBg  = isLight ? "bg-white"         : "bg-[#0d111a]";
  const bodyBg  = isLight ? "bg-slate-50"      : "bg-[#070b12]";
  const qCol    = isLight ? "text-slate-800"   : "text-white";
  const aCol    = isLight ? "text-slate-600"   : "text-[#7a90b0]";
  const chevCol = isLight ? "text-slate-400"   : "text-[#5a6a80]";
  const numBg   = isLight ? "bg-[#1a73e8]/10 text-[#1a73e8]" : "bg-[#1a73e8]/15 text-[#4da3ff]";
  return (
    <div className={`rounded-xl border overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,.08)] ${border}`}>
      <button onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors group
          ${cardBg} ${isLight ? "hover:bg-slate-50" : "hover:bg-[#111827]"}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-6 h-6 rounded-full text-[10px] font-extrabold flex items-center justify-center shrink-0 ${numBg}`}>
            {index + 1}
          </span>
          <span className={`text-[12px] font-semibold ${qCol} leading-snug`}>{title}</span>
        </div>
        <span className="ml-3 shrink-0">
          {open
            ? <ChevronDown  className={`w-3.5 h-3.5 ${chevCol}`} />
            : <ChevronRight className={`w-3.5 h-3.5 ${chevCol}`} />}
        </span>
      </button>
      {open && (
        <div className={`px-4 pb-4 pt-3 border-t ${border} ${bodyBg}`}>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className={`mt-0.5 w-4 h-4 rounded-full text-[9px] font-extrabold flex items-center justify-center shrink-0 ${numBg}`}>
                  {i + 1}
                </span>
                <p className={`text-[11px] leading-relaxed ${aCol}`}>{step}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

/* ── FAQ accordion item ───────────────────────────────────────────────────── */
const FAQItem: React.FC<{ q: string; a: string; isLight: boolean }> = ({ q, a, isLight }) => {
  const [open, setOpen] = useState(false);
  const border  = isLight ? "border-slate-200" : "border-[#1a2235]";
  const cardBg  = isLight ? "bg-white"         : "bg-[#0d111a]";
  const bodyBg  = isLight ? "bg-slate-50"      : "bg-[#070b12]";
  const qCol    = isLight ? "text-slate-800"   : "text-white";
  const aCol    = isLight ? "text-slate-600"   : "text-[#7a90b0]";
  const chevCol = isLight ? "text-slate-400"   : "text-[#5a6a80]";
  return (
    <div className={`rounded-xl border overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,.08)] ${border}`}>
      <button onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors group
          ${cardBg} ${isLight ? "hover:bg-slate-50" : "hover:bg-[#111827]"}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <MessageCircleQuestion className={`w-4 h-4 shrink-0 ${isLight ? "text-[#1a73e8]" : "text-[#4da3ff]"} opacity-70`} />
          <span className={`text-[12px] font-semibold ${qCol} leading-snug`}>{q}</span>
        </div>
        <span className="ml-3 shrink-0">
          {open
            ? <ChevronDown  className={`w-3.5 h-3.5 ${chevCol}`} />
            : <ChevronRight className={`w-3.5 h-3.5 ${chevCol}`} />}
        </span>
      </button>
      {open && (
        <div className={`px-4 pb-4 pt-3 border-t ${border} ${bodyBg}`}>
          <p className={`text-[11px] leading-relaxed ${aCol}`}>{a}</p>
        </div>
      )}
    </div>
  );
};

/* ── Main page ────────────────────────────────────────────────────────────── */
export const HelpPage: React.FC = () => {
  const { theme } = useFinance();
  const isLight = theme === "light";
  const [activeTab, setActiveTab] = useState<"help" | "reference">("help");

  /* tokens */
  const pageBg    = isLight ? "bg-slate-100"    : "bg-[#070b12]";
  const cardBg    = isLight ? "bg-white"         : "bg-[#0d111a]";
  const border    = isLight ? "border-slate-200" : "border-[#1a2235]";
  const rowEven   = isLight ? "bg-white"         : "bg-[#070b12]";
  const rowOdd    = isLight ? "bg-slate-50"      : "bg-[#09101a]";
  const rowHover  = isLight ? "hover:bg-blue-50/30" : "hover:bg-[#0d111a]";
  const th        = isLight ? "text-slate-400"   : "text-[#3a4a5e]";
  const td        = isLight ? "text-slate-600"   : "text-[#5a6a80]";
  const strong    = isLight ? "text-slate-900"   : "text-white";
  const muted     = isLight ? "text-slate-400"   : "text-[#3a4a5e]";
  const codeBg    = isLight ? "bg-slate-100 text-slate-700"   : "bg-[#111827] text-violet-400";
  const codeBgBlu = isLight ? "bg-slate-100 text-blue-600"    : "bg-[#111827] text-[#4da3ff]";
  const tableWrap = `rounded-xl border overflow-hidden ${border} shadow-[0_2px_8px_rgba(0,0,0,.07)]`;

  const tabs = [
    { id: "help" as const,      label: "Help",      icon: <HelpCircle className="w-3.5 h-3.5" /> },
    { id: "reference" as const, label: "Reference", icon: <BookOpen   className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${pageBg}`}>

      {/* ── Page header ── */}
      <div className={`relative overflow-hidden px-6 pt-5 border-b ${border}`}
        style={{ background: isLight
          ? "linear-gradient(135deg,#e8f0fe 0%,#f8faff 60%)"
          : "linear-gradient(135deg,#0a1628 0%,#070b12 60%)" }}
      >
        <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle,#1a73e8 0%,transparent 70%)" }} />

        <div className="relative flex items-center gap-4 mb-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0
            bg-gradient-to-br from-[#1a3a6b] to-[#0d1f40]
            border border-[#1a73e8]/30
            shadow-[0_0_0_1px_rgba(26,115,232,.15),0_4px_20px_rgba(26,115,232,.2)]">
            <BookOpen className="w-5 h-5 text-[#4da3ff]" />
          </div>
          <div>
            <h1 className={`text-[15px] font-extrabold leading-tight ${strong}`}>Help &amp; Reference</h1>
            <p className={`text-[11px] mt-0.5 ${muted}`}>FAQ, breakage fixes, sheet structure &amp; column maps</p>
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex gap-0.5">
          {tabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-5 py-2.5 text-[12px] font-bold rounded-t-xl border-b-2 transition-all ${
                  isActive
                    ? isLight
                      ? "bg-slate-100 border-[#1a73e8] text-[#1a73e8]"
                      : "bg-[#070b12] border-[#1a73e8] text-[#4da3ff]"
                    : isLight
                      ? "bg-transparent border-transparent text-slate-400 hover:text-slate-600"
                      : "bg-transparent border-transparent text-[#3a4a5e] hover:text-[#7a90b0]"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 max-w-4xl w-full mx-auto">

          {/* ════ HELP TAB ════ */}
          {activeTab === "help" && (
            <>
              {/* Sheet access tiles */}
              <p className={`text-[10px] font-bold uppercase tracking-[.12em] mb-3 ${muted}`}>Direct Sheet Access</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                {SHEETS.map((s) => (
                  <a key={s.name}
                    href={`https://docs.google.com/spreadsheets/d/${s.id}/edit`}
                    target="_blank" rel="noopener noreferrer"
                    className={`group relative flex flex-col gap-3 p-4 rounded-2xl border no-underline transition-all
                      bg-gradient-to-br ${s.gradient} ${s.border}
                      hover:scale-[1.02]`}
                    style={{ boxShadow: `0 0 0 1px rgba(0,0,0,.3),0 2px 16px rgba(0,0,0,.3),0 0 40px ${s.glow}` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{s.emoji}</span>
                      <ExternalLink className={`w-3.5 h-3.5 ${s.badgeText} opacity-50 group-hover:opacity-100 transition-opacity`} />
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-white mb-0.5">{s.name}</p>
                      <p className={`text-[10px] leading-relaxed ${s.badgeText} opacity-70`}>{s.purpose}</p>
                    </div>
                    <div className={`flex items-center gap-1 text-[10px] font-bold ${s.badgeText}`}>
                      <span>Open Sheet</span>
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </a>
                ))}
              </div>

              {/* FAQ */}
              <p className={`text-[10px] font-bold uppercase tracking-[.12em] mb-3 ${muted}`}>Frequently Asked Questions</p>
              <div className="space-y-2 mb-6">
                {FAQ.map((item) => (
                  <FAQItem key={item.q} q={item.q} a={item.a} isLight={isLight} />
                ))}
              </div>

              {/* How-To's */}
              <p className={`text-[10px] font-bold uppercase tracking-[.12em] mb-3 ${muted}`}>How-To Guides</p>
              <div className="space-y-2 mb-6">
                {HOWTOS.map((item, i) => (
                  <HowToItem key={item.title} title={item.title} steps={item.steps} isLight={isLight} index={i} />
                ))}
              </div>

              {/* Breakage scenarios */}
              <Section title="Common Breakage Scenarios & Fixes" iconBg="bg-red-500/15" isLight={isLight} defaultOpen
                icon={<Wrench className="w-4 h-4 text-red-400" />}
              >
                <div className="space-y-2.5">
                  {BREAKAGE.map((b) => (
                    <div key={b.symptom}
                      className={`rounded-xl border overflow-hidden ${border} ${cardBg} shadow-[0_2px_8px_rgba(0,0,0,.06)]`}
                    >
                      <div className={`flex items-center gap-2.5 px-4 py-2.5 border-b ${border}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        <span className={`text-[12px] font-bold ${strong}`}>{b.symptom}</span>
                      </div>
                      <div className={`px-4 py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-3
                        ${isLight ? "bg-slate-50" : "bg-[#070b12]"}`}>
                        <div>
                          <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${muted}`}>Cause</p>
                          <p className={`text-[11px] leading-relaxed ${td}`}>{b.cause}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-0.5">Fix</p>
                          <p className="text-[11px] text-emerald-600 leading-relaxed">{b.fix}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

          {/* ════ REFERENCE TAB ════ */}
          {activeTab === "reference" && (
            <>
              {/* Spreadsheet structure */}
              <Section title="Spreadsheet Structure" iconBg="bg-[#1a73e8]/15" defaultOpen isLight={isLight}
                icon={<Table2 className="w-4 h-4 text-[#4da3ff]" />}
              >
                <div className="space-y-6">
                  {SHEETS.map((s) => (
                    <div key={s.name}>
                      <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
                        <span className="text-base">{s.emoji}</span>
                        <span className={`text-[12px] font-bold ${strong}`}>{s.name}</span>
                        <code className={`text-[9px] px-2 py-0.5 rounded-full font-mono border ${s.badgeBg} ${s.badgeText} ${s.border}`}>
                          {s.id.slice(0, 22)}…
                        </code>
                      </div>
                      <div className={tableWrap}>
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className={`${cardBg} border-b ${border}`}>
                              <th className={`text-left px-3.5 py-2.5 font-bold ${th} w-[40%]`}>Tab name</th>
                              <th className={`text-left px-3.5 py-2.5 font-bold ${th} w-[22%] hidden sm:table-cell`}>gid</th>
                              <th className={`text-left px-3.5 py-2.5 font-bold ${th}`}>Purpose</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.tabs.map((t, i) => (
                              <tr key={t.name} className={`border-t ${border} transition-colors ${rowHover} ${i % 2 === 0 ? rowEven : rowOdd}`}>
                                <td className="px-3.5 py-2.5">
                                  <a href={t.gid === "dynamic"
                                      ? `https://docs.google.com/spreadsheets/d/${s.id}/edit`
                                      : `https://docs.google.com/spreadsheets/d/${s.id}/edit#gid=${t.gid}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className={`font-mono font-bold hover:underline ${s.badgeText}`}
                                  >{t.name}</a>
                                </td>
                                <td className={`px-3.5 py-2.5 font-mono hidden sm:table-cell ${muted}`}>{t.gid}</td>
                                <td className={`px-3.5 py-2.5 ${td}`}>{t.note}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* AP column maps */}
              <Section title="AP Column Maps (hardcoded, 0-indexed)" iconBg="bg-violet-500/15" isLight={isLight}
                icon={<Layers className="w-4 h-4 text-violet-400" />}
              >
                <p className={`text-[11px] leading-relaxed mb-4 ${td}`}>
                  The AP parser uses <strong className={strong}>hardcoded column positions</strong> — not header detection.
                  If you add or shift columns in the sheet, update{" "}
                  <code className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${codeBg}`}>AP_COL_MAPS</code>
                  {" "}in{" "}
                  <code className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${codeBgBlu}`}>googleSheetsService.ts</code>.
                </p>
                <div className={tableWrap}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className={`${cardBg} border-b ${border}`}>
                        {["Entity","Range","Key columns (0-indexed)"].map(h => (
                          <th key={h} className={`text-left px-3.5 py-2.5 font-bold ${th}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { entity:"Ruby's Bills", range:"A5:S1504", cols:"D=Vendor  I=DueDate  J=Amount  L=PaidDate  M=Status  S=OnHold" },
                        { entity:"TI Bills",     range:"A7:W1506", cols:"F=Vendor  I=DueDate  J=Amount  K=PaidDate  N=Status  W=OnHold" },
                        { entity:"MSDx Bills",   range:"A6:S1505", cols:"Same layout as Ruby's Bills" },
                      ].map((r, i) => (
                        <tr key={r.entity} className={`border-t ${border} transition-colors ${rowHover} ${i % 2 === 0 ? rowEven : rowOdd}`}>
                          <td className={`px-3.5 py-2.5 font-bold ${strong}`}>{r.entity}</td>
                          <td className={`px-3.5 py-2.5 font-mono ${muted}`}>{r.range}</td>
                          <td className={`px-3.5 py-2.5 font-mono text-[10px] ${td}`}>{r.cols}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={`text-[10px] mt-3 leading-relaxed ${muted}`}>
                  Banks, Loans, AR, and Statements use <strong className={td}>header-based detection</strong> via regex — column order does not matter for those.
                </p>
              </Section>

              {/* Data flow */}
              <Section title="Data Flow" iconBg="bg-emerald-500/15" isLight={isLight}
                icon={<BarChart3 className="w-4 h-4 text-emerald-400" />}
              >
                <div className={`rounded-xl border overflow-hidden ${border}`}>
                  <pre className={`p-4 font-mono text-[11px] leading-[1.9] whitespace-pre overflow-x-auto
                    ${isLight ? "bg-slate-50 text-slate-500" : "bg-[#070b12] text-[#5a6a80]"}`}>
{`User action in portal
       │
       ▼
`}<span className={`${strong} font-bold`}>FinanceContext.tsx</span>{`
  • Updates React state immediately
  • Writes to localStorage (offline access)
  • Calls googleSheetsService.ts
       │
       ▼
`}<span className="text-[#4da3ff] font-bold">googleSheetsService.ts</span>{`
  • fetchSheetValues()   → GET  /v4/spreadsheets/{id}/values/{range}
  • updateSheetValues()  → PUT  /v4/spreadsheets/{id}/values/{range}
  • appendSheetValues()  → POST /v4/spreadsheets/{id}/values/{range}:append
  • All three bump the daily API counter `}<span className={muted}>(apiCounter.ts)</span>{`
       │
       ▼
`}<span className="text-emerald-400 font-bold">Google Sheets API v4</span>{`  (free tier: 60 req / min per user)`}
                  </pre>
                </div>
              </Section>

              {/* Service files */}
              <Section title="Key Service Files" iconBg="bg-amber-500/15" isLight={isLight}
                icon={<GitBranch className="w-4 h-4 text-amber-400" />}
              >
                <div className="grid grid-cols-1 gap-2">
                  {SERVICE_FILES.map((f) => (
                    <div key={f.file}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${border} ${cardBg}
                        shadow-[0_1px_4px_rgba(0,0,0,.06)]`}
                    >
                      <div className="w-1 h-8 rounded-full shrink-0 opacity-70" style={{ background: f.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className={`text-[10px] font-mono ${muted}`}>{f.path}</span>
                          <code className="text-[11px] font-mono font-bold" style={{ color: f.color }}>{f.file}</code>
                        </div>
                        <p className={`text-[10px] mt-0.5 ${td}`}>{f.role}</p>
                      </div>
                      <FileText className={`w-3.5 h-3.5 shrink-0 ${muted}`} />
                    </div>
                  ))}
                </div>
              </Section>

              {/* Meeting Notes column layout */}
              <Section title="Meeting Notes — Column Layout" iconBg="bg-[#1a73e8]/15" isLight={isLight}
                icon={<Database className="w-4 h-4 text-[#4da3ff]" />}
              >
                <p className={`text-[11px] leading-relaxed mb-4 ${td}`}>
                  One note per row in the{" "}
                  <a href="https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit#gid=320158278"
                    target="_blank" rel="noopener noreferrer" className="text-[#4da3ff] hover:underline font-bold">
                    Meeting Notes
                  </a>{" "}tab.{" "}
                  <strong className="text-amber-500">Renaming this tab breaks note sync.</strong>
                </p>
                <div className={tableWrap}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className={`${cardBg} border-b ${border}`}>
                        <th className={`text-left px-3.5 py-2.5 font-bold ${th} w-12`}>Col</th>
                        <th className={`text-left px-3.5 py-2.5 font-bold ${th}`}>Field</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["A","Note ID"],["B","Content / text"],["C","Status (done or blank)"],
                        ["D","Completed timestamp"],["E","Created timestamp"],["F","Author (user email)"],
                        ["G","Color label"],["H","Priority flag"],
                      ].map(([col, field], i) => (
                        <tr key={col} className={`border-t ${border} transition-colors ${rowHover} ${i % 2 === 0 ? rowEven : rowOdd}`}>
                          <td className="px-3.5 py-2.5 font-mono font-bold text-[#4da3ff]">{col}</td>
                          <td className={`px-3.5 py-2.5 ${td}`}>{field}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* Env vars */}
              <Section title="Environment Variables (Render)" iconBg="bg-slate-500/15" isLight={isLight}
                icon={<Server className="w-4 h-4 text-slate-400" />}
              >
                <div className="space-y-2">
                  {[
                    { key: "GEMINI_API_KEY", note: "AI features — set in Render dashboard, never hardcode in source" },
                    { key: "Firebase config", note: "Hardcoded in src/services/googleAuth.ts — acceptable for public Firebase config" },
                  ].map((v) => (
                    <div key={v.key} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${border} ${cardBg}`}>
                      <code className="text-[11px] font-mono font-bold text-amber-500 shrink-0 mt-0.5">{v.key}</code>
                      <p className={`text-[11px] leading-relaxed ${td}`}>{v.note}</p>
                    </div>
                  ))}
                </div>
                <p className={`text-[10px] mt-4 ${muted}`}>Last updated 2026-08-22 — keep in sync whenever sheet structure changes.</p>
              </Section>
            </>
          )}

        </div>
      </div>
    </div>
  );
};
