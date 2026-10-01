import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, CalendarPlus, CheckCircle2, CheckSquare, Clock, ExternalLink,
  Plus, RefreshCw, Square, Trash2, ClipboardCheck, Table2, Info, X,
} from "lucide-react";
import { PageHeader } from "../PageHeader";
import { useFinance } from "../../context/FinanceContext";
import { getAccessToken } from "../../services/googleAuth";
import {
  REPORTS, TRACKER_SHEET_URL, TrackerApiError, cycleStatus, cycleView, fmtPht, fmtPhtDate, isoDate, newTaskId,
  evidenceKind, evidenceText, latchedAutoKeys, pendingAutoSteps, plannedCalendarEvents, readTrackerData, relative, runAutoChecks, shouldCarryOver, stepStates, toPht,
  trackedPeriods, writeAutoConfirmations, writeCheck, writeTask,
  type AutoByPeriod, type AutoResult, type CheckRow, type Confirmation, type Cycle, type ReportDef, type Status, type TaskItem,
} from "../../services/reportTrackerService";

const AUTO_REFRESH_MS = 10 * 60_000;          // background re-check cadence while the page is visible
const AUTO_CACHE_MS = 4 * 60_000;             // reuse auto-check results this long (navigating back and forth is free)
const FIRST_LOAD_DELAY_MS = 6_000;            // let the portal's own start-up sync finish before we read the report sheets
const BUSY_RETRY_MS = 60_000;                 // retry after Google says "busy"
const MAX_BUSY_RETRIES = 3;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const AUTO_CACHE_KEY = "report_tracker_auto_cache_v1";

type AutoCache = { at: number; keys: string; data: AutoByPeriod };
const readAutoCache = (keys: string): AutoCache | null => {
  try { const c = JSON.parse(sessionStorage.getItem(AUTO_CACHE_KEY) || "null") as AutoCache | null; return c && c.keys === keys ? c : null; } catch { return null; }
};
const writeAutoCache = (c: AutoCache) => { try { sessionStorage.setItem(AUTO_CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ } };

// ─── Status badge (same palette as Bank Statements "Done" / "Pending") ───────
const StatusBadge: React.FC<{ status: Status; isLight: boolean }> = ({ status, isLight }) => {
  const map: Record<Status, { cls: string; text: string }> = {
    done:     { cls: `bg-[#16a34a]/20 ${isLight ? "text-emerald-600" : "text-[#4ade80]"}`, text: "✓ Done" },
    progress: { cls: `bg-[#1a73e8]/20 ${isLight ? "text-blue-600" : "text-[#60a5fa]"}`, text: "In Progress" },
    due:      { cls: "bg-[#fb923c]/20 text-[#fb923c]", text: "Due" },
    overdue:  { cls: `bg-[#dc2626]/20 ${isLight ? "text-red-600" : "text-[#f87171]"}`, text: "Overdue" },
    upcoming: { cls: isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]", text: "Upcoming" },
    untracked: { cls: isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]", text: "Not tracked" },
    unknown:   { cls: isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]", text: "Can't tell" },
  };
  const m = map[status];
  return <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${m.cls}`}>{m.text}</span>;
};

export const ReportTrackerPage: React.FC = () => {
  const { theme, showToast, googleUser, userEmail, localCalendarEvents, addCalendarEvent, setCurrentPage } = useFinance();
  const isLight = theme === "light";

  const card = `${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl`;
  const kpiCard = `${card} p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`;
  const cardHead = `${isLight ? "bg-slate-50 border-slate-200" : "bg-[#0d1117] border-[#1a2235]"} border-b`;
  const muted = isLight ? "text-slate-500" : "text-[#888]";
  const strong = isLight ? "text-slate-900" : "text-white";
  const inputCls = `px-2.5 py-1 rounded-md text-xs font-semibold border focus:outline-none ${
    isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#0d111a] border-[#1a2235] text-white"
  }`;

  const [now, setNow] = useState(() => Date.now());
  const [checks, setChecks] = useState<Record<string, CheckRow>>({});
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [auto, setAuto] = useState<AutoByPeriod>({});
  const [autoAt, setAutoAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const loadSeq = useRef(0);
  const inFlight = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstLoad = useRef(true);
  const busyTries = useRef(0);
  const [busyAttempt, setBusyAttempt] = useState(0);

  const signedIn = !!googleUser && !!getAccessToken();

  // Clock tick (status/countdowns are PHT-time based)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Cycles shown on screen (active + previous), used for auto-checks
  const views = useMemo(() => REPORTS.map(r => ({ rep: r, view: cycleView(r.id, now) })), [now]);
  const watchedCycles = useMemo(() => {
    const out: Cycle[] = [];
    for (const { view } of views) { out.push(view.active); if (view.previous) out.push(view.previous); }
    return out;
  }, [views]);

  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const cyclesRef = useRef<Cycle[]>(watchedCycles);
  cyclesRef.current = watchedCycles;

  const reportError = useCallback((what: string, e: any) => {
    const showToast = showToastRef.current;
    const status = e instanceof TrackerApiError ? e.status : 0;
    if (status === 429) showToast("Google's per-minute read limit was hit (it is shared with the rest of the portal). Report Tracker will retry on its own in a minute — nothing was lost.", "info", 7000);
    else if (status === 401) showToast("⚠️ Token expired — reconnect Google Sheets before making changes.", "auth-error");
    else if (status === 403 || status === 404) showToast(`Couldn't ${what}: no access. Ask the sheet owner to add your Google account as an Editor.`, "error", 8000);
    else showToast(`Couldn't ${what}: ${e?.message || "network error"}`, "error", 8000);
  }, []);

  const loadAll = useCallback(async (opts?: { quiet?: boolean; force?: boolean; retry?: boolean }) => {
    const token = getAccessToken();
    if (!token || inFlight.current) return;
    inFlight.current = true;
    if (!opts?.retry) { busyTries.current = 0; setBusyAttempt(0); }
    const seq = ++loadSeq.current;
    setLoading(true);
    let quotaHit = false;
    let latest: Record<string, CheckRow> | null = null;
    try {
      // Tracker sheet is the source of truth for checks, tasks AND auto-confirmations (ONE read)
      const { checks: c, tasks: t } = await readTrackerData(token);
      setChecks(c); setTasks(t); latest = c;
    } catch (e: any) {
      if (e instanceof TrackerApiError && e.status === 429) quotaHit = true;
      reportError("read the Report Tracker sheet", e);
    }
    try {
      const flat: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(latest || {})) flat[k] = v.done;
      const confirmed = latchedAutoKeys(flat);
      const cycles = cyclesRef.current;
      const pending = pendingAutoSteps(cycles, confirmed);
      if (pending.length === 0) {
        setAutoAt(Date.now());           // everything already confirmed in the sheet: nothing to re-read
      } else if (latest && !quotaHit) {
        const keys = cycles.map(c => c.periodKey).join(",") + "|" + [...confirmed].sort().join(",");
        const cached = !opts?.force ? readAutoCache(keys) : null;
        if (cached && Date.now() - cached.at < AUTO_CACHE_MS) {
          setAuto(cached.data); setAutoAt(cached.at);
        } else {
          if (firstLoad.current) { firstLoad.current = false; await sleep(FIRST_LOAD_DELAY_MS); }
          const out = await runAutoChecks(token, cycles, confirmed);
          if (seq !== loadSeq.current) return;
          setAuto(prev => ({ ...prev, ...out.byPeriod }));
          setAutoAt(Date.now());
          // Remember every newly satisfied step in the tracker sheet so it is never re-read
          const fresh: Confirmation[] = [];
          let anyUnknown = false, anyBusy = false;
          for (const [periodKey, steps] of Object.entries(out.byPeriod)) {
            for (const [step, r] of Object.entries(steps) as [string, AutoResult][]) {
              if (r.state === "ok") fresh.push({ periodKey, step });
              if (r.state === "unknown") { anyUnknown = true; if (r.reason === "busy") anyBusy = true; }
            }
          }
          if (fresh.length) {
            try {
              await writeAutoConfirmations(token, fresh);
              const at = new Date().toISOString();
              setChecks(c => { const n = { ...c }; for (const f of fresh) n[`${f.periodKey}|auto:${f.step}`] = { done: true, at, by: "auto-check", evidence: "" }; return n; });
            } catch { /* best effort: it will simply be re-checked next time */ }
          }
          if (!anyUnknown) writeAutoCache({ at: Date.now(), keys, data: out.byPeriod });
          if (anyBusy && busyTries.current < MAX_BUSY_RETRIES) {
            busyTries.current += 1; setBusyAttempt(busyTries.current);
            if (retryTimer.current) clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(() => loadAll({ quiet: true, retry: true }), BUSY_RETRY_MS);
          } else if (anyBusy) {
            setBusyAttempt(MAX_BUSY_RETRIES + 1); // out of retries: show the "press Refresh" wording
          }
        }
      }
    } catch (e: any) {
      if (e instanceof TrackerApiError && e.status === 429) quotaHit = true;
      reportError("run the auto-checks", e);
    } finally {
      inFlight.current = false;
      if (seq === loadSeq.current) { setLoading(false); setLoadedOnce(true); }
      if (quotaHit) {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => loadAll({ quiet: true }), BUSY_RETRY_MS + 5_000);
      }
    }
  }, [reportError]);

  // Initial load + whenever sign-in state changes; then every 5 minutes while visible
  useEffect(() => { if (signedIn) loadAll({ quiet: true }); }, [signedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);
  useEffect(() => {
    if (!signedIn) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") loadAll({ quiet: true }); }, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [signedIn, loadAll]);

  // ── Manual checkbox: write-through to the sheet; revert if it fails ────────
  const toggleCheck = async (cycle: Cycle, stepKey: string) => {
    const token = getAccessToken();
    if (!token) { showToast("Not signed in — this change was NOT saved to the shared sheet.", "error", 6000); return; }
    const key = `${cycle.periodKey}|${stepKey}`;
    if (busy.has(key)) return;
    const prev = checks[key];
    const nextDone = !(prev?.done);
    setBusy(b => new Set(b).add(key));
    setChecks(c => ({ ...c, [key]: { done: nextDone, at: new Date().toISOString(), by: userEmail || "", evidence: "" } }));
    try {
      await writeCheck(token, cycle.periodKey, stepKey, nextDone, userEmail || "");
    } catch (e) {
      setChecks(c => { const n = { ...c }; if (prev) n[key] = prev; else delete n[key]; return n; });
      showToast("That change was NOT saved to the shared sheet — it has been undone. Try again.", "error", 8000);
      reportError("save to the Report Tracker sheet", e);
    } finally {
      setBusy(b => { const n = new Set(b); n.delete(key); return n; });
    }
  };

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const addTask = async () => {
    const title = newTitle.trim();
    if (!title) return;
    const token = getAccessToken();
    if (!token) { showToast("Not signed in — this task was NOT saved to the shared sheet.", "error", 6000); return; }
    const t: TaskItem = { id: newTaskId(), title, due: newDue, done: false, notes: "" };
    setTasks(x => [...x, t]); setNewTitle(""); setNewDue("");
    try {
      await writeTask(token, t, userEmail || "");
      showToast(`Added task: ${title}`, "success", 2000);
    } catch (e) {
      setTasks(x => x.filter(y => y.id !== t.id)); setNewTitle(title); setNewDue(t.due);
      showToast("That task was NOT saved to the shared sheet — it has been undone.", "error", 8000);
      reportError("save to the Report Tracker sheet", e);
    }
  };
  const updateTask = async (t: TaskItem, patch: Partial<TaskItem>, deleted = false) => {
    const token = getAccessToken();
    if (!token) { showToast("Not signed in — this change was NOT saved to the shared sheet.", "error", 6000); return; }
    const next = { ...t, ...patch };
    const before = tasks;
    setTasks(x => deleted ? x.filter(y => y.id !== t.id) : x.map(y => (y.id === t.id ? next : y)));
    try {
      await writeTask(token, next, userEmail || "", deleted);
      if (deleted) showToast(`Removed task: ${t.title}`, "success", 2000);
    } catch (e) {
      setTasks(before);
      showToast("That change was NOT saved to the shared sheet — it has been undone.", "error", 8000);
      reportError("save to the Report Tracker sheet", e);
    }
  };

  // ── Calendar sync (portal local calendar — browser-local by design) ────────
  const plannedAll = useMemo(() => plannedCalendarEvents(now), [now]);
  const existingKeys = useMemo(
    () => new Set((localCalendarEvents || []).map(e => `${e.title}|${e.date}`)),
    [localCalendarEvents],
  );
  const toAdd = plannedAll.filter(p => !existingKeys.has(`${p.title}|${p.date}`));
  const addToCalendar = async () => {
    if (!toAdd.length) return;
    for (const p of toAdd) {
      addCalendarEvent({ title: p.title, date: p.date, time: p.time, type: "task", description: p.description, entity: "ALL" });
      await new Promise(r => setTimeout(r, 8)); // ids are Date.now()-based — keep them unique
    }
    showToast(`Added ${toAdd.length} report due date${toAdd.length === 1 ? "" : "s"} to the calendar`, "success", 3000);
  };

  // ── Derived view model ─────────────────────────────────────────────────────
  type Block = { rep: ReportDef; cycle: Cycle; status: Status; states: ReturnType<typeof stepStates>; label: "current" | "carry-over" };
  const blocks = useMemo(() => {
    const flat: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(checks)) flat[k] = v.done;
    const tracked = trackedPeriods(checks);
    return views.map(({ rep, view }) => {
      const mk = (cycle: Cycle, label: Block["label"]): Block => {
        const states = stepStates(rep, cycle, auto[cycle.periodKey], flat);
        return { rep, cycle, status: cycleStatus(rep, cycle, states, now), states, label };
      };
      const active = mk(view.active, "current");
      const list: Block[] = [active];
      // Carry over the previous cycle only if it is recent AND you already started tracking it here.
      // Weeks from before the tracker existed have no checks and must never show as overdue.
      if (view.previous && shouldCarryOver(view.previous, tracked, now)) {
        const prev = mk(view.previous, "carry-over");
        if (prev.status !== "done") list.push(prev);
      }
      return { rep, next: view.next, list };
    });
  }, [views, checks, auto, now]);

  const counts = useMemo(() => {
    const c = { overdue: 0, due: 0, progress: 0, done: 0 };
    for (const b of blocks) for (const x of b.list) {
      if (x.status === "overdue") c.overdue++; else if (x.status === "due") c.due++;
      else if (x.status === "progress") c.progress++; else if (x.status === "done") c.done++;
    }
    return c;
  }, [blocks]);

  // "Coming up" strip: next cycle for each report + CPRO monthly deadline
  const upcoming = useMemo(() => {
    const rows: { when: number; text: string; rep: ReportDef; kind: "run" | "deadline" }[] = [];
    for (const b of blocks) {
      if (b.next) rows.push({ when: b.next.windowStart, text: b.next.label, rep: b.rep, kind: "run" });
      for (const x of b.list) {
        if (b.rep.id === "cprom" && x.cycle.deadline > now && x.status !== "done")
          rows.push({ when: x.cycle.deadline, text: x.cycle.label, rep: b.rep, kind: "deadline" });
      }
    }
    return rows.filter(r => r.when > now).sort((a, b) => a.when - b.when).slice(0, 6);
  }, [blocks, now]);

  // One-line explanation under an AUTO step
  const autoLine = (periodKey: string, step: string, a: AutoResult | undefined, chk: Record<string, CheckRow>) => {
    const latched = chk[`${periodKey}|auto:${step}`];
    if (latched?.done) return <div className={`text-[11px] ${muted}`}>Confirmed {latched.at ? fmtPht(Date.parse(latched.at), false) : "earlier"} — saved in the tracker sheet, not re-read</div>;
    if (a?.state === "unknown") {
      const warn = isLight ? "text-amber-700" : "text-amber-300";
      const msg =
        a.reason === "busy" ? (busyAttempt <= MAX_BUSY_RETRIES
          ? "Couldn't check just now (Google was busy) — retrying automatically in about 1 minute."
          : "Still busy after 3 tries — press Refresh checks, or it will try again within 10 minutes.")
        : a.reason === "auth" ? "Sign-in expired — reconnect Google, then press Refresh checks."
        : a.reason === "access" ? "No access to this file — ask the owner to share it with your Google account."
        : "Couldn't check just now — it will try again within 10 minutes.";
      return <div className={`text-[11px] ${warn}`}>⚠ {msg}</div>;
    }
    if (a?.detail) return <div className={`text-[11px] ${muted}`}>{a.detail}</div>;
    return signedIn ? <div className={`text-[11px] ${muted}`}>{loadedOnce ? "Not checked yet" : "Reading sheet…"}</div> : null;
  };

  const todayIso = isoDate(toPht(now));
  const openTasks = tasks.filter(t => !t.done).length;

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader title="Report Tracker" bgClass="bg-[#0f766e]" moduleId="report-tracker" sheetUrl={TRACKER_SHEET_URL} />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={kpiCard}>
            <div className={`text-[11px] font-semibold ${muted} uppercase`}>Overdue</div>
            <div className={`text-2xl font-bold mt-1 ${counts.overdue ? (isLight ? "text-red-600" : "text-[#f87171]") : strong}`}>{counts.overdue}</div>
            <div className={`text-[11px] mt-1 flex items-center gap-1 ${counts.overdue ? (isLight ? "text-red-600" : "text-[#f87171]") : muted}`}>
              <AlertCircle className="w-3.5 h-3.5" /> Past deadline, not finished
            </div>
          </div>
          <div className={kpiCard}>
            <div className={`text-[11px] font-semibold ${muted} uppercase`}>Due Now</div>
            <div className="text-2xl font-bold text-[#fb923c] mt-1">{counts.due}</div>
            <div className="text-[11px] text-[#fb923c] mt-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Window open or waiting to start</div>
          </div>
          <div className={kpiCard}>
            <div className={`text-[11px] font-semibold ${muted} uppercase`}>In Progress</div>
            <div className={`text-2xl font-bold mt-1 ${isLight ? "text-blue-600" : "text-[#60a5fa]"}`}>{counts.progress}</div>
            <div className={`text-[11px] mt-1 ${isLight ? "text-blue-600" : "text-[#60a5fa]"}`}>Script done, follow-ups open</div>
          </div>
          <div className={kpiCard}>
            <div className={`text-[11px] font-semibold ${muted} uppercase`}>Done</div>
            <div className="text-2xl font-bold text-[#4ade80] mt-1">{counts.done}</div>
            <div className="text-[11px] text-[#4ade80] mt-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Every step checked</div>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className={`flex flex-wrap items-center justify-between gap-3 p-3 ${card}`}>
          <div className="flex flex-wrap items-center gap-2">
            <a href={TRACKER_SHEET_URL} target="_blank" rel="noopener noreferrer" className="btn-3d btn-3d-blue inline-flex items-center gap-1.5" title="Open the Google Sheet that stores this page's checks and tasks">
              <Table2 className="w-3.5 h-3.5" /> Open Source Sheet
            </a>
            <button
              onClick={() => setShowInfo(v => !v)}
              className={`btn-3d btn-3d-light inline-flex items-center gap-1.5 ${showInfo ? "ring-1 ring-[#0d9488]" : ""}`}
              title="How this page works" aria-expanded={showInfo} aria-label="How this page works"
            >
              <Info className="w-3.5 h-3.5 text-[#0d9488]" /> How it works
            </button>
            <button onClick={() => loadAll({ force: true })} disabled={loading || !signedIn} className="btn-3d btn-3d-light inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" title="Re-read the tracker sheet and re-run the auto-checks">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh checks
            </button>
            <button onClick={addToCalendar} disabled={!toAdd.length} className="btn-3d btn-3d-light inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" title="Adds each report's run window and the CPRO monthly deadline to the portal calendar (this browser)">
              <CalendarPlus className="w-3.5 h-3.5" /> {toAdd.length ? `Add due dates to calendar (${toAdd.length})` : "Calendar up to date ✓"}
            </button>
          </div>
          <div className={`text-xs ${muted} text-right`}>
            <div>Philippine Time · {fmtPht(now)}</div>
            <div>{autoAt ? `Auto-checks read ${relative(autoAt, now)}` : signedIn ? "Reading sheets…" : "Not signed in"}</div>
          </div>
        </div>

        {showInfo && (
          <div className={`${card} overflow-hidden shadow-sm`}>
            <div className={`flex items-center justify-between gap-2 p-3 ${cardHead}`}>
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#0d9488]" />
                <h2 className={`text-sm font-bold ${strong}`}>How the Report Tracker works</h2>
              </div>
              <button onClick={() => setShowInfo(false)} className={`p-1 rounded ${isLight ? "hover:bg-slate-100" : "hover:bg-white/10"}`} title="Close"><X className="w-4 h-4" /></button>
            </div>
            <div className={`p-4 grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3 text-xs ${isLight ? "text-slate-700" : "text-gray-300"}`}>
              <div>
                <div className={`font-bold mb-1 ${strong}`}>What you are looking at</div>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Each card is <b>one run of one report</b> for one period (for example CPRO Monthly · August 2026). When the next run's window opens, you get a <b>fresh card with every step unticked</b>.</li>
                  <li>All times are <b>Philippine Time</b>. The schedule: FTA Tue 5–7 PM · CPRO Weekly Mon 5–7 PM (ready by 7) · CPRO Monthly the 3rd (deadline the 6th) · Toast Recon the 4th–5th.</li>
                  <li>A card stays on screen until the next run starts. If you had started ticking it and it is under 14 days old, it stays as a <b>Carry-over</b>.</li>
                </ul>
                <div className={`font-bold mt-3 mb-1 ${strong}`}>The status badge</div>
                <ul className="list-disc pl-4 space-y-1">
                  <li><b>Upcoming / Due</b>: not started, or the window is open.</li>
                  <li><b>In Progress</b>: the script output landed, follow-ups are still open.</li>
                  <li><b>Overdue</b>: past the deadline with something genuinely missing.</li>
                  <li><b>✓ Done</b>: every step is ticked or confirmed.</li>
                  <li><b>Not tracked</b>: the script output landed but no manual box was ever recorded here (older runs, from before the tracker).</li>
                  <li><b>Can't tell</b>: Google could not be read just then. It retries by itself and never turns red from a failed read.</li>
                </ul>
              </div>
              <div>
                <div className={`font-bold mb-1 ${strong}`}>Ticking and saving</div>
                <ul className="list-disc pl-4 space-y-1">
                  <li><b>AUTO</b> rows are read from your report sheets and Drive. Once confirmed they are saved and never re-read. Nothing is written to your report sheets.</li>
                  <li><b>Manual boxes</b> (Slack, Mark, client, dashboard…) save to the <b>Report Tracker sheet</b> the moment you click. If the save fails, the box un-ticks itself and a red message says so.</li>
                  <li>Click <b>Open Source Sheet</b> to see exactly what is stored: the <b>Checks</b> tab (one row per report, period and step), <b>Tasks</b>, and an append-only <b>Log</b> of every change. That is your history.</li>
                </ul>
                <div className={`font-bold mt-3 mb-1 ${strong}`}>Slack proof (nightly check)</div>
                <ul className="list-disc pl-4 space-y-1">
                  <li>When the nightly Slack check is switched on, a step it finds shows a green <b>AUTO-FOUND</b> tick with the evidence (who, what, when; never message text). <b>Untick it if it is wrong</b>; your choice always wins.</li>
                  <li>An amber <b>needs your review</b> or <b>not clear</b> note means it saw something but would not tick for you.</li>
                </ul>
                <div className={`font-bold mt-3 mb-1 ${strong}`}>Other buttons</div>
                <ul className="list-disc pl-4 space-y-1">
                  <li><b>Refresh checks</b> re-reads the sheets now. <b>Add due dates to calendar</b> adds each run window to this browser's portal calendar.</li>
                  <li><b>Tasks &amp; Reminders</b> at the bottom is a shared to-do list, also stored in the sheet.</li>
                </ul>
                <button
                  onClick={() => setCurrentPage("help")}
                  className={`mt-3 inline-flex items-center gap-1 text-[11px] font-semibold ${isLight ? "text-blue-600 hover:text-blue-800" : "text-[#60a5fa] hover:text-[#93c5fd]"}`}
                >
                  Full guide in Help &amp; Reference <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {!signedIn && (
          <div className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${isLight ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-amber-950/20 border-amber-900/40 text-amber-200"}`}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Connect Google Sheets (top of the page) to load the checks. The tracker sheet is the source of truth, so nothing can be checked off while signed out.</span>
          </div>
        )}

        {/* ── Coming up ── */}
        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`flex items-center gap-2 p-3 ${cardHead}`}>
            <Clock className="w-4 h-4 text-[#0d9488]" />
            <h2 className={`text-sm font-bold ${strong}`}>Coming Up</h2>
          </div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {upcoming.length === 0 && <div className={`text-xs ${muted}`}>Nothing scheduled ahead.</div>}
            {upcoming.map((u, i) => (
              <div key={i} className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${isLight ? "border-slate-200 bg-slate-50" : "border-[#1a2235] bg-[#0d1117]"}`}>
                <span className="w-1 self-stretch rounded-full" style={{ background: u.rep.accent }} />
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-bold truncate ${strong}`}>{u.rep.name} {u.kind === "deadline" ? "· deadline" : ""}</div>
                  <div className={`text-[11px] ${muted} truncate`}>{fmtPht(u.when)} · {u.text}</div>
                </div>
                <span className={`text-[11px] font-semibold shrink-0 ${isLight ? "text-slate-600" : "text-gray-300"}`}>{relative(u.when, now)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Report cards ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {blocks.map(({ rep, next, list }) => (
            <div key={rep.id} className="space-y-3">
              {list.map(b => (
                <div key={b.cycle.periodKey} className={`${card} overflow-hidden shadow-sm`}>
                  <div className={`p-3 ${cardHead} flex items-start justify-between gap-3`}>
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: rep.accent }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`text-sm font-bold ${strong}`}>{rep.name}</h3>
                          <StatusBadge status={b.status} isLight={isLight} />
                          {b.label === "carry-over" && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]"}`}>Carry-over</span>
                          )}
                        </div>
                        <div className={`text-[11px] ${muted} mt-0.5`}>{rep.cadence}</div>
                        <div className={`text-[11px] ${muted}`}>Period: <span className={`font-semibold ${isLight ? "text-slate-700" : "text-gray-300"}`}>{b.cycle.label}</span></div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-[11px] ${muted}`}>{b.cycle.deadline < now && b.status !== "done" ? "Was due" : "Due by"}</div>
                      <div className={`text-xs font-semibold ${b.status === "overdue" ? (isLight ? "text-red-600" : "text-[#f87171]") : strong}`}>{fmtPht(b.cycle.deadline)}</div>
                      <div className={`text-[11px] ${muted}`}>{relative(b.cycle.deadline, now)}</div>
                    </div>
                  </div>

                  <div className="p-2">
                    {rep.steps.map(s => {
                      const st = b.states[s.key];
                      const key = `${b.cycle.periodKey}|${s.key}`;
                      const a = auto[b.cycle.periodKey]?.[s.key];
                      const row = checks[key];
                      return (
                        <div key={s.key} className={`flex items-start gap-2.5 px-2 py-1.5 rounded-lg ${isLight ? "hover:bg-slate-50" : "hover:bg-white/5"}`}>
                          {s.kind === "manual" ? (
                            <button
                              onClick={() => toggleCheck(b.cycle, s.key)}
                              disabled={!signedIn || busy.has(key)}
                              className="mt-0.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                              title={st === "done" ? "Mark as not done" : "Mark as done (saves to the Report Tracker sheet)"}
                            >
                              {st === "done" ? <CheckSquare className="w-4 h-4 text-[#16a34a]" /> : <Square className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#555]"}`} />}
                            </button>
                          ) : st === "done" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#16a34a]" />
                            : st === "open" ? <Clock className="w-4 h-4 mt-0.5 shrink-0 text-[#fb923c]" />
                            : <AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${isLight ? "text-slate-400" : "text-[#555]"}`} />}
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs ${st === "done" ? muted : strong} ${st === "done" && s.kind === "manual" ? "line-through" : ""}`}>
                              {s.label}
                              {s.kind === "auto" && (
                                <span className={`ml-1.5 px-1.5 py-px rounded text-[9px] font-bold align-middle ${isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]"}`}>AUTO</span>
                              )}
                            </div>
                            {s.kind === "auto" && autoLine(b.cycle.periodKey, s.key, a, checks)}
                            {s.kind === "manual" && st === "done" && row?.at && evidenceKind(row) !== "found" && (
                              <div className={`text-[11px] ${muted}`}>Checked {fmtPht(Date.parse(row.at), false)}{row.by ? ` · ${row.by}` : ""}</div>
                            )}
                            {s.kind === "manual" && evidenceKind(row) === "found" && st === "done" && (
                              <div className={`text-[11px] ${isLight ? "text-emerald-700" : "text-[#4ade80]"}`}>
                                <span className={`mr-1 px-1.5 py-px rounded text-[9px] font-bold align-middle ${isLight ? "bg-emerald-100 text-emerald-700" : "bg-[#16a34a]/20 text-[#4ade80]"}`}>AUTO-FOUND</span>
                                {evidenceText(row)} <span className={muted}>· untick if wrong</span>
                              </div>
                            )}
                            {s.kind === "manual" && st !== "done" && (evidenceKind(row) === "review" || evidenceKind(row) === "unclear") && (
                              <div className={`text-[11px] ${isLight ? "text-amber-700" : "text-amber-300"}`}>
                                ⚠ Slack check ({row ? fmtPht(Date.parse(row.at), false) : ""}): {evidenceKind(row) === "review" ? "needs your review — " : "not clear — "}{evidenceText(row)}
                              </div>
                            )}
                            {s.hint && st !== "done" && <div className={`text-[11px] ${muted}`}>{s.hint}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className={`px-3 py-2 border-t flex flex-wrap items-center gap-x-3 gap-y-1 ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
                    <span className={`text-[11px] ${muted}`}>{rep.script}</span>
                    <span className="flex-1" />
                    {rep.links.map(l => (
                      <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold ${isLight ? "text-blue-600 hover:text-blue-800" : "text-[#60a5fa] hover:text-[#93c5fd]"}`}>
                        {l.label} <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
              {next && (
                <div className={`text-[11px] ${muted} px-1`}>
                  Next {rep.name} run: <span className={`font-semibold ${isLight ? "text-slate-700" : "text-gray-300"}`}>{fmtPht(next.windowStart)}</span> ({relative(next.windowStart, now)}) · period {next.label}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Tasks & reminders ── */}
        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`flex items-center justify-between gap-2 p-3 ${cardHead}`}>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-[#0d9488]" />
              <h2 className={`text-sm font-bold ${strong}`}>Tasks &amp; Reminders</h2>
              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]"}`}>{openTasks} open</span>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newTitle} onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addTask(); }}
                placeholder="Add a task or reminder…" className={`${inputCls} flex-1 min-w-[220px]`}
              />
              <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} className={inputCls} title="Due date (optional)" />
              <button onClick={addTask} disabled={!newTitle.trim() || !signedIn} className="btn-3d btn-3d-blue inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            {tasks.length === 0 && <div className={`text-xs ${muted} py-2`}>No tasks yet. They are saved to the Tasks tab of the tracker sheet.</div>}
            {[...tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due || "9999").localeCompare(b.due || "9999")).map(t => {
              const overdue = !t.done && t.due && t.due < todayIso;
              const today = !t.done && t.due === todayIso;
              return (
                <div key={t.id} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg border ${isLight ? "border-slate-200 hover:bg-slate-50" : "border-[#1a2235] hover:bg-white/5"}`}>
                  <button onClick={() => updateTask(t, { done: !t.done })} disabled={!signedIn} className="shrink-0 disabled:opacity-40" title={t.done ? "Mark as open" : "Mark as done"}>
                    {t.done ? <CheckSquare className="w-4 h-4 text-[#16a34a]" /> : <Square className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#555]"}`} />}
                  </button>
                  <span className={`flex-1 text-xs ${t.done ? `${muted} line-through` : strong}`}>{t.title}</span>
                  {t.due && (
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${
                      overdue ? `bg-[#dc2626]/20 ${isLight ? "text-red-600" : "text-[#f87171]"}`
                      : today ? "bg-[#fb923c]/20 text-[#fb923c]"
                      : isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]"
                    }`}>{overdue ? "Overdue · " : today ? "Today · " : ""}{fmtPhtDate(Date.parse(t.due + "T12:00:00+08:00"))}</span>
                  )}
                  <button onClick={() => updateTask(t, {}, true)} disabled={!signedIn} className={`p-1 rounded shrink-0 disabled:opacity-40 ${isLight ? "hover:bg-slate-100 text-slate-400 hover:text-red-600" : "hover:bg-white/10 text-[#666] hover:text-[#f87171]"}`} title="Remove task">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`text-[11px] ${muted} pb-2`}>
          Every check and task on this page is stored in the <a className="underline" href={TRACKER_SHEET_URL} target="_blank" rel="noopener noreferrer">Report Tracker sheet</a>
          {" "}(tabs: Checks, Tasks, Log). AUTO rows are read from your report sheets and Drive; this page never edits those or your scripts.
        </div>
      </div>
    </div>
  );
};
