import React, { useState } from "react";
import { APBill } from "../../types";
import { useFinance } from "../../context/FinanceContext";
import {
  X, Pencil, Trash2, CheckCircle2, PauseCircle, Zap, FileText,
  ChevronDown, ExternalLink, FileImage, Search
} from "lucide-react";
import { Tooltip } from "../Tooltip";

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
      <p className={`font-bold leading-snug break-words ${isLight ? "text-slate-900" : "text-white"}`}
        style={{ fontSize: typeof value === "string" && value.length > 24 ? "11px" : "13px" }}>
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
    <p className="text-[12px] font-bold"
      style={active ? { color: accentColor } : {}}
    >
      {value || "—"}
    </p>
  </div>
);

/* ── Date formatter ──────────────────────────────────────── */
const fmtDate = (d?: string) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/* ── Single bill detail body ──────────────────────────────── */
const BillDetail: React.FC<{
  bill: APBill;
  isLight: boolean;
  accentColor: string;
  onEdit: () => void;
  onClose: () => void;
}> = ({ bill, isLight, accentColor, onEdit, onClose }) => {
  const { toggleBillStatus, updateBill } = useFinance();
  const [localStatus, setLocalStatus] = useState(bill.status || "unpaid");
  const [paidDate, setPaidDate] = useState(bill.paymentDate || bill.paidDate || "");

  // Individual note fields — shown as separate labeled rows in the Remarks section
  const remarksText    = bill.remarks || bill.notes || "";
  const payInstText    = bill.paymentInstructions || "";
  const status1Text    = bill.status1 || "";
  const paidViaText    = bill.paidVia || "";
  const hasAnyNote     = !!(remarksText || payInstText || status1Text || paidViaText);

  // Legacy merged value used only for the Drive "View Bill" link detection
  const remarks = payInstText || remarksText;
  const isLink = remarks.startsWith("http");
  // driveViewUrl = uploaded copy (portal Drive feature); isLink = URL pasted in remarks.
  // Prefer the uploaded copy; fall back to the pasted link.
  const billViewUrl = bill.driveViewUrl || (isLink ? remarks : null);

  const handleQBO = () => updateBill({ ...bill, inQBO: !bill.inQBO });

  return (
    <div className="flex flex-col gap-3">
      {/* Amount card */}
      <div className={`rounded-xl border p-4 ${
        isLight ? "bg-white border-slate-200 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]" : "bg-[#161616] border-[#2a2a2a]"
      }`}>
        <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${
          isLight ? "text-slate-400" : "text-[#666]"
        }`}>Total Payable Amount</p>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-2xl font-black" style={{ color: accentColor }}>
            {fmt(bill.amount)}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Bill — prefers uploaded Drive copy; falls back to pasted link in remarks */}
            {billViewUrl && (
              <a
                href={billViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all no-underline ${
                  isLight
                    ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                    : "bg-blue-500/10 border-blue-500/25 text-blue-400 hover:bg-blue-500/20"
                }`}
              >
                <ExternalLink className="w-3 h-3" />
                {bill.driveViewUrl ? "View Bill Copy" : "View Bill"}
              </a>
            )}
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
        <InfoCard label="Company Entity" value={bill.entity} accent={accentColor} isLight={isLight} />
        <InfoCard label="Due Date" value={fmtDate(bill.dueDate) || "—"} isLight={isLight} />
        <InfoCard label="Invoice Number" value={bill.invoiceNo || "—"} isLight={isLight} />
      </div>

      {/* Invoice date row (if present) */}
      {bill.invoiceDate && (
        <div className="flex gap-2">
          <InfoCard label="Invoice Date" value={fmtDate(bill.invoiceDate)} isLight={isLight} />
        </div>
      )}

      {/* Description / Category row (Ruby's & MSDx only) */}
      {(bill.description || bill.category) && (
        <div className="flex gap-2">
          {bill.description && (
            <InfoCard label="Description" value={bill.description} isLight={isLight} />
          )}
          {bill.category && (
            <InfoCard label="Category" value={bill.category} isLight={isLight} />
          )}
        </div>
      )}

      {/* Schedule chips */}
      <div className={`rounded-xl border p-3 ${
        isLight ? "bg-white border-slate-200" : "bg-[#161616] border-[#2a2a2a]"
      }`}>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Zap className="w-3.5 h-3.5" style={{ color: accentColor }} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${
            isLight ? "text-slate-500" : "text-[#888]"
          }`}>Bill Schedule &amp; Payment Details</span>
        </div>
        <div className="flex gap-2">
          <Chip label="Debit Type" value={bill.paymentType || bill.method || "Manual"}
            active={bill.paymentType === "Auto-Debit"} accentColor={accentColor} isLight={isLight} />
          <Chip label="Frequency" value={bill.recurringType || "Non-Recurring"}
            active={bill.recurringType === "Recurring"} accentColor={accentColor} isLight={isLight} />
          <Chip label="Amount Type" value={bill.costType || "Fixed"}
            active={bill.costType === "Fixed" || !bill.costType} accentColor={accentColor} isLight={isLight} />
        </div>
      </div>

      {/* Payment date (paid bills) */}
      {localStatus === "paid" && (
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
          isLight ? "bg-emerald-50 border-emerald-200" : "bg-emerald-900/20 border-emerald-800/40"
        }`}>
          <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${isLight ? "text-emerald-600" : "text-emerald-400"}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wide shrink-0 ${
            isLight ? "text-emerald-700" : "text-emerald-400"
          }`}>Payment Date</span>
          <div className="ml-auto flex items-center gap-2">
            {paidDate ? (
              <>
                <span className={`text-[12px] font-bold ${isLight ? "text-emerald-800" : "text-emerald-300"}`}>
                  {fmtDate(paidDate)}
                </span>
                <Tooltip label="Edit payment date">
                  <input
                    type="date"
                    value={paidDate}
                    onChange={(e) => {
                      setPaidDate(e.target.value);
                      toggleBillStatus(bill.id, "paid", e.target.value);
                    }}
                    className={`text-[11px] font-semibold border rounded px-2 py-0.5 focus:outline-none ${
                      isLight ? "bg-white border-emerald-300 text-emerald-700" : "bg-[#0d111a] border-emerald-700 text-emerald-300"
                    }`}
                  />
                </Tooltip>
              </>
            ) : (
              <>
                <span className={`text-[11px] italic font-medium ${isLight ? "text-slate-400" : "text-[#555]"}`}>
                  -no record-
                </span>
                <button
                  onClick={() => {
                    const today = new Date().toISOString().split("T")[0];
                    setPaidDate(today);
                    toggleBillStatus(bill.id, "paid", today);
                  }}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                    isLight
                      ? "border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                      : "border-emerald-700 text-emerald-400 hover:bg-emerald-900/40"
                  }`}
                >
                  + Set Date
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Remarks / Notes section — four labeled fields, each shown when present */}
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
        {hasAnyNote ? (
          <div className="flex flex-col gap-1.5">
            {remarksText && (
              <div>
                <span className={`text-[9px] font-bold uppercase tracking-wider block mb-0.5 ${isLight ? "text-slate-400" : "text-[#666]"}`}>Remarks</span>
                <p className={`text-[11px] leading-relaxed whitespace-pre-wrap ${isLight ? "text-slate-600" : "text-[#bbb]"}`}>{remarksText}</p>
              </div>
            )}
            {payInstText && (
              <div>
                <span className={`text-[9px] font-bold uppercase tracking-wider block mb-0.5 ${isLight ? "text-slate-400" : "text-[#666]"}`}>Payment Instructions</span>
                {payInstText.startsWith("http") ? (
                  <a href={payInstText} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] font-medium truncate hover:underline"
                    style={{ color: accentColor }}>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span className="truncate">{payInstText}</span>
                  </a>
                ) : (
                  <p className={`text-[11px] leading-relaxed whitespace-pre-wrap ${isLight ? "text-slate-600" : "text-[#bbb]"}`}>{payInstText}</p>
                )}
              </div>
            )}
            {status1Text && (
              <div>
                <span className={`text-[9px] font-bold uppercase tracking-wider block mb-0.5 ${isLight ? "text-slate-400" : "text-[#666]"}`}>Status 1</span>
                <p className={`text-[11px] leading-relaxed whitespace-pre-wrap ${isLight ? "text-slate-600" : "text-[#bbb]"}`}>{status1Text}</p>
              </div>
            )}
            {paidViaText && (
              <div>
                <span className={`text-[9px] font-bold uppercase tracking-wider block mb-0.5 ${isLight ? "text-slate-400" : "text-[#666]"}`}>Paid Via</span>
                <p className={`text-[11px] leading-relaxed whitespace-pre-wrap ${isLight ? "text-slate-600" : "text-[#bbb]"}`}>{paidViaText}</p>
              </div>
            )}
          </div>
        ) : (
          <p className={`text-[11px] italic ${isLight ? "text-slate-400" : "text-[#555]"}`}>No remarks</p>
        )}
      </div>

      {/* Footer meta */}
      <div className={`flex items-center justify-between text-[10px] px-1 ${
        isLight ? "text-slate-400" : "text-[#555]"
      }`}>
        <span>Source Sheet: <strong className={isLight ? "text-slate-500" : "text-[#777]"}>{bill.sheet || `${bill.entity} Bills`}</strong></span>
        {bill.row && <span>Row Index: <strong className={isLight ? "text-slate-500" : "text-[#777]"}>{bill.row}</strong></span>}
      </div>
    </div>
  );
};

/* ── Accordion item (used in multi-bill view) ─────────────── */
const AccordionItem: React.FC<{
  bill: APBill;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  isLight: boolean;
  onEdit: () => void;
  onClose: () => void;
}> = ({ bill, index, isOpen, onToggle, isLight, onEdit, onClose }) => {
  const { toggleBillStatus, deleteBill, showConfirm, showDatePicker } = useFinance() as any;
  const accentColor = getEntityColor(bill.entity);
  const overdue = bill.status === "unpaid" && isOverdue(bill.dueDate);
  // For view-bill link detection (same logic as BillDetail)
  const remarks = (bill as any).paymentInstructions || bill.remarks || bill.notes || "";
  const isLink = remarks.startsWith("http");

  const handleMarkPaid = () => {
    if (bill.status === "paid") {
      // Unmark — no date needed
      toggleBillStatus(bill.id, "unpaid");
    } else {
      const today = new Date().toISOString().split("T")[0];
      showDatePicker(
        `Enter payment date for ${bill.vendor}:`,
        bill.paidDate || today,
        (date: string) => toggleBillStatus(bill.id, "paid", date)
      );
    }
  };

  const handleHold = () =>
    toggleBillStatus(bill.id, bill.status === "hold" ? "unpaid" : "hold");

  const handleDelete = () => {
    showConfirm(`Delete this bill for ${bill.vendor}?`, () => deleteBill(bill.id));
  };

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        isLight ? "border-slate-200 bg-white" : "border-[#2a2a2a] bg-[#161616]"
      }`}
      style={isOpen ? { boxShadow: `0 0 0 2px ${accentColor}55` } : {}}
    >
      {/* ── Collapsed header / toggle row ── */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors rounded-xl ${
          isOpen
            ? isLight ? "bg-slate-50 rounded-b-none" : "bg-[#1a1a1a] rounded-b-none"
            : isLight ? "hover:bg-slate-50" : "hover:bg-[#1e1e1e]"
        }`}
      >
        {/* Bill number pill */}
        <span
          className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center text-white shrink-0"
          style={{ backgroundColor: accentColor }}
        >
          {index + 1}
        </span>

        {/* Amount */}
        <span className="text-[14px] font-black shrink-0" style={{ color: accentColor }}>
          {fmt(bill.amount)}
        </span>

        {/* Status badge */}
        <StatusBadge status={bill.status} dueDate={bill.dueDate} />

        {/* Spacer */}
        <span className="flex-1" />

        {/* Due date */}
        <span className={`text-[10px] font-semibold shrink-0 ${
          overdue
            ? "text-red-500"
            : isLight ? "text-slate-400" : "text-[#666]"
        }`}>
          Due {fmtDate(bill.dueDate) || "—"}
        </span>

        {/* Invoice number (if present) */}
        {bill.invoiceNo && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
            isLight ? "bg-slate-100 text-slate-500" : "bg-[#252525] text-[#888]"
          }`}>
            #{bill.invoiceNo}
          </span>
        )}

        {/* Chevron */}
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          } ${isLight ? "text-slate-400" : "text-[#555]"}`}
        />
      </button>

      {/* ── Expanded detail panel ── */}
      {isOpen && (
        <>
          <div className={`border-t px-4 pt-4 pb-2 ${
            isLight ? "border-slate-100" : "border-[#222]"
          }`}>
            <BillDetail
              key={bill.id}
              bill={bill}
              isLight={isLight}
              accentColor={accentColor}
              onEdit={onEdit}
              onClose={onClose}
            />
          </div>

          {/* Action buttons inside each expanded accordion item */}
          <div className={`px-4 py-3 border-t flex items-center gap-2 flex-wrap ${
            isLight ? "border-slate-100 bg-slate-50" : "border-[#222] bg-[#0d0d0d]"
          }`}>
            <button
              onClick={handleMarkPaid}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all hover:opacity-90 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
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
            {/* If both a Drive copy AND a pasted remarks link exist, show a small icon to access the original source link */}
            {bill.driveViewUrl && isLink && (
              <Tooltip label="View original source link (from remarks)">
                <a
                  href={remarks}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-1.5 rounded-lg transition-colors ${isLight ? "text-slate-400 hover:bg-slate-100" : "text-[#556] hover:bg-white/5"}`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </Tooltip>
            )}
            <button
              onClick={onEdit}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ml-auto ${
                isLight
                  ? "border-slate-200 text-slate-600 hover:bg-slate-100"
                  : "border-[#333] text-[#aaa] hover:bg-[#1a1a1a]"
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit Bill
            </button>
            <Tooltip label="Delete bill">
              <button
                onClick={handleDelete}
                className={`p-2 rounded-lg border transition-colors ${
                  isLight
                    ? "border-red-200 text-red-500 hover:bg-red-50"
                    : "border-red-900/40 text-red-400 hover:bg-red-900/20"
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
        </>
      )}
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
  const { theme, toggleBillStatus, deleteBill, showConfirm, showDatePicker } = useFinance() as any;
  const isLight = theme === "light";
  // For multi-bill: which accordion item is open (-1 = none, auto-open first)
  const [expandedIdx, setExpandedIdx] = useState<number>(-1);

  if (!isOpen || vendorBills.length === 0) return null;

  const multi = vendorBills.length > 1;
  const accentColor = getEntityColor(vendorBills[0].entity);
  const total = vendorBills.reduce((s, b) => s + b.amount, 0);
  const vendor = vendorBills[0].vendor;

  // Single-bill helpers (used in footer when multi=false)
  const singleBill = vendorBills[0];
  const handleSingleEdit = () => { onClose(); onEdit(singleBill); };
  const handleSingleDelete = () => {
    showConfirm(`Delete bill for ${singleBill.vendor}?`, () => { deleteBill(singleBill.id); onClose(); });
  };
  const handleSingleMarkPaid = () => {
    if (singleBill.status === "paid") {
      toggleBillStatus(singleBill.id, "unpaid");
    } else {
      const today = new Date().toISOString().split("T")[0];
      showDatePicker(
        `Enter payment date for ${singleBill.vendor}:`,
        singleBill.paidDate || today,
        (date: string) => toggleBillStatus(singleBill.id, "paid", date)
      );
    }
  };
  const handleSingleHold = () =>
    toggleBillStatus(singleBill.id, singleBill.status === "hold" ? "unpaid" : "hold");

  const surf = isLight ? "bg-white text-slate-900" : "bg-[#0d111a] text-white";

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
              {vendor}
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

        {/* ── MULTI-BILL: Accordion list ── */}
        {multi ? (
          <div className="px-4 pt-3 pb-4 overflow-y-auto max-h-[78vh] flex flex-col gap-2.5" style={{ scrollPaddingTop: "4px" }}>
            {vendorBills.map((bill, i) => (
              <AccordionItem
                key={bill.id}
                bill={bill}
                index={i}
                isOpen={expandedIdx === i}
                onToggle={() => setExpandedIdx(expandedIdx === i ? -1 : i)}
                isLight={isLight}
                onEdit={() => { onClose(); onEdit(bill); }}
                onClose={onClose}
              />
            ))}
          </div>
        ) : (
          /* ── SINGLE-BILL: original flat view ── */
          <>
            <div className="px-5 py-4 overflow-y-auto max-h-[70vh]">
              <BillDetail
                key={singleBill.id}
                bill={singleBill}
                isLight={isLight}
                accentColor={accentColor}
                onEdit={handleSingleEdit}
                onClose={onClose}
              />
            </div>
            <div className={`px-5 py-3 border-t flex items-center gap-2 flex-wrap ${
              isLight ? "border-slate-100 bg-slate-50" : "border-[#222] bg-[#0d0d0d]"
            }`}>
              <button
                onClick={handleSingleMarkPaid}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all hover:opacity-90 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
                style={{ backgroundColor: accentColor }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {singleBill.status === "paid" ? "Mark Unpaid" : "Mark Paid"}
              </button>
              <button
                onClick={handleSingleHold}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 border ${
                  singleBill.status === "hold"
                    ? "bg-amber-500 text-white border-amber-400"
                    : isLight
                      ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                      : "bg-amber-900/20 text-amber-400 border-amber-800/40 hover:bg-amber-900/30"
                }`}
              >
                <PauseCircle className="w-3.5 h-3.5" />
                {singleBill.status === "hold" ? "Remove Hold" : "Put On Hold"}
              </button>
              <button
                onClick={handleSingleEdit}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ml-auto ${
                  isLight
                    ? "border-slate-200 text-slate-600 hover:bg-slate-100"
                    : "border-[#333] text-[#aaa] hover:bg-[#1a1a1a]"
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Bill
              </button>
              <Tooltip label="Delete bill">
                <button
                  onClick={handleSingleDelete}
                  className={`p-2 rounded-lg border transition-colors ${
                    isLight
                      ? "border-red-200 text-red-500 hover:bg-red-50"
                      : "border-red-900/40 text-red-400 hover:bg-red-900/20"
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
