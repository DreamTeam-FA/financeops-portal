import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { ARItem, EntityName } from "../../types";
import { Receipt, CheckSquare, Square, Edit3, AlertTriangle, Plus, X, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, formatTimestampLocal } from "../../utils/formatters";

export const ARPage: React.FC = () => {
  const {
    arItems,
    selectedEntities,
    toggleARStage,
    updateARRemarks,
    addARItem,
    updateARItem,
    deleteARItem,
    theme
  } = useFinance();

  const isLight = theme === "light";

  const currentMonthName = new Date().toLocaleString("default", { month: "long" });
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthName);
  const [editingRemarksId, setEditingRemarksId] = useState<string | null>(null);
  const [tempRemarks, setTempRemarks] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAR, setEditingAR] = useState<ARItem | null>(null);
  const [showOverdueModal, setShowOverdueModal] = useState(false);

  // New AR Item Form
  const [customer, setCustomer] = useState("");
  const [entity, setEntity] = useState<EntityName>("TI");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");

  // Extract unique months from AR items
  const availableMonths = Array.from(
    new Set(arItems.map((a) => a.month || "July").filter(Boolean))
  );

  const filtered = arItems.filter((a) => {
    const isEntityMatch = selectedEntities.has("ALL") || selectedEntities.has(a.entity);
    const isMonthMatch = selectedMonth === "ALL" || (a.month || "").toLowerCase().includes(selectedMonth.toLowerCase());
    return isEntityMatch && isMonthMatch;
  });

  const totalReceivables = filtered.reduce((s, a) => s + a.amount, 0);
  const totalPaid = filtered.filter((a) => a.payment).reduce((s, a) => s + a.amount, 0);
  const overdueItems = filtered.filter((a) => !a.payment && new Date(a.dueDate) < new Date());
  const totalOverdue = overdueItems.reduce((s, a) => s + a.amount, 0);

  const collectionRate = totalReceivables
    ? Math.round((totalPaid / totalReceivables) * 100)
    : 0;

  const handleSaveRemarks = (id: string) => {
    updateARRemarks(id, tempRemarks);
    setEditingRemarksId(null);
  };

  const handleCreateAR = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !amount) return;
    addARItem({
      customer,
      entity,
      amount: parseFloat(amount),
      dueDate,
      description: description || "Client Monthly Services",
      month: "July",
      occurrence: "Monthly",
      invoice: true,
      approval: true,
      sent: true,
      payment: false,
      remarks: "Newly created invoice"
    });
    setIsAddOpen(false);
    setCustomer("");
    setAmount("");
  };

  const handleSaveEditAR = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAR) return;
    updateARItem(editingAR);
    setEditingAR(null);
  };

  const getEntityBadge = (entityStr: string) => {
    if (entityStr.includes("Ruby")) return "bg-[#d81b60]/20 text-[#e91e63]";
    if (entityStr.includes("MSDx")) return "bg-[#00897b]/20 text-[#00897b]";
    if (entityStr.includes("Curcumin")) return "bg-[#6d4c41]/20 text-[#8d6e63]";
    return "bg-[#1a73e8]/20 text-[#1a73e8]";
  };

  const getDaysOverdueText = (dueDateStr: string, isPaid: boolean) => {
    if (isPaid) return { text: "Received", class: "text-emerald-600 dark:text-[#4ade80]" };
    if (!dueDateStr) return { text: "No due date", class: "text-slate-400" };

    let due: Date;
    const parts = String(dueDateStr).split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      due = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else {
      due = new Date(dueDateStr);
    }

    if (isNaN(due.getTime())) return { text: dueDateStr, class: "text-slate-400" };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, class: "text-red-500 dark:text-[#f87171] font-bold" };
    if (diffDays === 0) return { text: "Due today", class: "text-amber-500 dark:text-[#fb923c] font-bold" };
    return { text: `In ${diffDays}d`, class: "text-emerald-600 dark:text-[#4ade80]" };
  };

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#0a0a0a] text-[#e8e8e8]"}`}>
      <PageHeader
        title="Accounts Receivables"
        bgClass="bg-[#16a34a]"
        moduleId="ar"
        showEntityPills={true}
        onAddClick={() => setIsAddOpen(true)}
        addLabel="Add Receivable"
      />

      {/* Monthly Tracking Filter Bar */}
      <div className={`flex items-center justify-between px-4 py-2 ${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border-b shrink-0`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>Select Month:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className={`px-3 py-1 rounded-md text-xs font-semibold border ${
              isLight
                ? "bg-slate-50 border-slate-300 text-slate-800 focus:border-[#16a34a]"
                : "bg-[#181818] border-[#262626] text-white focus:border-[#16a34a]"
            } focus:outline-none`}
          >
            <option value="ALL">All Months</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className={`text-xs ${isLight ? "text-slate-500" : "text-[#888]"}`}>
          Showing {filtered.length} invoice(s)
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl p-4 shadow-xs`}>
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>
              Total Invoiced Receivables
            </div>
            <div className={`text-2xl font-extrabold ${isLight ? "text-slate-900" : "text-white"} mt-1`}>
              {formatCurrency(totalReceivables)}
            </div>
            <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"} mt-1`}>
              {selectedMonth === "ALL" ? "Across all tracked months" : `For ${selectedMonth}`}
            </div>
          </div>

          <button
            onClick={() => setShowOverdueModal(true)}
            className={`${isLight ? "bg-white border-slate-200 hover:border-red-300 hover:shadow-md" : "bg-[#111] border-[#262626] hover:border-red-800/60 hover:bg-[#161616]"} border rounded-xl p-4 shadow-xs text-left transition-all group w-full`}
          >
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>
              Overdue Receivables
            </div>
            <div className="text-2xl font-bold text-[#f87171] mt-1">
              {formatCurrency(totalOverdue)}
            </div>
            <div className="text-[11px] text-[#f87171] mt-1 flex items-center justify-between gap-1">
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Action required
              </span>
              <span className={`text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity ${isLight ? "text-red-400" : "text-red-500"}`}>
                View {overdueItems.length} invoice{overdueItems.length !== 1 ? "s" : ""} →
              </span>
            </div>
          </button>

          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl p-4 shadow-xs`}>
            <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>
              Collection Rate
            </div>
            <div className="text-2xl font-bold text-[#4ade80] mt-1">{collectionRate}%</div>
            <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"} mt-1`}>
              Received: {formatCurrency(totalPaid)}
            </div>
          </div>
        </div>

        {/* AR Workflow Table */}
        <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl overflow-hidden shadow-sm`}>
          <div className={`p-3 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#181818] border-[#262626]"} border-b flex items-center justify-between`}>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-slate-900" : "text-white"} flex items-center gap-2`}>
              <Receipt className="w-4 h-4 text-[#16a34a]" /> Accounts Receivable Workflow Matrix
            </h3>
            <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              Click stage checkboxes to update or click pencil to edit row
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`${isLight ? "bg-slate-100/70 border-slate-200 text-slate-600" : "bg-[#141414] border-[#262626] text-[#888]"} border-b font-semibold`}>
                  <th className="p-3">Entity</th>
                  <th className="p-3">Customer / Client</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Invoiced</th>
                  <th className="p-3">Approved</th>
                  <th className="p-3">Sent</th>
                  <th className="p-3">Payment</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Aging / Status</th>
                  <th className="p-3">Remarks</th>
                  <th className="p-3">Edit</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? "divide-slate-200" : "divide-[#222]"}`}>
                {filtered.map((a) => {
                  const statusInfo = getDaysOverdueText(a.dueDate, a.payment);

                  return (
                    <tr key={a.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getEntityBadge(a.entity)}`}>
                          {a.entity}
                        </span>
                      </td>
                      <td className={`p-3 font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>{a.customer}</td>
                      <td className={`p-3 max-w-[180px] truncate ${isLight ? "text-slate-600" : "text-[#888]"}`}>{a.description}</td>
                      <td className={`p-3 font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{formatCurrency(a.amount)}</td>

                      {/* Invoice Stage Checkbox */}
                      <td className="p-3">
                        <button onClick={() => toggleARStage(a.id, "invoice")} className="text-[#60a5fa]">
                          {a.invoice ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-[#555]" />}
                        </button>
                      </td>

                      {/* Approval Stage Checkbox */}
                      <td className="p-3">
                        <button onClick={() => toggleARStage(a.id, "approval")} className="text-[#60a5fa]">
                          {a.approval ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-[#555]" />}
                        </button>
                      </td>

                      {/* Sent Stage Checkbox */}
                      <td className="p-3">
                        <button onClick={() => toggleARStage(a.id, "sent")} className="text-[#60a5fa]">
                          {a.sent ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-[#555]" />}
                        </button>
                      </td>

                      {/* Payment Received Checkbox */}
                      <td className="p-3">
                        <button onClick={() => toggleARStage(a.id, "payment")} className="text-[#4ade80]">
                          {a.payment ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-[#555]" />}
                        </button>
                      </td>

                      <td className={`p-3 ${isLight ? "text-slate-600" : "text-[#888]"}`}>{a.dueDate}</td>
                      <td className={`p-3 font-semibold ${statusInfo.class}`}>{statusInfo.text}</td>

                      {/* Remarks */}
                      <td className="p-3">
                        {editingRemarksId === a.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={tempRemarks}
                              onChange={(e) => setTempRemarks(e.target.value)}
                              className="bg-[#181818] border border-[#16a34a] rounded px-2 py-0.5 text-xs text-white w-36"
                            />
                            <button
                              onClick={() => handleSaveRemarks(a.id)}
                              className="px-2 py-0.5 bg-[#16a34a] text-white rounded text-[10px] font-bold"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              setEditingRemarksId(a.id);
                              setTempRemarks(a.remarks || "");
                            }}
                            className="flex items-center gap-1.5 cursor-pointer text-[#aaa] hover:text-white"
                          >
                            <span className="truncate max-w-[140px]">
                              {a.remarks || "Add remark..."}
                            </span>
                            <Edit3 className="w-3 h-3 text-[#555]" />
                          </div>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setEditingAR(a)}
                            className="text-[#38bdf8] hover:text-sky-300"
                            title="Edit Invoice"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this invoice?")) {
                                deleteARItem(a.id);
                              }
                            }}
                            className="text-red-500 hover:text-red-400"
                            title="Delete Invoice"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add AR Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-[#262626] rounded-xl w-full max-w-md p-5 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
              <h3 className="text-base font-bold">Add Receivable Invoice</h3>
              <button onClick={() => setIsAddOpen(false)} className="p-1 text-[#888] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateAR} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Customer Name</label>
                <input type="text" required value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Apex Retail" className="w-full bg-[#181818] border border-[#262626] rounded px-3 py-1.5 text-xs text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Entity</label>
                  <select value={entity} onChange={(e) => setEntity(e.target.value as EntityName)} className="w-full bg-[#181818] border border-[#262626] rounded px-3 py-1.5 text-xs text-white">
                    <option value="Ruby's">Ruby's</option>
                    <option value="TI">TI</option>
                    <option value="MSDx">MSDx</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Amount ($)</label>
                  <input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full bg-[#181818] border border-[#262626] rounded px-3 py-1.5 text-xs text-white" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Description</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Invoice details" className="w-full bg-[#181818] border border-[#262626] rounded px-3 py-1.5 text-xs text-white" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Due Date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full bg-[#181818] border border-[#262626] rounded px-3 py-1.5 text-xs text-white color-scheme-dark" />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-[#262626]">
                <button type="button" onClick={() => setIsAddOpen(false)} className="px-3 py-1.5 rounded bg-[#181818] text-xs text-[#888]">Cancel</button>
                <button type="submit" className="px-4 py-1.5 rounded bg-[#16a34a] text-xs font-semibold text-white">Save Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Overdue Receivables Modal */}
      {showOverdueModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border ${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#2a2a2a]"}`}>
            {/* Accent bar */}
            <div className="h-1.5 w-full bg-red-500" />

            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isLight ? "border-slate-100" : "border-[#222]"}`}>
              <div>
                <h2 className={`text-base font-black tracking-tight flex items-center gap-2 ${isLight ? "text-slate-900" : "text-white"}`}>
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Overdue Receivables
                </h2>
                <p className={`text-[11px] mt-0.5 ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                  {overdueItems.length} invoice{overdueItems.length !== 1 ? "s" : ""} past due
                  {selectedMonth !== "ALL" ? ` · ${selectedMonth}` : ""} · Total:{" "}
                  <strong className="text-red-500">{formatCurrency(totalOverdue)}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowOverdueModal(false)}
                className={`p-1.5 rounded-full transition-colors ${isLight ? "hover:bg-slate-100 text-slate-400" : "hover:bg-[#222] text-[#666]"}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Table */}
            <div className="overflow-y-auto max-h-[60vh]">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className={`sticky top-0 ${isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-[#161616] border-[#262626] text-[#777]"} border-b font-semibold uppercase tracking-wide`}>
                    <th className="px-4 py-2.5 text-left">Entity</th>
                    <th className="px-4 py-2.5 text-left">Customer</th>
                    <th className="px-4 py-2.5 text-left">Description</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-left">Due Date</th>
                    <th className="px-4 py-2.5 text-left">Overdue By</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? "divide-slate-100" : "divide-[#1e1e1e]"}`}>
                  {overdueItems
                    .slice()
                    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                    .map((a) => {
                      const due = new Date(a.dueDate);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      due.setHours(0, 0, 0, 0);
                      const daysOver = Math.round((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                      return (
                        <tr key={a.id} className={`transition-colors ${isLight ? "hover:bg-red-50/50" : "hover:bg-red-950/10"}`}>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getEntityBadge(a.entity)}`}>
                              {a.entity}
                            </span>
                          </td>
                          <td className={`px-4 py-3 font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>{a.customer}</td>
                          <td className={`px-4 py-3 max-w-[180px] truncate ${isLight ? "text-slate-500" : "text-[#888]"}`}>{a.description}</td>
                          <td className={`px-4 py-3 text-right font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{formatCurrency(a.amount)}</td>
                          <td className={`px-4 py-3 ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>{a.dueDate}</td>
                          <td className="px-4 py-3 font-bold text-red-500">{daysOver}d overdue</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Footer total */}
            <div className={`flex items-center justify-between px-5 py-3 border-t text-xs font-semibold ${isLight ? "border-slate-100 bg-slate-50 text-slate-600" : "border-[#222] bg-[#0d0d0d] text-[#aaa]"}`}>
              <span>{overdueItems.length} overdue invoice{overdueItems.length !== 1 ? "s" : ""}</span>
              <span>
                Total Outstanding:{" "}
                <strong className="text-red-500 text-sm">{formatCurrency(totalOverdue)}</strong>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Edit AR Modal */}
      {editingAR && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-[#262626] rounded-xl w-full max-w-md p-5 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
              <h3 className="text-base font-bold">Edit Receivable Invoice</h3>
              <button onClick={() => setEditingAR(null)} className="p-1 text-[#888] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditAR} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Customer Name</label>
                <input type="text" required value={editingAR.customer} onChange={(e) => setEditingAR({ ...editingAR, customer: e.target.value })} className="w-full bg-[#181818] border border-[#262626] rounded px-3 py-1.5 text-xs text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Entity</label>
                  <select value={editingAR.entity} onChange={(e) => setEditingAR({ ...editingAR, entity: e.target.value as EntityName })} className="w-full bg-[#181818] border border-[#262626] rounded px-3 py-1.5 text-xs text-white">
                    <option value="Ruby's">Ruby's</option>
                    <option value="TI">TI</option>
                    <option value="MSDx">MSDx</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Amount ($)</label>
                  <input type="number" step="0.01" required value={editingAR.amount} onChange={(e) => setEditingAR({ ...editingAR, amount: parseFloat(e.target.value) || 0 })} className="w-full bg-[#181818] border border-[#262626] rounded px-3 py-1.5 text-xs text-white" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Description</label>
                <input type="text" value={editingAR.description} onChange={(e) => setEditingAR({ ...editingAR, description: e.target.value })} className="w-full bg-[#181818] border border-[#262626] rounded px-3 py-1.5 text-xs text-white" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Due Date</label>
                <input type="date" value={editingAR.dueDate} onChange={(e) => setEditingAR({ ...editingAR, dueDate: e.target.value })} className="w-full bg-[#181818] border border-[#262626] rounded px-3 py-1.5 text-xs text-white color-scheme-dark" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Remarks</label>
                <input type="text" value={editingAR.remarks} onChange={(e) => setEditingAR({ ...editingAR, remarks: e.target.value })} className="w-full bg-[#181818] border border-[#262626] rounded px-3 py-1.5 text-xs text-white" />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-[#262626]">
                <button type="button" onClick={() => setEditingAR(null)} className="px-3 py-1.5 rounded bg-[#181818] text-xs text-[#888]">Cancel</button>
                <button type="submit" className="px-4 py-1.5 rounded bg-[#16a34a] text-xs font-semibold text-white">Save Changes & Sync</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
