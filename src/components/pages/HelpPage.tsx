import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  BookOpen, ExternalLink, ChevronDown, ChevronRight,
  Table2, Layers, GitBranch, AlertTriangle, Server,
  FileText, BarChart3, Database, ArrowRight
} from "lucide-react";

/* ── Data ─────────────────────────────────────────────────────────────── */
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

/* ── Collapsible section ────────────────────────────────────────────────── */
const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  isLight: boolean;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, icon, iconBg, isLight, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);

  const headerBg = isLight
    ? "bg-white hover:bg-slate-50"
    : "bg-[#0d111a] hover:bg-[#111827]";
  const borderCol = isLight ? "border-slate-200" : "border-[#1a2235]";
  const titleCol  = isLight ? "text-slate-800"   : "text-white";
  const chevBg    = isLight ? "bg-slate-100 group-hover:bg-slate-200" : "bg-[#1a2235] group-hover:bg-[#243050]";
  const chevCol   = isLight ? "text-slate-400"   : "text-[#5a6a80]";
  const bodyBg    = isLight ? "bg-slate-50"      : "bg-[#070b12]";

  return (
    <div className={`rounded-2xl border overflow-hidden mb-4 shadow-[0_2px_16px_rgba(0,0,0,.12)] ${borderCol}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 transition-colors text-left group ${headerBg}`}
      >
        <span className="flex items-center gap-3">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
            {icon}
          </span>
          <span className={`text-[13px] font-bold ${titleCol}`}>{title}</span>
        </span>
        <span className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${chevBg}`}>
          {open
            ? <ChevronDown  className={`w-3.5 h-3.5 ${chevCol}`} />
            : <ChevronRight className={`w-3.5 h-3.5 ${chevCol}`} />}
        </span>
      </button>
      {open && (
        <div className={`px-5 py-5 border-t ${borderCol} ${bodyBg}`}>
          {children}
        </div>
      )}
    </div>
  );
};

/* ── Main page ──────────────────────────────────────────────────────────── */
export const HelpPage: React.FC = () => {
  const { theme } = useFinance();
  const isLight = theme === "light";

  /* ── Semantic tokens ── */
  const pageBg    = isLight ? "bg-slate-100"    : "bg-[#070b12]";
  const cardBg    = isLight ? "bg-white"         : "bg-[#0d111a]";
  const border    = isLight ? "border-slate-200" : "border-[#1a2235]";
  const rowEven   = isLight ? "bg-white"         : "bg-[#070b12]";
  const rowOdd    = isLight ? "bg-slate-50"      : "bg-[#09101a]";
  const rowHover  = isLight ? "hover:bg-blue-50/40" : "hover:bg-[#0d111a]";
  const th        = isLight ? "text-slate-400"   : "text-[#3a4a5e]";
  const td        = isLight ? "text-slate-600"   : "text-[#5a6a80]";
  const strong    = isLight ? "text-slate-900"   : "text-white";
  const muted     = isLight ? "text-slate-400"   : "text-[#3a4a5e]";
  const codeBg    = isLight ? "bg-slate-100 text-slate-700" : "bg-[#111827] text-violet-400";
  const codeBgBlue = isLight ? "bg-slate-100 text-blue-600" : "bg-[#111827] text-[#4da3ff]";
  const tableWrap = `rounded-xl border overflow-hidden ${border} shadow-[0_2px_12px_rgba(0,0,0,.08)]`;

  return (
    <div className={`flex-1 flex flex-col h-full overflow-y-auto ${pageBg}`}>

      {/* ── Page header ── */}
      <div
        className={`relative overflow-hidden px-6 py-6 border-b ${border}`}
        style={{ background: isLight
          ? "linear-gradient(135deg,#e8f0fe 0%,#f8faff 60%)"
          : "linear-gradient(135deg,#0a1628 0%,#070b12 60%)" }}
      >
        <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle,#1a73e8 0%,transparent 70%)" }} />
        <div className="relative flex items-center gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0
            bg-gradient-to-br from-[#1a3a6b] to-[#0d1f40]
            border border-[#1a73e8]/30
            shadow-[0_0_0_1px_rgba(26,115,232,.15),0_4px_20px_rgba(26,115,232,.2)]`}>
            <BookOpen className="w-5 h-5 text-[#4da3ff]" />
          </div>
          <div>
            <h1 className={`text-[15px] font-extrabold leading-tight ${strong}`}>Help &amp; Reference</h1>
            <p className={`text-[11px] mt-0.5 ${muted}`}>Sheet structure · Column maps · Breakage fixes · Service files</p>
          </div>
        </div>
      </div>

      <div className="p-5 max-w-4xl w-full mx-auto">

        {/* ── Sheet access cards ── */}
        <p className={`text-[10px] font-bold uppercase tracking-[.12em] mb-3 ${muted}`}>Source Spreadsheets</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {SHEETS.map((s) => (
            <a
              key={s.name}
              href={`https://docs.google.com/spreadsheets/d/${s.id}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className={`group relative flex flex-col gap-3 p-4 rounded-2xl border no-underline transition-all
                bg-gradient-to-br ${s.gradient} ${s.border}
                shadow-[0_2px_16px_rgba(0,0,0,.3),inset_0_1px_0_rgba(255,255,255,.05)]
                hover:shadow-[0_4px_24px_rgba(0,0,0,.4)] hover:scale-[1.02]`}
              style={{ boxShadow: `0 0 0 1px rgba(0,0,0,.3), 0 2px 16px rgba(0,0,0,.3), 0 0 40px ${s.glow}` }}
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

        {/* ── Spreadsheet structure ── */}
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
                            <a
                              href={t.gid === "dynamic"
                                ? `https://docs.google.com/spreadsheets/d/${s.id}/edit`
                                : `https://docs.google.com/spreadsheets/d/${s.id}/edit#gid=${t.gid}`}
                              target="_blank" rel="noopener noreferrer"
                              className={`font-mono font-bold hover:underline ${s.badgeText}`}
                            >
                              {t.name}
                            </a>
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

        {/* ── AP column maps ── */}
        <Section title="AP Column Maps (hardcoded, 0-indexed)" iconBg="bg-violet-500/15" isLight={isLight}
          icon={<Layers className="w-4 h-4 text-violet-400" />}
        >
          <p className={`text-[11px] leading-relaxed mb-4 ${td}`}>
            The AP parser uses <strong className={strong}>hardcoded column positions</strong> — not header detection.
            If you add or shift columns in the sheet, update{" "}
            <code className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${codeBg}`}>AP_COL_MAPS</code>
            {" "}in{" "}
            <code className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${codeBgBlue}`}>googleSheetsService.ts</code>.
          </p>
          <div className={tableWrap}>
            <table className="w-full text-[11px]">
              <thead>
                <tr className={`${cardBg} border-b ${border}`}>
                  {["Entity", "Range", "Key columns (0-indexed)"].map((h) => (
                    <th key={h} className={`text-left px-3.5 py-2.5 font-bold ${th}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { entity: "Ruby's Bills", range: "A5:S1504", cols: "D=Vendor  I=DueDate  J=Amount  L=PaidDate  M=Status  S=OnHold" },
                  { entity: "TI Bills",     range: "A7:W1506", cols: "F=Vendor  I=DueDate  J=Amount  K=PaidDate  N=Status  W=OnHold" },
                  { entity: "MSDx Bills",   range: "A6:S1505", cols: "Same layout as Ruby's Bills" },
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

        {/* ── Data flow ── */}
        <Section title="Data Flow" iconBg="bg-emerald-500/15" isLight={isLight}
          icon={<BarChart3 className="w-4 h-4 text-emerald-400" />}
        >
          <div className={`rounded-xl border overflow-hidden ${border}`}>
            <pre className={`p-4 font-mono text-[11px] leading-[1.9] whitespace-pre overflow-x-auto
              ${isLight ? "bg-slate-50 text-slate-500" : "bg-[#070b12] text-[#5a6a80]"}`}>
{`User action in portal
       │
       ▼
`}<span className={strong + " font-bold"}>{"FinanceContext.tsx"}</span>{`
  • Updates React state immediately
  • Writes to localStorage (offline access)
  • Calls googleSheetsService.ts
       │
       ▼
`}<span className="text-[#4da3ff] font-bold">{"googleSheetsService.ts"}</span>{`
  • fetchSheetValues()   → GET  /v4/spreadsheets/{id}/values/{range}
  • updateSheetValues()  → PUT  /v4/spreadsheets/{id}/values/{range}
  • appendSheetValues()  → POST /v4/spreadsheets/{id}/values/{range}:append
  • All three bump the daily API counter `}<span className={muted}>{"(apiCounter.ts)"}</span>{`
       │
       ▼
`}<span className="text-emerald-400 font-bold">{"Google Sheets API v4"}</span>{`  (free tier: 60 req / min per user)`}
            </pre>
          </div>
        </Section>

        {/* ── Service files ── */}
        <Section title="Key Service Files" iconBg="bg-amber-500/15" isLight={isLight}
          icon={<GitBranch className="w-4 h-4 text-amber-400" />}
        >
          <div className="grid grid-cols-1 gap-2">
            {SERVICE_FILES.map((f) => (
              <div key={f.file}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${border} ${cardBg}
                  shadow-[0_1px_6px_rgba(0,0,0,.06),inset_0_1px_0_rgba(255,255,255,.04)]`}
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

        {/* ── Meeting Notes columns ── */}
        <Section title="Meeting Notes — Column Layout" iconBg="bg-[#1a73e8]/15" isLight={isLight}
          icon={<Database className="w-4 h-4 text-[#4da3ff]" />}
        >
          <p className={`text-[11px] leading-relaxed mb-4 ${td}`}>
            One note per row in the{" "}
            <a href="https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit#gid=320158278"
              target="_blank" rel="noopener noreferrer" className="text-[#4da3ff] hover:underline font-bold">
              Meeting Notes
            </a>{" "}
            tab. <strong className="text-amber-500">Renaming this tab breaks note sync.</strong>
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

        {/* ── Breakage scenarios ── */}
        <Section title="Common Breakage Scenarios & Fixes" iconBg="bg-red-500/15" isLight={isLight}
          icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
        >
          <div className="space-y-2.5">
            {BREAKAGE.map((b) => (
              <div key={b.symptom}
                className={`rounded-xl border overflow-hidden ${border} ${cardBg}
                  shadow-[0_2px_8px_rgba(0,0,0,.06)]`}
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
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-500 leading-relaxed">{b.fix}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Env vars ── */}
        <Section title="Environment Variables (Render)" iconBg="bg-slate-500/15" isLight={isLight}
          icon={<Server className="w-4 h-4 text-slate-400" />}
        >
          <div className="space-y-2">
            {[
              { key: "GEMINI_API_KEY", note: "AI features — set in Render dashboard, never hardcode in source" },
              { key: "Firebase config", note: "Hardcoded in src/services/googleAuth.ts — acceptable for public Firebase config" },
            ].map((v) => (
              <div key={v.key}
                className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${border} ${cardBg}`}
              >
                <code className="text-[11px] font-mono font-bold text-amber-500 shrink-0 mt-0.5">{v.key}</code>
                <p className={`text-[11px] leading-relaxed ${td}`}>{v.note}</p>
              </div>
            ))}
          </div>
          <p className={`text-[10px] mt-4 ${muted}`}>Last updated 2026-08-22 — keep in sync whenever sheet structure changes.</p>
        </Section>

      </div>
    </div>
  );
};
