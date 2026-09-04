import React, { useState, useEffect } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { TrendingDown, Calendar, ShieldAlert, Clock, LayoutGrid, Table, Edit2, Trash2, X, AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { Tooltip } from "../Tooltip";
import { exportLoansCSV } from "../../utils/exportUtils";
import { AddLoanModal, EditLoanModal } from "../modals/AddBankModal";
import { Loan } from "../../types";
import { formatCurrency, getDaysRemaining } from "../../utils/formatters";

export const LoansPage: React.FC = () => {
  const { loans, selectedEntities, theme, deleteLoan, searchHighlightId, setSearchHighlightId } = useFinance() as any;
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Deep-link: open loan edit modal for the item from global search
  useEffect(() => {
    if (!searchHighlightId) return;
    const loan = (loans as Loan[]).find(l => l.id === searchHighlightId);
    if (!loan) return;
    const timer = setTimeout(() => {
      setEditingLoan(loan);
      (setSearchHighlightId as any)(null);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchHighlightId, loans]);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [deletingLoanId, setDeletingLoanId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [categoryTab, setCategoryTab] = useState<"all" | "loans" | "cards">("all");

  const isLight = theme === "light";

  const isCreditCard = (item: Loan) => {
    const str = `${item.lender} ${item.purpose}`.toLowerCase();
    return str.includes("card") || str.includes("credit") || str.includes("cc") || str.includes("visa") || str.includes("amex") || str.includes("mastercard");
  };

  const getDueUrgency = (nextPayStr: string) => {
    const daysInfo = getDaysRemaining(nextPayStr);
    const days = daysInfo.days;

    if (days <= 3) {
      return {
        status: daysInfo.text,
        days,
        badge: `bg-red-500/15 ${isLight ? "text-red-600" : "text-red-400"} border border-red-500/30`,
        cardBorder: "border-l-4 border-l-red-500",
        icon: <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
      };
    } else if (days <= 10) {
      return {
        status: daysInfo.text,
        days,
        badge: `bg-amber-500/15 ${isLight ? "text-amber-600" : "text-amber-400"} border border-amber-500/30`,
        cardBorder: "border-l-4 border-l-amber-500",
        icon: <Clock className="w-3.5 h-3.5 text-amber-500" />
      };
    } else {
      return {
        status: daysInfo.text,
        days,
        badge: `bg-emerald-500/15 ${isLight ? "text-emerald-600" : "text-emerald-400"} border border-emerald-500/30`,
        cardBorder: "border-l-4 border-l-emerald-500",
        icon: <Calendar className="w-3.5 h-3.5 text-emerald-500" />
      };
    }
  };

  const entityFiltered = loans.filter(
    (l) => selectedEntities.has("ALL") || selectedEntities.has(l.entity)
  );

  // Sort near due date first
  const sorted = [...entityFiltered].sort((a, b) => {
    return getDueUrgency(a.nextPay).days - getDueUrgency(b.nextPay).days;
  });

  const finalFiltered = sorted.filter((l) => {
    if (categoryTab === "loans") return !isCreditCard(l);
    if (categoryTab === "cards") return isCreditCard(l);
    return true;
  });

  const termLoansList = sorted.filter((l) => !isCreditCard(l));
  const creditCardsList = sorted.filter((l) => isCreditCard(l));

  const totalMonthly = finalFiltered.reduce((s, l) => s + l.monthly, 0);

  const getEntityBadge = (entity: string) => {
    if (entity.includes("Ruby")) return "bg-[#d81b60]/20 text-[#e91e63]";
    if (entity.includes("MSDx")) return "bg-[#00897b]/20 text-[#00897b]";
    if (entity.includes("Curcumin")) return "bg-[#6d4c41]/20 text-[#8d6e63]";
    return "bg-[#1a73e8]/20 text-[#1a73e8]";
  };

  const dueSoonCount = entityFiltered.filter((l) => getDueUrgency(l.nextPay).days <= 0).length;
  const nearDueCount = entityFiltered.filter((l) => getDueUrgency(l.nextPay).days > 0 && getDueUrgency(l.nextPay).days <= 10).length;

  // Group items into urgency buckets for sectioned display
  const URGENCY_GROUPS = [
    {
      key: "due-soon",
      label: "Due Soon",
      sublabel: "≤ 3 days",
      icon: <ShieldAlert className="w-4 h-4 text-red-500" />,
      headerCls: "border-red-500/30 bg-red-500/8",
      labelCls: isLight ? "text-red-600" : "text-red-400",
      countCls: isLight ? "bg-red-500/15 text-red-600 border border-red-500/30" : "bg-red-500/15 text-red-400 border border-red-500/30",
      match: (days: number) => days <= 3,
    },
    {
      key: "near-due",
      label: "Near Due",
      sublabel: "4 – 10 days",
      icon: <Clock className="w-4 h-4 text-amber-500" />,
      headerCls: "border-amber-500/30 bg-amber-500/8",
      labelCls: isLight ? "text-amber-600" : "text-amber-400",
      countCls: isLight ? "bg-amber-500/15 text-amber-600 border border-amber-500/30" : "bg-amber-500/15 text-amber-400 border border-amber-500/30",
      match: (days: number) => days > 3 && days <= 10,
    },
    {
      key: "upcoming",
      label: "Upcoming",
      sublabel: "> 10 days",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      headerCls: "border-emerald-500/30 bg-emerald-500/8",
      labelCls: isLight ? "text-emerald-600" : "text-emerald-400",
      countCls: isLight ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
      match: (days: number) => days > 10,
    },
  ] as const;

  const groupedItems = URGENCY_GROUPS.map((g) => ({
    ...g,
    items: finalFiltered.filter((l) => g.match(getDueUrgency(l.nextPay).days)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader
        title="Loans Monitoring"
        bgClass="bg-[#dc2626]"
        moduleId="loans"
        showEntityPills={true}
        extraButtons={
          <button onClick={() => exportLoansCSV(loans)} className="btn-3d btn-3d-ghost font-semibold" title="Export to CSV">
            <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">CSV</span>
          </button>
        }
        onAddClick={() => setIsAddOpen(true)}
        addLabel="Add Loan"
        sheetUrl="https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit#gid=860453470"
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>
              Total Monthly Payment
            </div>
            <div className="text-2xl font-extrabold text-[#dc2626] mt-1">
              {formatCurrency(totalMonthly)}
            </div>
            <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"} mt-1`}>
              Monthly debt service obligation
            </div>
          </div>

          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>
              Payment Urgency Breakdown
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-sm font-bold px-2 py-0.5 rounded bg-red-500/15 ${isLight ? "text-red-600" : "text-red-400"} border border-red-500/30`}>
                {dueSoonCount} Due Soon
              </span>
              <span className={`text-sm font-bold px-2 py-0.5 rounded bg-amber-500/15 ${isLight ? "text-amber-600" : "text-amber-400"} border border-amber-500/30`}>
                {nearDueCount} Near Due
              </span>
            </div>
            <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"} mt-1`}>
              Tracked by due date distance
            </div>
          </div>

          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>
              Active Facilities
            </div>
            <div className={`text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"} mt-1`}>{finalFiltered.length}</div>
            <div className="text-[11px] text-emerald-600 dark:text-[#4ade80] mt-1">Monitored active loans</div>
          </div>
        </div>

        {/* Category & View Toggle Bar */}
        <div className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-3 rounded-xl border gap-3 ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
          {/* Category Tabs: All, Term Loans, Credit Cards */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setCategoryTab("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                categoryTab === "all"
                  ? "bg-red-600 text-white shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
                  : isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#1f1f1f] text-[#aaa] hover:text-white"
              }`}
            >
              All Facilities ({entityFiltered.length})
            </button>
            <button
              onClick={() => setCategoryTab("loans")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                categoryTab === "loans"
                  ? "bg-red-600 text-white shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
                  : isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#1f1f1f] text-[#aaa] hover:text-white"
              }`}
            >
              Term Loans ({termLoansList.length})
            </button>
            <button
              onClick={() => setCategoryTab("cards")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                categoryTab === "cards"
                  ? "bg-red-600 text-white shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
                  : isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#1f1f1f] text-[#aaa] hover:text-white"
              }`}
            >
              Credit Card Dues ({creditCardsList.length})
            </button>
          </div>

          <div className={`flex items-center gap-1 ${isLight ? "bg-slate-200" : "bg-[#0d111a]"} p-1 rounded-lg shrink-0 self-end sm:self-auto`}>
            <button
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                viewMode === "cards"
                  ? isLight
                    ? "bg-white text-slate-900 shadow-sm"
                    : "bg-[#262626] text-white shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
                  : isLight
                    ? "text-slate-500 hover:text-slate-900"
                    : "text-[#888] hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Cards View
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                viewMode === "table"
                  ? isLight
                    ? "bg-white text-slate-900 shadow-sm"
                    : "bg-[#262626] text-white shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
                  : isLight
                    ? "text-slate-500 hover:text-slate-900"
                    : "text-[#888] hover:text-white"
              }`}
            >
              <Table className="w-3.5 h-3.5" /> Table View
            </button>
          </div>
        </div>

        {/* ── Cards View — grouped by urgency ───────────────────────── */}
        {viewMode === "cards" && (
          <div className="space-y-5">
            {groupedItems.map((group) => (
              <div key={group.key}>
                {/* Section header */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-2.5 ${group.headerCls} ${isLight ? "border-opacity-60" : ""}`}>
                  {group.icon}
                  <span className={`text-xs font-black uppercase tracking-wider ${group.labelCls}`}>
                    {group.label}
                  </span>
                  <span className={`text-[10px] font-medium ${isLight ? "text-slate-400" : "text-[#666]"}`}>
                    {group.sublabel}
                  </span>
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${group.countCls}`}>
                    {group.items.length} {group.items.length === 1 ? "facility" : "facilities"}
                  </span>
                </div>

                {/* Cards grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                  {group.items.map((l) => {
                    const urgency = getDueUrgency(l.nextPay);
                    const cardType = isCreditCard(l) ? "Credit Card" : "Term Loan";
                    return (
                      <div
                        key={l.id}
                        data-search-id={l.id}
                        className={`${urgency.cardBorder} ${
                          isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"
                        } border rounded-lg p-2 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] flex flex-col justify-between space-y-1.5 relative overflow-hidden`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1 gap-1 flex-wrap">
                            <div className="flex items-center gap-1">
                              <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${getEntityBadge(l.entity)}`}>
                                {l.entity}
                              </span>
                              <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${isCreditCard(l) ? "bg-purple-500/20 text-purple-600 dark:text-purple-400" : "bg-blue-500/20 text-blue-600 dark:text-blue-400"}`}>
                                {cardType}
                              </span>
                            </div>
                            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${urgency.badge}`}>
                              {urgency.icon}
                              {urgency.days > 0 ? `${urgency.days}d left` : urgency.days === 0 ? "Due today" : `${Math.abs(urgency.days)}d overdue`}
                            </span>
                          </div>
                          <h4 className={`text-xs font-extrabold ${isLight ? "text-slate-900" : "text-white"} truncate`}>{l.lender}</h4>
                          <p className={`text-[9px] ${isLight ? "text-slate-500" : "text-[#888]"} truncate mt-0.5`}>{l.purpose}</p>
                        </div>

                        <div className={`p-1.5 rounded ${isLight ? "bg-slate-50 border border-slate-200" : "bg-[#0d111a] border border-[#222]"}`}>
                          <div className={`text-[8px] font-semibold uppercase ${isLight ? "text-slate-400" : "text-[#666]"}`}>Monthly</div>
                          <div className="text-sm font-black text-red-600 dark:text-red-400 mt-0.5">{formatCurrency(l.monthly)}</div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#1f1f1f] text-[9px]">
                          <div className="flex items-center gap-1 text-slate-600 dark:text-[#aaa]">
                            <Calendar className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                            <span className="font-bold">Due {l.nextPay}</span>
                          </div>
                          <span className="font-extrabold text-slate-600 dark:text-slate-300">
                            {urgency.days > 0 ? `${urgency.days}d` : urgency.days === 0 ? "Today" : `${Math.abs(urgency.days)}d late`}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 pt-1 border-t border-slate-100 dark:border-[#1f1f1f]">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingLoan(l); }}
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[9px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors"
                          >
                            <Edit2 className="w-2.5 h-2.5" /> Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeletingLoanId(l.id); }}
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[9px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-2.5 h-2.5" /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Table View — grouped by urgency ───────────────────────── */}
        {viewMode === "table" && (
          <div className="space-y-4">
            {groupedItems.map((group) => (
              <div key={group.key} className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl overflow-hidden shadow-sm`}>
                {/* Group header row */}
                <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${group.headerCls} ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
                  {group.icon}
                  <span className={`text-xs font-black uppercase tracking-wider ${group.labelCls}`}>{group.label}</span>
                  <span className={`text-[10px] ${isLight ? "text-slate-400" : "text-[#666]"}`}>· {group.sublabel}</span>
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${group.countCls}`}>
                    {group.items.length}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[600px]">
                    <thead>
                      <tr className={`${isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-[#141414] border-[#1a2235] text-[#888]"} border-b font-semibold uppercase tracking-wide`}>
                        <th className="px-4 py-2.5 whitespace-nowrap">Entity</th>
                        <th className="px-4 py-2.5 whitespace-nowrap">Type</th>
                        <th className="px-4 py-2.5 whitespace-nowrap">Lender</th>
                        <th className="px-4 py-2.5 whitespace-nowrap">Purpose</th>
                        <th className="px-4 py-2.5 whitespace-nowrap">Monthly</th>
                        <th className="px-4 py-2.5 whitespace-nowrap">Due Date</th>
                        <th className="px-4 py-2.5 whitespace-nowrap">Status</th>
                        <th className="px-4 py-2.5 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isLight ? "divide-slate-100" : "divide-[#1e1e1e]"}`}>
                      {group.items.map((l) => {
                        const urgency = getDueUrgency(l.nextPay);
                        return (
                          <tr key={l.id} data-search-id={l.id} className={`${isLight ? "hover:bg-slate-50" : "hover:bg-white/5"} transition-colors`}>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getEntityBadge(l.entity)}`}>{l.entity}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isCreditCard(l) ? "bg-purple-500/20 text-purple-600 dark:text-purple-400" : "bg-blue-500/20 text-blue-600 dark:text-blue-400"}`}>
                                {isCreditCard(l) ? "Credit Card" : "Term Loan"}
                              </span>
                            </td>
                            <td className={`px-4 py-3 font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>{l.lender}</td>
                            <td className={`px-4 py-3 ${isLight ? "text-slate-500" : "text-[#888]"}`}>{l.purpose}</td>
                            <td className="px-4 py-3 font-bold whitespace-nowrap text-red-600 dark:text-red-400">{formatCurrency(l.monthly)}</td>
                            <td className={`px-4 py-3 ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>
                              <span className="flex items-center gap-1 font-semibold">
                                <Calendar className="w-3 h-3 text-slate-400" />{l.nextPay}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${urgency.badge}`}>
                                {urgency.icon}
                                {urgency.days > 0 ? `${urgency.days}d remaining` : urgency.days === 0 ? "Due today" : `${Math.abs(urgency.days)}d overdue`}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <Tooltip label="Edit">
                                  <button onClick={() => setEditingLoan(l)} className="p-1.5 rounded hover:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                </Tooltip>
                                <Tooltip label="Delete">
                                  <button onClick={() => setDeletingLoanId(l.id)} className="p-1.5 rounded hover:bg-red-500/10 text-red-600 dark:text-red-400">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </Tooltip>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddLoanModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />

      <EditLoanModal
        loan={editingLoan}
        isOpen={!!editingLoan}
        onClose={() => setEditingLoan(null)}
      />

      {/* Delete confirm dialog */}
      {deletingLoanId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#0d111a] border border-[#1a2235] rounded-xl w-full max-w-sm p-5 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-[#1a2235]">
              <h3 className="text-sm font-bold">Delete Loan</h3>
              <button onClick={() => setDeletingLoanId(null)} className="p-1 text-[#888] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-4 text-xs text-[#aaa]">
              Are you sure you want to delete this loan? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[#1a2235]">
              <button
                onClick={() => setDeletingLoanId(null)}
                className="px-3 py-1.5 rounded bg-[#0d111a] text-xs text-[#888] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => { deleteLoan(deletingLoanId); setDeletingLoanId(null); }}
                className="px-4 py-1.5 rounded bg-[#dc2626] text-xs font-semibold text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
