import React, { useEffect, useState, useCallback } from "react";
import { PageHeader } from "../PageHeader";
import { useFinance } from "../../context/FinanceContext";
import { ExternalLink, Info, RefreshCw, Clock, HardDrive } from "lucide-react";
import { getApiCounter } from "../../utils/apiCounter";
import { getGeminiCounter } from "../../utils/geminiCounter";

// ── Snapshot system ─────────────────────────────────────────────────────────────

const SNAPSHOTS_KEY = "financeops_usage_snapshots";
const MAX_SNAPSHOTS = 12;       // ~24 h of 2-hour intervals
const AUTO_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface UsageSnapshot {
  ts: number;
  localStorageBytes: number;
  originUsedBytes: number;
  originTotalBytes: number;
  apiReads: number;
  apiWrites: number;
  geminiTotal: number;
  geminiInvoice: number;
  geminiPdf: number;
  geminiTimesheet: number;
  geminiEmail: number;
}

function loadSnapshots(): UsageSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (raw) return JSON.parse(raw) as UsageSnapshot[];
  } catch {}
  return [];
}

function saveSnapshots(snaps: UsageSnapshot[]) {
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snaps.slice(-MAX_SNAPSHOTS)));
  } catch {}
}

async function captureSnapshot(): Promise<UsageSnapshot> {
  // localStorage size
  let lsBytes = 0;
  try {
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        lsBytes += ((localStorage.getItem(key) ?? "").length + key.length) * 2;
      }
    }
  } catch {}

  // Browser origin storage
  let originUsed = 0, originTotal = 0;
  try {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      const est = await navigator.storage.estimate();
      originUsed = est.usage ?? 0;
      originTotal = est.quota ?? 0;
    }
  } catch {}

  // API counters
  const c = getApiCounter();
  const g = getGeminiCounter();

  return {
    ts: Date.now(),
    localStorageBytes: lsBytes,
    originUsedBytes: originUsed,
    originTotalBytes: originTotal,
    apiReads: c.reads,
    apiWrites: c.writes,
    geminiTotal: g.total,
    geminiInvoice: g.invoiceScans,
    geminiPdf: g.pdfExtracts,
    geminiTimesheet: g.timesheetScans,
    geminiEmail: g.emailScans,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Static service info ──────────────────────────────────────────────────────────

interface LimitItem {
  label: string;
  value: string;
  note?: string;
  warn?: boolean;
  ok?: boolean;
}

interface ServiceCard {
  name: string;
  plan: string;
  planColor: string;
  emoji: string;
  accentColor: string;
  limits: LimitItem[];
  dashboardUrl?: string;
  dashboardLabel?: string;
  tip?: string;
}

const SERVICES: ServiceCard[] = [
  {
    name: "Render",
    plan: "Free Tier",
    planColor: "#22c55e",
    emoji: "⚡",
    accentColor: "#7c3aed",
    limits: [
      { label: "Compute hours", value: "750 hrs / month", ok: true },
      { label: "Bandwidth", value: "100 GB / month", ok: true },
      { label: "Build minutes", value: "500 min / month", ok: true },
      { label: "RAM per service", value: "512 MB" },
      { label: "CPU per service", value: "0.1 vCPU" },
      { label: "Auto-sleep after idle", value: "15 min", warn: true, note: "First load after sleep ≈ 30–60 s" },
      { label: "Custom domain + TLS", value: "Included ✓", ok: true },
      { label: "Persistent disk", value: "Not on Free tier", warn: true },
    ],
    dashboardUrl: "https://dashboard.render.com/",
    dashboardLabel: "Render Dashboard",
    tip: "Portal lives at financeops-portal.onrender.com. Upgrade to Starter ($7/mo) to remove sleep and get dedicated CPU.",
  },
  {
    name: "Google Sheets API",
    plan: "Free (API v4)",
    planColor: "#16a34a",
    emoji: "📊",
    accentColor: "#16a34a",
    limits: [
      { label: "Read requests", value: "60 req / min per user", ok: true },
      { label: "Write requests", value: "60 req / min per user", ok: true },
      { label: "Project-wide cap", value: "300 req / min", ok: true },
      { label: "Daily / monthly cap", value: "None ✓", ok: true },
      { label: "Cost", value: "Always free", ok: true },
    ],
    dashboardUrl: "https://console.cloud.google.com/apis/api/sheets.googleapis.com/quotas",
    dashboardLabel: "Cloud Console → Quotas",
    tip: "The portal touches 3 spreadsheets. All usage is well within 60 req/min. 429 errors trigger an automatic retry.",
  },
  {
    name: "Firebase Auth",
    plan: "Spark (Free)",
    planColor: "#f59e0b",
    emoji: "🔒",
    accentColor: "#f59e0b",
    limits: [
      { label: "Google OAuth sign-in", value: "Unlimited", ok: true },
      { label: "Email / password auth", value: "Unlimited", ok: true },
      { label: "Monthly active users", value: "50,000 MAUs", ok: true },
      { label: "Cost", value: "Free (Spark plan)", ok: true },
    ],
    dashboardUrl: "https://console.firebase.google.com/",
    dashboardLabel: "Firebase Console",
    tip: "Google OAuth only — no SMS. With 3–5 users you are nowhere near the 50K MAU ceiling.",
  },
  {
    name: "Google Drive / OAuth",
    plan: "Free (personal)",
    planColor: "#3b82f6",
    emoji: "🔑",
    accentColor: "#3b82f6",
    limits: [
      { label: "OAuth token TTL", value: "~1 hr (auto-refresh)", ok: true },
      { label: "Drive storage", value: "15 GB shared", ok: true },
      { label: "Sheets file storage", value: "Excluded from 15 GB", ok: true },
    ],
    tip: "Google Sheets files don't count against your Drive quota. OAuth tokens renew silently.",
  },
  {
    name: "Gemini AI (Google AI Studio)",
    plan: "Free Tier",
    planColor: "#8b5cf6",
    emoji: "🤖",
    accentColor: "#8b5cf6",
    limits: [
      { label: "gemini-2.0-flash", value: "15 req / min · 1,500 / day", ok: true },
      { label: "gemini-1.5-flash", value: "15 req / min · 1,500 / day", ok: true },
      { label: "gemini-1.5-pro", value: "2 req / min · 50 / day", warn: true },
      { label: "Max output tokens", value: "8,192 (configured)", ok: true },
      { label: "Auto model fallback", value: "Enabled ✓", ok: true, note: "Falls back to next model on quota / not-found errors" },
      { label: "Cost", value: "Free (AI Studio key)", ok: true },
    ],
    dashboardUrl: "https://aistudio.google.com/",
    dashboardLabel: "Google AI Studio",
    tip: "Powers: Invoice scan, Bill scan, Timesheet scan, PDF Data Extractor, Email Invoice Scanner. Server auto-tries backup models on quota errors. Upgrade to Vertex AI for higher limits.",
  },
];

const SHEETS = [
  { name: "Main F&A", id: "15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs", tabs: "AP, AR, Banks, Loans, Statements, Meeting Notes, Metadata, Headley's" },
  { name: "4YR Payroll", id: "1SITtQDT3iFo5yIOBgjbERbqJjYJ8rk6drXwkLm3sAGE", tabs: "Raw payroll data" },
  { name: "Calendar", id: "1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo", tabs: "Events, Notes" },
];

// ── Component ────────────────────────────────────────────────────────────────────

export const ServiceLimitsPage: React.FC = () => {
  const { theme } = useFinance();
  const isLight = theme === "light";

  const [snapshots, setSnapshots] = useState<UsageSnapshot[]>([]);
  const [activeIdx, setActiveIdx] = useState(0); // index into snapshots, 0 = most recent
  const [refreshing, setRefreshing] = useState(false);

  // Take a snapshot and prepend to the list
  const takeSnapshot = useCallback(async (force = false) => {
    setRefreshing(true);
    try {
      const existing = loadSnapshots();
      const last = existing[existing.length - 1];
      // Skip if last snap was < 1 h ago (unless forced)
      if (!force && last && Date.now() - last.ts < AUTO_INTERVAL_MS) {
        setSnapshots([...existing].reverse());
        return;
      }
      const snap = await captureSnapshot();
      const updated = [...existing, snap];
      saveSnapshots(updated);
      setSnapshots([...updated].reverse()); // most-recent first
      setActiveIdx(0);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const existing = loadSnapshots();
    if (existing.length === 0) {
      takeSnapshot(true);
    } else {
      setSnapshots([...existing].reverse());
      // Auto-snap if the last one is old
      const last = existing[existing.length - 1];
      if (Date.now() - last.ts > AUTO_INTERVAL_MS) {
        takeSnapshot(true);
      }
    }
  }, [takeSnapshot]);

  const active = snapshots[activeIdx] ?? null;

  // Style helpers
  const cardBg  = isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]";
  const pageBg  = isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]";
  const mutedTxt = isLight ? "text-slate-500" : "text-[#888]";
  const headTxt  = isLight ? "text-slate-900" : "text-white";
  const rowBorder = isLight ? "border-slate-100" : "border-[#1a2235]";

  const lsPct = active ? Math.min((active.localStorageBytes / (5 * 1024 * 1024)) * 100, 100) : 0;
  const originPct = active && active.originTotalBytes > 0
    ? Math.min((active.originUsedBytes / active.originTotalBytes) * 100, 100)
    : 0;

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${pageBg}`}>
      <PageHeader title="Service Limits & Usage" bgClass="bg-[#1e1b4b]" />

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* ── Snapshot Header ── */}
        <div className={`rounded-xl border p-4 ${cardBg}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <h3 className={`text-sm font-bold ${headTxt}`}>Usage Snapshots</h3>
              <span className={`text-[11px] ${mutedTxt}`}>
                (auto-saved every 2 h when this page is open — up to 12 checkpoints)
              </span>
            </div>
            <button
              onClick={() => takeSnapshot(true)}
              disabled={refreshing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors disabled:opacity-50 ${
                isLight
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                  : "bg-indigo-950/30 border-indigo-800/40 text-indigo-300 hover:bg-indigo-900/40"
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Check Now
            </button>
          </div>

          {/* Timeline dots */}
          {snapshots.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {snapshots.map((s, i) => {
                  const isToday = new Date(s.ts).toDateString() === new Date().toDateString();
                  return (
                    <button
                      key={s.ts}
                      onClick={() => setActiveIdx(i)}
                      title={`${new Date(s.ts).toLocaleString()} — localStorage: ${fmtBytes(s.localStorageBytes)}`}
                      className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all shrink-0 border ${
                        i === activeIdx
                          ? "bg-indigo-600 border-indigo-500 text-white"
                          : isLight
                          ? "bg-slate-50 border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-200"
                          : "bg-[#0d111a] border-[#1a2235] text-[#666] hover:bg-indigo-950/20 hover:border-indigo-900/40"
                      }`}
                    >
                      <span className={`text-[10px] font-bold ${i === activeIdx ? "text-white" : isLight ? "text-slate-600" : "text-[#888]"}`}>
                        {isToday ? fmtTime(s.ts) : fmtDate(s.ts)}
                      </span>
                      <div className={`w-1.5 h-1.5 rounded-full ${i === activeIdx ? "bg-white" : "bg-indigo-500"}`} />
                    </button>
                  );
                })}
              </div>
              {active && (
                <p className={`text-[11px] ${mutedTxt}`}>
                  Showing snapshot from {new Date(active.ts).toLocaleString()} ({fmtRelative(active.ts)})
                </p>
              )}
            </div>
          ) : (
            <p className={`text-xs ${mutedTxt}`}>Taking first snapshot…</p>
          )}
        </div>

        {/* ── Live Metrics Cards ── */}
        {active && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">

            {/* localStorage */}
            <div className={`rounded-xl border p-4 ${cardBg} xl:col-span-1`}>
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="w-4 h-4 text-indigo-400" />
                <span className={`text-[11px] font-bold uppercase tracking-wider ${mutedTxt}`}>localStorage</span>
              </div>
              <p className={`text-xl font-bold ${headTxt} mb-1`}>{fmtBytes(active.localStorageBytes)}</p>
              <div className={`w-full h-1.5 rounded-full ${isLight ? "bg-slate-200" : "bg-[#1a2235]"} mb-1`}>
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${lsPct}%`,
                    background: lsPct > 80 ? "#ef4444" : lsPct > 60 ? "#f59e0b" : "#6366f1",
                  }}
                />
              </div>
              <p className={`text-[10px] ${mutedTxt}`}>{lsPct.toFixed(1)}% of ~5 MB limit</p>
            </div>

            {/* Browser origin storage */}
            <div className={`rounded-xl border p-4 ${cardBg} xl:col-span-1`}>
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="w-4 h-4 text-purple-400" />
                <span className={`text-[11px] font-bold uppercase tracking-wider ${mutedTxt}`}>Browser Quota</span>
              </div>
              {active.originTotalBytes > 0 ? (
                <>
                  <p className={`text-xl font-bold ${headTxt} mb-1`}>{fmtBytes(active.originUsedBytes)}</p>
                  <div className={`w-full h-1.5 rounded-full ${isLight ? "bg-slate-200" : "bg-[#1a2235]"} mb-1`}>
                    <div className="h-1.5 rounded-full bg-purple-500 transition-all" style={{ width: `${originPct}%` }} />
                  </div>
                  <p className={`text-[10px] ${mutedTxt}`}>{originPct.toFixed(2)}% of {fmtBytes(active.originTotalBytes)}</p>
                </>
              ) : (
                <p className={`text-xs ${mutedTxt}`}>Not available in this browser</p>
              )}
            </div>

            {/* Sheet API Reads today — bar vs 500/day soft budget (no hard daily cap) */}
            <div className={`rounded-xl border p-4 ${cardBg} xl:col-span-1`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">📊</span>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${mutedTxt}`}>Sheet Reads Today</span>
              </div>
              <p className={`text-xl font-bold font-variant-numeric-tabular ${
                active.apiReads > 400 ? "text-amber-500" : isLight ? "text-emerald-700" : "text-emerald-400"
              } mb-1`}>
                {active.apiReads}
              </p>
              <div className={`w-full h-1.5 rounded-full ${isLight ? "bg-slate-200" : "bg-[#1a2235]"} mb-1`}>
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${Math.min((active.apiReads / 500) * 100, 100)}%`,
                    background: active.apiReads > 400 ? "#f59e0b" : "#22c55e",
                  }}
                />
              </div>
              <p className={`text-[10px] ${mutedTxt}`}>Rate limit: 60 / min · no daily cap</p>
            </div>

            {/* Sheet API Writes today — bar vs 200/day soft budget */}
            <div className={`rounded-xl border p-4 ${cardBg} xl:col-span-1`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">✏️</span>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${mutedTxt}`}>Sheet Writes Today</span>
              </div>
              <p className={`text-xl font-bold ${
                active.apiWrites > 150 ? "text-amber-500" : isLight ? "text-emerald-700" : "text-emerald-400"
              } mb-1`}>
                {active.apiWrites}
              </p>
              <div className={`w-full h-1.5 rounded-full ${isLight ? "bg-slate-200" : "bg-[#1a2235]"} mb-1`}>
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${Math.min((active.apiWrites / 200) * 100, 100)}%`,
                    background: active.apiWrites > 150 ? "#f59e0b" : "#22c55e",
                  }}
                />
              </div>
              <p className={`text-[10px] ${mutedTxt}`}>Rate limit: 60 / min · no daily cap</p>
            </div>

            {/* Gemini AI scans today — vs 1,500/day flash limit */}
            <div className={`rounded-xl border p-4 ${cardBg} xl:col-span-1`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">🤖</span>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${mutedTxt}`}>Gemini Scans Today</span>
              </div>
              <p className={`text-xl font-bold ${
                (active.geminiTotal ?? 0) > 1200 ? "text-red-500"
                : (active.geminiTotal ?? 0) > 900  ? "text-amber-500"
                : isLight ? "text-violet-700" : "text-violet-400"
              } mb-1`}>
                {active.geminiTotal ?? 0}
                <span className={`text-xs font-normal ml-1 ${mutedTxt}`}>/ 1,500</span>
              </p>
              <div className={`w-full h-1.5 rounded-full ${isLight ? "bg-slate-200" : "bg-[#1a2235]"} mb-1`}>
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${Math.min(((active.geminiTotal ?? 0) / 1500) * 100, 100)}%`,
                    background: (active.geminiTotal ?? 0) > 1200 ? "#ef4444"
                      : (active.geminiTotal ?? 0) > 900 ? "#f59e0b" : "#8b5cf6",
                  }}
                />
              </div>
              <p className={`text-[10px] ${mutedTxt}`}>Free tier daily cap (flash models)</p>
            </div>

            {/* Gemini breakdown by scan type */}
            <div className={`rounded-xl border p-4 ${cardBg} xl:col-span-1`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">🔍</span>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${mutedTxt}`}>Scan Breakdown</span>
              </div>
              <div className="space-y-1.5 mt-1">
                {[
                  { label: "Bill / Invoice", val: active.geminiInvoice ?? 0, color: "#8b5cf6" },
                  { label: "PDF Extract",    val: active.geminiPdf      ?? 0, color: "#06b6d4" },
                  { label: "Timesheet",      val: active.geminiTimesheet ?? 0, color: "#10b981" },
                  { label: "Email scan",     val: active.geminiEmail    ?? 0, color: "#f59e0b" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] ${mutedTxt} truncate`}>{label}</span>
                    <span
                      className="text-[11px] font-bold tabular-nums min-w-[18px] text-right"
                      style={{ color: val > 0 ? color : undefined }}
                    >
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ── Static Service Cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {SERVICES.map((svc) => (
            <div key={svc.name} className={`rounded-xl border overflow-hidden shadow-sm ${cardBg}`}>

              {/* Card header */}
              <div
                className="p-3.5 flex items-center justify-between"
                style={{
                  background: isLight ? `${svc.accentColor}09` : `${svc.accentColor}14`,
                  borderBottom: `1px solid ${isLight ? "#e2e8f0" : "#1a2235"}`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl leading-none">{svc.emoji}</span>
                  <div>
                    <h3 className={`text-sm font-bold ${headTxt}`}>{svc.name}</h3>
                    <span
                      className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: svc.planColor }}
                    >
                      {svc.plan}
                    </span>
                  </div>
                </div>
                {svc.dashboardUrl && (
                  <a
                    href={svc.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                      isLight
                        ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        : "bg-[#0d111a] border-[#1a2235] text-[#c8d4e8] hover:bg-[#1a2235]"
                    }`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    {svc.dashboardLabel}
                  </a>
                )}
              </div>

              {/* Limit rows */}
              <div className="px-3 pt-2 pb-1">
                {svc.limits.map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-start justify-between gap-3 py-1.5 border-b last:border-b-0 ${rowBorder}`}
                  >
                    <span className={`text-xs ${mutedTxt} shrink-0`}>{item.label}</span>
                    <div className="text-right">
                      <span
                        className={`text-xs font-semibold ${
                          item.warn
                            ? "text-amber-500"
                            : item.ok
                            ? isLight ? "text-emerald-700" : "text-emerald-400"
                            : headTxt
                        }`}
                      >
                        {item.value}
                      </span>
                      {item.note && (
                        <div className={`text-[10px] mt-0.5 ${isLight ? "text-slate-400" : "text-[#666]"}`}>
                          {item.note}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {svc.tip && (
                  <div className={`my-2 p-2.5 rounded-lg text-[11px] leading-relaxed ${isLight ? "bg-slate-50 text-slate-500" : "bg-[#1a2235]/50 text-[#7a90b0]"}`}>
                    💡 {svc.tip}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Connected Spreadsheets ── */}
        <div className={`rounded-xl border p-4 ${cardBg}`}>
          <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${headTxt}`}>📋 Connected Spreadsheets</h3>
          <div className="space-y-2">
            {SHEETS.map((s) => (
              <div key={s.id} className={`flex items-start gap-3 p-3 rounded-lg ${isLight ? "bg-slate-50" : "bg-[#070b12]"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-semibold ${headTxt}`}>{s.name}</span>
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${s.id}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1a73e8] hover:text-[#1557b0] flex items-center gap-0.5 text-[11px] font-semibold shrink-0"
                    >
                      Open <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className={`text-[10px] mt-0.5 font-mono truncate ${isLight ? "text-slate-400" : "text-[#555]"}`}>
                    {s.id}
                  </div>
                  <div className={`text-[11px] mt-1 ${mutedTxt}`}>Tabs: {s.tabs}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Upgrade Paths ── */}
        <div className={`rounded-xl border p-4 ${cardBg}`}>
          <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${headTxt}`}>🚀 Upgrade Options</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                service: "Render",
                plan: "Starter — $7/mo",
                benefit: "No sleep, dedicated CPU, 100 GB bandwidth",
                url: "https://render.com/pricing",
                color: "#7c3aed",
              },
              {
                service: "Google Sheets API",
                plan: "No upgrade needed",
                benefit: "Free quota is generous for this portal",
                url: "https://console.cloud.google.com/apis/api/sheets.googleapis.com/quotas",
                color: "#16a34a",
              },
              {
                service: "Firebase",
                plan: "Blaze — pay-as-you-go",
                benefit: "Only needed for SMS auth or Cloud Functions",
                url: "https://firebase.google.com/pricing",
                color: "#f59e0b",
              },
            ].map((u) => (
              <div
                key={u.service}
                className={`p-3 rounded-xl border ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#070b12] border-[#1a2235]"}`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: u.color }}>
                  {u.service}
                </div>
                <div className={`text-xs font-semibold ${headTxt} mb-1`}>{u.plan}</div>
                <div className={`text-[11px] ${mutedTxt} mb-2`}>{u.benefit}</div>
                <a
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1a73e8] text-[11px] font-semibold flex items-center gap-0.5 hover:underline"
                >
                  View pricing <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
