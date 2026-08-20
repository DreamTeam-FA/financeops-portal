import React, { useState, useEffect } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { getUserGreetingName, getViewerFormattedTime } from "../../utils/userGreeting";
import {
  CreditCard, Building2, Receipt, Users, Landmark, TrendingDown,
  FileText, CalendarDays, Activity, ArrowUpRight, ShieldCheck
} from "lucide-react";
import { PageRoute } from "../../types";

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

  const greetingName = getUserGreetingName(userEmail, googleUser?.displayName);

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

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e2e8f0]"}`}>
      <PageHeader title="Finance Overview" bgClass={isLight ? "bg-gradient-to-r from-slate-800 to-slate-900 text-white" : "bg-gradient-to-r from-[#0d1526] to-[#0f1a30] border-b border-[#1e2840]"} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

        {/* Welcome bar */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b ${isLight ? "border-slate-200" : "border-[#1f1f1f]"}`}>
          <div>
            <h2 className={`text-xl font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
              Welcome back, {greetingName}
            </h2>
            <p className={`text-xs mt-0.5 font-medium ${isLight ? "text-slate-500" : "text-[#888]"}`}>{currentTimeStr}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold border border-emerald-500/30">
            <ShieldCheck className="w-3.5 h-3.5" /> Portal Active
          </span>
        </div>

        {/* Top KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={kpiCard("bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900")}>
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Cash Balance</div>
            <div className="text-2xl font-black font-mono-num">{fmt(totalCash)}</div>
            <div className="text-[11px] mt-1.5 opacity-75">
              {criticalAccounts.length > 0
                ? `⚠ ${criticalAccounts.length} critical account(s)`
                : lowAccounts.length > 0
                ? `⚠ ${lowAccounts.length} low balance(s)`
                : `${bankAccounts.length} active accounts`}
            </div>
          </div>
          <div className={kpiCard("bg-gradient-to-br from-rose-600 via-rose-700 to-red-950")}>
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">AP Unpaid</div>
            <div className="text-2xl font-black font-mono-num">{fmt(unpaidBills.reduce((s,b) => s+b.amount, 0))}</div>
            <div className="text-[11px] mt-1.5 opacity-75">{overdueBills.length} overdue · {dueSoon.length} due this week</div>
          </div>
          <div className={kpiCard("bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900")}>
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">AR Outstanding</div>
            <div className="text-2xl font-black font-mono-num">{fmt(totalAR)}</div>
            <div className="text-[11px] mt-1.5 opacity-75">{overdueAR.length} overdue invoices</div>
          </div>
          <div className={kpiCard("bg-gradient-to-br from-amber-600 via-amber-700 to-stone-900")}>
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Loans</div>
            <div className="text-2xl font-black font-mono-num">{fmt(totalLoans || totalMonthlyPayments)}</div>
            <div className="text-[11px] mt-1.5 opacity-75">{loans.length} active facilities · {fmt(totalMonthlyPayments)}/mo</div>
          </div>
        </div>

        {/* Module Review Cards — row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Ruby's Payables */}
          <div onClick={() => setCurrentPage("rubys")} className={`${card("cursor-pointer group hover:border-pink-500 transition-all")}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#d81b60] flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-pink-500 transition-colors`}>Ruby's Payables</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#555]"} group-hover:text-pink-500`}/>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Unpaid total</span>
                <span className="font-bold text-red-500">{fmt(rubyBills.reduce((s,b) => s+b.amount,0))}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Open bills</span>
                <span className={`font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{rubyBills.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Overdue</span>
                <span className={`font-bold ${rubyBills.filter(b => b.dueDate && new Date(b.dueDate+"T00:00:00") < today).length > 0 ? "text-red-500" : "text-emerald-500"}`}>
                  {rubyBills.filter(b => b.dueDate && new Date(b.dueDate+"T00:00:00") < today).length}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>In QBO</span>
                <span className={`font-bold ${isLight ? "text-slate-700" : "text-white"}`}>{rubyBills.filter(b => b.inQBO).length}</span>
              </div>
            </div>
          </div>

          {/* TI Payables */}
          <div onClick={() => setCurrentPage("ti")} className={`${card("cursor-pointer group hover:border-blue-500 transition-all")}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#1a73e8] flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-blue-500 transition-colors`}>TI Payables</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#555]"} group-hover:text-blue-500`}/>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Unpaid total</span>
                <span className="font-bold text-red-500">{fmt(tiBills.reduce((s,b) => s+b.amount,0))}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Open bills</span>
                <span className={`font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{tiBills.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Overdue</span>
                <span className={`font-bold ${tiBills.filter(b => b.dueDate && new Date(b.dueDate+"T00:00:00") < today).length > 0 ? "text-red-500" : "text-emerald-500"}`}>
                  {tiBills.filter(b => b.dueDate && new Date(b.dueDate+"T00:00:00") < today).length}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>In QBO</span>
                <span className={`font-bold ${isLight ? "text-slate-700" : "text-white"}`}>{tiBills.filter(b => b.inQBO).length}</span>
              </div>
            </div>
          </div>

          {/* MSDx Payables */}
          <div onClick={() => setCurrentPage("msdx")} className={`${card("cursor-pointer group hover:border-teal-500 transition-all")}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00897b] flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-teal-500 transition-colors`}>MSDx Payables</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#555]"} group-hover:text-teal-500`}/>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Unpaid total</span>
                <span className="font-bold text-red-500">{fmt(msdxBills.reduce((s,b) => s+b.amount,0))}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Open bills</span>
                <span className={`font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{msdxBills.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Overdue</span>
                <span className={`font-bold ${msdxBills.filter(b => b.dueDate && new Date(b.dueDate+"T00:00:00") < today).length > 0 ? "text-red-500" : "text-emerald-500"}`}>
                  {msdxBills.filter(b => b.dueDate && new Date(b.dueDate+"T00:00:00") < today).length}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>In QBO</span>
                <span className={`font-bold ${isLight ? "text-slate-700" : "text-white"}`}>{msdxBills.filter(b => b.inQBO).length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Module Review Cards — row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Bank Balances */}
          <div onClick={() => setCurrentPage("banks")} className={`${card("cursor-pointer group hover:border-cyan-500 transition-all")}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0891b2] flex items-center justify-center">
                  <Landmark className="w-4 h-4 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-cyan-500 transition-colors`}>Bank Balances</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#555]"} group-hover:text-cyan-500`}/>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Total cash</span>
                <span className={`font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{fmt(totalCash)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Accounts</span>
                <span className={`font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{bankAccounts.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Low balance (&lt;$1k)</span>
                <span className={`font-bold ${lowAccounts.length > 0 ? "text-amber-500" : "text-emerald-500"}`}>{lowAccounts.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Critical (&lt;$500)</span>
                <span className={`font-bold ${criticalAccounts.length > 0 ? "text-red-500" : "text-emerald-500"}`}>{criticalAccounts.length}</span>
              </div>
            </div>
          </div>

          {/* AR Monitoring */}
          <div onClick={() => setCurrentPage("ar")} className={`${card("cursor-pointer group hover:border-green-500 transition-all")}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#16a34a] flex items-center justify-center">
                  <Receipt className="w-4 h-4 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-green-500 transition-colors`}>AR Monitoring</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#555]"} group-hover:text-green-500`}/>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Outstanding</span>
                <span className="font-bold text-indigo-500">{fmt(totalAR)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Open invoices</span>
                <span className={`font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{unpaidAR.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Overdue</span>
                <span className={`font-bold ${overdueAR.length > 0 ? "text-red-500" : "text-emerald-500"}`}>{overdueAR.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Total clients</span>
                <span className={`font-bold ${isLight ? "text-slate-700" : "text-white"}`}>{[...new Set(arItems.map(a => a.customer))].length}</span>
              </div>
            </div>
          </div>

          {/* Loans */}
          <div onClick={() => setCurrentPage("loans")} className={`${card("cursor-pointer group hover:border-red-500 transition-all")}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#dc2626] flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-red-500 transition-colors`}>Loans &amp; CC Dues</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#555]"} group-hover:text-red-500`}/>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Outstanding</span>
                <span className="font-bold text-amber-500">{fmt(totalLoans)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Monthly payments</span>
                <span className={`font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{fmt(totalMonthlyPayments)}/mo</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Active facilities</span>
                <span className={`font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{loans.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Module Review Cards — row 3 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Notes & Tasks */}
          <div onClick={() => setCurrentPage("notes")} className={`${card("cursor-pointer group hover:border-violet-500 transition-all")}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#7c3aed] flex items-center justify-center">
                  <FileText className="w-4 h-4 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-violet-500 transition-colors`}>Notes & Tasks</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#555]"} group-hover:text-violet-500`}/>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Pending</span>
                <span className={`font-bold ${openNotes.length > 0 ? "text-violet-500" : isLight ? "text-slate-800" : "text-white"}`}>{openNotes.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>
                  {recentOpenNote ? recentOpenNote.title : "All caught up"}
                </span>
                <span className={`font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{totalNotes} total</span>
              </div>
            </div>
          </div>

          {/* Bank Statements */}
          <div onClick={() => setCurrentPage("statements")} className={`${card("cursor-pointer group hover:border-slate-400 transition-all")}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#374151] flex items-center justify-center">
                  <FileText className="w-4 h-4 text-white"/>
                </div>
                <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} group-hover:text-slate-400 transition-colors`}>Bank Statements</span>
              </div>
              <ArrowUpRight className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#555]"} group-hover:text-slate-300`}/>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Statements on file</span>
                <span className={`font-bold ${isLight ? "text-slate-800" : "text-white"}`}>{bankStatements?.length || 0}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={isLight ? "text-slate-500" : "text-[#888]"}>Pending download</span>
                {(() => { const p = (bankStatements || []).filter((s: any) => !s.downloaded).length; return (
                  <span className={`font-bold ${p > 0 ? "text-[#fb923c]" : isLight ? "text-slate-800" : "text-white"}`}>{p}</span>
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
        <div className={`${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#111] border-[#262626]"} border rounded-xl p-4`}>
          <div className={`flex items-center justify-between border-b pb-3 mb-3 ${isLight ? "border-slate-200" : "border-[#262626]"}`}>
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
