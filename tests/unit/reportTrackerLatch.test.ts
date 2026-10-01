/**
 * Report Tracker — "remember what's confirmed" tests.
 * Proves: confirmed auto steps are never re-read, a fully-confirmed report costs zero reads,
 * a failed read is "unknown" (never red), failures are classified, and confirmations are written
 * only to the tracker sheet.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_PREFIX, TrackerApiError, cycleStatus, cycleView, latchedAutoKeys, pendingAutoSteps, reasonFor, reportById, runAutoChecks,
  stepStates, trackedPeriods, type Cycle,
} from "../../src/services/reportTrackerService";

const NOW = Date.UTC(2026, 9, 1, 7, 10); // Thu Oct 1, 2026 3:10 PM PHT
const fta = cycleView("fta", NOW).active;        // week of Mon Sep 28
const cprow = cycleView("cprow", NOW).active;    // Sep 20–26
const toast = cycleView("toast", NOW).active;    // August

let urls: string[];
let mode: "ok" | "busy" | "forbidden";
function installFetch() {
  (globalThis as any).fetch = vi.fn(async (input: any) => {
    const url = String(input);
    urls.push(url);
    const json = (body: any, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (mode === "busy") return json({ error: { message: "Quota exceeded" } }, 503);
    if (mode === "forbidden") return json({ error: { message: "The caller does not have permission" } }, 403);
    if (url.includes("fields=sheets.properties")) {
      // FTA sheet and Amazon Sales Report tab lists
      return json({ sheets: [{ properties: { title: "09/28/2026", sheetId: 1 } }, { properties: { title: "09/20-09/26", sheetId: 2 } }] });
    }
    if (url.includes("/drive/v3/files?")) return json({ files: [{ id: "f1", name: "USU 2026.0022.pdf", createdTime: new Date(fta.windowStart + 3_600_000).toISOString() }] });
    if (url.includes("/drive/v3/files/")) return json({ modifiedTime: new Date(cprow.windowStart + 600_000).toISOString() });
    if (url.includes("Toast%20Data")) return json({ values: [["Settled date"], ["8/30/2026"], ["9/2/2026"]] });
    return json({});
  });
}
beforeEach(() => { urls = []; mode = "ok"; installFetch(); });

describe("confirmed steps are remembered", () => {
  it("latchedAutoKeys reads auto: rows from the Checks tab", () => {
    const keys = latchedAutoKeys({ [`${fta.periodKey}|${AUTO_PREFIX}run`]: true, [`${fta.periodKey}|monica`]: true, [`${fta.periodKey}|${AUTO_PREFIX}invoice`]: false });
    expect([...keys]).toEqual([`${fta.periodKey}|run`]);
  });
  it("a confirmed auto step counts as done without any read result", () => {
    const rep = reportById("fta");
    const st = stepStates(rep, fta, undefined, { [`${fta.periodKey}|${AUTO_PREFIX}run`]: true });
    expect(st.run).toBe("done");
    expect(st.invoice).toBe("unknown");
  });
  it("trackedPeriods ignores auto-confirmations and unticked rows (only real manual ticks start tracking)", () => {
    const t = trackedPeriods({
      [`${cprow.periodKey}|${AUTO_PREFIX}run`]: { done: true, at: "", by: "auto-check", evidence: "" },
      [`${fta.periodKey}|monica`]: { done: false, at: "", by: "x", evidence: "" },
      [`${toast.periodKey}|micah`]: { done: true, at: "", by: "x", evidence: "" },
    });
    expect([...t]).toEqual([toast.periodKey]);
  });
});

describe("only the reads still needed are made", () => {
  it("everything confirmed → zero requests", async () => {
    const confirmed = new Set<string>();
    for (const c of [fta, cprow, toast]) for (const s of reportById(c.reportId).steps.filter(x => x.kind === "auto")) confirmed.add(`${c.periodKey}|${s.key}`);
    const out = await runAutoChecks("tok", [fta, cprow, toast], confirmed);
    expect(urls).toHaveLength(0);
    expect(out.byPeriod).toEqual({});
  });
  it("FTA with only the invoice still open → reads just the USU folder, not the FTA sheet", async () => {
    const confirmed = new Set([`${fta.periodKey}|run`]);
    const out = await runAutoChecks("tok", [fta], confirmed);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/drive/v3/files?");
    expect(out.byPeriod[fta.periodKey]).toEqual({ invoice: expect.objectContaining({ state: "ok", detail: "USU 2026.0022.pdf" }) });
    expect(out.byPeriod[fta.periodKey].run).toBeUndefined(); // skipped, not re-read
  });
  it("first run reads each needed source once, and results are 'ok' for the real data shape", async () => {
    const out = await runAutoChecks("tok", [fta, cprow, toast], new Set());
    expect(out.byPeriod[fta.periodKey]).toMatchObject({ run: { state: "ok" }, invoice: { state: "ok" } });
    expect(out.byPeriod[cprow.periodKey]).toMatchObject({ run: { state: "ok" }, alltime: { state: "ok" } });
    expect(out.byPeriod[toast.periodKey]).toMatchObject({ run: { state: "ok" } });
    expect(urls.length).toBeLessThanOrEqual(5); // fta tabs, amazon tabs, usu folder, all-time meta, toast column
  });
  it("pendingAutoSteps lists only unconfirmed auto steps", () => {
    const p = pendingAutoSteps([fta], new Set([`${fta.periodKey}|run`]));
    expect(p[0].steps).toEqual(["invoice"]);
  });
});

describe("a failed read is 'unknown', never red", () => {
  it("busy (503/429) → unknown with reason busy; status stays neutral", async () => {
    mode = "busy";
    vi.useFakeTimers(); // the service retries "busy" answers with 4s + 15s backoff before giving up
    const pending = runAutoChecks("tok", [fta], new Set());
    await vi.advanceTimersByTimeAsync(25_000);
    const out = await pending;
    vi.useRealTimers();
    const r = out.byPeriod[fta.periodKey];
    expect(r.run).toMatchObject({ state: "unknown", reason: "busy" });
    expect(r.invoice).toMatchObject({ state: "unknown", reason: "busy" });
    const rep = reportById("fta");
    const st = stepStates(rep, fta, r, {});
    expect(cycleStatus(rep, fta, st, fta.deadline + 86_400_000)).toBe("unknown"); // not "overdue"
  });
  it("a genuinely missing script output is still overdue", () => {
    const rep = reportById("fta");
    const st = stepStates(rep, fta, { run: { state: "no" }, invoice: { state: "no" } }, {});
    expect(cycleStatus(rep, fta, st, fta.deadline + 86_400_000)).toBe("overdue");
  });
  it("failure reasons are classified", () => {
    expect(reasonFor(new TrackerApiError("x", 429))).toBe("busy");
    expect(reasonFor(new TrackerApiError("x", 503))).toBe("busy");
    expect(reasonFor(new TrackerApiError("x", 0))).toBe("busy");
    expect(reasonFor(new TrackerApiError("x", 401))).toBe("auth");
    expect(reasonFor(new TrackerApiError("x", 403))).toBe("access");
    expect(reasonFor(new TrackerApiError("x", 404))).toBe("access");
    expect(reasonFor(new TrackerApiError("x", 400))).toBe("error");
  });
  it("forbidden file → unknown with reason access", async () => {
    mode = "forbidden";
    const out = await runAutoChecks("tok", [toast], new Set());
    expect(out.byPeriod[toast.periodKey].run).toMatchObject({ state: "unknown", reason: "access" });
  });
});

describe("auto-checks never write to the report sheets", () => {
  it("only GET requests are made while checking", async () => {
    await runAutoChecks("tok", [fta, cprow, toast], new Set());
    const calls = (globalThis as any).fetch.mock.calls as [any, any?][];
    for (const [, init] of calls) expect((init?.method || "GET").toUpperCase()).toBe("GET");
  });
});

// keep TypeScript happy about the unused import in some configs
export type _C = Cycle;
