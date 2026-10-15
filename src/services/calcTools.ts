/**
 * Calc — read-only data tools.
 *
 * Every tool reads the portal's already-loaded, sheet-synced state (a CalcSnapshot built from
 * FinanceContext). Nothing here writes anywhere. Each tool returns:
 *   - lines : ready-to-display markdown-ish lines (used directly when no AI is needed)
 *   - data  : compact structured facts (sent to the AI as the ONLY allowed source of truth)
 *   - source / asOf : so every answer can say where its numbers came from
 */
import type { APBill, BankAccount, BankStatement, DashboardNote, ExternalLinkItem, PageRoute } from "../types";
import { billRemaining, formatCurrency, parseDueDateToDate, formatDateTimeLocal } from "../utils/formatters";
import { FAQ, HOWTOS, BREAKAGE } from "../components/pages/HelpPage";
import { rankHelpDocs, bestExcerpt, type HelpDoc } from "./calcHelpSearch";
import { manilaToday, parseCutOffDay, cutOffInMonth, fmtStmtDate, dueNextWeek, STATEMENT_GENERATE_DAYS_BEFORE } from "../utils/statementSchedule";
import type { RawRow, WeekMeta } from "./fourYrPayrollService";

export interface CalcLink { label: string; page: PageRoute }

export interface CalcEvent {
  date: string;      // YYYY-MM-DD
  time?: string;     // HH:MM
  title: string;
  entity?: string;
  assignee?: string;
  done?: boolean;
  source: "sheet" | "dashboard" | "google";
}

export interface CalcSnapshot {
  now: Date;
  lastSyncedAt: string | null;
  apBills: APBill[];
  bankAccounts: BankAccount[];
  bankStatements: BankStatement[];
  events: CalcEvent[];
  quickNotes: DashboardNote[];
  externalLinks: ExternalLinkItem[];
  /** Bank Statements reference table (each bank's Cut-Off Date = its due date). */
  statementTemplates?: Array<{ entity: string; bank: string; cycle?: string; cutOffDate?: string }>;
  /** The portal's shared Activity Log rows [timestamp, user, action, details], read on demand (null = can't read). */
  getActivity?: () => Promise<string[][] | null>;
  /** Reads the 4YR payroll sheet with the signed-in user's own Google access (null = not signed in / can't read). */
  getPayroll?: () => Promise<{ rows: RawRow[]; weeks: WeekMeta[] } | null>;
}

export interface ToolResult {
  tool: string;
  title: string;
  lines: string[];
  data: any;
  source: string;
  asOf: string;
  links?: CalcLink[];
  /** Clickable follow-ups shown under the answer (each re-runs a lookup, no AI needed). */
  suggest?: { label: string; tool: string; args: Record<string, any> }[];
}

type ToolArgs = Record<string, any>;
export interface CalcToolDef {
  description: string;
  args: string;
  run: (s: CalcSnapshot, a: ToolArgs) => ToolResult | Promise<ToolResult>;
}

// ── helpers ─────────────────────────────────────────────────────────────────
const DAY = 86_400_000;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lc = (v: any) => String(v ?? "").toLowerCase().trim();
const asOfText = (s: CalcSnapshot) => (s.lastSyncedAt ? `last synced ${formatDateTimeLocal(s.lastSyncedAt)}` : "not synced yet this session");
const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** "TI - Corner Property Group" for TI bills, plain entity otherwise (same rule as the bill details modal). */
export const entityLabel = (b: { entity?: string; company?: string }) =>
  b.entity === "TI" ? `TI - ${(b.company || "").trim() || "TI"}` : String(b.entity || "");

const entityMatches = (b: { entity?: string; company?: string }, want?: string) => {
  if (!want) return true;
  const w = lc(want);
  return lc(b.entity) === w || lc(entityLabel(b)).includes(w) || lc(b.company).includes(w);
};

// "Open" = not paid (unpaid + on hold), matching the Hub banner, the AP page and the sidebar badge.
const isOpenBill = (b: APBill) => !!b.status && !["paid", "done", "completed"].includes(String(b.status).toLowerCase());
const dueDate = (b: APBill) => { const d = parseDueDateToDate(b.dueDate); return d ? startOfDay(d) : null; };
const money = (n: number) => formatCurrency(n);

const billLine = (b: APBill, today: Date) => {
  const d = dueDate(b);
  const diff = d ? Math.round((d.getTime() - today.getTime()) / DAY) : null;
  const when = diff === null ? (b.dueDate || "no due date") : diff < 0 ? `due ${b.dueDate}, ${-diff}d late` : diff === 0 ? "due today" : `due ${b.dueDate}, in ${diff}d`;
  const inv = b.invoiceNo ? ` · inv ${b.invoiceNo}` : "";
  const part = b.partialPaid && b.partialPaid > 0 && b.status !== "paid" ? ` (partially paid ${money(b.partialPaid)})` : "";
  const hold = b.status === "hold" ? " · ON HOLD" : "";
  if (b.status === "paid") {
    const pd = b.paidDate || b.paymentDate;
    return `• **${b.vendor}** (${entityLabel(b)}): ${money(b.originalAmount ?? b.amount)}, paid ${pd || "(date not recorded)"}${inv}`;
  }
  return `• **${b.vendor}** (${entityLabel(b)}) — ${money(billRemaining(b))}${part}, ${when}${inv}${hold}`;
};

const billFact = (b: APBill, today: Date) => {
  const d = dueDate(b);
  return {
    vendor: b.vendor, entity: entityLabel(b), invoiceNo: b.invoiceNo || "", dueDate: b.dueDate,
    daysFromToday: d ? Math.round((d.getTime() - today.getTime()) / DAY) : null,
    remaining: billRemaining(b), status: b.status, sheet: b.sheet || "",
  };
};

const AP_LINK: CalcLink[] = [{ label: "Open Accounts Payable", page: "ap" }];

// ── tools ───────────────────────────────────────────────────────────────────
// ── bill answers: talk like an assistant — lead with the total, add insight, list bills only when asked ──
const AGE_ORDER = ["30+ days late", "8–30 days late", "1–7 days late", "due today", "due in 1–7 days", "due in 8+ days", "no due date"];
const ageBucket = (b: APBill, today: Date): string => {
  const d = dueDate(b);
  if (!d) return "no due date";
  const late = Math.round((today.getTime() - d.getTime()) / DAY);
  if (late > 30) return "30+ days late";
  if (late > 7) return "8–30 days late";
  if (late >= 1) return "1–7 days late";
  if (late === 0) return "due today";
  return late >= -7 ? "due in 1–7 days" : "due in 8+ days";
};

interface BillSummary {
  count: number; total: number; held: { n: number; total: number };
  byEntity: Record<string, { n: number; total: number }>;
  byAge: Record<string, { n: number; total: number }>;
  byDay: Record<string, { n: number; total: number }>;
  overdue: { n: number; total: number };
}
function summarizeBills(bills: APBill[], today: Date): BillSummary {
  const sm: BillSummary = { count: bills.length, total: 0, held: { n: 0, total: 0 }, byEntity: {}, byAge: {}, byDay: {}, overdue: { n: 0, total: 0 } };
  bills.forEach(b => {
    const r = billRemaining(b); sm.total += r;
    if (b.status === "hold") { sm.held.n++; sm.held.total += r; }
    const e = String(b.entity || "Other"); (sm.byEntity[e] ||= { n: 0, total: 0 }); sm.byEntity[e].n++; sm.byEntity[e].total += r;
    const g = ageBucket(b, today); (sm.byAge[g] ||= { n: 0, total: 0 }); sm.byAge[g].n++; sm.byAge[g].total += r;
    const d = dueDate(b);
    if (d) {
      const k = iso(d); (sm.byDay[k] ||= { n: 0, total: 0 }); sm.byDay[k].n++; sm.byDay[k].total += r;
      if (d.getTime() < today.getTime()) { sm.overdue.n++; sm.overdue.total += r; }
    }
  });
  return sm;
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const sortedEntities = (sm: BillSummary) => Object.entries(sm.byEntity).sort((x, y) => y[1].total - x[1].total);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** A few plain-English observations a good assistant would volunteer. */
function insightLines(sm: BillSummary, opts: { age: boolean; busiest: boolean }): string[] {
  const out: string[] = [];
  const ents = sortedEntities(sm);
  if (ents.length > 1) {
    const [name, v] = ents[0];
    out.push(`${name} makes up the biggest share: ${money(v.total)} (${pct(v.total, sm.total)}%). ` + ents.slice(1).map(([k, x]) => `${k} ${money(x.total)}`).join(", ") + ".");
  }
  if (opts.age) {
    const worst = AGE_ORDER.filter(k => sm.byAge[k]).sort((x, y) => sm.byAge[y].total - sm.byAge[x].total)[0];
    if (worst) out.push(`The largest chunk is ${worst}: ${money(sm.byAge[worst].total)} across ${plural(sm.byAge[worst].n, "bill")}.`);
  }
  if (opts.busiest) {
    const days = Object.entries(sm.byDay).sort((x, y) => y[1].total - x[1].total);
    if (days.length > 1) { const [k, v] = days[0]; out.push(`The heaviest day is ${fmtDay(new Date(k + "T00:00:00"))}, with ${money(v.total)} due (${plural(v.n, "bill")}).`); }
  }
  if (sm.held.n) out.push(`${plural(sm.held.n, "of these bill")} (${money(sm.held.total)}) ${sm.held.n === 1 ? "is" : "are"} on hold.`);
  return out;
}

function billAnswerLines(headline: string, bills: APBill[], today: Date, o: { list: boolean; limit: number; insight: { age: boolean; busiest: boolean }; followUp: string; recent?: boolean }): { lines: string[]; sm: BillSummary; shown: APBill[] } {
  const sm = summarizeBills(bills, today);
  const lines: string[] = [headline];
  insightLines(sm, o.insight).forEach(t => lines.push(t));
  const paidKey = (b: APBill) => String(b.paidDate || b.paymentDate || "");
  const sorted = [...bills].sort(o.recent
    ? (x, y) => paidKey(y).localeCompare(paidKey(x))
    : o.list
      ? (x, y) => (dueDate(x)?.getTime() ?? 0) - (dueDate(y)?.getTime() ?? 0)
      : (x, y) => billRemaining(y) - billRemaining(x));
  const k = o.list ? Math.min(o.limit, 25) : Math.min(3, sorted.length);
  const shown = sorted.slice(0, k);
  if (o.list && shown.length) {
    lines.push("", `**${shown.length >= bills.length ? "All of them" : o.recent ? `The ${shown.length} most recent` : `The ${shown.length} oldest by due date`}:**`);
    shown.forEach(b => lines.push(billLine(b, today)));
    if (bills.length > shown.length) lines.push(`…plus ${bills.length - shown.length} more.`);
  } else if (shown.length) {
    lines.push("", `**${o.recent ? "Most recent" : "Biggest"} ${shown.length === 1 ? "one" : shown.length}:**`);
    shown.forEach(b => lines.push(billLine(b, today)));
    lines.push("", o.followUp);
  }
  return { lines, sm, shown };
}

const billFactsBlock = (sm: BillSummary, shown: APBill[], today: Date) => ({
  count: sm.count, totalRemaining: sm.total, overdue: sm.overdue, onHold: sm.held,
  byEntity: sm.byEntity, byAge: sm.byAge,
  busiestDay: Object.entries(sm.byDay).sort((x, y) => y[1].total - x[1].total).slice(0, 3).map(([d, v]) => ({ date: d, ...v })),
  examples: shown.map(b => billFact(b, today)),
});

function apOverdue(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const today = startOfDay(s.now);
  const late = s.apBills.filter(b => isOpenBill(b) && entityMatches(b, a.entity) && (!a.vendor || lc(b.vendor).includes(lc(a.vendor))))
    .filter(b => { const d = dueDate(b); return !!d && d.getTime() < today.getTime(); });
  const scope = (a.entity ? ` for ${a.entity}` : "") + (a.vendor ? ` from ${a.vendor}` : "");
  if (late.length === 0)
    return { tool: "ap_overdue", title: "Overdue bills", lines: [`Good news: nothing is overdue${scope}.`], links: AP_LINK, source: "Accounts Payable sheet", asOf: asOfText(s), data: { count: 0, totalRemaining: 0 } };
  const total = late.reduce((t, b) => t + billRemaining(b), 0);
  const r = billAnswerLines(`You have **${money(total)} overdue${scope}**, spread across **${plural(late.length, "bill")}**.`, late, today,
    { list: !!a.list, limit: Number(a.limit) || 25, insight: { age: true, busiest: false }, followUp: "Want the full list, or only the oldest ones?" });
  return { tool: "ap_overdue", title: "Overdue bills", lines: r.lines, links: AP_LINK, source: "Accounts Payable sheet", asOf: asOfText(s), data: { entityFilter: a.entity || null, ...billFactsBlock(r.sm, r.shown, today) } };
}

function apDueSoon(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const today = startOfDay(s.now);
  const days = Math.min(Math.max(Number(a.days) || 7, 1), 60);
  // Weeks run Monday–Sunday, exactly like the AP page's "This Week" / "Next Week" sections.
  const wk = lc(a.week);
  const dow = today.getDay();
  const mon = new Date(today); mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const nMon = new Date(mon); nMon.setDate(mon.getDate() + 7);
  const nSun = new Date(sun); nSun.setDate(sun.getDate() + 7);
  let lo = today.getTime(), hi = today.getTime() + days * DAY, label = `in the next ${days} days`;
  if (wk === "this") { lo = mon.getTime(); hi = sun.getTime(); label = `this week (${fmtDay(mon)} to ${fmtDay(sun)})`; }
  else if (wk === "next") { lo = nMon.getTime(); hi = nSun.getTime(); label = `next week (${fmtDay(nMon)} to ${fmtDay(nSun)})`; }
  const soon = s.apBills.filter(b => isOpenBill(b) && entityMatches(b, a.entity) && (!a.vendor || lc(b.vendor).includes(lc(a.vendor))))
    .filter(b => { const d = dueDate(b); return !!d && d.getTime() >= lo && d.getTime() <= hi; });
  const scope = (a.entity ? ` for ${a.entity}` : "") + (a.vendor ? ` from ${a.vendor}` : "");
  if (soon.length === 0)
    return { tool: "ap_due_soon", title: "Bills due soon", lines: [`Nothing comes due ${label}${scope}.`], links: AP_LINK, source: "Accounts Payable sheet", asOf: asOfText(s), data: { window: label, count: 0, totalRemaining: 0 } };
  const total = soon.reduce((t, b) => t + billRemaining(b), 0);
  const r = billAnswerLines(`**${money(total)} comes due ${label}${scope}**, across **${plural(soon.length, "bill")}**.`, soon, today,
    { list: !!a.list, limit: Number(a.limit) || 25, insight: { age: false, busiest: true }, followUp: "Want them all listed by due date?" });
  // This lookup covers ONLY this window; say so explicitly so nothing outside it gets claimed.
  const lateInWindow = soon.filter(b => dueDate(b)!.getTime() < today.getTime()).length;
  return { tool: "ap_due_soon", title: "Bills due soon", lines: r.lines, links: AP_LINK, source: "Accounts Payable sheet", asOf: asOfText(s),
    data: { window: label, coverage: "ONLY open bills due inside this window; says nothing about bills due outside it", alreadyPastDueInsideWindow: lateInWindow, entityFilter: a.entity || null, ...billFactsBlock(r.sm, r.shown, today) } };
}

/** A full, human description of one bill (used when a search narrows to a specific invoice). */
function billDetailLines(b: APBill, today: Date): string[] {
  const d = dueDate(b);
  const diff = d ? Math.round((d.getTime() - today.getTime()) / DAY) : null;
  const rem = billRemaining(b);
  const orig = b.originalAmount ?? b.amount;
  const statusText = b.status === "paid"
    ? `paid${b.paidDate || b.paymentDate ? " on " + (b.paidDate || b.paymentDate) : ""}${b.paidVia ? " via " + b.paidVia : ""}${b.confirmationNo ? " (confirmation " + b.confirmationNo + ")" : ""}`
    : b.status === "hold" ? "on hold" : "unpaid";
  const dueText = !d ? (b.dueDate || "no due date")
    : `${b.dueDate}${b.status === "paid" ? "" : diff! < 0 ? ` (${-diff!} days overdue)` : diff === 0 ? " (due today)" : ` (in ${diff} days)`}`;
  const out: string[] = [
    `**${b.vendor}** (${entityLabel(b)}), invoice **${b.invoiceNo || "n/a"}**: ${b.status === "paid" ? money(orig) : money(rem)}${b.status === "paid" ? "" : " still to pay"}, ${statusText}.`,
    `• Due: ${dueText}`,
  ];
  if (b.invoiceDate) out.push(`• Invoice date: ${b.invoiceDate}`);
  if (b.partialPaid && b.partialPaid > 0 && b.status !== "paid") out.push(`• Partially paid: ${money(b.partialPaid)} of ${money(orig)} so far`);
  const what = [b.description, b.category, b.subcategory].filter(Boolean).join(" / ");
  if (what) out.push(`• What it is: ${what}`);
  if (b.method) out.push(`• Payment method: ${b.method}${b.paymentType && lc(b.paymentType) !== lc(b.method) ? " (" + b.paymentType + ")" : ""}`);
  if (b.inQBO !== undefined) out.push(`• In QuickBooks: ${b.inQBO ? "yes" : "no"}`);
  const noteParts = [b.remarks, b.notes].filter(Boolean).map(x => String(x).trim());
  const noteLinks = noteParts.filter(x => /^https?:\/\/\S+$/.test(x));
  const noteText = noteParts.filter(x => !/^https?:\/\/\S+$/.test(x)).join(" | ");
  if (noteText) out.push(`• Notes: ${noteText.slice(0, 200)}`);
  noteLinks.forEach(u => out.push(`• Linked ${/mail\.google/.test(u) ? "email" : "page"}: [open it](${u.replace(/\)/g, "%29")})`));
  out.push(`• Bill copy: ${b.driveViewUrl ? `[open the attached file](${b.driveViewUrl})` : "no file attached"}`);
  return out;
}

/** Tiny edit-distance for "did you mean" vendor suggestions. */
function lev(a: string, b: string): number {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  const d: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= n; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return d[n];
}
function similarVendors(s: CalcSnapshot, term: string): string[] {
  const t = lc(term).replace(/[^a-z0-9 ]/g, " ").trim(); if (!t) return [];
  const toks = t.split(/\s+/).filter(x => x.length >= 3);
  const names = Array.from(new Set(s.apBills.map(b => String(b.vendor || "").trim()).filter(Boolean)));
  const scored = names.map(n => {
    const ln = lc(n); const words = ln.split(/[^a-z0-9]+/).filter(Boolean);
    let sc = 99;
    for (const tk of toks) {
      if (ln.includes(tk)) sc = Math.min(sc, 0);
      for (const w of words) { const dist = lev(tk, w.slice(0, Math.max(tk.length, 3))); if (dist <= Math.max(1, Math.floor(tk.length / 4))) sc = Math.min(sc, dist + 1); }
    }
    return { n, sc };
  }).filter(x => x.sc < 99).sort((x, y) => x.sc - y.sc || x.n.length - y.n.length);
  return scored.slice(0, 5).map(x => x.n);
}

function apSearch(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const today = startOfDay(s.now);
  const v = lc(a.vendor), inv = lc(a.invoiceNo), st = lc(a.status);
  const dueBy = a.dueByDays !== undefined && a.dueByDays !== null && a.dueByDays !== "" ? today.getTime() + Number(a.dueByDays) * DAY : null;
  const openOnly = a.openOnly === true || dueBy !== null;
  const hits = s.apBills.filter(b =>
    (!v || lc(b.vendor).includes(v)) &&
    (!inv || lc(b.invoiceNo).includes(inv)) &&
    (!st || b.status === st) &&
    (!openOnly || isOpenBill(b)) &&
    (dueBy === null || (dueDate(b) !== null && dueDate(b)!.getTime() <= dueBy)) &&
    entityMatches(b, a.entity));
  // Nothing matched the "vendor"? It may be an entity / TI sub-entity ("Corner Property"), or a typo ("Alsko").
  if (hits.length === 0 && v && !inv) {
    if (s.apBills.some(b => entityMatches(b, a.vendor))) {
      const res = apSearch(s, { ...a, vendor: undefined, entity: a.vendor });
      res.lines.unshift(`No vendor is called "${a.vendor}", but it matches an entity, so here are that entity's bills.`, "");
      return res;
    }
    const sim = similarVendors(s, String(a.vendor));
    if (sim.length) {
      return { tool: "ap_search", title: "Bill search", lines: [`I couldn't find a vendor called "${a.vendor}". Did you mean ${sim.slice(0, 5).join(", ")}?`], links: AP_LINK, source: "Accounts Payable sheet", asOf: asOfText(s),
        data: { count: 0, totalRemaining: 0, noVendorMatchFor: a.vendor, similarVendors: sim },
        suggest: sim.slice(0, 4).map(n => ({ label: n, tool: "ap_search", args: { vendor: n, openOnly: true } })) };
    }
  }
  const who = a.vendor ? String(a.vendor).replace(/\b\w/g, c => c.toUpperCase()) : "";
  const byLabel = dueBy !== null ? (Number(a.dueByDays) === 0 ? "today" : fmtDay(new Date(dueBy))) : "";
  if (hits.length === 0)
    return { tool: "ap_search", title: "Bill search", lines: [dueBy !== null ? `${who ? who + " has" : "There are"} no open bills due on or before ${byLabel}.` : "I couldn't find any bills matching that."], links: AP_LINK, source: "Accounts Payable sheet", asOf: asOfText(s), data: { count: 0, totalRemaining: 0 } };
  if (inv && hits.length <= 3) {
    const lines: string[] = hits.length === 1
      ? billDetailLines(hits[0], today)
      : [`I found **${plural(hits.length, "bill")}** with invoice number ${a.invoiceNo}:`, "", ...hits.flatMap(b => [...billDetailLines(b, today), ""])];
    return { tool: "ap_search", title: "Bill details", lines, links: AP_LINK, source: "Accounts Payable sheet", asOf: asOfText(s),
      data: { count: hits.length, bills: hits.map(b => ({ ...billFact(b, today), invoiceDate: b.invoiceDate || "", paidDate: b.paidDate || b.paymentDate || "", paidVia: b.paidVia || "", method: b.method, category: b.category || "", description: b.description || "", remarks: b.remarks || "", inQBO: b.inQBO ?? null, hasFile: !!b.driveViewUrl, originalAmount: b.originalAmount ?? b.amount, partialPaid: b.partialPaid || 0 })) } };
  }
  const total = hits.reduce((t, b) => t + billRemaining(b), 0);
  const subject = who ? `**${who}**` : "Those bills";
  const isPaidSearch = st === "paid";
  const headline = isPaidSearch
    ? `${subject} ${who ? "has been paid" : "were paid"} **${money(hits.reduce((t, b) => t + (b.originalAmount ?? b.amount), 0))}** across **${plural(hits.length, "bill")}**.`
    : dueBy !== null
    ? `${subject} ${who ? "has" : "total"} **${money(total)} outstanding** across **${plural(hits.length, "open bill")}** due on or before ${byLabel} (overdue ones included).`
    : openOnly
      ? `${subject} ${who ? "has" : "total"} **${money(total)} still to pay** across **${plural(hits.length, "open bill")}**.`
      : `I found **${plural(hits.length, "bill")}**${who ? ` for ${who}` : ""} totaling **${money(total)}**${st ? ` (${st})` : ""}.`;
  const r = billAnswerLines(headline, hits, today, { list: !!a.list, limit: Number(a.limit) || 25, insight: { age: openOnly, busiest: false }, followUp: "Want me to list them all?", recent: isPaidSearch });
  let lastPayment: { date: string; total: number; bills: number } | null = null;
  if (v && st !== "paid") {
    const paidAll = s.apBills.filter(b => b.status === "paid" && lc(b.vendor).includes(v) && (b.paidDate || b.paymentDate))
      .sort((x, y) => String(y.paidDate || y.paymentDate).localeCompare(String(x.paidDate || x.paymentDate)));
    if (paidAll.length) {
      const day = String(paidAll[0].paidDate || paidAll[0].paymentDate);
      const same = paidAll.filter(b => String(b.paidDate || b.paymentDate) === day);
      lastPayment = { date: day, total: same.reduce((t, b) => t + (b.originalAmount ?? b.amount), 0), bills: same.length };
      r.lines.splice(1, 0, `Last payment to ${who || "them"}: ${money(lastPayment.total)} on ${day}${same.length > 1 ? ` (${plural(same.length, "bill")})` : ""}.`);
    }
  }
  return { tool: "ap_search", title: "Bill search", lines: r.lines, links: AP_LINK, source: "Accounts Payable sheet", asOf: asOfText(s), data: billFactsBlock(r.sm, r.shown, today) };
}

function apTopVendors(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const today = startOfDay(s.now);
  const n = Math.min(Math.max(Number(a.n) || 5, 1), 15);
  const open = s.apBills.filter(b => isOpenBill(b) && entityMatches(b, a.entity));
  const by: Record<string, { vendor: string; total: number; count: number; overdue: number }> = {};
  open.forEach(b => {
    const k = lc(b.vendor); if (!k) return;
    const x = (by[k] ||= { vendor: String(b.vendor).trim(), total: 0, count: 0, overdue: 0 });
    const r = billRemaining(b); x.total += r; x.count++;
    const d = dueDate(b); if (d && d.getTime() < today.getTime()) x.overdue += r;
  });
  const list = Object.values(by).sort((x, y) => y.total - x.total);
  const grand = list.reduce((t, x) => t + x.total, 0);
  const scope = a.entity ? ` for ${a.entity}` : "";
  const lines: string[] = [];
  if (list.length === 0) lines.push(`There are no open bills${scope}.`);
  else {
    const top = list[0];
    lines.push(`You owe the most to **${top.vendor}**: **${money(top.total)}** across ${plural(top.count, "bill")}${top.overdue ? `, ${money(top.overdue)} of it overdue` : ""}. That's ${pct(top.total, grand)}% of everything open${scope} (${money(grand)}).`);
    const shown = list.slice(0, n);
    const topShare = shown.reduce((t, x) => t + x.total, 0);
    lines.push(`The top ${shown.length} vendors account for ${pct(topShare, grand)}% of the total.`, "", `**Top ${shown.length} by amount owed:**`);
    shown.forEach((x, i) => lines.push(`${i + 1}. **${x.vendor}**: ${money(x.total)} (${plural(x.count, "bill")}${x.overdue ? `, ${money(x.overdue)} overdue` : ""})`));
  }
  return { tool: "ap_top_vendors", title: "Top vendors owed", lines, links: AP_LINK, source: "Accounts Payable sheet", asOf: asOfText(s),
    data: { openTotal: grand, vendorCount: list.length, top: list.slice(0, n) } };
}

function apSummary(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const open = s.apBills.filter(b => isOpenBill(b) && entityMatches(b, a.entity));
  const hold = open.filter(b => b.status === "hold");
  const byEntity: Record<string, { count: number; total: number }> = {};
  open.forEach(b => { const k = entityLabel(b); (byEntity[k] ||= { count: 0, total: 0 }); byEntity[k].count++; byEntity[k].total += billRemaining(b); });
  const total = open.reduce((t, b) => t + billRemaining(b), 0);
  const lines = [`**${open.length} open (not yet paid) bills** totaling **${money(total)}**, including ${hold.length} on hold.`,
    ...Object.entries(byEntity).sort((x, y) => y[1].total - x[1].total).map(([k, v]) => `• ${k}: ${v.count} bills, ${money(v.total)}`)];
  return { tool: "ap_summary", title: "AP summary", lines, links: AP_LINK, source: "Accounts Payable sheet", asOf: asOfText(s),
    data: { unpaidCount: open.length, unpaidTotal: total, onHold: hold.length, byEntity } };
}

// ── analysis tools: flexible, deterministic number-crunching so Calc can reason about questions no fixed lookup covers ──
const mondayOf = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

/** Group / filter / rank bills any way the question needs (by vendor, entity, month, week, age…) — all math done here, not by the AI. */
function apAnalyze(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const today = startOfDay(s.now);
  const status = lc(a.status) || "open";
  let bills = s.apBills.filter(b => entityMatches(b, a.entity));
  if (status === "open") bills = bills.filter(isOpenBill);
  else if (status === "paid") bills = bills.filter(b => lc(b.status) === "paid");
  else if (status === "unpaid" || status === "hold") bills = bills.filter(b => lc(b.status) === status);
  if (a.vendor) { const v = lc(a.vendor); bills = bills.filter(b => lc(b.vendor).includes(v)); }
  if (a.category) { const c = lc(a.category); bills = bills.filter(b => lc((b as any).category).includes(c)); }
  const field = lc(a.dateField) === "invoice" ? "invoice" : lc(a.dateField) === "paid" ? "paid" : "due";
  const dateOf = (b: APBill): Date | null => {
    const raw = field === "invoice" ? b.invoiceDate : field === "paid" ? (b.paidDate || b.paymentDate) : b.dueDate;
    const d = parseDueDateToDate(raw as any); return d ? startOfDay(d) : null;
  };
  let from = a.from ? new Date(String(a.from) + "T00:00:00") : null, to = a.to ? new Date(String(a.to) + "T00:00:00") : null;
  if (a.month && /^\d{4}-\d{2}$/.test(String(a.month))) { const [y, m] = String(a.month).split("-").map(Number); from = new Date(y, m - 1, 1); to = new Date(y, m, 0); }
  if (from && isNaN(from.getTime())) from = null;
  if (to && isNaN(to.getTime())) to = null;
  if (from) bills = bills.filter(b => { const d = dateOf(b); return !!d && d >= from!; });
  if (to) bills = bills.filter(b => { const d = dateOf(b); return !!d && d <= to!; });
  if (a.overdueOnly) bills = bills.filter(b => { const d = dueDate(b); return !!d && d < today && isOpenBill(b); });
  const val = (b: APBill) => (isOpenBill(b) ? billRemaining(b) : Number(b.originalAmount ?? b.amount) || 0);
  if (typeof a.minAmount === "number") bills = bills.filter(b => val(b) >= a.minAmount);
  if (typeof a.maxAmount === "number") bills = bills.filter(b => val(b) <= a.maxAmount);

  const groupBy = lc(a.groupBy) || "";
  const keyOf = (b: APBill): string => {
    switch (groupBy) {
      case "vendor": return b.vendor || "(no vendor)";
      case "entity": return entityLabel(b) || "(none)";
      case "company": return b.company || b.entity || "(none)";
      case "category": return String((b as any).category || "(none)");
      case "status": return String(b.status || "(none)");
      case "age": return ageBucket(b, today);
      case "month": { const d = dateOf(b); return d ? iso(d).slice(0, 7) : "(no date)"; }
      case "week": { const d = dateOf(b); return d ? "week of " + iso(mondayOf(d)) : "(no date)"; }
      default: return "all";
    }
  };
  const groups: Record<string, { count: number; total: number; max: number }> = {};
  let total = 0;
  bills.forEach(b => { const v = val(b); total += v; const k = keyOf(b); const g = (groups[k] ||= { count: 0, total: 0, max: 0 }); g.count++; g.total += v; g.max = Math.max(g.max, v); });
  const timeGroup = groupBy === "month" || groupBy === "week" || groupBy === "age";
  let rows = Object.entries(groups).map(([key, g]) => ({ key, count: g.count, total: Math.round(g.total * 100) / 100, average: Math.round((g.total / g.count) * 100) / 100, largest: g.max, sharePct: total > 0 ? Math.round((g.total / total) * 1000) / 10 : 0 }));
  rows = timeGroup && groupBy !== "age" ? rows.sort((x, y) => x.key.localeCompare(y.key)) : groupBy === "age" ? rows.sort((x, y) => AGE_ORDER.indexOf(x.key) - AGE_ORDER.indexOf(y.key)) : rows.sort((x, y) => (lc(a.sort) === "asc" ? x.total - y.total : y.total - x.total));
  const top = Math.max(1, Math.min(Number(a.top) || 12, 30));
  const shown = rows.slice(0, top), rest = rows.slice(top);
  const largest = [...bills].sort((x, y) => val(y) - val(x)).slice(0, 5).map(b => ({ vendor: b.vendor, entity: entityLabel(b), dueDate: b.dueDate, amount: Math.round(val(b) * 100) / 100, status: b.status }));
  const dates = bills.map(dateOf).filter(Boolean) as Date[];
  const scope = [status === "all" ? "all bills" : `${status} bills`, a.entity ? `entity ${a.entity}` : "", a.vendor ? `vendor "${a.vendor}"` : "", a.month ? `${field} month ${a.month}` : (from || to) ? `${field} date ${from ? iso(from) : "…"} to ${to ? iso(to) : "…"}` : "", a.overdueOnly ? "overdue only" : ""].filter(Boolean).join(", ");
  const lines = bills.length === 0 ? [`No bills matched (${scope}).`]
    : [`**${plural(bills.length, "bill")}** totaling **${money(total)}** (${scope}).`,
       ...(groupBy ? shown.map(r => `• ${r.key}: ${plural(r.count, "bill")}, ${money(r.total)} (${r.sharePct}%)`) : [])];
  return { tool: "ap_analyze", title: "Bill analysis", lines, links: AP_LINK, source: "Accounts Payable sheet", asOf: asOfText(s),
    data: { scope, count: bills.length, total: Math.round(total * 100) / 100, average: bills.length ? Math.round((total / bills.length) * 100) / 100 : 0,
      groupedBy: groupBy || "none", rows: shown, otherGroups: rest.length ? { count: rest.length, total: Math.round(rest.reduce((t, r) => t + r.total, 0) * 100) / 100 } : null,
      largestBills: largest, earliestDate: dates.length ? iso(new Date(Math.min(...dates.map(d => d.getTime())))) : null, latestDate: dates.length ? iso(new Date(Math.max(...dates.map(d => d.getTime())))) : null,
      dateField: field, note: "Open bills use the remaining balance (partial payments subtracted); paid bills use the original amount." } };
}

/** Cash on hand vs what's overdue and coming due — the "can we cover it?" check, computed here. */
function cashCoverage(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const today = startOfDay(s.now);
  const days = Math.max(1, Math.min(Number(a.days) || 7, 90));
  const horizon = new Date(today.getTime() + days * DAY);
  const accts = s.bankAccounts.filter(b => b.status === "Active" && entityMatches(b, a.entity));
  const cash = accts.reduce((t, b) => t + (Number(b.balance) || 0), 0);
  const cashByEntity: Record<string, number> = {};
  accts.forEach(b => { cashByEntity[b.entity] = (cashByEntity[b.entity] || 0) + (Number(b.balance) || 0); });
  const open = s.apBills.filter(b => isOpenBill(b) && entityMatches(b, a.entity));
  let overdue = 0, overdueN = 0, soon = 0, soonN = 0, later = 0;
  const need: Record<string, { overdue: number; dueSoon: number }> = {};
  open.forEach(b => {
    const d = dueDate(b), r = billRemaining(b), k = String(b.entity || "Other");
    (need[k] ||= { overdue: 0, dueSoon: 0 });
    if (d && d < today) { overdue += r; overdueN++; need[k].overdue += r; }
    else if (d && d <= horizon) { soon += r; soonN++; need[k].dueSoon += r; }
    else later += r;
  });
  const obligations = overdue + soon;
  const gap = Math.round((cash - obligations) * 100) / 100;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const lines = accts.length === 0 ? ["I couldn't find active bank accounts to compare against."]
    : [`Cash on hand is **${money(cash)}**. Overdue bills are **${money(overdue)}** and bills due in the next ${days} days are **${money(soon)}**, so obligations total **${money(obligations)}**.`,
       gap >= 0 ? `That leaves **${money(gap)}** after covering everything.` : `That's a **${money(-gap)} shortfall**.`];
  return { tool: "cash_coverage", title: "Cash vs bills", lines, links: [{ label: "Open Bank Balances", page: "banks" }, ...AP_LINK], source: "Bank Balances and Accounts Payable sheets", asOf: asOfText(s),
    data: { windowDays: days, cash: r2(cash), overdue: { count: overdueN, total: r2(overdue) }, dueWithinWindow: { count: soonN, total: r2(soon) }, obligations: r2(obligations),
      surplusOrShortfall: gap, coversEverything: gap >= 0, openBillsDueLater: r2(later),
      cashByEntity: Object.fromEntries(Object.entries(cashByEntity).map(([k, v]) => [k, r2(v)])),
      billsByEntity: Object.fromEntries(Object.entries(need).map(([k, v]) => [k, { overdue: r2(v.overdue), dueSoon: r2(v.dueSoon) }])),
      caveat: "Cash and bills are grouped by their own entity names, which don't always line up one-to-one (e.g. TI has sub-companies); the overall figures are the reliable ones. Balances may be a day old and incoming receipts are not included." } };
}

/**
 * "What bills were added today / this week?" — bills have no created-date column, so this uses two honest sources:
 *  1) the portal's Activity Log (every bill added in the portal is logged with a time, a user, vendor and amount),
 *     matched back to the live bill so it can show due date, invoice # and status; entries deleted afterwards are dropped;
 *  2) the newest rows at the bottom of each bill sheet (no timestamp) — catches bills typed straight into the sheet
 *     or added by the email automation, which the log can't see.
 */
async function apRecentAdded(s: CalcSnapshot, a: ToolArgs): Promise<ToolResult> {
  const today = startOfDay(s.now);
  const days = Math.max(1, Math.min(Number(a.days) || 1, 60));
  let from = new Date(today.getTime() - (days - 1) * DAY);
  let to: Date | null = null;
  if (a.from) { const f = new Date(String(a.from) + "T00:00:00"); if (!isNaN(f.getTime())) from = f; }
  if (a.to) { const t = new Date(String(a.to) + "T23:59:59"); if (!isNaN(t.getTime())) to = t; }
  const inWindow = (d: Date | null) => !!d && d >= from && (!to || d <= to);
  const parseTs = (v: string): Date | null => { const d = new Date(String(v || "")); return isNaN(d.getTime()) ? null : d; };
  const want = a.entity ? lc(a.entity) : "";
  const vwant = a.vendor ? lc(a.vendor) : "";

  const rows = s.getActivity ? await s.getActivity() : null;
  const amt = (b: APBill) => Number(b.originalAmount ?? b.amount) || 0;
  type Add = { when: string; by: string; vendor: string; entity: string; amount: number; matched?: { invoiceNo: string; dueDate: string; status: string; remaining: number }; _t: number };
  const adds: Add[] = [];
  const multi: Array<{ when: string; by: string; text: string }> = [];
  let deletedAfter = 0;
  if (rows) {
    const used = new Set<APBill>();
    rows.forEach(r => {
      const [ts, who, action, details] = [r[0], r[1], String(r[2] || ""), String(r[3] || "")];
      const t = parseTs(ts);
      if (!inWindow(t)) return;
      if (action === "Added Bill") {
        const m = details.match(/^(.*) \((.*)\) - \$([0-9,.]+)/);
        if (!m) return;
        const entity = m[2], vendor = m[1].trim();
        if (want && !lc(entity).includes(want)) return;
        if (vwant && !lc(vendor).includes(vwant)) return;
        const amount = Number(m[3].replace(/,/g, "")) || 0;
        adds.push({ when: ts, by: who, vendor, entity, amount, _t: t!.getTime() });
      } else if (action === "Added Bills (multi-scan)") {
        multi.push({ when: ts, by: who, text: details });
      }
    });
    // drop adds that were deleted afterwards (one delete cancels one earlier add of the same bill)
    rows.forEach(r => {
      if (String(r[2]) !== "Deleted Bill") return;
      const t = parseTs(r[0]); if (!inWindow(t)) return;
      const m = String(r[3] || "").match(/^(.*) \((.*)\) — \$([0-9,.]+)/); if (!m) return;
      const amount = Number(m[3].replace(/,/g, "")) || 0;
      const i = adds.findIndex(x => lc(x.vendor) === lc(m[1]) && lc(x.entity) === lc(m[2]) && Math.abs(x.amount - amount) < 0.011 && x._t < t!.getTime());
      if (i >= 0) { adds.splice(i, 1); deletedAfter++; }
    });
    adds.forEach(x => {
      const b = s.apBills.find(bb => !used.has(bb) && lc(bb.vendor) === lc(x.vendor) && lc(bb.entity) === lc(x.entity) && Math.abs(amt(bb) - x.amount) < 0.011);
      if (b) { used.add(b); x.matched = { invoiceNo: b.invoiceNo || "", dueDate: b.dueDate || "", status: String(b.status || ""), remaining: isOpenBill(b) ? billRemaining(b) : 0 }; }
    });
  }
  adds.sort((x, y) => y._t - x._t);

  // newest rows in each bill sheet (position only — no timestamp)
  const latestInSheet: Record<string, Array<{ vendor: string; amount: number; dueDate: string; invoiceNo: string; status: string }>> = {};
  const byEnt: Record<string, APBill[]> = {};
  s.apBills.filter(b => b.row && (!want || lc(entityLabel(b)).includes(want)) && (!vwant || lc(b.vendor).includes(vwant))).forEach(b => { (byEnt[b.entity] ||= []).push(b); });
  Object.entries(byEnt).forEach(([e, list]) => {
    latestInSheet[e] = list.sort((x, y) => (y.row || 0) - (x.row || 0)).slice(0, 6)
      .map(b => ({ vendor: b.vendor, amount: Math.round(amt(b) * 100) / 100, dueDate: b.dueDate || "", invoiceNo: b.invoiceNo || "", status: String(b.status || "") }));
  });

  const span = days === 1 && !a.from ? "today" : `since ${fmtDay(from)}`;
  const lines: string[] = [];
  if (!rows) lines.push("I couldn't read the portal's Activity Log (sign in with Google), so I can only show the newest rows in each bill sheet.");
  else if (adds.length === 0 && multi.length === 0) lines.push(`No bills were added through the portal ${span}.`);
  else {
    lines.push(`**${plural(adds.length, "bill")}** added through the portal ${span}${deletedAfter ? ` (plus ${plural(deletedAfter, "other")} added and then deleted)` : ""}.`);
    adds.slice(0, 15).forEach(x => lines.push(`• ${x.vendor} (${x.entity}) — ${money(x.amount)}${x.matched ? `, due ${x.matched.dueDate}${x.matched.invoiceNo ? `, inv ${x.matched.invoiceNo}` : ""}, ${x.matched.status}` : " (no longer in the AP list)"} · added ${x.when.split(", ")[1] || x.when} by ${x.by}`));
    multi.forEach(m => lines.push(`• Multi-scan at ${m.when.split(", ")[1] || m.when}: ${m.text}`));
  }
  return { tool: "ap_recent_added", title: "Recently added bills", lines, links: AP_LINK, source: rows ? "Portal Activity Log + Accounts Payable sheet" : "Accounts Payable sheet", asOf: asOfText(s),
    data: { window: { from: iso(from), to: to ? iso(to) : iso(today) }, loggedAdds: adds.slice(0, 40).map(x => ({ when: x.when, by: x.by, vendor: x.vendor, entity: x.entity, amount: x.amount, current: x.matched || null })),
      multiScan: multi.slice(0, 10), addedThenDeleted: deletedAfter, activityLogReadable: !!rows, latestRowsInEachSheet: latestInSheet,
      note: "Bills have no created-date column. loggedAdds are bills added through the portal (exact time and user). Bills typed directly into the sheet or added by the email automation are NOT in the log; latestRowsInEachSheet shows the newest sheet rows (position only, no timestamp) so those can be spotted." } };
}

/** Bank-statement due dates (Cut-Off Dates from the reference table) and the rules for when entries are created. */
function statementsDue(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const today = manilaToday();
  const days = Math.max(1, Math.min(Number(a.days) || 14, 60));
  const end = new Date(today.getTime() + days * DAY);
  const tpl = s.statementTemplates || [];
  const items: Array<{ entity: string; bank: string; due: string; entryOpens: string; entryCreated: boolean; downloaded: boolean | null }> = [];
  tpl.forEach(t => {
    const day = parseCutOffDay(t.cutOffDate); if (day === null) return;
    [cutOffInMonth(day, today.getFullYear(), today.getMonth()), cutOffInMonth(day, today.getFullYear(), today.getMonth() + 1)].forEach(cut => {
      if (cut < today || cut > end) return;
      const f = fmtStmtDate(cut);
      const ex = s.bankStatements.find(x => x.bankName === t.bank && x.entity === t.entity && x.cutOffDate === f);
      items.push({ entity: t.entity, bank: t.bank, due: f, entryOpens: fmtStmtDate(new Date(cut.getTime() - STATEMENT_GENERATE_DAYS_BEFORE * DAY)), entryCreated: !!ex, downloaded: ex ? !!ex.downloaded : null });
    });
  });
  items.sort((x, y) => x.due.localeCompare(y.due) || x.bank.localeCompare(y.bank));
  const nw = dueNextWeek(tpl, today);
  const noCutOff = tpl.filter(t => parseCutOffDay(t.cutOffDate) === null).map(t => t.bank);
  const lines = items.length === 0 ? [`No bank statement due dates fall in the next ${days} days.`]
    : [`**${plural(items.length, "statement")}** come due in the next ${days} days.`, ...items.slice(0, 12).map(i => `• ${i.bank} (${i.entity}): due ${i.due}, entry opens ${i.entryOpens}${i.entryCreated ? "" : " (not created yet)"}`)];
  return { tool: "statements_due", title: "Bank statement due dates", lines, links: [{ label: "Open Bank Statements", page: "statements" }], source: "Bank Statements reference table (Cut-Off Dates)", asOf: asOfText(s),
    data: { windowDays: days, today: fmtStmtDate(today), upcoming: items.slice(0, 40), dueNextWeek: { from: nw.start, to: nw.end, items: nw.items }, banksWithNoCutOffDate: noCutOff,
      rules: "Due date = the bank's Cut-Off Date in the reference table. An entry is created 2 days before its due date (Philippine time) the first time anyone opens the portal on or after that day; a due date already reached this month with no entry is created right away. When a due date changes, not-downloaded entries for the old date are hidden (marked in the sheet, never deleted). Not-downloaded entries more than 2 days from their due date are hidden until the 2-day window opens. Downloaded entries are never touched. The first portal load each Saturday re-checks the sheet for the week ahead." } };
}

const staleDays = (asOf: string, now: Date): number | null => {
  const d = new Date(asOf);
  if (isNaN(d.getTime())) return null;
  return Math.floor((startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY);
};

function bankBalances(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const bk = lc(a.bank);
  const accts = s.bankAccounts.filter(b => b.status === "Active" && entityMatches(b, a.entity) && (!bk || lc(b.bank).includes(bk)));
  const byEntity: Record<string, number> = {};
  accts.forEach(b => { byEntity[b.entity] = (byEntity[b.entity] || 0) + (Number(b.balance) || 0); });
  const grand = accts.reduce((t, b) => t + (Number(b.balance) || 0), 0);
  const low = accts.filter(b => (Number(b.balance) || 0) < 500);
  const stale = accts.filter(b => { const n = staleDays(b.asOf, s.now); return n !== null && n >= 2; });
  const acctName = (b: BankAccount) => `${b.bank}${b.acct && !lc(b.bank).includes(lc(b.acct)) ? " " + b.acct : ""}${lc(b.bank).startsWith(lc(b.entity)) ? "" : " (" + b.entity + ")"}`;
  const acctLine = (b: BankAccount) => `${acctName(b)}: ${money(b.balance)}${b.yesterday !== undefined ? `, yesterday ${money(b.yesterday)}` : ""}, as of ${b.asOf || "unknown"}`;
  const lines: string[] = [];
  if (accts.length === 0) lines.push("I couldn't find any matching active bank accounts.");
  else {
    const scope = a.entity ? ` for ${a.entity}` : a.bank ? ` at ${a.bank}` : "";
    lines.push(`You have **${money(grand)}** in cash${scope} across ${plural(accts.length, "active account")}.`);
    const withY = accts.filter(b => b.yesterday !== undefined && b.yesterday !== null);
    if (withY.length === accts.length) {
      const yTot = accts.reduce((t, b) => t + (Number(b.yesterday) || 0), 0);
      const delta = Math.round((grand - yTot) * 100) / 100;
      if (delta !== 0) lines.push(`That's ${delta > 0 ? "up" : "down"} ${money(Math.abs(delta))} from yesterday's balances (${money(yTot)}).`);
    }
    const ents = Object.entries(byEntity).sort((x, y) => y[1] - x[1]);
    if (ents.length > 1) lines.push("By entity: " + ents.map(([k, v]) => `${k} ${money(v)}`).join(" · ") + ".");
    if (low.length) lines.push("", `**Heads up, ${plural(low.length, "account")} under $500:**`, ...low.map(b => "• " + acctLine(b)));
    if (stale.length) lines.push("", `**${plural(stale.length, "balance")} not updated in 2+ days:**`, ...stale.map(b => "• " + acctLine(b)));
    if (a.list) lines.push("", "**Every account:**", ...accts.map(b => "• " + acctLine(b)));
    else lines.push("", "Want the account-by-account list?");
  }
  return { tool: "bank_balances", title: "Bank balances", lines, links: [{ label: "Open Bank Balances", page: "banks" }], source: "Bank Balances sheet", asOf: asOfText(s),
    data: { grandTotal: grand, byEntity, lowUnder500: low.map(b => b.bank), staleTwoDaysPlus: stale.map(b => b.bank),
      accounts: accts.slice(0, 30).map(b => ({ entity: b.entity, bank: b.bank, type: b.type, acct: b.acct, balance: b.balance, yesterday: b.yesterday ?? null, asOf: b.asOf })) } };
}

function statementsPending(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const today = startOfDay(s.now);
  const tracked = s.bankStatements.filter(x => x.cutOffDate);
  const toDate = (x: BankStatement) => new Date(x.cutOffDate + "T00:00:00");
  const pending = tracked.filter(x => x.downloaded === false && !isNaN(toDate(x).getTime()) && toDate(x) <= today)
    .sort((x, y) => toDate(x).getTime() - toDate(y).getTime());
  const soon = tracked.filter(x => x.downloaded === false && !isNaN(toDate(x).getTime()) && toDate(x) > today && toDate(x).getTime() <= today.getTime() + 7 * DAY);
  const line = (x: BankStatement) => `• **${x.bankName}** (${x.entity}): ${x.period || x.occurrence || ""}, cut-off ${x.cutOffDate}`;
  const lines: string[] = [];
  if (pending.length === 0) lines.push("You're all caught up: no statements are waiting to be downloaded." + (soon.length ? ` ${plural(soon.length, "more")} will be ready within a week.` : ""));
  else {
    const byEnt: Record<string, number> = {};
    pending.forEach(x => { byEnt[x.entity] = (byEnt[x.entity] || 0) + 1; });
    const oldest = pending[0];
    lines.push(`**${plural(pending.length, "statement")}** ${pending.length === 1 ? "is" : "are"} ready to download (the cut-off has passed and ${pending.length === 1 ? "it hasn't" : "they haven't"} been downloaded yet).`);
    lines.push(`The oldest is ${oldest.bankName} (${oldest.entity}), cut-off ${oldest.cutOffDate}.`);
    const ents = Object.entries(byEnt).sort((x, y) => y[1] - x[1]);
    if (ents.length > 1) lines.push("By entity: " + ents.map(([k, v]) => `${k} ${v}`).join(" · ") + ".");
    if (soon.length) lines.push(`${plural(soon.length, "more")} will be ready within the next 7 days.`);
    const k = a.list ? Math.min(pending.length, 30) : 5;
    lines.push("", a.list ? "**All of them, oldest first:**" : `**The ${k} oldest:**`, ...pending.slice(0, k).map(line));
    if (pending.length > k) lines.push(`…plus ${pending.length - k} more. Ask me to "list them all" for the rest.`);
  }
  return { tool: "statements_pending", title: "Bank statements to download", lines, links: [{ label: "Open Bank Statements", page: "statements" }], source: "Bank Statements tracker sheet", asOf: asOfText(s),
    data: { pendingCount: pending.length, upcomingSevenDays: soon.length, oldest: pending[0] ? { bank: pending[0].bankName, entity: pending[0].entity, cutOff: pending[0].cutOffDate } : null,
      pending: pending.slice(0, 25).map(x => ({ bank: x.bankName, entity: x.entity, period: x.period, cutOff: x.cutOffDate })) } };
}

function calendar(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const today = startOfDay(s.now);
  const from = a.from ? new Date(a.from + "T00:00:00") : today;
  const days = Math.min(Math.max(Number(a.days) || 7, 1), 60);
  const to = a.to ? new Date(a.to + "T00:00:00") : new Date(from.getTime() + (days - 1) * DAY);
  const who = lc(a.assignee), ent = lc(a.entity);
  const list = s.events
    .filter(e => e.date >= iso(from) && e.date <= iso(to) && (!who || lc(e.assignee).includes(who)) && (!ent || lc(e.entity).includes(ent)) && (a.includeDone || !e.done))
    .sort((x, y) => (x.date + (x.time || "")).localeCompare(y.date + (y.time || "")));
  const clock = (t?: string) => {
    const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
    if (!m) return t || "";
    let h = Number(m[1]); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return `${h}:${m[2]} ${ap}`;
  };
  const todayIso = iso(today);
  const todays = list.filter(e => e.date === todayIso);
  const byDay: Record<string, CalcEvent[]> = {};
  list.forEach(e => { (byDay[e.date] ||= []).push(e); });
  const dayKeys = Object.keys(byDay).sort();
  const lines: string[] = [];
  if (list.length === 0) lines.push(`Nothing on the calendar from ${fmtDay(from)} to ${fmtDay(to)}.`);
  else {
    const span = iso(from) === iso(to) ? fmtDay(from) : `${fmtDay(from)} to ${fmtDay(to)}`;
    lines.push(`You have **${plural(list.length, "event")}** on the calendar (${span})` + (iso(from) <= todayIso && todayIso <= iso(to) ? `, ${todays.length ? todays.length + " of them today" : "none of them today"}.` : "."));
    const busiest = dayKeys.map(k => [k, byDay[k].length] as [string, number]).sort((x, y) => y[1] - x[1])[0];
    if (dayKeys.length > 1 && busiest[1] > 2) lines.push(`${fmtDay(new Date(busiest[0] + "T00:00:00"))} is the busiest day with ${busiest[1]}.`);
    lines.push("");
    const maxDays = a.list ? 14 : 7;
    dayKeys.slice(0, maxDays).forEach(k => {
      const evs = byDay[k];
      const shown = evs.slice(0, a.list ? 12 : 3).map(e => `${e.time ? clock(e.time) + " " : ""}${e.title}${e.assignee ? " (" + e.assignee + ")" : ""}${e.done ? " ✓" : ""}`);
      const more = evs.length > shown.length ? `; +${evs.length - shown.length} more` : "";
      lines.push(`• **${fmtDay(new Date(k + "T00:00:00"))}:** ${shown.join("; ")}${more}`);
    });
    if (dayKeys.length > maxDays) lines.push(`…and ${dayKeys.length - maxDays} more days.`);
    if (!a.list && list.length > 3) lines.push("", "Want every event listed?");
  }
  return { tool: "calendar", title: "Calendar", lines, links: [{ label: "Open Calendar", page: "calendar" }], source: "Calendar sheet and Google Calendar", asOf: asOfText(s),
    data: { from: iso(from), to: iso(to), count: list.length, events: list.slice(0, 30).map(e => ({ date: e.date, time: e.time || "", title: e.title, assignee: e.assignee || "", entity: e.entity || "", done: !!e.done })) } };
}

function notesOpen(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const q = lc(a.query), cat = lc(a.category), mem = lc(a.member);
  const open = s.quickNotes.filter(n => (!n.itemType || n.itemType === "note") && (!n.status || n.status === "open") &&
    (!cat || lc(n.category) === cat) && (!mem || lc(n.assignedMember).includes(mem)) && (!q || lc(n.title + " " + n.content).includes(q)));
  const lines = open.length === 0 ? ["No open notes found."] :
    [`**${open.length} open note${open.length === 1 ? "" : "s"}:**`, ...open.slice(0, 15).map(n => `• ${n.title || "(untitled)"}${n.category ? " — " + n.category : ""}${n.assignedMember ? " · " + n.assignedMember : ""}`)];
  return { tool: "notes_open", title: "Open notes", lines, links: [{ label: "Open Notes", page: "notes" }], source: "Quick Notes sheet", asOf: asOfText(s),
    data: { count: open.length, notes: open.slice(0, 20).map(n => ({ title: n.title, category: n.category, member: n.assignedMember || "", created: n.createdAt, preview: String(n.content || "").slice(0, 160) })) } };
}

function platforms(s: CalcSnapshot, a: ToolArgs): ToolResult {
  const q = lc(a.query);
  const all = s.externalLinks.filter(l => l.category === "platforms");
  const hits = (q ? all.filter(l => lc(l.name + " " + (l.description || "") + " " + l.url).includes(q)) : all);
  const lines = hits.length === 0
    ? [q ? `I couldn't find a platform matching "${a.query}" in the Platforms Directory.` : "The Platforms Directory is empty."]
    : [`**${hits.length} platform${hits.length === 1 ? "" : "s"}${q ? ` matching "${a.query}"` : ""}:**`, ...hits.slice(0, 25).map(l => `• [${l.name}](${l.url})${l.description ? " — " + l.description : ""}`)];
  return { tool: "platforms", title: "Platforms Directory", lines, links: [{ label: "Open Platforms", page: "workspace-platforms" }], source: "Platforms Directory (config sheet)", asOf: asOfText(s),
    data: { count: hits.length, platforms: hits.slice(0, 30).map(l => ({ name: l.name, url: l.url, description: l.description || "" })) } };
}

function helpSearch(_s: CalcSnapshot, a: ToolArgs): ToolResult {
  const query = String(a.query || "");
  const docs: HelpDoc[] = [
    ...HOWTOS.map((h: any) => ({ kind: "How-to", title: h.title, body: (h.steps || []).join(" ") })),
    ...FAQ.map((f: any) => ({ kind: "FAQ", title: f.q, body: f.a })),
    ...BREAKAGE.map((b: any) => ({ kind: "Fix", title: b.symptom, body: `${b.cause}. ${b.fix}` })),
  ];
  // Matching by stem/synonym, and Calc gets the sentences that match the question (not just the start of each
  // entry): long entries buried the answer past the old 900-character cut, so Calc said it couldn't find it.
  const scored = rankHelpDocs(docs, query, 3);
  const lines = scored.length === 0
    ? ["I couldn't find that in Help & Reference."]
    : scored.map(x => `**${x.d.kind}: ${x.d.title}**\n${bestExcerpt(x.d.body, query, 520)}`);
  return { tool: "help_search", title: "Help & Reference", lines, links: [{ label: "Open Help & Reference", page: "help" }], source: "Help & Reference", asOf: "",
    data: { matches: scored.map(x => ({ kind: x.d.kind, title: x.d.title, text: bestExcerpt(x.d.body, query, 1600) })) } };
}

// ── 4YR payroll: same rules as the 4YR Payroll page (sum of each row's computed hours and total; ──
// ── negative totals / deduction-style names are deductions; reimbursements etc. are non-payroll) ──
const PAY_DED = /deduct|loan|rent|penalty|withhold/i;
const PAY_NONPAY = /reimburse|reimbursement|adjustment|allowance|bonus|incentive|extra|misc/i;
const payKind = (r: RawRow): "deduction" | "nonpayroll" | "payroll" =>
  (r.total < 0 || PAY_DED.test(r.job) || PAY_DED.test(r.subCat)) ? "deduction" : PAY_NONPAY.test(r.subCat) ? "nonpayroll" : "payroll";
const mdy = (v: string): Date | null => { const m = String(v || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])) : null; };
const hrs = (n: number) => String(Math.round(n * 100) / 100);

async function payrollSummary(s: CalcSnapshot, a: ToolArgs): Promise<ToolResult> {
  const src = "4YR Payroll sheet";
  const data = s.getPayroll ? await s.getPayroll() : null;
  if (!data || data.rows.length === 0)
    return { tool: "payroll_summary", title: "4YR payroll", source: "", asOf: "",
      lines: ["I can't read the 4YR payroll sheet right now. Make sure you're signed in with Google (and have access to that sheet), then ask me again."],
      data: { dataNotLoaded: true, missing: "the 4YR payroll sheet", note: "The payroll data did not load. Do NOT say there is no payroll; say it isn't available and how to fix it." } };
  const today = startOfDay(s.now);
  const weeks = [...data.weeks].filter(w => mdy(w.startDate)).sort((x, y) => mdy(x.startDate)!.getTime() - mdy(y.startDate)!.getTime());
  const cur = weeks.find(w => mdy(w.startDate)!.getTime() <= today.getTime() && today.getTime() <= (mdy(w.endDate)?.getTime() ?? 0) + DAY - 1)
    || [...weeks].filter(w => (mdy(w.endDate)?.getTime() ?? 0) < today.getTime()).pop();
  const idx = cur ? weeks.indexOf(cur) : -1;
  const wk = lc(a.week);
  let label = "", inWindow: (r: RawRow) => boolean = () => true;
  const weekWindow = (w: WeekMeta) => { label = `${w.label || "week " + w.weekNum} (${w.startDate} to ${w.endDate})`; inWindow = r => r.weekNum === w.weekNum; };
  if (a.ytd) { const y = String(today.getFullYear()); label = `year to date, ${y}`; inWindow = r => r.dateISO.startsWith(y); }
  else if (a.from || a.to) { const f = String(a.from || "0000-00-00"), t2 = String(a.to || "9999-12-31"); label = `${a.from || "the start"} to ${a.to || "today"}`; inWindow = r => r.dateISO >= f && r.dateISO <= t2; }
  else if (wk === "month") { const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`; label = "this month"; inWindow = r => r.dateISO.startsWith(ym); }
  else if (wk === "last" && idx > 0) weekWindow(weeks[idx - 1]);
  else if (wk && /^\w+$/.test(wk) && weeks.find(w => lc(w.weekNum) === wk)) weekWindow(weeks.find(w => lc(w.weekNum) === wk)!);
  else if (cur) weekWindow(cur);
  else { const latest = [...data.rows].map(r => r.weekNum).filter(Boolean).pop(); label = `week ${latest}`; inWindow = r => r.weekNum === latest; }

  // person (fuzzy: every word of the query appears in the name), also picks a name out of a raw question
  const allNames = Array.from(new Set(data.rows.map(r => r.name).filter(Boolean)));
  let personWanted = String(a.person || "").trim();
  if (!personWanted && a._q) {
    const qt = lc(a._q);
    const hit = allNames.filter(n => lc(n).split(/\s+/).some(tk => tk.length >= 3 && new RegExp("\\b" + tk.replace(/[^a-z0-9]/g, "") + "\\b").test(qt))).sort((x, y) => y.length - x.length)[0];
    if (hit) personWanted = hit;
  }
  const ptoks = lc(personWanted).split(/\s+/).filter(Boolean);
  const nameOk = (n: string) => ptoks.every(tk => lc(n).includes(tk));
  // "4YR payroll" is the NAME of this sheet, not a company filter: ignore company="4YR" (the by-company split is always shown).
  const jobQ = lc(a.job), typeQ = lc(a.type);
  const coQ = /^4\s*yr$|^4\s*you\s*pros?$/i.test(String(a.company || "").trim()) ? "" : lc(a.company);
  const base = data.rows.filter(inWindow);
  const rows = base.filter(r => (!ptoks.length || nameOk(r.name)) && (!jobQ || lc(r.job).includes(jobQ)) && (!coQ || lc(r.company).includes(coQ)) && (!typeQ || typeQ === "all" || payKind(r) === typeQ));

  if (ptoks.length && !allNames.some(nameOk))
    return { tool: "payroll_summary", title: "4YR payroll", source: src, asOf: asOfText(s), lines: [`I couldn't find anyone named "${personWanted}" in the 4YR payroll. ` + (allNames.length ? "Names I do see start with: " + allNames.slice(0, 6).join(", ") + "…" : "")], data: { count: 0, noPersonMatch: personWanted } };
  if (rows.length === 0)
    return { tool: "payroll_summary", title: "4YR payroll", source: src, asOf: asOfText(s),
      lines: [`I found no 4YR payroll entries for ${label}${personWanted ? " for " + personWanted : ""}${a.job ? " on " + a.job : ""}${a.type ? " of type " + a.type : ""}${coQ ? " for company " + a.company : ""}.` + (base.length ? ` (The same period has ${plural(base.length, "entry")} without those filters.)` : "")],
      data: { window: label, entries: 0, filtersApplied: { person: personWanted || null, job: a.job || null, company: coQ ? a.company : null, type: a.type || null }, entriesInWindowWithoutFilters: base.length } };

  const sum = (rs: RawRow[], f: (r: RawRow) => number) => rs.reduce((t, r) => t + (Number(f(r)) || 0), 0);
  const net = sum(rows, r => r.total), hours = sum(rows, r => r.hours);
  const kinds = { payroll: rows.filter(r => payKind(r) === "payroll"), deduction: rows.filter(r => payKind(r) === "deduction"), nonpayroll: rows.filter(r => payKind(r) === "nonpayroll") };
  const gross = sum(kinds.payroll, r => r.total), ded = sum(kinds.deduction, r => r.total), adj = sum(kinds.nonpayroll, r => r.total);
  const group = (key: (r: RawRow) => string) => {
    const m: Record<string, { hours: number; amount: number; entries: number }> = {};
    rows.forEach(r => { const k = key(r) || "(none)"; (m[k] ||= { hours: 0, amount: 0, entries: 0 }); m[k].hours += r.hours || 0; m[k].amount += r.total || 0; m[k].entries++; });
    return Object.entries(m).map(([name, v]) => ({ name, ...v })).sort((x, y) => y.amount - x.amount);
  };
  const byPerson = group(r => r.name), byCompany = group(r => r.company), byJob = group(r => r.job);
  const days = new Set(rows.map(r => r.dateISO)).size;
  const people = byPerson.length;

  const lines: string[] = [];
  if (ptoks.length && people === 1) {
    const who = byPerson[0].name;
    lines.push(`**${who}** has **${hrs(hours)} hours** and **${money(net)}** in ${label}, across ${plural(rows.length, "entry")} on ${plural(days, "day")}.`);
    if (byJob.length > 0) lines.push("By job: " + byJob.slice(0, 4).map(j => `${j.name} ${hrs(j.hours)}h ${money(j.amount)}`).join(" · ") + ".");
  } else {
    lines.push(`4YR payroll for ${label}: **${money(net)}** net across **${hrs(hours)} hours** and ${people === 1 ? "1 person" : people + " people"}.`);
    if (ptoks.length) lines.push(`That is the combined total for everyone matching "${personWanted}".`);
  }
  if (ded !== 0 || adj !== 0) lines.push(`Of that: ${money(gross)} regular payroll${ded !== 0 ? `, ${money(ded)} deductions` : ""}${adj !== 0 ? `, ${money(adj)} adjustments/reimbursements` : ""}.`);
  if (!coQ && byCompany.length > 1) lines.push("By company: " + byCompany.map(c => `${c.name} ${money(c.amount)}`).join(" · ") + ".");
  if (!(ptoks.length && people === 1) && people > 1) {
    const top = byPerson.slice(0, 5);
    lines.push("", `**Top ${top.length} by amount:**`, ...top.map(p => `• ${p.name}: ${money(p.amount)} (${hrs(p.hours)}h)`));
    if (people > top.length) lines.push(`…and ${people - top.length} more people.`);
  }
  if (a.list) {
    const ents = [...rows].sort((x, y) => (x.dateISO + x.name).localeCompare(y.dateISO + y.name)).slice(0, 25);
    lines.push("", `**Entries${rows.length > ents.length ? ` (first ${ents.length} of ${rows.length})` : ""}:**`, ...ents.map(r => `• ${r.date} · ${r.name} · ${r.job}${r.subCat ? " / " + r.subCat : ""} · ${hrs(r.hours)}h · ${money(r.total)}${r.remarks ? " · " + r.remarks.slice(0, 40) : ""}`));
  } else lines.push("", "Want the individual entries, or another week?");
  return { tool: "payroll_summary", title: "4YR payroll", lines, links: [{ label: "Open 4YR Payroll", page: "fouryr-payroll" }], source: src, asOf: asOfText(s),
    data: { window: label, entries: rows.length, hours, netTotal: net, regularPayroll: gross, deductions: ded, adjustments: adj, people, days,
      byCompany: byCompany.slice(0, 6), topPeople: byPerson.slice(0, 10), topJobs: byJob.slice(0, 6), personFilter: personWanted || null,
      note: "Net total = sum of each row's total (deductions are negative), exactly like the 4YR Payroll page." } };
}

function briefing(s: CalcSnapshot, _a: ToolArgs): ToolResult {
  const today = startOfDay(s.now);
  const od = apOverdue(s, { limit: 3 });
  const ds = apDueSoon(s, { days: 7, limit: 3 });
  const st = statementsPending(s, {});
  const bk = bankBalances(s, {});
  const cal = calendar(s, { days: 1 });
  const nt = notesOpen(s, {});
  const lines: string[] = [`**Here's your day, ${today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}:**`, ""];
  // Overdue — total first, then the one thing worth knowing
  if (od.data.count) {
    const worstAge = AGE_ORDER.filter(k => od.data.byAge?.[k]).sort((x, y) => od.data.byAge[y].total - od.data.byAge[x].total)[0];
    const top = od.data.examples?.[0];
    lines.push(`• **Overdue:** ${money(od.data.totalRemaining)} across ${plural(od.data.count, "bill")}` +
      (worstAge ? `, mostly ${worstAge} (${money(od.data.byAge[worstAge].total)})` : "") +
      (top ? `. Biggest: ${top.vendor} at ${money(top.remaining)}.` : "."));
  } else lines.push("• **Overdue:** nothing. Nice.");
  // Coming up
  if (ds.data.count) {
    const bd = ds.data.busiestDay?.[0];
    lines.push(`• **Coming up:** ${money(ds.data.totalRemaining)} due in the next 7 days (${plural(ds.data.count, "bill")})` +
      (bd ? `; heaviest day is ${fmtDay(new Date(bd.date + "T00:00:00"))} at ${money(bd.total)}.` : "."));
  } else lines.push("• **Coming up:** no bills due in the next 7 days.");
  lines.push(st.data.pendingCount
    ? `• **Statements:** ${plural(st.data.pendingCount, "statement")} ready to download.`
    : s.bankStatements.length === 0 ? "• **Statements:** I can't see the statements tracker right now." : "• **Statements:** all caught up.");
  const warn: string[] = [];
  if (bk.data.lowUnder500.length) warn.push(`${bk.data.lowUnder500.length} under $500`);
  if (bk.data.staleTwoDaysPlus.length) warn.push(`${bk.data.staleTwoDaysPlus.length} not updated in 2+ days`);
  lines.push(`• **Cash:** ${money(bk.data.grandTotal)} across your active accounts${warn.length ? ". Heads up: " + warn.join(", ") + "." : "."}`);
  if (cal.data.count) {
    lines.push(`• **Today's calendar:** ${plural(cal.data.count, "item")}`);
    cal.data.events.slice(0, 5).forEach((e: any) => lines.push(`  – ${e.time ? e.time + " " : ""}${e.title}${e.assignee ? " (" + e.assignee + ")" : ""}`));
  } else lines.push(s.events.length === 0 ? "• **Today's calendar:** I can't see calendar data right now (it may not have loaded)." : "• **Today's calendar:** nothing scheduled.");
  lines.push(`• **Notes:** ${nt.data.count ? plural(nt.data.count, "open note") : "none open"}.`);
  lines.push("", "Want me to dig into any of these?");
  return { tool: "briefing", title: "Daily briefing", lines, source: "AP, Bank Balances, Bank Statements, Calendar and Notes sheets", asOf: asOfText(s),
    links: [{ label: "Accounts Payable", page: "ap" }, { label: "Bank Statements", page: "statements" }, { label: "Calendar", page: "calendar" }],
    data: { overdue: od.data, dueSoon: ds.data, statements: st.data, banks: { grandTotal: bk.data.grandTotal, low: bk.data.lowUnder500, stale: bk.data.staleTwoDaysPlus }, today: cal.data, notes: { count: nt.data.count } } };
}

export const CALC_TOOLS: Record<string, CalcToolDef> = {
  ap_overdue:        { description: "Unpaid bills whose due date has passed.", args: "{entity?: string, vendor?: string, list?: boolean (true ONLY if the user asks to list/show the bills)}", run: apOverdue },
  ap_due_soon:       { description: "Unpaid bills due from today through the next N days.", args: "{days?: number (default 7), week?: 'this'|'next' (calendar weeks, Monday to Sunday, same as the AP page; use for \"this week\" / \"next week\"), entity?: string (also TI sub-entities like Corner Property, 4G, E1, 4YR), vendor?: string, list?: boolean}", run: apDueSoon },
  ap_search:         { description: "Find bills by vendor, invoice number, status (unpaid|paid|hold) or entity.", args: "{vendor?: string, invoiceNo?: string (use when the user gives an invoice number; returns that bill's full details), status?: string (unpaid|paid|hold), entity?: string, openOnly?: boolean, dueByDays?: number (open bills due on or before today+N days, overdue included — use for \"how much do we owe X by this week\"), list?: boolean (true ONLY if the user asks to list/show the bills)}", run: apSearch },
  ap_top_vendors:    { description: "Which vendors we owe the most (open bills by vendor, with overdue part and share of total).", args: "{n?: number, entity?: string}", run: apTopVendors },
  payroll_summary:   { description: "4YR Payroll hours and amounts from the 4YR payroll sheet: a week, last week, this month, year to date or a date range; filter by person, job, company, or record type (payroll / deduction / nonpayroll).", args: "{week?: 'this'|'last'|'month'|<week number>, ytd?: boolean, from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', person?: string, job?: string, company?: string, type?: 'payroll'|'deduction'|'nonpayroll', list?: boolean (true ONLY if asked to list/show entries)}. Add person, job, company or type ONLY when the user explicitly names one. '4YR' in '4YR payroll' is the name of the sheet, NOT a company filter; 'payroll' alone means everything in the window", run: payrollSummary },
  ap_summary:        { description: "Counts and totals of unpaid bills, grouped by entity.", args: "{entity?: string}", run: apSummary },
  bank_balances:     { description: "Current bank account balances, yesterday's balance, as-of time, low (<$500) and stale (2+ days) flags.", args: "{entity?: string, bank?: string, list?: boolean (true ONLY if asked for every account)}", run: bankBalances },
  statements_pending:{ description: "Bank statements whose cut-off has passed and are not downloaded yet.", args: "{list?: boolean}", run: statementsPending },
  statements_due:    { description: "Upcoming bank statement DUE dates (Cut-Off Dates) and when entries get created; also the rules for how statement entries are generated, hidden or shown.", args: "{days?: number (default 14)}", run: statementsDue },
  ap_analyze:        { description: "Flexible bill analysis for questions the other bill lookups can't answer: group, rank, total or trend bills by vendor, entity, company, category, month, week, age or status, with filters. Use for \"which vendor/month/entity…\", \"how much did we spend/pay…\", \"average\", \"biggest\", \"trend\", \"compare\".", args: "{status?: 'open'(default)|'paid'|'all'|'unpaid'|'hold', entity?: string, vendor?: string, category?: string, groupBy?: 'vendor'|'entity'|'company'|'category'|'month'|'week'|'age'|'status', dateField?: 'due'(default)|'invoice'|'paid', month?: 'YYYY-MM', from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', overdueOnly?: boolean, minAmount?: number, maxAmount?: number, top?: number, sort?: 'desc'|'asc'}", run: apAnalyze },
  ap_recent_added:   { description: "Bills newly ADDED/entered (today, this week, a date range): who added them and when (from the portal's Activity Log), plus the newest rows in each bill sheet. Use for \"what bills were added today/recently\", \"new bills\", \"what did we enter this week\". NOT for due dates.", args: "{days?: number (1 = today, 7 = last 7 days), from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', entity?: string, vendor?: string}", run: apRecentAdded },
  cash_coverage:     { description: "Cash on hand vs overdue bills and bills due in the next N days: can we cover them, and the surplus or shortfall.", args: "{days?: number (default 7), entity?: string}", run: cashCoverage },
  calendar:          { description: "Calendar events in a date range (default today through 7 days).", args: "{days?: number, from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', assignee?: string, entity?: string, includeDone?: boolean, list?: boolean}", run: calendar },
  notes_open:        { description: "Open Quick Notes, optionally filtered.", args: "{query?: string, category?: string, member?: string}", run: notesOpen },
  platforms:         { description: "The Platforms Directory: platform names, links and descriptions.", args: "{query?: string}", run: platforms },
  help_search:       { description: "How-to steps, FAQ and fixes from the portal's Help & Reference.", args: "{query: string}", run: helpSearch },
  briefing:          { description: "The daily briefing: overdue, due soon, statements, balances, today's calendar, notes.", args: "{}", run: briefing },
};

function addSuggestions(res: ToolResult, a: ToolArgs): ToolResult {
  if (res.suggest && res.suggest.length) return res;
  const sug: { label: string; tool: string; args: ToolArgs }[] = [];
  const d = res.data || {};
  const ents = d.byEntity ? Object.entries(d.byEntity as Record<string, { total: number }>).sort((x, y) => y[1].total - x[1].total).map(([k]) => k) : [];
  switch (res.tool) {
    case "ap_overdue": case "ap_due_soon": case "ap_search":
      if (d.bills && d.bills.length === 1) break;
      if (d.count > 3 && !a.list) sug.push({ label: "List them all", tool: res.tool, args: { ...a, list: true } });
      if (ents.length > 1 && !a.entity) sug.push({ label: `Just ${ents[0]}`, tool: res.tool, args: { ...a, entity: ents[0] } });
      if (res.tool === "ap_overdue" && !a.vendor) sug.push({ label: "Due this week", tool: "ap_due_soon", args: { days: 7, ...(a.entity ? { entity: a.entity } : {}) } });
      if (res.tool === "ap_search" && a.vendor && !a.invoiceNo) {
        sug.push({ label: "Only overdue", tool: "ap_overdue", args: { vendor: a.vendor } });
        if (a.status !== "paid") sug.push({ label: "Payment history", tool: "ap_search", args: { vendor: a.vendor, status: "paid" } });
      }
      break;
    case "ap_top_vendors":
      if (d.top && d.top[0]) sug.push({ label: `Details: ${d.top[0].vendor}`, tool: "ap_search", args: { vendor: d.top[0].vendor, openOnly: true } });
      sug.push({ label: "Overdue bills", tool: "ap_overdue", args: {} });
      break;
    case "payroll_summary":
      if (d.dataNotLoaded) break;
      if (!a.list && d.entries > 0) sug.push({ label: "List the entries", tool: res.tool, args: { ...a, list: true } });
      if (!a.ytd) sug.push({ label: "Year to date", tool: res.tool, args: { ...a, ytd: true, week: undefined } });
      if (lc(a.week) !== "last" && !a.ytd) sug.push({ label: "Last week", tool: res.tool, args: { ...a, week: "last" } });
      break;
    case "statements_pending":
      if (d.pendingCount > 5 && !a.list) sug.push({ label: "List them all", tool: res.tool, args: { list: true } });
      break;
    case "bank_balances":
      if (!a.list) sug.push({ label: "Account by account", tool: res.tool, args: { ...a, list: true } });
      break;
    case "calendar":
      if (d.count > 3 && !a.list) sug.push({ label: "List every event", tool: res.tool, args: { ...a, list: true } });
      break;
    case "briefing":
      sug.push({ label: "Overdue details", tool: "ap_overdue", args: {} }, { label: "Due this week", tool: "ap_due_soon", args: { days: 7 } }, { label: "Statements", tool: "statements_pending", args: {} });
      break;
  }
  return sug.length ? { ...res, suggest: sug.slice(0, 4) } : res;
}

/** If the data a lookup depends on never loaded (not signed in, sync failed), say so; never report "none" or "$0". */
function missingData(name: string, snap: CalcSnapshot): { what: string; page: string } | null {
  if (/^ap_/.test(name) && snap.apBills.length === 0) return { what: "the Accounts Payable bills", page: "AP" };
  if (name === "cash_coverage" && (snap.bankAccounts.length === 0 || snap.apBills.length === 0)) return { what: "the bank balances or bills", page: "Hub" };
  if (name === "bank_balances" && snap.bankAccounts.length === 0) return { what: "the bank balances", page: "Bank Balances" };
  if (name === "statements_pending" && snap.bankStatements.length === 0) return { what: "the bank statements tracker", page: "Bank Statements" };
  if (name === "calendar" && snap.events.length === 0) return { what: "the calendar", page: "Calendar" };
  if (name === "briefing" && snap.apBills.length === 0 && snap.bankAccounts.length === 0) return { what: "the portal data", page: "Hub" };
  return null;
}

export async function runTool(name: string, snap: CalcSnapshot, args: ToolArgs): Promise<ToolResult | null> {
  const t = CALC_TOOLS[name];
  if (!t) return null;
  const miss = missingData(name, snap);
  if (miss) {
    return { tool: name, title: t.description, source: "", asOf: "",
      lines: [`I can't see ${miss.what} right now, so I can't answer that reliably. The data may not have loaded: sign in with Google and run Pull All from the Data Sync page, then ask me again.`],
      data: { dataNotLoaded: true, missing: miss.what, note: "The data did not load. Do NOT say there are none/zero; say the data isn't available and how to fix it." } };
  }
  try { return addSuggestions(await t.run(snap, args || {}), args || {}); } catch (e: any) {
    return { tool: name, title: name, lines: [`I hit a problem reading that data (${e?.message || "unknown error"}).`], data: { error: String(e?.message || e) }, source: "", asOf: "" };
  }
}

/** Tool catalog text for the AI planner prompt. */
export const toolCatalogText = () =>
  Object.entries(CALC_TOOLS).map(([n, t]) => `- ${n} ${t.args}: ${t.description}`).join("\n");

// ── keyword router: works with NO AI, used for quick chips and as the fallback when the AI is busy ──
const ROUTER_STOP = new Set(["this","that","week","next","much","many","amount","amounts","outstanding","until","pay","paid","payment","payments","owe","owed","bill","bills","invoice","invoices","unpaid","balance","balances","overdue","total","what","whats","with","have","from","about","show","tell","give","need","vendor","vendors","month","today","tomorrow","when","does","there","their","them","they","into","please","calc","still","remaining","left","open","status","due","how","where","which","would","could","should","your","ours","most","biggest","largest","top","owe","owed","cash","money","bank","banks","account","accounts","statement","statements","calendar","note","notes","platform","platforms","event","events","schedule","meeting","meetings","list","tasks","task","download","downloaded","sign","login","password","link","links","help","guide","portal"]);

/** Vendor named in the question: longest word (4+ letters) that appears inside a vendor name. */
function vendorFromQuestion(t: string, s: CalcSnapshot): string | null {
  const names = Array.from(new Set(s.apBills.map(b => lc(b.vendor)).filter(v => v.length > 2)));
  const words = (t.replace(/'s\b/g, "").match(/[a-z0-9&]{4,}/g) || []).filter(w => !ROUTER_STOP.has(w)).sort((x, y) => y.length - x.length);
  for (const w of words) if (names.some(n => n.includes(w))) return w;
  const full = names.find(n => n.length > 3 && t.includes(n));
  return full || null;
}

export function routeQuestion(q: string, s: CalcSnapshot): { tool: string; args: ToolArgs }[] | null {
  const t = lc(q);
  if (!t) return null;
  const entities = Array.from(new Set(s.apBills.map(b => b.entity).filter(Boolean)));
  // Whole-word match only ("ti" must not match inside "until"); "ruby", "ruby's" and "rubys" all hit Ruby's.
  const entity = entities.find(e => {
    const key = lc(e).replace(/[^a-z0-9 ]/g, "").replace(/s$/, "");
    return key.length > 0 && new RegExp(`\\b${key}(?:s)?\\b`).test(t.replace(/'/g, ""));
  });
  const base: ToolArgs = entity ? { entity } : {};
  if (/\b(list|show|which|itemi[sz]e|every|each|all of them|all the bills)\b/.test(t)) base.list = true;
  if (/\bbriefing\b|catch me up|what.?s (going on|happening|new)|good morning|summary of today/.test(t)) return [{ tool: "briefing", args: {} }];

  // 4YR payroll: hours, wages, who worked, deductions
  if (/payroll|timesheet|hours (did|has|have|worked|are)|worked|wages|salary|labor cost|how many hours|deductions?\b|4yr/.test(t) && !/\b(bill|bills|invoice|owe|vendor)\b/.test(t)) {
    const args: ToolArgs = { _q: q };
    if (/last week/.test(t)) args.week = "last";
    else if (/ytd|year to date|this year|so far this year/.test(t)) args.ytd = true;
    else if (/this month/.test(t)) args.week = "month";
    if (/\b(list|show|which|itemi[sz]e|every|each|all of them)\b/.test(t)) args.list = true;
    if (/deduction/.test(t)) args.type = "deduction";
    return [{ tool: "payroll_summary", args }];
  }

  // "Who do we owe the most?" / "biggest vendors"
  if (/who do we owe|owe the most|biggest vendors?|largest vendors?|top (\d+ )?vendors?|most (money )?(owed|overdue)|which vendors?.*(most|biggest|highest)/.test(t)) {
    const nm = t.match(/top (\d+)/);
    return [{ tool: "ap_top_vendors", args: { ...(nm ? { n: Number(nm[1]) } : {}), ...(entity ? { entity } : {}) } }];
  }

  // An invoice number anywhere in the question → find that exact bill.
  const invMatch = t.match(/\b(?:invoice|inv)\s*(?:number|no\.?|num|#)?\s*[:#]?\s*([a-z0-9-]*\d[a-z0-9-]{3,})/) || t.match(/\b(\d{6,})\b/);
  if (invMatch) return [{ tool: "ap_search", args: { invoiceNo: invMatch[1], ...(entity ? { entity } : {}) } }];

  // "Where do I log in to X" / "link for X" → Platforms Directory, before any vendor guess.
  if (/platform|portal link|log ?in|sign ?in|website|\blink\b|\burl\b|where (is|do i find|can i find)/.test(t) && !/\b(bill|bills|owe|overdue|invoice)\b/.test(t)) {
    const m = t.match(/(?:for|of|to|into|on)\s+([a-z0-9.&' -]{2,30})\??$/);
    return [{ tool: "platforms", args: m ? { query: m[1].replace(/^the\s+/, "").trim() } : {} }];
  }

  // "newly added bills today / this week", "what did we enter yesterday", "new bills" → who added what and when
  if (/\b(newly|recently|just|latest)\s+(added|entered|created|uploaded)\b|\b(added|entered|created|uploaded)\s+(today|yesterday|this week|recently|lately|this month)\b|\bnew bills?\b|\bbills?\s+(added|entered|uploaded)\b|what.{0,12}(did|have) (we|i|you) (add|enter)/.test(t)) {
    const ra: ToolArgs = { ...base };
    if (/yesterday/.test(t)) { const y = new Date(startOfDay(s.now).getTime() - DAY); ra.from = iso(y); ra.to = iso(y); }
    else if (/this week|7 days|past week|last week/.test(t)) ra.days = 7;
    else if (/this month|30 days/.test(t)) ra.days = 30;
    else ra.days = 1;
    return [{ tool: "ap_recent_added", args: ra }];
  }

  // A named vendor wins over every generic keyword ("how much do we owe Alsco this week").
  const vendor = vendorFromQuestion(t, s);
  if (vendor) {
    const args: ToolArgs = { vendor, ...base };
    if (/payment history|last paid|last payment|when did we (last )?pay|have we paid|did we pay|paid so far|how much (have|did) we (pay|paid)/.test(t)) { args.status = "paid"; return [{ tool: "ap_search", args }]; }
    if (/this week|until|by (the )?end|next 7|due soon|owe|outstanding|still (to )?pay|unpaid|remaining|how much/.test(t)) {
      args.openOnly = true;
      if (/this week|until|by (the )?end of (the )?week|next 7/.test(t)) args.dueByDays = 7;
      else if (/next week|14 days/.test(t)) args.dueByDays = 14;
      else if (/today/.test(t)) args.dueByDays = 0;
    }
    return [{ tool: "ap_search", args }];
  }

  if (/overdue|past due|late bill|behind on|\blate\b/.test(t)) return [{ tool: "ap_overdue", args: base }];
  if (/due (this|next|in|within)|coming due|upcoming bill|due soon|due today|this week.*bill|bills.*this week/.test(t)) return [{ tool: "ap_due_soon", args: { ...base, ...(/next week/.test(t) ? { week: "next" } : /this week/.test(t) ? { week: "this" } : { days: /14/.test(t) ? 14 : 7 }) } }];
  if (/statement/.test(t)) return [{ tool: "statements_pending", args: { list: !!base.list } }];
  if (/balance|how much (cash|money)|bank account|cash on hand/.test(t)) return [{ tool: "bank_balances", args: base }];
  if (/calendar|schedule|meeting|event|appointment|what.?s on (today|tomorrow)/.test(t)) return [{ tool: "calendar", args: { days: /month/.test(t) ? 30 : /today/.test(t) ? 1 : /tomorrow/.test(t) ? 2 : 7, ...base } }];
  if (/\bnotes?\b|to-?do|open tasks?/.test(t)) return [{ tool: "notes_open", args: {} }];
  if (/platform|portal link|login for|where.*(sign in|log in)/.test(t)) {
    const m = t.match(/(?:for|of|to)\s+([a-z0-9.&' -]{2,30})\??$/);
    return [{ tool: "platforms", args: m ? { query: m[1].trim() } : {} }];
  }
  if (/how much|how many|total|amount|owe|outstanding/.test(t) && /\bbills?\b|invoice|payable|\bap\b|vendor|unpaid|owe|outstanding/.test(t)) return [{ tool: "ap_summary", args: base }];
  if (/^(how (do|to|can|does)|where (is|do|can)|why|what is|what does|can i|is there)|documented|\bhelp\b|guide|steps/.test(t)) return [{ tool: "help_search", args: { query: q } }];
  if (/\bbills?\b|invoice|payable|\bap\b|vendor|unpaid/.test(t)) return [{ tool: "ap_summary", args: base }];
  return null;
}
