import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Settings, X, Moon, Sun, FileSpreadsheet, Tag, Database,
  Plus, Pencil, Trash2, Check
} from "lucide-react";
import { useFinance } from "../../context/FinanceContext";
import { getAccessToken } from "../../services/googleAuth";

const MAIN_SHEET_ID = "15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs";
const HEADLEYS_TAB  = "Headley's";
const METADATA_TAB  = "Metadata";
const BU_OPTIONS    = ["TI", "4YR"];

// ── Types ──────────────────────────────────────────────────────────────────────
interface ParsedHdlRow {
  date: string; ref: string; st: string; type: string;
  description: string; debit: number; credit: number; amount: number; bu: string;
}
interface MetaRow {
  section: "ruby" | "ti" | "msdx";
  rowNum: number; company: string; vendor: string;
  dueDate: string; recurring: string; fixedEst: string; debitManual: string;
}

// ── Column maps ────────────────────────────────────────────────────────────────
// READ: 0-based indices (sheet data fetched from row 4, col A)
const META_READ = {
  ruby: { company:1, vendor:2, dueDate:4, recurring:5, fixedEst:6, debitManual:7 },
  ti:   { company:12, vendor:13, dueDate:14, recurring:15, fixedEst:16, debitManual:17 },
  msdx: { company:19, vendor:20, dueDate:21, recurring:22, fixedEst:23, debitManual:24 },
};
// WRITE: 1-based col numbers matching GAS META_COLS
const META_WRITE = {
  ruby: { company:2, vendor:3, dueDate:5, recurring:6, fixedEst:7, debitManual:8 },
  ti:   { company:13, vendor:14, dueDate:15, recurring:16, fixedEst:17, debitManual:18 },
  msdx: { company:20, vendor:21, dueDate:22, recurring:23, fixedEst:24, debitManual:25 },
};
const ENTITY_NAME:  Record<string,string> = { ruby:"Ruby's", ti:"TI", msdx:"MSDx" };
const ENTITY_COLOR: Record<string,string> = { ruby:"#d81b60", ti:"#1a73e8", msdx:"#00897b" };

// 1-based column number → letter(s)
const colLetter = (n: number): string => {
  let r = "";
  while (n > 0) { n--; r = String.fromCharCode(65 + (n % 26)) + r; n = Math.floor(n / 26); }
  return r;
};

const fmt = (n: number) =>
  "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 });

// ── Sheets API helpers ─────────────────────────────────────────────────────────
async function sheetsGet(range: string, token: string): Promise<string[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${MAIN_SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Sheet read failed");
  return data.values || [];
}

async function sheetsBatchUpdate(
  updates: { range: string; values: any[][] }[],
  token: string
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${MAIN_SHEET_ID}/values:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: updates }),
    }
  );
  if (!res.ok) {
    const d = await res.json();
    throw new Error(d.error?.message || "Sheet write failed");
  }
}

async function sheetsClear(range: string, token: string): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${MAIN_SHEET_ID}/values/${encodeURIComponent(range)}:clear`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const d = await res.json();
    throw new Error(d.error?.message || "Sheet clear failed");
  }
}

// ── Headley's parser — mirrors GAS parseHeadleysText exactly ──────────────────
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

// ── Headley's append to sheet ─────────────────────────────────────────────────
async function appendHeadleysToSheet(
  rows: ParsedHdlRow[], billingDate: string, token: string
): Promise<void> {
  const allRows = await sheetsGet(`${HEADLEYS_TAB}!A1:J500`, token);
  let headerIdx = -1, startCol = 0;
  for (let i = 0; i < allRows.length; i++) {
    const joined = allRows[i].join(" ").toLowerCase();
    if (joined.includes("charging bu") && joined.includes("debit") && joined.includes("credit")) {
      headerIdx = i;
      startCol  = allRows[i].findIndex(c => c.toLowerCase().includes("charging bu"));
      if (startCol < 0) startCol = 0;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("Could not find Headley's raw data table header row.");
  let lastDataRow = headerIdx;
  for (let i = allRows.length - 1; i > headerIdx; i--) {
    if (allRows[i].slice(startCol, startCol + 10).join("").trim()) { lastDataRow = i; break; }
  }
  const nextRow = lastDataRow + 2; // 0-indexed lastDataRow + 1 → 1-based sheet row, + 1 more → next empty row
  const startColLetter = startCol > 0 ? colLetter(startCol + 1) : "A";
  const endColLetter   = colLetter(startCol + 10); // A+9 = J for startCol=0
  await sheetsBatchUpdate([{
    range: `${HEADLEYS_TAB}!${startColLetter}${nextRow}:${endColLetter}${nextRow + rows.length - 1}`,
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

// ── Metadata CRUD ─────────────────────────────────────────────────────────────
async function fetchMetaRows(token: string): Promise<MetaRow[]> {
  const raw = await sheetsGet(`${METADATA_TAB}!A4:Y500`, token);
  const result: MetaRow[] = [];
  raw.forEach((row, i) => {
    const rowNum = i + 4;
    (["ruby","ti","msdx"] as const).forEach(sec => {
      const m = META_READ[sec];
      const vendor = String(row[m.vendor] || "").trim();
      if (vendor) result.push({
        section: sec, rowNum,
        company: String(row[m.company] || "").trim() || ENTITY_NAME[sec],
        vendor,
        dueDate:    String(row[m.dueDate]    || "").trim(),
        recurring:  String(row[m.recurring]  || "").trim(),
        fixedEst:   String(row[m.fixedEst]   || "").trim(),
        debitManual:String(row[m.debitManual]|| "").trim(),
      });
    });
  });
  return result;
}

async function saveMetaRow(r: MetaRow, token: string): Promise<void> {
  const c = META_WRITE[r.section];
  await sheetsBatchUpdate([{
    range: `${METADATA_TAB}!${colLetter(c.dueDate)}${r.rowNum}:${colLetter(c.debitManual)}${r.rowNum}`,
    values: [[r.dueDate, r.recurring, r.fixedEst, r.debitManual]]
  }], token);
}

async function addMetaRow(
  section: "ruby"|"ti"|"msdx", vendor: string, dueDate: string,
  recurring: string, fixedEst: string, debitManual: string,
  existing: MetaRow[], token: string
): Promise<void> {
  const sectionRows = existing.filter(r => r.section === section);
  const nextRow = sectionRows.length > 0 ? Math.max(...sectionRows.map(r => r.rowNum)) + 1 : 4;
  const c = META_WRITE[section];
  await sheetsBatchUpdate([{
    range: `${METADATA_TAB}!${colLetter(c.company)}${nextRow}:${colLetter(c.debitManual)}${nextRow}`,
    values: [[ENTITY_NAME[section], vendor, "", dueDate, recurring, fixedEst, debitManual]]
  }], token);
}

async function deleteMetaRow(r: MetaRow, token: string): Promise<void> {
  const c = META_WRITE[r.section];
  await sheetsClear(
    `${METADATA_TAB}!${colLetter(c.company)}${r.rowNum}:${colLetter(c.debitManual)}${r.rowNum}`,
    token
  );
}

// ── Shared style helpers ───────────────────────────────────────────────────────
const styles = (isLight: boolean) => ({
  surf: isLight ? "bg-white border-slate-200"                        : "bg-[#121212] border-[#2a2a2a]",
  sub2: isLight ? "bg-slate-50 border-slate-200"                     : "bg-[#0f0f0f] border-[#1e1e1e]",
  txt:  isLight ? "text-slate-800"                                    : "text-white",
  muted:isLight ? "text-slate-500"                                    : "text-[#888]",
  inp:  isLight ? "bg-white border-slate-300 text-slate-800 placeholder-slate-400"
                : "bg-[#1e1e1e] border-[#333] text-white placeholder-[#555]",
  div:  isLight ? "divide-slate-100"                                  : "divide-[#1e1e1e]",
  hdr:  isLight ? "bg-slate-50 text-slate-600 border-slate-200"      : "bg-[#161616] text-[#888] border-[#222]",
});

// ── HeadleysImportModal ────────────────────────────────────────────────────────
const HeadleysImportModal: React.FC<{ isLight: boolean; onClose: () => void }> = ({ isLight, onClose }) => {
  const { addBill } = useFinance();
  const s = styles(isLight);
  const [step, setStep]               = useState(1);
  const [billingDate, setBillingDate] = useState("");
  const [pasteText, setPasteText]     = useState("");
  const [parsedRows, setParsedRows]   = useState<ParsedHdlRow[]>([]);
  const [error, setError]             = useState("");
  const [saving, setSaving]           = useState(false);
  const [billStatus, setBillStatus]   = useState<Record<string,"idle"|"done"|"err">>({});

  const doStep1 = () => {
    setError("");
    if (!billingDate.trim()) { setError("Enter the billing cycle date (e.g. 6/22/26)."); return; }
    if (!pasteText.trim())   { setError("Paste the invoice text first."); return; }
    const rows = parseHeadleysText(pasteText);
    if (!rows.length) { setError("No data rows found. Copy the table from the email body."); return; }
    setParsedRows(rows);
    setStep(2);
  };

  const assignBU = (idx: number, bu: string) =>
    setParsedRows(prev => prev.map((r,i) => i===idx ? {...r, bu} : r));

  const bulkAssign = (bu: string) => {
    if (!bu) return;
    setParsedRows(prev => prev.map(r => ({...r, bu})));
  };

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

  const errBox = error
    ? <p className={`text-[12px] font-semibold px-3 py-2 rounded-lg border ${isLight ? "bg-red-50 border-red-200 text-red-600" : "bg-red-950/20 border-red-800/40 text-red-400"}`}>{error}</p>
    : null;

  const noToken = !getAccessToken()
    ? <p className={`text-[11px] px-3 py-2 rounded-lg border ${isLight ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-amber-950/20 border-amber-800/40 text-amber-400"}`}>
        ⚠ Not signed in to Google — rows won't be saved to the sheet.
      </p>
    : null;

  return (
    <div className="fixed inset-0 z-[500] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden border shadow-2xl ${s.surf}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#5c35a5] text-white shrink-0">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="font-bold text-sm">Headley's Invoice Import</span>
            <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-semibold">Step {step} of 3</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20"><X className="w-4 h-4" /></button>
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
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${s.muted}`}>Paste Invoice Text</label>
              <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={10}
                placeholder={"Paste the Headley's statement here (copied from the email body)\n\nDate\tRef\tST\tC\tDescription\tDebit\tCredit\tAmount\n5/26/26\t762930\t1\tI\tPO # BANK\t33.01\t\t33.01\n..."}
                className={`w-full text-xs px-3 py-2 rounded-lg border focus:outline-none font-mono resize-y ${s.inp}`} />
              <p className={`text-[11px] mt-1 ${s.muted}`}>Header row and aging summary at the bottom are skipped automatically.</p>
            </div>
            {errBox}
          </>}

          {/* ── STEP 2 ── */}
          {step === 2 && <>
            {/* Bulk assign bar */}
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${s.sub2}`}>
              <span className={`text-[12px] font-semibold ${s.muted}`}>Bulk assign all to:</span>
              <select onChange={e => { if (e.target.value) bulkAssign(e.target.value); e.target.value = ""; }}
                className={`text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none ${s.inp}`} defaultValue="">
                <option value="">— choose —</option>
                {BU_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <span className={`ml-auto text-[11px] ${s.muted}`}>{parsedRows.length} line{parsedRows.length!==1?"s":""} parsed</span>
            </div>

            {/* Review table */}
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
                        {r.amount<0 ? `(${fmt(r.amount)})` : fmt(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {errBox}
            {noToken}
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
                    <div key={bu} className={`rounded-xl border p-4 flex flex-col gap-2 ${isLight?"bg-slate-50 border-slate-200":"bg-[#111] border-[#262626]"}`}>
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${s.muted}`}>Charging BU</div>
                      <div className="text-xl font-black text-[#5c35a5]">{bu}</div>
                      <div className={`text-lg font-bold ${s.txt}`}>{fmt(bk.charges)}</div>
                      {bk.credits < 0 && <div className={`text-[11px] ${s.muted}`}>incl. {fmt(bk.credits)} credit</div>}
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
          <button onClick={step===1?doStep1:step===2?doStep2:onClose} disabled={saving}
            className="text-[12px] font-bold px-5 py-2 rounded-lg bg-[#5c35a5] hover:bg-[#4a2990] text-white transition-colors disabled:opacity-50">
            {step===1?"Parse Invoice →":step===2?(saving?"Saving…":"Save to Sheet →"):"Done"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── MetadataModal ──────────────────────────────────────────────────────────────
const RECURRING_OPTS    = ["Recurring",""];
const FIXED_EST_OPTS    = ["Fixed Amount","Estimate",""];
const DEBIT_MANUAL_OPTS = ["AutoDebit","Manual",""];

const MetadataModal: React.FC<{ isLight: boolean; onClose: () => void }> = ({ isLight, onClose }) => {
  const s = styles(isLight);
  const [rows, setRows]           = useState<MetaRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [search, setSearch]       = useState("");
  const [secFilter, setSecFilter] = useState<"all"|"ruby"|"ti"|"msdx">("all");
  const [editKey, setEditKey]     = useState<string|null>(null);
  const [draft, setDraft]         = useState<Partial<MetaRow>>({});
  const [saving, setSaving]       = useState(false);
  const [addFor, setAddFor]       = useState<"ruby"|"ti"|"msdx"|null>(null);
  const [nv, setNv] = useState(""); const [nd, setNd] = useState("");
  const [nr, setNr] = useState(""); const [nf, setNf] = useState(""); const [nm, setNm] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const token = getAccessToken();
      if (!token) { setError("Sign in to Google to load metadata."); setLoading(false); return; }
      setRows(await fetchMetaRows(token));
    } catch (e: any) { setError(e.message||"Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => {
    if (secFilter !== "all" && r.section !== secFilter) return false;
    if (search && !r.vendor.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const startEdit = (r: MetaRow) => { setEditKey(`${r.rowNum}-${r.section}`); setDraft({...r}); };
  const cancelEdit = () => { setEditKey(null); setDraft({}); };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const token = getAccessToken();
      if (!token) throw new Error("No Google token.");
      await saveMetaRow(draft as MetaRow, token);
      setRows(prev => prev.map(r => r.rowNum===draft.rowNum&&r.section===draft.section ? {...r,...draft} as MetaRow : r));
      setEditKey(null);
    } catch (e: any) { alert("Save error: "+e.message); }
    finally { setSaving(false); }
  };

  const deleteRow = async (r: MetaRow) => {
    if (!confirm(`Delete metadata for "${r.vendor}" (${ENTITY_NAME[r.section]})?`)) return;
    setSaving(true);
    try {
      const token = getAccessToken();
      if (!token) throw new Error("No Google token.");
      await deleteMetaRow(r, token);
      setRows(prev => prev.filter(x => !(x.rowNum===r.rowNum&&x.section===r.section)));
    } catch (e: any) { alert("Delete error: "+e.message); }
    finally { setSaving(false); }
  };

  const addRow = async () => {
    if (!addFor || !nv.trim()) { alert("Vendor name is required."); return; }
    setSaving(true);
    try {
      const token = getAccessToken();
      if (!token) throw new Error("No Google token.");
      await addMetaRow(addFor, nv.trim(), nd, nr, nf, nm, rows, token);
      setAddFor(null); setNv(""); setNd(""); setNr(""); setNf(""); setNm("");
      await load();
    } catch (e: any) { alert("Add error: "+e.message); }
    finally { setSaving(false); }
  };

  const Toggle = ({ value, opts, onChange }: { value:string; opts:string[]; onChange:(v:string)=>void }) => (
    <div className="flex items-center gap-1 flex-wrap">
      {opts.map(o => (
        <button key={o} onClick={() => onChange(o)}
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
            value===o ? "bg-[#1a73e8] text-white border-[#1a73e8]"
              : isLight ? "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                        : "bg-[#1e1e1e] border-[#333] text-[#888] hover:bg-[#2a2a2a]"
          }`}>
          {o||"—"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[500] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden border shadow-2xl ${s.surf}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#1a73e8] text-white shrink-0">
          <div className="flex items-center gap-2"><Tag className="w-4 h-4" /><span className="font-bold text-sm">MetaData</span></div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="text-[11px] px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors">↻ Reload</button>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Filters */}
        <div className={`flex items-center gap-3 px-5 py-3 border-b shrink-0 ${s.sub2}`}>
          <input type="text" placeholder="Search vendor…" value={search} onChange={e=>setSearch(e.target.value)}
            className={`text-xs px-3 py-1.5 rounded-lg border focus:outline-none w-44 ${s.inp}`} />
          <div className="flex items-center gap-1">
            {(["all","ruby","ti","msdx"] as const).map(f => (
              <button key={f} onClick={() => setSecFilter(f)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                  secFilter===f?"bg-[#1a73e8] text-white":isLight?"bg-slate-100 text-slate-600 hover:bg-slate-200":"bg-[#1e1e1e] text-[#888] hover:bg-[#2a2a2a]"
                }`}>
                {f==="all"?"All":ENTITY_NAME[f]}
              </button>
            ))}
          </div>
          <button onClick={() => setAddFor(secFilter==="all"?"ruby":secFilter)}
            className="ml-auto flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        {/* Add-row form */}
        {addFor && (
          <div className={`px-5 py-3 border-b shrink-0 ${isLight?"bg-emerald-50 border-emerald-200":"bg-emerald-950/20 border-emerald-900/40"}`}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-2">
              Adding to {ENTITY_NAME[addFor]}
              <select value={addFor} onChange={e => setAddFor(e.target.value as any)}
                className="ml-2 text-[11px] px-1 rounded border border-emerald-300 bg-white text-emerald-700">
                {(["ruby","ti","msdx"] as const).map(x => <option key={x} value={x}>{ENTITY_NAME[x]}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className={`block text-[10px] font-semibold mb-1 ${s.muted}`}>Vendor *</label>
                <input value={nv} onChange={e=>setNv(e.target.value)} placeholder="Vendor name"
                  className={`text-xs px-2 py-1.5 rounded-lg border focus:outline-none w-40 ${s.inp}`} />
              </div>
              <div>
                <label className={`block text-[10px] font-semibold mb-1 ${s.muted}`}>Due Date</label>
                <input value={nd} onChange={e=>setNd(e.target.value)} placeholder="e.g. 1st"
                  className={`text-xs px-2 py-1.5 rounded-lg border focus:outline-none w-24 ${s.inp}`} />
              </div>
              <div><label className={`block text-[10px] font-semibold mb-1 ${s.muted}`}>Recurring</label><Toggle value={nr} opts={RECURRING_OPTS} onChange={setNr} /></div>
              <div><label className={`block text-[10px] font-semibold mb-1 ${s.muted}`}>Fixed/Est</label><Toggle value={nf} opts={FIXED_EST_OPTS} onChange={setNf} /></div>
              <div><label className={`block text-[10px] font-semibold mb-1 ${s.muted}`}>Payment</label><Toggle value={nm} opts={DEBIT_MANUAL_OPTS} onChange={setNm} /></div>
              <div className="flex gap-2">
                <button onClick={addRow} disabled={saving}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
                  {saving?"Saving…":"Save"}
                </button>
                <button onClick={() => setAddFor(null)}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${isLight?"border-slate-300 text-slate-600 hover:bg-slate-100":"border-[#333] text-[#888] hover:bg-white/5"}`}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className={`flex items-center justify-center py-16 ${s.muted}`}><span className="text-sm">Loading…</span></div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={load} className="text-[11px] px-4 py-2 rounded-lg bg-[#1a73e8] text-white">Retry</button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`sticky top-0 font-bold border-b ${s.hdr}`}>
                  <th className="px-4 py-2.5">Vendor</th>
                  <th className="px-4 py-2.5">Due Date</th>
                  <th className="px-4 py-2.5">Recurring</th>
                  <th className="px-4 py-2.5">Fixed / Estimate</th>
                  <th className="px-4 py-2.5">Payment</th>
                  <th className="px-4 py-2.5 w-16"></th>
                </tr>
              </thead>
              <tbody className={`divide-y ${s.div}`}>
                {filtered.length===0 ? (
                  <tr><td colSpan={6} className={`px-4 py-8 text-center ${s.muted}`}>No vendors found.</td></tr>
                ) : filtered.map(r => {
                  const k = `${r.rowNum}-${r.section}`;
                  const isEditing = editKey===k;
                  const d = isEditing ? draft : r;
                  const color = ENTITY_COLOR[r.section];

                  return (
                    <tr key={k} className={`transition-colors ${isLight?"hover:bg-slate-50":"hover:bg-white/[0.02]"}`}>
                      <td className={`px-4 py-2 font-semibold ${s.txt}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white shrink-0" style={{backgroundColor:color}}>
                            {ENTITY_NAME[r.section]}
                          </span>
                          {r.vendor}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {isEditing
                          ? <input value={d.dueDate||""} onChange={e=>setDraft(x=>({...x,dueDate:e.target.value}))}
                              className={`text-xs px-2 py-1 rounded border focus:outline-none w-20 ${s.inp}`} />
                          : <span className={s.muted}>{r.dueDate||"—"}</span>}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing
                          ? <Toggle value={d.recurring||""} opts={RECURRING_OPTS} onChange={v=>setDraft(x=>({...x,recurring:v}))} />
                          : r.recurring
                            ? <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.recurring==="Recurring"?"bg-blue-500/15 text-blue-500":"bg-slate-500/15 text-slate-500"}`}>{r.recurring}</span>
                            : <span className={s.muted}>—</span>}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing
                          ? <Toggle value={d.fixedEst||""} opts={FIXED_EST_OPTS} onChange={v=>setDraft(x=>({...x,fixedEst:v}))} />
                          : r.fixedEst
                            ? <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.fixedEst==="Fixed Amount"?"bg-emerald-500/15 text-emerald-600":"bg-amber-500/15 text-amber-600"}`}>{r.fixedEst}</span>
                            : <span className={s.muted}>—</span>}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing
                          ? <Toggle value={d.debitManual||""} opts={DEBIT_MANUAL_OPTS} onChange={v=>setDraft(x=>({...x,debitManual:v}))} />
                          : r.debitManual
                            ? <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.debitManual==="AutoDebit"?"bg-purple-500/15 text-purple-600":"bg-slate-500/15 text-slate-500"}`}>{r.debitManual}</span>
                            : <span className={s.muted}>—</span>}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button onClick={saveEdit} disabled={saving} className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white">
                              <Check className="w-3 h-3" />
                            </button>
                            <button onClick={cancelEdit} className={`p-1.5 rounded-lg ${isLight?"bg-slate-200 hover:bg-slate-300 text-slate-600":"bg-[#2a2a2a] hover:bg-[#333] text-[#888]"}`}>
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(r)} className={`p-1.5 rounded-lg text-sky-400 ${isLight?"hover:bg-sky-50":"hover:bg-sky-900/20"}`}>
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => deleteRow(r)} className={`p-1.5 rounded-lg text-red-400 ${isLight?"hover:bg-red-50":"hover:bg-red-900/20"}`}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-2 text-[11px] border-t shrink-0 ${isLight?"border-slate-200 text-slate-400":"border-[#1e1e1e] text-[#555]"}`}>
          {rows.length} vendor{rows.length!==1?"s":""} loaded
        </div>
      </div>
    </div>
  );
};

// ── GearDropdown ───────────────────────────────────────────────────────────────
interface GearDropdownProps { variant?: "wide"|"collapsed"; }

export const GearDropdown: React.FC<GearDropdownProps> = ({ variant="wide" }) => {
  const { theme, toggleTheme, setCurrentPage } = useFinance();
  const [open, setOpen]       = useState(false);
  const [pos, setPos]         = useState({ bottom:0, left:0 });
  const [modal, setModal]     = useState<"headleys"|"metadata"|null>(null);
  const btnRef                = useRef<HTMLButtonElement>(null);
  const menuRef               = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ bottom: window.innerHeight - r.top + 6, left: r.left });
    }
    setOpen(p => !p);
  };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const isLight = theme === "light";
  const iconSz  = variant==="wide" ? "w-3.5 h-3.5" : "w-4 h-4";
  const btnCls  = (variant==="wide"
    ? `flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors `
    : `p-1.5 rounded-lg transition-colors `) +
    (open
      ? isLight ? "bg-slate-200 text-slate-800" : "bg-[#1e1e1e] text-white"
      : isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-[#1a1a1a] text-[#888] hover:text-white");

  const menuItem = `w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium transition-colors ` +
    (isLight ? "hover:bg-slate-50 text-slate-700" : "hover:bg-white/5 text-[#ccc]");
  const divLine  = `h-px mx-2 my-0.5 ${isLight?"bg-slate-100":"bg-[#2a2a2a]"}`;

  return (
    <>
      <button ref={btnRef} onClick={openMenu} className={btnCls} title="Tools & Settings">
        <Settings className={iconSz} />
      </button>

      {open && (
        <div ref={menuRef} style={{ position:"fixed", bottom:pos.bottom, left:pos.left, zIndex:9999 }}
          className={`w-52 rounded-xl border shadow-2xl overflow-hidden py-1 ${
            isLight ? "bg-white border-slate-200 shadow-slate-300/50" : "bg-[#1c1c1c] border-[#2e2e2e] shadow-black/60"
          }`}>
          <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${isLight?"text-slate-400":"text-[#555]"}`}>Tools</div>

          <button onClick={() => { toggleTheme(); setOpen(false); }} className={menuItem}>
            {isLight ? <Moon className="w-3.5 h-3.5 text-[#1a73e8]" /> : <Sun className="w-3.5 h-3.5 text-[#1a73e8]" />}
            {isLight ? "Dark Mode" : "Light Mode"}
          </button>

          <div className={divLine} />

          <button onClick={() => { setModal("headleys"); setOpen(false); }} className={menuItem}>
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#1a73e8]" /> Headley's Invoice
          </button>

          <div className={divLine} />

          <button onClick={() => { setModal("metadata"); setOpen(false); }} className={menuItem}>
            <Tag className="w-3.5 h-3.5 text-[#1a73e8]" /> MetaData
          </button>

          <div className={divLine} />

          <button onClick={() => { setCurrentPage("datasync"); setOpen(false); }} className={menuItem}>
            <Database className="w-3.5 h-3.5 text-[#1a73e8]" /> Settings & Data Sync
          </button>
        </div>
      )}

      {modal==="headleys" && <HeadleysImportModal isLight={isLight} onClose={() => setModal(null)} />}
      {modal==="metadata" && <MetadataModal isLight={isLight} onClose={() => setModal(null)} />}
    </>
  );
};
