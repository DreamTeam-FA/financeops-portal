/**
 * reportTrackerService.ts
 *
 * Logic + Google Sheets/Drive I/O for the Report Tracker page.
 *
 * SOURCE OF TRUTH: the Google Sheet "FinanceOps Report Tracker (Portal Data)".
 *   - "Checks" tab : period_key | step_key | done | updated_at | updated_by
 *   - "Tasks"  tab : id | title | due | done | notes | deleted | updated_at | updated_by
 *   - "Log"    tab : timestamp | user | period_key | step_key | done   (append-only audit)
 * Nothing about check state / tasks lives in the server JSON. localStorage is never read
 * back as truth; the page re-reads the sheet on load, on Refresh, and every few minutes.
 *
 * Auto-checks are READ-ONLY against the report sheets / Drive (they never write there).
 * All schedule math is Philippine Time (UTC+8, no DST).
 */

import { ENTITY_COLORS, getEntityHex } from "../utils/entityColors";

/**
 * Report cards follow the portal's entity colours:
 *  - FTA and Toast Recon are Ruby's  → shared palette (utils/entityColors)
 *  - CPRO Weekly / Monthly           → the CurcuminPRO amber used by the sidebar entry (#f59e0b / amber-500)
 */
export const RUBYS_HEX = getEntityHex("Ruby's");
export const RUBYS_TEXT_HEX = ENTITY_COLORS["Ruby's"].textHex;
export const CPRO_HEX = "#f59e0b";
export const CPRO_TEXT_HEX = "#f59e0b";

// ─── IDs & URLs ──────────────────────────────────────────────────────────────

export const TRACKER_SHEET_ID = "1Olhac_V3mrzDVL7GFs4E3DN5uwscVR91g26zMFILml0";
export const TRACKER_SHEET_URL = `https://docs.google.com/spreadsheets/d/${TRACKER_SHEET_ID}/edit`;

export const SRC = {
  ftaSheet:       "1FvscPcijHOZHDj6G_VGCeYa9WI_HPMnwlmTkLSxGOo4", // Feeding the Athletes - Orders
  toastRecon:     "1cTKsnNSm6VzNnXYlQUyXbHSEt7Odx0VtAAk1Dcpy_aM", // Toast Recon
  amazonSales:    "1UK1n3sTGYpg5j7TdidpMH5HxYOtwKks5gckMWMui_XQ", // CPRO Amazon Sales report
  salesAllTime:   "1Vd_QvQHxuaibBW8BZt5EMZzHKDcztqXLqBNTH5DpROY", // CPRO SALES ALL TIME
  adSpend:        "1RoYMLak4KUTglvUuKNDgQ4MoAuPB4q1Cnyy33zfHcWU", // CPRO Ad Spend
  brandPayout:    "1WvEhME2946z-XQiuG0pTnurKvN_xCPbso3ahAAvZTTU", // CPRO Brand Payout Sheet (link only; never read)
  hub:            "1wg2ESvNe7v9itWpsZOXiqqLSBRHnpdsZdZcNGrOE8RE", // #CURCUMINPRO HUB
  usuFolder:      "1mqy0QiNBkYuR5Lwn7Us0-ztGeu2pNMOc",            // Invoices / USU
} as const;

export const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
export const CPRO_DASHBOARD_URL =
  "https://script.google.com/macros/s/AKfycbx8Atk7ajk80WseNyVBuSJBjhyg8RABC5_DmeSZ2adRjkdplu0Bu5zx7yObbLrP4uT_/exec";

// ─── Philippine-time helpers (UTC+8, no DST) ─────────────────────────────────

const PHT_MS = 8 * 3600_000;

export interface PhtParts { y: number; m: number; d: number; hh: number; mm: number; dow: number } // dow: 0=Sun

export function toPht(ms: number): PhtParts {
  const t = new Date(ms + PHT_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), hh: t.getUTCHours(), mm: t.getUTCMinutes(), dow: t.getUTCDay() };
}
/** Epoch ms for a PHT wall-clock time. Month overflow (e.g. d=0, m=13) is normalised by Date.UTC. */
export function fromPht(y: number, m: number, d: number, hh = 0, mm = 0): number {
  return Date.UTC(y, m - 1, d, hh, mm) - PHT_MS;
}
const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (p: { y: number; m: number; d: number }) => `${p.y}-${pad(p.m)}-${pad(p.d)}`;
const addDays = (p: { y: number; m: number; d: number }, n: number) => toPht(fromPht(p.y, p.m, p.d + n, 12));
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function fmtPht(ms: number, withDow = true): string {
  const p = toPht(ms);
  const h12 = p.hh % 12 === 0 ? 12 : p.hh % 12;
  const ap = p.hh >= 12 ? "PM" : "AM";
  return `${withDow ? DOW[p.dow] + ", " : ""}${MONTHS[p.m - 1].slice(0, 3)} ${p.d}, ${h12}:${pad(p.mm)} ${ap}`;
}
export function fmtPhtDate(ms: number): string {
  const p = toPht(ms);
  return `${DOW[p.dow]}, ${MONTHS[p.m - 1].slice(0, 3)} ${p.d}`;
}
export function relative(ms: number, now: number): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const text = mins < 60 ? `${mins}m` : mins < 48 * 60 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

// ─── Report definitions ──────────────────────────────────────────────────────

export type ReportId = "fta" | "cprow" | "cprom" | "toast";
export type StepKind = "auto" | "manual";
export interface StepDef { key: string; label: string; kind: StepKind; hint?: string }
export interface ReportDef {
  id: ReportId; name: string; cadence: string; script: string; accent: string;
  /** Entity chip shown on the card */
  entity: { label: string; hex: string; textHex: string };
  /** "run" = overdue as soon as the first (script) step is missing past the deadline; "all" = every step must be done by the deadline */
  overdueRule: "run" | "all";
  steps: StepDef[];
  links: { label: string; url: string }[];
}

export const REPORTS: ReportDef[] = [
  {
    id: "fta", name: "FTA Weekly", cadence: "Every Tuesday · 5–7 PM PHT", script: "Rubys_FTA_report.py", accent: RUBYS_HEX,
    entity: { label: "Ruby's", hex: RUBYS_HEX, textHex: RUBYS_TEXT_HEX },
    overdueRule: "run",
    steps: [
      { key: "run",       label: "Script run — new Monday tab on the FTA sheet", kind: "auto" },
      { key: "monica",    label: "Summary screenshot sent to Monica (Slack)", kind: "manual" },
      { key: "invoice",   label: "Invoice saved in Drive › Invoices › USU", kind: "auto" },
      { key: "checked",   label: "Invoice checked (received from Monica via Slack)", kind: "manual" },
      { key: "mark",      label: "Invoice emailed to Mark for approval", kind: "manual" },
      { key: "approved",  label: "Mark approved", kind: "manual" },
      { key: "client",    label: "Invoice sent to the client", kind: "manual" },
    ],
    links: [
      { label: "FTA Sheet", url: sheetUrl(SRC.ftaSheet) },
      { label: "USU Invoices", url: folderUrl(SRC.usuFolder) },
    ],
  },
  {
    id: "cprow", name: "CPRO Weekly", cadence: "Every Monday · 5–7 PM PHT · ready before 7 PM", script: "Cpro_Automated_report.py (weekly)", accent: CPRO_HEX,
    entity: { label: "CPRO", hex: CPRO_HEX, textHex: CPRO_TEXT_HEX },
    overdueRule: "all",
    steps: [
      { key: "run",       label: "Script run — weekly tab (Sun–Sat) on the Amazon Sales Report", kind: "auto" },
      { key: "alltime",   label: "CPRO Sales All Time updated", kind: "auto" },
      { key: "sheet",     label: "Sheet checked — everything landed correctly", kind: "manual" },
      { key: "dashboard", label: "CPRO dashboard: latest week in the dropdown matches", kind: "manual", hint: "Wait for load; click Refresh in the side panel if it's missing." },
      { key: "tonie",     label: "Tonie informed (Slack)", kind: "manual" },
    ],
    links: [
      { label: "Amazon Sales Report", url: sheetUrl(SRC.amazonSales) },
      { label: "Sales All Time", url: sheetUrl(SRC.salesAllTime) },
      { label: "Hub", url: sheetUrl(SRC.hub) },
      { label: "CPRO Dashboard", url: CPRO_DASHBOARD_URL },
    ],
  },
  {
    id: "cprom", name: "CPRO Monthly", cadence: "3rd of the month · 5–7 PM PHT · deadline the 6th", script: "Cpro_Automated_report.py (monthly)", accent: CPRO_HEX,
    entity: { label: "CPRO", hex: CPRO_HEX, textHex: CPRO_TEXT_HEX },
    overdueRule: "all",
    steps: [
      { key: "run",        label: "Script run — monthly tab on the Amazon Sales Report", kind: "auto" },
      { key: "alltime",    label: "CPRO Sales All Time updated", kind: "auto" },
      { key: "adspend",    label: "Ad Spend month column filled (manual — script doesn't do this yet)", kind: "auto" },
      { key: "webstorage", label: "Website & Storage sheet done (manual)", kind: "manual" },
      { key: "payout",     label: "Brand Payout sheet done (manual)", kind: "manual" },
      { key: "dashboard",  label: "CPRO dashboard: data loaded, incl. the Brand Payout section", kind: "manual" },
      { key: "micah",      label: "Micah informed (Slack)", kind: "manual" },
    ],
    links: [
      { label: "Amazon Sales Report", url: sheetUrl(SRC.amazonSales) },
      { label: "Ad Spend", url: sheetUrl(SRC.adSpend) },
      { label: "Brand Payout", url: sheetUrl(SRC.brandPayout) },
      { label: "CPRO Dashboard", url: CPRO_DASHBOARD_URL },
    ],
  },
  {
    id: "toast", name: "Toast Recon", cadence: "4th or 5th of the month (data ready on the 4th)", script: "Rubys_Toast_Recon_report.py", accent: RUBYS_HEX,
    entity: { label: "Ruby's", hex: RUBYS_HEX, textHex: RUBYS_TEXT_HEX },
    overdueRule: "all",
    steps: [
      { key: "run",   label: "Script run — payouts through month-end on the Toast Data tab", kind: "auto" },
      { key: "micah", label: "Micah informed (Slack)", kind: "manual" },
    ],
    links: [{ label: "Toast Recon Sheet", url: sheetUrl(SRC.toastRecon) }],
  },
];
export const reportById = (id: ReportId) => REPORTS.find(r => r.id === id)!;

// ─── Cycles ──────────────────────────────────────────────────────────────────

export interface Cycle {
  reportId: ReportId;
  periodKey: string;      // stable key stored in the Checks tab
  label: string;          // human label for the period
  windowStart: number;    // ms
  windowEnd: number;      // ms
  deadline: number;       // ms
  nextStart: number;      // ms — start of the following cycle (bounds "this cycle's" artifacts)
  /** FTA: Monday tab name; CPRO weekly: "MM/DD-MM/DD"; CPRO monthly: "SEPTEMBER 1-30,2026"; Toast: unused */
  tabName?: string;
  /** Data month for monthly cycles */
  month?: { y: number; m: number; lastDay: number };
}

function ftaCycle(tue: { y: number; m: number; d: number }): Cycle {
  const mon = addDays(tue, -1);
  const next = addDays(tue, 7);
  return {
    reportId: "fta", periodKey: `fta:${isoDate(mon)}`, label: `Week of Mon ${MONTHS[mon.m - 1].slice(0, 3)} ${mon.d}`,
    windowStart: fromPht(tue.y, tue.m, tue.d, 17), windowEnd: fromPht(tue.y, tue.m, tue.d, 19), deadline: fromPht(tue.y, tue.m, tue.d, 19),
    nextStart: fromPht(next.y, next.m, next.d, 17),
    tabName: `${pad(mon.m)}/${pad(mon.d)}/${mon.y}`,
  };
}
function cpro1Weekly(mon: { y: number; m: number; d: number }): Cycle {
  const sun = addDays(mon, -8), sat = addDays(mon, -2);
  const next = addDays(mon, 7);
  return {
    reportId: "cprow", periodKey: `cprow:${isoDate(mon)}`,
    label: `${MONTHS[sun.m - 1].slice(0, 3)} ${sun.d} – ${MONTHS[sat.m - 1].slice(0, 3)} ${sat.d}`,
    windowStart: fromPht(mon.y, mon.m, mon.d, 17), windowEnd: fromPht(mon.y, mon.m, mon.d, 19), deadline: fromPht(mon.y, mon.m, mon.d, 19),
    nextStart: fromPht(next.y, next.m, next.d, 17),
    tabName: `${pad(sun.m)}/${pad(sun.d)}-${pad(sat.m)}/${pad(sat.d)}`,
  };
}
function dataMonthOf(y: number, m: number) { // month BEFORE (y,m)
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  return { y: py, m: pm, lastDay: lastDayOfMonth(py, pm) };
}
function cproMonthly(y: number, m: number): Cycle { // run in month (y,m) for the previous month
  const dm = dataMonthOf(y, m);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return {
    reportId: "cprom", periodKey: `cprom:${dm.y}-${pad(dm.m)}`, label: `${MONTHS[dm.m - 1]} ${dm.y}`,
    windowStart: fromPht(y, m, 3, 17), windowEnd: fromPht(y, m, 3, 19), deadline: fromPht(y, m, 6, 23, 59),
    nextStart: fromPht(ny, nm, 3, 17),
    tabName: `${MONTHS[dm.m - 1].toUpperCase()} 1-${dm.lastDay},${dm.y}`, month: dm,
  };
}
function toastCycle(y: number, m: number): Cycle { // run on the 4th/5th of (y,m) for the previous month
  const dm = dataMonthOf(y, m);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return {
    reportId: "toast", periodKey: `toast:${dm.y}-${pad(dm.m)}`, label: `${MONTHS[dm.m - 1]} ${dm.y}`,
    windowStart: fromPht(y, m, 4, 0), windowEnd: fromPht(y, m, 5, 23, 59), deadline: fromPht(y, m, 5, 23, 59),
    nextStart: fromPht(ny, nm, 4, 0), month: dm,
  };
}

/** All cycles for a report whose windowStart falls within [now-70d, now+75d], ascending. */
export function cyclesAround(reportId: ReportId, now: number): Cycle[] {
  const out: Cycle[] = [];
  const t = toPht(now);
  if (reportId === "fta" || reportId === "cprow") {
    for (let i = -30; i <= 11; i++) {
      const day = addDays(t, i * 7);
      // snap to the cycle weekday in that week
      const want = reportId === "fta" ? 2 : 1;
      const delta = want - day.dow;
      const d = addDays(day, delta);
      out.push(reportId === "fta" ? ftaCycle(d) : cpro1Weekly(d));
    }
  } else {
    for (let i = -8; i <= 3; i++) {
      const mm = t.m + i;
      const y = t.y + Math.floor((mm - 1) / 12);
      const m = ((mm - 1) % 12 + 12) % 12 + 1;
      out.push(reportId === "cprom" ? cproMonthly(y, m) : toastCycle(y, m));
    }
  }
  const uniq = new Map(out.map(c => [c.periodKey, c]));
  return [...uniq.values()].sort((a, b) => a.windowStart - b.windowStart);
}

export interface CycleView { active: Cycle; previous: Cycle | null; next: Cycle | null }
export function cycleView(reportId: ReportId, now: number): CycleView {
  const all = cyclesAround(reportId, now);
  const started = all.filter(c => c.windowStart <= now);
  const next = all.find(c => c.windowStart > now) || null;
  const active = started[started.length - 1] || all[0];
  const previous = started.length > 1 ? started[started.length - 2] : null;
  return { active, previous, next };
}

// ─── Status ──────────────────────────────────────────────────────────────────

export type AutoState = "ok" | "no" | "unknown";
export type AutoReason = "busy" | "auth" | "access" | "error";
export interface AutoResult { state: AutoState; detail?: string; reason?: AutoReason }
export type StepState = "done" | "open" | "unknown";
export type Status = "upcoming" | "due" | "progress" | "overdue" | "done" | "untracked" | "unknown" | "skipped";

export const AUTO_PREFIX = "auto:";
/** Auto steps already confirmed earlier are stored in the Checks tab as step_key "auto:<step>" (done = TRUE). */
export function latchedAutoKeys(checks: Record<string, boolean>): Set<string> {
  const out = new Set<string>();
  for (const [k, done] of Object.entries(checks)) {
    if (!done) continue;
    const [period, step] = k.split("|");
    if (step && step.startsWith(AUTO_PREFIX)) out.add(`${period}|${step.slice(AUTO_PREFIX.length)}`);
  }
  return out;
}

export function stepStates(
  rep: ReportDef, cycle: Cycle,
  auto: Record<string, AutoResult> | undefined,
  checks: Record<string, boolean>,
): Record<string, StepState> {
  const out: Record<string, StepState> = {};
  for (const s of rep.steps) {
    if (s.kind === "manual") out[s.key] = checks[`${cycle.periodKey}|${s.key}`] ? "done" : "open";
    else if (checks[`${cycle.periodKey}|${AUTO_PREFIX}${s.key}`]) out[s.key] = "done"; // confirmed earlier: never re-read
    else {
      const a = auto && auto[s.key];
      out[s.key] = !a || a.state === "unknown" ? "unknown" : a.state === "ok" ? "done" : "open";
    }
  }
  return out;
}

/**
 * Does an Amazon Sales Report tab title belong to this cycle? Weekly tabs are "MM/DD-MM/DD". Monthly tabs are typed by
 * hand and vary ("SEPTEMBER 1-30,2026", "SEPTEMBER 1-30, 2026", "JAN 1-31 2026", "FEB 1-28,2026"), so a monthly tab matches
 * on month name (full or first 3 letters), day range and year, ignoring spaces and commas.
 */
export function amazonTabMatches(title: string, c: Cycle): boolean {
  const t = title.trim().toUpperCase();
  if (!c.month) return t.replace(/\s+/g, "") === (c.tabName || "").toUpperCase().replace(/\s+/g, "");
  const mt = /^([A-Z]+)\s*(\d{1,2})\s*-\s*(\d{1,2})\s*,?\s*(\d{4})$/.exec(t);
  if (!mt) return false;
  const name = MONTHS[c.month.m - 1].toUpperCase();
  const [, mon, from, to, year] = mt;
  return name.startsWith(mon) && mon.length >= 3 && +from === 1 && +to === c.month.lastDay && +year === c.month.y;
}

/** Move a PHT instant that falls on Saturday/Sunday to the same time on the following Monday. */
function nextWeekday(ms: number): number {
  let t = ms;
  while (toPht(t).dow === 0 || toPht(t).dow === 6) t += 86400_000;
  return t;
}

/**
 * No work on weekends: the monthly reports (CPRO Monthly, Toast Recon) move to the following Monday when their
 * start or deadline lands on a Saturday/Sunday. The displayed dates stay as scheduled; only the status
 * ("upcoming"/"overdue") and a note on the card follow the shift. Returns null when nothing shifts.
 */
export function weekendShift(cycle: Cycle): { windowStart: number; windowEnd: number; deadline: number; note: string } | null {
  if (cycle.reportId !== "cprom" && cycle.reportId !== "toast") return null;
  const windowStart = nextWeekday(cycle.windowStart), windowEnd = Math.max(nextWeekday(cycle.windowEnd), windowStart);
  const deadline = Math.max(nextWeekday(cycle.deadline), windowStart);
  if (windowStart === cycle.windowStart && deadline === cycle.deadline) return null;
  const fmt = (ms: number) => { const p = toPht(ms); return `${DAYS[p.dow]} ${MONTHS[p.m - 1].slice(0, 3)} ${p.d}`; };
  const parts: string[] = [];
  if (windowStart !== cycle.windowStart) parts.push(`The scheduled start (${fmt(cycle.windowStart)}) is a weekend, so the run moves to ${fmt(windowStart)}.`);
  if (deadline !== cycle.deadline) parts.push(`The deadline (${fmt(cycle.deadline)}) is a weekend, so it moves to ${fmt(deadline)}.`);
  return { windowStart, windowEnd, deadline, note: `${parts.join(" ")} It will not show as overdue before then.` };
}

export function cycleStatus(rep: ReportDef, cycle0: Cycle, states: Record<string, StepState>, now: number): Status {
  const sh = weekendShift(cycle0);
  const cycle = sh ? { ...cycle0, windowStart: sh.windowStart, windowEnd: sh.windowEnd, deadline: sh.deadline } : cycle0;
  const all = rep.steps.every(s => states[s.key] === "done");
  if (all) return "done";
  // Before the (weekend-shifted) start it is "upcoming", unless something was already done early.
  if (now < cycle.windowStart && !(sh && rep.steps.some(s => states[s.key] === "done"))) return "upcoming";
  const runStep = rep.steps[0].key;
  const pastDeadline = now > cycle.deadline;
  if (rep.overdueRule === "run") {
    if (states[runStep] === "unknown") return "unknown";          // couldn't read: never claim overdue
    if (states[runStep] !== "done") return pastDeadline ? "overdue" : "due";
    return "progress";
  }
  if (pastDeadline) {
    // "Overdue" only when something is genuinely missing: an AUTO step that is open, or manual
    // tracking that was started here but not finished. A cycle whose automatic steps all
    // landed and that never had any manual box recorded here (e.g. it predates the tracker)
    // is "Not tracked", not overdue.
    const autoOpen = rep.steps.some(s => s.kind === "auto" && states[s.key] === "open");
    const manualStarted = rep.steps.some(s => s.kind === "manual" && states[s.key] === "done");
    return autoOpen || manualStarted ? "overdue" : "untracked";
  }
  const anyDone = rep.steps.some(s => states[s.key] === "done");
  if (now >= cycle.windowStart && now <= cycle.windowEnd && states[runStep] !== "done") return "due";
  return anyDone ? "progress" : "due";
}

// ─── Google API plumbing ─────────────────────────────────────────────────────

export class TrackerApiError extends Error {
  status: number;
  constructor(msg: string, status: number) { super(msg); this.status = status; }
}
const RETRY_DELAYS_MS = [4_000, 15_000];
const sleepMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
/** Fetch with Bearer token. Retries 429/503 (Google per-minute quota is shared with the whole portal) with backoff. */
async function gfetch(token: string, url: string, init?: RequestInit): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    let data: any = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (res.ok) return data;
    if ((res.status === 429 || res.status === 503) && attempt < RETRY_DELAYS_MS.length) {
      await sleepMs(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    throw new TrackerApiError(data?.error?.message || `Google API ${res.status}`, res.status);
  }
}
const S = "https://sheets.googleapis.com/v4/spreadsheets";
const D = "https://www.googleapis.com/drive/v3/files";
const q = encodeURIComponent;

async function sheetTitles(token: string, id: string): Promise<{ title: string; sheetId: number }[]> {
  const meta = await gfetch(token, `${S}/${id}?fields=sheets.properties(title,sheetId)`);
  return (meta.sheets || []).map((s: any) => ({ title: s.properties?.title || "", sheetId: s.properties?.sheetId }));
}
async function readRange(token: string, id: string, range: string): Promise<string[][]> {
  const d = await gfetch(token, `${S}/${id}/values/${q(range)}`);
  return d.values || [];
}

// ─── Tracker sheet: tabs ─────────────────────────────────────────────────────

const CHECKS = "Checks", TASKS = "Tasks", LOG = "Log";
const CHECKS_HDR = ["period_key", "step_key", "done", "updated_at", "updated_by", "evidence"];
const TASKS_HDR = ["id", "title", "due", "done", "notes", "deleted", "updated_at", "updated_by"];
const LOG_HDR = ["timestamp", "user", "period_key", "step_key", "done"];

const ENSURED_KEY = "report_tracker_tabs_ok_v1";
let ensured = false;
const sessionGet = () => { try { return typeof sessionStorage !== "undefined" && sessionStorage.getItem(ENSURED_KEY) === "1"; } catch { return false; } };
const sessionSet = () => { try { if (typeof sessionStorage !== "undefined") sessionStorage.setItem(ENSURED_KEY, "1"); } catch { /* ignore */ } };

/**
 * Idempotent. Normal case costs ONE read (the tab list) — and zero once confirmed this session.
 * First run only: renames the CSV-imported first tab to "Checks"; adds missing Tasks / Log tabs and writes
 * their header rows (no header reads needed: we only write headers for tabs we just created).
 */
export async function ensureTrackerTabs(token: string): Promise<void> {
  if (ensured || sessionGet()) { ensured = true; return; }
  const tabs = await sheetTitles(token, TRACKER_SHEET_ID);
  const have = new Set(tabs.map(t => t.title));
  const requests: any[] = [];
  const newHeaders: [string, string[]][] = [];
  if (!have.has(CHECKS) && tabs.length > 0) {
    const first = tabs[0];
    const a1 = await readRange(token, TRACKER_SHEET_ID, `'${first.title}'!A1`).catch(() => [] as string[][]);
    if (a1[0]?.[0] === "period_key") {
      requests.push({ updateSheetProperties: { properties: { sheetId: first.sheetId, title: CHECKS }, fields: "title" } });
      have.add(CHECKS);
    }
  }
  for (const [name, hdr] of [[CHECKS, CHECKS_HDR], [TASKS, TASKS_HDR], [LOG, LOG_HDR]] as [string, string[]][]) {
    if (!have.has(name)) { requests.push({ addSheet: { properties: { title: name } } }); newHeaders.push([name, hdr]); }
  }
  if (requests.length) {
    await gfetch(token, `${S}/${TRACKER_SHEET_ID}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
  }
  for (const [name, hdr] of newHeaders) {
    const range = `${name}!A1:${String.fromCharCode(64 + hdr.length)}1`;
    await gfetch(token, `${S}/${TRACKER_SHEET_ID}/values/${q(range)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [hdr] }) });
  }
  // Older tracker sheets have a 5-column Checks tab: add the "evidence" header (column F) once.
  if (!newHeaders.some(([n]) => n === CHECKS)) {
    const f1 = await readRange(token, TRACKER_SHEET_ID, `${CHECKS}!F1`).catch(() => [] as string[][]);
    if (!f1[0] || !f1[0][0]) {
      await gfetch(token, `${S}/${TRACKER_SHEET_ID}/values/${q(`${CHECKS}!F1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [["evidence"]] }) });
    }
  }
  ensured = true;
  sessionSet();
}

// ─── Tracker sheet: checks ───────────────────────────────────────────────────

export interface CheckRow { done: boolean; at: string; by: string; evidence: string }

/** Rows written by the nightly Slack-check job use updated_by = "slack-check" and an evidence prefix. */
export const SLACK_CHECK_USER = "slack-check";
export type EvidenceKind = "found" | "review" | "unclear";
export function evidenceKind(row: CheckRow | undefined): EvidenceKind | null {
  if (!row || row.by !== SLACK_CHECK_USER) return null;
  const e = (row.evidence || "").trim().toUpperCase();
  if (e.startsWith("FOUND:")) return "found";
  if (e.startsWith("REVIEW:")) return "review";
  if (e.startsWith("UNCLEAR:")) return "unclear";
  return null;
}
/** Evidence text without its FOUND:/REVIEW:/UNCLEAR: prefix. */
export const evidenceText = (row: CheckRow | undefined) => (row?.evidence || "").replace(/^\s*(FOUND|REVIEW|UNCLEAR):\s*/i, "").trim();
const truthy = (v: any) => String(v ?? "").trim().toUpperCase() === "TRUE";

function parseChecks(rows: string[][]): Record<string, CheckRow> {
  const out: Record<string, CheckRow> = {};
  for (const r of rows) {
    if (!r[0] || !r[1]) continue;
    out[`${r[0]}|${r[1]}`] = { done: truthy(r[2]), at: r[3] || "", by: r[4] || "", evidence: r[5] || "" };
  }
  return out;
}
export async function readChecks(token: string): Promise<Record<string, CheckRow>> {
  await ensureTrackerTabs(token);
  return parseChecks(await readRange(token, TRACKER_SHEET_ID, `${CHECKS}!A2:F`));
}

export async function writeCheck(token: string, periodKey: string, stepKey: string, done: boolean, by: string): Promise<void> {
  await ensureTrackerTabs(token);
  const now = new Date().toISOString();
  const keys = await readRange(token, TRACKER_SHEET_ID, `${CHECKS}!A2:B`);
  const idx = keys.findIndex(r => r[0] === periodKey && r[1] === stepKey);
  // A human tick/untick always wins: it replaces any slack-check row and clears its evidence (column F).
  const row = [periodKey, stepKey, done, now, by, ""];
  if (idx >= 0) {
    const n = idx + 2;
    await gfetch(token, `${S}/${TRACKER_SHEET_ID}/values/${q(`${CHECKS}!A${n}:F${n}`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [row] }) });
  } else {
    await gfetch(token, `${S}/${TRACKER_SHEET_ID}/values/${q(`${CHECKS}!A:F`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [row] }) });
  }
  // best-effort audit trail
  gfetch(token, `${S}/${TRACKER_SHEET_ID}/values/${q(`${LOG}!A:E`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST", body: JSON.stringify({ values: [[now, by, periodKey, stepKey, done]] }),
  }).catch(() => {});
}

export interface Confirmation { periodKey: string; step: string }
/** Persist auto-confirmed steps (one batched append). Writes ONLY to the tracker sheet. */
export async function writeAutoConfirmations(token: string, items: Confirmation[]): Promise<void> {
  if (!items.length) return;
  await ensureTrackerTabs(token);
  const now = new Date().toISOString();
  const rows = items.map(i => [i.periodKey, `${AUTO_PREFIX}${i.step}`, true, now, "auto-check", ""]);
  await gfetch(token, `${S}/${TRACKER_SHEET_ID}/values/${q(`${CHECKS}!A:F`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST", body: JSON.stringify({ values: rows }),
  });
}

// ─── Tracker sheet: tasks ────────────────────────────────────────────────────

export interface TaskItem { id: string; title: string; due: string; done: boolean; notes: string }

function parseTasks(rows: string[][]): TaskItem[] {
  return rows
    .filter(r => r[0] && !truthy(r[5]))
    .map(r => ({ id: r[0], title: r[1] || "", due: r[2] || "", done: truthy(r[3]), notes: r[4] || "" }));
}
export async function readTasks(token: string): Promise<TaskItem[]> {
  await ensureTrackerTabs(token);
  return parseTasks(await readRange(token, TRACKER_SHEET_ID, `${TASKS}!A2:H`));
}

/** Checks + Tasks in ONE Sheets read (batchGet) — keeps us far under Google's per-minute quota. */
export async function readTrackerData(token: string): Promise<{ checks: Record<string, CheckRow>; tasks: TaskItem[] }> {
  await ensureTrackerTabs(token);
  const d = await gfetch(token, `${S}/${TRACKER_SHEET_ID}/values:batchGet?ranges=${q(`${CHECKS}!A2:F`)}&ranges=${q(`${TASKS}!A2:H`)}`);
  const vr = d.valueRanges || [];
  return { checks: parseChecks(vr[0]?.values || []), tasks: parseTasks(vr[1]?.values || []) };
}

const CARRY_OVER_MAX_AGE_MS = 14 * 86_400_000;
/** A previous cycle is only shown (as "carry-over") if it is recent AND you already started tracking it here. */
export function shouldCarryOver(prev: Cycle, tracked: Set<string>, now: number): boolean {
  return tracked.has(prev.periodKey) && now - prev.deadline < CARRY_OVER_MAX_AGE_MS;
}

/** Which period keys have at least one recorded manual check (used to decide what is "being tracked"). */
export function trackedPeriods(checks: Record<string, CheckRow>): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(checks)) {
    const [period, step] = k.split("|");
    if (v.done && step && !step.startsWith(AUTO_PREFIX)) out.add(period);
  }
  return out;
}

async function taskRowIndex(token: string, id: string): Promise<number> {
  const ids = await readRange(token, TRACKER_SHEET_ID, `${TASKS}!A2:A`);
  return ids.findIndex(r => r[0] === id);
}

export async function writeTask(token: string, t: TaskItem, by: string, deleted = false): Promise<void> {
  await ensureTrackerTabs(token);
  const row = [t.id, t.title, t.due, t.done, t.notes, deleted, new Date().toISOString(), by];
  const idx = await taskRowIndex(token, t.id);
  if (idx >= 0) {
    const n = idx + 2;
    await gfetch(token, `${S}/${TRACKER_SHEET_ID}/values/${q(`${TASKS}!A${n}:H${n}`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [row] }) });
  } else {
    await gfetch(token, `${S}/${TRACKER_SHEET_ID}/values/${q(`${TASKS}!A:H`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [row] }) });
  }
}

export const newTaskId = () => `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ─── Auto-checks (READ-ONLY against report sheets / Drive) ───────────────────

export type AutoMap = Record<string, AutoResult>;
export type AutoByPeriod = Record<string, AutoMap>; // periodKey → step → result

const parseMoney = (s: string | undefined) => {
  const n = parseFloat(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Ad Spend: first tab, row1 = years, row2 = month labels, row "Amazon…" = values. */
export function adSpendFromGrid(grid: string[][], y: number, m: number): AutoResult {
  const years = grid[0] || [], months = grid[1] || [];
  const amazonRow = grid.find(r => /^amazon/i.test((r[0] || "").trim()));
  if (!amazonRow) return { state: "unknown", detail: "No 'Amazon' row found" };
  for (let c = 1; c < Math.max(years.length, months.length); c++) {
    if (String(years[c]).trim() !== String(y)) continue;
    if ((months[c] || "").trim().toLowerCase().slice(0, 3) !== MONTH_ABBR[m - 1]) continue;
    const v = parseMoney(amazonRow[c]);
    if (Number.isNaN(v)) return { state: "no", detail: "Month column is blank" };
    return v > 0 ? { state: "ok", detail: `Amazon ad spend $${v.toFixed(2)}` } : { state: "no", detail: "Month column is still $0.00" };
  }
  return { state: "unknown", detail: `No ${MONTHS[m - 1]} ${y} column found` };
}

const DATE_RX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
/** Latest date (ms, UTC midnight) found in a column of strings; M/D/YYYY or YYYY-MM-DD. */
export function latestDateIn(col: string[][]): number | null {
  let best: number | null = null;
  for (const r of col) {
    const s = (r[0] || "").trim();
    let t: number | null = null;
    const m = DATE_RX.exec(s);
    if (m) t = Date.UTC(+m[3], +m[1] - 1, +m[2]);
    else if (/^\d{4}-\d{2}-\d{2}/.test(s)) t = Date.parse(s.slice(0, 10) + "T00:00:00Z");
    if (t != null && !Number.isNaN(t) && (best == null || t > best)) best = t;
  }
  return best;
}

const settle = async <T,>(p: Promise<T>): Promise<T | { __err: TrackerApiError }> => {
  try { return await p; } catch (e: any) { return { __err: e instanceof TrackerApiError ? e : new TrackerApiError(String(e && e.message || e), 0) }; }
};
const isErr = (v: any): v is { __err: TrackerApiError } => v && typeof v === "object" && "__err" in v;
export function reasonFor(e: TrackerApiError): AutoReason {
  if (e.status === 401) return "auth";
  if (e.status === 403 || e.status === 404) return "access";
  if (e.status === 0 || e.status === 429 || e.status >= 500) return "busy";
  return "error";
}
const unknown = (e: TrackerApiError): AutoResult => ({ state: "unknown", reason: reasonFor(e), detail: e.message });

export interface AutoCheckOutput { byPeriod: AutoByPeriod; errors: string[] }

/** Auto steps (per cycle) that still need a read, given the already-confirmed set ("period|step"). */
export function pendingAutoSteps(cycles: Cycle[], confirmed: Set<string>): { cycle: Cycle; steps: string[] }[] {
  return cycles
    .map(c => ({
      cycle: c,
      steps: reportById(c.reportId).steps.filter(s => s.kind === "auto" && !confirmed.has(`${c.periodKey}|${s.key}`)).map(s => s.key),
    }))
    .filter(x => x.steps.length > 0);
}

/**
 * Runs the auto-checks still needed. READ-ONLY against report sheets / Drive.
 * Steps in `confirmed` ("periodKey|step") are skipped, and a source is only read if some pending step
 * needs it, so a fully-confirmed report costs zero reads.
 */
export async function runAutoChecks(token: string, cycles: Cycle[], confirmed: Set<string> = new Set()): Promise<AutoCheckOutput> {
  const byPeriod: AutoByPeriod = {};
  const errors: string[] = [];
  const pending = pendingAutoSteps(cycles, confirmed);
  const needs = (rid: ReportId, step: string) => pending.some(p => p.cycle.reportId === rid && p.steps.includes(step));
  const anyNeeds = (rids: ReportId[], step: string) => rids.some(r => needs(r, step));
  const none = Promise.resolve(null);

  const [ftaTabs, amzTabs, usuFiles, allTimeMeta, toastCol, adGrid] = await Promise.all([
    needs("fta", "run") ? settle(sheetTitles(token, SRC.ftaSheet)) : none,
    anyNeeds(["cprow", "cprom"], "run") ? settle(sheetTitles(token, SRC.amazonSales)) : none,
    needs("fta", "invoice") ? settle(gfetch(token, `${D}?q=${q(`'${SRC.usuFolder}' in parents and trashed=false`)}&orderBy=createdTime%20desc&pageSize=15&fields=files(id,name,createdTime)&supportsAllDrives=true&includeItemsFromAllDrives=true`)) : none,
    anyNeeds(["cprow", "cprom"], "alltime") ? settle(gfetch(token, `${D}/${SRC.salesAllTime}?fields=modifiedTime&supportsAllDrives=true`)) : none,
    needs("toast", "run") ? settle(readRange(token, SRC.toastRecon, "'Toast Data'!E:E")) : none,
    needs("cprom", "adspend") ? settle(readRange(token, SRC.adSpend, "A1:Z30")) : none,
  ]);

  for (const { cycle: c, steps } of pending) {
    const m: AutoMap = (byPeriod[c.periodKey] = {});
    const want = new Set(steps);
    if (c.reportId === "fta") {
      if (want.has("run")) {
        if (isErr(ftaTabs)) { m.run = unknown(ftaTabs.__err); errors.push("FTA sheet: " + ftaTabs.__err.message); }
        else if (ftaTabs) m.run = (ftaTabs as any[]).some(t => t.title === c.tabName)
          ? { state: "ok", detail: `Tab ${c.tabName} found` } : { state: "no", detail: `No tab ${c.tabName} yet` };
      }
      if (want.has("invoice")) {
        if (isErr(usuFiles)) { m.invoice = unknown(usuFiles.__err); errors.push("USU folder: " + usuFiles.__err.message); }
        else if (usuFiles) {
          const hit = ((usuFiles as any).files || []).find((f: any) => {
            const t = Date.parse(f.createdTime);
            return t >= c.windowStart && t < c.nextStart && /^USU\s/i.test(f.name || "");
          });
          m.invoice = hit ? { state: "ok", detail: hit.name } : { state: "no", detail: "No new USU invoice in the folder yet" };
        }
      }
    }
    if (c.reportId === "cprow" || c.reportId === "cprom") {
      if (want.has("run")) {
        if (isErr(amzTabs)) { m.run = unknown(amzTabs.__err); errors.push("Amazon Sales Report: " + amzTabs.__err.message); }
        else if (amzTabs) m.run = (amzTabs as any[]).some(t => amazonTabMatches(t.title || "", c))
          ? { state: "ok", detail: `Tab ${c.tabName} found` } : { state: "no", detail: `No tab ${c.tabName} yet` };
      }
      if (want.has("alltime")) {
        if (isErr(allTimeMeta)) { m.alltime = unknown(allTimeMeta.__err); errors.push("Sales All Time: " + allTimeMeta.__err.message); }
        else if (allTimeMeta) {
          const t = Date.parse((allTimeMeta as any).modifiedTime);
          m.alltime = t >= c.windowStart - 3600_000 ? { state: "ok", detail: `Edited ${fmtPht(t)}` } : { state: "no", detail: `Last edited ${fmtPht(t)}` };
        }
      }
    }
    if (c.reportId === "cprom" && c.month && want.has("adspend")) {
      if (isErr(adGrid)) { m.adspend = unknown(adGrid.__err); errors.push("Ad Spend: " + adGrid.__err.message); }
      else if (adGrid) m.adspend = adSpendFromGrid(adGrid as string[][], c.month.y, c.month.m);
    }
    if (c.reportId === "toast" && c.month && want.has("run")) {
      if (isErr(toastCol)) { m.run = unknown(toastCol.__err); errors.push("Toast Recon: " + toastCol.__err.message); }
      else if (toastCol) {
        const latest = latestDateIn(toastCol as string[][]);
        const monthEnd = Date.UTC(c.month.y, c.month.m - 1, c.month.lastDay);
        if (latest == null) m.run = { state: "unknown", reason: "error", detail: "No settled dates found" };
        else {
          const d = new Date(latest);
          const txt = `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()}`;
          m.run = latest >= monthEnd ? { state: "ok", detail: `Latest settled date ${txt}` } : { state: "no", detail: `Latest settled date is only ${txt}` };
        }
      }
    }
  }
  return { byPeriod, errors: [...new Set(errors)] };
}

// ─── History (built only from the Checks tab; no extra reads) ─────────────────

/** Tracking starts on this date (Philippine time). Earlier runs are not listed in History. */
export const TRACKING_START_MS = fromPht(2026, 6, 1, 0, 0);

/** step_key used to mark a run as "No report due" (for example an FTA school-break week). */
export const SKIP_STEP = "skip";
export const isSkipped = (checks: Record<string, { done: boolean }>, periodKey: string) => !!checks[`${periodKey}|${SKIP_STEP}`]?.done;

export interface HistoryRow {
  reportId: ReportId; reportName: string; periodKey: string; label: string;
  windowStart: number; deadline: number;
  status: "done" | "partial" | "none" | "skipped";
  done: number; total: number;
  lastAt: string;            // ISO of the most recent tick/confirmation recorded for this run ("" if none)
  groupKey: string;          // "YYYY-MM" the week belongs to (weekly reports only; "" for monthly reports)
  groupLabel: string;        // "September 2026"
}

/** Month a weekly run is grouped under = the month its displayed week starts in. */
export function weeklyGroup(periodKey: string): { key: string; label: string } {
  const [kind, date] = periodKey.split(":");
  const [y, m, d] = date.split("-").map(Number);
  const start = kind === "cprow" ? toPht(fromPht(y, m, d - 8, 12)) : { y, m, d };
  return { key: `${start.y}-${pad(start.m)}`, label: `${MONTHS[start.m - 1]} ${start.y}` };
}

/**
 * Past runs since TRACKING_START_MS (newest first), computed from what is stored in the tracker sheet.
 * The currently active run is skipped (it is shown in the cards above). Runs from before the tracker
 * existed have no rows, so they come back as status "none". A run marked with the "skip" step is "skipped".
 */
export function historyRows(now: number, checks: Record<string, CheckRow>, startMs: number = TRACKING_START_MS): HistoryRow[] {
  const flat: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(checks)) flat[k] = v.done;
  const startMonth = toPht(startMs);
  const out: HistoryRow[] = [];
  for (const rep of REPORTS) {
    const started = cyclesAround(rep.id, now).filter(c => c.windowStart <= now).sort((a, b) => b.windowStart - a.windowStart);
    const past = started.slice(1).filter(c =>
      c.month ? (c.month.y * 12 + c.month.m >= startMonth.y * 12 + startMonth.m) : c.windowStart >= startMs);
    for (const c of past) {
      const st = stepStates(rep, c, undefined, flat);
      const done = rep.steps.filter(s => st[s.key] === "done").length;
      let lastAt = "";
      for (const s of [...rep.steps.map(x => x.key), SKIP_STEP]) {
        for (const key of [`${c.periodKey}|${s}`, `${c.periodKey}|${AUTO_PREFIX}${s}`]) {
          const r = checks[key];
          if (r && r.at && r.at > lastAt) lastAt = r.at;
        }
      }
      const g = c.month ? { key: "", label: "" } : weeklyGroup(c.periodKey);
      out.push({
        reportId: rep.id, reportName: rep.name, periodKey: c.periodKey, label: c.label,
        windowStart: c.windowStart, deadline: c.deadline,
        status: isSkipped(checks, c.periodKey) ? "skipped" : done === rep.steps.length ? "done" : done > 0 ? "partial" : "none",
        done, total: rep.steps.length, lastAt, groupKey: g.key, groupLabel: g.label,
      });
    }
  }
  return out;
}

// ─── Calendar events (portal local calendar) ─────────────────────────────────

export interface PlannedEvent { title: string; date: string; time: string; description: string }

export function plannedCalendarEvents(now: number, horizonDays = 45): PlannedEvent[] {
  const out: PlannedEvent[] = [];
  const limit = now + horizonDays * 86400_000;
  for (const rep of REPORTS) {
    for (const c of cyclesAround(rep.id, now)) {
      if (c.windowStart < now - 86400_000 || c.windowStart > limit) continue;
      const w = toPht(c.windowStart);
      const steps = rep.steps.map(s => `• ${s.label}`).join("\n");
      out.push({
        title: `📊 ${rep.name} — ${rep.id === "toast" ? "run today (data ready)" : "run script (5–7 PM PHT)"}`,
        date: isoDate(w), time: rep.id === "toast" ? "09:00" : "17:00",
        description: `${rep.script} · period: ${c.label}\n${steps}\n(Tracked on Report Tracker; times are Philippine Time.)`,
      });
      if (rep.id === "cprom") {
        const dl = toPht(c.deadline);
        out.push({
          title: `⏰ ${rep.name} — deadline (manual sheets + dashboard + Micah)`,
          date: isoDate(dl), time: "17:00",
          description: `Website & Storage sheet, Brand Payout sheet, Ad Spend, dashboard check, then inform Micah. Period: ${c.label}.`,
        });
      }
    }
  }
  return out;
}
