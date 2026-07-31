import React, { useState, useEffect, useMemo } from "react";
import { APBill, EntityName } from "../../types";
import { useFinance } from "../../context/FinanceContext";
import { X, Check } from "lucide-react";

interface EditBillModalProps {
  bill: APBill | null;
  isOpen: boolean;
  onClose: () => void;
}

const SHEET_THEMES: Record<string, { bg: string; btn: string; border: string }> = {
  "Ruby's Bills": { bg: "bg-[#d81b60]", btn: "bg-[#d81b60] hover:bg-[#c2185b]", border: "border-[#d81b60]" },
  "MSDx Bills": { bg: "bg-[#008080]", btn: "bg-[#008080] hover:bg-[#006666]", border: "border-[#008080]" },
  "TI Bills": { bg: "bg-[#1a73e8]", btn: "bg-[#1a73e8] hover:bg-[#1557b0]", border: "border-[#1a73e8]" }
};

const TI_COMPANIES = ["4G", "4YR", "Corner Property Group", "E1", "TI"];

const COMMON_CATEGORIES = [
  "Rent & Facilities",
  "Utilities",
  "Software & SaaS",
  "Legal & Accounting",
  "Marketing & Advertising",
  "Insurance",
  "Payroll & Contractors",
  "Office Supplies",
  "Equipment & Maintenance",
  "Taxes & Licenses",
  "Travel & Entertainment"
];

export const EditBillModal: React.FC<EditBillModalProps> = ({ bill, isOpen, onClose }) => {
  const { apBills, updateBill, syncModuleToGoogleSheet, googleUser, theme } = useFinance();

  const [selectedSheet, setSelectedSheet] = useState<string>("TI Bills");
  const [subCompany, setSubCompany] = useState<string>("TI");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Manual"); // kept internally for sheet write
  const [remarks, setRemarks] = useState("");
  const [remarksTargetCol, setRemarksTargetCol] = useState<"Remarks" | "Payment Instructions" | "Status 1">("Remarks");
  const [status, setStatus] = useState<"unpaid" | "paid" | "hold">("unpaid");
  const [inQBO, setInQBO] = useState(false);
  const [syncToSheet, setSyncToSheet] = useState(true);

  useEffect(() => {
    if (bill) {
      const sheetName = bill.sheet || `${bill.entity} Bills`;
      setSelectedSheet(sheetName);
      setSubCompany(bill.company || bill.entity || "TI");
      setVendor(bill.vendor || "");
      setCategory(bill.category || "");
      setInvoiceNo(bill.invoiceNo || "");
      setInvoiceDate(bill.invoiceDate || "");
      setDueDate(bill.dueDate || "");
      setAmount(bill.amount ? bill.amount.toString() : "");
      setPaymentDate(bill.paymentDate || "");
      setPaymentMethod(bill.method || "Manual");
      // Strip existing [Column] prefix from remarks for display
      const rawRemarks = bill.remarks || "";
      const prefixMatch = rawRemarks.match(/^\[([^\]]+)\]\s*(.*)/s);
      if (prefixMatch) {
        const colName = prefixMatch[1] as "Remarks" | "Payment Instructions" | "Status 1";
        if (["Remarks", "Payment Instructions", "Status 1"].includes(colName)) {
          setRemarksTargetCol(colName);
        }
        setRemarks(prefixMatch[2]);
      } else {
        setRemarks(rawRemarks);
      }
      setStatus(bill.status || "unpaid");
      setInQBO(!!bill.inQBO);
    }
  }, [bill]);

  // vendor → set of known categories
  const vendorCategoriesMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    apBills.forEach((b) => {
      if (b.vendor && b.category) {
        const key = b.vendor.toLowerCase().trim();
        if (!map[key]) map[key] = new Set();
        map[key].add(b.category);
      }
    });
    return map;
  }, [apBills]);

  // Category options: vendor-specific if available, else all common
  const categoryOptions = useMemo(() => {
    const key = vendor.toLowerCase().trim();
    const vendorCats = key ? vendorCategoriesMap[key] : null;
    return vendorCats && vendorCats.size > 0
      ? Array.from(vendorCats).sort()
      : COMMON_CATEGORIES;
  }, [vendor, vendorCategoriesMap]);

  // Vendor options filtered by sheet
  const vendorOptions = useMemo(() => {
    const currentEntity = selectedSheet.replace(" Bills", "").trim();
    const set = new Set<string>();
    apBills.forEach((b) => {
      const matchEntity = b.entity === currentEntity || b.sheet === selectedSheet;
      if (matchEntity && b.vendor) set.add(b.vendor);
    });
    if (set.size === 0) apBills.forEach((b) => b.vendor && set.add(b.vendor));
    return Array.from(set).sort();
  }, [apBills, selectedSheet]);

  const handleVendorChange = (val: string) => {
    setVendor(val);
    const key = val.toLowerCase().trim();
    const cats = vendorCategoriesMap[key];
    if (cats && cats.size >= 1) {
      setCategory(Array.from(cats)[0]);
    }
  };

  if (!isOpen || !bill) return null;

  const currentTheme = SHEET_THEMES[selectedSheet] || SHEET_THEMES["TI Bills"];
  const isLight = theme === "light";
  const entityName = selectedSheet.replace(" Bills", "").trim() as EntityName;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor || !amount || !dueDate) return;

    const updated: APBill = {
      ...bill,
      vendor,
      entity: entityName,
      company: entityName === "TI" ? subCompany : entityName,
      category: category || "General Expense",
      invoiceNo: invoiceNo || undefined,
      invoiceDate: invoiceDate || undefined,
      dueDate,
      amount: parseFloat(amount) || 0,
      paymentDate: paymentDate || undefined,
      method: (paymentMethod as any) || "Manual",
      remarks: remarks ? `[${remarksTargetCol}] ${remarks}` : undefined,
      status,
      inQBO,
      sheet: selectedSheet
    };

    updateBill(updated);

    if (syncToSheet && googleUser) {
      syncModuleToGoogleSheet("ap", false);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className={`w-full max-w-lg ${isLight ? "bg-white text-slate-900" : "bg-[#121212] text-white"} border border-[#333] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150`}>

        {/* Header */}
        <div className={`${currentTheme.bg} px-6 py-4 flex items-center justify-between text-white shadow-md`}>
          <div>
            <h2 className="text-lg font-black tracking-tight">Edit Accounts Payable Bill</h2>
            <p className="text-[11px] text-white/80 font-medium">
              Editing bill for <span className="font-extrabold underline">{vendor}</span> ({selectedSheet})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/20 text-white/90 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">

          {/* 1. Company / Sheet */}
          <div>
            <label className={`block text-[11px] font-bold uppercase tracking-wider ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>
              Company / Sheet *
            </label>
            <select
              value={selectedSheet}
              onChange={(e) => setSelectedSheet(e.target.value)}
              className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#1c1c1c] border-[#333] text-white"} border rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#1a73e8]`}
            >
              <option value="Ruby's Bills">Ruby's Bills</option>
              <option value="TI Bills">TI Bills</option>
              <option value="MSDx Bills">MSDx Bills</option>
            </select>
          </div>

          {/* 2. Company under TI */}
          {selectedSheet === "TI Bills" && (
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>
                Company (under TI) *
              </label>
              <div className="flex gap-2">
                {TI_COMPANIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSubCompany(c)}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-extrabold border transition-all ${
                      subCompany === c
                        ? `${currentTheme.bg} text-white border-transparent shadow-xs`
                        : `${isLight ? "bg-slate-100 text-slate-700 border-slate-300" : "bg-[#1c1c1c] text-[#888] border-[#333]"}`
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Vendor */}
          <div>
            <label className={`block text-[11px] font-bold uppercase tracking-wider ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>
              Vendor *
            </label>
            <input
              type="text"
              required
              list="edit-vendor-options-list"
              value={vendor}
              onChange={(e) => handleVendorChange(e.target.value)}
              className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#1c1c1c] border-[#333] text-white"} border rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#1a73e8]`}
            />
            <datalist id="edit-vendor-options-list">
              {vendorOptions.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          {/* 4. Category — vendor-specific options */}
          <div>
            <label className={`block text-[11px] font-bold uppercase tracking-wider ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>
              Category
            </label>
            <input
              type="text"
              list="edit-category-options-list"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#1c1c1c] border-[#333] text-white"} border rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#1a73e8]`}
            />
            <datalist id="edit-category-options-list">
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          {/* 5. Invoice # & Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>
                Invoice #
              </label>
              <input
                type="text"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#1c1c1c] border-[#333] text-white"} border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#1a73e8]`}
              />
            </div>
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>
                Amount ($) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#1c1c1c] border-[#333] text-white"} border rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#1a73e8]`}
              />
            </div>
          </div>

          {/* 6. Invoice Date & Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#1c1c1c] border-[#333] text-white"} border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#1a73e8]`}
              />
            </div>
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>
                Due Date *
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#1c1c1c] border-[#333] text-white"} border rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#1a73e8]`}
              />
            </div>
          </div>

          {/* 7. Payment Date (full width) */}
          <div>
            <label className={`block text-[11px] font-bold uppercase tracking-wider ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>
              Payment Date
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#1c1c1c] border-[#333] text-white"} border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#1a73e8]`}
            />
          </div>

          {/* 8. Status */}
          <div>
            <label className={`block text-[11px] font-bold uppercase tracking-wider ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>
              Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStatus("unpaid")}
                className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                  status === "unpaid"
                    ? "bg-[#1a73e8] border-[#1a73e8] text-white"
                    : `${isLight ? "bg-slate-100 border-slate-300 text-slate-600" : "bg-[#1c1c1c] border-[#333] text-[#888]"}`
                }`}
              >
                Unpaid
              </button>
              <button
                type="button"
                onClick={() => setStatus("paid")}
                className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                  status === "paid"
                    ? "bg-[#16a34a] border-[#16a34a] text-white"
                    : `${isLight ? "bg-slate-100 border-slate-300 text-slate-600" : "bg-[#1c1c1c] border-[#333] text-[#888]"}`
                }`}
              >
                Paid
              </button>
              <button
                type="button"
                onClick={() => setStatus("hold")}
                className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                  status === "hold"
                    ? "bg-[#e65100] border-[#e65100] text-white"
                    : `${isLight ? "bg-slate-100 border-slate-300 text-slate-600" : "bg-[#1c1c1c] border-[#333] text-[#888]"}`
                }`}
              >
                On Hold
              </button>
            </div>
          </div>

          {/* QBO Toggle */}
          <label className={`flex items-center gap-2 cursor-pointer ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#1c1c1c] border-[#333]"} border p-2.5 rounded-lg select-none`}>
            <input
              type="checkbox"
              checked={inQBO}
              onChange={(e) => setInQBO(e.target.checked)}
              className="rounded bg-[#111] border-[#444] text-emerald-500 focus:ring-0 w-4 h-4 cursor-pointer"
            />
            <span className={`text-xs font-bold ${isLight ? "text-slate-800" : "text-white"} flex items-center gap-1.5`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center font-black text-[10px] ${
                inQBO ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-400"
              }`}>
                Q
              </span>
              QuickBooks Online (QBO Status Tickbox)
            </span>
          </label>

          {/* 9. Remarks & Target Column */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`block text-[11px] font-bold uppercase tracking-wider ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>
                Remarks / Instructions
              </label>
              <span className={`text-[10px] ${isLight ? "text-slate-400" : "text-[#777]"}`}>Target Column Selection</span>
            </div>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#1c1c1c] border-[#333] text-white"} border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#1a73e8] mb-2`}
            />
            {remarks && (
              <div className={`p-2.5 rounded-lg border ${isLight ? "bg-blue-50 border-blue-200" : "bg-[#181818] border-[#2c2c2c]"} space-y-1`}>
                <div className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? "text-blue-700" : "text-[#1a73e8]"}`}>
                  Save this remark to which Google Sheet column?
                </div>
                <div className="flex gap-3">
                  {(["Remarks", "Payment Instructions", "Status 1"] as const).map((col) => (
                    <label key={col} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="editRemarksCol"
                        checked={remarksTargetCol === col}
                        onChange={() => setRemarksTargetCol(col)}
                      />
                      <span>{col}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={syncToSheet}
              onChange={(e) => setSyncToSheet(e.target.checked)}
              className="rounded bg-[#1c1c1c] border-[#333] text-[#1a73e8] focus:ring-0"
            />
            <span className={`text-xs ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>
              Automatically push edits to source Google Sheet
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#333]">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold ${isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-[#222] hover:bg-[#333] text-[#aaa]"}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2 rounded-xl ${currentTheme.btn} text-xs font-bold text-white shadow-md flex items-center gap-1.5`}
            >
              <Check className="w-4 h-4" /> Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
