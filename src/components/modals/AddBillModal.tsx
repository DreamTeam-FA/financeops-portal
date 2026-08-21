import React, { useState, useEffect, useMemo } from "react";
import { useFinance } from "../../context/FinanceContext";
import { EntityName } from "../../types";
import { X, Check } from "lucide-react";
import { ScanToFill } from "../ScanToFill";

interface AddBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEntity?: EntityName;
}

const SHEET_THEMES: Record<string, { bg: string; btn: string }> = {
  "Ruby's Bills": { bg: "bg-[#d81b60]", btn: "bg-[#d81b60] hover:bg-[#c2185b]" },
  "MSDx Bills":  { bg: "bg-[#00897b]", btn: "bg-[#00897b] hover:bg-[#00695c]" },
  "TI Bills":    { bg: "bg-[#1a73e8]", btn: "bg-[#1a73e8] hover:bg-[#1557b0]" },
};
const DEFAULT_SHEET_THEME = { bg: "bg-[#546e7a]", btn: "bg-[#546e7a] hover:bg-[#455a64]" };

const DEFAULT_TI_COMPANIES = ["4G", "4YR", "Corner Property Group", "E1", "TI"];

const PAY_VIA_OPTIONS = ["ACH", "Check", "Wire", "Credit Card", "Online", "Cash", "Auto-Debit", "Manual"];

export const AddBillModal: React.FC<AddBillModalProps> = ({ isOpen, onClose, defaultEntity = "Ruby's" }) => {
  const { apBills, addBill, theme, availableAPEntities } = useFinance();
  const isLight = theme === "light";

  const [selectedSheet, setSelectedSheet] = useState(`${defaultEntity} Bills`);
  const [subCompany, setSubCompany] = useState("TI");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [remarks, setRemarks] = useState("");
  // TI: "payvia" | "remarks"   Ruby's/MSDx: "instr" | "status1"
  const [remarksTarget, setRemarksTarget] = useState<"payvia" | "remarks" | "instr" | "status1">("instr");
  const [scanKey, setScanKey] = useState(0);
  const [scanFilled, setScanFilled] = useState(false);

  useEffect(() => {
    setSelectedSheet(`${defaultEntity} Bills`);
  }, [defaultEntity]);

  const isTI = selectedSheet === "TI Bills";
  const isRuby = selectedSheet === "Ruby's Bills";
  const isMSDx = selectedSheet === "MSDx Bills";
  const isLayoutA = isRuby || isMSDx;

  const tiCompanies = useMemo(() => {
    const set = new Set<string>(DEFAULT_TI_COMPANIES);
    apBills.filter((b) => b.entity === "TI" && b.company).forEach((b) => set.add(b.company!));
    return Array.from(set).sort();
  }, [apBills]);

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

  // Most-recent description per vendor (for auto-fill)
  const vendorDescriptionMap = useMemo(() => {
    const map: Record<string, string> = {};
    apBills.forEach((b) => {
      if (b.vendor && b.description)
        map[b.vendor.toLowerCase().trim()] = b.description;
    });
    return map;
  }, [apBills]);

  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    apBills.forEach((b) => {
      if ((b.sheet === selectedSheet || b.entity === selectedSheet.replace(" Bills", "")) && b.vendor)
        set.add(b.vendor);
    });
    if (set.size === 0) apBills.forEach((b) => b.vendor && set.add(b.vendor));
    return Array.from(set).sort();
  }, [apBills, selectedSheet]);

  const handleVendorChange = (val: string) => {
    setVendor(val);
    const key = val.toLowerCase().trim();
    // Auto-fill Category from history (Ruby's / MSDx)
    const cats = vendorCategoriesMap[key];
    if (cats && cats.size >= 1) setCategory(Array.from(cats)[0]);
    // Auto-fill Description from most recent matching bill (Ruby's / MSDx)
    if (!isTI) {
      const desc = vendorDescriptionMap[key];
      if (desc) setDescription(desc);
    }
    // Auto-fill TI sub-company from existing bills
    if (isTI) {
      const match = apBills.find((b) => b.vendor?.toLowerCase() === val.toLowerCase() && b.entity === "TI");
      if (match?.company) setSubCompany(match.company);
    }
  };

  const handleSheetChange = (sheet: string) => {
    setSelectedSheet(sheet);
    setVendor("");
    setDescription("");
    setCategory("");
    setRemarks("");
    setRemarksTarget(sheet === "TI Bills" ? "payvia" : "instr");
    setScanKey(k => k + 1);
    setScanFilled(false);
  };

  const handleScanFill = (data: any) => {
    if (!data) return;
    if (data.vendor)      setVendor(data.vendor);
    if (data.invoiceNo)   setInvoiceNo(String(data.invoiceNo));
    if (data.amount != null) setAmount(String(data.amount));
    if (data.issueDate)   setInvoiceDate(data.issueDate);
    if (data.dueDate)     setDueDate(data.dueDate);
    if (data.description) setDescription(data.description);
    setScanFilled(true);
  };

  if (!isOpen) return null;

  const theme2 = SHEET_THEMES[selectedSheet] || DEFAULT_SHEET_THEME;
  const entityName = selectedSheet.replace(" Bills", "").trim() as EntityName;

  const inp = `w-full border rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#1a73e8] ${
    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#1c1c1c] border-[#333] text-white"
  }`;
  const lbl = `block text-[11px] font-bold uppercase tracking-wider mb-1 ${isLight ? "text-slate-600" : "text-[#aaa]"}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor || !amount) return;

    const billData: any = {
      vendor,
      entity: entityName,
      company: isTI ? subCompany : entityName,
      invoiceNo: invoiceNo || undefined,
      invoiceDate: invoiceDate || undefined,
      dueDate,
      amount: parseFloat(amount) || 0,
      paymentDate: paymentDate || undefined,
      method: "Manual",
      status: "unpaid" as const,
      sheet: selectedSheet,
    };

    if (isTI) {
      if (remarks) {
        if (remarksTarget === "payvia") billData.method = remarks;
        else billData.remarks = remarks;
      }
    } else {
      billData.description = description || undefined;
      billData.category = category || undefined;
      if (remarks) {
        if (remarksTarget === "instr") billData.paymentInstructions = remarks;
        else billData.status1 = remarks;
      }
    }

    addBill(billData);
    onClose();
    setVendor(""); setAmount(""); setRemarks(""); setInvoiceNo("");
    setInvoiceDate(""); setPaymentDate(""); setDescription(""); setCategory("");
    setScanKey(k => k + 1); setScanFilled(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className={`w-full max-w-lg border border-[#333] rounded-2xl shadow-2xl overflow-hidden ${isLight ? "bg-white text-slate-900" : "bg-[#121212] text-white"}`}>

        <div className={`${theme2.bg} px-6 py-4 flex items-center justify-between text-white`}>
          <div>
            <h2 className="text-lg font-black tracking-tight">Add a Bill</h2>
            <p className="text-[11px] text-white/80">Sheet: <span className="font-extrabold underline">{selectedSheet}</span></p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/20"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">

          {/* Sheet */}
          <div>
            <label className={lbl}>Sheet *</label>
            <select value={selectedSheet} onChange={(e) => handleSheetChange(e.target.value)} className={inp}>
              {availableAPEntities.map((e) => (
                <option key={e} value={`${e} Bills`}>{e} Bills</option>
              ))}
            </select>
          </div>

          {/* Scan to fill */}
          <ScanToFill
            type="invoice"
            isLight={isLight}
            onFill={handleScanFill}
            resetKey={scanKey}
          />
          {scanFilled && (
            <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold ${isLight ? "bg-blue-50 border border-blue-200 text-blue-700" : "bg-[#0d1a2e] border border-[#1a3a5c] text-[#4fa3e0]"}`}>
              <span>✓ Fields auto-filled from scan — verify and adjust before submitting</span>
              <button type="button" onClick={() => { setScanKey(k => k + 1); setScanFilled(false); }} className="text-[10px] underline opacity-70 hover:opacity-100 shrink-0">Scan again</button>
            </div>
          )}

          {/* Company — TI only */}
          {isTI && (
            <div>
              <label className={lbl}>Company *</label>
              <div className="flex gap-1.5 flex-wrap">
                {tiCompanies.map((c) => (
                  <button key={c} type="button" onClick={() => setSubCompany(c)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-extrabold border transition-all ${
                      subCompany === c
                        ? "bg-[#1a73e8] text-white border-transparent"
                        : isLight ? "bg-slate-100 text-slate-700 border-slate-300" : "bg-[#1c1c1c] text-[#888] border-[#333]"
                    }`}>{c}</button>
                ))}
              </div>
            </div>
          )}

          {/* Vendor */}
          <div>
            <label className={lbl}>Vendor *</label>
            <input type="text" required list="add-vendor-list" value={vendor}
              onChange={(e) => handleVendorChange(e.target.value)}
              placeholder="Select or type vendor name..."
              autoComplete="new-password" data-lpignore="true" data-form-type="other"
              className={inp} />
            <datalist id="add-vendor-list">
              {vendorOptions.map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>

          {/* Description + Category — Ruby's/MSDx only */}
          {isLayoutA && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Description</label>
                <input type="text" list="add-desc-list" value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Rent, CAM…"
                  autoComplete="new-password" data-lpignore="true" data-form-type="other"
                  className={inp} />
                <datalist id="add-desc-list">
                  {Array.from(new Set(
                    apBills.filter(b => b.vendor?.toLowerCase() === vendor.toLowerCase().trim() && b.description)
                      .map(b => b.description!)
                  )).map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
              <div>
                <label className={lbl}>Category</label>
                <input type="text" list="add-cat-list" value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Rent Expense…"
                  autoComplete="new-password" data-lpignore="true" data-form-type="other"
                  className={inp} />
                <datalist id="add-cat-list">
                  {Array.from(vendorCategoriesMap[vendor.toLowerCase().trim()] || []).map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
          )}

          {/* Invoice # + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Invoice #</label>
              <input type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Optional"
                autoComplete="new-password" data-lpignore="true" data-form-type="other" className={inp} />
            </div>
            <div>
              <label className={lbl}>Amount ($) *</label>
              <input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={inp} />
            </div>
          </div>

          {/* Invoice Date + Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Invoice Date</label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Due Date *</label>
              <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inp} />
            </div>
          </div>

          {/* Payment Date */}
          <div>
            <label className={lbl}>Payment Date</label>
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={inp} />
          </div>

          {/* Remarks / column picker — shown for all sheets when text is entered */}
          <div>
            <label className={lbl}>{isTI ? "Payment Via / Remarks" : "Payment Instructions / Status 1"}</label>
            <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)}
              placeholder={isTI ? "e.g. ACH, Check, Wire, or payment notes..." : "Enter payment notes or instructions..."}
              className={`${inp} resize-vertical`} />

            {remarks && (
              <div className={`mt-2 p-2.5 rounded-lg border text-xs ${isLight ? "bg-blue-50 border-blue-200" : "bg-[#0d111a] border-[#2c2c2c]"}`}>
                <div className={`text-[10px] font-bold uppercase mb-1.5 ${isLight ? "text-blue-700" : "text-[#1a73e8]"}`}>
                  Save to which column?
                </div>
                <div className="flex gap-4">
                  {isTI ? (
                    <>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="addRemarksCol" checked={remarksTarget === "payvia"} onChange={() => setRemarksTarget("payvia")} />
                        <span>Payment Via (col M)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="addRemarksCol" checked={remarksTarget === "remarks"} onChange={() => setRemarksTarget("remarks")} />
                        <span>Remarks (col O)</span>
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="addRemarksCol" checked={remarksTarget === "instr"} onChange={() => setRemarksTarget("instr")} />
                        <span>Payment Instructions (col K)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="addRemarksCol" checked={remarksTarget === "status1"} onChange={() => setRemarksTarget("status1")} />
                        <span>Status 1 (col M)</span>
                      </label>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#333]">
            <button type="button" onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold ${isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-[#222] hover:bg-[#333] text-[#aaa]"}`}>
              Cancel
            </button>
            <button type="submit" className={`px-5 py-2 rounded-xl ${theme2.btn} text-xs font-bold text-white shadow-md flex items-center gap-1.5`}>
              <Check className="w-4 h-4" /> Add Bill
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
