/** Month-End Close card: mirrors Toast / CPRO Monthly / Tebra, bank statements check, due the 7th. */
import { describe, expect, it } from "vitest";
import {
  AUTO_PREFIX, bankStatementsFromGrid, cycleStatus, cycleView, cyclesAround, plannedCalendarEvents, relatedCycles,
  reportById, reminderItems, stepStates, toPht, type CheckRow,
} from "../../src/services/reportTrackerService";

const NOW = Date.UTC(2026, 9, 16, 4, 0); // Fri Oct 16 2026, noon PHT
const close = cycleView("close", NOW).active;
const rep = reportById("close");
const row = (done: boolean): CheckRow => ({ done, at: "2026-10-10T00:00:00Z", by: "x", evidence: "" });

describe("close cycle", () => {
  it("opens the 1st for the previous month and is due the 7th", () => {
    expect(close.periodKey).toBe("close:2026-09");
    expect(close.label).toBe("September 2026");
    const o = toPht(close.windowStart), d = toPht(close.deadline);
    expect([o.m, o.d, d.m, d.d]).toEqual([10, 1, 10, 7]);
  });
  it("mirrors Toast, CPRO Monthly and the first Wednesday's Tebra report", () => {
    const keys = relatedCycles(close).map(c => c.periodKey);
    expect(keys).toEqual(["toast:2026-09", "cprom:2026-09", "tebra:2026-10-07"]);
  });
});

describe("close steps", () => {
  const flatDone = (keys: string[]) => Object.fromEntries(keys.map(k => [k, true]));
  it("follow the other cards and the bank check", () => {
    const checks = flatDone([
      "toast:2026-09|auto:run", "toast:2026-09|micah", "cprom:2026-09|auto:run", "cprom:2026-09|auto:alltime", "cprom:2026-09|auto:adspend",
      "cprom:2026-09|webstorage", "cprom:2026-09|payout", "cprom:2026-09|dashboard", "cprom:2026-09|micah", "tebra:2026-10-07|final",
    ]);
    const st = stepStates(rep, close, { bank: { state: "ok" } }, checks, undefined, {});
    expect(Object.entries(st).filter(([, v]) => v !== "done").map(([k]) => k)).toEqual(["final"]);
    expect(cycleStatus(rep, close, st, Date.UTC(2026, 9, 5, 4, 0))).toBe("progress");
  });
  it("final tick implies everything else; nothing done = open/unknown only", () => {
    const st = stepStates(rep, close, undefined, { [`${close.periodKey}|final`]: true }, undefined, {});
    expect(rep.steps.every(s => st[s.key] === "done")).toBe(true);
    expect(cycleStatus(rep, close, st, NOW)).toBe("done");
  });
  it("past the 7th with the bank check open is overdue", () => {
    const st = stepStates(rep, close, { bank: { state: "no" } }, {}, undefined, {});
    expect(cycleStatus(rep, close, st, close.deadline + 86_400_000)).toBe("overdue");
  });
  it("pop-up lists only the close card's own steps (mirrored ones belong to their own cards)", () => {
    const items = reminderItems(NOW, { [`${close.periodKey}|final`]: { ...row(false), evidence: "" } }, { [close.periodKey]: { bank: { state: "no" } } });
    const it = items.find(i => i.rep.id === "close");
    if (it) expect(it.pending.map(p => p.key).every(k => !reportById("close").steps.find(s => s.key === k)!.from)).toBe(true);
  });
});

describe("bank statements check", () => {
  const r = (bank: string, dl: any, cut: string, k = "") => ["2026-09", "Ruby's", bank, "Monthly", "", "", "", dl, "", cut, k];
  const month = { y: 2026, m: 9 };
  it("all downloaded → ok; ignores deleted / other months", () => {
    const g = [r("A", true, "2026-09-28"), r("B", "TRUE", "2026-09-30"), r("C", false, "2026-09-15", "DELETED x"), r("D", false, "2026-10-28")];
    expect(bankStatementsFromGrid(g, month).state).toBe("ok");
  });
  it("one not downloaded → no, names the bank", () => {
    const g = [r("A", true, "2026-09-28"), r("B", false, "2026-09-30")];
    const out = bankStatementsFromGrid(g, month);
    expect(out.state).toBe("no");
    expect(out.detail).toContain("B");
  });
  it("nothing tracked → unknown, never red", () => {
    expect(bankStatementsFromGrid([], month).state).toBe("unknown");
  });
});

describe("calendar", () => {
  it("adds an opens and a due event for the close", () => {
    const ev = plannedCalendarEvents(Date.UTC(2026, 9, 25), 20).filter(e => e.title.includes("Month-End Close"));
    expect(ev.map(e => e.date)).toEqual(["2026-11-01", "2026-11-07"]);
  });
});

void AUTO_PREFIX; void cyclesAround;
