import React, { useState } from "react";
import { APBill } from "../../types";
import { useFinance } from "../../context/FinanceContext";
import {
  X, Pencil, Trash2, CheckCircle2, PauseCircle, Zap, FileText,
  ChevronLeft, ChevronRight, ExternalLink
} from "lucide-react";

interface BillDetailsModalProps {
  vendorBills: APBill[];
  isOpen: boolean;
  onClose: () => void;
  onEdit: (bill: APBill) => void;
}

const ENTITY_COLORS: Record<string, string> = {
  "Ruby's": "#d81b60",
  TI:       "#1a73e8",
  MSDx:     "#00897b",
};
const getEntityColor = (e: string) => ENTITY_COLORS[e] || "#1a73e8";

const fmt = (v: number) =>
  "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isOverdue = (dueDate?: string) => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
};

/* ── Status badge ─────────────────────────────────────────── */
const StatusBadge: React.FC<{ status: string; dueDate?: string }> = ({ status, dueDate }) => {
  const overdue = status === "unpaid" && isOverdue(dueDate);
  if (status === "paid")
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" /> Paid
      </span>
    );
  if (status === "hold")
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
        <PauseCircle className="w-3 h-3" /> On Hold
      </span>
    );
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
      overdue
        ? "bg-red-100 text-red-700 border-red-200"
        : "bg-orange-100 text-orange-700 border-orange-200"
    }`}>
      {overdue ? "⚠ Unpaid (past due)" : "Unpaid"}
    </span>
  );
};

/* ── Info card ────────────────────────────────────────────── */
const InfoCard: React.FC<{
  label: string;
  value: React.ReactNode;
  accent?: string;
  isLight: boolean;
}> = ({ label, value, accent, isLight }) => (
  <div className={`flex-1 min-w-0 rounded-xl p-3 border ${
    isLight ? "bg-slate-50 border-slate-200" : "bg-[#1a1a1a] border-[#2a2a2a]"
  }`}>
    <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${
      isLight ? "text-slate-400" : "text-[#666]"
    }`}>{label}</p>
    {accent ? (
      <span
        className="inline-block text-[13px] font-bold text-white px-2 py-0.5 rounded-lg"
        style={{ backgroundColor: accent }}
      >
        {value}
      </span>
    ) : (
      <p className={`text-[13px] font-bold truncate ${isLight ? "text-slate-900" : "text-white"}`}>
        {value || "—"}
      </p>
    )}
  </div>
);

/* ── Chip toggle ──────────────────────────────────────────── */
const Chip: React.FC<{
  label: string;
  value: string;
  active?: boolean;
  accentColor: string;
  isLight: boolean;
}> = ({ label, value, active, accentColor, isLight }) => (
  <div className={`flex-1 min-w-[90px] rounded-xl p-2.5 border text-center transition-all ${
    active
      ? "border-transparent text-white shadow-sm"
      : isLight
        ? "bg-slate-50 border-slate-200 text-slate-600"
        : "bg-[#1a1a1a] border-[#2a2a2a] text-[#aaa]"
  }`}
  style={active ? { backgroundColor: accentColor + "22", borderColor: accentColor + "55" } : {}}
  >
    <p className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${
      active ? "" : isLight ? "text-slate-400" : "text-[#555]"
    }`}
    style={active ? { color: accentColor } : {}}
    >{label}</p>
    <p className={`text-[12px] font-bold ${active ? "" : ""}`}
      style={active ? { color: accentColor } : {}}
    >
      {value || "—"}
    </p>
  </div>
);

/* ── Single bill detail view ──────────────────────────────── */
const BillDetail: React.FC<{
  bill: APBill;
  isLight: boolean;
  accentColor: string;
  onEdit: () => void;
  onClose: () => void;
}> = ({ bill, isLight, accentColor, onEdit, onClose }) => {
  const { toggleBillStatus, deleteBill, updateBill } = useFinance();
  const [localStatus, setLocalStatus] = useState(bill.status || "unpaid");
  const [paidDate, setPaidDate] = useState(
    bill.paymentDate || bill.paidDate || new Date().toISOString().split("T")[0]
  );

  const remarks = bill.paymentInstructions || bill.remarks || bill.notes || "";
  const isLink = remarks.startsWith("http");

  const handleMarkPaid = () => {
    setLocalStatus("paid");
    toggleBillStatus(bill.id, "paid", paidDate);
  };

  const handleHold = () => {
    setLocalStatus(localStatus === "hold" ? "unpaid" : "hold");
    toggleBillStatus(bill.id, localStatus === "hold" ? "unpaid" : "hold");
  };

  const handleQBO = () => updateBill({ ...bill, inQBO: !bill.inQBO });

  return (
    <div className="flex flex-col gap-3">
      {/* Amount card */}
      <div className={`rounded-xl border p-4 ${
        isLight ? "bg-white border-slate-200 shadow-xs" : "bg-[#161616] border-[#2a2a2a]"
      }`}>
        <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${
          isLight ? "text-slate-400" : "text-[#666]"
        }`}>Total Payable Amount</p>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-2xl font-black" style={{ color: accentColor }}>
            {fmt(bill.amount)}
          </span>
          <div className="flex items-center gap-2">
            {/* QBO badge */}
            <button
              onClick={handleQBO}
              title={bill.inQBO ? "In QBO — click to toggle" : "Not in QBO"}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black border transition-all ${
                bill.inQBO
                  ? "bg-emerald-500 text-white border-emerald-400"
                  : isLight
                    ? "bg-slate-200 text-slate-500 border-slate-300"
                    : "bg-[#222] text-[#666] border-[#333]"
              }`}
            >Q</button>
            <StatusBadge status={localStatus} dueDate={bill.dueDate} />
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="flex gap-2">
        <InfoCard
          label="Company Entity"
          value={bill.entity}
          accent={accentColor}
          isLight={isLight}
        />
        <InfoCard
          label="Due Date"
          value={bill.dueDate || "—"}
          isLight={isLight}
        />
        <InfoCard
          label="Invoice Number"
          value={bill.invoiceNo || "—"}
          isLight={isLight}
        />
      </div>

      {/* Schedule chips */}
      <div className={`rounded-xl border p-3 ${
        isLight ? "bg-white border-slate-200" : "bg-[#161616] border-[#2a2a2a]"
      }`}>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Zap className="w-3.5 h-3.5" style={{ color: accentColor }} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${
            isLight ? "text-slate-500" : "text-[#888]"
          }`}>Bill Schedule &amp; Payment Details</span>
          <span className={`ml-auto text-[9px] font-medium ${
            isLight ? "text-slate-400" : "text-[#555]"
          }`}>Click chips to toggle</span>
        </div>
        <div className="flex gap-2">
          <Chip
            label="Debit Type"
            value={bill.paymentType || bill.method || "Manual"}
            active={bill.paymentType === "Auto-Debit"}
            accentColor={accentColor}
            isLight={isLight}
          />
          <Chip
            label="Frequency"
            value={bill.recurringType || "Non-Recurring"}
            active={bill.recurringType === "Recurring"}
            accentColor={accentColor}
            isLight={isLight}
          />
          <Chip
            label="Amount Type"
            value={bill.costType || "Fixed"}
            active={bill.costType === "Fixed" || !bill.costType}
            accentColor={accentColor}
            isLight={isLight}
          />
        </div>
      </div>

      {/* Payment date when paid */}
      {localStatus === "paid" && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
          isLight ? "bg-emerald-50 border-emerald-200" : "bg-emerald-900/20 border-emerald-800/40"
        }`}>
          <span className={`text-[10px] font-bold uppercase tracking-wide ${
            isLight ? "text-emerald-700" : "text-emerald-400"
          }`}>Payment Date:</span>
          <input
            type="date"
            value={paidDate}
            onChange={(e) => {
              setPaidDate(e.target.value);
              toggleBillStatus(bill.id, "paid", e.target.value);
            }}
            className={`text-[11px] font-semibold border rounded px-2 py-0.5 focus:outline-none ${
              isLight ? "bg-white border-emerald-300 text-emerald-800" : "bg-[#111] border-emerald-700 text-emerald-300"
            }`}
          />
        </div>
      )}

      {/* Remarks */}
      <div className={`rounded-xl border p-3 ${
        isLight ? "bg-white border-slate-200" : "bg-[#161616] border-[#2a2a2a]"
      }`}>
        <div className="flex items-center gap-1.5 mb-2">
          <FileText className="w-3.5 h-3.5" style={{ color: accentColor }} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${
            isLight ? "text-slate-500" : "text-[#888]"
          }`}>Remarks / Payment Instructions</span>
          <button
            onClick={onEdit}
            className="ml-auto flex items-center gap-1 text-[10px] font-semibold"
            style={{ color: accentColor }}
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
        {isLink ? (
          <a
            href={remarks}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[11px] font-medium truncate hover:underline"
            style={{ color: accentColor }}
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span className="truncate">{remarks}</span>
          </a>
        ) : (
          <p className={`text-[11px] leading-relaxed whitespace-pre-wrap ${
            remarks
              ? isLight ? "text-slate-600" : "text-[#bbb]"
              : isLight ? "text-slate-400 italic" : "text-[#555] italic"
          }`}>
            {remarks || "No remarks"}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className={`flex items-center justify-between text-[10px] px-1 ${
        isLight ? "text-slate-400" : "text-[#555]"
      }`}>
        <span>Source Sheet: <strong className={isLight ? "text-slate-500" : "text-[#777]"}>{bill.sheet || `${bill.entity} Bills`}</strong></span>
        {bill.row && <span>Row Index: <strong className={isLight ? "text-slate-500" : "text-[#777]"}>{bill.row}</strong></span>}
      </div>
    </div>
  );
};

/* ── Main modal ───────────────────────────────────────────── */
export const BillDetailsModal: React.FC<BillDetailsModalProps> = ({
  vendorBills,
  isOpen,
  onClose,
  onEdit,
}) => {
  const { theme, toggleBillStatus, deleteBill } = useFinance();
  const isLight = theme === "light";
  const [idx, setIdx] = useState(0);

  if (!isOpen || vendorBills.length === 0) return null;

  const bill = vendorBills[Math.min(idx, vendorBills.length - 1)];
  const accentColor = getEntityColor(bill.entity);
  const total = vendorBills.reduce((s, b) => s + b.amount, 0);
  const multi = vendorBills.length > 1;

  const handleEdit = () => { onClose(); onEdit(bill); };

  const handleDelete = () => {
    if (confirm(`Delete bill for ${bill.vendor}?`)) {
      deleteBill(bill.id);
      if (vendorBills.length <= 1) onClose();
      else setIdx((p) => Math.max(0, p - 1));
    }
  };

  const handleMarkPaid = () => {
    toggleBillStatus(bill.id, bill.status === "paid" ? "unpaid" : "paid",
      bill.paidDate || new Date().toISOString().split("T")[0]);
  };

  const handleHold = () => {
    toggleBillStatus(bill.id, bill.status === "hold" ? "unpaid" : "hold");
  };

  const surf = isLight ? "bg-white text-slate-900" : "bg-[#111] text-white";

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border ${
        isLight ? "border-slate-200" : "border-[#2a2a2a]"
      } ${surf}`}>

        {/* Colored accent bar */}
        <div className="h-1.5 w-full" style={{ backgroundColor: accentColor }} />

        {/* Header */}
        <div className={`px-5 py-4 flex items-start justify-between border-b ${
          isLight ? "border-slate-100" : "border-[#222]"
        }`}>
          <div>
            <h2 className={`text-lg font-black tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
              {bill.vendor}
            </h2>
            <p className={`text-[11px] font-medium mt-0.5 ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              Accounts Payable Bill Details
              {multi && (
                <span className="ml-2 font-bold" style={{ color: accentColor }}>
                  · {vendorBills.length} bills · Total: {fmt(total)}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-full transition-colors ${
              isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-[#222] text-[#888]"
            }`}
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Bill navigator (multi-bill) */}
        {multi && (
          <div className={`flex items-center justify-between px-5 py-2 border-b text-[11px] font-semibold ${
            isLight ? "bg-slate-50 border-slate-100 text-slate-500" : "bg-[#161616] border-[#222] text-[#888]"
          }`}>
            <button
              onClick={() => setIdx((p) => Math.max(0, p - 1))}
              disabled={idx === 0}
              className="p-1 rounded hover:bg-black/10 disabled:opacity-30 transition-opacity"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>Bill {idx + 1} of {vendorBills.length}</span>
            <button
              onClick={() => setIdx((p) => Math.min(vendorBills.length - 1, p + 1))}
              disabled={idx === vendorBills.length - 1}
              className="p-1 rounded hover:bg-black/10 disabled:opacity-30 transition-opacity"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Detail body */}
        <div className="px-5 py-4 overflow-y-auto max-h-[70vh]">
          <BillDetail
            key={bill.id}
            bill={bill}
            isLight={isLight}
            accentColor={accentColor}
            onEdit={handleEdit}
            onClose={onClose}
          />
        </div>

        {/* Action buttons */}
        <div className={`px-5 py-3 border-t flex items-center gap-2 flex-wrap ${
          isLight ? "border-slate-100 bg-slate-50" : "border-[#222] bg-[#0d0d0d]"
        }`}>
          <button
            onClick={handleMarkPaid}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all hover:opacity-90 shadow-xs"
            style={{ backgroundColor: accentColor }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {bill.status === "paid" ? "Mark Unpaid" : "Mark Paid"}
          </button>
          <button
            onClick={handleHold}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 border ${
              bill.status === "hold"
                ? "bg-amber-500 text-white border-amber-400"
                : isLight
                  ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                  : "bg-amber-900/20 text-amber-400 border-amber-800/40 hover:bg-amber-900/30"
            }`}
          >
            <PauseCircle className="w-3.5 h-3.5" />
            {bill.status === "hold" ? "Remove Hold" : "Put On Hold"}
          </button>
          <button
            onClick={handleEdit}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ml-auto ${
              isLight
                ? "border-slate-200 text-slate-600 hover:bg-slate-100"
                : "border-[#333] text-[#aaa] hover:bg-[#1a1a1a]"
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Bill
          </button>
          <button
            onClick={handleDelete}
            className={`p-2 rounded-lg border transition-colors ${
              isLight
                ? "border-red-200 text-red-500 hover:bg-red-50"
                : "border-red-900/40 text-red-400 hover:bg-red-900/20"
            }`}
            title="Delete bill"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
