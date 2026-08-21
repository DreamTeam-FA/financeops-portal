/**
 * InvoiceScanner — Drop or paste a photo of a bill/invoice.
 * Sends to /api/invoice/scan (Gemini Vision), user verifies the data,
 * then "Save to AP" encodes it into the portal's AP bills list.
 */
import React, { useState, useRef, useCallback } from "react";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, X, RefreshCw, Save } from "lucide-react";

interface InvoiceData {
  vendor: string;
  invoiceNo: string | null;
  amount: number | null;
  dueDate: string | null;
  issueDate: string | null;
  entity: string;
  description: string;
  remarks: string;
}

interface Props {
  isLight: boolean;
}

const ENTITIES = ["Ruby's", "TI", "MSDx", "CurcuminPro", "Ziglar", "Corner Property Group", "Other"];

export const InvoiceScanner: React.FC<Props> = ({ isLight }) => {
  const [dragOver, setDragOver] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<InvoiceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const card  = isLight ? "bg-white border-slate-200 text-slate-800"  : "bg-[#0d111a] border-[#1a2235] text-white";
  const muted = isLight ? "text-slate-500" : "text-[#888]";
  const inp   = isLight
    ? "bg-white border-slate-300 text-slate-800 focus:border-[#1a73e8]"
    : "bg-[#0a0f1c] border-[#1a2235] text-white focus:border-[#1a73e8]";

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please drop an image file (JPEG, PNG, HEIC, etc.)");
      return;
    }
    setError(null);
    setResult(null);
    setSaved(false);

    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);

    const b64Reader = new FileReader();
    b64Reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";

      setScanning(true);
      try {
        const resp = await fetch("/api/invoice/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType })
        });
        const json = await resp.json();
        if (!resp.ok || !json.ok) {
          setError(json.error || "Scan failed. Please try again.");
        } else {
          setResult(json.invoice);
        }
      } catch (err: any) {
        setError(err?.message || "Network error.");
      } finally {
        setScanning(false);
      }
    };
    b64Reader.readAsDataURL(file);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const update = (field: keyof InvoiceData, value: string | number | null) => {
    if (!result) return;
    setResult({ ...result, [field]: value });
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setImagePreview(null);
    setScanning(false);
    setSaved(false);
  };

  const saveBill = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const resp = await fetch("/api/ap/add-scanned-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result)
      });
      if (resp.ok) {
        setSaved(true);
      } else {
        const j = await resp.json();
        setError(j.error || "Save failed");
      }
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* Drop Zone */}
      {!result && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !scanning && inputRef.current?.click()}
          className={[
            "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200",
            "min-h-[200px] p-8 text-center select-none",
            dragOver
              ? "border-[#1a73e8] bg-[#1a73e8]/10"
              : isLight
                ? "border-slate-300 bg-slate-50 hover:border-[#1a73e8] hover:bg-[#1a73e8]/5"
                : "border-[#1a2235] bg-[#0d111a] hover:border-[#1a73e8] hover:bg-[#1a73e8]/5",
          ].join(" ")}
        >
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

          {scanning ? (
            <>
              {imagePreview && (
                <img src={imagePreview} alt="Invoice preview" className="max-h-28 rounded-lg opacity-50 mb-1 object-contain" />
              )}
              <Loader2 className="w-8 h-8 text-[#1a73e8] animate-spin" />
              <p className={`text-sm font-semibold ${muted}`}>Reading invoice with AI…</p>
              <p className={`text-xs ${muted}`}>Extracting vendor, amount, due date & more</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-[#1a73e8]/15 flex items-center justify-center">
                <FileText className="w-7 h-7 text-[#1a73e8]" />
              </div>
              <div>
                <p className={`text-sm font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
                  Drop a bill or invoice photo here
                </p>
                <p className={`text-xs mt-1 ${muted}`}>
                  Printed or handwritten — JPEG, PNG, HEIC accepted
                </p>
              </div>
              <div className={`flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-full ${isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]"}`}>
                <Upload className="w-3 h-3" /> Powered by Gemini Vision AI
              </div>
            </>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${isLight ? "bg-red-50 border-red-200 text-red-800" : "bg-red-950/30 border-red-900/50 text-red-300"}`}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
          <div className="flex-1 text-xs">{error}</div>
          <button onClick={() => setError(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Result — Verify & Encode */}
      {result && (
        <div className="space-y-4">

          {/* Image + fields */}
          <div className={`rounded-xl border p-4 ${card}`}>
            <div className="flex items-start gap-4">
              {imagePreview && (
                <img src={imagePreview} alt="Scanned invoice" className="w-28 h-28 rounded-lg object-cover border border-[#1a2235] shrink-0" />
              )}
              <div className="flex-1 grid grid-cols-2 gap-3 text-xs">
                <label className="flex flex-col gap-1 col-span-2">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Vendor / Biller</span>
                  <input
                    value={result.vendor}
                    onChange={e => update("vendor", e.target.value)}
                    className={`px-2.5 py-1.5 rounded border text-xs font-bold ${inp}`}
                    placeholder="Vendor name"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Invoice / Bill #</span>
                  <input
                    value={result.invoiceNo ?? ""}
                    onChange={e => update("invoiceNo", e.target.value || null)}
                    className={`px-2.5 py-1.5 rounded border text-xs ${inp}`}
                    placeholder="Invoice number"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Amount Due ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={result.amount ?? ""}
                    onChange={e => update("amount", e.target.value === "" ? null : Number(e.target.value))}
                    className={`px-2.5 py-1.5 rounded border text-xs font-bold text-[#1a73e8] ${inp}`}
                    placeholder="0.00"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Due Date</span>
                  <input
                    value={result.dueDate ?? ""}
                    onChange={e => update("dueDate", e.target.value || null)}
                    className={`px-2.5 py-1.5 rounded border text-xs ${inp}`}
                    placeholder="MM/DD/YYYY"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Issue Date</span>
                  <input
                    value={result.issueDate ?? ""}
                    onChange={e => update("issueDate", e.target.value || null)}
                    className={`px-2.5 py-1.5 rounded border text-xs ${inp}`}
                    placeholder="MM/DD/YYYY"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Entity / Company</span>
                  <select
                    value={result.entity || ""}
                    onChange={e => update("entity", e.target.value)}
                    className={`px-2.5 py-1.5 rounded border text-xs ${inp}`}
                  >
                    <option value="">— Select entity —</option>
                    {ENTITIES.map(en => <option key={en} value={en}>{en}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 col-span-2">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Description</span>
                  <input
                    value={result.description}
                    onChange={e => update("description", e.target.value)}
                    className={`px-2.5 py-1.5 rounded border text-xs ${inp}`}
                    placeholder="What is this bill for?"
                  />
                </label>
                <label className="flex flex-col gap-1 col-span-2">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Remarks / Notes</span>
                  <input
                    value={result.remarks}
                    onChange={e => update("remarks", e.target.value)}
                    className={`px-2.5 py-1.5 rounded border text-xs ${inp}`}
                    placeholder="Any additional notes"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Summary card */}
          <div className={`rounded-xl border px-4 py-3 text-xs flex items-center gap-4 ${isLight ? "bg-blue-50 border-blue-200" : "bg-[#0a1628] border-[#1a3058]"}`}>
            <div className="flex-1">
              <span className="font-bold text-[#1a73e8]">{result.vendor || "—"}</span>
              <span className={` ml-2 ${muted}`}>{result.description}</span>
            </div>
            {result.amount != null && (
              <span className="font-extrabold text-[#1a73e8] text-sm">${result.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            )}
            {result.dueDate && <span className={`text-[11px] ${muted}`}>Due: {result.dueDate}</span>}
          </div>

          {/* Actions */}
          {saved ? (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-semibold ${isLight ? "bg-green-50 border border-green-200 text-green-800" : "bg-green-950/30 border border-green-900/40 text-green-300"}`}>
              <CheckCircle2 className="w-4 h-4" />
              Bill saved to AP — visible on the Payables page!
              <button onClick={reset} className="ml-auto flex items-center gap-1.5 underline opacity-70 hover:opacity-100">
                <RefreshCw className="w-3 h-3" /> Scan another
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={reset}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-semibold transition-colors ${isLight ? "border-slate-300 text-slate-600 hover:bg-slate-100" : "border-[#1a2235] text-[#888] hover:bg-white/5"}`}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Scan Another
              </button>
              <button
                onClick={saveBill}
                disabled={saving || !result.vendor}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-60 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Saving…" : "Save to AP Bills"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
