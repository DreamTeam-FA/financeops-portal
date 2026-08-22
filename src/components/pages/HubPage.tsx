import React, { useState, useEffect } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { getUserGreetingName, getViewerFormattedTime } from "../../utils/userGreeting";
import {
  CreditCard, Building2, Receipt, Users, Landmark, TrendingDown, TrendingUp,
  FileText, CalendarDays, Activity, ArrowUpRight, ShieldCheck,
  X, AlertTriangle, CheckCircle2, Info, Zap
} from "lucide-react";
import { PageRoute } from "../../types";

// Module-level: tracks which email has already seen the briefing this JS session.
// Resets to null on logout so the next login always triggers the modal again.
let _lastBriefEmail: string | null = null;

export const HubPage: React.FC = () => {
  const {
    setCurrentPage, apBills, bankAccounts, loans, arItems,
    bankStatements, calendarLocalEvents, quickNotes,
    auditLogs, userEmail, googleUser, theme
  } = useFinance();
  const isLight = theme === "light";

  const [currentTimeStr, setCurrentTimeStr] = useState<string>(getViewerFormattedTime());
  useEffect(() => {
    const t = setInterval(() => setCurrentTimeStr(getViewerFormattedTime()), 10000);
    return () => clearInterval(t);
  }, []);

  // Briefing modal — fires on every login / user switch / re-auth.
  // Module-level _lastBriefEmail resets on logout so next login always triggers.
  const [showBriefing, setShowBriefing] = useState(false);
  useEffect(() => {
    const email = googleUser?.email ?? null;
    if (!email) {
      // Logged out — clear tracker so next login shows the modal
      _lastBriefEmail = null;
      return;
    }
    if (email === _lastBriefEmail) return; // already shown for this login session
    _lastBriefEmail = email;
    const t = setTimeout(() => setShowBriefing(true), 1400);
    return () => clearTimeout(t);
  }, [googleUser?.email]);
  const dismissBriefing = () => setShowBriefing(false);

  const greetingName = getUserGreetingName(userEmail, googleUser?.displayName);

  const getTimeGreeting = () => {
    const now  = new Date();
    const h    = now.getHours();
    const day  = now.getDay();   // 0=Sun … 6=Sat
    const date = now.getDate();
    const pick = (pool: string[]) => pool[date % pool.length];

    const isMon = day === 1, isFri = day === 5;
    const isWeekend = day === 0 || day === 6;

    // Late night
    if (h >= 22) return pick([
      "Burning the midnight oil",
      "Still at it — respect",
      "Night owl mode",
      "The grind never stops, huh",
    ]);

    // Evening
    if (h >= 17) {
      if (isFri) return pick(["Happy Friday evening", "TGIF — good evening", "Week's done — good evening"]);
      if (isWeekend) return pick(["Weekend evening", "Hope the day was good", "Good evening"]);
      return pick(["Good evening", "Evening — long day?", "Hey, good evening", "Almost done for today"]);
    }

    // Afternoon
    if (h >= 12) {
      if (isFri) return pick(["Happy Friday", "Almost the weekend", "TGIF — good afternoon"]);
      if (isWeekend) return pick(["Hope the weekend's treating you well", "Working on a weekend? Legend", "Good afternoon"]);
      return pick(["Good afternoon", "Afternoon — hope the morning was solid", "Hey, good afternoon", "Halfway through the day"]);
    }

    // Early morning
    if (h < 6) return pick([
      "You're up early",
      "Early bird",
      "Catching the worm — good morning",
      "Up before sunrise",
    ]);

    // Morning
    if (isMon) return pick(["New week, let's go — good morning", "Monday morning — ready?", "Week's just starting — good morning"]);
    if (isFri) return pick(["Happy Friday morning", "Last push of the week — good morning", "Almost the weekend — good morning"]);
    if (isWeekend) return pick(["Working weekends? Respect — good morning", "Weekend grind — good morning", "Good morning"]);
    return pick(["Good morning", "Morning — ready to go?", "Hey, good morning", "Rise and shine"]);
  };

  const fmt = (v: number) => "$" + Math.abs(Math.round(v)).toLocaleString("en-US");

  // ── Pre-computed metrics ──────────────────────────────────────────────────
  const today = new Date(); today.setHours(0,0,0,0);
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
  const nextMonth = new Date(today); nextMonth.setDate(today.getDate() + 30);

  const unpaidBills = apBills.filter(b => b.status !== "paid");
  const overdueBills = unpaidBills.filter(b => b.dueDate && new Date(b.dueDate + "T00:00:00") < today);
  const dueSoon = unpaidBills.filter(b => {
    const d = b.dueDate ? new Date(b.dueDate + "T00:00:00") : null;
    return d && d >= today && d <= nextWeek;
  });

  // AP by entity
  const rubyBills = unpaidBills.filter(b => b.entity === "Ruby's");
  const msdxBills = unpaidBills.filter(b => b.entity === "MSDx");
  const tiBills   = unpaidBills.filter(b => b.entity === "TI");

  const totalCash = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const totalYesterday = bankAccounts.reduce((s, a) => s + (a.yesterday ?? a.balance), 0);
  const cashDelta = totalCash - totalYesterday;
  const lowAccounts = bankAccounts.filter(a => a.balance < 1000);
  const criticalAccounts = bankAccounts.filter(a => a.balance < 500);

  const totalLoans = loans.reduce((s, l) => s + (l.outstanding || 0), 0);
  const totalMonthlyPayments = loans.reduce((s, l) => s + (l.monthly || 0), 0);

  const unpaidAR = arItems.filter(a => !a.payment);
  const totalAR = unpaidAR.reduce((s, a) => s + a.amount, 0);
  const overdueAR = unpaidAR.filter(a => a.dueDate && new Date(a.dueDate + "T00:00:00") < today);

  const openNotes = (quickNotes || []).filter(n => n.status !== "done" && n.itemType !== "folder");
  const totalNotes = (quickNotes || []).filter(n => n.itemType !== "folder").length;
  const recentOpenNote = openNotes[0];
  const todayStr = today.toISOString().slice(0, 10);
  const todayEvents = (calendarLocalEvents || []).filter(e => e.date === todayStr && !e.done);
  const upcomingEvents = (calendarLocalEvents || []).filter(e => {
    const d = e.date ? new Date(e.date + "T00:00:00") : null;
    return d && d >= today && d <= nextMonth && !e.done;
  });

  const card = (cls: string) =>
    `card-3d p-4 ${cls}`;

  const kpiCard = (bg: string) =>
    `kpi-card ${bg}`;

  // ── Daily briefing data ───────────────────────────────────────────────────
  const briefingHour = new Date().getHours();
  const briefingCtx  = briefingHour < 12 ? "morning" : briefingHour < 17 ? "afternoon" : "evening";
  const briefingIntro: Record<string, string> = {
    morning:   "Here's what's on your plate today.",
    afternoon: "Here's where things stand right now.",
    evening:   "Here's your end-of-day snapshot.",
  };

  type BriefItem = { icon: React.ReactNode; label: string; detail: string; level: "critical" | "warn" | "ok" | "info"; page?: PageRoute };
  const briefItems: BriefItem[] = [];

  if (overdueBills.length > 0)
    briefItems.push({ icon: <AlertTriangle className="w-3.5 h-3.5" />, label: "Overdue AP Bills", detail: `${overdueBills.length} bill${overdueBills.length > 1 ? "s" : ""} past due`, level: "critical", page: "ap" });
  if (dueSoon.length > 0)
    briefItems.push({ icon: <CreditCard className="w-3.5 h-3.5" />, label: "Bills Due This Week", detail: `${dueSoon.length} upcoming payment${dueSoon.length > 1 ? "s" : ""}`, level: "warn", page: "ap" });
  if (overdueAR.length > 0)
    briefItems.push({ icon: <Receipt className="w-3.5 h-3.5" />, label: "Overdue AR", detail: `${overdueAR.length} invoice${overdueAR.length > 1 ? "s" : ""} uncollected`, level: "critical", page: "ar" });
  if (criticalAccounts.length > 0)
    briefItems.push({ icon: <Landmark className="w-3.5 h-3.5" />, label: "Low Bank Accounts", detail: `${criticalAccounts.length} account${criticalAccounts.length > 1 ? "s" : ""} below $500`, level: "critical", page: "bank" });
  else if (lowAccounts.length > 0)
    briefItems.push({ icon: <Landmark className="w-3.5 h-3.5" />, label: "Watch: Bank Balances", detail: `${lowAccounts.length} account${lowAccounts.length > 1 ? "s" : ""} below $1,000`, level: "warn", page: "bank" });
  if (todayEvents.length > 0)
    briefItems.push({ icon: <CalendarDays className="w-3.5 h-3.5" />, label: "Events Today", detail: `${todayEvents.length} item${todayEvents.length > 1 ? "s" : ""} on the calendar`, level: "info", page: "calendar" });
  if (openNotes.length > 0)
    briefItems.push({ icon: <FileText className="w-3.5 h-3.5" />, label: "Open Tasks", detail: `${openNotes.length} pending note${openNotes.length > 1 ? "s" : ""}`, level: "info" });
  if (briefItems.length === 0)
    briefItems.push({ icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "All Clear", detail: "No urgent items — you're in good shape today.", level: "ok" });

  const levelStyle: Record<BriefItem["level"], { dot: string; text: string; bg: string }> = {
    critical: { dot: "bg-red-500",    text: "text-red-400",    bg: isLight ? "bg-red-50 border-red-200"    : "bg-red-500/8 border-red-500/20" },
    warn:     { dot: "bg-amber-400",  text: "text-amber-400",  bg: isLight ? "bg-amber-50 border-amber-200" : "bg-amber-500/8 border-amber-500/20" },
    info:     { dot: "bg-blue-400",   text: "text-blue-400",   bg: isLight ? "bg-blue-50 border-blue-200"   : "bg-blue-500/8 border-blue-500/20" },
    ok:       { dot: "bg-emerald-400",text: "text-emerald-400",bg: isLight ? "bg-emerald-50 border-emerald-200" : "bg-emerald-500/8 border-emerald-500/20" },
  };

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e2e8f0]"}`}>
      <PageHeader title="Finance Overview" bgClass="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border-b border-white/10" />

      {/* ── Daily Briefing Modal ─────────────────────────────────────────── */}
      {showBriefing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(4,7,14,0.72)", backdropFilter: "blur(6px)" }}
          onClick={dismissBriefing}
        >
          <div
            className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl ${isLight ? "bg-white border border-slate-200" : "border border-[#1e2d45]"}`}
            style={isLight ? {} : { background: "linear-gradient(145deg, #0d1525 0%, #0a1020 100%)", boxShadow: "0 24px 64px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.04)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className={`text-[11px] font-bold uppercase tracking-widest ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Daily Briefing</span>
                </div>
                <h3 className={`text-[17px] font-bold leading-snug ${isLight ? "text-slate-900" : "text-white"}`}>
                  {getTimeGreeting()}, <span className={isLight ? "text-blue-600" : "text-blue-400"}>{greetingName}</span>
                </h3>
                <p className={`text-[12px] mt-0.5 ${isLight ? "text-slate-500" : "text-[#5a7090]"}`}>{briefingIntro[briefingCtx]}</p>
              </div>
              <button
                onClick={dismissBriefing}
                className={`mt-0.5 p-1.5 rounded-lg transition-colors shrink-0 ${isLight ? "hover:bg-slate-100 text-slate-400" : "hover:bg-white/6 text-[#4a6080]"}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Divider */}
            <div className={`mx-5 h-px ${isLight ? "bg-slate-100" : "bg-[#1a2a3a]"}`} />

            {/* Items */}
            <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
              {briefItems.map((item, i) => {
                const s = levelStyle[item.level];
                return (
                  <div
                    key={i}
                    onClick={() => { if (item.page) { setCurrentPage(item.page); dismissBriefing(); } }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${s.bg} ${item.page ? "cursor-pointer hover:scale-[1.01]" : ""}`}
                    style={{ transition: "transform 0.15s ease, box-shadow 0.15s ease" }}
                  >
                    <span className={`${s.text} shrink-0`}>{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12px] font-semibold leading-tight ${isLight ? "text-slate-800" : "text-[#c8d8e8]"}`}>{item.label}</div>
                      <div className={`text-[11px] mt-0.5 ${isLight ? "text-slate-500" : "text-[#5a7090]"}`}>{item.detail}</div>
                    </div>
                    {item.page && <ArrowUpRight className={`w-3 h-3 shrink-0 ${s.text} opacity-60`} />}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className={`px-5 py-3 border-t flex items-center justify-between ${isLight ? "border-slate-100" : "border-[#1a2a3a]"}`}>
              <span className={`text-[11px] ${isLight ? "text-slate-400" : "text-[#3d5478]"}`}>{currentTimeStr}</span>
              <button
                onClick={dismissBriefing}
                className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${isLight ? "bg-slate-900 text-white hover:bg-slate-700" : "bg-white/8 text-[#a0b8d0] hover:bg-white/12"}`}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

        {/* Welcome bar */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
          <div>
            <h2 className={`text-xl font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
              {getTimeGreeting()}, <span className={isLight ? "text-blue-700" : "text-blue-400"}>{greetingName}</span>
            </h2>
            <p className={`text-xs mt-0.5 font-medium flex items-center gap-1.5 ${isLight ? "text-slate-500" : "text-[#6a7f9e]"}`}>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {currentTimeStr}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[11px] font-bold border border-emerald-500/25 shadow-sm shadow-emerald-500/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            Portal Active
          </span>
        </div>

        {/* Top KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          {/* Cash Balance */}
          <div
            className={`${kpiCard("bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900")} cursor-pointer group`}
            onClick={() => setCurrentPage("banks")}
            title="View bank balances"
          >
            <div className="flex items-start justify-between mb-1">
              <div className="text-[10px] font-extrabold uppercase tracking-widest opacity-55">Cash Balance</div>
              {cashDelta !== 0 && (
                <div className={`flex items-center gap-0.5 text-[10px] font-bold ${cashDelta > 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {cashDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {cashDelta > 0 ? "+" : ""}{fmt(cashDelta)}
                </div>
              )}
            </div>
            <div className="text-[26px] leading-none font-black font-mono-num drop-shadow-sm mt-1">{fmt(totalCash)}</div>
            <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between">
              <span className="text-[11px] opacity-70">
                {criticalAccounts.length > 0
                  ? `⚠ ${criticalAccounts.length} critical`
                  : lowAccounts.length > 0
                  ? `⚠ ${lowAccounts.length} low`
                  : `${bankAccounts.length} accounts`}
              </span>
              <ArrowUpRight className="w-3 h-3 opacity-30 group-hover:opacity-70 transition-opacity" />
            </div>
          </div>

          {/* AP Unpaid */}
          <div
            className={`${kpiCard("bg-gradient-to-br from-rose-600 via-rose-700 to-red-950")} cursor-pointer group`}
            onClick={() => setCurrentPage("ap")}
            title="View AP bills"
          >
            <div className="text-[10px] font-extrabold uppercase tracking-widest opacity-55 mb-1">AP Unpaid</div>
            <div className="text-[26px] leading-none font-black font-mono-num drop-shadow-sm mt-1">{fmt(unpaidBills.reduce((s,b) => s+b.amount, 0))}</div>
            <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between">
              <span className="text-[11px]">
                {overdueBills.length > 0
                  ? <span className="text-red-200 font-bold">⚠ {overdueBills.length} overdue</span>
                  : <span className="opacity-70">0 overdue</span>}
                <span className="opacity-50 mx-1">·</span>
                <span className="opacity-70">{dueSoon.length} this week</span>
              </span>
              <ArrowUpRight className="w-3 h-3 opacity-30 group-hover:opacity-70 transition-opacity" />
            </div>
          </div>

          {/* AR Outstanding */}
          <div
            className={`${kpiCard("bg-gradient-to-br from-violet-600 via-indigo-700 to-slate-900")} cursor-pointer group`}
            onClick={() => setCurrentPage("ar")}
            title="View AR"
          >
            <div className="text-[10px] font-extrabold uppercase tracking-widest opacity-55 mb-1">AR Outstanding</div>
            <div className="text-[26px] leading-none font-black font-mono-num drop-shadow-sm mt-1">{fmt(totalAR)}</div>
            <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between">
              <span className="text-[11px]">
                {overdueAR.length > 0
                  ? <span className="text-red-300 font-bold">⚠ {overdueAR.length} overdue</span>
                  : <span className="opacity-70">{unpaidAR.length} open</span>}
                <span className="opacity-50 mx-1">·</span>
                <span className="opacity-70">{unpaidAR.length - overdueAR.length} current</span>
              </span>
              <ArrowUpRight className="w-3 h-3 opacity-30 group-hover:opacity-70 transition-opacity" />
            </div>
          </div>

          {/* Loans */}
          <div
            className={`${kpiCard("bg-gradient-to-br from-amber-600 via-orange-600 to-stone-900")} cursor-pointer group`}
            onClick={() => setCurrentPage("loans")}
            title="View loans"
          >
            <div className="text-[10px] font-extrabold uppercase tracking-widest opacity-55 mb-1">Loans Outstanding</div>
            <div className="text-[26px] leading-none font-black font-mono-num drop-shadow-sm mt-1">{fmt(totalLoans || totalMonthlyPayments)}</div>
            <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between">
              <span className="text-[11px] opacity-70">{loans.length} facilities · {fmt(totalMonthlyPayments)}/mo</span>
              <ArrowUpRight className="w-3 h-3 opacity-30 group-hover:opacity-70 transition-opacity" />
            </div>
          </div>

        </div>

        {/* ── Overdue AP Alert Banner — always visible when bills are past due ── */}
        {overdueBills.length > 0 && (() => {
          const totalOverdue = overdueBills.reduce((s, b) => s + b.amount, 0);
          const topVendors   = [...overdueBills]
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 3);
          return (
            <div
              className={`rounded-xl border px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 ${
                isLight
                  ? "bg-red-50 border-red-200"
                  : "border-red-500/25 bg-gradient-to-r from-red-950/70 via-rose-950/50 to-[#0d111a]"
              }`}
              style={isLight ? {} : { boxShadow: "0 0 28px rgba(239,68,68,0.10), inset 0 1px 0 rgba(255,255,255,0.03)" }}
            >
              {/* Icon + counts */}
              <div className="flex items-center gap-3 shrink-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isLight ? "bg-red-100" : "bg-red-500/15"}`}>
                  <AlertTriangle className="w-4.5 h-4.5 text-red-500 animate-pulse" />
                </div>
                <div>
                  <p className={`text-[13px] font-bold leading-tight ${isLight ? "text-red-700" : "text-red-400"}`}>
                    {overdueBills.length} bill{overdueBills.length !== 1 ? "s" : ""} past due
                  </p>
                  <p className={`text-[11px] font-semibold tabular-nums ${isLight ? "text-red-500" : "text-red-500/80"}`}>
                    {fmt(totalOverdue)} total overdue
                  </p>
                </div>
              </div>

              {/* Vendor chips */}
              <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                {topVendors.map(b => (
                  <span
                    key={b.id}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      isLight ? "bg-red-100 border-red-200 text-red-700" : "bg-red-500/10 border-red-500/20 text-red-400"
                    }`}
                  >
                    {b.vendor}
                    <span className={`font-bold ${isLight ? "text-red-800" : "text-red-300"}`}>{fmt(b.amount)}</span>
                  </span>
                ))}
                {overdueBills.length > 3 && (
                  <span className={`text-[10px] ${isLight ? "text-red-400" : "text-red-500/60"}`}>
                    +{overdueBills.length - 3} more
                  </span>
                )}
              </div>

              {/* CTA */}
              <button
                onClick={() => setCurrentPage("ap")}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-bold transition-all ${
                  isLight
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                View Overdue
              </button>
            </div>
          );
        })()}

        {/* Module Review Cards — row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Ruby's Payables */}
          <div onClick={() => setCurrentPage("rubys")} className={`${card("cursor-pointer group transition-all")}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-700 flex items-center justify-center shadow-md shadow-pink-500/30 shrink-0">
                  <CreditCard className="w-4.5 h-4.5 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-pink-400 transition-colors`}>Ruby's Payables</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-300" : "text-[#3d5478]"} group-hover:text-pink-400 transition-colors`}/>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Unpaid total</span>
                <span className="text-sm font-black text-red-500 font-mono-num">{fmt(rubyBills.reduce((s,b) => s+b.amount,0))}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Open bills</span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-800" : "text-slate-200"}`}>{rubyBills.length}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Overdue</span>
                <span className={`text-sm font-bold font-mono-num ${rubyBills.filter(b => b.dueDate && new Date(b.dueDate+"T00:00:00") < today).length > 0 ? "text-red-500" : "text-emerald-500"}`}>
                  {rubyBills.filter(b => b.dueDate && new Date(b.dueDate+"T00:00:00") < today).length}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>In QBO</span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-700" : "text-slate-200"}`}>{rubyBills.filter(b => b.inQBO).length}</span>
              </div>
            </div>
          </div>

          {/* TI Payables */}
          <div onClick={() => setCurrentPage("ti")} className={`${card("cursor-pointer group transition-all")}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md shadow-blue-500/30 shrink-0">
                  <Building2 className="w-4.5 h-4.5 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-blue-400 transition-colors`}>TI Payables</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-300" : "text-[#3d5478]"} group-hover:text-blue-400 transition-colors`}/>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Unpaid total</span>
                <span className="text-sm font-black text-red-500 font-mono-num">{fmt(tiBills.reduce((s,b) => s+b.amount,0))}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Open bills</span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-800" : "text-slate-200"}`}>{tiBills.length}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Overdue</span>
                <span className={`text-sm font-bold font-mono-num ${tiBills.filter(b => b.dueDate && new Date(b.dueDate+"T00:00:00") < today).length > 0 ? "text-red-500" : "text-emerald-500"}`}>
                  {tiBills.filter(b => b.dueDate && new Date(b.dueDate+"T00:00:00") < today).length}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>In QBO</span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-700" : "text-slate-200"}`}>{tiBills.filter(b => b.inQBO).length}</span>
              </div>
            </div>
          </div>

          {/* MSDx Payables */}
          <div onClick={() => setCurrentPage("msdx")} className={`${card("cursor-pointer group transition-all")}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-700 flex items-center justify-center shadow-md shadow-teal-500/30 shrink-0">
                  <Building2 className="w-4.5 h-4.5 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-teal-400 transition-colors`}>MSDx Payables</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-300" : "text-[#3d5478]"} group-hover:text-teal-400 transition-colors`}/>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Unpaid total</span>
                <span className="text-sm font-black text-red-500 font-mono-num">{fmt(msdxBills.reduce((s,b) => s+b.amount,0))}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Open bills</span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-800" : "text-slate-200"}`}>{msdxBills.length}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Overdue</span>
                <span className={`text-sm font-bold font-mono-num ${msdxBills.filter(b => b.dueDate && new Date(b.dueDate+"T00:00:00") < today).length > 0 ? "text-red-500" : "text-emerald-500"}`}>
                  {msdxBills.filter(b => b.dueDate && new Date(b.dueDate+"T00:00:00") < today).length}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>In QBO</span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-700" : "text-slate-200"}`}>{msdxBills.filter(b => b.inQBO).length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Module Review Cards — row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Bank Balances */}
          <div onClick={() => setCurrentPage("banks")} className={`${card("cursor-pointer group transition-all")}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-700 flex items-center justify-center shadow-md shadow-cyan-500/30 shrink-0">
                  <Landmark className="w-4.5 h-4.5 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-cyan-400 transition-colors`}>Bank Balances</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-300" : "text-[#3d5478]"} group-hover:text-cyan-400 transition-colors`}/>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Total cash</span>
                <span className={`text-sm font-black font-mono-num ${isLight ? "text-slate-900" : "text-slate-200"}`}>{fmt(totalCash)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Accounts</span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-800" : "text-slate-200"}`}>{bankAccounts.length}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Low balance (&lt;$1k)</span>
                <span className={`text-sm font-bold font-mono-num ${lowAccounts.length > 0 ? "text-amber-500" : "text-emerald-500"}`}>{lowAccounts.length}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Critical (&lt;$500)</span>
                <span className={`text-sm font-bold font-mono-num ${criticalAccounts.length > 0 ? "text-red-500" : "text-emerald-500"}`}>{criticalAccounts.length}</span>
              </div>
            </div>
          </div>

          {/* AR Monitoring */}
          <div onClick={() => setCurrentPage("ar")} className={`${card("cursor-pointer group transition-all")}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center shadow-md shadow-emerald-500/30 shrink-0">
                  <Receipt className="w-4.5 h-4.5 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-emerald-400 transition-colors`}>AR Monitoring</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-300" : "text-[#3d5478]"} group-hover:text-emerald-400 transition-colors`}/>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Outstanding</span>
                <span className="text-sm font-black font-mono-num text-indigo-500">{fmt(totalAR)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Open invoices</span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-800" : "text-slate-200"}`}>{unpaidAR.length}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Overdue</span>
                <span className={`text-sm font-bold font-mono-num ${overdueAR.length > 0 ? "text-red-500" : "text-emerald-500"}`}>{overdueAR.length}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Total clients</span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-700" : "text-slate-200"}`}>{[...new Set(arItems.map(a => a.customer))].length}</span>
              </div>
            </div>
          </div>

          {/* Loans */}
          <div onClick={() => setCurrentPage("loans")} className={`${card("cursor-pointer group transition-all")}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center shadow-md shadow-rose-500/30 shrink-0">
                  <TrendingDown className="w-4.5 h-4.5 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-rose-400 transition-colors`}>Loans &amp; CC Dues</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-300" : "text-[#3d5478]"} group-hover:text-rose-400 transition-colors`}/>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Outstanding</span>
                <span className="text-sm font-black font-mono-num text-amber-500">{fmt(totalLoans)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Monthly payments</span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-800" : "text-slate-200"}`}>{fmt(totalMonthlyPayments)}/mo</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Active facilities</span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-800" : "text-slate-200"}`}>{loans.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Module Review Cards — row 3 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Notes & Tasks */}
          <div onClick={() => setCurrentPage("notes")} className={`${card("cursor-pointer group transition-all")}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-md shadow-violet-500/30 shrink-0">
                  <FileText className="w-4.5 h-4.5 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-violet-400 transition-colors`}>Notes & Tasks</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-300" : "text-[#3d5478]"} group-hover:text-violet-400 transition-colors`}/>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Pending</span>
                <span className={`text-sm font-bold font-mono-num ${openNotes.length > 0 ? "text-violet-500" : isLight ? "text-slate-800" : "text-slate-200"}`}>{openNotes.length}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>
                  {recentOpenNote ? recentOpenNote.title : "All caught up"}
                </span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-800" : "text-slate-200"}`}>{totalNotes} total</span>
              </div>
            </div>
          </div>

          {/* Bank Statements */}
          <div onClick={() => setCurrentPage("statements")} className={`${card("cursor-pointer group transition-all")}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-md shadow-black/30 shrink-0">
                  <FileText className="w-4.5 h-4.5 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-slate-300 transition-colors`}>Bank Statements</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-300" : "text-[#3d5478]"} group-hover:text-slate-300 transition-colors`}/>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Statements on file</span>
                <span className={`text-sm font-bold font-mono-num ${isLight ? "text-slate-800" : "text-slate-200"}`}>{bankStatements?.length || 0}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>Pending download</span>
                {(() => { const p = (bankStatements || []).filter((s: any) => !s.downloaded).length; return (
                  <span className={`text-sm font-bold font-mono-num ${p > 0 ? "text-amber-500" : isLight ? "text-slate-800" : "text-slate-200"}`}>{p}</span>
                ); })()}
              </div>
            </div>
          </div>

          {/* Finance Calendar */}
          <div onClick={() => setCurrentPage("calendar")} className={`${card("cursor-pointer group hover:border-blue-500 transition-all")}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#2563eb] flex items-center justify-center">
                  <CalendarDays className="w-4 h-4 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-blue-500 transition-colors`}>Finance Calendar</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#555]"} group-hover:text-blue-500`}/>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Today</span>
                <span className={`font-bold ${todayEvents.length > 0 ? "text-blue-400" : isLight ? "text-slate-700" : "text-white"}`}>
                  {todayEvents.length > 0 ? `${todayEvents.length} event${todayEvents.length > 1 ? "s" : ""}` : "None"}
                </span>
              </div>
              {todayEvents.length > 0 && (
                <div className="flex justify-between text-xs">
                  <span className={isLight ? "text-slate-500" : "text-[#888]"}></span>
                  <span className={`font-medium truncate max-w-[180px] text-blue-400`}>
                    {todayEvents.map((e: any) => e.description || e.vendor || e.title || "Event").join(" · ")}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Upcoming (30 days)</span>
                <span className={`font-bold ${upcomingEvents.length > 0 ? "text-blue-500" : isLight ? "text-slate-700" : "text-white"}`}>{upcomingEvents.length}</span>
              </div>
              {upcomingEvents[0] && (
                <div className="flex justify-between text-xs">
                  <span className={isLight ? "text-slate-500" : "text-[#888]"}>Next</span>
                  <span className={`font-bold truncate max-w-[140px] ${isLight ? "text-slate-800" : "text-white"}`}>
                    {(upcomingEvents[0] as any).description || (upcomingEvents[0] as any).vendor || (upcomingEvents[0] as any).title}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Audit Log */}
        <div className={`${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4`}>
          <div className={`flex items-center justify-between border-b pb-3 mb-3 ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500"/>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-slate-900" : "text-white"}`}>
                Live Audit Log
              </h3>
            </div>
            <span className={`text-[10px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>Auto-logged events</span>
          </div>
          <div className="space-y-2 max-h-44 overflow-y-auto">
            {auditLogs?.length > 0 ? (
              auditLogs.map((log, idx) => (
                <div key={idx} className={`flex items-start justify-between text-[11px] py-1 border-b ${isLight ? "border-slate-100" : "border-[#1c1c1c]"} last:border-none`}>
                  <div>
                    <span className="font-semibold text-blue-500">{log.action}: </span>
                    <span className={isLight ? "text-slate-700" : "text-[#ccc]"}>{log.details}</span>
                  </div>
                  <div className={`${isLight ? "text-slate-400" : "text-[#666]"} shrink-0 ml-2 font-mono text-[10px]`}>{log.timestamp}</div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-xs text-[#666]">No recent activity logged yet.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
