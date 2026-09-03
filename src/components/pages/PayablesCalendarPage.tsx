import React, { useState, useMemo } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { formatCurrency } from "../../utils/formatters";
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle, History } from "lucide-react";
import { BillDetailsModal } from "../modals/BillDetailsModal";
import { EditBillModal } from "../modals/EditBillModal";
import { APBill } from "../../types";

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const DAY_SHORT   = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ENTITIES    = ["Ruby's", "TI", "MSDx"] as const;

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
  "Ruby's":  { bg: "bg-[#d81b60]/15", text: "text-[#e91e63]", border: "border-[#d81b60]/30", bar: "#d81b60" },
  "TI":      { bg: "bg-[#1a73e8]/15", text: "text-[#1a73e8]", border: "border-[#1a73e8]/30", bar: "#1a73e8" },
  "MSDx":    { bg: "bg-[#00897b]/15", text: "text-[#00897b]", border: "border-[#00897b]/30", bar: "#00897b" },
  "default": { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-400/30", bar: "#6366f1" },
};

function entityColor(entity: string) {
  return ENTITY_COLORS[entity] ?? ENTITY_COLORS["default"];
}

/* ── Bill card (day columns) ───────────────────────────────────────────────── */
const BillCard: React.FC<{
  bill: any;
  today: string;
  isLight: boolean;
  onClick: () => void;
}> = ({ bill, today, isLight, onClick }) => {
  const ec       = entityColor(bill.entity);
  const isPastDue = bill.dueDate < today;

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-lg border text-[11px] mb-1.5 last:mb-0 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md active:scale-100 ${
        isPastDue
          ? isLight ? "border-red-200 bg-red-50 hover:border-red-300" : "border-red-800/40 bg-red-950/30 hover:border-red-700/60"
          : isLight ? "border-slate-200 bg-white hover:border-slate-300" : "border-[#1a2235] bg-[#0d111a] hover:border-[#2a3a55]"
      }`}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ background: ec.bar }} />
      <div className="pl-3 pr-2 py-2">
        <div className="flex items-center gap-1 mb-1">
          <span className={`px-1.5 py-0 rounded text-[10px] font-bold ${ec.bg} ${ec.text}`}>{bill.entity}</span>
          {bill.subcompany && (
            <span className={`text-[10px] truncate max-w-[80px] ${isLight ? "text-slate-400" : "text-[#666]"}`}>
              {bill.subcompany}
            </span>
          )}
          {isPastDue && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 ml-auto" />}
        </div>
        <div className={`font-semibold truncate leading-tight ${isLight ? "text-slate-800" : "text-white"}`}>{bill.vendor}</div>
        <div className={`font-extrabold mt-0.5 ${isLight ? "text-slate-900" : "text-white"}`}>
          {formatCurrency(bill.amount)}
        </div>
      </div>
    </div>
  );
};

/* ── Vendor group row (overdue / last-week columns) ──────────────────────── */
interface VendorGroup {
  entity: string;
  subcompany: string;
  vendor: string;
  totalAmount: number;
  count: number;
  bills: any[];
}

const VendorGroupRow: React.FC<{
  group: VendorGroup;
  isLight: boolean;
  isLastWeek?: boolean;
  onClick: () => void;
}> = ({ group, isLight, isLastWeek, onClick }) => {
  const ec = entityColor(group.entity);
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-lg border text-[11px] mb-1.5 last:mb-0 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md active:scale-100 ${
        isLastWeek
          ? isLight ? "border-amber-200 bg-amber-50/50 hover:border-amber-300" : "border-amber-800/30 bg-amber-950/20 hover:border-amber-700/50"
          : isLight ? "border-red-200 bg-red-50/50 hover:border-red-300" : "border-red-800/30 bg-red-950/20 hover:border-red-700/50"
      }`}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ background: ec.bar }} />
      <div className="pl-3 pr-2 py-1.5">
        <div className="flex items-center gap-1 mb-0.5">
          <span className={`px-1.5 py-0 rounded text-[10px] font-bold shrink-0 ${ec.bg} ${ec.text}`}>{group.entity}</span>
          {group.subcompany && (
            <span className={`text-[10px] truncate ${isLight ? "text-slate-400" : "text-[#666]"}`}>{group.subcompany}</span>
          )}
          {group.count > 1 && (
            <span className={`ml-auto text-[9px] shrink-0 ${isLastWeek ? "text-amber-500" : "text-red-500"}`}>×{group.count}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1">
          <div className={`font-semibold truncate leading-tight ${isLight ? "text-slate-800" : "text-white"}`}>{group.vendor}</div>
          <div className={`font-extrabold shrink-0 ${
            isLastWeek
              ? isLight ? "text-amber-700" : "text-amber-400"
              : isLight ? "text-red-700" : "text-red-400"
          }`}>
            {formatCurrency(group.totalAmount)}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Per-entity totals footer (day columns) ───────────────────────────────── */
const DayEntityTotals: React.FC<{ dayBillArr: any[]; isLight: boolean }> = ({ dayBillArr, isLight }) => {
  const totals = ENTITIES
    .map(en => ({
      entity: en,
      amount: dayBillArr.filter(b => b.entity === en && b.status !== "paid").reduce((s, b) => s + (b.amount || 0), 0),
      ec: entityColor(en),
    }))
    .filter(t => t.amount > 0);

  if (totals.length === 0) return null;

  return (
    <div className={`px-2 py-1.5 border-t shrink-0 ${isLight ? "border-slate-100 bg-slate-50" : "border-[#1a2235] bg-[#0a0e16]"}`}>
      {totals.map(t => (
        <div key={t.entity} className="flex items-center justify-between mb-0.5 last:mb-0">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.ec.bar }} />
            <span className={`text-[9px] font-semibold ${isLight ? "text-slate-400" : "text-[#555]"}`}>{t.entity}</span>
          </div>
          <span className={`text-[10px] font-extrabold ${isLight ? "text-slate-700" : "text-white"}`}>
            {formatCurrency(t.amount)}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ── Summary column (overdue / last-week) ─────────────────────────────────── */
const ENTITY_ORDER: Record<string, number> = { "Ruby's": 0, "TI": 1, "MSDx": 2 };

const SummaryColumn: React.FC<{
  label: string;
  icon: React.ReactNode;
  bills: any[];
  isLight: boolean;
  isLastWeek?: boolean;
  headerColorClass: string;
  onBillClick: (bills: any[]) => void;
}> = ({ label, icon, bills, isLight, isLastWeek, headerColorClass, onBillClick }) => {
  const total = bills.reduce((s, b) => s + (b.amount || 0), 0);

  // Group by entity + subcompany + vendor → one row per group
  const groupMap = new Map<string, VendorGroup>();
  [...bills]
    .sort((a, b) => {
      const ea = ENTITY_ORDER[a.entity] ?? 99;
      const eb = ENTITY_ORDER[b.entity] ?? 99;
      if (ea !== eb) return ea - eb;
      return (a.vendor || "").localeCompare(b.vendor || "");
    })
    .forEach(b => {
      const key = `${b.entity}||${b.subcompany || ""}||${b.vendor || ""}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.totalAmount += b.amount || 0;
        existing.count += 1;
        existing.bills.push(b);
      } else {
        groupMap.set(key, {
          entity: b.entity,
          subcompany: b.subcompany || "",
          vendor: b.vendor || "",
          totalAmount: b.amount || 0,
          count: 1,
          bills: [b],
        });
      }
    });
  const groups = Array.from(groupMap.values());

  const entityTotals = ENTITIES
    .map(en => ({
      entity: en,
      amount: bills.filter(b => b.entity === en).reduce((s, b) => s + (b.amount || 0), 0),
      ec: entityColor(en),
    }))
    .filter(t => t.amount > 0);

  return (
    <div className={`flex flex-col rounded-xl border overflow-hidden ${
      isLight ? "border-slate-200 bg-white" : "border-[#1a2235] bg-[#0d111a]"
    }`}>
      {/* Header */}
      <div className={`px-2 py-2 border-b shrink-0 ${headerColorClass}`}>
        <div className="flex items-center gap-1.5 mb-0.5">
          {icon}
          <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
        </div>
        <div className="text-sm font-extrabold">{formatCurrency(total)}</div>
        <div className="text-[9px] opacity-70">{bills.length} bill{bills.length !== 1 ? "s" : ""} · {groups.length} vendor{groups.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Vendor group rows */}
      <div className="flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <div className={`text-center text-[11px] mt-4 ${isLight ? "text-slate-300" : "text-[#333]"}`}>—</div>
        ) : (
          groups.map((g, idx) => (
            <VendorGroupRow
              key={`${g.entity}-${g.subcompany}-${g.vendor}-${idx}`}
              group={g}
              isLight={isLight}
              isLastWeek={isLastWeek}
              onClick={() => onBillClick(g.bills)}
            />
          ))
        )}
      </div>

      {/* Per-entity footer */}
      {entityTotals.length > 0 && (
        <div className={`px-2 py-1.5 border-t shrink-0 ${isLight ? "border-slate-100 bg-slate-50" : "border-[#1a2235] bg-[#0a0e16]"}`}>
          {entityTotals.map(t => (
            <div key={t.entity} className="flex items-center justify-between mb-0.5 last:mb-0">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.ec.bar }} />
                <span className={`text-[9px] font-semibold ${isLight ? "text-slate-400" : "text-[#555]"}`}>{t.entity}</span>
              </div>
              <span className={`text-[10px] font-extrabold ${isLight ? "text-slate-700" : "text-[#ccc]"}`}>
                {formatCurrency(t.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Group bills by entity+vendor (shared helper) ─────────────────────────── */
function groupBillsByVendor(bills: any[]): VendorGroup[] {
  const map = new Map<string, VendorGroup>();
  [...bills]
    .sort((a, b) => {
      const ea = ENTITY_ORDER[a.entity] ?? 99;
      const eb = ENTITY_ORDER[b.entity] ?? 99;
      if (ea !== eb) return ea - eb;
      return (a.vendor || "").localeCompare(b.vendor || "");
    })
    .forEach(b => {
      const key = `${b.entity}||${b.subcompany || ""}||${b.vendor || ""}`;
      const ex = map.get(key);
      if (ex) { ex.totalAmount += b.amount || 0; ex.count++; ex.bills.push(b); }
      else map.set(key, { entity: b.entity, subcompany: b.subcompany || "", vendor: b.vendor || "", totalAmount: b.amount || 0, count: 1, bills: [b] });
    });
  return Array.from(map.values());
}

/* ── Mobile List View — vendor-grouped, same style as desktop columns ─────── */
const MobileListView: React.FC<{
  overdueOldBills: any[];
  lastWeekBills: any[];
  weekDays: Date[];
  dayBills: Record<string, any[]>;
  today: string;
  isLight: boolean;
  onBillClick: (bills: any[]) => void;
}> = ({ overdueOldBills, lastWeekBills, weekDays, dayBills, today, isLight, onBillClick }) => {
  const fmtDay = (d: Date) =>
    `${DAY_SHORT[(d.getDay() + 6) % 7]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

  type Section = { label: string; total: number; groups: VendorGroup[]; accentClass: string; overdueStyle: boolean; lastWeekStyle: boolean };
  const sections: Section[] = [];

  if (overdueOldBills.length > 0)
    sections.push({ label: "⚠ Overdue", total: overdueOldBills.reduce((s, b) => s + (b.amount || 0), 0), groups: groupBillsByVendor(overdueOldBills), accentClass: "text-red-500", overdueStyle: true, lastWeekStyle: false });

  if (lastWeekBills.length > 0)
    sections.push({ label: "⏱ Last Week", total: lastWeekBills.reduce((s, b) => s + (b.amount || 0), 0), groups: groupBillsByVendor(lastWeekBills), accentClass: "text-amber-400", overdueStyle: false, lastWeekStyle: true });

  weekDays.forEach(d => {
    const ymd = toYMD(d);
    const arr = dayBills[ymd] || [];
    const isToday = ymd === today;
    const isPast = ymd < today;
    sections.push({
      label: isToday ? `Today — ${fmtDay(d)}` : fmtDay(d),
      total: arr.reduce((s, b) => s + (b.amount || 0), 0),
      groups: groupBillsByVendor(arr),
      accentClass: isToday ? "text-[#1a73e8]" : isPast ? "text-red-400" : isLight ? "text-slate-600" : "text-[#888]",
      overdueStyle: isPast && !isToday,
      lastWeekStyle: false,
    });
  });

  const totalBillsAcrossSections = sections.reduce((s, sec) => s + sec.groups.length, 0);
  if (totalBillsAcrossSections === 0 && overdueOldBills.length === 0 && lastWeekBills.length === 0)
    return (
      <div className={`flex items-center justify-center flex-1 text-sm ${isLight ? "text-slate-300" : "text-[#444]"}`}>
        No unpaid bills this week
      </div>
    );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 space-y-4">
      {sections.map((sec, si) => (
        <div key={si}>
          {/* Section header */}
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${sec.accentClass}`}>{sec.label}</span>
            <span className={`text-[11px] font-extrabold ${isLight ? "text-slate-700" : "text-white"}`}>{sec.total > 0 ? formatCurrency(sec.total) : <span className={isLight ? "text-slate-300" : "text-[#444]"}>—</span>}</span>
          </div>
          {/* Vendor group rows */}
          <div className="space-y-1.5">
            {sec.groups.length === 0 && (
              <div className={`text-[11px] px-3 py-2 rounded-lg ${isLight ? "text-slate-300 bg-slate-50" : "text-[#444] bg-[#0d111a]"}`}>
                No bills due
              </div>
            )}
            {sec.groups.map((g, gi) => {
              const ec = entityColor(g.entity);
              return (
                <div
                  key={`${g.entity}-${g.vendor}-${gi}`}
                  onClick={() => onBillClick(g.bills)}
                  className={`relative overflow-hidden rounded-xl border cursor-pointer active:scale-[0.98] transition-transform ${
                    sec.overdueStyle
                      ? isLight ? "border-red-200 bg-red-50/60" : "border-red-800/30 bg-red-950/20"
                      : sec.lastWeekStyle
                      ? isLight ? "border-amber-200 bg-amber-50/60" : "border-amber-800/30 bg-amber-950/20"
                      : isLight ? "border-slate-200 bg-white" : "border-[#1a2235] bg-[#0d111a]"
                  }`}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: ec.bar }} />
                  <div className="pl-4 pr-3 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className={`px-1.5 py-0 rounded text-[10px] font-bold shrink-0 ${ec.bg} ${ec.text}`}>{g.entity}</span>
                        {g.subcompany && <span className={`text-[10px] truncate ${isLight ? "text-slate-400" : "text-[#666]"}`}>{g.subcompany}</span>}
                        {g.count > 1 && <span className={`ml-auto text-[10px] font-bold shrink-0 ${sec.overdueStyle ? "text-red-500" : sec.lastWeekStyle ? "text-amber-500" : "text-[#1a73e8]"}`}>×{g.count}</span>}
                      </div>
                      <div className={`font-semibold text-sm leading-tight truncate ${isLight ? "text-slate-800" : "text-white"}`}>{g.vendor || "—"}</div>
                    </div>
                    <div className={`font-extrabold text-sm shrink-0 ${
                      sec.overdueStyle ? isLight ? "text-red-700" : "text-red-400"
                      : sec.lastWeekStyle ? isLight ? "text-amber-700" : "text-amber-400"
                      : isLight ? "text-slate-900" : "text-white"
                    }`}>
                      {formatCurrency(g.totalAmount)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ── Main Page ────────────────────────────────────────────────────────────── */
export const PayablesCalendarPage: React.FC = () => {
  const { apBills, selectedEntities, theme } = useFinance() as any;
  const isLight = theme === "light";

  const today  = toYMD(new Date());
  const [anchor, setAnchor] = useState<Date>(() => weekMonday(new Date()));

  /* Modal state */
  const [selectedBills, setSelectedBills] = useState<APBill[]>([]);
  const [editingBill, setEditingBill] = useState<APBill | null>(null);

  /* Derived week days */
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);

  /* Last-week boundaries */
  const lastWeekMondayStr = useMemo(() => toYMD(addDays(anchor, -7)), [anchor]);
  const lastWeekSundayStr = useMemo(() => toYMD(addDays(anchor, -1)), [anchor]);

  const prevWeek = () => setAnchor(d => addDays(d, -7));
  const nextWeek = () => setAnchor(d => addDays(d, 7));
  const thisWeek = () => setAnchor(weekMonday(new Date()));

  /* Filter bills by selected entities */
  const bills: any[] = useMemo(() =>
    (apBills || []).filter((b: any) =>
      selectedEntities.has("ALL") || selectedEntities.has(b.entity)
    ),
  [apBills, selectedEntities]);

  /* Column 1: Overdue — unpaid, due before last-week Monday */
  const overdueOldBills = useMemo(() =>
    bills.filter((b: any) => b.status !== "paid" && b.dueDate && b.dueDate < lastWeekMondayStr),
  [bills, lastWeekMondayStr]);

  /* Column 2: Last week — unpaid, due Mon–Sun of last week */
  const lastWeekBills = useMemo(() =>
    bills.filter((b: any) =>
      b.status !== "paid" && b.dueDate &&
      b.dueDate >= lastWeekMondayStr && b.dueDate <= lastWeekSundayStr
    ),
  [bills, lastWeekMondayStr, lastWeekSundayStr]);

  /* Map UNPAID bills to their day slot within the visible week */
  const dayBills = useMemo(() => {
    const map: Record<string, any[]> = {};
    weekDays.forEach(d => { map[toYMD(d)] = []; });
    bills.forEach(b => {
      if (b.status !== "paid" && b.dueDate && map[b.dueDate] !== undefined) {
        map[b.dueDate].push(b);
      }
    });
    return map;
  }, [bills, weekDays]);

  /* Week unpaid total (current week only) */
  const weekUnpaidTotal = useMemo(() =>
    weekDays.reduce((sum, d) =>
      sum + (dayBills[toYMD(d)] || [])
        .filter((b: any) => b.status !== "paid")
        .reduce((s: number, b: any) => s + (b.amount || 0), 0),
    0),
  [dayBills, weekDays]);

  /* Week label */
  const weekLabel = (() => {
    const s = weekDays[0], e = weekDays[6];
    if (s.getMonth() === e.getMonth())
      return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  })();

  const handleBillClick = (clickedBills: any[]) => {
    setSelectedBills(clickedBills as APBill[]);
  };

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader
        title="Payables Calendar"
        bgClass="bg-[#1a73e8]"
        moduleId="ap"
        showEntityPills={true}
        sheetUrl="https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit"
      />

      <div className="flex-1 flex flex-col overflow-hidden p-3 md:p-4 gap-3 min-h-0">

        {/* ── Week navigator ── */}
        <div className={`flex items-center justify-between gap-2 px-3 md:px-4 py-2.5 md:py-3 rounded-xl border shrink-0 ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} shadow-sm`}>
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 text-[#1a73e8] shrink-0" />
            <span className={`text-xs md:text-sm font-bold truncate ${isLight ? "text-slate-800" : "text-white"}`}>{weekLabel}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className={`hidden sm:flex flex-col items-end mr-2 ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              <span className="text-[10px] uppercase font-semibold tracking-wider whitespace-nowrap">Week Unpaid</span>
              <span className={`text-sm font-extrabold ${isLight ? "text-slate-900" : "text-white"}`}>
                {formatCurrency(weekUnpaidTotal)}
              </span>
            </div>
            <button onClick={prevWeek} className={`p-1.5 rounded-lg border transition-colors ${isLight ? "border-slate-200 hover:bg-slate-100 text-slate-600" : "border-[#2a3140] hover:bg-white/5 text-[#aaa]"}`}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={thisWeek} className="px-2.5 py-1.5 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white text-[11px] font-bold transition-colors whitespace-nowrap">
              This Week
            </button>
            <button onClick={nextWeek} className={`p-1.5 rounded-lg border transition-colors ${isLight ? "border-slate-200 hover:bg-slate-100 text-slate-600" : "border-[#2a3140] hover:bg-white/5 text-[#aaa]"}`}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Mobile: week total pill ── */}
        <div className={`sm:hidden flex items-center justify-between px-3 py-2 rounded-lg border shrink-0 ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
          <span className={`text-[10px] uppercase font-semibold tracking-wider ${isLight ? "text-slate-500" : "text-[#888]"}`}>Week Unpaid</span>
          <span className={`text-sm font-extrabold ${isLight ? "text-slate-900" : "text-white"}`}>{formatCurrency(weekUnpaidTotal)}</span>
        </div>

        {/* ── Mobile: scrollable list ── */}
        <div className="flex md:hidden flex-1 flex-col min-h-0 overflow-hidden">
          <MobileListView
            overdueOldBills={overdueOldBills}
            lastWeekBills={lastWeekBills}
            weekDays={weekDays}
            dayBills={dayBills}
            today={today}
            isLight={isLight}
            onBillClick={handleBillClick}
          />
        </div>

        {/* ── Desktop: 9-column grid: 2 summary + 7 days ── */}
        <div className="hidden md:flex flex-1 overflow-x-auto overflow-y-hidden min-h-0">
          <div
            className="h-full grid gap-2 min-w-[1040px] w-full"
            style={{ gridTemplateColumns: "minmax(150px,1.2fr) minmax(150px,1.2fr) repeat(7, 1fr)" }}
          >
            {/* Column 1 — Overdue (older than last week) */}
            <SummaryColumn
              label="Overdue"
              icon={<AlertTriangle className="w-3 h-3" />}
              bills={overdueOldBills}
              isLight={isLight}
              headerColorClass={
                isLight
                  ? "bg-red-50 border-red-100 text-red-700"
                  : "bg-red-950/30 border-red-900/30 text-red-400"
              }
              onBillClick={handleBillClick}
            />

            {/* Column 2 — Last week's past due */}
            <SummaryColumn
              label="Last Week"
              icon={<History className="w-3 h-3" />}
              bills={lastWeekBills}
              isLight={isLight}
              isLastWeek={true}
              headerColorClass={
                isLight
                  ? "bg-amber-50 border-amber-100 text-amber-700"
                  : "bg-amber-950/30 border-amber-900/30 text-amber-400"
              }
              onBillClick={handleBillClick}
            />

            {/* Columns 3–9 — Current week days */}
            {weekDays.map((d, i) => {
              const ymd        = toYMD(d);
              const isToday    = ymd === today;
              const isPast     = ymd < today;
              const dayBillArr = dayBills[ymd] || [];
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
                    }`}>{DAY_SHORT[i]}</div>
                    <div className={`text-base font-extrabold leading-tight ${
                      isToday ? "text-white" : isLight ? "text-slate-800" : "text-white"
                    }`}>{d.getDate()}</div>
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
                        <BillCard
                          key={b.id}
                          bill={b}
                          today={today}
                          isLight={isLight}
                          onClick={() => handleBillClick([b])}
                        />
                      ))
                    )}
                  </div>

                  {/* Day footer: per-entity totals */}
                  {dayBillArr.length > 0 && (
                    <DayEntityTotals dayBillArr={dayBillArr} isLight={isLight} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Bottom summary bar: per-company this-week totals ── */}
        <div className={`shrink-0 flex flex-wrap items-center justify-between gap-3 px-3 md:px-4 py-2.5 rounded-xl border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
          <div className="flex items-center gap-3 md:gap-4 flex-wrap">
            {ENTITIES.map(en => {
              const ec = entityColor(en);
              const enTotal = weekDays.reduce((sum, d) =>
                sum + (dayBills[toYMD(d)] || [])
                  .filter((b: any) => b.entity === en && b.status !== "paid")
                  .reduce((s: number, b: any) => s + (b.amount || 0), 0),
              0);
              if (enTotal === 0) return null;
              return (
                <div key={en} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ec.bar }} />
                  <span className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>{en}</span>
                  <span className={`text-[11px] font-extrabold ${isLight ? "text-slate-800" : "text-white"}`}>{formatCurrency(enTotal)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>This Week (Unpaid)</span>
            <span className={`text-sm font-extrabold ${isLight ? "text-slate-900" : "text-white"}`}>{formatCurrency(weekUnpaidTotal)}</span>
          </div>
        </div>

      </div>

      {/* Bill Details Modal */}
      <BillDetailsModal
        vendorBills={selectedBills}
        isOpen={selectedBills.length > 0}
        onClose={() => setSelectedBills([])}
        onEdit={(bill) => {
          setSelectedBills([]);
          setEditingBill(bill);
        }}
      />

      {/* Edit Bill Modal */}
      {editingBill && (
        <EditBillModal
          bill={editingBill}
          isOpen={!!editingBill}
          onClose={() => setEditingBill(null)}
        />
      )}
    </div>
  );
};
