import React, { useState, useEffect, useMemo } from "react";
import { APBill, EntityName } from "../../types";
import { useFinance } from "../../context/FinanceContext";
import { X, Check, Paperclip, FileCheck2, ExternalLink } from "lucide-react";

interface EditBillModalProps {
  bill: APBill | null;
  isOpen: boolean;
  onClose: () => void;
}

const SHEET_THEMES: Record<string, { bg: string; btn: string }> = {
  "Ruby's Bills": { bg: "bg-[#d81b60]", btn: "bg-[#d81b60] hover:bg-[#c2185b]" },
  "MSDx Bills":  { bg: "bg-[#00897b]", btn: "bg-[#00897b] hover:bg-[#00695c]" },
  "TI Bills":    { bg: "bg-[#1a73e8]", btn: "bg-[#1a73e8] hover:bg-[#1557b0]" },
};

const DEFAULT_TI_COMPANIES = ["4G", "4YR", "Corner Property Group", "E1", "TI"];

export const EditBillModal: React.FC<EditBillModalProps> = ({ bill, isOpen, onClose }) => {
  const { apBills, updateBill, theme } = useFinance();

  const tiCompanies = useMemo(() => {
    const set = new Set<string>(DEFAULT_TI_COMPANIES);
    apBills.filter((b) => b.entity === "TI" && b.company).forEach((b) => set.add(b.company!));
    return Array.from(set).sort();
  }, [apBills]);
  const isLight = theme === "light";

  const [selectedSheet, setSelectedSheet] = useState("TI Bills");
  const [subCompany, setSubCompany] = useState("TI");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [remarks, setRemarks] = useState("");
  // TI: "payvia" | "remarks"   Ruby's/MSDx: "instr" | "status1"
  const [remarksTarget, setRemarksTarget] = useState<"payvia" | "remarks" | "instr" | "status1">("instr");
  const [status, setStatus] = useState<"unpaid" | "paid" | "hold">("unpaid");
  const [inQBO, setInQBO] = useState(false);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  useEffect(() => {
    if (!bill) return;
    setAttachFile(null);
    const sheetName = bill.sheet || `${bill.entity} Bills`;
    setSelectedSheet(sheetName);
    setSubCompany(bill.company || bill.entity || "TI");
    setVendor(bill.vendor || "");
    setCategory(bill.category || "");
    setInvoiceNo(bill.invoiceNo || "");
    setInvoiceDate(bill.invoiceDate || "");
    setDueDate(bill.dueDate || "");
    setAmount(bill.amount ? bill.amount.toString() : "");
    setPaymentDate(bill.paymentDate || bill.paidDate || "");
    setStatus(bill.status || "unpaid");
    setInQBO(!!bill.inQBO);

    const isTISheet = (bill.sheet || `${bill.entity} Bills`) === "TI Bills";
    if (isTISheet) {
      if (bill.method && bill.method !== "Manual") {
        setRemarks(bill.method);
        setRemarksTarget("payvia");
      } else {
        setRemarks(bill.remarks || bill.notes || "");
        setRemarksTarget("remarks");
      }
    } else {
      if (bill.paymentInstructions) {
        setRemarks(bill.paymentInstructions);
        setRemarksTarget("instr");
      } else if (bill.status1) {
        setRemarks(bill.status1);
        setRemarksTarget("status1");
      } else {
        setRemarks(bill.remarks || bill.notes || "");
        setRemarksTarget("instr");
      }
    }
  }, [bill]);

  const isTI = selectedSheet === "TI Bills";
  const isLayoutA = !isTI;

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

  const vendorOptions = useMemo(() => {
    const currentEntity = selectedSheet.replace(" Bills", "").trim();
    const set = new Set<string>();
    apBills.forEach((b) => {
      if ((b.entity === currentEntity || b.sheet === selectedSheet) && b.vendor) set.add(b.vendor);
    });
    if (set.size === 0) apBills.forEach((b) => b.vendor && set.add(b.vendor));
    return Array.from(set).sort();
  }, [apBills, selectedSheet]);

  if (!isOpen || !bill) return null;

  const currentTheme = SHEET_THEMES[selectedSheet] || SHEET_THEMES["TI Bills"];
  const entityName = selectedSheet.replace(" Bills", "").trim() as EntityName;

  const inp = `w-full border rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#1a73e8] ${
    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#1c1c1c] border-[#333] text-white"
  }`;
  const lbl = `block text-[11px] font-bold uppercase tracking-wider mb-1 ${isLight ? "text-slate-600" : "text-[#aaa]"}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor || !amount || !dueDate) return;

    const updated: APBill = {
      ...bill,
      vendor,
      entity: entityName,
      company: entityName === "TI" ? subCompany : entityName,
      category: isLayoutA ? (category || undefined) : undefined,
      invoiceNo: invoiceNo || undefined,
      invoiceDate: invoiceDate || undefined,
      dueDate,
      amount: parseFloat(amount) || 0,
      paymentDate: paymentDate || undefined,
      paidDate: paymentDate || undefined,
      method: "Manual" as any,
      status,
      inQBO,
      sheet: selectedSheet,
      // Clear all remarks fields then set correct one
      remarks: undefined,
      notes: undefined,
      paymentInstructions: undefined,
      status1: undefined,
    };

    if (isTI) {
      if (remarks) {
        if (remarksTarget === "payvia") updated.method = remarks as any;
        else updated.remarks = remarks;
      }
    } else {
      if (remarks) {
        if (remarksTarget === "instr") updated.paymentInstructions = remarks;
        else updated.status1 = remarks;
      }
    }

    // Upload new bill copy to Drive if one was selected
    if (attachFile) {
      setAttachUploading(true);
      setAttachError(null);
      try {
        const reader = new FileReader();
        const base64: string = await new Promise((res, rej) => {
          reader.onload = (ev) => res((ev.target?.result as string).split(",")[1]);
          reader.onerror = rej;
          reader.readAsDataURL(attachFile);
        });
        const resp = await fetch("/api/drive/upload-bill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: attachFile.type || "image/jpeg",
            entity: entityName,
            vendor,
            invoiceNo: invoiceNo || undefined,
            dueDate,
            amount: parseFloat(amount) || 0,
            userAccessToken: localStorage.getItem("google_access_token") || "",
          }),
        });
        if (resp.ok) {
          const { viewUrl, fileName } = await resp.json();
          updated.driveViewUrl = viewUrl;
          updated.driveFileName = fileName;
        } else {
          const err = await resp.json().catch(() => ({}));
          setAttachUploading(false);
          setAttachError(`Drive upload failed: ${err.details || err.error || resp.statusText}`);
          return; // don't close — let user see the error
        }
      } catch (e: any) {
        setAttachUploading(false);
        setAttachError(`Drive upload error: ${e?.message || "unknown error"}`);
        return;
      }
      setAttachUploading(false);
    }

    updateBill(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className={`w-full max-w-lg border border-[#333] rounded-2xl shadow-2xl overflow-hidden ${isLight ? "bg-white text-slate-900" : "bg-[#121212] text-white"}`}>

        <div className={`${currentTheme.bg} px-6 py-4 flex items-center justify-between text-white`}>
          <div>
            <h2 className="text-lg font-black tracking-tight">Edit Bill</h2>
            <p className="text-[11px] text-white/80">
              {vendor} · <span className="underline font-extrabold">{selectedSheet}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/20"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">

          {/* Sheet — disabled in edit (sheet is determined by the bill) */}
          <div>
            <label className={lbl}>Sheet</label>
            <input type="text" value={selectedSheet} disabled
              className={`${inp} opacity-60 cursor-not-allowed`} />
          </div>

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
            <input type="text" required list="edit-vendor-list" value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              autoComplete="new-password" data-lpignore="true" data-form-type="other"
              className={inp} />
            <datalist id="edit-vendor-list">
              {vendorOptions.map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>

          {/* Category — Ruby's/MSDx only */}
          {isLayoutA && (
            <div>
              <label className={lbl}>Category</label>
              <input type="text" list="edit-cat-list" value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Utilities, Rent..."
                autoComplete="new-password" data-lpignore="true" data-form-type="other"
                className={inp} />
              <datalist id="edit-cat-list">
                {Array.from(vendorCategoriesMap[vendor.toLowerCase().trim()] || []).map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          )}

          {/* Invoice # + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Invoice #</label>
              <input type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}
                autoComplete="new-password" data-lpignore="true" data-form-type="other" className={inp} />
            </div>
            <div>
              <label className={lbl}>Amount ($) *</label>
              <input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inp} />
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

          {/* Status */}
          <div>
            <label className={lbl}>Status</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: "unpaid", label: "Unpaid", active: "bg-[#1a73e8] border-transparent text-white" },
                { v: "paid",   label: "Paid",   active: "bg-[#16a34a] border-transparent text-white" },
                { v: "hold",   label: "On Hold",active: "bg-[#e65100] border-transparent text-white" },
              ].map(({ v, label, active }) => (
                <button key={v} type="button" onClick={() => setStatus(v as any)}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    status === v ? active : isLight ? "bg-slate-100 border-slate-300 text-slate-600" : "bg-[#1c1c1c] border-[#333] text-[#888]"
                  }`}>{label}</button>
              ))}
            </div>
          </div>

          {/* QBO */}
          <label className={`flex items-center gap-2 cursor-pointer border p-2.5 rounded-lg select-none ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#1c1c1c] border-[#333]"}`}>
            <input type="checkbox" checked={inQBO} onChange={(e) => setInQBO(e.target.checked)}
              className="rounded w-4 h-4 cursor-pointer" />
            <span className={`text-xs font-bold flex items-center gap-1.5 ${isLight ? "text-slate-800" : "text-white"}`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center font-black text-[10px] ${inQBO ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-400"}`}>Q</span>
              QuickBooks Online (QBO)
            </span>
          </label>

          {/* Remarks / column picker */}
          <div>
            <label className={lbl}>{isTI ? "Payment Via / Remarks" : "Payment Instructions / Status 1"}</label>
            <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)}
              placeholder={isTI ? "e.g. ACH, Check, Wire, or payment notes..." : "Payment notes or instructions..."}
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
                        <input type="radio" name="editRemarksCol" checked={remarksTarget === "payvia"} onChange={() => setRemarksTarget("payvia")} />
                        <span>Payment Via (col M)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="editRemarksCol" checked={remarksTarget === "remarks"} onChange={() => setRemarksTarget("remarks")} />
                        <span>Remarks (col O)</span>
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="editRemarksCol" checked={remarksTarget === "instr"} onChange={() => setRemarksTarget("instr")} />
                        <span>Payment Instructions (col K)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="editRemarksCol" checked={remarksTarget === "status1"} onChange={() => setRemarksTarget("status1")} />
                        <span>Status 1 (col M)</span>
                      </label>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Attach Bill Copy */}
          <div>
            <label className={lbl}>Attach Bill Copy</label>
            {bill?.driveViewUrl && !attachFile ? (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${isLight ? "bg-green-50 border-green-200 text-green-700" : "bg-[#0a1a10] border-[#1a3a20] text-green-400"}`}>
                <FileCheck2 className="w-4 h-4 shrink-0" />
                <span className="truncate flex-1">{bill.driveFileName || "Bill copy on file"}</span>
                <a href={bill.driveViewUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-0.5 underline opacity-80 hover:opacity-100 shrink-0">
                  <ExternalLink className="w-3 h-3" /> View
                </a>
              </div>
            ) : null}
            {attachFile ? (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${isLight ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-[#0d1a2e] border-[#1a3a5c] text-[#4fa3e0]"}`}>
                <FileCheck2 className="w-4 h-4 shrink-0" />
                <span className="truncate flex-1">{attachFile.name}</span>
                <button type="button" onClick={() => setAttachFile(null)} className="opacity-60 hover:opacity-100 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className={`mt-1.5 flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed cursor-pointer text-xs transition-colors ${isLight ? "border-slate-300 text-slate-500 hover:border-blue-400 hover:bg-blue-50" : "border-[#333] text-[#666] hover:border-[#555] hover:bg-[#1a1a1a]"}`}>
                <Paperclip className="w-4 h-4 shrink-0" />
                <span>{bill?.driveViewUrl ? "Replace with new file…" : "Attach image or PDF…"}</span>
                <input type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setAttachFile(f); setAttachError(null); } e.target.value = ""; }} />
              </label>
            )}
          </div>

          {attachError && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {attachError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#333]">
            <button type="button" onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold ${isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-[#222] hover:bg-[#333] text-[#aaa]"}`}>
              Cancel
            </button>
            <button type="submit" disabled={attachUploading}
              className={`px-5 py-2 rounded-xl ${currentTheme.btn} text-xs font-bold text-white shadow-md flex items-center gap-1.5 disabled:opacity-70`}>
              <Check className="w-4 h-4" /> {attachUploading ? "Uploading…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
