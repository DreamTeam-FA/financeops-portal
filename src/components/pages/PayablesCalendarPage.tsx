import React, { useState, useMemo } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { formatCurrency } from "../../utils/formatters";
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle } from "lucide-react";

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const DAY_NAMES   = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT   = ["Mon",    "Tue",     "Wed",       "Thu",      "Fri",     "Sat",      "Sun"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Monday of the week that contains `date` */
function weekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ENTITY_COLORS: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  "Ruby's":   { bg: "bg-[#d81b60]/15", text: "text-[#e91e63]", border: "border-[#d81b60]/30", bar: "#d81b60" },
  "TI":       { bg: "bg-[#1a73e8]/15", text: "text-[#1a73e8]", border: "border-[#1a73e8]/30", bar: "#1a73e8" },
  "MSDx":     { bg: "bg-[#00897b]/15", text: "text-[#00897b]", border: "border-[#00897b]/30", bar: "#00897b" },
  "default":  { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-400/30", bar: "#6366f1" },
};

function entityColor(entity: string) {
  return ENTITY_COLORS[entity] ?? ENTITY_COLORS["default"];
}

/* ── Bill card ────────────────────────────────────────────────────────────── */
const BillCard: React.FC<{ bill: any; today: string; isLight: boolean }> = ({ bill, today, isLight }) => {
  const ec    = entityColor(bill.entity);
  const isPastDue = bill.status !== "paid" && bill.dueDate < today;
  const isPaid    = bill.status === "paid";

  return (
    <div className={`relative overflow-hidden rounded-lg border text-[11px] mb-1.5 last:mb-0 ${
      isPaid
        ? isLight ? "border-slate-200 bg-slate-50/60 opacity-60" : "border-[#222] bg-white/3 opacity-60"
        : isPastDue
        ? isLight ? "border-red-200 bg-red-50" : "border-red-800/40 bg-red-950/30"
        : isLight ? `border-slate-200 bg-white` : `border-[#1a2235] bg-[#0d111a]`
    }`}>
      {/* Left accent bar (entity color) */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ background: ec.bar }} />

      <div className="pl-3 pr-2 py-2">
        {/* Entity + subcompany */}
        <div className="flex items-center gap-1 mb-1">
          <span className={`px-1.5 py-0 rounded text-[10px] font-bold ${ec.bg} ${ec.text}`}>
            {bill.entity}
          </span>
          {bill.subcompany && (
            <span className={`text-[10px] truncate max-w-[80px] ${isLight ? "text-slate-400" : "text-[#666]"}`}>
              {bill.subcompany}
            </span>
          )}
          {isPastDue && (
            <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 ml-auto" />
          )}
          {isPaid && (
            <span className={`ml-auto text-[9px] font-bold ${isLight ? "text-emerald-600" : "text-emerald-400"}`}>PAID</span>
          )}
        </div>
        {/* Vendor */}
        <div className={`font-semibold truncate leading-tight ${isLight ? "text-slate-800" : "text-white"}`}>
          {bill.vendor}
        </div>
        {/* Amount */}
        <div className={`font-extrabold mt-0.5 ${isPaid ? (isLight ? "text-slate-400" : "text-[#555]") : isLight ? "text-slate-900" : "text-white"}`}>
          {formatCurrency(bill.amount)}
        </div>
      </div>
    </div>
  );
};

/* ── Main Page ────────────────────────────────────────────────────────────── */
export const PayablesCalendarPage: React.FC = () => {
  const { apBills, selectedEntities, theme } = useFinance() as any;
  const isLight = theme === "light";

  const today   = toYMD(new Date());
  const [anchor, setAnchor] = useState<Date>(() => weekMonday(new Date()));

  /* Derived week days */
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);

  const prevWeek = () => setAnchor(d => addDays(d, -7));
  const nextWeek = () => setAnchor(d => addDays(d, 7));
  const thisWeek = () => setAnchor(weekMonday(new Date()));

  /* Filter bills by selected entities */
  const bills: any[] = useMemo(() =>
    (apBills || []).filter((b: any) =>
      selectedEntities.has("ALL") || selectedEntities.has(b.entity)
    ),
  [apBills, selectedEntities]);

  /* Map bills to their day slot within the visible week */
  const dayBills = useMemo(() => {
    const map: Record<string, any[]> = {};
    weekDays.forEach(d => { map[toYMD(d)] = []; });
    bills.forEach(b => {
      if (b.dueDate && map[b.dueDate] !== undefined) {
        map[b.dueDate].push(b);
      }
    });
    return map;
  }, [bills, weekDays]);

  /* Week totals */
  const weekUnpaidTotal = useMemo(() =>
    weekDays.reduce((sum, d) => {
      const dayKey = toYMD(d);
      return sum + (dayBills[dayKey] || [])
        .filter((b: any) => b.status !== "paid")
        .reduce((s: number, b: any) => s + (b.amount || 0), 0);
    }, 0),
  [dayBills, weekDays]);

  const weekGrandTotal = useMemo(() =>
    weekDays.reduce((sum, d) => {
      const dayKey = toYMD(d);
      return sum + (dayBills[dayKey] || [])
        .reduce((s: number, b: any) => s + (b.amount || 0), 0);
    }, 0),
  [dayBills, weekDays]);

  /* Week label */
  const weekLabel = (() => {
    const s = weekDays[0], e = weekDays[6];
    if (s.getMonth() === e.getMonth())
      return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  })();

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader
        title="Payables Calendar"
        bgClass="bg-[#1a73e8]"
        moduleId="ap"
        showEntityPills={true}
        sheetUrl="https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit"
      />

      <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">

        {/* ── Week navigator ── */}
        <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} shadow-sm`}>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#1a73e8]" />
            <span className={`text-sm font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{weekLabel}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Totals */}
            <div className={`hidden sm:flex flex-col items-end mr-3 ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              <span className="text-[10px] uppercase font-semibold tracking-wider">Week Unpaid</span>
              <span className={`text-sm font-extrabold ${isLight ? "text-slate-900" : "text-white"}`}>
                {formatCurrency(weekUnpaidTotal)}
              </span>
            </div>
            <button onClick={prevWeek} className={`p-1.5 rounded-lg border transition-colors ${isLight ? "border-slate-200 hover:bg-slate-100 text-slate-600" : "border-[#2a3140] hover:bg-white/5 text-[#aaa]"}`}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={thisWeek} className="px-3 py-1.5 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white text-[11px] font-bold transition-colors">
              This Week
            </button>
            <button onClick={nextWeek} className={`p-1.5 rounded-lg border transition-colors ${isLight ? "border-slate-200 hover:bg-slate-100 text-slate-600" : "border-[#2a3140] hover:bg-white/5 text-[#aaa]"}`}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── 7-day grid ── */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="h-full grid grid-cols-7 gap-2 min-w-[700px]">
            {weekDays.map((d, i) => {
              const ymd        = toYMD(d);
              const isToday    = ymd === today;
              const isPast     = ymd < today;
              const dayBillArr = dayBills[ymd] || [];
              const unpaidArr  = dayBillArr.filter((b: any) => b.status !== "paid");
              const dayTotal   = unpaidArr.reduce((s: number, b: any) => s + (b.amount || 0), 0);
              const hasItems   = dayBillArr.length > 0;

              return (
                <div
                  key={ymd}
                  className={`flex flex-col rounded-xl border overflow-hidden ${
                    isToday
                      ? isLight ? "border-[#1a73e8] bg-blue-50/60" : "border-[#1a73e8]/60 bg-[#1a73e8]/5"
                      : isLight ? "border-slate-200 bg-white" : "border-[#1a2235] bg-[#0d111a]"
                  }`}
                >
                  {/* Day header */}
                  <div className={`px-2 py-2 border-b shrink-0 ${
                    isToday
                      ? "bg-[#1a73e8] text-white border-[#1a73e8]"
                      : isPast && hasItems
                      ? isLight ? "bg-red-50 border-red-100" : "bg-red-950/20 border-red-900/20"
                      : isLight ? "bg-slate-50 border-slate-200" : "bg-[#141414] border-[#1a2235]"
                  }`}>
                    <div className={`text-[10px] font-bold uppercase tracking-wider ${
                      isToday ? "text-blue-100" : isPast && hasItems ? "text-red-400" : isLight ? "text-slate-500" : "text-[#666]"
                    }`}>
                      {DAY_SHORT[i]}
                    </div>
                    <div className={`text-base font-extrabold leading-tight ${
                      isToday ? "text-white" : isLight ? "text-slate-800" : "text-white"
                    }`}>
                      {d.getDate()}
                    </div>
                    <div className={`text-[9px] ${isToday ? "text-blue-200" : isLight ? "text-slate-400" : "text-[#555]"}`}>
                      {MONTH_NAMES[d.getMonth()]}
                    </div>
                  </div>

                  {/* Bills */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-0">
                    {dayBillArr.length === 0 ? (
                      <div className={`text-center text-[11px] mt-4 ${isLight ? "text-slate-300" : "text-[#333]"}`}>—</div>
                    ) : (
                      dayBillArr.map((b: any) => (
                        <BillCard key={b.id} bill={b} today={today} isLight={isLight} />
                      ))
                    )}
                  </div>

                  {/* Day total footer */}
                  {dayBillArr.length > 0 && (
                    <div className={`px-2 py-1.5 border-t shrink-0 flex items-center justify-between ${
                      isLight ? "border-slate-100 bg-slate-50" : "border-[#1a2235] bg-[#0a0e16]"
                    }`}>
                      <span className={`text-[10px] font-semibold ${isLight ? "text-slate-400" : "text-[#555]"}`}>
                        {unpaidArr.length} unpaid
                      </span>
                      <span className={`text-[11px] font-extrabold ${isLight ? "text-slate-800" : "text-white"}`}>
                        {formatCurrency(dayTotal)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Week summary bar ── */}
        <div className={`shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
          <div className="flex items-center gap-4">
            {["Ruby's", "TI", "MSDx"].map(en => {
              const ec = entityColor(en);
              const enTotal = weekDays.reduce((sum, d) => {
                return sum + (dayBills[toYMD(d)] || [])
                  .filter((b: any) => b.entity === en && b.status !== "paid")
                  .reduce((s: number, b: any) => s + (b.amount || 0), 0);
              }, 0);
              if (enTotal === 0) return null;
              return (
                <div key={en} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0`} style={{ background: ec.bar }} />
                  <span className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>{en}</span>
                  <span className={`text-[11px] font-extrabold ${isLight ? "text-slate-800" : "text-white"}`}>{formatCurrency(enTotal)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>Week Total (Unpaid)</span>
            <span className={`text-sm font-extrabold ${isLight ? "text-slate-900" : "text-white"}`}>{formatCurrency(weekUnpaidTotal)}</span>
          </div>
        </div>

      </div>
    </div>
  );
};
