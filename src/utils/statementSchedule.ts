// Bank Statement Tracker scheduling rules — shared by the server (which creates/hides entries) and the
// Bank Statements page (which shows "due next week"), so both always agree.
//
// "Due date" = the bank's Cut-Off Date from the reference table (Bank Statements Data, columns N–T).
// Row markers live in column K of the Bank Statements Data tab (all hidden in the portal):
//   DELETED …          someone deleted the entry in the portal — never re-created
//   OLD DUE DATE …     the bank's due date changed; this entry belonged to the old date — never re-created
//   WAITING until …    entry exists but is not yet within 2 days of its due date — revealed automatically then

/** An entry is created / shown this many days BEFORE its due (cut-off) date. */
export const STATEMENT_GENERATE_DAYS_BEFORE = 2;

export interface StmtTemplate { entity: string; bank: string; cycle?: string; cutOffDate?: string }
export interface StmtRow {
  bankName: string; entity: string; occurrence: string; statementDate: string;
  cutOffDate?: string; downloaded?: boolean; rowIndex?: number;
}
export interface StmtNewEntry {
  period: string; entity: string; bankName: string; occurrence: string; remarks: string;
  statementDate: string; requestDate: string; downloaded: boolean; downloadedAt: string; cutOffDate: string;
}

export const parseCutOffDay = (raw: unknown): number | null => {
  const m = String(raw || "").match(/(\d{1,2})/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  return d >= 1 && d <= 31 ? d : null;
};

/** Today's calendar date in Philippine time (the team's clock), as a local-midnight Date. */
export function manilaToday(): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date()).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const fmtStmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The cut-off date for `day` in month `m` (0-based) — clamped to the month's last day (31st → Feb 28). */
export const cutOffInMonth = (day: number, y: number, m: number) =>
  new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));

const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86_400_000);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Statement Date = previous cut-off + 1 day → this cut-off (e.g. cut-off the 28th → "Sep 29 – Oct 28"). */
function entryFor(day: number, cut: Date) {
  const prev = cutOffInMonth(day, cut.getFullYear(), cut.getMonth() - 1);
  return {
    cutOffDate: fmtStmtDate(cut),
    statementDate: `${fmtStmtDate(addDays(prev, 1))}|${fmtStmtDate(cut)}`,
    period: `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, "0")}`,
  };
}

/**
 * Entries that should exist for a bank whose cut-off is `day`, as of `today`:
 *  - this month's cut-off once it has been reached (catches up an entry nobody created in time), and
 *  - the NEXT cut-off once it is STATEMENT_GENERATE_DAYS_BEFORE days away or closer.
 */
export function statementCandidates(day: number, today: Date) {
  const y = today.getFullYear(), m = today.getMonth();
  const cuts: Date[] = [];
  const thisMonth = cutOffInMonth(day, y, m);
  if (thisMonth <= today) cuts.push(thisMonth);
  const upcoming = thisMonth > today ? thisMonth : cutOffInMonth(day, y, m + 1);
  if (daysBetween(today, upcoming) <= STATEMENT_GENERATE_DAYS_BEFORE) cuts.push(upcoming);
  return cuts.map((cut) => entryFor(day, cut));
}

const keyOf = (bank: string, entity: string, occ: string) => `${bank}|${entity}|${occ}`;

export interface StatementPlan {
  markOld: Array<{ rowIndex: number; note: string }>;       // entries of an old due date → hidden for good
  markWaiting: Array<{ rowIndex: number; note: string }>;   // not yet within 2 days of due → hidden until then
  reveal: number[];                                          // WAITING rows whose window has opened → shown again
  repair: Array<{ rowIndex: number; cutOffDate: string }>;  // older auto entries missing their cut-off date
  append: StmtNewEntry[];                                    // brand-new entries to create
}

/**
 * Decide everything to do to the sheet right now, from the reference table (current due dates) and what the sheet holds.
 *  - statements   visible entries; waiting = rows marked WAITING; tombstones = rows marked DELETED / OLD DUE DATE
 * Only NOT-downloaded entries are ever hidden. Downloaded entries are history and are never touched.
 */
export function planStatementActions(
  templates: StmtTemplate[], statements: StmtRow[], waiting: StmtRow[], tombstones: StmtRow[], today: Date,
): StatementPlan {
  const plan: StatementPlan = { markOld: [], markWaiting: [], reveal: [], repair: [], append: [] };
  const info = new Map<string, { t: StmtTemplate; day: number }>();
  templates.forEach((t) => {
    const day = parseCutOffDay(t.cutOffDate);
    if (day !== null) info.set(keyOf(t.bank, t.entity, t.cycle || "Monthly"), { t, day });
  });
  if (info.size === 0) return plan;

  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const managed = new Set([fmtStmtDate(today).slice(0, 7), fmtStmtDate(nextMonth).slice(0, 7)]);
  const ymToCut = (day: number, ym: string) => { const [y, m] = ym.split("-").map(Number); return cutOffInMonth(day, y, m - 1); };
  const hidden = new Set<number>();
  const revealedKeys = new Set<string>();
  const oldWaiting = new Set<number>();

  // 1) Visible, not-downloaded entries of this/next month: old due date → hide for good; due date still in the future → wait
  for (const s of statements) {
    if (s.downloaded || !s.cutOffDate || !s.rowIndex) continue;
    const i = info.get(keyOf(s.bankName, s.entity, s.occurrence));
    if (!i) continue;
    const ym = s.cutOffDate.slice(0, 7);
    if (!managed.has(ym)) continue; // past months are history
    const cut = ymToCut(i.day, ym);
    if (s.cutOffDate !== fmtStmtDate(cut)) {
      plan.markOld.push({ rowIndex: s.rowIndex, note: `OLD DUE DATE ${fmtStmtDate(today)}: was ${s.cutOffDate}, now ${fmtStmtDate(cut)}` });
      hidden.add(s.rowIndex);
    } else if (daysBetween(today, cut) > STATEMENT_GENERATE_DAYS_BEFORE) {
      plan.markWaiting.push({ rowIndex: s.rowIndex, note: `WAITING until ${fmtStmtDate(addDays(cut, -STATEMENT_GENERATE_DAYS_BEFORE))} (due ${fmtStmtDate(cut)})` });
      hidden.add(s.rowIndex);
    }
  }

  // 2) Entries already waiting: due date changed → old; window opened → reveal
  for (const w of waiting) {
    if (!w.rowIndex || !w.cutOffDate) continue;
    const i = info.get(keyOf(w.bankName, w.entity, w.occurrence));
    if (!i) continue;
    const ym = w.cutOffDate.slice(0, 7);
    const cut = ymToCut(i.day, ym);
    if (w.cutOffDate !== fmtStmtDate(cut)) {
      plan.markOld.push({ rowIndex: w.rowIndex, note: `OLD DUE DATE ${fmtStmtDate(today)}: was ${w.cutOffDate}, now ${fmtStmtDate(cut)}` });
      oldWaiting.add(w.rowIndex);
    } else if (daysBetween(today, cut) <= STATEMENT_GENERATE_DAYS_BEFORE) {
      const taken = statements.some((s) => !hidden.has(s.rowIndex || -1) && keyOf(s.bankName, s.entity, s.occurrence) === keyOf(w.bankName, w.entity, w.occurrence)
        && String(s.cutOffDate || "").slice(0, 7) === ym);
      if (!taken) { plan.reveal.push(w.rowIndex); revealedKeys.add(`${keyOf(w.bankName, w.entity, w.occurrence)}|${ym}`); }
    }
  }

  // 3) Create entries that are now due (2 days before, or already past this month and missing)
  info.forEach(({ t, day }) => {
    const occurrence = t.cycle || "Monthly";
    const k = keyOf(t.bank, t.entity, occurrence);
    statementCandidates(day, today).forEach((c) => {
      const ym = c.cutOffDate.slice(0, 7);
      const same = (s: StmtRow) => keyOf(s.bankName, s.entity, s.occurrence) === k
        && (s.statementDate === c.statementDate || String(s.cutOffDate || "").slice(0, 7) === ym);
      const visible = statements.find((s) => !hidden.has(s.rowIndex || -1) && same(s));
      if (visible) {
        if (!visible.cutOffDate && visible.rowIndex) plan.repair.push({ rowIndex: visible.rowIndex, cutOffDate: c.cutOffDate });
        return;
      }
      if (tombstones.some((s) => keyOf(s.bankName, s.entity, s.occurrence) === k && (s.cutOffDate === c.cutOffDate || s.statementDate === c.statementDate))) return;
      if (revealedKeys.has(`${k}|${ym}`)) return;
      if (waiting.some((w) => !oldWaiting.has(w.rowIndex || -1) && keyOf(w.bankName, w.entity, w.occurrence) === k && w.cutOffDate === c.cutOffDate)) return;
      plan.append.push({
        period: c.period, entity: t.entity, bankName: t.bank, occurrence, remarks: (t as any).remarks || "",
        statementDate: c.statementDate, requestDate: "", downloaded: false, downloadedAt: "", cutOffDate: c.cutOffDate,
      });
    });
  });
  return plan;
}

/** Banks whose due (cut-off) date falls in NEXT calendar week (Mon–Sun), with the day their entry opens. */
export function dueNextWeek(templates: StmtTemplate[], today: Date) {
  const dow = today.getDay(); // 0 Sun … 6 Sat
  const start = addDays(today, (8 - dow) % 7 || 7);
  const end = addDays(start, 6);
  const out: Array<{ entity: string; bank: string; cutOffDate: string; opens: string }> = [];
  templates.forEach((t) => {
    const day = parseCutOffDay(t.cutOffDate);
    if (day === null) return;
    const seen = new Set<string>();
    [cutOffInMonth(day, start.getFullYear(), start.getMonth()), cutOffInMonth(day, end.getFullYear(), end.getMonth())].forEach((cut) => {
      const f = fmtStmtDate(cut);
      if (cut >= start && cut <= end && !seen.has(f)) {
        seen.add(f);
        out.push({ entity: t.entity, bank: t.bank, cutOffDate: f, opens: fmtStmtDate(addDays(cut, -STATEMENT_GENERATE_DAYS_BEFORE)) });
      }
    });
  });
  out.sort((a, b) => a.cutOffDate.localeCompare(b.cutOffDate) || a.bank.localeCompare(b.bank));
  return { start: fmtStmtDate(start), end: fmtStmtDate(end), items: out };
}
