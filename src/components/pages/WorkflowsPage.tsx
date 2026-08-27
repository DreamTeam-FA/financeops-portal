import React, { useState, useEffect, useCallback } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  BookOpen, ChevronRight, RefreshCw, AlertCircle, FileText,
  ArrowRight, Receipt, TrendingUp, DollarSign, Banknote,
  Calculator, Repeat, BarChart3, FileSpreadsheet, ClipboardList,
  Building2, Info, AlertTriangle, ExternalLink,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WorkflowSection {
  type: "h1" | "h2" | "h3" | "paragraph" | "list" | "table" | "image" | "file-link";
  text?: string;
  items?: string[];
  rows?: string[][];
  src?: string;
  url?: string;
  note?: string;
}
interface Workflow { id: string; title: string; sections: WorkflowSection[] }

// ── Metadata ──────────────────────────────────────────────────────────────────
const META: Record<string, {
  icon: React.ReactNode;
  desc: string;
  accent: string;
  bg: string;
  bgDark: string;
}> = {
  "invoice-to-clients":        { icon: <Receipt className="w-5 h-5"/>, desc: "Invoicing process for all client entities", accent: "#3b82f6", bg: "#eff6ff", bgDark: "#0d1f3c" },
  "accounts-receivable":       { icon: <TrendingUp className="w-5 h-5"/>, desc: "Tracking and collecting incoming client payments", accent: "#10b981", bg: "#ecfdf5", bgDark: "#0d2a1e" },
  "reimbursements":            { icon: <DollarSign className="w-5 h-5"/>, desc: "Employee and vendor reimbursement workflow", accent: "#f59e0b", bg: "#fffbeb", bgDark: "#2a1f0a" },
  "accounts-payable":          { icon: <Banknote className="w-5 h-5"/>, desc: "Bill processing, approval, and payment", accent: "#ef4444", bg: "#fef2f2", bgDark: "#2a0d0d" },
  "qbo-clarifications":        { icon: <Calculator className="w-5 h-5"/>, desc: "QuickBooks Online transaction clarification", accent: "#8b5cf6", bg: "#f5f3ff", bgDark: "#1a0f2e" },
  "transfers":                 { icon: <Repeat className="w-5 h-5"/>, desc: "Inter-entity and bank transfer procedures", accent: "#06b6d4", bg: "#ecfeff", bgDark: "#0a1f22" },
  "ruby-s-usu-fta-report":     { icon: <BarChart3 className="w-5 h-5"/>, desc: "Ruby's USU Food and Tobacco Adjustment report", accent: "#f97316", bg: "#fff7ed", bgDark: "#2a1200" },
  "ruby-s-toast-recon-report": { icon: <FileSpreadsheet className="w-5 h-5"/>, desc: "Ruby's Toast POS reconciliation report", accent: "#ec4899", bg: "#fdf2f8", bgDark: "#2a0e1f" },
  "cpro-reports":              { icon: <ClipboardList className="w-5 h-5"/>, desc: "CurcuminPRO financial reporting", accent: "#14b8a6", bg: "#f0fdfa", bgDark: "#0a2220" },
  "ziglar-reports":            { icon: <Building2 className="w-5 h-5"/>, desc: "Ziglar entity reporting and reconciliation", accent: "#6366f1", bg: "#eef2ff", bgDark: "#0f1228" },
};

// ── Inline markdown renderer ───────────────────────────────────────────────────
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

// ── Pipeline detection ─────────────────────────────────────────────────────────
const DATA_SIGNALS = ["date", "amount", "remarks", "description", "due date", "balance", "total", "invoice #", "ref #", "rate", "qty", "quantity"];
const STAGE_SIGNALS = ["instruction", "approval", "qbo", "generation", "send for", "send to", "payment", "assign", "logging", "matching", "report gen", "billing", "report"];

function isDiagram(rows: string[][]): boolean {
  if (!rows?.length || rows[0].length < 2 || rows[0].length > 8) return false;
  const cells = rows[0].map(c => c.toLowerCase().trim());
  if (cells.some(c => DATA_SIGNALS.some(s => c === s || c.startsWith(s)))) return false;
  const stageHits = cells.filter(c => STAGE_SIGNALS.some(k => c.includes(k))).length;
  return stageHits >= Math.min(2, cells.length);
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

// ── Workflow Diagram ──────────────────────────────────────────────────────────
const WorkflowDiagram: React.FC<{ rows: string[][]; isLight: boolean; accent: string }> = ({ rows, isLight, accent }) => {
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  return (
    <div className="mb-8 mt-2">
      <div className="overflow-x-auto pb-3">
        <div className="flex items-stretch gap-0 min-w-max">
          {headers.map((header, i) => {
            const persons = dataRows.map(r => (r[i] || "").trim()).filter(Boolean);
            return (
              <React.Fragment key={i}>
                <div className={`relative flex flex-col w-44 rounded-2xl overflow-hidden border transition-all duration-200 ${
                  isLight
                    ? "bg-white border-slate-200 hover:border-slate-300 hover:shadow-md"
                    : "bg-[#0d1a2e] border-[#1e3457] hover:border-[#2a4a7f]"
                }`} style={{ boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.06)" : "0 2px 12px rgba(0,0,0,0.3)" }}>
                  {/* Accent top bar */}
                  <div className="h-[3px] w-full" style={{ background: accent }} />
                  {/* Header */}
                  <div className={`px-3.5 pt-3 pb-2 border-b ${isLight ? "border-slate-100" : "border-[#1e3457]"}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ background: accent }}>{i + 1}</span>
                      <span className={`text-[9px] font-extrabold uppercase tracking-[0.12em] leading-tight ${
                        isLight ? "text-slate-400" : "text-slate-500"
                      }`}>{header}</span>
                    </div>
                  </div>
                  {/* Person */}
                  <div className="px-3.5 py-4 flex-1 flex flex-col items-center justify-center text-center gap-1">
                    {persons.length > 0
                      ? persons.map((p, pi) => (
                          <span key={pi} className={`text-[14px] font-bold leading-tight block ${
                            isLight ? "text-slate-800" : "text-white"
                          }`}>{renderMd(p)}</span>
                        ))
                      : <span className={`text-[12px] ${isLight ? "text-slate-300" : "text-[#334]"}`}>—</span>
                    }
                  </div>
                </div>
                {i < headers.length - 1 && (
                  <div className="flex items-center self-center mx-1">
                    <div className="h-px w-4" style={{ background: isLight ? "#cbd5e1" : "#1e3457" }} />
                    <ArrowRight className="w-3.5 h-3.5 -ml-1" style={{ color: isLight ? "#94a3b8" : "#1e3457" }} />
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

// ── Data Table ────────────────────────────────────────────────────────────────
const DataTable: React.FC<{ rows: string[][]; isLight: boolean; accent: string }> = ({ rows, isLight, accent }) => {
  if (!rows.length) return null;
  const [header, ...body] = rows;
  const accentLight = accent + "18"; // 10% opacity
  return (
    <div className={`mb-7 rounded-2xl border overflow-x-auto ${isLight ? "border-slate-200" : "border-[#1e3457]"}`}
      style={{ boxShadow: isLight ? "0 1px 6px rgba(0,0,0,0.06)" : "none" }}>
        <table className="text-[12.5px] border-collapse" style={{ minWidth: "100%", tableLayout: "auto", borderRadius: "1rem", overflow: "hidden" }}>
          <thead>
            <tr>
              {header.map((c, i) => (
                <th key={i} className={`px-4 py-3 text-left text-[10.5px] font-extrabold uppercase tracking-[0.09em] whitespace-nowrap border-b ${
                  isLight ? "border-slate-200" : "border-[#1e3457]"
                }`} style={{ background: isLight ? accentLight : "#070f1c", color: accent }}>
                  {renderMd(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className={`border-b last:border-0 transition-colors ${
                isLight
                  ? `border-slate-100 ${ri % 2 === 0 ? "bg-white" : "bg-slate-50/70"} hover:bg-blue-50/30`
                  : `border-[#1e3457]/40 ${ri % 2 === 0 ? "bg-transparent" : "bg-[#060d1a]/60"} hover:bg-[#0d1a2e]`
              }`}>
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-4 py-3 align-top leading-relaxed min-w-[120px] max-w-[300px] ${
                    isLight ? "text-slate-700" : "text-slate-300"
                  }`}>
                    {cell.trim() ? renderMd(cell) : <span className={isLight ? "text-slate-300" : "text-[#1e3457]"}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  );
};

// ── Step cards ────────────────────────────────────────────────────────────────
const StepCards: React.FC<{ steps: { text: string }[]; isLight: boolean; accent: string }> = ({ steps, isLight, accent }) => (
  <div className="mb-6 space-y-2.5">
    {steps.map((step, i) => (
      <div key={i} className={`flex gap-4 items-start px-4 py-3.5 rounded-xl border transition-colors ${
        isLight
          ? "bg-white border-slate-200 hover:border-slate-300"
          : "bg-[#0d1a2e]/70 border-[#1e3457]/60 hover:border-[#1e3457]"
      }`} style={{ boxShadow: isLight ? "0 1px 4px rgba(0,0,0,0.05)" : "none" }}>
        <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white mt-px"
          style={{ background: accent }}>{i + 1}</span>
        <p className={`text-[13.5px] leading-[1.65] flex-1 ${isLight ? "text-slate-700" : "text-slate-200"}`}>
          {renderMd(step.text)}
        </p>
      </div>
    ))}
  </div>
);

// ── Section renderer ──────────────────────────────────────────────────────────
function renderSec(sec: any, i: number, isLight: boolean, accent: string): React.ReactNode {
  switch (sec.type) {
    case "steps":
      return <StepCards key={i} steps={sec.steps} isLight={isLight} accent={accent} />;

    case "table":
      return isDiagram(sec.rows || [])
        ? <WorkflowDiagram key={i} rows={sec.rows} isLight={isLight} accent={accent} />
        : <DataTable key={i} rows={sec.rows} isLight={isLight} accent={accent} />;

    case "h1":
      return (
        <h2 key={i} className={`text-[16px] font-bold mt-10 mb-3 tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
          {renderMd(sec.text || "")}
        </h2>
      );

    case "h2":
      return (
        <div key={i} className="flex items-center gap-3 mt-8 mb-4">
          <div className="h-px flex-1" style={{ background: isLight ? "#e2e8f0" : "#1e3457" }} />
          <span className={`px-3 py-1 rounded-full text-[9.5px] font-extrabold uppercase tracking-[0.12em] border ${
            isLight ? "border-slate-200 bg-slate-50 text-slate-500" : "border-[#1e3457] bg-[#0d1a2e] text-slate-500"
          }`}>{renderMd(sec.text || "")}</span>
          <div className="h-px flex-1" style={{ background: isLight ? "#e2e8f0" : "#1e3457" }} />
        </div>
      );

    case "h3":
      return (
        <h4 key={i} className={`text-[13px] font-bold mt-6 mb-2 uppercase tracking-[0.07em] ${
          isLight ? "text-slate-500" : "text-slate-500"
        }`} style={{ color: accent }}>{renderMd(sec.text || "")}</h4>
      );

    case "paragraph": {
      const t = sec.text || "";
      if (!t.trim() || /^\*+$/.test(t.trim()) || /^[\*\-_]{2,}$/.test(t.trim())) return null;
      const isCallout = /^(note|important|reminder|warning):/i.test(t);
      if (isCallout) {
        return (
          <div key={i} className={`mb-4 flex gap-3 px-4 py-3.5 rounded-xl border-l-[3px]`}
            style={{
              background: isLight ? "#fffbeb" : "#1a1400",
              borderLeftColor: "#f59e0b",
            }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <p className={`text-[13px] leading-relaxed ${isLight ? "text-amber-900" : "text-amber-200"}`}>{renderMd(t)}</p>
          </div>
        );
      }
      return (
        <p key={i} className={`text-[13.5px] leading-[1.7] mb-3.5 ${isLight ? "text-slate-600" : "text-slate-300"}`}>
          {renderMd(t)}
        </p>
      );
    }

    case "list":
      return (
        <ul key={i} className="mb-5 space-y-2">
          {(sec.items || []).map((item: string, li: number) => (
            <li key={li} className={`flex items-start gap-3 text-[13.5px] leading-[1.65] ${isLight ? "text-slate-600" : "text-slate-300"}`}>
              <span className="mt-[7px] shrink-0 w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: accent }} />
              <span>{renderMd(item)}</span>
            </li>
          ))}
        </ul>
      );

    case "image":
      return sec.src ? (
        <div key={i} className={`mb-6 rounded-2xl overflow-hidden border ${isLight ? "border-slate-200" : "border-[#1e3457]"}`}
          style={{ boxShadow: isLight ? "0 2px 12px rgba(0,0,0,0.08)" : "none" }}>
          <img
            src={sec.src}
            alt="Workflow screenshot"
            className="max-w-full block"
            style={{ maxHeight: "560px", objectFit: "contain", width: "100%" }}
            onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
          />
        </div>
      ) : null;

    case "file-link": {
      const isSheet = (sec.url || "").includes("spreadsheets");
      const isDoc = (sec.url || "").includes("/document");
      const fileLabel = isSheet ? "Google Sheet" : isDoc ? "Google Doc" : "File";
      return (
        <div key={i} className={`mt-8 mb-3 pb-3 border-b ${isLight ? "border-slate-100" : "border-[#1e3457]"}`}>
          <a
            href={sec.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2.5 w-fit"
          >
            <span
              className="flex items-center gap-1.5 text-[14px] font-bold tracking-tight hover:underline underline-offset-2 transition-colors"
              style={{ color: accent }}
            >
              <ExternalLink size={14} className="shrink-0 opacity-70 group-hover:opacity-100" />
              {sec.text || ""}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
              isLight ? "bg-slate-100 text-slate-400" : "bg-[#0d1a2e] text-slate-500"
            }`}>{fileLabel}</span>
          </a>
          {sec.note && (
            <p className={`mt-1.5 ml-[22px] text-[12px] leading-relaxed italic ${isLight ? "text-slate-400" : "text-slate-500"}`}>
              {sec.note}
            </p>
          )}
        </div>
      );
    }

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
  const accent = meta?.accent || "#3b82f6";
  const enriched = active ? groupSteps(active.sections) : [];
  const partial = workflows.length > 0 && workflows.length < TOTAL;

  return (
    <div className={`flex h-full overflow-hidden ${isLight ? "bg-[#f8fafc]" : "bg-[#050c18]"}`}>

      {/* ── Left Sidebar ── */}
      <aside className={`w-[220px] shrink-0 flex flex-col border-r ${
        isLight ? "bg-white border-slate-200" : "bg-[#070d1c] border-[#132035]"
      }`}>
        {/* Header */}
        <div className={`px-4 pt-5 pb-4 border-b ${isLight ? "border-slate-100" : "border-[#132035]"}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg" style={{ background: isLight ? "#eff6ff" : "#0d1f3c" }}>
              <BookOpen className="w-3.5 h-3.5" style={{ color: "#3b82f6" }} />
            </div>
            <div>
              <p className={`text-[12.5px] font-bold leading-none tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
                Workflows
              </p>
              <p className={`text-[10px] mt-0.5 font-medium ${isLight ? "text-slate-400" : "text-slate-600"}`}>
                SOPs · {source === "docs-api" ? "live" : cached ? "synced" : "loading"}
              </p>
            </div>
          </div>
        </div>

        {/* Nav list */}
        <nav className="flex-1 overflow-y-auto py-2.5 px-2">
          {loading && !workflows.length
            ? Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={`h-8 rounded-xl mb-1.5 animate-pulse ${isLight ? "bg-slate-100" : "bg-[#132035]/60"}`} />
              ))
            : workflows.map(wf => {
                const m = META[wf.id];
                const isActive = wf.id === activeId;
                return (
                  <button key={wf.id} onClick={() => setActiveId(wf.id)}
                    className={`w-full text-left px-2.5 py-2 flex items-center gap-2.5 rounded-xl mb-px text-[12px] font-medium transition-all ${
                      isActive
                        ? isLight ? "text-blue-700 font-semibold" : "text-blue-300 font-semibold"
                        : isLight ? "text-slate-500 hover:bg-slate-50 hover:text-slate-700" : "text-slate-600 hover:bg-[#0d1525] hover:text-slate-400"
                    }`}
                    style={isActive ? { background: isLight ? "#eff6ff" : "#0d1f3c" } : undefined}>
                    <span className="shrink-0" style={{ color: isActive ? (m?.accent || "#3b82f6") : undefined, opacity: isActive ? 1 : 0.5 }}>
                      {m?.icon ?? <FileText className="w-4 h-4" />}
                    </span>
                    <span className="flex-1 leading-snug">{wf.title}</span>
                    {isActive && <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />}
                  </button>
                );
              })
          }
        </nav>

        {/* Refresh footer */}
        <div className={`px-3 py-3 border-t ${isLight ? "border-slate-100" : "border-[#132035]"}`}>
          <button onClick={() => load(true)} disabled={loading}
            className={`w-full flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg transition-all ${
              isLight ? "text-slate-400 hover:text-blue-600 hover:bg-blue-50" : "text-slate-600 hover:text-blue-400 hover:bg-[#0d1f3c]/50"
            }`}>
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : cached ? "Refresh (cached)" : "Refresh"}
          </button>
          {lastFetched && !loading && (
            <p className={`text-center text-[10px] mt-0.5 ${isLight ? "text-slate-300" : "text-slate-700"}`}>
              {lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          <a
            href="https://docs.google.com/document/d/1McY0JUbJTqURmXtAWntos2pcl-Ttq9IMiV7aLnWHozc/edit"
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-2 w-full flex items-center justify-center gap-1.5 text-[10.5px] font-medium py-1.5 rounded-lg transition-all ${
              isLight ? "text-slate-400 hover:text-blue-600 hover:bg-blue-50" : "text-slate-600 hover:text-blue-400 hover:bg-[#0d1f3c]/50"
            }`}>
            <ExternalLink className="w-3 h-3" />
            Open Source Doc
          </a>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <div className={`p-3 rounded-2xl ${isLight ? "bg-rose-50" : "bg-rose-950/30"}`}>
              <AlertCircle className="w-7 h-7 text-rose-400" />
            </div>
            <p className={`text-sm font-semibold ${isLight ? "text-slate-700" : "text-slate-200"}`}>Could not load workflows</p>
            <p className={`text-[12px] max-w-xs ${isLight ? "text-slate-400" : "text-slate-500"}`}>{error}</p>
            <button onClick={() => load(true)} className="mt-1 px-5 py-2 rounded-xl text-[12.5px] font-semibold text-white transition-colors"
              style={{ background: "#3b82f6" }}>Try again</button>
          </div>
        ) : (!active || loading) ? (
          <div className="p-10 space-y-3 max-w-3xl">
            {[60, 80, 45, 70, 55].map((w, i) => (
              <div key={i} className={`h-3 rounded-full animate-pulse ${isLight ? "bg-slate-200" : "bg-[#132035]/70"}`}
                style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <div className="px-8 py-8 min-w-0">

            {/* Partial-load notice */}
            {partial && (
              <div className={`mb-7 flex items-start gap-3 px-4 py-3.5 rounded-xl text-[12.5px] border ${
                isLight ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-amber-950/20 border-amber-800/30 text-amber-300"
              }`}>
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Showing <strong>{workflows.length}</strong> of <strong>{TOTAL}</strong> workflows. Enable the{" "}
                  <strong>Google Docs API</strong> in project{" "}
                  <code className="text-[11px] px-1.5 py-0.5 rounded font-mono" style={{
                    background: isLight ? "#fef3c7" : "#2a1f00",
                  }}>gen-lang-client-0190927685</code>{" "}
                  (your portal's OAuth project), then hit Refresh.{" "}
                  <a href="https://console.cloud.google.com/apis/library/docs.googleapis.com?project=gen-lang-client-0190927685"
                    target="_blank" rel="noreferrer"
                    className="underline underline-offset-2 font-semibold">Enable it here →</a>
                </span>
              </div>
            )}

            {/* Workflow header */}
            <div className={`mb-8 flex items-center gap-4 p-5 rounded-2xl border ${
              isLight ? "bg-white border-slate-200" : "bg-[#0d1a2e] border-[#1e3457]"
            }`} style={{ boxShadow: isLight ? "0 2px 10px rgba(0,0,0,0.07)" : "none" }}>
              <div className="p-2.5 rounded-xl flex-shrink-0" style={{ background: (meta?.accent || "#3b82f6") + "18" }}>
                <span style={{ color: meta?.accent || "#3b82f6" }}>
                  {meta?.icon ?? <FileText className="w-5 h-5" />}
                </span>
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

            {/* Content sections */}
            <div>
              {enriched.map((s, i) => renderSec(s, i, isLight, accent))}
            </div>

            {enriched.length === 0 && (
              <div className={`flex flex-col items-center py-20 gap-3 ${isLight ? "text-slate-300" : "text-slate-700"}`}>
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
