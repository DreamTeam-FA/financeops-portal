import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useFinance } from "../../context/FinanceContext";
import { HeadleysItem } from "../../types";
import { FileText, ChevronDown, ChevronRight, Upload, X, FileSpreadsheet, ChevronLeft, ShoppingBag } from "lucide-react";
import { getAccessToken } from "../../services/googleAuth";

// ── Constants ──────────────────────────────────────────────────────────────────
const MAIN_SHEET_ID = "15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs";
const HEADLEYS_TAB  = "Headley's";
const BU_OPTIONS    = ["TI", "4YR"];

// ── Types ──────────────────────────────────────────────────────────────────────
interface ParsedHdlRow {
  date: string; ref: string; st: string; type: string;
  description: string; debit: number; credit: number; amount: number; bu: string;
}

// ── Sheets API helpers ─────────────────────────────────────────────────────────
const colLetter = (n: number): string => {
  let r = "";
  while (n > 0) { n--; r = String.fromCharCode(65 + (n % 26)) + r; n = Math.floor(n / 26); }
  return r;
};

async function sheetsGet(range: string, token: string): Promise<string[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${MAIN_SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Sheet read failed");
  return data.values || [];
}

async function sheetsBatchUpdate(updates: { range: string; values: any[][] }[], token: string): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${MAIN_SHEET_ID}/values:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: updates }),
    }
  );
  if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message || "Sheet write failed"); }
}

// ── Parse Headley's text (mirrors GAS parseHeadleysText) ──────────────────────
function parseHeadleysText(text: string): ParsedHdlRow[] {
  const skipRx = [
    /^date\b/i, /^prev\s*balance/i, /^current\b/i,
    /^1-30\s*days/i, /^31-60\s*days/i, /^61-90\s*days/i, /^over\s*90/i,
    /^new\s*bal/i, /finance\s*charge--/i, /terms:\s*net/i,
    /f\/c\s*balance/i, /please\s*remit/i, /monthly\s*%/i,
    /thank\s*you\s*for/i, /^\s*$/,
  ];
  const result: ParsedHdlRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || skipRx.some(rx => rx.test(line))) continue;
    let parts = line.split("\t");
    if (parts.length < 5) parts = line.split(/\s{2,}/);
    if (parts.length < 5) continue;
    const date = parts[0]?.trim() || "";
    const ref  = parts[1]?.trim() || "";
    const st   = parts[2]?.trim() || "1";
    let   type = parts[3]?.trim() || "I";
    const desc = parts[4]?.trim() || "";
    let debit  = parseFloat((parts[5] || "").replace(/[$,\s]/g,"")) || 0;
    let credit = parseFloat((parts[6] || "").replace(/[$,\s]/g,"")) || 0;
    let amount = parseFloat((parts[7] || "").replace(/[$,\s]/g,"")) || 0;
    if (!date && !ref && !desc) continue;
    if (!amount && !debit && !credit) continue;
    if (type === "C" || type === "P") {
      credit = Math.abs(credit || amount);
      debit  = 0;
      amount = -Math.abs(amount);
    }
    result.push({ date, ref, st, type, description:desc, debit, credit, amount, bu:"" });
  }
  return result;
}

// ── Append rows to Headley's sheet ────────────────────────────────────────────
async function appendHeadleysToSheet(rows: ParsedHdlRow[], billingDate: string, token: string): Promise<void> {
  const allRows = await sheetsGet(`${HEADLEYS_TAB}!A:Z`, token);
  let headerIdx = -1, startCol = 0;
  for (let i = 0; i < allRows.length; i++) {
    const joined = allRows[i].join(" ").toLowerCase();
    if (joined.includes("charging bu") && joined.includes("debit") && joined.includes("credit")) {
      headerIdx = i;
      startCol  = allRows[i].findIndex(c => String(c || "").toLowerCase().includes("charging bu"));
      if (startCol < 0) startCol = 0;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("Could not find Headley's raw data table header row.");
  let lastDataRow = headerIdx;
  for (let i = allRows.length - 1; i > headerIdx; i--) {
    if (allRows[i].slice(startCol, startCol + 10).join("").trim()) { lastDataRow = i; break; }
  }
  const nextSheetRow    = lastDataRow + 2;
  const startColLetter  = colLetter(startCol + 1);
  const endColLetter    = colLetter(startCol + 10);
  await sheetsBatchUpdate([{
    range: `${HEADLEYS_TAB}!${startColLetter}${nextSheetRow}:${endColLetter}${nextSheetRow + rows.length - 1}`,
    values: rows.map(r => [
      r.bu, r.date, r.ref, r.st || "1", r.type || "I",
      r.description,
      r.debit  !== 0 ? r.debit  : "",
      r.credit !== 0 ? r.credit : "",
      r.amount !== 0 ? r.amount : (r.debit || r.credit || ""),
      billingDate,
    ]),
  }], token);
}

// ── HeadleysImportModal ────────────────────────────────────────────────────────
const HeadleysImportModal: React.FC<{ isLight: boolean; onClose: () => void; initialText?: string }> = ({ isLight, onClose, initialText }) => {
  const { addBill } = useFinance();
  const s = {
    surf: isLight ? "bg-white border-slate-200"       : "bg-[#121212] border-[#2a2a2a]",
    sub2: isLight ? "bg-slate-50 border-slate-200"    : "bg-[#0f0f0f] border-[#1e1e1e]",
    txt:  isLight ? "text-slate-800"                  : "text-white",
    muted:isLight ? "text-slate-500"                  : "text-[#888]",
    inp:  isLight ? "bg-white border-slate-300 text-slate-800 placeholder-slate-400"
                  : "bg-[#1e1e1e] border-[#333] text-white placeholder-[#555]",
    div:  isLight ? "divide-slate-100"                : "divide-[#1e1e1e]",
    hdr:  isLight ? "bg-slate-50 text-slate-600 border-slate-200" : "bg-[#161616] text-[#888] border-[#222]",
  };

  const [step, setStep]               = useState(1);
  const [billingDate, setBillingDate] = useState("");
  const [pasteText, setPasteText]     = useState(initialText || "");
  const [parsedRows, setParsedRows]   = useState<ParsedHdlRow[]>([]);
  const [error, setError]             = useState("");
  const [saving, setSaving]           = useState(false);
  const [scanning, setScanning]       = useState(false);
  const [billStatus, setBillStatus]   = useState<Record<string,"idle"|"done"|"err">>({});
  const [dragOver, setDragOver]       = useState(false);
  const fileRef                       = useRef<HTMLInputElement>(null);

  const fmtAmt = (n: number) =>
    "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 });

  // ── File handling (upload / drag-drop) ────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setError("");
    const type = file.type;
    if (type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
      // Read as text directly
      const text = await file.text();
      setPasteText(text);
    } else if (type.startsWith("image/") || type === "application/pdf") {
      // Send to Gemini scan endpoint
      setScanning(true);
      try {
        const buf = await file.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const res = await fetch("/api/headleys/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: b64, mimeType: type }),
        });
        const data = await res.json();
        if (data.ok && data.text) {
          setPasteText(data.text);
        } else {
          setError("AI scan failed: " + (data.error || "unknown error"));
        }
      } catch (e: any) {
        setError("Upload error: " + e.message);
      } finally {
        setScanning(false);
      }
    } else {
      setError("Unsupported file type. Use PDF, image (JPG/PNG), or text (.txt/.csv).");
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  const doStep1 = () => {
    setError("");
    if (!billingDate.trim()) { setError("Enter the billing cycle date (e.g. 6/22/26)."); return; }
    if (!pasteText.trim())   { setError("Paste the invoice text or upload a document first."); return; }
    const rows = parseHeadleysText(pasteText);
    if (!rows.length) { setError("No data rows found. Copy the table from the email body or upload the document."); return; }
    setParsedRows(rows);
    setStep(2);
  };

  const assignBU   = (idx: number, bu: string) => setParsedRows(prev => prev.map((r,i) => i===idx ? {...r, bu} : r));
  const bulkAssign = (bu: string) => { if (!bu) return; setParsedRows(prev => prev.map(r => ({...r, bu}))); };

  const doStep2 = async () => {
    setError("");
    const missing = parsedRows.filter(r => !r.bu);
    if (missing.length) { setError(`${missing.length} row(s) still need a Charging BU.`); return; }
    setSaving(true);
    try {
      const token = getAccessToken();
      if (token) await appendHeadleysToSheet(parsedRows, billingDate, token);
      setStep(3);
    } catch (e: any) {
      setError("Sheet write error: " + (e.message || "unknown"));
    } finally { setSaving(false); }
  };

  const billingToISO = (s: string) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s.trim());
    if (!m) return s;
    let yr = parseInt(m[3],10); if (yr < 100) yr += 2000;
    return `${yr}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
  };

  const breakdown: Record<string,{charges:number;credits:number}> = {};
  parsedRows.forEach(r => {
    if (!r.bu) return;
    if (!breakdown[r.bu]) breakdown[r.bu] = {charges:0,credits:0};
    if (r.amount >= 0) breakdown[r.bu].charges += r.amount;
    else breakdown[r.bu].credits += r.amount;
  });

  const createBill = (bu: string, amount: number) => {
    const iso = billingToISO(billingDate);
    addBill({
      vendor:"Headley's", entity:"TI", company:bu, amount,
      dueDate:iso, invoiceDate:iso, method:"Manual",
      status:"unpaid", bucket:"remaining",
      sheet:"TI Bills", category:"",
      remarks:`Headley's — billing cycle ${billingDate}`,
    });
    setBillStatus(p => ({...p, [bu]:"done"}));
  };

  const errBox = error ? (
    <p className={`text-[12px] font-semibold px-3 py-2 rounded-lg border ${isLight ? "bg-red-50 border-red-200 text-red-600" : "bg-red-950/20 border-red-800/40 text-red-400"}`}>{error}</p>
  ) : null;

  return (
    <div className="fixed inset-0 z-[500] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden border shadow-2xl ${s.surf}`}>

        {/* Header */}
        <div className="h-1.5 w-full bg-[#5c35a5]" />
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isLight ? "border-slate-200" : "border-[#2a2a2a]"}`}>
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-4 h-4 text-[#5c35a5]" />
            <div>
              <span className="font-bold text-sm text-[#5c35a5]">Headley's Invoice Import</span>
              <span className={`ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full ${isLight ? "bg-purple-100 text-purple-600" : "bg-purple-900/40 text-purple-400"}`}>Step {step} of 3</span>
            </div>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-full ${isLight ? "hover:bg-slate-100 text-slate-400 hover:text-slate-700" : "hover:bg-[#2a2a2a] text-[#666] hover:text-white"}`}><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── STEP 1 ── */}
          {step === 1 && <>
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${s.muted}`}>Billing Cycle Date</label>
              <input type="text" placeholder="e.g. 6/22/26" value={billingDate}
                onChange={e => setBillingDate(e.target.value)}
                className={`text-sm px-3 py-2 rounded-lg border focus:outline-none w-48 ${s.inp}`} />
              <p className={`text-[11px] mt-1 ${s.muted}`}>Enter exactly as it appears in the Headley's summary table header.</p>
            </div>

            {/* Upload / drag-drop zone */}
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${s.muted}`}>Upload Document <span className={`normal-case font-normal ${s.muted}`}>(PDF, image, or .txt)</span></label>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                  dragOver
                    ? "border-[#5c35a5] bg-purple-50 dark:bg-purple-950/20"
                    : isLight ? "border-slate-200 hover:border-[#5c35a5] hover:bg-purple-50/40" : "border-[#2a2a2a] hover:border-[#5c35a5] hover:bg-purple-950/10"
                }`}
              >
                <input ref={fileRef} type="file" accept=".pdf,.txt,.csv,image/*" className="hidden" onChange={onFileChange} />
                {scanning ? (
                  <>
                    <span className="inline-block w-5 h-5 border-2 border-purple-400/40 border-t-purple-500 rounded-full animate-spin" />
                    <span className={`text-xs font-semibold text-[#5c35a5]`}>AI scanning document…</span>
                  </>
                ) : (
                  <>
                    <Upload className={`w-6 h-6 ${isLight ? "text-slate-400" : "text-[#555]"}`} />
                    <span className={`text-xs font-semibold ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>
                      Drag &amp; drop or <span className="text-[#5c35a5]">click to upload</span>
                    </span>
                    <span className={`text-[11px] ${s.muted}`}>PDF · Image (JPG/PNG) · Text file (.txt/.csv)</span>
                    {pasteText && <span className="text-[11px] text-emerald-500 font-semibold">✓ Document loaded — text ready to parse</span>}
                  </>
                )}
              </div>
            </div>

            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${s.muted}`}>Or Paste Invoice Text</label>
              <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={8}
                placeholder={"Paste the Headley's statement here (copied from the email body)\n\nDate\tRef\tST\tC\tDescription\tDebit\tCredit\tAmount\n5/26/26\t762930\t1\tI\tPO # BANK\t33.01\t\t33.01\n..."}
                className={`w-full text-xs px-3 py-2 rounded-lg border focus:outline-none font-mono resize-y ${s.inp}`} />
              <p className={`text-[11px] mt-1 ${s.muted}`}>Header row and aging summary at the bottom are skipped automatically.</p>
            </div>
            {errBox}
          </>}

          {/* ── STEP 2 ── */}
          {step === 2 && <>
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${s.sub2}`}>
              <span className={`text-[12px] font-semibold ${s.muted}`}>Bulk assign all to:</span>
              <select onChange={e => { if (e.target.value) bulkAssign(e.target.value); e.target.value = ""; }}
                className={`text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none ${s.inp}`} defaultValue="">
                <option value="">— choose —</option>
                {BU_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <span className={`ml-auto text-[11px] ${s.muted}`}>{parsedRows.length} line{parsedRows.length!==1?"s":""} parsed</span>
            </div>
            <div className={`overflow-x-auto rounded-xl border ${isLight?"border-slate-200":"border-[#1e1e1e]"}`}>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className={`font-bold border-b ${s.hdr}`}>
                    <th className="px-3 py-2">Charging BU</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Ref</th>
                    <th className="px-3 py-2">T</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${s.div}`}>
                  {parsedRows.map((r, idx) => (
                    <tr key={idx} className={`${(r.type==="C"||r.type==="P") ? (isLight?"bg-emerald-50":"bg-emerald-950/20") : ""} ${isLight?"hover:bg-slate-50":"hover:bg-white/[0.02]"}`}>
                      <td className="px-3 py-1.5">
                        <select value={r.bu} onChange={e => assignBU(idx, e.target.value)}
                          className={`text-xs px-2 py-1 rounded-md border focus:outline-none ${
                            !r.bu ? (isLight?"border-amber-300 bg-amber-50 text-amber-800":"border-amber-700 bg-amber-950/30 text-amber-300") : s.inp}`}>
                          <option value="">— assign —</option>
                          {BU_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </td>
                      <td className={`px-3 py-1.5 ${s.muted}`}>{r.date}</td>
                      <td className={`px-3 py-1.5 font-mono ${s.muted}`}>{r.ref}</td>
                      <td className={`px-3 py-1.5 ${s.muted}`}>{r.type}</td>
                      <td className={`px-3 py-1.5 max-w-[200px] truncate ${s.txt}`} title={r.description}>{r.description}</td>
                      <td className={`px-3 py-1.5 text-right font-mono font-bold ${r.amount<0?"text-emerald-500":s.txt}`}>
                        {r.amount<0 ? `(${fmtAmt(r.amount)})` : fmtAmt(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {errBox}
            {!getAccessToken() && (
              <p className={`text-[11px] px-3 py-2 rounded-lg border ${isLight ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-amber-950/20 border-amber-800/40 text-amber-400"}`}>
                ⚠ Not signed in to Google — rows won't be saved to the sheet.
              </p>
            )}
          </>}

          {/* ── STEP 3 ── */}
          {step === 3 && <>
            <p className={`text-[12px] ${s.muted}`}>
              Rows saved to the Headley's sheet. Click <strong>Create Bill</strong> for each entity to add to TI Bills.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(breakdown)
                .sort(([a],[b]) => a==="TI"?-1:b==="TI"?1:a.localeCompare(b))
                .map(([bu,bk]) => {
                  const st = billStatus[bu] || "idle";
                  return (
                    <div key={bu} className={`rounded-xl border p-4 flex flex-col gap-2 ${isLight?"bg-slate-50 border-slate-200":"bg-[#0d111a] border-[#1a2235]"}`}>
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${s.muted}`}>Charging BU</div>
                      <div className="text-xl font-black text-[#5c35a5]">{bu}</div>
                      <div className={`text-lg font-bold ${s.txt}`}>{fmtAmt(bk.charges)}</div>
                      {bk.credits < 0 && <div className={`text-[11px] ${s.muted}`}>incl. {fmtAmt(bk.credits)} credit</div>}
                      {bk.charges > 0 ? (
                        <button onClick={() => createBill(bu, bk.charges)} disabled={st==="done"}
                          className={`mt-1 text-[12px] font-bold py-2 px-3 rounded-lg transition-colors ${
                            st==="done" ? "bg-emerald-500 text-white" : "bg-[#5c35a5] hover:bg-[#4a2990] text-white disabled:opacity-50"
                          }`}>
                          {st==="done" ? "✓ Bill Created" : `Create Bill for ${bu}`}
                        </button>
                      ) : (
                        <span className={`text-[11px] ${s.muted}`}>No charges — nothing to bill</span>
                      )}
                    </div>
                  );
                })}
            </div>
          </>}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-5 py-3 border-t shrink-0 ${s.sub2}`}>
          <div>
            {step > 1 && (
              <button onClick={() => { setError(""); setStep(s2 => s2-1); }} disabled={saving}
                className={`text-[12px] font-semibold px-4 py-2 rounded-lg border transition-colors ${isLight?"border-slate-300 text-slate-600 hover:bg-slate-100":"border-[#333] text-[#888] hover:bg-white/5"}`}>
                ← Back
              </button>
            )}
          </div>
          <button onClick={step===1?doStep1:step===2?doStep2:onClose} disabled={saving||scanning}
            className="text-[12px] font-bold px-5 py-2 rounded-lg bg-[#5c35a5] hover:bg-[#4a2990] text-white transition-colors disabled:opacity-50">
            {step===1?"Parse Invoice →":step===2?(saving?"Saving…":"Save to Sheet →"):"Done"}
          </button>
        </div>
      </div>
    </div>
  );
};

const fmt = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const HeadleysPage: React.FC = () => {
  const { headleys, theme, headleysPrefill, setHeadleysPrefill, setCurrentPage } = useFinance() as any;
  const isLight = theme === "light";

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importInitialText, setImportInitialText] = useState<string | undefined>(undefined);

  // Auto-open import modal when navigated from Email Scanner with prefilled text
  useEffect(() => {
    if (headleysPrefill) {
      setImportInitialText(headleysPrefill.rawText || undefined);
      setImportOpen(true);
      setHeadleysPrefill?.(null); // consume the prefill
    }
  }, [headleysPrefill, setHeadleysPrefill]);

  const toggleDate = (d: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  };

  // Group by billing date, then by BU
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, HeadleysItem[]>> = {};
    headleys.forEach(item => {
      const key = item.billingDate || item.dueDate || "Undated";
      if (!map[key]) map[key] = {};
      if (!map[key][item.bu]) map[key][item.bu] = [];
      map[key][item.bu].push(item);
    });
    // Sort dates descending (newest billing date first)
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [headleys]);

  // Summary: total per billing date across all BUs
  const grandTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    headleys.forEach(item => {
      const key = item.billingDate || item.dueDate || "Undated";
      totals[key] = (totals[key] || 0) + (item.amount || 0);
    });
    return totals;
  }, [headleys]);

  const buColors: Record<string, string> = {
    TI: "#1a73e8",
    "4YR": "#8B5CF6",
    E1: "#00897b",
    "4G": "#f59e0b",
  };
  const getBuColor = (bu: string) => buColors[bu] || "#546e7a";

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-[#070b12] via-purple-950/60 to-[#070b12] border-b border-white/8 px-6 py-4 flex items-center gap-4 shrink-0">
        <button onClick={() => setCurrentPage?.("workspace-tools")} className="flex items-center gap-1.5 text-sm text-[#7a8394] hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" />Back
        </button>
        <div className="h-5 w-px bg-white/10" />
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-violet-700 flex items-center justify-center shadow-xl shadow-purple-500/30">
          <ShoppingBag className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-white font-bold text-base leading-tight">Headley's Invoice Tracker</h1>
          <p className="text-[#7a8394] text-xs">Import invoices · Assign BUs · Create bills</p>
        </div>
      </div>

      {/* Action bar */}
      <div className={`shrink-0 flex items-center justify-between px-4 py-2 border-b ${isLight ? "border-slate-200 bg-white" : "border-[#1a2235] bg-[#0d111a]"}`}>
        <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#666]"}`}>
          {headleys.length} line items · {new Set(headleys.map(h => h.bu)).size} charging BUs
        </span>
        <button
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors"
          style={{ background: "#5c35a5" }}
        >
          <Upload className="w-3.5 h-3.5" />
          Import Invoice
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {headleys.length === 0 ? (
          <div className={`flex flex-col items-center justify-center py-20 rounded-xl border ${isLight ? "bg-white border-slate-200 text-slate-500" : "bg-[#0d111a] border-[#1a2235] text-[#888]"}`}>
            <FileText className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-semibold">No Headley's data found</p>
            <p className="text-xs mt-1 opacity-60">
              Click <strong>Import Invoice</strong> above to upload or paste a Headley's statement.
            </p>
          </div>
        ) : (
          <>
            {/* Summary KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4`}>
                <div className={`text-[11px] font-semibold uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`}>Billing Cycles</div>
                <div className={`text-2xl font-bold mt-1 ${isLight ? "text-slate-900" : "text-white"}`}>{grouped.length}</div>
              </div>
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4`}>
                <div className={`text-[11px] font-semibold uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`}>Line Items</div>
                <div className={`text-2xl font-bold mt-1 ${isLight ? "text-slate-900" : "text-white"}`}>{headleys.length}</div>
              </div>
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4`}>
                <div className={`text-[11px] font-semibold uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`}>Charging BUs</div>
                <div className={`text-2xl font-bold mt-1 ${isLight ? "text-slate-900" : "text-white"}`}>
                  {new Set(headleys.map(h => h.bu)).size}
                </div>
              </div>
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-4`}>
                <div className={`text-[11px] font-semibold uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`}>Latest Total</div>
                <div className="text-2xl font-bold mt-1 text-[#8B5CF6]">
                  {grouped[0] ? fmt(grandTotals[grouped[0][0]] || 0) : "—"}
                </div>
              </div>
            </div>

            {/* Billing date groups */}
            {grouped.map(([billingDate, buMap]) => {
              const isExpanded = expandedDates.has(billingDate);
              const total = grandTotals[billingDate] || 0;
              const buSummary = Object.entries(buMap).map(([bu, items]) => ({
                bu,
                total: items.reduce((s, i) => s + i.amount, 0),
                count: items.length
              }));

              return (
                <div key={billingDate} className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl overflow-hidden`}>
                  {/* Header row — click to expand */}
                  <button
                    onClick={() => toggleDate(billingDate)}
                    className={`w-full flex items-center justify-between p-4 text-left ${isLight ? "hover:bg-slate-50" : "hover:bg-white/5"} transition-colors`}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded
                        ? <ChevronDown className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#888]"}`} />
                        : <ChevronRight className={`w-4 h-4 ${isLight ? "text-slate-400" : "text-[#888]"}`} />
                      }
                      <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                        Billing Date: {billingDate}
                      </span>
                      <div className="flex items-center gap-2">
                        {buSummary.map(({ bu, total: buTotal }) => (
                          <span
                            key={bu}
                            className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                            style={{ backgroundColor: getBuColor(bu) }}
                          >
                            {bu}: {fmt(buTotal)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                        {headleys.filter(h => (h.billingDate || h.dueDate) === billingDate).length} lines
                      </span>
                      <span className="text-sm font-bold text-[#8B5CF6]">{fmt(total)}</span>
                    </div>
                  </button>

                  {/* Expanded: raw data table per BU */}
                  {isExpanded && (
                    <div className="border-t border-[#222]">
                      {Object.entries(buMap).map(([bu, items]) => (
                        <div key={bu}>
                          {/* BU sub-header */}
                          <div
                            className="px-4 py-2 text-xs font-bold text-white flex items-center justify-between"
                            style={{ backgroundColor: getBuColor(bu) + "33" }}
                          >
                            <span style={{ color: getBuColor(bu) }}>Charging BU: {bu}</span>
                            <span style={{ color: getBuColor(bu) }}>
                              {fmt(items.reduce((s, i) => s + i.amount, 0))} ({items.length} items)
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className={`${isLight ? "bg-slate-50 text-slate-600 border-slate-200" : "bg-[#161616] text-[#888] border-[#222]"} border-b font-semibold`}>
                                  <th className="px-3 py-2">Date</th>
                                  <th className="px-3 py-2">Ref</th>
                                  <th className="px-3 py-2">Type</th>
                                  <th className="px-3 py-2">Description</th>
                                  <th className="px-3 py-2 text-right">Debit</th>
                                  <th className="px-3 py-2 text-right">Credit</th>
                                  <th className="px-3 py-2 text-right">Amount</th>
                                </tr>
                              </thead>
                              <tbody className={`divide-y ${isLight ? "divide-slate-100" : "divide-[#1e1e1e]"}`}>
                                {items.map((item) => (
                                  <tr key={item.id} className={`${isLight ? "hover:bg-slate-50" : "hover:bg-white/[0.03]"} transition-colors`}>
                                    <td className={`px-3 py-2 ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>{item.date}</td>
                                    <td className={`px-3 py-2 font-mono ${isLight ? "text-slate-700" : "text-[#ccc]"}`}>{item.ref}</td>
                                    <td className={`px-3 py-2 ${isLight ? "text-slate-500" : "text-[#888]"}`}>{item.type}</td>
                                    <td className={`px-3 py-2 max-w-[260px] truncate ${isLight ? "text-slate-700" : "text-[#ddd]"}`} title={item.description}>{item.description}</td>
                                    <td className={`px-3 py-2 text-right font-mono ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>
                                      {item.debit > 0 ? fmt(item.debit) : "—"}
                                    </td>
                                    <td className={`px-3 py-2 text-right font-mono ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>
                                      {item.credit > 0 ? fmt(item.credit) : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold" style={{ color: getBuColor(bu) }}>
                                      {fmt(item.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className={`${isLight ? "bg-slate-50 border-slate-200" : "bg-[#161616] border-[#222]"} border-t font-bold`}>
                                  <td colSpan={6} className={`px-3 py-2 text-right text-xs ${isLight ? "text-slate-700" : "text-[#ccc]"}`}>
                                    Subtotal ({bu})
                                  </td>
                                  <td className="px-3 py-2 text-right text-xs" style={{ color: getBuColor(bu) }}>
                                    {fmt(items.reduce((s, i) => s + i.amount, 0))}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {importOpen && (
        <HeadleysImportModal
          isLight={isLight}
          initialText={importInitialText}
          onClose={() => { setImportOpen(false); setImportInitialText(undefined); }}
        />
      )}
    </div>
  );
};
