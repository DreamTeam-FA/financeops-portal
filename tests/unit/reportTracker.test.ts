/**
 * Report Tracker — unit tests for the schedule / status / auto-check logic.
 * Pure functions only (no network). Run: npx vitest run tests/unit
 */
import { describe, it, expect } from "vitest";
import {
  adSpendFromGrid, cycleStatus, cycleView, fmtPht, fromPht, historyRows, isoDate, latestDateIn, plannedCalendarEvents,
  reportById, stepStates, stepStatesEx, explicitUnticks, allTimeFromGrid, uploadFromChangeLog, reminderItems, toPht, cyclesAround, weekendShift, amazonTabMatches,
} from "../../src/services/reportTrackerService";

// Thu Oct 1, 2026 3:10 PM PHT  (= 07:10 UTC)
const THU_OCT1 = Date.UTC(2026, 9, 1, 7, 10);

describe("Philippine time helpers", () => {
  it("round-trips PHT wall clock", () => {
    const ms = fromPht(2026, 9, 29, 17, 0);
    expect(new Date(ms).toISOString()).toBe("2026-09-29T09:00:00.000Z");
    expect(toPht(ms)).toMatchObject({ y: 2026, m: 9, d: 29, hh: 17, mm: 0, dow: 2 });
  });
  it("formats", () => expect(fmtPht(fromPht(2026, 10, 6, 17, 0))).toBe("Tue, Oct 6, 5:00 PM"));
});

describe("cycles on Thu Oct 1, 2026 (PHT)", () => {
  it("FTA: active = Tue Sep 29 (Monday tab 09/28/2026), next = Tue Oct 6", () => {
    const v = cycleView("fta", THU_OCT1);
    expect(v.active.tabName).toBe("09/28/2026");
    expect(v.active.periodKey).toBe("fta:2026-09-28");
    expect(isoDate(toPht(v.active.windowStart))).toBe("2026-09-29");
    expect(toPht(v.active.windowStart).hh).toBe(17);
    expect(isoDate(toPht(v.next!.windowStart))).toBe("2026-10-06");
  });
  it("CPRO weekly: active = Mon Sep 28 run for Sun 09/20 – Sat 09/26, next = Mon Oct 5", () => {
    const v = cycleView("cprow", THU_OCT1);
    expect(v.active.tabName).toBe("09/20-09/26");
    expect(isoDate(toPht(v.active.windowStart))).toBe("2026-09-28");
    expect(isoDate(toPht(v.next!.windowStart))).toBe("2026-10-05");
    expect(v.next!.tabName).toBe("09/27-10/03");
    expect(toPht(v.next!.deadline).hh).toBe(19);
  });
  it("CPRO monthly: active = Sep 3 run for August; next = Oct 3 run for September (deadline Oct 6)", () => {
    const v = cycleView("cprom", THU_OCT1);
    expect(v.active.tabName).toBe("AUGUST 1-31,2026");
    expect(v.active.month).toMatchObject({ y: 2026, m: 8, lastDay: 31 });
    expect(v.next!.tabName).toBe("SEPTEMBER 1-30,2026");
    expect(v.next!.periodKey).toBe("cprom:2026-09");
    expect(isoDate(toPht(v.next!.windowStart))).toBe("2026-10-03");
    expect(isoDate(toPht(v.next!.deadline))).toBe("2026-10-06");
  });
  it("Toast Recon: active = Sep 4 run for August; next starts Oct 4 for September", () => {
    const v = cycleView("toast", THU_OCT1);
    expect(v.active.periodKey).toBe("toast:2026-08");
    expect(v.next!.periodKey).toBe("toast:2026-09");
    expect(isoDate(toPht(v.next!.windowStart))).toBe("2026-10-04");
    expect(isoDate(toPht(v.next!.deadline))).toBe("2026-10-05");
  });
  it("handles year rollover (Jan run covers December)", () => {
    const jan4 = fromPht(2027, 1, 4, 10);
    expect(cycleView("toast", jan4).active.periodKey).toBe("toast:2026-12");
    expect(cycleView("cprom", fromPht(2027, 1, 3, 18)).active.tabName).toBe("DECEMBER 1-31,2026");
  });
  it("CPRO weekly tab name crosses month/year boundaries correctly", () => {
    const v = cycleView("cprow", fromPht(2027, 1, 4, 18)); // Mon Jan 4 2027 → Sun Dec 27 – Sat Jan 2
    expect(v.active.tabName).toBe("12/27-01/02");
  });
});

describe("status rules", () => {
  const fta = reportById("fta");
  const view = cycleView("fta", THU_OCT1).active;
  const allOpen = Object.fromEntries(fta.steps.map(s => [s.key, "open" as const]));

  it("FTA: script missing past the deadline → overdue", () => {
    expect(cycleStatus(fta, view, allOpen, view.deadline + 60_000)).toBe("overdue");
  });
  it("FTA: script missing inside the window → due", () => {
    expect(cycleStatus(fta, view, allOpen, view.windowStart + 60_000)).toBe("due");
  });
  it("FTA: script done, follow-ups open → in progress even after the window", () => {
    expect(cycleStatus(fta, view, { ...allOpen, run: "done" }, view.deadline + 86_400_000)).toBe("progress");
  });
  it("all steps done → done", () => {
    const done = Object.fromEntries(fta.steps.map(s => [s.key, "done" as const]));
    expect(cycleStatus(fta, view, done, view.deadline + 1)).toBe("done");
  });
  it("CPRO monthly: unfinished past the 6th deadline → overdue, even if the script ran", () => {
    const rep = reportById("cprom");
    const c = cycleView("cprom", fromPht(2026, 10, 7, 9)).active;
    const st = { ...Object.fromEntries(rep.steps.map(s => [s.key, "open" as const])), run: "done" as const };
    expect(c.periodKey).toBe("cprom:2026-09");
    expect(cycleStatus(rep, c, st, fromPht(2026, 10, 7, 9))).toBe("overdue");
    expect(cycleStatus(rep, c, st, fromPht(2026, 10, 5, 9))).toBe("progress");
  });
  it("CPRO monthly past the deadline: script ran + nothing tracked here → 'untracked', not overdue", () => {
    const rep = reportById("cprom");
    const c = cycleView("cprom", fromPht(2026, 10, 7, 9)).active;
    const autoDone = Object.fromEntries(rep.steps.map(s => [s.key, s.kind === "auto" ? "done" as const : "open" as const]));
    expect(cycleStatus(rep, c, autoDone, fromPht(2026, 10, 7, 9))).toBe("untracked");
    // you started ticking manual boxes here but didn't finish → real overdue
    expect(cycleStatus(rep, c, { ...autoDone, webstorage: "done" }, fromPht(2026, 10, 7, 9))).toBe("overdue");
    // an automatic step is genuinely missing (e.g. Ad Spend still $0.00) → overdue
    expect(cycleStatus(rep, c, { ...autoDone, adspend: "open" }, fromPht(2026, 10, 7, 9))).toBe("overdue");
    // can't read an auto step (unknown) → never claim overdue
    expect(cycleStatus(rep, c, { ...autoDone, adspend: "unknown" }, fromPht(2026, 10, 7, 9))).toBe("untracked");
  });
  it("Toast Recon past deadline: payouts landed + Micah not recorded → untracked; payouts missing → overdue", () => {
    const rep = reportById("toast");
    const c = cycleView("toast", fromPht(2026, 10, 7, 9)).active;
    expect(cycleStatus(rep, c, { run: "done", micah: "open" }, fromPht(2026, 10, 7, 9))).toBe("untracked");
    expect(cycleStatus(rep, c, { run: "open", micah: "open" }, fromPht(2026, 10, 7, 9))).toBe("overdue");
  });
  it("manual steps come from the Checks tab; auto steps from the sheet reads", () => {
    const c = cycleView("cprow", THU_OCT1).active;
    const rep = reportById("cprow");
    const s = stepStates(rep, c, { run: { state: "ok" }, alltime: { state: "no" } }, { [`${c.periodKey}|sheet`]: true });
    expect(s).toMatchObject({ run: "done", alltime: "done", sheet: "done", dashboard: "open", tonie: "open" }); // alltime implied by "sheet"
  });
  it("a later done step implies the earlier ones; an explicit untick wins; nothing earlier is implied by an earlier step", () => {
    const c = cycleView("cprow", THU_OCT1).active;
    const rep = reportById("cprow");
    const k = (s: string) => `${c.periodKey}|${s}`;
    const all = stepStatesEx(rep, c, { run: { state: "no" }, alltime: { state: "no" } }, { [k("tonie")]: true });
    expect(Object.values(all.states)).toEqual(["done", "done", "done", "done", "done"]);
    expect([...all.implied]).toEqual(["run", "alltime", "sheet", "dashboard"]);
    const unticked = stepStatesEx(rep, c, undefined, { [k("tonie")]: true, [k("sheet")]: false }, new Set([k("sheet")]));
    expect(unticked.states.sheet).toBe("open");
    expect(unticked.states.run).toBe("done");
    const first = stepStatesEx(rep, c, { run: { state: "ok" } }, {});
    expect(first.implied.size).toBe(0);
  });
  it("CPRO Monthly: Ad Spend / Website / Brand Payout do not imply each other, but each implies the script steps and the dashboard implies all three", () => {
    const c = cycleView("cprom", fromPht(2026, 10, 7, 9)).active;
    const rep = reportById("cprom");
    const k = (s: string) => `${c.periodKey}|${s}`;
    const a = stepStatesEx(rep, c, { run: { state: "no" }, alltime: { state: "no" }, adspend: { state: "no" } }, { [k("payout")]: true });
    expect(a.states).toMatchObject({ run: "done", alltime: "done", adspend: "open", webstorage: "open", payout: "done", dashboard: "open" });
    const b = stepStatesEx(rep, c, { run: { state: "no" }, alltime: { state: "no" }, adspend: { state: "no" } }, { [k("dashboard")]: true });
    expect(b.states).toMatchObject({ run: "done", alltime: "done", adspend: "done", webstorage: "done", payout: "done", dashboard: "done", micah: "open" });
  });
  it("explicitUnticks only counts human unticks, not Slack/auto evidence rows", () => {
    const c = cycleView("cprow", THU_OCT1).active;
    const u = explicitUnticks({
      [`${c.periodKey}|sheet`]: { done: false, at: "", by: "a@b.c", evidence: "" },
      [`${c.periodKey}|dashboard`]: { done: false, at: "", by: "slack-check", evidence: "REVIEW: x" },
      [`${c.periodKey}|auto:run`]: { done: false, at: "", by: "auto-check", evidence: "" },
    });
    expect([...u]).toEqual([`${c.periodKey}|sheet`]);
  });
  it("unknown auto results never count as done", () => {
    const c = cycleView("toast", THU_OCT1).active;
    expect(stepStates(reportById("toast"), c, undefined, {}).run).toBe("unknown");
  });
});

describe("Sales All Time reads the content, not the edit time", () => {
  const weekRows = [["10/04/2026-10/10/2026", "$1,606.05"], ["09/27/2026-10/03/2026", "$1,354.04"]];
  const wk = cycleView("cprow", fromPht(2026, 10, 13, 9)).active; // Oct 4 – Oct 10
  it("weekly range present with a total → ok", () => {
    expect(wk.rangeText).toBe("10/04/2026-10/10/2026");
    expect(allTimeFromGrid(weekRows, wk)).toMatchObject({ state: "ok" });
  });
  it("range missing → no; range with a blank total → no", () => {
    expect(allTimeFromGrid([["09/27/2026-10/03/2026", "$1,354.04"]], wk).state).toBe("no");
    expect(allTimeFromGrid([["10/04/2026-10/10/2026", ""]], wk).state).toBe("no");
  });
  it("same start but different end date counts and says so; spaces are ignored", () => {
    const r = allTimeFromGrid([["10/04/2026 - 10/11/2026", "$1,606.05"]], wk);
    expect(r.state).toBe("ok");
    expect(r.detail).toMatch(/different end date/);
    expect(allTimeFromGrid([["10/04/2026 - 10/10/2026", "$5.00"]], wk).state).toBe("ok");
  });
  it("monthly range uses the data month", () => {
    const m = cycleView("cprom", fromPht(2026, 10, 7, 9)).active; // September
    expect(m.rangeText).toBe("09/01/2026-09/30/2026");
    expect(allTimeFromGrid([["09/01/2026-09/30/2026", "$5,226.20"]], m).state).toBe("ok");
  });
});

describe("auto-check parsers", () => {
  // Layout of the real 'CPRO Ad Spend' first tab: row1 = years, row2 = months, then campaign rows
  const grid = [
    ["", "2026", "2026", "2026", "2026", "2026"],
    ["", "Dec", "Nov", "Oct", "Sept", "Aug"],
    ["Amazon - E1", "$0.00", "$0.00", "$0.00", "$0.00", "$927.14"],
  ];
  it("Aug 2026 is filled", () => expect(adSpendFromGrid(grid, 2026, 8)).toMatchObject({ state: "ok" }));
  it("Sept 2026 ('Sept' label) is still $0.00 → not done", () => expect(adSpendFromGrid(grid, 2026, 9)).toMatchObject({ state: "no" }));
  it("missing column → unknown", () => expect(adSpendFromGrid(grid, 2027, 1).state).toBe("unknown"));
  it("latestDateIn handles M/D/YYYY and ISO, ignores text", () => {
    const d = latestDateIn([["Settled date"], ["3/26/2025"], ["9/4/2026"], ["2026-08-30"], [""]]);
    expect(new Date(d!).toISOString().slice(0, 10)).toBe("2026-09-04");
    expect(latestDateIn([["x"]])).toBeNull();
  });
});

describe("entity colours", () => {
  it("FTA and Toast Recon use the portal's Ruby's colour; CPRO reports use the sidebar CurcuminPRO amber", async () => {
    const { ENTITY_COLORS } = await import("../../src/utils/entityColors");
    for (const id of ["fta", "toast"] as const) {
      expect(reportById(id).accent).toBe(ENTITY_COLORS["Ruby's"].hex);
      expect(reportById(id).entity).toMatchObject({ label: "Ruby's", hex: ENTITY_COLORS["Ruby's"].hex });
    }
    for (const id of ["cprow", "cprom"] as const) {
      expect(reportById(id).accent).toBe("#f59e0b");
      expect(reportById(id).entity.label).toBe("CPRO");
    }
  });
});

describe("history (from the Checks tab only)", () => {
  const rows = (o: Record<string, [boolean, string]>) =>
    Object.fromEntries(Object.entries(o).map(([k, [done, at]]) => [k, { done, at, by: "x", evidence: "" }]));

  it("lists past runs since June 2026, newest first, skips the active run, and shows 'none' where nothing was ever recorded", () => {
    const h = historyRows(THU_OCT1, {});
    const fta = h.filter(x => x.reportId === "fta");
    expect(fta.length).toBe(17);                            // Mondays Jun 1 … Sep 21
    expect(fta[0].periodKey).toBe("fta:2026-09-21");       // active is 09-28 → history starts the week before
    expect(fta[fta.length - 1].periodKey).toBe("fta:2026-06-01");
    expect(fta.every(x => x.status === "none" && x.done === 0)).toBe(true);
    expect(h.filter(x => x.reportId === "cprom").map(x => x.periodKey)).toEqual(["cprom:2026-07", "cprom:2026-06"]); // active = August; nothing before June data
    expect(h.filter(x => x.reportId === "toast").map(x => x.periodKey)).toEqual(["toast:2026-07", "toast:2026-06"]);
    expect(h.filter(x => x.reportId === "cprow").at(-1)!.periodKey).toBe("cprow:2026-06-01");
    expect(h.some(x => x.periodKey === "fta:2026-09-28")).toBe(false);
    expect(h.some(x => x.periodKey === "fta:2026-05-25")).toBe(false);   // before tracking start
  });

  it("a run marked with the skip step is 'skipped' (no report due), and weekly runs group under the month their week starts in", () => {
    const at = "2026-10-01T17:20:00.000Z";
    const h = historyRows(THU_OCT1, rows({ "fta:2026-08-24|skip": [true, at], "fta:2026-08-17|skip": [false, at] }));
    expect(h.find(x => x.periodKey === "fta:2026-08-24")).toMatchObject({ status: "skipped", lastAt: at });
    expect(h.find(x => x.periodKey === "fta:2026-08-17")!.status).toBe("none");   // an undone skip does not count
    expect(h.find(x => x.periodKey === "fta:2026-08-31")).toMatchObject({ groupKey: "2026-08", groupLabel: "August 2026" });
    expect(h.find(x => x.periodKey === "fta:2026-09-07")).toMatchObject({ groupKey: "2026-09", groupLabel: "September 2026" });
    // CPRO weekly run on Mon Sep 7 covers Sun Aug 30 – Sat Sep 5 → grouped under August (where its label starts)
    expect(h.find(x => x.periodKey === "cprow:2026-09-07")).toMatchObject({ groupKey: "2026-08", groupLabel: "August 2026" });
    expect(h.find(x => x.reportId === "cprom")!.groupKey).toBe("");           // monthly reports are not grouped
  });

  it("counts manual ticks and remembered auto-confirmations; done only when every step is recorded", () => {
    const at = "2026-09-23T12:00:00.000Z";
    const checks: Record<string, any> = rows({
      // CPRO weekly run of Sep 21 (period cprow:2026-09-21): all 5 steps recorded
      "cprow:2026-09-21|auto:run": [true, at], "cprow:2026-09-21|auto:alltime": [true, at],
      "cprow:2026-09-21|sheet": [true, at], "cprow:2026-09-21|dashboard": [true, at], "cprow:2026-09-21|tonie": [true, at],
      // FTA week of Sep 21: only 2 of 7
      "fta:2026-09-21|auto:run": [true, at], "fta:2026-09-21|monica": [true, "2026-09-22T12:00:00.000Z"],
      // an unticked row must not count
      "fta:2026-09-14|monica": [false, at],
    });
    const h = historyRows(THU_OCT1, checks);
    const cp = h.find(x => x.periodKey === "cprow:2026-09-21")!;
    expect(cp).toMatchObject({ status: "done", done: 5, total: 5, lastAt: at });
    const f = h.find(x => x.periodKey === "fta:2026-09-21")!;
    expect(f).toMatchObject({ status: "partial", done: 2, total: 7, lastAt: at }); // newest of the two rows (auto:run is later than the monica tick)
    expect(h.find(x => x.periodKey === "fta:2026-09-14")!.status).toBe("none");
  });
});

describe("calendar plan", () => {
  it("produces PHT dates and the CPRO monthly deadline", () => {
    const ev = plannedCalendarEvents(THU_OCT1);
    expect(ev.some(e => e.title.includes("FTA Weekly") && e.date === "2026-10-06" && e.time === "17:00")).toBe(true);
    expect(ev.some(e => e.title.includes("CPRO Weekly") && e.date === "2026-10-05")).toBe(true);
    expect(ev.some(e => e.title.includes("CPRO Monthly") && e.title.includes("deadline") && e.date === "2026-10-06")).toBe(true);
    expect(ev.some(e => e.title.includes("Toast Recon") && e.date === "2026-10-04")).toBe(true);
    // no duplicates by title+date (the page de-dupes on that key)
    const keys = ev.map(e => `${e.title}|${e.date}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("weekend shift (monthly reports)", () => {
  const cyc = (id: "cprom" | "toast", key: string) => cyclesAround(id, Date.UTC(2026, 9, 2, 12)).find(c => c.periodKey === key)!;
  it("Oct 2026: 3rd (Sat) and 4th (Sun) move to Monday; not overdue or due on the weekend", () => {
    const cm = cyc("cprom", "cprom:2026-09"), tr = cyc("toast", "toast:2026-09");
    expect(weekendShift(cm)!.note).toMatch(/weekend/i);
    expect(weekendShift(tr)!.note).toMatch(/Mon Oct 5/);
    const sat = fromPht(2026, 10, 3, 18);
    expect(cycleStatus(reportById("cprom"), cm, stepStates(reportById("cprom"), cm, undefined, {}), sat)).toBe("upcoming");
    const sun = fromPht(2026, 10, 4, 12);
    expect(cycleStatus(reportById("toast"), tr, stepStates(reportById("toast"), tr, undefined, {}), sun)).toBe("upcoming");
  });
  it("no shift on a weekday cycle", () => {
    const c = cyclesAround("toast", Date.UTC(2026, 10, 5, 12)).find(x => x.periodKey === "toast:2026-10")!;
    expect(weekendShift(c)).toBeNull(); // Nov 4 Wed, Nov 5 Thu
  });
});

describe("Amazon monthly tab matching (hand-typed tab names)", () => {
  const sep = cyclesAround("cprom", Date.UTC(2026, 9, 5, 12)).find(c => c.periodKey === "cprom:2026-09")!;
  it("accepts spacing/abbreviation variants, rejects other months", () => {
    for (const ok of ["SEPTEMBER 1-30,2026", "SEPTEMBER 1-30, 2026", "september 1-30 2026", "SEP 1-30,2026"]) expect(amazonTabMatches(ok, sep)).toBe(true);
    for (const no of ["AUGUST 1-31,2026", "SEPTEMBER 1-30,2025", "09/27-10/03", "SEPTEMBER 1-29,2026"]) expect(amazonTabMatches(no, sep)).toBe(false);
  });
});

describe("Tebra Claims Report (manual, MSDx)", () => {
  const WED_10AM = fromPht(2026, 10, 14, 10); // Wed Oct 14, 10 AM PHT
  const rep = reportById("tebra");
  it("cycle: opens Tue 11:30 PM PHT, due Wed 8 PM PHT, keyed by the Wednesday", () => {
    const c = cycleView("tebra", WED_10AM).active;
    expect(c.periodKey).toBe("tebra:2026-10-14");
    expect(c.label).toBe("Due Wed Oct 14");
    expect(c.windowStart).toBe(fromPht(2026, 10, 13, 23, 30));
    expect(c.deadline).toBe(fromPht(2026, 10, 14, 20, 0));
    expect(c.nextStart).toBe(fromPht(2026, 10, 20, 23, 30));
    expect(rep.steps.map(s => s.key)).toEqual(["download", "upload", "check", "lutang", "final"]);
  });
  it("status: due before 8 PM Wed, Overdue after if anything is open (even with nothing ticked), Done when all ticked", () => {
    const c = cycleView("tebra", WED_10AM).active;
    const none = stepStates(rep, c, undefined, {});
    expect(cycleStatus(rep, c, none, WED_10AM)).toBe("due");
    expect(cycleStatus(rep, c, none, fromPht(2026, 10, 14, 21))).toBe("overdue");
    const k = (s: string) => `${c.periodKey}|${s}`;
    const all = stepStates(rep, c, undefined, Object.fromEntries(rep.steps.map(s => [k(s.key), true])));
    expect(cycleStatus(rep, c, all, fromPht(2026, 10, 14, 21))).toBe("done");
    expect(cycleStatus(rep, c, none, fromPht(2026, 10, 13, 12))).not.toBe("overdue"); // the previous run is still the active card until Tue 11:30 PM
  });
  it("upload: counted from the dashboard Change Log timestamps of this week; a person's tick also counts; an untick wins over the check", () => {
    const c = cycleView("tebra", WED_10AM).active;
    expect(uploadFromChangeLog([["2026-10-07 04:55:44"], ["2026-10-14 03:03:35"]], c).state).toBe("ok");
    expect(uploadFromChangeLog([["2026-10-07 04:55:44"]], c).state).toBe("no");
    expect(uploadFromChangeLog([["2026-10-21 03:00:00"]], c).state).toBe("no"); // next week's cycle
    const k = `${c.periodKey}|upload`;
    expect(stepStates(rep, c, { upload: { state: "ok" } }, {}).upload).toBe("done");
    expect(stepStates(rep, c, { upload: { state: "no" } }, { [k]: true }).upload).toBe("done");
    expect(stepStates(rep, c, { upload: { state: "ok" } }, { [k]: false }, new Set([k])).upload).toBe("open");
  });
});

describe("reminder pop-up items", () => {
  it("lists open runs with their pending steps, overdue first; leaves out runs that have not opened or are skipped", () => {
    const now = fromPht(2026, 10, 14, 21); // Wed Oct 14, 9 PM PHT: Tebra is past its 8 PM deadline
    const items = reminderItems(now, {});
    const tebra = items.find(i => i.rep.id === "tebra");
    expect(tebra?.status).toBe("overdue");
    expect(tebra?.pending).toHaveLength(5);
    expect(items[0].status).toBe("overdue");
    // a skipped FTA week is left out
    const fta = cycleView("fta", now).active;
    const skipped = reminderItems(now, { [`${fta.periodKey}|skip`]: { done: true, at: "", by: "x", evidence: "" } });
    expect(skipped.find(i => i.rep.id === "fta")).toBeUndefined();
  });
  it("a finished Tebra run is not listed; auto steps that could not be read are not listed as pending", () => {
    const now = fromPht(2026, 10, 14, 12);
    const c = cycleView("tebra", now).active;
    const done: Record<string, any> = {};
    for (const s of reportById("tebra").steps) done[`${c.periodKey}|${s.key}`] = { done: true, at: "", by: "x", evidence: "" };
    expect(reminderItems(now, done).find(i => i.rep.id === "tebra")).toBeUndefined();
    const cpro = cycleView("cprow", fromPht(2026, 10, 12, 18)).active; // Mon 6 PM, window open, no auto results read
    const it = reminderItems(fromPht(2026, 10, 12, 18), {}).find(i => i.rep.id === "cprow");
    expect(it?.cycle.periodKey).toBe(cpro.periodKey);
    expect(it?.pending.map(s => s.key)).toEqual(["sheet", "dashboard", "tonie"]); // run + alltime unknown (not read), so not listed
  });
});
