import React, { useState } from "react";
import { APBill } from "../../types";
import { useFinance } from "../../context/FinanceContext";
import {
  X,
  CreditCard,
  Building2,
  Calendar,
  FileText,
  CheckCircle2,
  PauseCircle,
  Pencil,
  Trash2,
  AlertCircle,
  Zap,
  RefreshCw,
  DollarSign
} from "lucide-react";

interface BillDetailsModalProps {
  bill: APBill | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (bill: APBill) => void;
}

export const BillDetailsModal: React.FC<BillDetailsModalProps> = ({
  bill,
  isOpen,
  onClose,
  onEdit
}) => {
  const { toggleBillStatus, deleteBill, updateBill, theme } = useFinance();
  const isLight = theme === "light";

  const [notes, setNotes] = useState(bill?.notes || bill?.remarks || "");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [confirmingPaid, setConfirmingPaid] = useState(false);
  const [paidDateInput, setPaidDateInput] = useState(new Date().toISOString().split("T")[0]);

  React.useEffect(() => {
    if (bill) {
      setNotes(bill.notes || bill.remarks || "");
      setIsEditingNotes(false);
    }
  }, [bill]);

  if (!isOpen || !bill) return null;

  const formatCurrency = (val: number) =>
    "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSaveNotes = () => {
    updateBill({ ...bill, notes, remarks: notes });
    setIsEditingNotes(false);
  };

  const togglePaymentType = () => {
    const next = bill.paymentType === "Auto-Debit" ? "Manual" : "Auto-Debit";
    updateBill({ ...bill, paymentType: next });
  };

  const toggleRecurringType = () => {
    const next = bill.recurringType === "Recurring" ? "Non-Recurring" : "Recurring";
    updateBill({ ...bill, recurringType: next });
  };

  const toggleCostType = () => {
    const next = bill.costType === "Fixed" ? "Estimate" : "Fixed";
    updateBill({ ...bill, costType: next });
  };

  const getStatusBadge = () => {
    if (bill.status === "paid") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5" /> Paid
        </span>
      );
    }
    if (bill.status === "hold") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
          <PauseCircle className="w-3.5 h-3.5" /> On Hold
        </span>
      );
    }
    const label = bill.bucket === "past-due" ? "Unpaid (past due)" :
                  bill.bucket === "this-week" ? "Unpaid (this week)" :
                  bill.bucket === "next-week" ? "Unpaid (next week)" :
                  "Unpaid";
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30">
        <AlertCircle className="w-3.5 h-3.5" /> {label}
      </span>
    );
  };

  const surf = isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#121212] border-[#2a2a2a] text-[#e8e8e8]";
  const card = isLight ? "bg-slate-50 border-slate-200" : "bg-[#181818] border-[#262626]";
  const hdr  = isLight ? "border-slate-200 bg-slate-50" : "border-[#262626] bg-[#181818]";
  const sub  = isLight ? "text-slate-400" : "text-[#666]";
  const val  = isLight ? "text-slate-900" : "text-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${surf}`}>

        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${hdr}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/15 text-sky-500">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base font-extrabold ${val}`}>{bill.vendor}</h3>
              <p className={`text-[11px] ${sub}`}>Accounts Payable Bill Details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${isLight ? "hover:bg-slate-200 text-slate-500" : "hover:bg-[#262626] text-[#888]"}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[76vh]">

          {/* Amount + Status hero */}
          <div className={`p-4 rounded-xl border flex items-center justify-between ${card}`}>
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${sub}`}>Total Payable Amount</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                {formatCurrency(bill.amount)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateBill({ ...bill, inQBO: !bill.inQBO })}
                title={bill.inQBO ? "In QBO (Click to toggle)" : "Not in QBO (Click to toggle)"}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer select-none ${
                  bill.inQBO
                    ? "bg-emerald-600 text-white ring-2 ring-emerald-400/50"
                    : isLight
                    ? "bg-slate-200 text-slate-600 hover:bg-slate-300"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[12px] ${
                  bill.inQBO
                    ? "bg-white text-emerald-700"
                    : isLight ? "bg-slate-300 text-slate-700" : "bg-slate-700 text-slate-300"
                }`}>Q</span>
                QBO
              </button>
              {getStatusBadge()}
            </div>
          </div>

          {/* 3-column info cards: Entity | Due Date | Invoice */}
          <div className="grid grid-cols-3 gap-2.5 text-xs">
            <div className={`p-3 rounded-xl border ${card}`}>
              <div className={`text-[10px] font-bold uppercase flex items-center gap-1 mb-1 ${sub}`}>
                <Building2 className="w-3 h-3 text-blue-500" /> Company Entity
              </div>
              <div className={`font-bold text-sm ${val}`}>{bill.entity}</div>
            </div>

            <div className={`p-3 rounded-xl border ${card}`}>
              <div className={`text-[10px] font-bold uppercase flex items-center gap-1 mb-1 ${sub}`}>
                <Calendar className="w-3 h-3 text-red-500" /> Due Date
              </div>
              <div className={`font-bold text-sm ${val}`}>{bill.dueDate || "N/A"}</div>
            </div>

            <div className={`p-3 rounded-xl border ${card}`}>
              <div className={`text-[10px] font-bold uppercase flex items-center gap-1 mb-1 ${sub}`}>
                <FileText className="w-3 h-3 text-purple-500" /> Invoice Number
              </div>
              <div className={`font-bold text-sm truncate ${val}`}>{bill.invoiceNo || "—"}</div>
            </div>
          </div>

          {/* Bill Schedule & Payment Details — clickable toggle chips */}
          <div className={`p-4 rounded-xl border space-y-3 ${card}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>
                <Zap className="w-3.5 h-3.5 text-amber-500" /> Bill Schedule &amp; Payment Details
              </span>
              <span className={`text-[10px] font-semibold ${sub}`}>Click chips to toggle</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Debit Type chip */}
              <button
                onClick={togglePaymentType}
                className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  bill.paymentType
                    ? "bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-600/40"
                    : isLight ? "bg-slate-100 border-slate-200 hover:border-slate-300" : "bg-[#222] border-[#333] hover:border-[#444]"
                }`}
              >
                <span className={`text-[9px] font-bold uppercase tracking-wider ${sub}`}>Debit Type</span>
                <span className={`flex items-center gap-1 text-xs font-extrabold ${
                  bill.paymentType ? "text-amber-600 dark:text-amber-400" : isLight ? "text-slate-700" : "text-[#ccc]"
                }`}>
                  <Zap className="w-3 h-3" />
                  {bill.paymentType || "Manual"}
                </span>
              </button>

              {/* Frequency chip */}
              <button
                onClick={toggleRecurringType}
                className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  bill.recurringType
                    ? "bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-600/40"
                    : isLight ? "bg-slate-100 border-slate-200 hover:border-slate-300" : "bg-[#222] border-[#333] hover:border-[#444]"
                }`}
              >
                <span className={`text-[9px] font-bold uppercase tracking-wider ${sub}`}>Frequency</span>
                <span className={`flex items-center gap-1 text-xs font-extrabold ${
                  bill.recurringType ? "text-amber-600 dark:text-amber-400" : isLight ? "text-slate-700" : "text-[#ccc]"
                }`}>
                  <RefreshCw className="w-3 h-3" />
                  {bill.recurringType || "Non-Recurring"}
                </span>
              </button>

              {/* Amount Type chip */}
              <button
                onClick={toggleCostType}
                className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  bill.costType === "Estimate"
                    ? "bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-600/40"
                    : isLight ? "bg-slate-100 border-slate-200 hover:border-slate-300" : "bg-[#222] border-[#333] hover:border-[#444]"
                }`}
              >
                <span className={`text-[9px] font-bold uppercase tracking-wider ${sub}`}>Amount Type</span>
                <span className={`flex items-center gap-1 text-xs font-extrabold ${
                  bill.costType === "Estimate" ? "text-amber-600 dark:text-amber-400" : isLight ? "text-slate-700" : "text-[#ccc]"
                }`}>
                  <DollarSign className="w-3 h-3" />
                  {bill.costType || "Fixed"}
                </span>
              </button>
            </div>
          </div>

          {/* Remarks / Payment Instructions */}
          <div className={`p-4 rounded-xl border space-y-2 ${card}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>
                <FileText className="w-3.5 h-3.5 text-amber-500" /> Remarks / Payment Instructions
              </span>
              {!isEditingNotes && (
                <button
                  onClick={() => setIsEditingNotes(true)}
                  className="text-[11px] text-sky-500 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
            </div>

            {isEditingNotes ? (
              <div className="space-y-2 pt-1">
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter remarks, bank instructions, or payment notes..."
                  className={`w-full p-2.5 text-xs rounded-lg border ${
                    isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#111] border-[#333] text-white"
                  } focus:outline-none focus:ring-2 focus:ring-sky-500`}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditingNotes(false)}
                    className="px-3 py-1 rounded text-xs font-semibold text-slate-500 hover:underline"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveNotes}
                    className="px-3 py-1 rounded text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white"
                  >
                    Save Remarks
                  </button>
                </div>
              </div>
            ) : (
              <p className={`text-xs ${isLight ? "text-slate-700" : "text-[#ccc]"} whitespace-pre-wrap leading-relaxed pt-1`}>
                {notes || bill.remarks || "No special remarks or payment instructions recorded."}
              </p>
            )}
          </div>

          {/* Source info footer */}
          {bill.sheet && (
            <div className={`text-[10px] ${sub} flex items-center justify-between px-1`}>
              <span>Source Sheet: <strong className={isLight ? "text-slate-600" : "text-[#aaa]"}>{bill.sheet}</strong></span>
              {bill.row && <span>Row Index: <strong className={isLight ? "text-slate-600" : "text-[#aaa]"}>{bill.row}</strong></span>}
            </div>
          )}
        </div>

        {/* Footer action bar */}
        <div className={`p-4 border-t flex flex-wrap items-center justify-between gap-2 ${hdr}`}>
          <div className="flex items-center gap-1.5 flex-wrap">
            {bill.status !== "paid" && !confirmingPaid && (
              <button
                onClick={() => { setPaidDateInput(new Date().toISOString().split("T")[0]); setConfirmingPaid(true); }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark Paid
              </button>
            )}
            {confirmingPaid && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[11px] font-semibold ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>Payment Date:</span>
                <input
                  type="date"
                  value={paidDateInput}
                  onChange={(e) => setPaidDateInput(e.target.value)}
                  className={`px-2 py-1 rounded border text-xs font-semibold ${isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#222] border-[#444] text-white"}`}
                />
                <button
                  onClick={() => { toggleBillStatus(bill.id, "paid", paidDateInput); setConfirmingPaid(false); onClose(); }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3" /> Confirm
                </button>
                <button
                  onClick={() => setConfirmingPaid(false)}
                  className={`px-2 py-1 rounded text-xs font-semibold ${isLight ? "text-slate-500 hover:bg-slate-100" : "text-[#888] hover:bg-[#222]"}`}
                >
                  Cancel
                </button>
              </div>
            )}
            {bill.status !== "hold" && !confirmingPaid ? (
              <button
                onClick={() => { toggleBillStatus(bill.id, "hold"); onClose(); }}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <PauseCircle className="w-3.5 h-3.5" /> Put On Hold
              </button>
            ) : (
              <button
                onClick={() => { toggleBillStatus(bill.id, "unpaid"); onClose(); }}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Release Hold
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { onClose(); onEdit(bill); }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors ${
                isLight ? "bg-white border-slate-300 text-slate-700 hover:bg-slate-100" : "bg-[#222] border-[#333] text-white hover:bg-[#2a2a2a]"
              }`}
            >
              <Pencil className="w-3.5 h-3.5 text-sky-400" /> Edit Bill
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete bill for ${bill.vendor}?`)) {
                  deleteBill(bill.id);
                  onClose();
                }
              }}
              className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Delete Bill"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
