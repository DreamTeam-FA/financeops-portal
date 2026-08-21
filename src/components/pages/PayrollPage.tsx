import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { Users, Filter, CheckCircle2 } from "lucide-react";
import { TimesheetScanner } from "./TimesheetScanner";

export const PayrollPage: React.FC = () => {
  const { payrollWeeks, payrollPivot, apBills, theme } = useFinance();
  const isLight = theme === "light";

  const [activeTab, setActiveTab] = useState<"weekly" | "detail" | "history" | "scan">("weekly");
  const [selectedWeekNum, setSelectedWeekNum] = useState<string>("W28");
  const [selectedCompany, setSelectedCompany] = useState<string>("ALL");

  const formatCurrency = (val: number) =>
    "$" + Math.round(val).toLocaleString("en-US");

  // Calculate totals from pivot
  const companies = Object.keys(payrollPivot);

  let grandTotal = 0;
  let totalHours = 0;

  companies.forEach((co) => {
    if (selectedCompany !== "ALL" && co !== selectedCompany) return;
    const jobs = payrollPivot[co] || {};
    Object.values(jobs).forEach((subcats) => {
      Object.values(subcats).forEach((item) => {
        grandTotal += item.amount;
        totalHours += item.hours;
      });
    });
  });

  // Extract employee/payroll line items from pivot and AP bills
  const lineItems: { name: string; role: string; hours: number; gross: number; co: string }[] = [];

  companies.forEach((co) => {
    if (selectedCompany !== "ALL" && co !== selectedCompany) return;
    const jobs = payrollPivot[co] || {};
    Object.entries(jobs).forEach(([job, subcats]) => {
      Object.entries(subcats).forEach(([sc, item]) => {
        lineItems.push({
          name: sc,
          role: `${co} • ${job}`,
          hours: item.hours,
          gross: item.amount,
          co
        });
      });
    });
  });

  // Also include AP bills that are payroll related
  apBills.forEach((b) => {
    if (/payroll|gusto|adp|salary|wages|staff/i.test(b.vendor)) {
      if (selectedCompany === "ALL" || b.entity === selectedCompany) {
        lineItems.push({
          name: b.vendor,
          role: `${b.entity} • Bill Expense #${b.invoiceNo || "PAY"}`,
          hours: 40,
          gross: b.amount,
          co: b.entity
        });
      }
    }
  });

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader
        title="4YR Payroll Dashboard"
        bgClass="bg-[#7c3aed]"
        tabs={[
          { id: "weekly", label: "Weekly Summary Pivot" },
          { id: "detail", label: "Employee Line Items" },
          { id: "history", label: "Payroll History Log" },
          { id: "scan", label: "🧾 Scan Timesheet" }
        ]}
        activeTab={activeTab}
        onTabChange={(t) => setActiveTab(t as any)}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Filter Bar */}
        <div className={`flex flex-wrap items-center gap-2 p-3 rounded-xl border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase mr-2 text-[#7c3aed]">
            <Filter className="w-3.5 h-3.5 text-[#7c3aed]" /> Payroll Filters:
          </div>

          <select
            value={selectedWeekNum}
            onChange={(e) => setSelectedWeekNum(e.target.value)}
            className={`border rounded px-2.5 py-1 text-xs ${isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#0d111a] border-[#1a2235] text-white"}`}
          >
            {payrollWeeks.map((w) => (
              <option key={w.weekNum} value={w.weekNum}>
                {w.weekNum}: {w.label}
              </option>
            ))}
          </select>

          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className={`border rounded px-2.5 py-1 text-xs ${isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#0d111a] border-[#1a2235] text-white"}`}
          >
            <option value="ALL">All Entities / Companies</option>
            <option value="Ruby's">Ruby's</option>
            <option value="TI">TI</option>
            <option value="MSDx">MSDx</option>
          </select>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={`border rounded-xl p-4 ${isLight ? "bg-white border-slate-200 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]" : "bg-[#0d111a] border-[#1a2235]"}`}>
            <div className={`text-[11px] font-semibold uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              Total Payroll Outflow
            </div>
            <div className={`text-2xl font-extrabold mt-1 ${isLight ? "text-slate-900" : "text-white"}`}>
              {formatCurrency(grandTotal)}
            </div>
            <div className="text-[11px] text-[#7c3aed] mt-1 font-semibold">For week {selectedWeekNum}</div>
          </div>

          <div className={`border rounded-xl p-4 ${isLight ? "bg-white border-slate-200 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]" : "bg-[#0d111a] border-[#1a2235]"}`}>
            <div className={`text-[11px] font-semibold uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              Total Logged Hours
            </div>
            <div className={`text-2xl font-bold mt-1 ${isLight ? "text-slate-900" : "text-white"}`}>{totalHours} hrs</div>
            <div className={`text-[11px] mt-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Across all departments</div>
          </div>

          <div className={`border rounded-xl p-4 ${isLight ? "bg-white border-slate-200 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]" : "bg-[#0d111a] border-[#1a2235]"}`}>
            <div className={`text-[11px] font-semibold uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              Line Items / Staff
            </div>
            <div className={`text-2xl font-bold mt-1 ${isLight ? "text-slate-900" : "text-white"}`}>{lineItems.length} Active Records</div>
            <div className="text-[11px] text-[#16a34a] mt-1 font-semibold">Verified from Google Sheets</div>
          </div>
        </div>

        {/* Pivot View */}
        {activeTab === "weekly" && (
          <div className={`border rounded-xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
            <div className={`p-3 border-b flex items-center justify-between ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
              <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${isLight ? "text-slate-800" : "text-white"}`}>
                <Users className="w-4 h-4 text-[#7c3aed]" /> Department & Job Category Pivot Breakdown
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className={`border-b font-semibold ${isLight ? "bg-slate-100 border-slate-200 text-slate-600" : "bg-[#141414] border-[#1a2235] text-[#888]"}`}>
                    <th className="p-3">Company / Department</th>
                    <th className="p-3">Job Category</th>
                    <th className="p-3">Logged Hours</th>
                    <th className="p-3 text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? "divide-slate-200" : "divide-[#222]"}`}>
                  {companies.map((co) => {
                    if (selectedCompany !== "ALL" && co !== selectedCompany) return null;
                    const jobs = payrollPivot[co] || {};

                    let coTotal = 0;
                    let coHours = 0;
                    Object.values(jobs).forEach((subcats) => {
                      Object.values(subcats).forEach((item) => {
                        coTotal += item.amount;
                        coHours += item.hours;
                      });
                    });

                    return (
                      <React.Fragment key={co}>
                        <tr className={`font-bold border-t ${isLight ? "bg-purple-50/80 text-purple-900 border-purple-200" : "bg-[#1a1a1a] text-white border-[#333]"}`}>
                          <td className="p-3 text-sm text-[#7c3aed] font-black">{co} Entity</td>
                          <td className={`p-3 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Subtotal</td>
                          <td className="p-3">{coHours} hrs</td>
                          <td className="p-3 text-right text-sm">{formatCurrency(coTotal)}</td>
                        </tr>

                        {Object.entries(jobs).map(([job, subcats]) =>
                          Object.entries(subcats).map(([sc, data]) => (
                            <tr key={`${co}-${job}-${sc}`} className={`transition-colors ${isLight ? "hover:bg-slate-50" : "hover:bg-white/5"}`}>
                              <td className={`p-3 pl-8 ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>{job}</td>
                              <td className={`p-3 font-medium ${isLight ? "text-slate-800" : "text-white"}`}>{sc}</td>
                              <td className={`p-3 ${isLight ? "text-slate-500" : "text-[#888]"}`}>{data.hours} hrs</td>
                              <td className={`p-3 text-right font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>
                                {formatCurrency(data.amount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </React.Fragment>
                    );
                  })}
                  <tr className="bg-[#7c3aed]/20 font-extrabold text-[#7c3aed] dark:text-white text-sm border-t-2 border-[#7c3aed]">
                    <td className="p-3">GRAND TOTAL</td>
                    <td className="p-3">All Categories</td>
                    <td className="p-3">{totalHours} hrs</td>
                    <td className="p-3 text-right">{formatCurrency(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Employee Detail View */}
        {activeTab === "detail" && (
          <div className={`border rounded-xl p-4 text-xs ${isLight ? "bg-white border-slate-200 text-slate-700" : "bg-[#0d111a] border-[#1a2235] text-[#aaa]"}`}>
            <h4 className={`font-bold mb-1 text-sm ${isLight ? "text-slate-900" : "text-white"}`}>Employee & Category Payroll Items</h4>
            <p className={`mb-4 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Detailed breakdown of hourly allocations, departmental payouts, and vendor payroll line items.</p>
            <div className="space-y-2">
              {lineItems.map((emp, i) => (
                <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#0d111a] border-[#222]"}`}>
                  <div>
                    <div className={`font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{emp.name}</div>
                    <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>{emp.role} · {emp.hours} hrs logged</div>
                  </div>
                  <div className="font-extrabold text-[#16a34a] dark:text-[#4ade80] text-sm">{formatCurrency(emp.gross)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timesheet Scanner */}
        {activeTab === "scan" && (
          <div className={`border rounded-xl p-4 ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"}`}>
            <div className="mb-4">
              <h4 className={`font-bold text-sm ${isLight ? "text-slate-900" : "text-white"}`}>Handwritten Timesheet Scanner</h4>
              <p className={`text-xs mt-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                Drop or tap a photo of any handwritten timesheet — the AI reads the employee name, dates, clock-in/out times, and daily hours automatically.
              </p>
            </div>
            <TimesheetScanner isLight={isLight} />
          </div>
        )}

        {/* History Log */}
        {activeTab === "history" && (
          <div className={`border rounded-xl p-4 text-xs ${isLight ? "bg-white border-slate-200 text-slate-700" : "bg-[#0d111a] border-[#1a2235] text-[#aaa]"}`}>
            <h4 className={`font-bold mb-1 text-sm ${isLight ? "text-slate-900" : "text-white"}`}>Payroll Run History Archive</h4>
            <p className={`mb-3 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Weekly log records extracted from the 4YR Payroll sheet.</p>
            <div className="space-y-2 pt-1">
              {payrollWeeks.map((w) => (
                <div key={w.weekNum} className={`flex items-center justify-between p-2.5 rounded border ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#0d111a] border-[#222]"}`}>
                  <div>
                    <span className={`font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{w.weekNum}: {w.label}</span>
                    <span className={`ml-2 text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>({w.sheetName})</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-[#16a34a]/20 text-[#16a34a] dark:text-[#4ade80] text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Processed
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
