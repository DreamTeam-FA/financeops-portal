import React, { useMemo, useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { HeadleysItem } from "../../types";
import { FileText, ChevronDown, ChevronRight } from "lucide-react";

const fmt = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const HeadleysPage: React.FC = () => {
  const { headleys, theme } = useFinance();
  const isLight = theme === "light";

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const toggleDate = (d: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  };

  // Group by billing date, then by BU
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, HeadleysItem[]>> = {};
    headleys.forEach(item => {
      const key = item.billingDate || item.dueDate || "Undated";
      if (!map[key]) map[key] = {};
      if (!map[key][item.bu]) map[key][item.bu] = [];
      map[key][item.bu].push(item);
    });
    // Sort dates descending (newest billing date first)
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [headleys]);

  // Summary: total per billing date across all BUs
  const grandTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    headleys.forEach(item => {
      const key = item.billingDate || item.dueDate || "Undated";
      totals[key] = (totals[key] || 0) + (item.amount || 0);
    });
    return totals;
  }, [headleys]);

  const buColors: Record<string, string> = {
    TI: "#1a73e8",
    "4YR": "#8B5CF6",
    E1: "#00897b",
    "4G": "#f59e0b",
  };
  const getBuColor = (bu: string) => buColors[bu] || "#546e7a";

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader
        title="Headley's Invoice Tracker"
        bgClass="bg-[#5c35a5]"
        moduleId="headleys"
        showEntityPills={false}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {headleys.length === 0 ? (
          <div className={`flex flex-col items-center justify-center py-20 rounded-xl border ${isLight ? "bg-white border-slate-200 text-slate-500" : "bg-[#0d111a] border-[#1a2235] text-[#888]"}`}>
            <FileText className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-semibold">No Headley's data found</p>
            <p className="text-xs mt-1 opacity-60">
              Data is imported into the "Headley's" sheet via the GAS dashboard and will appear here automatically.
            </p>
          </div>
        ) : (
          <>
            {/* Summary KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4`}>
                <div className={`text-[11px] font-semibold uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`}>Billing Cycles</div>
                <div className={`text-2xl font-bold mt-1 ${isLight ? "text-slate-900" : "text-white"}`}>{grouped.length}</div>
              </div>
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4`}>
                <div className={`text-[11px] font-semibold uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`}>Line Items</div>
                <div className={`text-2xl font-bold mt-1 ${isLight ? "text-slate-900" : "text-white"}`}>{headleys.length}</div>
              </div>
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4`}>
                <div className={`text-[11px] font-semibold uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`}>Charging BUs</div>
                <div className={`text-2xl font-bold mt-1 ${isLight ? "text-slate-900" : "text-white"}`}>
                  {new Set(headleys.map(h => h.bu)).size}
                </div>
              </div>
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4`}>
                <div className={`text-[11px] font-semibold uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`}>Latest Total</div>
                <div className="text-2xl font-bold mt-1 text-[#8B5CF6]">
                  {grouped[0] ? fmt(grandTotals[grouped[0][0]] || 0) : "—"}
                </div>
              </div>
            </div>

            {/* Billing date groups */}
            {grouped.map(([billingDate, buMap]) => {
              const isExpanded = expandedDates.has(billingDate);
              const total = grandTotals[billingDate] || 0;
              const buSummary = Object.entries(buMap).map(([bu, items]) => ({
                bu,
                total: items.reduce((s, i) => s + i.amount, 0),
                count: items.length
              }));

              return (
                <div key={billingDate} className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl overflow-hidden`}>
                  {/* Header row — click to expand */}
                  <button
                    onClick={() => toggleDate(billingDate)}
                    className={`w-full flex items-center justify-between p-4 text-left ${isLight ? "hover:bg-slate-50" : "hover:bg-white/5"} transition-colors`}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded
                        ? <ChevronDown className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#888]"}`} />
                        : <ChevronRight className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#888]"}`} />
                      }
                      <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                        Billing Date: {billingDate}
                      </span>
                      <div className="flex items-center gap-2">
                        {buSummary.map(({ bu, total: buTotal }) => (
                          <span
                            key={bu}
                            className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                            style={{ backgroundColor: getBuColor(bu) }}
                          >
                            {bu}: {fmt(buTotal)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                        {headleys.filter(h => (h.billingDate || h.dueDate) === billingDate).length} lines
                      </span>
                      <span className="text-sm font-bold text-[#8B5CF6]">{fmt(total)}</span>
                    </div>
                  </button>

                  {/* Expanded: raw data table per BU */}
                  {isExpanded && (
                    <div className="border-t border-[#222]">
                      {Object.entries(buMap).map(([bu, items]) => (
                        <div key={bu}>
                          {/* BU sub-header */}
                          <div
                            className="px-4 py-2 text-xs font-bold text-white flex items-center justify-between"
                            style={{ backgroundColor: getBuColor(bu) + "33" }}
                          >
                            <span style={{ color: getBuColor(bu) }}>Charging BU: {bu}</span>
                            <span style={{ color: getBuColor(bu) }}>
                              {fmt(items.reduce((s, i) => s + i.amount, 0))} ({items.length} items)
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className={`${isLight ? "bg-slate-50 text-slate-600 border-slate-200" : "bg-[#161616] text-[#888] border-[#222]"} border-b font-semibold`}>
                                  <th className="px-3 py-2">Date</th>
                                  <th className="px-3 py-2">Ref</th>
                                  <th className="px-3 py-2">Type</th>
                                  <th className="px-3 py-2">Description</th>
                                  <th className="px-3 py-2 text-right">Debit</th>
                                  <th className="px-3 py-2 text-right">Credit</th>
                                  <th className="px-3 py-2 text-right">Amount</th>
                                </tr>
                              </thead>
                              <tbody className={`divide-y ${isLight ? "divide-slate-100" : "divide-[#1e1e1e]"}`}>
                                {items.map((item) => (
                                  <tr key={item.id} className={`${isLight ? "hover:bg-slate-50" : "hover:bg-white/[0.03]"} transition-colors`}>
                                    <td className={`px-3 py-2 ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>{item.date}</td>
                                    <td className={`px-3 py-2 font-mono ${isLight ? "text-slate-700" : "text-[#ccc]"}`}>{item.ref}</td>
                                    <td className={`px-3 py-2 ${isLight ? "text-slate-500" : "text-[#888]"}`}>{item.type}</td>
                                    <td className={`px-3 py-2 max-w-[260px] truncate ${isLight ? "text-slate-700" : "text-[#ddd]"}`} title={item.description}>{item.description}</td>
                                    <td className={`px-3 py-2 text-right font-mono ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>
                                      {item.debit > 0 ? fmt(item.debit) : "—"}
                                    </td>
                                    <td className={`px-3 py-2 text-right font-mono ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>
                                      {item.credit > 0 ? fmt(item.credit) : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold" style={{ color: getBuColor(bu) }}>
                                      {fmt(item.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className={`${isLight ? "bg-slate-50 border-slate-200" : "bg-[#161616] border-[#222]"} border-t font-bold`}>
                                  <td colSpan={6} className={`px-3 py-2 text-right text-xs ${isLight ? "text-slate-700" : "text-[#ccc]"}`}>
                                    Subtotal ({bu})
                                  </td>
                                  <td className="px-3 py-2 text-right text-xs" style={{ color: getBuColor(bu) }}>
                                    {fmt(items.reduce((s, i) => s + i.amount, 0))}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
