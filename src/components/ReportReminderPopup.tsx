/**
 * ReportReminderPopup — a pop-up for Norlan only (accounting@marktimm.com) that lists every Report Tracker report with
 * steps still pending. It reads the tracker sheet (read-only) and the same automatic checks the Report Tracker uses,
 * and never writes anything. While the portal is open it re-checks every 15 minutes and shows again once the snooze is over.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ClipboardList, X } from "lucide-react";
import { useFinance } from "../context/FinanceContext";
import { getAccessToken } from "../services/googleAuth";
import {
  REPORTS, cycleView, fmtPht, fromPht, latchedAutoKeys, readTrackerData, relative, reminderItems, runAutoChecks, shouldCarryOver, toPht,
  trackedPeriods, type AutoByPeriod, type Cycle, type ReminderItem,
} from "../services/reportTrackerService";

const OWNER_EMAIL = "accounting@marktimm.com";
const SNOOZE_KEY = "financeops_report_reminder_until";
const RECHECK_MS = 15 * 60_000;
const FIRST_CHECK_DELAY_MS = 20_000;
const LATER_MS = 60 * 60_000;

const readSnooze = (): number => { try { return Number(localStorage.getItem(SNOOZE_KEY)) || 0; } catch { return 0; } };
const writeSnooze = (until: number) => { try { localStorage.setItem(SNOOZE_KEY, String(until)); } catch { /* snooze just won't persist */ } };

/** Next 6:00 AM Philippine time. */
function tomorrowMorning(now: number): number {
  const p = toPht(now);
  return fromPht(p.y, p.m, p.d + 1, 6, 0);
}

export const ReportReminderPopup: React.FC = () => {
  const { userEmail, theme, currentPage, setCurrentPage } = useFinance() as any;
  const isOwner = String(userEmail || "").toLowerCase() === OWNER_EMAIL;
  const isLight = theme === "light";
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (!isOwner || busy.current) return;
    if (Date.now() < readSnooze()) return;
    const token = getAccessToken();
    if (!token) return;
    busy.current = true;
    try {
      const t = Date.now();
      const { checks } = await readTrackerData(token);
      // read the automatic checks for the open runs, skipping what the tracker sheet already remembers as confirmed
      const flat: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(checks)) flat[k] = v.done;
      const tracked = trackedPeriods(checks);
      const cycles: Cycle[] = [];
      for (const rep of REPORTS) {
        const v = cycleView(rep.id, t);
        cycles.push(v.active);
        if (v.previous && shouldCarryOver(v.previous, tracked, t)) cycles.push(v.previous);
      }
      let auto: AutoByPeriod = {};
      try { auto = (await runAutoChecks(token, cycles, latchedAutoKeys(flat))).byPeriod; } catch { /* unread automatic steps are simply not listed */ }
      const list = reminderItems(t, checks, auto);
      setItems(list);
      setNow(t);
      if (list.length > 0 && Date.now() >= readSnooze()) setOpen(true);
    } catch { /* reminder is best effort: never disturb the portal */ }
    finally { busy.current = false; }
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner) return;
    const first = setTimeout(check, FIRST_CHECK_DELAY_MS);
    const every = setInterval(check, RECHECK_MS);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [isOwner, check]);

  if (!isOwner || !open || items.length === 0) return null;
  if (currentPage === "workspace-report-tracker") return null; // you are already looking at it

  const close = (until: number) => { writeSnooze(until); setOpen(false); };
  const card = isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#0f1520] border-[#1f2a3d] text-[#e8e8e8]";
  const muted = isLight ? "text-slate-500" : "text-[#7a8aa6]";
  const overdue = items.some(i => i.status === "overdue");

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[min(26rem,calc(100vw-2rem))]" role="alertdialog" aria-label="Report reminders">
      <div className={`rounded-xl border shadow-2xl ${card}`}>
        <div className="flex items-start gap-2 p-3 pb-2">
          {overdue ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#f87171]" /> : <ClipboardList className="w-4 h-4 mt-0.5 shrink-0 text-[#0d9488]" />}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">Reports with steps still pending</div>
            <div className={`text-[11px] ${muted}`}>{items.length} open run{items.length === 1 ? "" : "s"} · times are Philippine Time</div>
          </div>
          <button onClick={() => close(Date.now() + LATER_MS)} className={`p-1 rounded ${isLight ? "hover:bg-slate-100" : "hover:bg-white/10"}`} title="Close (reminds again in 1 hour)">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-3 space-y-2.5 pb-2">
          {items.map(i => (
            <div key={i.cycle.periodKey} className={`rounded-lg border p-2 ${isLight ? "border-slate-100 bg-slate-50" : "border-[#1a2235] bg-[#0b111b]"}`}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold">{i.rep.name}</span>
                <span className="px-1.5 py-px rounded text-[9px] font-bold" style={{ background: `${i.rep.entity.hex}33`, color: i.rep.entity.textHex }}>{i.rep.entity.label}</span>
                {i.status === "overdue" && <span className="px-1.5 py-px rounded text-[9px] font-bold bg-[#f87171]/20 text-[#f87171]">Overdue</span>}
              </div>
              <div className={`text-[11px] ${muted}`}>
                {i.cycle.label} · {i.cycle.deadline < now ? "was due" : "due by"} {fmtPht(i.cycle.deadline)} ({relative(i.cycle.deadline, now)})
              </div>
              <ul className="mt-1 space-y-0.5">
                {i.pending.map(s => (
                  <li key={s.key} className="text-[11px] flex gap-1.5"><span className={muted}>•</span><span>{s.label}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={`flex flex-wrap gap-2 p-3 pt-2 border-t ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
          <button
            onClick={() => { close(Date.now() + LATER_MS); setCurrentPage("workspace-report-tracker"); }}
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[#0f766e] hover:bg-[#0d9488]"
          >Open Report Tracker</button>
          <button
            onClick={() => close(Date.now() + LATER_MS)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${isLight ? "border-slate-300 text-slate-600 hover:bg-slate-100" : "border-[#1a2235] text-gray-300 hover:bg-white/5"}`}
          >Remind me in 1 hour</button>
          <button
            onClick={() => close(tomorrowMorning(Date.now()))}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${isLight ? "border-slate-300 text-slate-600 hover:bg-slate-100" : "border-[#1a2235] text-gray-300 hover:bg-white/5"}`}
          >Dismiss for today</button>
        </div>
      </div>
    </div>
  );
};
