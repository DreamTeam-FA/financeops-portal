/**
 * InvoiceScanner — Drop one or more photos of bills/invoices.
 * Scans all in parallel via Gemini Vision, user verifies each,
 * then saves them individually to AP bills.
 */
import React, { useState, useRef, useCallback } from "react";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, X, RefreshCw, Save, FileStack } from "lucide-react";

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

interface ScanItem {
  id: string;
  preview: string;
  status: "scanning" | "done" | "error";
  result: InvoiceData | null;
  error: string | null;
  saving: boolean;
  saved: boolean;
}

interface Props {
  isLight: boolean;
}

const ENTITIES = ["Ruby's", "TI", "MSDx", "CurcuminPro", "Ziglar", "Corner Property Group", "Other"];

export const InvoiceScanner: React.FC<Props> = ({ isLight }) => {
  const [dragOver, setDragOver] = useState(false);
  const [items, setItems] = useState<ScanItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const card  = isLight ? "bg-white border-slate-200 text-slate-800"  : "bg-[#0d111a] border-[#1a2235] text-white";
  const muted = isLight ? "text-slate-500" : "text-[#888]";
  const inp   = isLight
    ? "bg-white border-slate-300 text-slate-800 focus:border-[#1a73e8]"
    : "bg-[#0a0f1c] border-[#1a2235] text-white focus:border-[#1a73e8]";

  const scanFile = useCallback(async (file: File): Promise<{ result: InvoiceData | null; error: string | null }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        const mimeType = file.type || "image/jpeg";
        try {
          const resp = await fetch("/api/invoice/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64, mimeType })
          });
          const json = await resp.json();
          if (!resp.ok || !json.ok) {
            resolve({ result: null, error: json.error || "Scan failed" });
          } else {
            resolve({ result: json.invoice, error: null });
          }
        } catch (err: any) {
          resolve({ result: null, error: err?.message || "Network error" });
        }
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const getPreview = (file: File): Promise<string> =>
    new Promise((res) => {
      const r = new FileReader();
      r.onload = (e) => res(e.target?.result as string);
      r.readAsDataURL(file);
    });

  const processFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith("image/") || f.type === "application/pdf");
    if (imageFiles.length === 0) return;

    const newItems: ScanItem[] = await Promise.all(
      imageFiles.map(async (file) => ({
        id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        preview: await getPreview(file),
        status: "scanning" as const,
        result: null,
        error: null,
        saving: false,
        saved: false,
      }))
    );

    setItems(prev => [...newItems, ...prev]);

    await Promise.all(
      imageFiles.map(async (file, i) => {
        const { result, error } = await scanFile(file);
        setItems(prev =>
          prev.map(item =>
            item.id === newItems[i].id
              ? { ...item, status: error ? "error" : "done", result, error }
              : item
          )
        );
      })
    );
  }, [scanFile]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  const updateResult = (id: string, field: keyof InvoiceData, value: string | number | null) => {
    setItems(prev => prev.map(item =>
      item.id === id && item.result
        ? { ...item, result: { ...item.result, [field]: value } }
        : item
    ));
  };

  const saveItem = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item?.result) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, saving: true } : i));
    try {
      const resp = await fetch("/api/ap/add-scanned-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.result)
      });
      setItems(prev => prev.map(i =>
        i.id === id ? { ...i, saving: false, saved: resp.ok, error: resp.ok ? null : "Save failed" } : i
      ));
    } catch (e: any) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, saving: false, error: e?.message } : i));
    }
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const clearAll = () => setItems([]);

  const scanningCount = items.filter(i => i.status === "scanning").length;
  const doneCount = items.filter(i => i.status === "done").length;
  const savedCount = items.filter(i => i.saved).length;

  return (
    <div className="space-y-4">

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200",
          "min-h-[160px] p-6 text-center select-none",
          dragOver
            ? "border-[#1a73e8] bg-[#1a73e8]/10"
            : isLight
              ? "border-slate-300 bg-slate-50 hover:border-[#1a73e8] hover:bg-[#1a73e8]/5"
              : "border-[#1a2235] bg-[#0d111a] hover:border-[#1a73e8] hover:bg-[#1a73e8]/5",
        ].join(" ")}
      >
        <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onFileChange} />

        <div className="w-12 h-12 rounded-2xl bg-[#1a73e8]/15 flex items-center justify-center">
          {scanningCount > 0
            ? <Loader2 className="w-6 h-6 text-[#1a73e8] animate-spin" />
            : <FileStack className="w-6 h-6 text-[#1a73e8]" />
          }
        </div>
        <div>
          <p className={`text-sm font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
            {scanningCount > 0 ? `Scanning ${scanningCount} bill${scanningCount > 1 ? "s" : ""}…` : "Drop bill or invoice photos here"}
          </p>
          <p className={`text-xs mt-1 ${muted}`}>
            {items.length > 0
              ? `${doneCount} ready · ${scanningCount} scanning · ${savedCount} saved — drop more to add`
              : "Multiple files supported — printed or handwritten"
            }
          </p>
        </div>
        <div className={`flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-full ${isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]"}`}>
          <Upload className="w-3 h-3" /> Powered by Gemini Vision AI
        </div>
      </div>

      {/* Clear all */}
      {items.length > 1 && (
        <div className="flex justify-end">
          <button onClick={clearAll} className={`text-[11px] flex items-center gap-1 ${muted} hover:opacity-70`}>
            <X className="w-3 h-3" /> Clear all
          </button>
        </div>
      )}

      {/* Result Cards */}
      {items.map((item) => (
        <div key={item.id} className={`rounded-xl border overflow-hidden ${card}`}>

          {/* Card header */}
          <div className={`px-4 py-2.5 border-b flex items-center justify-between ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#111623] border-[#1a2235]"}`}>
            <div className="flex items-center gap-2">
              {item.status === "scanning" && <Loader2 className="w-4 h-4 text-[#1a73e8] animate-spin" />}
              {item.status === "done" && !item.saved && <FileText className="w-4 h-4 text-[#1a73e8]" />}
              {item.saved && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {item.status === "error" && <AlertCircle className="w-4 h-4 text-red-400" />}
              <span className={`text-xs font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
                {item.status === "scanning" ? "Scanning…"
                  : item.status === "error" ? "Scan failed"
                  : item.saved ? `Saved — ${item.result?.vendor || "Bill"}`
                  : item.result?.vendor || "Bill"}
              </span>
              {item.result?.amount != null && !item.saved && (
                <span className="text-xs font-bold text-[#1a73e8]">
                  · ${item.result.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
            <button onClick={() => removeItem(item.id)} className={`p-1 rounded opacity-40 hover:opacity-100 transition-opacity ${isLight ? "hover:bg-slate-200" : "hover:bg-white/10"}`}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Scanning */}
          {item.status === "scanning" && (
            <div className="flex items-center gap-3 p-4">
              <img src={item.preview} alt="" className="w-20 h-20 rounded object-cover opacity-40 shrink-0" />
              <p className={`text-xs ${muted}`}>Reading invoice details with AI…</p>
            </div>
          )}

          {/* Error */}
          {item.status === "error" && (
            <div className="flex items-center gap-3 p-4">
              <img src={item.preview} alt="" className="w-20 h-20 rounded object-cover shrink-0" />
              <p className="text-xs text-red-400">{item.error}</p>
            </div>
          )}

          {/* Result */}
          {item.status === "done" && item.result && (
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <img src={item.preview} alt="" className="w-20 h-20 rounded object-cover shrink-0" />
                <div className="flex-1 grid grid-cols-2 gap-2 text-xs">
                  <label className="flex flex-col gap-0.5 col-span-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Vendor / Biller</span>
                    <input value={item.result.vendor} onChange={e => updateResult(item.id, "vendor", e.target.value)} className={`px-2 py-1 rounded border text-xs font-bold ${inp}`} disabled={item.saved} />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Invoice #</span>
                    <input value={item.result.invoiceNo ?? ""} onChange={e => updateResult(item.id, "invoiceNo", e.target.value || null)} className={`px-2 py-1 rounded border text-xs ${inp}`} disabled={item.saved} />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Amount ($)</span>
                    <input type="number" step="0.01" value={item.result.amount ?? ""} onChange={e => updateResult(item.id, "amount", e.target.value === "" ? null : Number(e.target.value))} className={`px-2 py-1 rounded border text-xs font-bold text-[#1a73e8] ${inp}`} disabled={item.saved} />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Due Date</span>
                    <input value={item.result.dueDate ?? ""} onChange={e => updateResult(item.id, "dueDate", e.target.value || null)} className={`px-2 py-1 rounded border text-xs ${inp}`} disabled={item.saved} />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Entity</span>
                    <select value={item.result.entity || ""} onChange={e => updateResult(item.id, "entity", e.target.value)} className={`px-2 py-1 rounded border text-xs ${inp}`} disabled={item.saved}>
                      <option value="">— Select —</option>
                      {ENTITIES.map(en => <option key={en} value={en}>{en}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5 col-span-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Description</span>
                    <input value={item.result.description} onChange={e => updateResult(item.id, "description", e.target.value)} className={`px-2 py-1 rounded border text-xs ${inp}`} placeholder="What is this bill for?" disabled={item.saved} />
                  </label>
                </div>
              </div>

              {/* Actions */}
              {item.saved ? (
                <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-semibold ${isLight ? "bg-green-50 border border-green-200 text-green-800" : "bg-green-950/30 border border-green-900/40 text-green-300"}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Added to AP bills
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    onClick={() => saveItem(item.id)}
                    disabled={item.saving || !item.result.vendor}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-60 transition-colors"
                  >
                    {item.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {item.saving ? "Saving…" : "Save to AP Bills"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
