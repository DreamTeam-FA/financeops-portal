import React, { useState, useMemo } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { ARItem, EntityName } from "../../types";
import { Receipt, CheckSquare, Square, Edit3, AlertTriangle, Plus, X, Pencil, Trash2, FileText, ChevronRight, Download } from "lucide-react";
import { exportARItemsCSV } from "../../utils/exportUtils";
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
    theme,
    showConfirm
  } = useFinance() as any;

  const isLight = theme === "light";

  const currentMonthName = new Date().toLocaleString("default", { month: "long" });
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthName);
  const [editingRemarksId, setEditingRemarksId] = useState<string | null>(null);
  const [tempRemarks, setTempRemarks] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAR, setEditingAR] = useState<ARItem | null>(null);
  const [showOverdueModal, setShowOverdueModal] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // New AR Item Form
  const [customer, setCustomer] = useState("");
  const [entity, setEntity] = useState<EntityName>("TI");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");

  // Build unique template list from all AR items (deduped by customer+entity+description)
  const templates = useMemo(() => {
    const seen = new Set<string>();
    const list: ARItem[] = [];
    // Sort by most recently seen (reverse order preserves last-seen)
    [...arItems].reverse().forEach((a) => {
      const key = `${a.customer}|${a.entity}|${a.description}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(a);
      }
    });
    return list.sort((a, b) => a.customer.localeCompare(b.customer));
  }, [arItems]);

  const openFromTemplate = (tpl: ARItem) => {
    setCustomer(tpl.customer);
    setEntity(tpl.entity as EntityName);
    setAmount(String(tpl.amount));
    setDescription(tpl.description);
    setDueDate(new Date().toISOString().split("T")[0]);
    setShowTemplatePicker(false);
    setIsAddOpen(true);
  };

  const openBlankForm = () => {
    setCustomer("");
    setEntity("TI");
    setAmount("");
    setDescription("");
    setDueDate(new Date().toISOString().split("T")[0]);
    setShowTemplatePicker(false);
    setIsAddOpen(true);
  };

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
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader
        title="Accounts Receivables"
        bgClass="bg-[#16a34a]"
        moduleId="ar"
        showEntityPills={true}
        extraButtons={
          <button onClick={() => exportARItemsCSV(arItems)} className="btn-3d btn-3d-ghost font-semibold" title="Export to CSV">
            <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">CSV</span>
          </button>
        }
        onAddClick={() => setShowTemplatePicker(true)}
        addLabel="Add Receivable"
        sheetUrl="https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit#gid=1095820813"
      />

      {/* Monthly Tracking Filter Bar */}
      <div className={`flex items-center justify-between px-4 py-2 ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border-b shrink-0`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>Select Month:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className={`px-3 py-1 rounded-md text-xs font-semibold border ${
              isLight
                ? "bg-slate-50 border-slate-300 text-slate-800 focus:border-[#16a34a]"
                : "bg-[#0d111a] border-[#1a2235] text-white focus:border-[#16a34a]"
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
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
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
            className={`${isLight ? "bg-white border-slate-200 hover:border-red-300 hover:shadow-md" : "bg-[#0d111a] border-[#1a2235] hover:border-red-800/60 hover:bg-[#161616]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] text-left transition-all group w-full`}
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

          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
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
        <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl overflow-hidden shadow-sm`}>
          <div className={`p-3 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border-b flex items-center justify-between`}>
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
                <tr className={`${isLight ? "bg-slate-100/70 border-slate-200 text-slate-600" : "bg-[#141414] border-[#1a2235] text-[#888]"} border-b font-semibold`}>
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
                              className="bg-[#0d111a] border border-[#16a34a] rounded px-2 py-0.5 text-xs text-white w-36"
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
                            onClick={() => showConfirm("Delete this invoice?", () => deleteARItem(a.id))}
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

      {/* Template Picker Modal */}
      {showTemplatePicker && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#2a2a2a]"}`}>
            <div className="h-1.5 bg-[#16a34a]" />
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isLight ? "border-slate-100" : "border-[#222]"}`}>
              <div>
                <h3 className={`text-sm font-black ${isLight ? "text-slate-900" : "text-white"}`}>Add Receivable Invoice</h3>
                <p className={`text-[11px] mt-0.5 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Start from an existing template or create new</p>
              </div>
              <button onClick={() => setShowTemplatePicker(false)} className={`p-1.5 rounded-full ${isLight ? "hover:bg-slate-100 text-slate-400" : "hover:bg-[#222] text-[#666]"}`}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[65vh] p-3 space-y-1">
              {/* New blank invoice */}
              <button
                onClick={openBlankForm}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed text-left transition-all ${
                  isLight
                    ? "border-[#16a34a]/40 hover:border-[#16a34a] hover:bg-green-50/50 text-slate-700"
                    : "border-[#16a34a]/30 hover:border-[#16a34a]/70 hover:bg-green-950/20 text-[#ccc]"
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-[#16a34a]/15 flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4 text-[#16a34a]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#16a34a]">New Accounts Receivable</p>
                  <p className={`text-[11px] ${isLight ? "text-slate-400" : "text-[#666]"}`}>Start with a blank invoice form</p>
                </div>
              </button>

              {/* Divider */}
              {templates.length > 0 && (
                <div className={`flex items-center gap-2 py-2 px-1 ${isLight ? "text-slate-400" : "text-[#555]"}`}>
                  <div className={`flex-1 h-px ${isLight ? "bg-slate-200" : "bg-[#2a2a2a]"}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">From existing templates</span>
                  <div className={`flex-1 h-px ${isLight ? "bg-slate-200" : "bg-[#2a2a2a]"}`} />
                </div>
              )}

              {/* Template rows */}
              {templates.map((tpl) => (
                <button
                  key={`${tpl.customer}|${tpl.entity}|${tpl.description}`}
                  onClick={() => openFromTemplate(tpl)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    isLight
                      ? "bg-slate-50 border-slate-200 hover:border-[#16a34a]/50 hover:bg-green-50/40"
                      : "bg-[#161616] border-[#2a2a2a] hover:border-[#16a34a]/40 hover:bg-green-950/10"
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: tpl.entity.includes("Ruby") ? "#d81b6022" : tpl.entity.includes("MSDx") ? "#00897b22" : "#1a73e822" }}>
                    <FileText className="w-3.5 h-3.5"
                      style={{ color: tpl.entity.includes("Ruby") ? "#d81b60" : tpl.entity.includes("MSDx") ? "#00897b" : "#1a73e8" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold truncate ${isLight ? "text-slate-900" : "text-white"}`}>{tpl.customer}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        tpl.entity.includes("Ruby") ? "bg-[#d81b60]/15 text-[#e91e63]" :
                        tpl.entity.includes("MSDx") ? "bg-[#00897b]/15 text-[#00897b]" :
                        "bg-[#1a73e8]/15 text-[#1a73e8]"
                      }`}>{tpl.entity}</span>
                    </div>
                    <p className={`text-[11px] truncate ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                      {tpl.description} · <span className="font-semibold">{formatCurrency(tpl.amount)}</span>
                    </p>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 ${isLight ? "text-slate-300" : "text-[#444]"}`} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add AR Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#2a2a2a]"}`}>
            <div className="h-1.5 bg-[#16a34a]" />
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isLight ? "border-slate-100" : "border-[#222]"}`}>
              <h3 className={`text-sm font-black ${isLight ? "text-slate-900" : "text-white"}`}>
                {customer ? `New Invoice — ${customer}` : "New Accounts Receivable"}
              </h3>
              <button onClick={() => setIsAddOpen(false)} className={`p-1.5 rounded-full ${isLight ? "hover:bg-slate-100 text-slate-400" : "hover:bg-[#222] text-[#666]"}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateAR} className="px-5 py-4 space-y-3">
              <div>
                <label className={`block text-[11px] font-semibold uppercase mb-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Customer Name</label>
                <input type="text" required value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Apex Retail"
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#16a34a] ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[11px] font-semibold uppercase mb-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Entity</label>
                  <select value={entity} onChange={(e) => setEntity(e.target.value as EntityName)}
                    className={`w-full border rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#16a34a] ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`}>
                    <option value="Ruby's">Ruby's</option>
                    <option value="TI">TI</option>
                    <option value="MSDx">MSDx</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-[11px] font-semibold uppercase mb-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Amount ($)</label>
                  <input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                    className={`w-full border rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#16a34a] ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`} />
                </div>
              </div>
              <div>
                <label className={`block text-[11px] font-semibold uppercase mb-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Description</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Invoice details"
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#16a34a] ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`} />
              </div>
              <div>
                <label className={`block text-[11px] font-semibold uppercase mb-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Due Date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#16a34a] ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`} />
              </div>
              <div className={`flex justify-end gap-2 pt-3 border-t ${isLight ? "border-slate-100" : "border-[#222]"}`}>
                <button type="button" onClick={() => setIsAddOpen(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#1a1a1a] text-[#888] hover:bg-[#222]"}`}>
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-xs font-bold text-white transition-colors">
                  Save Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Overdue Receivables Modal */}
      {showOverdueModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#2a2a2a]"}`}>
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
                  <tr className={`sticky top-0 ${isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-[#161616] border-[#1a2235] text-[#777]"} border-b font-semibold uppercase tracking-wide`}>
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#2a2a2a]"}`}>
            <div className="h-1.5 bg-[#16a34a]" />
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isLight ? "border-slate-100" : "border-[#222]"}`}>
              <h3 className={`text-sm font-black ${isLight ? "text-slate-900" : "text-white"}`}>Edit Receivable Invoice</h3>
              <button onClick={() => setEditingAR(null)} className={`p-1.5 rounded-full ${isLight ? "hover:bg-slate-100 text-slate-400" : "hover:bg-[#222] text-[#666]"}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditAR} className="px-5 py-4 space-y-3">
              <div>
                <label className={`block text-[11px] font-semibold uppercase mb-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Customer Name</label>
                <input type="text" required value={editingAR.customer} onChange={(e) => setEditingAR({ ...editingAR, customer: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#16a34a] ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[11px] font-semibold uppercase mb-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Entity</label>
                  <select value={editingAR.entity} onChange={(e) => setEditingAR({ ...editingAR, entity: e.target.value as EntityName })}
                    className={`w-full border rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#16a34a] ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`}>
                    <option value="Ruby's">Ruby's</option>
                    <option value="TI">TI</option>
                    <option value="MSDx">MSDx</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-[11px] font-semibold uppercase mb-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Amount ($)</label>
                  <input type="number" step="0.01" required value={editingAR.amount} onChange={(e) => setEditingAR({ ...editingAR, amount: parseFloat(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#16a34a] ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`} />
                </div>
              </div>
              <div>
                <label className={`block text-[11px] font-semibold uppercase mb-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Description</label>
                <input type="text" value={editingAR.description} onChange={(e) => setEditingAR({ ...editingAR, description: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#16a34a] ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`} />
              </div>
              <div>
                <label className={`block text-[11px] font-semibold uppercase mb-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Due Date</label>
                <input type="date" value={editingAR.dueDate} onChange={(e) => setEditingAR({ ...editingAR, dueDate: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#16a34a] ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`} />
              </div>
              <div>
                <label className={`block text-[11px] font-semibold uppercase mb-1 ${isLight ? "text-slate-500" : "text-[#888]"}`}>Remarks</label>
                <input type="text" value={editingAR.remarks || ""} onChange={(e) => setEditingAR({ ...editingAR, remarks: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#16a34a] ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`} />
              </div>
              <div className={`flex justify-end gap-2 pt-3 border-t ${isLight ? "border-slate-100" : "border-[#222]"}`}>
                <button type="button" onClick={() => setEditingAR(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#1a1a1a] text-[#888] hover:bg-[#222]"}`}>
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-xs font-bold text-white transition-colors">
                  Save Changes & Sync
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
