import React, { useState } from "react";
import { APBill } from "../../types";
import { useFinance } from "../../context/FinanceContext";
import { X, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";

interface BillDetailsModalProps {
  vendorBills: APBill[];
  isOpen: boolean;
  onClose: () => void;
  onEdit: (bill: APBill) => void;
}

const STATUS_OPTIONS = [
  { value: "hold",   label: "On Hold" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid",   label: "Paid" },
];

const STATUS_COLORS: Record<string, { badge: string; dropdown: string }> = {
  paid:   { badge: "bg-[#e8f5e9] text-[#2e7d32]", dropdown: "bg-[#e8f5e9] text-[#2e7d32] border-[#a5d6a7]" },
  unpaid: { badge: "bg-[#ffebee] text-[#c62828]", dropdown: "bg-[#ffebee] text-[#c62828] border-[#ef9a9a]" },
  hold:   { badge: "bg-[#fff3e0] text-[#e65100]", dropdown: "bg-[#fff3e0] text-[#e65100] border-[#ffcc80]" },
};

const ENTITY_COLORS: Record<string, string> = {
  "Ruby's": "#d81b60",
  TI:       "#1a73e8",
  MSDx:     "#00897b",
};

const fmt = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface BillRowProps {
  bill: APBill;
  isLight: boolean;
  onEdit: (bill: APBill) => void;
}

const BillRow: React.FC<BillRowProps> = ({ bill, isLight, onEdit }) => {
  const { toggleBillStatus, deleteBill, updateBill } = useFinance();
  const [localStatus, setLocalStatus] = useState<string>(bill.status || "unpaid");
  const [paidDate, setPaidDate] = useState(bill.paymentDate || bill.paidDate || new Date().toISOString().split("T")[0]);
  const [showDetails, setShowDetails] = useState(false);

  const colors = STATUS_COLORS[localStatus] || STATUS_COLORS.unpaid;

  const handleStatusChange = (newStatus: string) => {
    setLocalStatus(newStatus);
    if (newStatus === "paid") {
      toggleBillStatus(bill.id, "paid", paidDate);
    } else {
      toggleBillStatus(bill.id, newStatus as any);
    }
  };

  const handlePaidDateChange = (d: string) => {
    setPaidDate(d);
    if (localStatus === "paid") toggleBillStatus(bill.id, "paid", d);
  };

  const handleQBOToggle = () => {
    updateBill({ ...bill, inQBO: !bill.inQBO });
  };

  const remarks = bill.paymentInstructions || bill.remarks || bill.notes || "";

  const card = isLight ? "bg-slate-50 border-slate-200" : "bg-[#1c1c1c] border-[#2a2a2a]";

  return (
    <div className={`rounded-xl border ${card} overflow-hidden`}>
      {/* Main row */}
      <div className="p-3 flex flex-col gap-2">
        {/* Top: invoice + amount + QBO + status */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-[11px] font-mono font-bold ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              {bill.invoiceNo || "—"}
            </span>
            <span className={`text-sm font-extrabold ${isLight ? "text-slate-900" : "text-white"}`}>
              {fmt(bill.amount)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* QBO Badge */}
            <button
              onClick={handleQBOToggle}
              title={bill.inQBO ? "In QBO — click to toggle" : "Not in QBO — click to toggle"}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black transition-all border ${
                bill.inQBO
                  ? "bg-emerald-500 text-white border-emerald-400"
                  : isLight ? "bg-slate-200 text-slate-500 border-slate-300" : "bg-[#333] text-[#888] border-[#444]"
              }`}
            >Q</button>

            {/* Status dropdown */}
            <select
              value={localStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`text-[11px] font-bold rounded-full px-2 py-0.5 border focus:outline-none cursor-pointer ${colors.dropdown}`}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Payment date — only when paid */}
        {localStatus === "paid" && (
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`}>Payment Date:</span>
            <input
              type="date"
              value={paidDate}
              onChange={(e) => handlePaidDateChange(e.target.value)}
              className={`text-[11px] font-semibold border rounded px-2 py-0.5 focus:outline-none ${
                isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#111] border-[#444] text-white"
              }`}
            />
          </div>
        )}

        {/* Due date + invoice date row */}
        <div className={`flex flex-wrap items-center gap-3 text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>
          {bill.dueDate && <span>Due: <strong className={isLight ? "text-slate-700" : "text-[#ccc]"}>{bill.dueDate}</strong></span>}
          {bill.invoiceDate && <span>Inv: <strong className={isLight ? "text-slate-700" : "text-[#ccc]"}>{bill.invoiceDate}</strong></span>}
          {bill.method && bill.method !== "Manual" && (
            <span>Via: <strong className={isLight ? "text-slate-700" : "text-[#ccc]"}>{bill.method}</strong></span>
          )}
        </div>

        {/* Bottom: details toggle + edit + delete */}
        <div className="flex items-center justify-between gap-1">
          <button
            onClick={() => setShowDetails((p) => !p)}
            className={`flex items-center gap-1 text-[11px] font-semibold ${isLight ? "text-slate-500 hover:text-slate-700" : "text-[#888] hover:text-white"} transition-colors`}
          >
            {showDetails ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {showDetails ? "Hide details" : "Show details"}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(bill)}
              className={`p-1.5 rounded-lg text-sky-400 ${isLight ? "hover:bg-sky-50" : "hover:bg-sky-900/20"} transition-colors`}
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { if (confirm(`Delete bill for ${bill.vendor}?`)) deleteBill(bill.id); }}
              className={`p-1.5 rounded-lg text-red-400 ${isLight ? "hover:bg-red-50" : "hover:bg-red-900/20"} transition-colors`}
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Details panel */}
      {showDetails && (
        <div className={`px-3 pb-3 pt-0 border-t ${isLight ? "border-slate-200" : "border-[#333]"}`}>
          <p className={`text-[11px] mt-2 leading-relaxed whitespace-pre-wrap ${isLight ? "text-slate-600" : "text-[#bbb]"}`}>
            {remarks || <span className={isLight ? "text-slate-400 italic" : "text-[#666] italic"}>No remarks</span>}
          </p>
        </div>
      )}
    </div>
  );
};

export const BillDetailsModal: React.FC<BillDetailsModalProps> = ({ vendorBills, isOpen, onClose, onEdit }) => {
  const { theme } = useFinance();
  const isLight = theme === "light";

  if (!isOpen || vendorBills.length === 0) return null;

  const vendor = vendorBills[0].vendor;
  const entity = vendorBills[0].entity;
  const sheet = vendorBills[0].sheet || `${entity} Bills`;
  const accentColor = ENTITY_COLORS[entity] || ENTITY_COLORS.TI;
  const totalAmount = vendorBills.reduce((s, b) => s + b.amount, 0);

  const surf = isLight ? "bg-white text-slate-900" : "bg-[#121212] text-white";

  const handleEdit = (bill: APBill) => {
    onClose();
    onEdit(bill);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className={`w-full max-w-lg border border-[#333] rounded-2xl shadow-2xl overflow-hidden ${surf}`}>

        {/* Header */}
        <div style={{ backgroundColor: accentColor }} className="px-5 py-4 flex items-center justify-between text-white">
          <div>
            <h2 className="text-lg font-black tracking-tight">{vendor}</h2>
            <p className="text-[11px] text-white/75 font-medium">
              {sheet} — {vendorBills.length} bill{vendorBills.length !== 1 ? "s" : ""} · Total: <strong>{fmt(totalAmount)}</strong>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bill list */}
        <div className="p-4 space-y-2.5 overflow-y-auto max-h-[80vh]">
          {vendorBills.map((bill) => (
            <BillRow key={bill.id} bill={bill} isLight={isLight} onEdit={handleEdit} />
          ))}
        </div>
      </div>
    </div>
  );
};
