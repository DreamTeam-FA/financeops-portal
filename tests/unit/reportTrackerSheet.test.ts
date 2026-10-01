/**
 * Report Tracker — sheet write-through tests against a simulated Google Sheets API.
 * Proves: tabs are created/renamed idempotently, a checkbox write lands in the Checks tab (updated in
 * place on re-toggle, never duplicated), tasks soft-delete, the audit Log is appended, and API
 * failures surface as TrackerApiError (so the page can undo + toast).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ID = "1Olhac_V3mrzDVL7GFs4E3DN5uwscVR91g26zMFILml0";

type Tab = { title: string; sheetId: number; rows: any[][] };
let tabs: Tab[];
let calls: { method: string; url: string }[];
let failWrites = 0; // status to fail writes with (0 = ok)

function colIdx(a: string) { return a.charCodeAt(0) - 65; }
function parseRange(r: string) { // "Tab!A2:E" | "Tab!A:E" | "Tab!A1" | "'Sheet1'!A1"
  const [name, rest] = r.split("!");
  const m = /^([A-Z])(\d+)?(?::([A-Z])(\d+)?)?$/.exec(rest)!;
  return { name: name.replace(/^'|'$/g, ""), c1: colIdx(m[1]), r1: m[2] ? +m[2] : 1, c2: m[3] ? colIdx(m[3]) : colIdx(m[1]), r2: m[4] ? +m[4] : Infinity };
}

function installFetch() {
  (globalThis as any).fetch = vi.fn(async (input: any, init?: any) => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();
    calls.push({ method, url });
    const json = (body: any, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (method !== "GET" && failWrites) return json({ error: { message: "The caller does not have permission" } }, failWrites);

    const base = `https://sheets.googleapis.com/v4/spreadsheets/${ID}`;
    if (url.startsWith(base + "?fields=")) return json({ sheets: tabs.map(t => ({ properties: { title: t.title, sheetId: t.sheetId } })) });
    if (url === base + ":batchUpdate") {
      for (const rq of JSON.parse(init.body).requests) {
        if (rq.addSheet) tabs.push({ title: rq.addSheet.properties.title, sheetId: 100 + tabs.length, rows: [] });
        if (rq.updateSheetProperties) tabs.find(t => t.sheetId === rq.updateSheetProperties.properties.sheetId)!.title = rq.updateSheetProperties.properties.title;
      }
      return json({});
    }
    if (url.startsWith(base + "/values:batchGet?")) {
      const ranges = [...new URL(url).searchParams.getAll("ranges")];
      return json({ valueRanges: ranges.map(rg => {
        const p = parseRange(rg); const tab = tabs.find(t => t.title === p.name)!;
        const out: any[][] = [];
        for (let r = p.r1; r <= Math.min(p.r2, tab.rows.length); r++) out.push((tab.rows[r - 1] || []).slice(p.c1, p.c2 + 1).map(v => (typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v))));
        return { range: rg, values: out };
      }) });
    }
    const vm = url.startsWith(base + "/values/") ? decodeURIComponent(url.slice((base + "/values/").length)) : null;
    if (vm) {
      const isAppend = vm.includes(":append");
      const range = vm.split("?")[0].replace(":append", "");
      const p = parseRange(range);
      const tab = tabs.find(t => t.title === p.name);
      if (!tab) return json({ error: { message: `Unable to parse range: ${range}` } }, 400);
      if (method === "GET") {
        const out: any[][] = [];
        for (let r = p.r1; r <= Math.min(p.r2, tab.rows.length); r++) {
          const row = (tab.rows[r - 1] || []).slice(p.c1, p.c2 + 1);
          while (row.length && (row[row.length - 1] === "" || row[row.length - 1] == null)) row.pop();
          out.push(row.map(v => (typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v))));
        }
        while (out.length && out[out.length - 1].length === 0) out.pop();
        return json(out.length ? { values: out } : {});
      }
      const values: any[][] = JSON.parse(init.body).values;
      if (isAppend) { for (const v of values) tab.rows.push(v); return json({}); }
      values.forEach((v, i) => {
        const idx = p.r1 - 1 + i;
        const cur = tab.rows[idx] ? [...tab.rows[idx]] : [];
        v.forEach((cell: any, j: number) => { cur[p.c1 + j] = cell; });
        tab.rows[idx] = cur;
      });
      return json({});
    }
    return json({ error: { message: "unexpected url " + url } }, 500);
  });
}

async function freshService() {
  vi.resetModules(); // module-level `ensured` flag must start false each test
  return await import("../../src/services/reportTrackerService");
}

beforeEach(() => {
  failWrites = 0;
  calls = [];
  // The sheet as created by the setup: one CSV-imported tab with just the Checks header
  tabs = [{ title: "Sheet1", sheetId: 0, rows: [["period_key", "step_key", "done", "updated_at", "updated_by"]] }];
  installFetch();
});

describe("tracker sheet write-through", () => {
  it("renames the imported tab to Checks and adds Tasks + Log with headers (idempotent)", async () => {
    const svc = await freshService();
    await svc.ensureTrackerTabs("tok");
    expect(tabs.map(t => t.title)).toEqual(["Checks", "Tasks", "Log"]);
    expect(tabs[1].rows[0]).toEqual(["id", "title", "due", "done", "notes", "deleted", "updated_at", "updated_by"]);
    expect(tabs[2].rows[0]).toEqual(["timestamp", "user", "period_key", "step_key", "done"]);
    const before = JSON.stringify(tabs);
    const svc2 = await freshService(); // a second page load
    await svc2.ensureTrackerTabs("tok");
    expect(JSON.stringify(tabs)).toBe(before);
  });

  it("a checkbox write lands in the Checks tab, re-toggling updates the SAME row, and every change is logged", async () => {
    const svc = await freshService();
    await svc.writeCheck("tok", "cprow:2026-09-28", "tonie", true, "finances@marktimm.com");
    let checks = await svc.readChecks("tok");
    expect(checks["cprow:2026-09-28|tonie"]).toMatchObject({ done: true, by: "finances@marktimm.com" });
    expect(tabs[0].rows).toHaveLength(2); // header + 1

    await svc.writeCheck("tok", "cprow:2026-09-28", "tonie", false, "finances@marktimm.com");
    await svc.writeCheck("tok", "cprow:2026-09-28", "dashboard", true, "finances@marktimm.com");
    checks = await svc.readChecks("tok");
    expect(checks["cprow:2026-09-28|tonie"].done).toBe(false);
    expect(checks["cprow:2026-09-28|dashboard"].done).toBe(true);
    expect(tabs[0].rows).toHaveLength(3); // no duplicate row for tonie
    await new Promise(r => setTimeout(r, 10)); // log append is fire-and-forget
    expect(tabs[2].rows.slice(1).map(r => `${r[3]}:${r[4]}`)).toEqual(["tonie:true", "tonie:false", "dashboard:true"]);
  });

  it("tasks: add, edit, complete, soft-delete (row kept for audit), and readTasks hides deleted", async () => {
    const svc = await freshService();
    const t = { id: svc.newTaskId(), title: "Send Tonie the weekly link", due: "2026-10-05", done: false, notes: "" };
    await svc.writeTask("tok", t, "me@x.com");
    await svc.writeTask("tok", { ...t, done: true }, "me@x.com");
    expect((await svc.readTasks("tok"))[0]).toMatchObject({ title: "Send Tonie the weekly link", due: "2026-10-05", done: true });
    expect(tabs[1].rows).toHaveLength(2);
    await svc.writeTask("tok", t, "me@x.com", true);
    expect(await svc.readTasks("tok")).toEqual([]);
    expect(tabs[1].rows[1][5]).toBe(true); // still in the sheet, flagged deleted
  });

  it("a rejected write throws TrackerApiError with the HTTP status so the page can undo + toast", async () => {
    const svc = await freshService();
    await svc.ensureTrackerTabs("tok");
    failWrites = 403;
    await expect(svc.writeCheck("tok", "fta:2026-09-28", "monica", true, "me@x.com")).rejects.toMatchObject({ name: "Error", status: 403 });
    expect(tabs[0].rows).toHaveLength(1); // nothing was written
    failWrites = 401;
    await expect(svc.writeTask("tok", { id: "t-1", title: "x", due: "", done: false, notes: "" }, "me@x.com")).rejects.toMatchObject({ status: 401 });
  });

  it("never writes to the report sheets: the tracker sheet is the only write target", async () => {
    const svc = await freshService();
    await svc.writeCheck("tok", "toast:2026-09", "micah", true, "me@x.com");
    const writes = calls.filter(c => c.method !== "GET");
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w.url).toContain(ID);
  });
});

describe("slack-check evidence (column F)", () => {
  it("adds the evidence header to an existing 5-column Checks tab, once", async () => {
    const svc = await freshService();
    await svc.ensureTrackerTabs("tok");
    expect(tabs[0].title).toBe("Checks");
    expect(tabs[0].rows[0]).toEqual(["period_key", "step_key", "done", "updated_at", "updated_by", "evidence"]);
  });

  it("reads slack-check rows with their evidence and classifies them", async () => {
    const svc = await freshService();
    await svc.ensureTrackerTabs("tok");
    tabs[0].rows.push(
      ["fta:2026-09-28", "monica", true, "2026-09-29T11:00:00Z", "slack-check", "FOUND: Norlan → Monica (Team Lutang), image attached, Tue Sep 29 6:05 PM PHT"],
      ["fta:2026-09-28", "checked", false, "2026-09-29T11:00:00Z", "slack-check", "REVIEW: Invoice received: USU 2026.0022.pdf from Monica, Tue Sep 29 6:09 PM"],
      ["cprow:2026-09-28", "tonie", false, "2026-09-29T15:00:00Z", "slack-check", "UNCLEAR: no message in window"],
      ["toast:2026-08", "micah", true, "2026-09-05T15:00:00Z", "me@x.com", "FOUND: typed by a human, not the job"],
    );
    const d = await svc.readTrackerData("tok");
    expect(svc.evidenceKind(d.checks["fta:2026-09-28|monica"])).toBe("found");
    expect(svc.evidenceKind(d.checks["fta:2026-09-28|checked"])).toBe("review");
    expect(svc.evidenceKind(d.checks["cprow:2026-09-28|tonie"])).toBe("unclear");
    expect(svc.evidenceKind(d.checks["toast:2026-08|micah"])).toBeNull(); // only slack-check rows count as auto-found
    expect(svc.evidenceText(d.checks["fta:2026-09-28|monica"])).toBe("Norlan → Monica (Team Lutang), image attached, Tue Sep 29 6:05 PM PHT");
    // an auto-found tick counts as done for status purposes, like any manual tick
    expect(d.checks["fta:2026-09-28|monica"].done).toBe(true);
  });

  it("a human untick replaces the slack-check row in place and clears its evidence — the job must not re-tick it", async () => {
    const svc = await freshService();
    await svc.ensureTrackerTabs("tok");
    tabs[0].rows.push(["fta:2026-09-28", "monica", true, "2026-09-29T11:00:00Z", "slack-check", "FOUND: Norlan → Monica, image attached"]);
    await svc.writeCheck("tok", "fta:2026-09-28", "monica", false, "accounting@marktimm.com");
    const row = tabs[0].rows[1];
    expect(tabs[0].rows).toHaveLength(2);                 // same row, not a duplicate
    expect(row[2]).toBe(false);
    expect(row[4]).toBe("accounting@marktimm.com");       // human now owns the row
    expect(row[5]).toBe("");                              // evidence cleared
    const d = await svc.readTrackerData("tok");
    expect(svc.evidenceKind(d.checks["fta:2026-09-28|monica"])).toBeNull();
  });
});

describe("auto-confirmations", () => {
  it("are appended as auto:<step> rows in ONE write, read back, and never count as manual tracking", async () => {
    const svc = await freshService();
    await svc.ensureTrackerTabs("tok");
    calls = [];
    await svc.writeAutoConfirmations("tok", [{ periodKey: "fta:2026-09-28", step: "run" }, { periodKey: "fta:2026-09-28", step: "invoice" }]);
    expect(calls.filter(c => c.method !== "GET")).toHaveLength(1); // one batched append
    const d = await svc.readTrackerData("tok");
    expect(d.checks["fta:2026-09-28|auto:run"]).toMatchObject({ done: true, by: "auto-check" });
    expect(d.checks["fta:2026-09-28|auto:invoice"].done).toBe(true);
    expect(svc.trackedPeriods(d.checks).size).toBe(0);
    expect(tabs[0].rows).toHaveLength(3); // header + 2
    for (const c of calls.filter(x => x.method !== "GET")) expect(c.url).toContain(ID); // tracker sheet only
  });
  it("writing nothing is free", async () => {
    const svc = await freshService();
    calls = [];
    await svc.writeAutoConfirmations("tok", []);
    expect(calls).toHaveLength(0);
  });
});

describe("quota-friendly reads", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("readTrackerData fetches Checks + Tasks in ONE read; ensure costs one read on later loads", async () => {
    const svc = await freshService();
    await svc.writeCheck("tok", "fta:2026-09-28", "monica", true, "me@x.com");
    await svc.writeTask("tok", { id: "t-9", title: "Call Tonie", due: "", done: false, notes: "" }, "me@x.com");
    calls = [];
    const svc2 = await freshService(); // fresh page load
    const d = await svc2.readTrackerData("tok");
    expect(d.checks["fta:2026-09-28|monica"].done).toBe(true);
    expect(d.tasks.map(t => t.title)).toEqual(["Call Tonie"]);
    const reads = calls.filter(c => c.method === "GET");
    // First open of a browser session: tab list + one-time evidence-header check + ONE batchGet (not 14)
    expect(reads).toHaveLength(3);
    expect(reads[reads.length - 1].url).toContain("values:batchGet");
  });

  it("once confirmed in this browser session, opening the page costs exactly ONE read", async () => {
    await (await freshService()).ensureTrackerTabs("tok"); // tabs exist (a previous page load created them)
    const store: Record<string, string> = { report_tracker_tabs_ok_v1: "1" };
    (globalThis as any).sessionStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    try {
      const svc = await freshService();
      await svc.ensureTrackerTabs("tok");
      calls = [];
      await svc.readTrackerData("tok");
      const reads = calls.filter(c => c.method === "GET");
      expect(reads).toHaveLength(1);
      expect(reads[0].url).toContain("values:batchGet");
    } finally { delete (globalThis as any).sessionStorage; }
  });

  it("retries a 429 (per-minute quota) with backoff and then succeeds", async () => {
    vi.useFakeTimers();
    const svc = await freshService();
    await svc.ensureTrackerTabs("tok");
    const real = (globalThis as any).fetch;
    let hits = 0;
    (globalThis as any).fetch = vi.fn(async (u: any, i: any) => {
      if (String(u).includes("values:batchGet") && hits++ < 2) return { ok: false, status: 429, json: async () => ({ error: { message: "Quota exceeded" } }) };
      return real(u, i);
    });
    const p = svc.readTrackerData("tok");
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(p).resolves.toMatchObject({ tasks: [] });
    expect(hits).toBe(3);
  });

  it("gives up after the retries and reports status 429", async () => {
    vi.useFakeTimers();
    const svc = await freshService();
    await svc.ensureTrackerTabs("tok");
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "Quota exceeded" } }) }));
    const p = svc.readTrackerData("tok").catch(e => e);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await p).toMatchObject({ status: 429 });
  });

  it("carry-over only for recent cycles you already started tracking", async () => {
    const svc = await freshService();
    const now = Date.UTC(2026, 9, 1, 7, 10);
    const prev = svc.cycleView("cprow", now).previous!;
    expect(svc.shouldCarryOver(prev, new Set(), now)).toBe(false);                    // never tracked → no nagging about old weeks
    expect(svc.shouldCarryOver(prev, new Set([prev.periodKey]), now)).toBe(true);     // tracked + recent
    expect(svc.shouldCarryOver(prev, new Set([prev.periodKey]), now + 30 * 86_400_000)).toBe(false); // too old
  });
});
