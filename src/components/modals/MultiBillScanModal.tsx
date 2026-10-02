import React, { useMemo, useRef, useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { X, ScanLine, Loader2, AlertCircle, AlertTriangle } from "lucide-react";
import { bumpGeminiCounter } from "../../utils/geminiCounter";

interface Props {
  onClose: () => void;
  /** Called after bills were added — the parent should close everything. */
  onDone: () => void;
  defaultSheet: string;
}

interface Row {
  key: number;
  include: boolean;
  vendor: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  amount: string;
  isPaid: boolean;
  sheet: string;
  description: string;
  category: string;
  dupReason: string; // "" = not a duplicate
}

const toISODate = (raw: any): string => {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
};

const resolveDue = (rawDue: any, issueISO: string): string => {
  const net = String(rawDue || "").trim().match(/net\s*(\d+)/i);
  if (net) {
    const base = issueISO ? new Date(issueISO) : new Date();
    base.setDate(base.getDate() + parseInt(net[1], 10));
    return base.toISOString().split("T")[0];
  }
  return toISODate(rawDue);
};

const sheetFromEntity = (ent: string): string => {
  const e = String(ent || "").trim().toLowerCase();
  if (e.includes("ruby")) return "Ruby's Bills";
  if (e.includes("msdx")) return "MSDx Bills";
  if (e === "ti") return "TI Bills";
  return "";
};

const dupKey = (vendor: string, invoiceNo: string) => `${vendor.toLowerCase().trim()}|${invoiceNo.toLowerCase().replace(/\s+/g, "").trim()}`;

export const MultiBillScanModal: React.FC<Props> = ({ onClose, onDone, defaultSheet }) => {
  const { apBills, addBillsBatch, theme, availableAPEntities, showToast } = useFinance() as any;
  const isLight = theme === "light";
  const inputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<"upload" | "scanning" | "review">("upload");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  // Most recent description/category/entity per vendor — same fallback the single-bill scan uses.
  const vendorHistory = useMemo(() => {
    const best: Record<string, string> = {};
    const map: Record<string, { description?: string; category?: string; sheet?: string }> = {};
    (apBills as any[]).forEach((b) => {
      if (!b.vendor) return;
      const key = b.vendor.toLowerCase().trim();
      const date = b.invoiceDate || b.dueDate || "";
      if (!(key in best) || date > best[key]) {
        best[key] = date;
        map[key] = { description: b.description, category: b.category, sheet: b.sheet || (b.entity ? `${b.entity} Bills` : undefined) };
      }
    });
    return map;
  }, [apBills]);

  const existingKeys = useMemo(() => {
    const set = new Set<string>();
    (apBills as any[]).forEach((b) => { if (b.vendor && b.invoiceNo) set.add(dupKey(b.vendor, String(b.invoiceNo))); });
    return set;
  }, [apBills]);

  const processFile = (file: File) => {
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
      setError("Unsupported file type. Please choose an image or PDF.");
      return;
    }
    setError(null);
    setStage("scanning");
    const reader = new FileReader();
    reader.onerror = () => { setError("Could not read the file. Please try again."); setStage("upload"); };
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      try {
        const resp = await fetch("/api/invoice/scan-multi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type || "image/jpeg" }),
        });
        const text = await resp.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch { json = null; }
        if (!resp.ok || !json?.ok || !Array.isArray(json.invoices)) {
          setError(json?.details || json?.error || (resp.status === 413 ? "File is too large (max 50MB)" : `Scan failed (${resp.status})`));
          setStage("upload");
          return;
        }
        if (json.invoices.length === 0) {
          setError("No bills were found in that file.");
          setStage("upload");
          return;
        }
        bumpGeminiCounter("invoice");

        const seen = new Set<string>();
        const built: Row[] = json.invoices.map((inv: any, i: number): Row => {
          const vendor = String(inv.vendor || "").trim();
          const invoiceNo = inv.invoiceNo != null ? String(inv.invoiceNo).trim() : "";
          const issueDate = toISODate(inv.issueDate);
          const dueDate = resolveDue(inv.dueDate, issueDate);
          const hist = vendorHistory[vendor.toLowerCase()] || {};
          const sheet = sheetFromEntity(inv.entity) || hist.sheet || defaultSheet;
          let dupReason = "";
          if (vendor && invoiceNo) {
            const k = dupKey(vendor, invoiceNo);
            if (existingKeys.has(k)) dupReason = "Already in the portal (same vendor + invoice #)";
            else if (seen.has(k)) dupReason = "Listed twice in this scan";
            seen.add(k);
          }
          const amount = inv.amount != null && inv.amount !== "" ? String(inv.amount) : "";
          return {
            key: i,
            include: !dupReason && !!vendor && !!amount,
            vendor, invoiceNo, issueDate, dueDate, amount,
            isPaid: inv.isPaid === true,
            sheet,
            description: inv.description ? String(inv.description) : (hist.description || ""),
            category: inv.category ? String(inv.category) : (hist.category || ""),
            dupReason,
          };
        });
        setRows(built);
        setStage("review");
      } catch (err: any) {
        setError(err?.message || "Network error");
        setStage("upload");
      }
    };
    reader.readAsDataURL(file);
  };

  const update = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const isValid = (r: Row) => !!r.vendor.trim() && !!r.amount && !isNaN(parseFloat(r.amount));
  const selected = rows.filter((r) => r.include && isValid(r));
  const total = selected.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  const handleAdd = async () => {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    const today = new Date().toISOString().split("T")[0];
    const bills = selected.map((r) => {
      const entity = r.sheet.replace(" Bills", "").trim();
      const isTI = r.sheet === "TI Bills";
      const vkey = r.vendor.toLowerCase().trim();
      const tiCompany = (apBills as any[]).find((b) => b.vendor?.toLowerCase().trim() === vkey && b.entity === "TI")?.company || "TI";
      const bill: any = {
        vendor: r.vendor.trim(),
        entity,
        company: isTI ? tiCompany : entity,
        invoiceNo: r.invoiceNo || undefined,
        invoiceDate: r.issueDate || undefined,
        dueDate: r.dueDate || r.issueDate || today,
        amount: parseFloat(r.amount) || 0,
        paymentDate: r.isPaid ? today : undefined,
        paidDate: r.isPaid ? today : undefined,
        method: "Manual",
        status: r.isPaid ? "paid" : "unpaid",
        sheet: r.sheet,
      };
      if (!isTI) {
        bill.description = r.description || undefined;
        bill.category = r.category || undefined;
      }
      return bill;
    });
    try {
      const { added, sheetFailed } = await addBillsBatch(bills);
      if (added > 0) {
        showToast?.(
          sheetFailed
            ? `Added ${added} bill(s) to the portal, but saving them to the Google Sheet failed — check the toast above / reconnect and retry.`
            : `Added ${added} bill(s) ✓`,
          sheetFailed ? "error" : "success",
          sheetFailed ? 9000 : 4000
        );
      }
      if (added > 0) onDone();
    } finally {
      setSaving(false);
    }
  };

  const inp = `w-full border rounded px-2 py-1 text-[11px] font-semibold focus:outline-none focus:border-[#1a73e8] ${
    isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#1c1c1c] border-[#333] text-white"
  }`;
  const th = `px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${isLight ? "text-slate-500" : "text-[#888]"}`;

  return (
    <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className={`w-full ${stage === "review" ? "max-w-6xl" : "max-w-md"} max-h-[92vh] flex flex-col border rounded-2xl shadow-2xl overflow-hidden ${isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#121212] border-[#333] text-white"}`}>
        <div className="h-1.5 w-full bg-[#1a73e8] shrink-0" />
        <div className={`px-6 py-4 flex items-center justify-between border-b shrink-0 ${isLight ? "border-slate-100" : "border-[#222]"}`}>
          <div>
            <h2 className="text-sm font-black tracking-tight">Scan Multiple Bills</h2>
            <p className={`text-[11px] mt-0.5 ${isLight ? "text-slate-400" : "text-[#888]"}`}>
              {stage === "review" ? `${rows.length} bill(s) found — review, fix anything wrong, then add` : "Upload a list, statement, or table of bills"}
            </p>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-full ${isLight ? "hover:bg-slate-100 text-slate-400" : "hover:bg-[#222] text-[#666]"}`}><X className="w-5 h-5" /></button>
        </div>

        {stage !== "review" && (
          <div className="p-6">
            <div
              onClick={() => stage === "upload" && inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && stage === "upload") processFile(f); }}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-xs text-center cursor-pointer ${
                isLight ? "border-slate-300 bg-slate-50 text-slate-600 hover:border-[#1a73e8]" : "border-[#2a3444] bg-[#0a1220] text-[#8099b8] hover:border-[#1a73e8]"
              } ${stage === "scanning" ? "opacity-70 cursor-default" : ""}`}
            >
              <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }} />
              {stage === "scanning"
                ? <><Loader2 className="w-6 h-6 animate-spin text-[#1a73e8]" /><span className="font-semibold">Reading every bill in the file… long lists can take up to a minute</span></>
                : <><ScanLine className="w-6 h-6 text-[#1a73e8]" /><span className="font-semibold text-[#1a73e8]">Drop or click to choose an image or PDF</span><span className="opacity-70">One file containing many bills (e.g. a vendor statement or invoice list)</span></>}
            </div>
            {error && (
              <div className="mt-3 flex items-start gap-1.5 text-[11px] text-red-500">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
              </div>
            )}
          </div>
        )}

        {stage === "review" && (
          <>
            <div className="overflow-auto flex-1">
              <table className="w-full text-xs">
                <thead className={`sticky top-0 ${isLight ? "bg-slate-50" : "bg-[#171717]"}`}>
                  <tr>
                    <th className={th}>Add</th>
                    <th className={th}>Vendor</th>
                    <th className={th}>Invoice #</th>
                    <th className={th}>Issue date</th>
                    <th className={th}>Due date</th>
                    <th className={th}>Amount</th>
                    <th className={th}>Sheet</th>
                    <th className={th}>Paid?</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const bad = !isValid(r);
                    return (
                      <React.Fragment key={r.key}>
                        <tr className={`border-t ${isLight ? "border-slate-100" : "border-[#222]"} ${!r.include ? "opacity-50" : ""}`}>
                          <td className="px-2 py-1.5">
                            <input type="checkbox" checked={r.include && !bad} disabled={bad}
                              onChange={(e) => update(r.key, { include: e.target.checked })} />
                          </td>
                          <td className="px-2 py-1.5 min-w-[160px]">
                            <input className={`${inp} ${!r.vendor.trim() ? "border-red-400" : ""}`} value={r.vendor} onChange={(e) => update(r.key, { vendor: e.target.value })} />
                          </td>
                          <td className="px-2 py-1.5 min-w-[100px]">
                            <input className={inp} value={r.invoiceNo} onChange={(e) => update(r.key, { invoiceNo: e.target.value })} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="date" className={inp} value={r.issueDate} onChange={(e) => update(r.key, { issueDate: e.target.value })} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="date" className={inp} value={r.dueDate} onChange={(e) => update(r.key, { dueDate: e.target.value })} />
                          </td>
                          <td className="px-2 py-1.5 w-[100px]">
                            <input className={`${inp} ${bad ? "border-red-400" : ""}`} inputMode="decimal" value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value.replace(/[^0-9.\-]/g, "") })} />
                          </td>
                          <td className="px-2 py-1.5">
                            <select className={inp} value={r.sheet} onChange={(e) => update(r.key, { sheet: e.target.value })}>
                              {availableAPEntities.map((en: string) => <option key={en} value={`${en} Bills`}>{en} Bills</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="checkbox" checked={r.isPaid} onChange={(e) => update(r.key, { isPaid: e.target.checked })} />
                          </td>
                        </tr>
                        {r.dupReason && (
                          <tr className={isLight ? "bg-amber-50" : "bg-[#2a2110]"}>
                            <td />
                            <td colSpan={7} className="px-2 py-1 text-[10px] font-semibold text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Possible duplicate — {r.dupReason}. Unchecked by default.
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={`px-6 py-3 border-t flex items-center gap-3 shrink-0 ${isLight ? "border-slate-100" : "border-[#222]"}`}>
              <span className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                {selected.length} of {rows.length} selected · ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="font-normal opacity-70"> · the scanned file is not attached to individual bills</span>
              </span>
              <div className="ml-auto flex gap-2">
                <button onClick={() => { setStage("upload"); setRows([]); }} disabled={saving}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold ${isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-[#222] hover:bg-[#333] text-[#aaa]"}`}>
                  Scan another
                </button>
                <button onClick={handleAdd} disabled={selected.length === 0 || saving}
                  className="px-5 py-2 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {saving ? "Adding…" : `Add ${selected.length} bill${selected.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
