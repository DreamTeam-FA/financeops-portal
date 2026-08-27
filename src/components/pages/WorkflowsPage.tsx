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

// ── Workflow metadata ──────────────────────────────────────────────────────────
const META: Record<string, { icon: React.ReactNode; desc: string; color: string; pill: string }> = {
  "invoice-to-clients":        { icon: <Receipt className="w-[18px] h-[18px]" />, desc: "Invoicing process for all client entities", color: "text-blue-400", pill: "bg-blue-500/15 border-blue-500/25" },
  "accounts-receivable":       { icon: <TrendingUp className="w-[18px] h-[18px]" />, desc: "Tracking and collecting incoming payments", color: "text-emerald-400", pill: "bg-emerald-500/15 border-emerald-500/25" },
  "reimbursements":            { icon: <DollarSign className="w-[18px] h-[18px]" />, desc: "Employee and vendor reimbursement workflow", color: "text-amber-400", pill: "bg-amber-500/15 border-amber-500/25" },
  "accounts-payable":          { icon: <Banknote className="w-[18px] h-[18px]" />, desc: "Bill processing, approval, and payment", color: "text-rose-400", pill: "bg-rose-500/15 border-rose-500/25" },
  "qbo-clarifications":        { icon: <Calculator className="w-[18px] h-[18px]" />, desc: "QuickBooks Online transaction clarification", color: "text-violet-400", pill: "bg-violet-500/15 border-violet-500/25" },
  "transfers":                 { icon: <Repeat className="w-[18px] h-[18px]" />, desc: "Inter-entity and bank transfer procedures", color: "text-cyan-400", pill: "bg-cyan-500/15 border-cyan-500/25" },
  "ruby-s-usu-fta-report":     { icon: <BarChart3 className="w-[18px] h-[18px]" />, desc: "Ruby's USU Food and Tobacco Adjustment report", color: "text-orange-400", pill: "bg-orange-500/15 border-orange-500/25" },
  "ruby-s-toast-recon-report": { icon: <FileSpreadsheet className="w-[18px] h-[18px]" />, desc: "Ruby's Toast POS reconciliation report", color: "text-pink-400", pill: "bg-pink-500/15 border-pink-500/25" },
  "cpro-reports":              { icon: <ClipboardList className="w-[18px] h-[18px]" />, desc: "CurcuminPRO financial reporting", color: "text-teal-400", pill: "bg-teal-500/15 border-teal-500/25" },
  "ziglar-reports":            { icon: <Building2 className="w-[18px] h-[18px]" />, desc: "Ziglar entity reporting and reconciliation", color: "text-indigo-400", pill: "bg-indigo-500/15 border-indigo-500/25" },
};

// ── Inline markdown ───────────────────────────────────────────────────────────
function renderMd(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIdx = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    if (m[2]) parts.push(<strong key={k++} className="font-bold italic">{m[2]}</strong>);
    else if (m[3]) parts.push(<strong key={k++} className="font-semibold">{m[3]}</strong>);
    else if (m[4]) parts.push(<em key={k++}>{m[4]}</em>);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

// ── Pipeline detection (strict) ───────────────────────────────────────────────
// Data table signals — if ANY header contains these, it's a data table, not a pipeline
const DATA_SIGNALS = ["date", "amount", "remarks", "company", "client", "name", "description", "due", "balance", "total", "invoice #", "ref", "rate", "qty", "quantity"];
const STAGE_KEYWORDS = ["instruction", "approval", "qbo", "generation", "send for", "send to", "payment", "assign", "logging", "matching", "report gen", "billing"];

function isPipeline(rows: string[][]): boolean {
  if (!rows?.length || rows[0].length < 2 || rows[0].length > 6) return false;
  const hdr = rows[0].join(" ").toLowerCase();
  if (DATA_SIGNALS.some(s => hdr.includes(s))) return false;
  return STAGE_KEYWORDS.filter(k => hdr.includes(k)).length >= 2;
}

// ── Numbered step grouper ─────────────────────────────────────────────────────
function groupSteps(secs: WorkflowSection[]) {
  const out: any[] = [];
  let i = 0;
  while (i < secs.length) {
    const s = secs[i];
    if (s.type === "paragraph" && /^\d+[\.\)]\s/.test(s.text || "")) {
      const steps: { text: string }[] = [];
      while (i < secs.length && secs[i].type === "paragraph" && /^\d+[\.\)]\s/.test(secs[i].text || "")) {
        const m = (secs[i].text || "").match(/^\d+[\.\)]\s+([\s\S]*)$/);
        steps.push({ text: m ? m[1] : secs[i].text || "" });
        i++;
      }
      out.push({ type: "steps", steps });
    } else { out.push(s); i++; }
  }
  return out;
}

// ── Section components ────────────────────────────────────────────────────────

// Pipeline flow (role assignment table)
const PipelineFlow: React.FC<{ rows: string[][]; isLight: boolean; accentColor: string }> = ({ rows, isLight, accentColor }) => {
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  return (
    <div className={`mb-6 rounded-2xl overflow-hidden border ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#0c1628] border-[#1a3154]"}`}>
      {/* Stage header row */}
      <div className={`px-5 py-4 border-b ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#0a1422] border-[#1a3154]"}`}>
        <div className="flex items-center gap-0">
          {headers.map((h, i) => (
            <React.Fragment key={i}>
              <div className={`flex-1 text-center px-2 py-2 rounded-xl border ${
                isLight ? "bg-white border-blue-100" : "bg-[#0d1e3a] border-[#1e3a5f]"
              }`}>
                <p className={`text-[10px] font-bold uppercase tracking-[0.1em] leading-tight ${
                  isLight ? "text-blue-600" : `${accentColor}`
                }`}>{h}</p>
              </div>
              {i < headers.length - 1 && (
                <ArrowRight className={`shrink-0 w-4 h-4 mx-1 ${isLight ? "text-slate-300" : "text-slate-700"}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      {/* Data rows */}
      {dataRows.map((row, ri) => (
        <div key={ri} className={`px-5 py-3.5 flex items-center gap-0 border-b last:border-0 ${
          isLight ? "border-slate-100" : "border-[#1a3154]/50"
        }`}>
          {headers.map((_, ci) => {
            const cell = (row[ci] || "").trim();
            return (
              <React.Fragment key={ci}>
                <div className="flex-1 text-center px-2">
                  {cell
                    ? <span className={`text-[13px] font-medium ${isLight ? "text-slate-800" : "text-slate-100"}`}>{renderMd(cell)}</span>
                    : <span className={`text-[12px] ${isLight ? "text-slate-300" : "text-[#2a3f5f]"}`}>—</span>
                  }
                </div>
                {ci < headers.length - 1 && (
                  <div className={`shrink-0 w-px h-5 mx-1 ${isLight ? "bg-slate-200" : "bg-[#1a3154]"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// Data table
const DataTable: React.FC<{ rows: string[][]; isLight: boolean }> = ({ rows, isLight }) => {
  if (!rows.length) return null;
  const header = rows[0];
  const body = rows.slice(1);
  return (
    <div className={`mb-6 rounded-2xl overflow-hidden border ${isLight ? "border-slate-200 shadow-sm" : "border-[#1a3154]"}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] border-collapse">
          <thead>
            <tr className={isLight ? "bg-[#eef3ff]" : "bg-[#0a1422]"}>
              {header.map((cell, i) => (
                <th key={i} className={`px-4 py-3 text-left font-semibold whitespace-nowrap border-b ${
                  isLight ? "text-[#1a4bbf] border-[#dde7ff]" : "text-blue-300 border-[#1a3154]"
                }`}>{renderMd(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className={`border-b last:border-0 group transition-colors ${
                isLight
                  ? `border-slate-100 ${ri % 2 === 0 ? "bg-white" : "bg-slate-50/70"} hover:bg-blue-50/40`
                  : `border-[#1a3154]/40 ${ri % 2 === 0 ? "bg-transparent" : "bg-[#0a1422]/50"} hover:bg-[#0d1e3a]/60`
              }`}>
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-4 py-3 align-top leading-relaxed ${
                    isLight ? "text-slate-700" : "text-slate-300"
                  }`}>
                    {cell.trim() ? renderMd(cell) : <span className={isLight ? "text-slate-300" : "text-[#2a3f5f]"}>—</span>}
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

// Numbered step cards
const StepCards: React.FC<{ steps: { text: string }[]; isLight: boolean; accentColor: string }> = ({ steps, isLight, accentColor }) => (
  <div className="mb-5 space-y-2.5">
    {steps.map((step, i) => (
      <div key={i} className={`flex gap-4 items-start px-4 py-3.5 rounded-xl border transition-colors ${
        isLight
          ? "bg-white border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 shadow-sm"
          : "bg-[#0c1628]/70 border-[#1a3154]/60 hover:border-[#1e3a5f] hover:bg-[#0d1e3a]/60"
      }`}>
        <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm ${
          isLight ? "bg-blue-600 shadow-blue-200" : "bg-blue-700 shadow-blue-900/50"
        }`}>{i + 1}</span>
        <p className={`text-[13px] leading-relaxed flex-1 pt-px ${isLight ? "text-slate-700" : "text-slate-200"}`}>
          {renderMd(step.text)}
        </p>
      </div>
    ))}
  </div>
);

// Callout (Goal / Note / Important)
const Callout: React.FC<{ text: string; isLight: boolean }> = ({ text, isLight }) => (
  <div className={`mb-4 px-4 py-3 rounded-xl border-l-[3px] ${
    isLight
      ? "bg-amber-50 border-amber-400 text-amber-900"
      : "bg-amber-950/20 border-amber-500/70 text-amber-200"
  }`}>
    <p className="text-[13px] leading-relaxed">{renderMd(text)}</p>
  </div>
);

// ── Section renderer ──────────────────────────────────────────────────────────
function renderSection(sec: any, i: number, isLight: boolean, accentColor: string): React.ReactNode {
  switch (sec.type) {
    case "steps":
      return <StepCards key={i} steps={sec.steps} isLight={isLight} accentColor={accentColor} />;

    case "table":
      return isPipeline(sec.rows || [])
        ? <PipelineFlow key={i} rows={sec.rows} isLight={isLight} accentColor={accentColor} />
        : <DataTable key={i} rows={sec.rows} isLight={isLight} />;

    case "h1":
      return (
        <h2 key={i} className={`text-[15px] font-bold mt-8 mb-3 ${isLight ? "text-slate-800" : "text-white"}`}>
          {renderMd(sec.text || "")}
        </h2>
      );

    case "h2":
      return (
        <div key={i} className="flex items-center gap-3 mt-7 mb-3">
          <span className={`h-px flex-1 ${isLight ? "bg-slate-200" : "bg-[#1a3154]"}`} />
          <span className={`text-[10.5px] font-bold uppercase tracking-[0.1em] ${isLight ? "text-slate-400" : "text-slate-500"}`}>
            {renderMd(sec.text || "")}
          </span>
          <span className={`h-px flex-1 ${isLight ? "bg-slate-200" : "bg-[#1a3154]"}`} />
        </div>
      );

    case "h3":
      return (
        <h4 key={i} className={`text-[13.5px] font-semibold mt-5 mb-2 ${isLight ? "text-slate-700" : "text-slate-200"}`}>
          {renderMd(sec.text || "")}
        </h4>
      );

    case "paragraph": {
      const text = sec.text || "";
      if (!text.trim() || text === "**") return null;
      if (/^(goal|note|important|reminder):/i.test(text)) return <Callout key={i} text={text} isLight={isLight} />;
      return (
        <p key={i} className={`text-[13px] leading-relaxed mb-3 ${isLight ? "text-slate-600" : "text-slate-300"}`}>
          {renderMd(text)}
        </p>
      );
    }

    case "list":
      return (
        <ul key={i} className="mb-4 space-y-2">
          {(sec.items || []).map((item: string, li: number) => (
            <li key={li} className={`flex items-start gap-3 text-[13px] ${isLight ? "text-slate-600" : "text-slate-300"}`}>
              <span className={`mt-[5px] shrink-0 w-1.5 h-1.5 rounded-full ${isLight ? "bg-blue-400" : "bg-blue-600"}`} />
              {renderMd(item)}
            </li>
          ))}
        </ul>
      );

    default:
      return null;
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export const WorkflowsPage: React.FC = () => {
  const { theme, googleUser } = useFinance();
  const isLight = theme === "light";

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const TOTAL = 10;

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const token = (typeof window !== "undefined" ? localStorage.getItem("google_access_token") : "") || (googleUser as any)?.accessToken || "";
      const qs = token ? `?userAccessToken=${encodeURIComponent(token)}` : "";
      const bust = force ? `${qs ? "&" : "?"}bust=${Date.now()}` : "";
      const resp = await fetch(`/api/workflows${qs}${bust}`);
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      const wfs: Workflow[] = data.workflows || [];
      setWorkflows(wfs);
      setCached(!!data.cached);
      setLastFetched(new Date());
      if (wfs.length > 0 && !activeId) setActiveId(wfs[0].id);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [googleUser, activeId]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  const active = workflows.find(w => w.id === activeId);
  const meta = activeId ? META[activeId] : undefined;
  const enriched = active ? groupSteps(active.sections) : [];
  const accentColor = meta?.color || "text-blue-400";
  const partial = workflows.length > 0 && workflows.length < TOTAL;

  return (
    <div className={`flex h-full overflow-hidden ${isLight ? "bg-[#f5f7fc]" : "bg-[#060c18]"}`}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={`w-[220px] shrink-0 flex flex-col border-r ${
        isLight ? "bg-white border-slate-200" : "bg-[#070d1c] border-[#152036]"
      }`}>

        <div className={`px-4 pt-5 pb-3.5 border-b ${isLight ? "border-slate-100" : "border-[#152036]"}`}>
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isLight ? "bg-blue-50" : "bg-blue-950/50"}`}>
              <BookOpen className={`w-3.5 h-3.5 ${isLight ? "text-blue-600" : "text-blue-400"}`} />
            </div>
            <div>
              <p className={`text-[12.5px] font-bold ${isLight ? "text-slate-800" : "text-white"}`}>Workflows</p>
              <p className={`text-[10px] ${isLight ? "text-slate-400" : "text-slate-600"}`}>Standard operating procedures</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {loading && workflows.length === 0
            ? Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={`h-8 rounded-lg mb-1 animate-pulse ${isLight ? "bg-slate-100" : "bg-[#152036]/60"}`} />
              ))
            : workflows.map(wf => {
                const m = META[wf.id];
                const isActive = wf.id === activeId;
                return (
                  <button key={wf.id} onClick={() => setActiveId(wf.id)} className={`w-full text-left px-2.5 py-[7px] flex items-center gap-2.5 rounded-lg mb-[1px] text-[12px] transition-all ${
                    isActive
                      ? isLight
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "bg-[#0d1f3a] text-blue-300 font-semibold"
                      : isLight
                        ? "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                        : "text-slate-500 hover:bg-[#0d1525]/70 hover:text-slate-300"
                  }`}>
                    <span className={`shrink-0 ${m?.color || "text-slate-400"} ${isActive ? "" : "opacity-50"}`}>
                      {m?.icon ?? <FileText className="w-4 h-4" />}
                    </span>
                    <span className="flex-1 leading-snug">{wf.title}</span>
                    {isActive && <ChevronRight className={`w-3 h-3 shrink-0 ${isLight ? "text-blue-300" : "text-blue-700"}`} />}
                  </button>
                );
              })
          }
        </nav>

        <div className={`px-3 py-2.5 border-t ${isLight ? "border-slate-100" : "border-[#152036]"}`}>
          <button onClick={() => load(true)} disabled={loading} className={`w-full flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded-lg transition-all ${
            isLight ? "text-slate-400 hover:text-blue-600 hover:bg-blue-50" : "text-slate-600 hover:text-blue-400 hover:bg-[#0d1e3a]/50"
          }`}>
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : cached ? "Refresh (cached)" : "Refresh"}
          </button>
          {lastFetched && !loading && (
            <p className={`text-center text-[10px] mt-0.5 ${isLight ? "text-slate-300" : "text-slate-700"}`}>
              {lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </aside>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">

        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <div className={`p-3 rounded-2xl ${isLight ? "bg-rose-50" : "bg-rose-950/30"}`}>
              <AlertCircle className={`w-7 h-7 ${isLight ? "text-rose-400" : "text-rose-500"}`} />
            </div>
            <p className={`text-sm font-semibold ${isLight ? "text-slate-700" : "text-slate-200"}`}>Could not load workflows</p>
            <p className={`text-[12px] max-w-xs ${isLight ? "text-slate-400" : "text-slate-500"}`}>{error}</p>
            <button onClick={() => load(true)} className="mt-1 px-5 py-2 rounded-xl text-[12.5px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm">
              Try again
            </button>
          </div>
        ) : (!active || loading) ? (
          <div className="p-8 space-y-3">
            {[75, 50, 85, 40, 65].map((w, i) => (
              <div key={i} className={`h-3.5 rounded-full animate-pulse ${isLight ? "bg-slate-200" : "bg-[#152036]/70"}`} style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <div className="px-8 py-7">

            {/* Partial-load notice */}
            {partial && (
              <div className={`mb-6 flex items-start gap-3 px-4 py-3.5 rounded-2xl border text-[12.5px] ${
                isLight ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-amber-950/20 border-amber-800/30 text-amber-300"
              }`}>
                <Info className="w-4 h-4 shrink-0 mt-0.5 opacity-80" />
                <span>
                  Showing <strong>{workflows.length}</strong> of <strong>{TOTAL}</strong> workflows — the other tabs require the{" "}
                  <strong>Google Docs API</strong> enabled in the same Cloud project as your OAuth client.{" "}
                  <a href="https://console.cloud.google.com/apis/library/docs.googleapis.com" target="_blank" rel="noreferrer"
                    className={`underline underline-offset-2 font-medium ${isLight ? "text-amber-700" : "text-amber-400"}`}>
                    Enable it here
                  </a>, then hit Refresh.
                </span>
              </div>
            )}

            {/* Workflow header */}
            <div className={`mb-7 p-6 rounded-2xl border ${meta ? `${meta.pill} border-opacity-50` : isLight ? "bg-white border-slate-200" : "bg-[#0c1628] border-[#1a3154]"}`}>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl border ${meta ? `${meta.pill}` : ""} ${meta?.color || "text-blue-400"}`}>
                  <div className="w-6 h-6 flex items-center justify-center">
                    {meta?.icon ?? <FileText className="w-5 h-5" />}
                  </div>
                </div>
                <div>
                  <h1 className={`text-[22px] font-bold tracking-tight leading-tight ${isLight ? "text-slate-900" : "text-white"}`}>
                    {active.title}
                  </h1>
                  {meta?.desc && (
                    <p className={`text-[13px] mt-0.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>{meta.desc}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Content sections */}
            <div>
              {enriched.map((s, i) => renderSection(s, i, isLight, accentColor))}
            </div>

            {enriched.length === 0 && (
              <div className={`flex flex-col items-center py-20 gap-3 text-center ${isLight ? "text-slate-300" : "text-slate-700"}`}>
                <FileText className="w-8 h-8 opacity-40" />
                <p className="text-[13px]">No content for this workflow yet.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
