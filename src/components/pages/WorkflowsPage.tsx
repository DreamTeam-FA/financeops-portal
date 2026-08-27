import React, { useState, useEffect, useCallback } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  BookOpen, ChevronRight, RefreshCw, AlertCircle, FileText,
  ArrowRight, Receipt, TrendingUp, DollarSign, Banknote,
  Calculator, Repeat, BarChart3, FileSpreadsheet, ClipboardList,
  Building2, Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WorkflowSection {
  type: "h1" | "h2" | "h3" | "paragraph" | "list" | "table";
  text?: string;
  items?: string[];
  rows?: string[][];
}
interface Workflow { id: string; title: string; sections: WorkflowSection[] }

// ── Metadata ──────────────────────────────────────────────────────────────────
const META: Record<string, { icon: React.ReactNode; desc: string; accent: string; glow: string }> = {
  "invoice-to-clients":        { icon: <Receipt className="w-5 h-5"/>, desc: "Invoicing process for all client entities", accent: "text-blue-400", glow: "shadow-blue-900/40" },
  "accounts-receivable":       { icon: <TrendingUp className="w-5 h-5"/>, desc: "Tracking and collecting incoming client payments", accent: "text-emerald-400", glow: "shadow-emerald-900/40" },
  "reimbursements":            { icon: <DollarSign className="w-5 h-5"/>, desc: "Employee and vendor reimbursement workflow", accent: "text-amber-400", glow: "shadow-amber-900/40" },
  "accounts-payable":          { icon: <Banknote className="w-5 h-5"/>, desc: "Bill processing, approval, and payment", accent: "text-rose-400", glow: "shadow-rose-900/40" },
  "qbo-clarifications":        { icon: <Calculator className="w-5 h-5"/>, desc: "QuickBooks Online transaction clarification", accent: "text-violet-400", glow: "shadow-violet-900/40" },
  "transfers":                 { icon: <Repeat className="w-5 h-5"/>, desc: "Inter-entity and bank transfer procedures", accent: "text-cyan-400", glow: "shadow-cyan-900/40" },
  "ruby-s-usu-fta-report":     { icon: <BarChart3 className="w-5 h-5"/>, desc: "Ruby's USU Food and Tobacco Adjustment report", accent: "text-orange-400", glow: "shadow-orange-900/40" },
  "ruby-s-toast-recon-report": { icon: <FileSpreadsheet className="w-5 h-5"/>, desc: "Ruby's Toast POS reconciliation report", accent: "text-pink-400", glow: "shadow-pink-900/40" },
  "cpro-reports":              { icon: <ClipboardList className="w-5 h-5"/>, desc: "CurcuminPRO financial reporting", accent: "text-teal-400", glow: "shadow-teal-900/40" },
  "ziglar-reports":            { icon: <Building2 className="w-5 h-5"/>, desc: "Ziglar entity reporting and reconciliation", accent: "text-indigo-400", glow: "shadow-indigo-900/40" },
};

// ── Inline markdown ───────────────────────────────────────────────────────────
function renderMd(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={k++} className="font-bold italic">{m[2]}</strong>);
    else if (m[3]) parts.push(<strong key={k++} className="font-semibold">{m[3]}</strong>);
    else if (m[4]) parts.push(<em key={k++}>{m[4]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

// ── Pipeline / diagram detection ─────────────────────────────────────────────
const DATA_SIGNALS = ["date", "amount", "remarks", "company", "client", "name", "description", "due", "balance", "total", "invoice #", "ref", "rate", "qty"];
const STAGE_SIGNALS = ["instruction", "approval", "qbo", "generation", "send for", "send to", "payment", "assign", "logging", "matching", "report gen", "billing"];

function isDiagram(rows: string[][]): boolean {
  if (!rows?.length || rows[0].length < 2 || rows[0].length > 7) return false;
  const hdr = rows[0].join(" ").toLowerCase();
  if (DATA_SIGNALS.some(s => hdr.includes(s))) return false;
  return STAGE_SIGNALS.filter(k => hdr.includes(k)).length >= 2;
}

// ── Step grouper ──────────────────────────────────────────────────────────────
function groupSteps(secs: WorkflowSection[]) {
  const out: any[] = [];
  let i = 0;
  while (i < secs.length) {
    const s = secs[i];
    if (s.type === "paragraph" && /^\d+[\.\)]\s/.test(s.text || "")) {
      const steps: { text: string }[] = [];
      while (i < secs.length && secs[i].type === "paragraph" && /^\d+[\.\)]\s/.test(secs[i].text || "")) {
        const m2 = (secs[i].text || "").match(/^\d+[\.\)]\s+([\s\S]*)$/);
        steps.push({ text: m2 ? m2[1] : secs[i].text || "" });
        i++;
      }
      out.push({ type: "steps", steps });
    } else { out.push(s); i++; }
  }
  return out;
}

// ── Workflow Diagram (visual stage cards) ─────────────────────────────────────
const WorkflowDiagram: React.FC<{ rows: string[][]; isLight: boolean; accentCls: string }> = ({ rows, isLight, accentCls }) => {
  const headers = rows[0] || [];
  // Collect all person/value rows (may be multiple)
  const dataRows = rows.slice(1);

  return (
    <div className="mb-7">
      <div className="overflow-x-auto pb-2">
        <div className="flex items-start gap-0 min-w-max">
          {headers.map((header, i) => {
            const persons = dataRows.map(r => (r[i] || "").trim()).filter(Boolean);
            return (
              <React.Fragment key={i}>
                {/* Stage card */}
                <div className={`relative flex flex-col w-44 rounded-2xl border overflow-hidden transition-shadow ${
                  isLight
                    ? "bg-white border-slate-200 shadow-sm hover:shadow-md"
                    : "bg-[#0c1628] border-[#1a3154] hover:border-[#243e66]"
                }`}>
                  {/* Step number badge */}
                  <div className={`flex items-center gap-2 px-3.5 pt-3 pb-2.5 border-b ${
                    isLight ? "border-slate-100" : "border-[#1a3154]"
                  }`}>
                    <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                      isLight ? "bg-blue-600" : "bg-blue-700"
                    }`}>{i + 1}</span>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.09em] leading-tight ${
                      isLight ? "text-slate-400" : "text-slate-500"
                    }`}>{header}</p>
                  </div>
                  {/* Person / role */}
                  <div className={`px-3.5 py-3 min-h-[56px] flex flex-col justify-center`}>
                    {persons.length > 0
                      ? persons.map((p, pi) => (
                          <p key={pi} className={`text-[13.5px] font-semibold leading-snug ${
                            isLight ? "text-slate-800" : "text-slate-100"
                          }`}>{renderMd(p)}</p>
                        ))
                      : <p className={`text-[12px] ${isLight ? "text-slate-300" : "text-slate-600"}`}>—</p>
                    }
                  </div>
                </div>

                {/* Arrow connector */}
                {i < headers.length - 1 && (
                  <div className="flex items-center self-center mx-1.5">
                    <div className={`h-px w-5 ${isLight ? "bg-slate-300" : "bg-[#1e3a5f]"}`} />
                    <ArrowRight className={`w-4 h-4 -ml-1.5 ${isLight ? "text-slate-300" : "text-[#1e3a5f]"}`} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Data table ────────────────────────────────────────────────────────────────
const DataTable: React.FC<{ rows: string[][]; isLight: boolean }> = ({ rows, isLight }) => {
  if (!rows.length) return null;
  const [header, ...body] = rows;
  return (
    <div className={`mb-6 rounded-2xl overflow-hidden border ${isLight ? "border-slate-200 shadow-sm" : "border-[#1a3154]"}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] border-collapse">
          <thead>
            <tr className={isLight ? "bg-[#eef3ff]" : "bg-[#0a1422]"}>
              {header.map((c, i) => (
                <th key={i} className={`px-4 py-3 text-left font-semibold whitespace-nowrap border-b ${
                  isLight ? "text-[#1a4bbf] border-[#dde7ff]" : "text-blue-300 border-[#1a3154]"
                }`}>{renderMd(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className={`border-b last:border-0 transition-colors ${
                isLight
                  ? `border-slate-100 ${ri % 2 === 0 ? "bg-white" : "bg-slate-50/60"} hover:bg-blue-50/30`
                  : `border-[#1a3154]/40 ${ri % 2 === 0 ? "bg-transparent" : "bg-[#0a1422]/40"} hover:bg-[#0d1e3a]/50`
              }`}>
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-4 py-2.5 align-top leading-relaxed ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                    {cell.trim() ? renderMd(cell) : <span className={isLight ? "text-slate-300" : "text-[#1e3154]"}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Step cards ────────────────────────────────────────────────────────────────
const StepCards: React.FC<{ steps: { text: string }[]; isLight: boolean }> = ({ steps, isLight }) => (
  <div className="mb-5 space-y-2">
    {steps.map((step, i) => (
      <div key={i} className={`flex gap-4 items-start px-4 py-3.5 rounded-xl border ${
        isLight
          ? "bg-white border-slate-200 shadow-sm hover:border-blue-200"
          : "bg-[#0c1628]/80 border-[#1a3154]/60 hover:border-[#243e66]"
      } transition-colors`}>
        <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm ${
          isLight ? "bg-blue-600" : "bg-blue-700"
        }`}>{i + 1}</span>
        <p className={`text-[13px] leading-relaxed flex-1 pt-px ${isLight ? "text-slate-700" : "text-slate-200"}`}>
          {renderMd(step.text)}
        </p>
      </div>
    ))}
  </div>
);

// ── Callout ───────────────────────────────────────────────────────────────────
const Callout: React.FC<{ text: string; isLight: boolean }> = ({ text, isLight }) => (
  <div className={`mb-4 px-4 py-3 rounded-xl border-l-[3px] ${
    isLight ? "bg-amber-50 border-amber-400 text-amber-900" : "bg-amber-950/20 border-amber-500/70 text-amber-200"
  }`}>
    <p className="text-[13px] leading-relaxed">{renderMd(text)}</p>
  </div>
);

// ── Section renderer ──────────────────────────────────────────────────────────
function renderSec(sec: any, i: number, isLight: boolean, accentCls: string): React.ReactNode {
  switch (sec.type) {
    case "steps":
      return <StepCards key={i} steps={sec.steps} isLight={isLight} />;
    case "table":
      return isDiagram(sec.rows || [])
        ? <WorkflowDiagram key={i} rows={sec.rows} isLight={isLight} accentCls={accentCls} />
        : <DataTable key={i} rows={sec.rows} isLight={isLight} />;
    case "h1":
      return <h2 key={i} className={`text-[15px] font-bold mt-8 mb-3 ${isLight ? "text-slate-800" : "text-white"}`}>{renderMd(sec.text||"")}</h2>;
    case "h2":
      return (
        <div key={i} className="flex items-center gap-3 mt-7 mb-3">
          <span className={`h-px flex-1 ${isLight ? "bg-slate-200" : "bg-[#1a3154]"}`}/>
          <span className={`text-[10.5px] font-bold uppercase tracking-[0.1em] ${isLight ? "text-slate-400" : "text-slate-500"}`}>{renderMd(sec.text||"")}</span>
          <span className={`h-px flex-1 ${isLight ? "bg-slate-200" : "bg-[#1a3154]"}`}/>
        </div>
      );
    case "h3":
      return <h4 key={i} className={`text-[13.5px] font-semibold mt-5 mb-2 ${isLight ? "text-slate-700" : "text-slate-200"}`}>{renderMd(sec.text||"")}</h4>;
    case "paragraph": {
      const t = sec.text || "";
      if (!t.trim() || /^\*+$/.test(t.trim())) return null;
      if (/^(goal|note|important|reminder):/i.test(t)) return <Callout key={i} text={t} isLight={isLight}/>;
      return <p key={i} className={`text-[13px] leading-relaxed mb-3 ${isLight ? "text-slate-600" : "text-slate-300"}`}>{renderMd(t)}</p>;
    }
    case "list":
      return (
        <ul key={i} className="mb-4 space-y-2">
          {(sec.items||[]).map((item: string, li: number) => (
            <li key={li} className={`flex items-start gap-3 text-[13px] ${isLight ? "text-slate-600" : "text-slate-300"}`}>
              <span className={`mt-[5px] shrink-0 w-1.5 h-1.5 rounded-full ${isLight ? "bg-blue-400" : "bg-blue-600"}`}/>
              {renderMd(item)}
            </li>
          ))}
        </ul>
      );
    default: return null;
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────
export const WorkflowsPage: React.FC = () => {
  const { theme, googleUser } = useFinance();
  const isLight = theme === "light";

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [source, setSource] = useState<string>("unknown");

  const TOTAL = 10;

  const load = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try {
      const token = (typeof window !== "undefined" ? localStorage.getItem("google_access_token") : "") || (googleUser as any)?.accessToken || "";
      const qs = token ? `?userAccessToken=${encodeURIComponent(token)}` : "";
      const bust = force ? `${qs ? "&" : "?"}bust=${Date.now()}` : "";
      const resp = await fetch(`/api/workflows${qs}${bust}`);
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      const wfs: Workflow[] = data.workflows || [];
      setWorkflows(wfs);
      setSource(data.source || "unknown");
      setCached(!!data.cached);
      setLastFetched(new Date());
      if (wfs.length > 0 && !activeId) setActiveId(wfs[0].id);
    } catch (e: any) { setError(e.message || "Unknown error"); }
    finally { setLoading(false); }
  }, [googleUser, activeId]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  const active = workflows.find(w => w.id === activeId);
  const meta = activeId ? META[activeId] : undefined;
  const accentCls = meta?.accent || "text-blue-400";
  const enriched = active ? groupSteps(active.sections) : [];
  const partial = workflows.length > 0 && workflows.length < TOTAL;
  const docApiWorking = source === "docs-api";

  return (
    <div className={`flex h-full overflow-hidden ${isLight ? "bg-[#f4f6fb]" : "bg-[#060c18]"}`}>

      {/* Sidebar */}
      <aside className={`w-[215px] shrink-0 flex flex-col border-r ${isLight ? "bg-white border-slate-200" : "bg-[#070d1c] border-[#152036]"}`}>
        <div className={`px-4 pt-5 pb-3.5 border-b ${isLight ? "border-slate-100" : "border-[#152036]"}`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${isLight ? "bg-blue-50" : "bg-blue-950/40"}`}>
              <BookOpen className={`w-3.5 h-3.5 ${isLight ? "text-blue-600" : "text-blue-400"}`}/>
            </div>
            <div>
              <p className={`text-[12.5px] font-bold leading-none ${isLight ? "text-slate-800" : "text-white"}`}>Workflows</p>
              <p className={`text-[10px] mt-0.5 ${isLight ? "text-slate-400" : "text-slate-600"}`}>SOPs · {docApiWorking ? "live" : "partial"}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {loading && !workflows.length
            ? Array.from({length: 9}).map((_,i) => <div key={i} className={`h-8 rounded-lg mb-1 animate-pulse ${isLight ? "bg-slate-100" : "bg-[#152036]/60"}`}/>)
            : workflows.map(wf => {
                const m = META[wf.id];
                const isActive = wf.id === activeId;
                return (
                  <button key={wf.id} onClick={() => setActiveId(wf.id)} className={`w-full text-left px-2.5 py-[7px] flex items-center gap-2.5 rounded-xl mb-[2px] text-[12px] transition-all ${
                    isActive
                      ? isLight ? "bg-blue-50 text-blue-700 font-semibold" : "bg-[#0d1f3a] text-blue-300 font-semibold"
                      : isLight ? "text-slate-500 hover:bg-slate-50 hover:text-slate-700" : "text-slate-500 hover:bg-[#0d1525]/70 hover:text-slate-300"
                  }`}>
                    <span className={`shrink-0 ${m?.accent || "text-slate-400"} ${isActive ? "" : "opacity-50"}`}>{m?.icon ?? <FileText className="w-4 h-4"/>}</span>
                    <span className="flex-1 leading-snug">{wf.title}</span>
                    {isActive && <ChevronRight className={`w-3 h-3 shrink-0 ${isLight ? "text-blue-300" : "text-blue-800"}`}/>}
                  </button>
                );
              })
          }
        </nav>

        <div className={`px-3 py-2.5 border-t ${isLight ? "border-slate-100" : "border-[#152036]"}`}>
          <button onClick={() => load(true)} disabled={loading} className={`w-full flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded-lg transition-all ${
            isLight ? "text-slate-400 hover:text-blue-600 hover:bg-blue-50" : "text-slate-600 hover:text-blue-400 hover:bg-[#0d1e3a]/50"
          }`}>
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`}/>
            {loading ? "Loading…" : cached ? "Refresh (cached)" : "Refresh"}
          </button>
          {lastFetched && !loading && (
            <p className={`text-center text-[10px] mt-0.5 ${isLight ? "text-slate-300" : "text-slate-700"}`}>
              {lastFetched.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
            </p>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <div className={`p-3 rounded-2xl ${isLight ? "bg-rose-50" : "bg-rose-950/30"}`}>
              <AlertCircle className={`w-7 h-7 ${isLight ? "text-rose-400" : "text-rose-500"}`}/>
            </div>
            <p className={`text-sm font-semibold ${isLight ? "text-slate-700" : "text-slate-200"}`}>Could not load workflows</p>
            <p className={`text-[12px] max-w-xs ${isLight ? "text-slate-400" : "text-slate-500"}`}>{error}</p>
            <button onClick={() => load(true)} className="mt-1 px-5 py-2 rounded-xl text-[12.5px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm">Try again</button>
          </div>
        ) : (!active || loading) ? (
          <div className="p-8 space-y-3">
            {[70,50,80,40,65].map((w,i) => (
              <div key={i} className={`h-3.5 rounded-full animate-pulse ${isLight ? "bg-slate-200" : "bg-[#152036]/70"}`} style={{width:`${w}%`}}/>
            ))}
          </div>
        ) : (
          <div className="px-8 py-7">

            {/* Partial-load notice — only shown when Docs API not working */}
            {partial && (
              <div className={`mb-6 flex items-start gap-3 px-4 py-3.5 rounded-2xl border text-[12.5px] ${
                isLight ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-amber-950/20 border-amber-800/30 text-amber-300"
              }`}>
                <Info className="w-4 h-4 shrink-0 mt-0.5"/>
                <span>
                  Showing <strong>{workflows.length}</strong> of <strong>{TOTAL}</strong> workflows. Enable the{" "}
                  <strong>Google Docs API</strong> in project <code className="font-mono text-[11px] px-1 py-0.5 rounded bg-amber-200/50">gen-lang-client-0190927685</code> (your portal's OAuth project), then hit Refresh.{" "}
                  <a href="https://console.cloud.google.com/apis/library/docs.googleapis.com?project=gen-lang-client-0190927685"
                    target="_blank" rel="noreferrer"
                    className={`underline underline-offset-2 font-medium ${isLight ? "text-amber-700" : "text-amber-400"}`}>
                    Enable it here →
                  </a>
                </span>
              </div>
            )}

            {/* Workflow header */}
            <div className={`mb-7 flex items-center gap-4 p-5 rounded-2xl border ${
              isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#0c1628] border-[#1a3154]"
            }`}>
              <div className={`p-3 rounded-xl ${isLight ? "bg-slate-100" : "bg-[#152036]"} ${accentCls}`}>
                {meta?.icon ?? <FileText className="w-5 h-5"/>}
              </div>
              <div>
                <h1 className={`text-[21px] font-bold tracking-tight leading-tight ${isLight ? "text-slate-900" : "text-white"}`}>{active.title}</h1>
                {meta?.desc && <p className={`text-[13px] mt-0.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>{meta.desc}</p>}
              </div>
            </div>

            {/* Content */}
            <div>
              {enriched.map((s,i) => renderSec(s, i, isLight, accentCls))}
            </div>

            {enriched.length === 0 && (
              <div className={`flex flex-col items-center py-20 gap-3 text-center ${isLight ? "text-slate-300" : "text-slate-700"}`}>
                <FileText className="w-8 h-8 opacity-40"/>
                <p className="text-[13px]">No content for this workflow yet.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
