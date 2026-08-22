import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  BookOpen, Database, Table2, AlertTriangle, ChevronDown, ChevronRight,
  ExternalLink, Server, FileText, GitBranch, Layers, BarChart3
} from "lucide-react";

/* ── Sheet reference data ──────────────────────────────────────────────── */
const SHEETS = [
  {
    name: "Main F&A Sheet",
    id: "15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs",
    emoji: "📋",
    accent: "#1a73e8",
    purpose: "AP, AR, Banks, Loans, Statements, Notes, Metadata, Headley's",
    tabs: [
      { name: "Ruby's Bills",         gid: "1244424272", note: "AP bills — Ruby's Pizzeria" },
      { name: "TI Bills",             gid: "1881273371", note: "AP bills — Timm Investments" },
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
    accent: "#10b981",
    purpose: "4You Pros raw payroll data",
    tabs: [
      { name: "Raw payroll tab", gid: "1484569924", note: "Weekly payroll entries — read by fourYrPayrollService.ts" },
    ],
  },
  {
    name: "Calendar Sheet",
    id: "1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo",
    emoji: "📅",
    accent: "#8b5cf6",
    purpose: "Finance & schedule events",
    tabs: [
      { name: "Events", gid: "0",          note: "Primary calendar events" },
      { name: "Notes",  gid: "1248704539", note: "Calendar notes (read-only)" },
    ],
  },
];

const BREAKAGE = [
  { symptom: "AP bills load empty",       cause: "Tab renamed from Ruby's Bills / TI Bills / MSDx Bills", fix: "Restore exact tab name OR update AP_COL_MAPS.dataRange in googleSheetsService.ts" },
  { symptom: "AP amounts show wrong",      cause: "Column added/removed in AP tab",                        fix: "Update the relevant entry in AP_COL_MAPS (0-indexed)" },
  { symptom: "Notes don't sync",           cause: "Meeting Notes tab renamed",                              fix: "Restore tab name OR update tabName default in appendNoteToSheet / writeSingleNote / clearNoteRow" },
  { symptom: "Calendar empty",             cause: "Events tab renamed or moved",                            fix: "Restore OR update CAL_TAB_CANDIDATES in liveSheetsFetcher.ts" },
  { symptom: "Banks/Loans/AR wrong data",  cause: "Column headers changed in sheet",                        fix: "Update regex patterns in parseBankSheetRows / parseLoanSheetRows / parseARSheetRows" },
  { symptom: "MetaData tool breaks",       cause: "Columns shifted in Metadata tab",                        fix: "Update META_READ / META_WRITE in src/components/modals/GearDropdown.tsx" },
  { symptom: "Headley's import fails",     cause: "Header row moved or text changed",                       fix: 'Parser looks for a row with "charging bu", "debit", and "credit" — restore those strings' },
  { symptom: "Portal takes 30-60 s",       cause: "Render free tier woke from sleep",                       fix: "Normal behaviour — upgrade to Render Starter ($7/mo) to eliminate" },
];

const SERVICE_FILES = [
  { file: "src/services/googleSheetsService.ts",    role: "All Sheets API calls, all parsers, all column maps" },
  { file: "src/services/liveSheetsFetcher.ts",      role: "Full dataset fetch used by the sync button" },
  { file: "src/services/googleCalendarService.ts",  role: "Calendar sheet reads/writes + Google Calendar API" },
  { file: "src/services/fourYrPayrollService.ts",   role: "4YR Payroll-specific reads/writes" },
  { file: "src/services/googleAuth.ts",             role: "Firebase Auth, Google OAuth, token refresh" },
  { file: "src/services/logsSheetService.ts",       role: "Activity log sheet appends" },
  { file: "src/context/FinanceContext.tsx",         role: "All state, all mutations, sync orchestration" },
  { file: "src/utils/apiCounter.ts",               role: "Lightweight daily read/write call counter" },
];

/* ── Sub-components ────────────────────────────────────────────────────── */
const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }> = ({
  title, icon, children, defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[#1a2235] overflow-hidden mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-[#0d111a] hover:bg-[#111827] transition-colors text-left"
      >
        <span className="flex items-center gap-2.5 text-sm font-bold text-[#c8d4e8]">
          <span className="text-[#1a73e8]">{icon}</span>
          {title}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-[#4a5a6e]" /> : <ChevronRight className="w-4 h-4 text-[#4a5a6e]" />}
      </button>
      {open && <div className="px-5 py-4 bg-[#070b12] border-t border-[#1a2235]">{children}</div>}
    </div>
  );
};

/* ── Main page ─────────────────────────────────────────────────────────── */
export const HelpPage: React.FC = () => {
  const { theme } = useFinance();
  const isLight = theme === "light";

  const bg   = isLight ? "bg-slate-100"  : "bg-[#070b12]";
  const card = isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#0d111a] border-[#1a2235] text-[#e8e8e8]";
  const muted = isLight ? "text-slate-500" : "text-[#5a6a80]";
  const codeBg = isLight ? "bg-slate-100 text-slate-700" : "bg-[#111827] text-[#7dd3fc]";

  return (
    <div className={`flex-1 flex flex-col h-full overflow-y-auto ${bg}`}>
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#1a2235] bg-[#060a11]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#1a73e8]/10 border border-[#1a73e8]/20">
            <BookOpen className="w-5 h-5 text-[#1a73e8]" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">Help &amp; Reference</h1>
            <p className={`text-[11px] ${muted}`}>Sheet structure, column maps, breakage scenarios, and service files</p>
          </div>
        </div>
      </div>

      <div className="p-5 max-w-4xl w-full mx-auto">

        {/* Quick links to sheets */}
        <p className={`text-[10px] font-bold uppercase tracking-widest ${muted} mb-3`}>Open Spreadsheets</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {SHEETS.map((s) => (
            <a
              key={s.name}
              href={`https://docs.google.com/spreadsheets/d/${s.id}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-3 p-3.5 rounded-xl border no-underline transition-all ${
                isLight
                  ? "bg-white border-slate-200 hover:border-blue-300 hover:shadow-md"
                  : "bg-[#0d111a] border-[#1a2235] hover:border-[#1a73e8]/40 hover:bg-[#111827]"
              }`}
            >
              <span className="text-2xl">{s.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold truncate ${isLight ? "text-slate-800" : "text-white"}`}>{s.name}</p>
                <p className={`text-[10px] truncate ${muted}`}>{s.purpose}</p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 shrink-0 text-[#4a5a6e]" />
            </a>
          ))}
        </div>

        {/* Sheets structure */}
        <Section title="Spreadsheet Structure" icon={<Table2 className="w-4 h-4" />} defaultOpen>
          <div className="space-y-5">
            {SHEETS.map((s) => (
              <div key={s.name}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">{s.emoji}</span>
                  <span className={`text-xs font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{s.name}</span>
                  <code className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${codeBg}`}>{s.id.slice(0,20)}…</code>
                </div>
                <div className={`rounded-lg border overflow-hidden ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className={isLight ? "bg-slate-50" : "bg-[#0d111a]"}>
                        <th className={`text-left px-3 py-2 font-bold ${muted}`}>Tab name</th>
                        <th className={`text-left px-3 py-2 font-bold ${muted} hidden sm:table-cell`}>gid</th>
                        <th className={`text-left px-3 py-2 font-bold ${muted}`}>Purpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.tabs.map((t, i) => (
                        <tr key={t.name} className={`border-t ${isLight ? "border-slate-100" : "border-[#111827]"} ${i % 2 === 1 ? (isLight ? "bg-slate-50/50" : "bg-[#0a0e17]") : ""}`}>
                          <td className="px-3 py-2">
                            <a
                              href={t.gid === "dynamic" ? `https://docs.google.com/spreadsheets/d/${s.id}/edit` : `https://docs.google.com/spreadsheets/d/${s.id}/edit#gid=${t.gid}`}
                              target="_blank" rel="noopener noreferrer"
                              className="font-mono font-bold text-[#1a73e8] hover:underline"
                            >
                              {t.name}
                            </a>
                          </td>
                          <td className={`px-3 py-2 font-mono hidden sm:table-cell ${muted}`}>{t.gid}</td>
                          <td className={`px-3 py-2 ${isLight ? "text-slate-600" : "text-[#7a90b0]"}`}>{t.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* AP column map summary */}
        <Section title="AP Column Maps (hardcoded, 0-indexed)" icon={<Layers className="w-4 h-4" />}>
          <p className={`text-[11px] mb-3 leading-relaxed ${muted}`}>
            The AP parser uses <strong>hardcoded column positions</strong> — not header detection.
            If you add or shift columns in the sheet, update <code className={`px-1 rounded font-mono ${codeBg}`}>AP_COL_MAPS</code> in <code className={`px-1 rounded font-mono ${codeBg}`}>src/services/googleSheetsService.ts</code>.
          </p>
          <div className={`rounded-lg border overflow-hidden ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
            <table className="w-full text-[11px]">
              <thead>
                <tr className={isLight ? "bg-slate-50" : "bg-[#0d111a]"}>
                  {["Entity", "Range", "Key columns (0-idx)"].map((h) => (
                    <th key={h} className={`text-left px-3 py-2 font-bold ${muted}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { entity: "Ruby's Bills",  range: "A5:S1504", cols: "D=Vendor, I=DueDate, J=Amount, L=PaidDate, M=Status, S=OnHold" },
                  { entity: "TI Bills",      range: "A7:W1506", cols: "F=Vendor, I=DueDate, J=Amount, K=PaidDate, N=Status, W=OnHold" },
                  { entity: "MSDx Bills",    range: "A6:S1505", cols: "Same layout as Ruby's Bills" },
                ].map((r, i) => (
                  <tr key={r.entity} className={`border-t ${isLight ? "border-slate-100" : "border-[#111827]"} ${i % 2 === 1 ? (isLight ? "bg-slate-50/50" : "bg-[#0a0e17]") : ""}`}>
                    <td className={`px-3 py-2 font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{r.entity}</td>
                    <td className={`px-3 py-2 font-mono ${muted}`}>{r.range}</td>
                    <td className={`px-3 py-2 ${isLight ? "text-slate-600" : "text-[#7a90b0]"}`}>{r.cols}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`text-[10px] mt-3 ${muted}`}>
            Banks, Loans, AR, and Statements use <strong>header-based detection</strong> via regex matching — column order does not matter for those.
          </p>
        </Section>

        {/* Service files */}
        <Section title="Key Service Files" icon={<GitBranch className="w-4 h-4" />}>
          <div className="space-y-1.5">
            {SERVICE_FILES.map((f) => (
              <div key={f.file} className={`flex items-start gap-3 rounded-lg p-2.5 border ${isLight ? "border-slate-100 bg-slate-50" : "border-[#111827] bg-[#0a0e17]"}`}>
                <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#4a5a6e]" />
                <div>
                  <code className={`text-[11px] font-mono font-bold ${isLight ? "text-slate-800" : "text-[#7dd3fc]"}`}>{f.file}</code>
                  <p className={`text-[10px] mt-0.5 ${muted}`}>{f.role}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Data flow */}
        <Section title="Data Flow" icon={<BarChart3 className="w-4 h-4" />}>
          <div className={`rounded-lg border p-4 font-mono text-[11px] leading-relaxed whitespace-pre ${isLight ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-[#0a0e17] border-[#111827] text-[#7a90b0]"}`}>
{`User action in portal
       │
       ▼
FinanceContext.tsx
  • Updates React state immediately
  • Writes to localStorage (offline access)
  • Calls googleSheetsService.ts
       │
       ▼
googleSheetsService.ts
  • fetchSheetValues()  → GET  /v4/spreadsheets/{id}/values/{range}
  • updateSheetValues() → PUT  /v4/spreadsheets/{id}/values/{range}
  • appendSheetValues() → POST /v4/spreadsheets/{id}/values/{range}:append
  • All three bump the daily API counter (apiCounter.ts)
       │
       ▼
Google Sheets API v4 (free tier: 60 req/min per user)`}
          </div>
        </Section>

        {/* Breakage scenarios */}
        <Section title="Common Breakage Scenarios & Fixes" icon={<AlertTriangle className="w-4 h-4" />}>
          <div className="space-y-2">
            {BREAKAGE.map((b) => (
              <div key={b.symptom} className={`rounded-lg border p-3.5 ${isLight ? "border-slate-200 bg-white" : "border-[#1a2235] bg-[#0a0e17]"}`}>
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="text-amber-400 text-xs mt-0.5">⚠</span>
                  <span className={`text-xs font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{b.symptom}</span>
                </div>
                <div className={`text-[11px] ${muted} mb-1`}><strong>Cause:</strong> {b.cause}</div>
                <div className={`text-[11px] text-emerald-600 dark:text-emerald-400`}><strong>Fix:</strong> {b.fix}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Meeting Notes column layout */}
        <Section title="Meeting Notes Column Layout" icon={<Database className="w-4 h-4" />}>
          <p className={`text-[11px] mb-3 ${muted}`}>
            One note per row in the <strong>Meeting Notes</strong> tab. Renaming this tab breaks note sync.
          </p>
          <div className={`rounded-lg border overflow-hidden ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
            <table className="w-full text-[11px]">
              <thead>
                <tr className={isLight ? "bg-slate-50" : "bg-[#0d111a]"}>
                  <th className={`text-left px-3 py-2 font-bold ${muted}`}>Col</th>
                  <th className={`text-left px-3 py-2 font-bold ${muted}`}>Field</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["A", "Note ID (note-{timestamp})"],
                  ["B", "Content / text"],
                  ["C", "Status (done or blank)"],
                  ["D", "Completed timestamp"],
                  ["E", "Created timestamp"],
                  ["F", "Author (user email)"],
                  ["G", "Color label"],
                  ["H", "Priority flag"],
                ].map(([col, field], i) => (
                  <tr key={col} className={`border-t ${isLight ? "border-slate-100" : "border-[#111827]"} ${i % 2 === 1 ? (isLight ? "bg-slate-50/50" : "bg-[#0a0e17]") : ""}`}>
                    <td className={`px-3 py-2 font-mono font-bold ${isLight ? "text-slate-800" : "text-[#7dd3fc]"}`}>{col}</td>
                    <td className={`px-3 py-2 ${isLight ? "text-slate-600" : "text-[#7a90b0]"}`}>{field}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Environment variables */}
        <Section title="Environment Variables (Render)" icon={<Server className="w-4 h-4" />}>
          <div className={`rounded-lg border overflow-hidden ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
            <table className="w-full text-[11px]">
              <thead>
                <tr className={isLight ? "bg-slate-50" : "bg-[#0d111a]"}>
                  <th className={`text-left px-3 py-2 font-bold ${muted}`}>Variable</th>
                  <th className={`text-left px-3 py-2 font-bold ${muted}`}>Where used</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["GEMINI_API_KEY", "AI features — set in Render dashboard, never hardcode"],
                  ["Firebase config", "Hardcoded in src/services/googleAuth.ts (acceptable for public Firebase config)"],
                ].map(([v, u], i) => (
                  <tr key={v} className={`border-t ${isLight ? "border-slate-100" : "border-[#111827]"} ${i % 2 === 1 ? (isLight ? "bg-slate-50/50" : "bg-[#0a0e17]") : ""}`}>
                    <td className={`px-3 py-2 font-mono font-bold ${isLight ? "text-slate-800" : "text-[#7dd3fc]"}`}>{v}</td>
                    <td className={`px-3 py-2 ${isLight ? "text-slate-600" : "text-[#7a90b0]"}`}>{u}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`text-[10px] mt-3 ${muted}`}>
            Last updated: 2026-08-22. Keep this in sync whenever sheet structure changes.
          </p>
        </Section>

      </div>
    </div>
  );
};
