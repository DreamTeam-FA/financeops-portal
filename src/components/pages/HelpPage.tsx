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
    a: "Click the ⚙️ gear icon → your profile area or wait for the amber 'Google Auth' banner at the top of any page. Click 'Reconnect Google Sheets' and complete the Google OAuth flow. Tokens expire every hour — the portal detects both 401 and 403 errors on any page (Calendar, AR, AP, etc.) and shows the amber reconnect banner globally, not just on one page.",
  },
  {
    q: "Why are some bills not showing up in the portal?",
    a: "Check that the bill's row is within the data range (e.g. Ruby's: A5:S1504). Rows outside that range are ignored. Also verify the Due Date column has a valid date — rows with blank due dates may be filtered out by the bucket logic.",
  },
  {
    q: "Can multiple people use the portal at the same time?",
    a: "Yes. The portal uses BroadcastChannel to keep browser tabs in sync — when one tab completes a live data pull, all other open tabs on the same machine automatically refresh from the updated cache within seconds. Across different machines, the source of truth is always Google Sheets, so a manual Sync on any machine picks up the latest data. If two people edit the same bill simultaneously, the last write wins in the sheet. Use the Activity Log (⚙️ → Portal Logs) to see what was changed and when.",
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
    q: "How do I use the Payables Calendar?",
    a: "The Payables Calendar (sidebar: Payables Calendar, under Accounts Payables) shows all AP bills spread across a 7-day Monday–Sunday grid for the selected week. Each bill appears as a card in the column matching its due date, with a colored left-accent bar and badge for Ruby's (pink), TI (blue), and MSDx (teal). Unpaid past-due bills are highlighted in red; paid bills are dimmed. Navigate weeks with the ← → arrows or jump back to the current week with 'This Week'. A day-total footer shows the unpaid subtotal per day, and the bottom bar breaks totals by entity. Use the entity filter pills in the page header (ALL / Ruby's / TI / MSDx) to narrow the view. The layout is screenshot-friendly for weekly review meetings.",
  },
  {
    q: "How does the AI Bill Scanner work?",
    a: "On the AP / Bills page, click 'Add Bill' → 'Scan with AI'. Upload a photo, scanned PDF, or digital PDF of the bill. Gemini AI extracts vendor, amount, due date, and other fields. The scanned vendor name is fuzzy-matched to the closest existing vendor in your bill history — so category, description, and sub-company fields auto-populate from the matched vendor's prior bill. Review all pre-filled fields, add your own remarks if needed, and click Save to confirm.",
  },
  {
    q: "How does the AI Timesheet Scanner work?",
    a: "On the 4YR Payroll page, open 'Add Record' and use the 'Scan Timesheet' panel. Upload a photo or PDF of the timesheet. Gemini AI extracts employee name, job location, and per-day hours (clock in, clock out, total hours). Each day is shown as a pill — click a day to pre-fill the form. Employee name and job location are fuzzy-matched to the closest existing entry to handle OCR discrepancies. For multi-day scans, the modal stays open after each entry is saved so you can log every day. To close with scan data loaded, click × or Cancel — a confirmation dialog will prompt you to verify all required entries have been logged before discarding the scan.",
  },
  {
    q: "How do I track bank statements?",
    a: "Open the Bank Statements Tracker page from the sidebar. It tracks monthly bank statement requests and downloads per entity. Click 'Add Entry' to log a new statement request for a bank and month. When you receive and file the statement, mark the entry as 'Downloaded'. Use the month and bank name filters to quickly find any entry. You can edit or delete entries at any time.",
  },
  {
    q: "How does the Email Invoice Scanner work?",
    a: "The Email Invoice Scanner scans your Gmail inbox for financial emails. Found emails appear in a review queue; nothing is saved automatically. For each email you can create a Bill or Invoice: Gemini AI scans any PDF attachment and extracts vendor, amount, due date, invoice number, and description. The scanned vendor name is fuzzy-matched to your closest existing vendor in bill history — so category, entity, and description auto-populate from the matched vendor. The email's Gmail link is automatically placed in the Remarks field so you can trace the bill back to its source. Review all pre-filled fields in the AP/AR form, then save to confirm.",
  },
  {
    q: "What is Gemini AI used for in the portal?",
    a: "Gemini AI powers all of the AI scanning features: bill scanner, invoice scanner, timesheet scanner, PDF data extractor, and email invoice scanner. No setup is needed on your end — the portal uses a server-side API key stored securely in the Render environment. The portal tries Gemini 2.5 Flash first (fastest), then falls back to 2.5 Flash-Lite, 2.5 Pro, 2.0 Flash, and 1.5 Flash if quota is exhausted. You can check current API status and usage on the Service Limits & Usage page.",
  },
  {
    q: "Why is the Email Invoice Scanner 'Scan' button greyed out after connecting?",
    a: "The Connect Inbox button requests both Gmail read and userinfo.email scopes. If the connection appears to succeed but the Scan button stays disabled, try clicking 'Connect Inbox' again to re-authorize with the correct scopes. This is fixed in the latest version — connecting should now correctly unlock the Scan button.",
  },
  {
    q: "Why does 'Connect Inbox' fail with an origin error on the Email Scanner?",
    a: "Google Identity Services requires the page's exact origin (e.g. https://financeops-portal.onrender.com) to be listed as an Authorized JavaScript Origin on the OAuth 2.0 Client ID in Google Cloud Console → APIs & Services → Credentials. Add the Render URL there, wait 1–5 minutes for it to propagate, then retry. This is separate from adding an authorized redirect URI.",
  },
  {
    q: "Why does Gmail scanning fail with 'Gmail API not enabled'?",
    a: "The Gmail API must be explicitly enabled in the GCP project. Go to console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=982066512597 and click Enable. The change takes effect within 1–2 minutes. This is a one-time setup step.",
  },
  {
    q: "Where are portal login and activity logs stored?",
    a: "All logs are written to a single shared Google Sheet: '⛔ DO NOT DELETE — FinanceOps Portal Logs' (ID: 19ColN3UOnuGbk1CkHtZswxPZf7oj7Zs2pKaqmGlN4m8). Every sign-in is recorded in the Login History tab (timestamp, email, device, IP, location). Every portal action (add, edit, delete, scan) is recorded in the Activity Log tab. You can view and filter logs from the Portal Logs page (⚙️ → Portal Logs).",
  },
  {
    q: "What is the Workspace / Member Workspace?",
    a: "The Workspace is a shared area where team members can upload files directly to Google Drive from inside the portal. Files are organized automatically by category and entity. Members see only their own uploads, while admins can see all uploads across all members. Access it from the Workspace section in the sidebar.",
  },
  {
    q: "Why does the portal paint data instantly before the Google sync finishes?",
    a: "The portal uses a localStorage cache ('financeops_data_cache_v2') with a 20-minute TTL. On every load it paints your last session's data immediately while the live Google Sheets pull runs in the background. Once the live pull finishes, the display updates automatically. If the live pull fails, a red toast appears with a 'Sync' prompt — your cached data is still shown.",
  },
  {
    q: "How do bill copy links (View Bill Copy) work?",
    a: "Bill copy Drive URLs are stored permanently in the Google Sheet: column AM for Ruby's Bills and column AA for TI and MSDx Bills. When you upload a bill copy via the 📎 icon on a bill card, the file is saved to the Bills Root folder in Drive and its URL is written immediately to the correct column in the sheet. On every Pull All (or auto-pull after sign-in), the portal reads these columns and shows the 'View Bill Copy' button. Google Sheets is always the source of truth — if you delete the URL from the sheet and do a Pull All, the link disappears from the portal permanently.",
  },
  {
    q: "I deleted a bill copy link from the sheet but it keeps coming back — why?",
    a: "This was a bug in an earlier version where a hardcoded list (KNOWN_DRIVE_FILES) and stale localStorage cache were re-applying deleted links after every Pull All. Both have been removed. If a link reappears now, check that (a) the cell in column AM / AA is truly empty in the sheet (not just visually cleared), and (b) you did a full Pull All after clearing it. The portal no longer writes bill copy URLs back to the sheet on its own — they only come from the sheet.",
  },
  {
    q: "Why does the portal automatically sync all data right after I log in?",
    a: "After you sign in with Google, the portal waits 1 second for the OAuth token to settle and then automatically runs a full Pull All — fetching all AP bills, banks, loans, AR, calendar, and notes from Google Sheets. This means you always see fresh, live data immediately after login without having to click the Sync button manually.",
  },
  {
    q: "What happens if the live data pull fails on startup?",
    a: "The portal retries once after 3 seconds. If both attempts fail, a red error toast appears at the bottom: 'Live data refresh failed — showing cached data. Click Sync to retry.' Your data from the last successful session is still displayed. Click the Sync button in the Data Sync page or any page header to retry manually.",
  },
  {
    q: "Are my sheet mapping customizations saved if the server restarts?",
    a: "Yes. Sheet mapping changes are now written to a '_config' tab in the shared FinanceOps Portal Logs Google Sheet (ID: 19ColN3UOnuGbk1CkHtZswxPZf7oj7Zs2pKaqmGlN4m8) in addition to the server. On every startup, the portal reads this config tab so all users — across all devices — see the latest mappings. Render server restarts no longer lose your customizations.",
  },
  {
    q: "What is the Portal Health Audit?",
    a: "Every 48 hours, the portal automatically runs a background health check after your data loads. It scans for: unpaid bills overdue >60 days, bank accounts with negative balances, loan payments past due, AR overdue >90 days, sync errors, data freshness, and improvement opportunities. Findings appear in a modal sorted by severity (Critical → Warning → Improvement) with a one-click link to the affected page. Dismiss closes it for 48 hours. The next audit timestamp is stored in localStorage.",
  },
  {
    q: "What happens to activity log entries when I'm not connected to Google?",
    a: "If no OAuth token is available when you take an action, the log entry is queued in localStorage ('financeops_pending_logs', max 50 entries). A subtle amber toast notifies you once every 2 minutes while entries are pending. When you reconnect Google Sheets, the queue is automatically flushed to the shared Activity Log tab in the portal logs sheet — no manual action needed. You can also view the queue size on the Service Limits & Usage page (Pending Log Queue card).",
  },
  {
    q: "How do I monitor browser storage usage?",
    a: "Go to ⚙️ → Service Limits & Usage. The live metrics cards show: total localStorage used (vs 5MB limit), Drive link cache (count and size of cached bill Drive URLs with a Clear button), and Pending Log Queue (entries waiting to sync). Snapshots are taken every 2 hours when the page is open — compare up to 12 checkpoints to track growth over time.",
  },
  {
    q: "Are GAS dashboard URLs (CurcuminPRO, Ziglar, 4YR, MSDx) shared across all users?",
    a: "Yes, as of the latest update. GAS dashboard URL changes are written to the shared '_config' tab in the portal logs sheet, so all users on all devices see the same URLs immediately. Previously, URL changes were stored only on the Render server (lost on deploy) and in browser localStorage (device-specific).",
  },
  {
    q: "What does the Integration Test check?",
    a: "The Portal Integration Test (⚙️ → Settings & Data Sync → 'Run Integration Test') runs 8 server-side checks in real time: (1) server data is loaded, (2) AP bills exist, (3) AP bills span multiple entities, (4) bills have required fields, (5) bank accounts loaded, (6) loans loaded, (7) AR items loaded, (8) last sync timestamp present. Each check shows a green ✅ or red ✗ with a detail note. No OAuth token required — the server checks its own cached data. Use this after a deploy or after making config changes to confirm everything loaded correctly.",
  },
];

/* ── How-To data ──────────────────────────────────────────────────────── */
const HOWTOS = [
  {
    title: "Upload or View a Bill Copy",
    steps: [
      "Find the bill on the AP page and open it (click the bill card to expand).",
      "Click the 📎 (paperclip / upload) icon on the bill card.",
      "Select the bill copy image or PDF from your device.",
      "The file is uploaded to the Bills Root folder in Google Drive, organized by entity and vendor. The Drive URL is written automatically to column AM (Ruby's) or column AA (TI/MSDx) in the sheet.",
      "After upload the 'View Bill Copy' button appears on the bill card. Click it to open the file in Drive.",
      "To view an already-uploaded copy: click 'View Bill Copy' on any bill that has one. If the button is missing after a Pull All, check that column AM/AA in the sheet has the correct Drive URL for that row.",
      "To remove a bill copy link: clear the cell in column AM/AA in the sheet directly, then do a Pull All. The portal reads the sheet as the single source of truth — clearing the cell removes the link.",
    ],
  },
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
      "After sign-in, the portal automatically runs a full Pull All within 1 second — you get live data from Google Sheets immediately without any manual step.",
      "To manually pull at any time: click the ⟳ Refresh button in any page header to re-fetch that module's data.",
      "For a full sync across all modules (including bill copy Drive links), go to ⚙️ → Settings & Data Sync and hit 'Pull Live from Sheets'.",
      "A toast notification will confirm success or report any partial failures.",
      "Bill copy Drive links are read from column AM (Ruby's) or column AA (TI/MSDx) on every Pull All — no separate step needed.",
    ],
  },
  {
    title: "Update a Bank Balance",
    steps: [
      "Go to Bank Balances → switch to Table View (top-right toggle).",
      "Click the ✏️ Edit (pencil) icon on the row you want to update.",
      "A popup modal appears showing the current balance — enter the new balance and click 'Save Balance' (or press Enter).",
      "The change writes immediately to the Google Sheet and the portal updates in real-time.",
      "The Yesterday column shows the balance before the last update.",
      "Every day at 6pm Philippine Standard Time, the portal automatically copies all current balances into the Yesterday column in the sheet — no manual step needed.",
    ],
  },
  {
    title: "Reconnect Google Sheets After Token Expiry",
    steps: [
      "Look for the amber 'Google Auth' toast at the bottom of the screen.",
      "Click 'Reconnect Google Sheets' inside the toast.",
      "Complete the Google sign-in flow in the popup.",
      "No login screen appears on page load — the portal opens directly to your cached data.",
      "All live sheet read/write operations (Pull All, balance updates, AR writes) require a valid Google token; they will fail silently until you reconnect.",
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
      "Open the Email Invoice Scanner from the sidebar.",
      "Click 'Connect Inbox' and authorize read-only Gmail access. (Requires Gmail API enabled in Google Cloud Console for the GCP project.)",
      "Click 'Scan Inbox' — searches all matching financial emails from the last 30 days with no cap.",
      "Review each email in the queue. Nothing is saved at this step.",
      "Emails WITH PDF/image attachments: click 'Scan & Create' → choose 'Create as Bill' or 'Create as Invoice'. Gemini AI extracts all fields automatically.",
      "Emails WITHOUT attachments: click 'Create AP Bill' or 'Create AR Invoice' directly — a form pre-filled from the email subject and sender opens.",
      "Review and confirm every field before clicking 'Confirm & Create' — only then is the record saved.",
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
  {
    title: "Review the Portal Health Audit",
    steps: [
      "The audit modal appears automatically 2.5 seconds after data loads, if 48 hours have passed since the last audit.",
      "Findings are grouped by severity: 🔴 Critical (needs immediate attention), 🟡 Warning (review soon), 🔵 Improvement (optional optimization).",
      "Click the action button on any finding to navigate directly to the affected page.",
      "Click 'Dismiss for 2 days' to close the modal — the next audit will run 48 hours later.",
      "The audit checks: AP overdue >60 days, negative bank balances, past-due loans, AR overdue >90 days, recent sync errors, data freshness, and large AP backlogs.",
    ],
  },
  {
    title: "Run the Integration Test",
    steps: [
      "Go to ⚙️ → Settings & Data Sync.",
      "Scroll to the 'Portal Integration Test' section (violet, above Sheet Continuity).",
      "Click 'Run Integration Test' — the server checks its live data and returns results in a few seconds.",
      "Each check shows green ✅ (pass) or red ✗ (fail) with a detail note (e.g. '375 bills found').",
      "A summary pill in the section header shows 'All 8 checks passed' or how many failed.",
      "Run this after every deploy, after switching Google Sheets, or any time you suspect data didn't load.",
      "You can also double-click run-tests.bat (in the project root) from Windows Explorer to run the full Vitest suite against the Render URL from your machine.",
    ],
  },
  {
    title: "Monitor Storage Usage & Clear Drive Link Cache",
    steps: [
      "Go to ⚙️ → Service Limits & Usage.",
      "Click 'Check Now' to take an immediate snapshot of all usage metrics.",
      "Find the 'Drive Link Cache' card — it shows how many bill Drive URLs are cached and their total size.",
      "If the cache is large (hundreds of entries), click 'Clear' on the Drive Link Cache card — a confirmation prompt will appear.",
      "Drive links will be re-fetched automatically from Google Sheets on the next sync.",
      "The 'Pending Log Queue' card shows any activity log entries queued while offline — they auto-sync when you reconnect Google.",
    ],
  },
  {
    title: "Update a GAS Dashboard URL (shared across all users)",
    steps: [
      "Click the ⚙️ gear icon and find the GAS Dashboard URL settings.",
      "Enter the new Google Apps Script web app URL for the dashboard.",
      "Save — the URL is written to both your browser localStorage AND the shared '_config' tab in the portal logs Google Sheet.",
      "All other users will see the updated URL the next time they load the portal (it's read from the config sheet on startup after sign-in).",
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
  { symptom: "Sheet mappings reset to defaults after everyone signs in", cause: "'_config' tab deleted from portal logs sheet", fix: "Re-create the '_config' tab in the logs sheet (ID: 19ColN3UOnuGbk1CkHtZswxPZf7oj7Zs2pKaqmGlN4m8) — the portal will auto-recreate it and re-populate on the next mapping save" },
  { symptom: "Activity log entries missing from logs sheet", cause: "No Google token when actions were taken (offline / before sign-in)", fix: "Entries are queued in localStorage. Sign in to Google — the queue flushes automatically. Check the Pending Log Queue card on Service Limits & Usage." },
  { symptom: "Other browser tab shows stale data", cause: "BroadcastChannel not supported (very old browser)", fix: "Manually click Sync / Refresh on the stale tab. BroadcastChannel is supported in all modern browsers (Chrome 54+, Firefox 38+, Safari 15.4+)." },
  { symptom: "'View Bill Copy' button missing after Pull All", cause: "Column AM (Ruby's) or AA (TI/MSDx) is blank or has a non-Drive URL in the sheet", fix: "Check the cell in the sheet. The URL must start with https://drive.google.com or https://docs.google.com. Uploading via the 📎 icon on the bill card writes the correct URL automatically." },
  { symptom: "Deleted bill copy link keeps reappearing", cause: "Old versions used a hardcoded KNOWN_DRIVE_FILES list and stale localStorage that re-applied deleted links — both have been removed", fix: "Hard-refresh the portal (Ctrl+Shift+R), sign in, then do a Pull All. If the link still appears, check that the cell in column AM/AA is truly empty (not just visually cleared) in the sheet." },
  { symptom: "Bill copy uploaded but 'View Bill Copy' never appears", cause: "Upload succeeded but the portal cache from before the upload is still showing", fix: "Click Pull All (⚙️ → Settings & Data Sync → Pull Live from Sheets). The Drive URL written to the sheet during upload will be read and the button will appear." },
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
      { name: "Ruby's Bills",         gid: "1244424272", note: "AP bills — Ruby's Pizzeria & Grill (Drive link: col AM)" },
      { name: "TI Bills",             gid: "1881273371", note: "AP bills — Timm Investments (Drive link: col AA)" },
      { name: "MSDx Bills",           gid: "626198915",  note: "AP bills — Mobile Swallowing Dx (Drive link: col AA)" },
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
    gradient: "from-[#0d3d38] to-[#062420]",
    glow: "rgba(13,148,136,0.18)",
    accent: "#2dd4bf",
    border: "border-teal-500/25",
    badgeBg: "bg-teal-500/10",
    badgeText: "text-teal-400",
    purpose: "Finance & schedule events · Calendar notes",
    tabs: [
      { name: "Events", gid: "0",          note: "Primary calendar events (read & write)" },
      { name: "Notes",  gid: "1248704539", note: "Calendar notes (read-only)" },
    ],
  },
  {
    name: "⛔ Portal Logs Sheet",
    id: "19ColN3UOnuGbk1CkHtZswxPZf7oj7Zs2pKaqmGlN4m8",
    emoji: "📋",
    gradient: "from-[#1a1a1a] to-[#0a0a0a]",
    glow: "rgba(148,163,184,0.12)",
    accent: "#94a3b8",
    border: "border-slate-600/25",
    badgeBg: "bg-slate-500/10",
    badgeText: "text-slate-400",
    purpose: "Centralized login history & activity log — all users, all sessions",
    tabs: [
      { name: "Login History", gid: "dynamic", note: "Every sign-in: timestamp, email, device, IP, location" },
      { name: "Activity Log",  gid: "dynamic", note: "Every portal action: create, edit, delete, scan" },
    ],
  },
];

const SERVICE_FILES = [
  { file: "googleSheetsService.ts",   path: "src/services/", role: "All Sheets API calls, all parsers, all column maps", color: "#4da3ff" },
  { file: "liveSheetsFetcher.ts",     path: "src/services/", role: "Full dataset fetch used by Pull All — reads driveViewUrl from col AM (Ruby's) and col AA (TI/MSDx)", color: "#4da3ff" },
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
        <div className="p-5 max-w-6xl w-full mx-auto">

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

              {/* FAQ + How-To's side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-2">
                {/* Left column: FAQ */}
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-[.12em] mb-3 ${muted}`}>Frequently Asked Questions</p>
                  <div className="space-y-2">
                    {FAQ.map((item) => (
                      <FAQItem key={item.q} q={item.q} a={item.a} isLight={isLight} />
                    ))}
                  </div>
                </div>
                {/* Right column: How-To's */}
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-[.12em] mb-3 ${muted}`}>How-To Guides</p>
                  <div className="space-y-2">
                    {HOWTOS.map((item, i) => (
                      <HowToItem key={item.title} title={item.title} steps={item.steps} isLight={isLight} index={i} />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ════ REFERENCE TAB ════ */}
          {activeTab === "reference" && (
            <>
              {/* Breakage scenarios — moved here from Help tab, folded by default */}
              <Section title="Common Breakage Scenarios & Fixes" iconBg="bg-red-500/15" isLight={isLight}
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

              {/* Spreadsheet structure */}
              <Section title="Spreadsheet Structure" iconBg="bg-[#1a73e8]/15" isLight={isLight}
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
                    { key: "GEMINI_API_KEY",    note: "Required — powers all AI scanning (bill, invoice, timesheet, email, PDF). Set in Render dashboard." },
                    { key: "OPENAI_API_KEY",    note: "Optional — if set, vision-capable image scanning falls back to GPT-4o-mini for non-PDF attachments. Gemini is used for PDFs regardless." },
                    { key: "Firebase config",   note: "Hardcoded in src/services/googleAuth.ts — acceptable for public Firebase config (not a secret)." },
                    { key: "GCP OAuth Client",  note: "Client ID: 982066512597-d2gruoitkbcvuha47rdbqk0muaf0bm61.apps.googleusercontent.com — GCP project: gen-lang-client-0190927685. Authorized JS origin must include the Render URL." },
                  ].map((v) => (
                    <div key={v.key} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${border} ${cardBg}`}>
                      <code className="text-[11px] font-mono font-bold text-amber-500 shrink-0 mt-0.5">{v.key}</code>
                      <p className={`text-[11px] leading-relaxed ${td}`}>{v.note}</p>
                    </div>
                  ))}
                </div>
                <p className={`text-[10px] mt-4 ${muted}`}>Last updated 2026-08-26 — keep in sync whenever sheet structure or GCP credentials change.</p>
              </Section>

              {/* ── Tech Stack ── */}
              <Section title="Tech Stack" iconBg="bg-violet-500/15" isLight={isLight}
                icon={<Layers className="w-4 h-4 text-violet-400" />}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: "Frontend", color: "#a78bfa", items: [
                      "React 19 + TypeScript",
                      "Vite 6 (build + dev server)",
                      "Tailwind CSS v4 (@tailwindcss/vite plugin)",
                      "Lucide React (icons)",
                      "Recharts (charts in Hub, Payroll)",
                      "Motion / framer-motion v12",
                      "pdfjs-dist, tesseract.js (PDF & OCR tools)",
                      "html2canvas, html-to-image (screenshots)",
                      "xlsx (spreadsheet export)",
                    ]},
                    { label: "Backend", color: "#4da3ff", items: [
                      "Express 4 (server.ts — API + SPA host)",
                      "tsx (dev runtime), esbuild (production bundle)",
                      "googleapis (Sheets API v4, Drive API)",
                      "firebase (Auth login gate)",
                      "@google/genai (Gemini AI)",
                      "dotenv, vitest",
                      "Single process: Express serves API + built React SPA",
                      "In-memory data store — no database, Sheets is source of truth",
                    ]},
                  ].map(({ label, color, items }) => (
                    <div key={label} className={`rounded-xl border p-4 space-y-2 ${border} ${cardBg}`}>
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{label}</p>
                      <ul className="space-y-1">
                        {items.map(item => (
                          <li key={item} className={`text-[11px] flex items-start gap-2 ${td}`}>
                            <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: color }} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Page Routes ── */}
              <Section title="Page Routes" iconBg="bg-emerald-500/15" isLight={isLight}
                icon={<GitBranch className="w-4 h-4 text-emerald-400" />}
              >
                <p className={`text-[11px] mb-3 ${td}`}>No React Router — navigation is a <code className={`px-1 py-0.5 rounded text-[10px] font-mono ${codeBg}`}>currentPage</code> string in FinanceContext. <code className={`px-1 py-0.5 rounded text-[10px] font-mono ${codeBg}`}>setCurrentPage(route)</code> is called from sidebar buttons; <code className={`px-1 py-0.5 rounded text-[10px] font-mono ${codeBgBlu}`}>App.tsx</code> routes via a switch.</p>
                <div className={tableWrap}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className={`${cardBg} border-b ${border}`}>
                        <th className={`text-left px-3.5 py-2.5 font-bold ${th} w-[30%]`}>Route key</th>
                        <th className={`text-left px-3.5 py-2.5 font-bold ${th}`}>Page / Component</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { r: '"hub"',                  d: 'HubPage — KPI cards, AP summary chart, bank totals, recent activity' },
                        { r: '"ap"',                   d: 'APPage — full bill table, entity filter, bucket grouping, inline edit' },
                        { r: '"ap-calendar"',          d: 'PayablesCalendarPage — weekly 7-day grid of bills by due date, entity colors, week navigation' },
                        { r: '"rubys" / "ti"',         d: 'APPage with filterEntityOverride — entity-scoped AP view' },
                        { r: '"banks"',                d: 'BankBalancesPage — account cards per entity, trend indicators' },
                        { r: '"loans"',                d: 'LoansPage — loan cards with outstanding / monthly / maturity' },
                        { r: '"ar"',                   d: 'ARPage — AR invoice checklist (invoice / approval / sent / payment)' },
                        { r: '"statements"',           d: 'BankStatementsPage — monthly statement download checklist' },
                        { r: '"payroll"',              d: 'PayrollPage — weekly pivot from payroll sheet, entity breakdown' },
                        { r: '"calendar"',             d: 'CalendarPage — monthly view, AP due dates, events from Calendar Sheet (calendarLocalEvents)' },
                        { r: '"msdx" / "curcumin" / "fouryr" / "ziglar"', d: 'GasDashboardView — full-page iframe of GAS web app URL from gasUrls' },
                        { r: '"datasync"',             d: 'DataSyncPage — Settings & Data Sync (gear icon)' },
                        { r: '"cc-expenses"',          d: 'CCExpensePage — credit card transactions, adjustments, reconciliation' },
                        { r: '"fouryr-payroll"',       d: 'FourYrPayrollPage — 4YR raw payroll data view' },
                        { r: '"workspace-*"',          d: 'WorkspacePage — Tools / Platforms / Drive tabbed view' },
                        { r: '"member-workspace"',     d: 'MemberWorkspacePage — per-member (Norlan, Micah, Monica) workspace' },
                        { r: '"notes"',                d: 'NotesPage — full notes page (floating widget also shown on all pages)' },
                        { r: '"logs"',                 d: 'LogsPage — action audit log' },
                        { r: '"service-limits"',       d: 'ServiceLimitsPage — Google API quota / usage tracker' },
                        { r: '"help"',                 d: 'HelpPage — this page (FAQ, how-tos, reference docs)' },
                        { r: '"receipt-renamer" / "bank-statement" / "pdf-table-extractor" / "email-scanner"', d: 'Tool pages — AI OCR/parsing utilities, from Workspace → Tools' },
                      ].map(({ r, d }, i) => (
                        <tr key={r} className={`border-t ${border} transition-colors ${rowHover} ${i % 2 === 0 ? rowEven : rowOdd}`}>
                          <td className={`px-3.5 py-2 font-mono font-bold text-[10px] ${isLight ? "text-violet-600" : "text-violet-400"}`}>{r}</td>
                          <td className={`px-3.5 py-2 ${td}`}>{d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* ── Data Models ── */}
              <Section title="Data Models (types.ts)" iconBg="bg-amber-500/15" isLight={isLight}
                icon={<Database className="w-4 h-4 text-amber-400" />}
              >
                <p className={`text-[11px] mb-3 ${td}`}>All TypeScript interfaces live in <code className={`px-1 py-0.5 rounded text-[10px] font-mono ${codeBgBlu}`}>src/types.ts</code>. Key fields below — see the file for the full shape.</p>
                <div className="space-y-3">
                  {[
                    { name: "APBill", color: "#a78bfa", fields: [
                      "id, vendor, entity, amount, dueDate, paidDate, method, status",
                      'status: "unpaid" | "paid" | "hold"',
                      "bucket: APBucket (computed client-side from dueDate — NOT in sheet)",
                      "sheet, row (for per-cell write-back to Google Sheets)",
                      "driveViewUrl, driveFileName (attached bill file in Drive)",
                    ]},
                    { name: "BankAccount", color: "#4da3ff", fields: [
                      "id, entity, bank, type, acct, balance, asOf, status, trend, yesterday, row",
                    ]},
                    { name: "Loan", color: "#34d399", fields: [
                      "id, entity, lender, purpose, principal, outstanding, monthly, nextPay, maturity, status, row",
                    ]},
                    { name: "ARItem", color: "#f59e0b", fields: [
                      "id, entity, customer, occurrence, description, month",
                      "invoice, approval, sent, payment (boolean checklist columns)",
                      "dueDate, amount, remarks, row",
                    ]},
                    { name: "SheetMappingConfig", color: "#94a3b8", fields: [
                      "id, module, name, spreadsheetIdOrUrl, tabName",
                      "range field exists in model but is NOT used by liveSheetsFetcher — fetcher uses tab name only (full sheet)",
                    ]},
                    { name: "CalendarLocalEvent", color: "#34d399", fields: [
                      "id, createdDate, weekLabel, date, time, entity, vendor",
                      "description, done, completedAt, row",
                      "Source: Calendar Google Sheet (Events tab) — read via liveSheetsFetcher",
                      "Sheet columns: A=id, B=source, C=title, D=description, E=start_ms, F=end_ms",
                      "G=allDay, H=calName, I=urgency, J=category, K=assigneeId, L=assigneeName",
                      "M=assigneeColor, N=assigneeIds, O=seriesId, P=done (TRUE/FALSE)",
                      "Timestamps in Manila time (UTC+8); midnight = all-day display",
                    ]},
                    { name: "PortalCalendarEvent", color: "#a78bfa", fields: [
                      "id, title, date (YYYY-MM-DD), time, type, description",
                      "entity, isGoogleEvent, done, urgency, assignee",
                      "Source: server.ts localCalendarEvents (portal-only tasks, not from Sheet)",
                      "Currently empty — all calendar events live in the Calendar Sheet",
                    ]},
                    { name: "ExternalLinkItem", color: "#c084fc", fields: [
                      'id, name, url, category ("entities" | "quicklinks"), iconType',
                      "Drives sidebar Quick Links and entity link sections",
                    ]},
                  ].map(({ name, color, fields }) => (
                    <div key={name} className={`rounded-xl border overflow-hidden ${border}`}>
                      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${border} ${cardBg}`}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <code className="text-[12px] font-mono font-bold" style={{ color }}>{name}</code>
                      </div>
                      <ul className={`px-4 py-3 space-y-1.5 ${isLight ? "bg-slate-50" : "bg-[#070b12]"}`}>
                        {fields.map(f => (
                          <li key={f} className={`text-[11px] font-mono ${td}`}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className={`mt-3 rounded-xl border px-4 py-3 text-[11px] ${border} ${isLight ? "bg-amber-50 text-amber-700" : "bg-amber-900/10 text-amber-400"}`}>
                  <strong>Important:</strong> The <code className="font-mono">bucket</code> field on APBill is computed client-side from <code className="font-mono">dueDate</code> — it is NOT stored in the sheet. Always recompute it during parsing.
                </div>
              </Section>

              {/* ── Design System ── */}
              <Section title="Design System" iconBg="bg-[#1a73e8]/15" isLight={isLight}
                icon={<BarChart3 className="w-4 h-4 text-[#4da3ff]" />}
              >
                <p className={`text-[11px] mb-3 ${td}`}>No external component library. All components are hand-built with Tailwind CSS v4. A CSS token system is defined inline at the top of each page component's <code className={`px-1 py-0.5 rounded text-[10px] font-mono ${codeBg}`}>return()</code> — always after <code className={`px-1 py-0.5 rounded text-[10px] font-mono ${codeBg}`}>const isLight = theme === "light"</code>.</p>

                <div className={`rounded-xl border overflow-hidden ${border} mb-4`}>
                  <div className={`px-4 py-2.5 border-b text-[10px] font-bold uppercase tracking-wider ${border} ${cardBg} ${muted}`}>CSS Token Pattern — copy to every new page</div>
                  <pre className={`p-4 text-[11px] font-mono leading-[1.85] overflow-x-auto ${isLight ? "bg-slate-50 text-slate-600" : "bg-[#070b12] text-[#5a6a80]"}`}>{`const card     = isLight ? "bg-white border-slate-200"       : "bg-[#0d111a] border-[#1a2235]";
const inner    = isLight ? "bg-slate-50 border-slate-200"     : "bg-[#070b12] border-[#1a2235]";
const divider  = isLight ? "border-slate-100"                 : "border-[#1a2235]";
const heading  = isLight ? "text-slate-900"                   : "text-white";
const sub      = isLight ? "text-slate-500"                   : "text-[#888]";
const muted    = isLight ? "text-slate-400"                   : "text-[#555]";
const label    = isLight ? "text-slate-500"                   : "text-[#666]";
const inp      = \`w-full rounded-lg border px-3 py-2 text-xs focus:outline-none \${
  isLight ? "bg-white border-slate-200 text-slate-900 focus:border-[#1a73e8]"
          : "bg-[#070b12] border-[#1a2235] text-white focus:border-[#1a73e8]"}\`;
const btnGhost = \`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 \${
  isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
          : "bg-[#0d111a] hover:bg-[#1a2235] text-[#aaa] hover:text-white border border-[#1a2235]"}\`;`}</pre>
                </div>

                <div className={`rounded-xl border overflow-hidden ${border} mb-4`}>
                  <div className={`px-4 py-2.5 border-b text-[10px] font-bold uppercase tracking-wider ${border} ${cardBg} ${muted}`}>Standard card pattern</div>
                  <pre className={`p-4 text-[11px] font-mono leading-[1.85] overflow-x-auto ${isLight ? "bg-slate-50 text-slate-600" : "bg-[#070b12] text-[#5a6a80]"}`}>{`<div className={\`border rounded-2xl p-6 space-y-4 \${card}\`}>
  <div className="flex items-start gap-3">
    <IconName className="w-4 h-4 text-[#1a73e8] mt-0.5 shrink-0" />
    <div>
      <h3 className={\`text-sm font-bold \${heading}\`}>Section Title</h3>
      <p className={\`text-xs mt-0.5 \${sub}\`}>Subtitle / description</p>
    </div>
  </div>
  {/* content */}
</div>`}</pre>
                </div>

                <div className={`rounded-xl border overflow-hidden ${border}`}>
                  <div className={`px-4 py-2.5 border-b text-[10px] font-bold uppercase tracking-wider ${border} ${cardBg} ${muted}`}>Core color palette (dark theme)</div>
                  <div className={`p-4 grid grid-cols-2 sm:grid-cols-3 gap-2 ${isLight ? "bg-slate-50" : "bg-[#070b12]"}`}>
                    {[
                      { label: "Page bg",     val: "#070b12" },
                      { label: "Card bg",     val: "#0d111a" },
                      { label: "Border",      val: "#1a2235" },
                      { label: "Accent blue", val: "#1a73e8" },
                      { label: "Emerald",     val: "#10b981" },
                      { label: "Amber",       val: "#f59e0b" },
                      { label: "Violet",      val: "#8b5cf6" },
                      { label: "Teal (MSDx)", val: "#14b8a6" },
                      { label: "Danger red",  val: "#ef4444" },
                    ].map(({ label: lbl, val }) => (
                      <div key={lbl} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${border}`}>
                        <span className="w-4 h-4 rounded shrink-0 border border-white/10" style={{ background: val }} />
                        <div>
                          <p className={`text-[10px] font-semibold ${isLight ? "text-slate-700" : "text-slate-300"}`}>{lbl}</p>
                          <p className={`text-[9px] font-mono ${muted}`}>{val}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>

              {/* ── Rebuild Notes ── */}
              <Section title="Rebuild Notes" iconBg="bg-red-500/15" isLight={isLight}
                icon={<Wrench className="w-4 h-4 text-red-400" />}
              >
                <div className="space-y-3">
                  <div className={`rounded-xl border px-4 py-3.5 space-y-2 ${border} ${cardBg}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider text-emerald-500`}>What's complete and working</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                      {[
                        "All pages in the routing table",
                        "Google OAuth 2-way sync (pull + push per module)",
                        "Firebase login gate",
                        "Auto-push (edits instantly write to Sheets)",
                        "Sheet Continuity (usage check, clone, 3-layer switch)",
                        "Bill Copy Recovery (Drive scan → re-link)",
                        "Integration test endpoint + Vitest suite",
                        "Integration Test button in Settings page",
                        "GAS Dashboard iframe views (all 4 entities)",
                        "CC Expenses page (separate CC Expense sheet)",
                        "Portal audit (48-hour health check modal)",
                        "Light/dark theme toggle",
                        "Ctrl+K global search",
                        "Member workspaces (Norlan, Micah, Monica)",
                        "Floating notes widget",
                        "Shared config sheet (cross-user gasUrls, sheetMappings)",
                        "Invoice submission schedule (52 events 2026–2028) in Calendar Sheet",
                        "AR + AP calendar chips grouped per day; paid items auto-hidden",
                      ].map(item => (
                        <div key={item} className={`flex items-start gap-1.5 text-[11px] py-0.5 ${td}`}>
                          <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`rounded-xl border px-4 py-3.5 space-y-2 ${border} ${isLight ? "bg-amber-50" : "bg-amber-900/10"}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider text-amber-500`}>Critical quirks — do not break these</p>
                    <ul className="space-y-2">
                      {[
                        { k: "AP multi-tab merge", v: 'Bills from three tabs (Ruby\'s Bills, TI Bills, MSDX Bills) are merged into one apBills array. Entity is detected from the tab name stored in bill.sheet — not from a column.' },
                        { k: "Per-cell writes use bill.row", v: 'bill.row is a 1-indexed row within the fetched range. Preserve this field — it\'s what makes "mark paid" write to the correct sheet row.' },
                        { k: "getEffectiveDriveToken()", v: 'Caches the last valid OAuth token server-side (~55 min). Required for scheduled sync and the integration test to work without a live browser session.' },
                        { k: "bucket is computed, not stored", v: 'The bucket field (past-due, this-week, paid…) is computed client-side from dueDate. It does NOT exist in the sheet. Always recompute it during parse.' },
                        { k: "Range field is vestigial", v: 'SheetMappingConfig.range exists in the data model but liveSheetsFetcher.ts uses only the tab name (returns full sheet). Do not add row/column limits.' },
                        { k: "GAS URLs are cross-user", v: 'gasUrls changes are written to the shared _config tab in the logs sheet so all users on all devices see the same URLs immediately.' },
                        { k: "Calendar Sheet is the single source", v: 'All calendar events (including the 52 invoice submission events) live in the Calendar Google Sheet Events tab. localCalendarEvents in server.ts is intentionally empty — do not seed events there. The sheet is read via liveSheetsFetcher → calendarLocalEvents. done/assignee columns (P, L) are in the sheet.' },
                        { k: "AR/AP calendar chips are grouped + payment-gated", v: 'AP bills excluded from calendar when status === "paid". AR items excluded when payment === true. Both grouped into one summary chip per day (like "🧾 AR (2)" or "📋 AP Bills (3)") — not individual chips per item. Clicking a chip opens a read-only detail modal listing all items for that day.' },
                      ].map(({ k, v }) => (
                        <li key={k} className="space-y-0.5">
                          <span className={`text-[11px] font-bold ${isLight ? "text-amber-700" : "text-amber-400"}`}>{k}</span>
                          <p className={`text-[11px] ${isLight ? "text-amber-800" : "text-amber-300/70"}`}>{v}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Section>
            </>
          )}

        </div>
      </div>
    </div>
  );
};
