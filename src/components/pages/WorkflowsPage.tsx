import React, { useState, useEffect, useCallback } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  BookOpen,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  FileText,
  ArrowRight,
  Receipt,
  TrendingUp,
  DollarSign,
  Banknote,
  Calculator,
  Repeat,
  BarChart3,
  FileSpreadsheet,
  ClipboardList,
  Building2,
  Info,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface WorkflowSection {
  type: "h1" | "h2" | "h3" | "paragraph" | "list" | "table";
  text?: string;
  items?: string[];
  rows?: string[][];
}

interface Workflow {
  id: string;
  title: string;
  sections: WorkflowSection[];
}

// ── Workflow metadata ─────────────────────────────────────────────────────────
const WORKFLOW_META: Record<string, { icon: React.ReactNode; description: string; color: string; bg: string }> = {
  "invoice-to-clients": {
    icon: <Receipt className="w-5 h-5" />,
    description: "End-to-end invoicing process for all client entities",
    color: "text-blue-400", bg: "bg-blue-500/10",
  },
  "accounts-receivable": {
    icon: <TrendingUp className="w-5 h-5" />,
    description: "Tracking and following up on incoming client payments",
    color: "text-emerald-400", bg: "bg-emerald-500/10",
  },
  "reimbursements": {
    icon: <DollarSign className="w-5 h-5" />,
    description: "Employee and vendor reimbursement request handling",
    color: "text-amber-400", bg: "bg-amber-500/10",
  },
  "accounts-payable": {
    icon: <Banknote className="w-5 h-5" />,
    description: "Bill processing, approval, and payment workflow",
    color: "text-rose-400", bg: "bg-rose-500/10",
  },
  "qbo-clarifications": {
    icon: <Calculator className="w-5 h-5" />,
    description: "QuickBooks Online transaction review and clarification",
    color: "text-violet-400", bg: "bg-violet-500/10",
  },
  "transfers": {
    icon: <Repeat className="w-5 h-5" />,
    description: "Inter-entity and bank transfer procedures",
    color: "text-cyan-400", bg: "bg-cyan-500/10",
  },
  "ruby-s-usu-fta-report": {
    icon: <BarChart3 className="w-5 h-5" />,
    description: "Ruby's USU Food and Tobacco Adjustment report",
    color: "text-orange-400", bg: "bg-orange-500/10",
  },
  "ruby-s-toast-recon-report": {
    icon: <FileSpreadsheet className="w-5 h-5" />,
    description: "Ruby's Toast POS reconciliation report workflow",
    color: "text-pink-400", bg: "bg-pink-500/10",
  },
  "cpro-reports": {
    icon: <ClipboardList className="w-5 h-5" />,
    description: "CurcuminPRO financial reporting and statements",
    color: "text-teal-400", bg: "bg-teal-500/10",
  },
  "ziglar-reports": {
    icon: <Building2 className="w-5 h-5" />,
    description: "Ziglar entity reporting and reconciliation",
    color: "text-indigo-400", bg: "bg-indigo-500/10",
  },
};

// ── Inline markdown renderer ──────────────────────────────────────────────────
function renderMd(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2]) parts.push(<strong key={key++} className="font-bold italic">{match[2]}</strong>);
    else if (match[3]) parts.push(<strong key={key++} className="font-semibold">{match[3]}</strong>);
    else if (match[4]) parts.push(<em key={key++}>{match[4]}</em>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

// ── Pipeline table detection ──────────────────────────────────────────────────
const PIPELINE_KEYWORDS = ["instructions", "generation", "approval", "send", "payment", "logging", "matching", "report", "assign", "client", "qbo"];

function isPipelineTable(rows: string[][]): boolean {
  if (!rows || rows.length < 1 || rows[0].length < 2 || rows[0].length > 7) return false;
  const header = rows[0].join(" ").toLowerCase();
  const hits = PIPELINE_KEYWORDS.filter(k => header.includes(k)).length;
  return hits >= 2;
}

// ── Numbered step detector ────────────────────────────────────────────────────
function groupSteps(sections: WorkflowSection[]) {
  const result: any[] = [];
  let i = 0;
  while (i < sections.length) {
    const s = sections[i];
    if (s.type === "paragraph" && /^\d+[\.\)]\s/.test(s.text || "")) {
      const steps: { num: string; text: string }[] = [];
      while (i < sections.length && sections[i].type === "paragraph" && /^\d+[\.\)]\s/.test(sections[i].text || "")) {
        const m = (sections[i].text || "").match(/^(\d+[\.\)])\s+([\s\S]*)$/);
        steps.push({ num: m ? m[1] : "", text: m ? m[2] : sections[i].text || "" });
        i++;
      }
      result.push({ type: "steps", steps });
    } else {
      result.push(s);
      i++;
    }
  }
  return result;
}

// ── Components ────────────────────────────────────────────────────────────────
interface RenderProps { isLight: boolean }

const PipelineTable: React.FC<{ rows: string[][]; isLight: boolean }> = ({ rows, isLight }) => {
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  return (
    <div className={`mb-5 rounded-2xl border overflow-hidden ${isLight ? "border-blue-100 bg-white shadow-sm" : "border-[#1e3a5f]/60 bg-[#0a1628]/60"}`}>
      {/* Pipeline flow header */}
      <div className={`px-4 py-3 border-b ${isLight ? "bg-blue-50/80 border-blue-100" : "bg-[#0d1e3a]/80 border-[#1e3a5f]/40"}`}>
        <div className="flex items-center gap-1 flex-wrap">
          {headers.map((h, i) => (
            <React.Fragment key={i}>
              <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg text-center ${
                isLight ? "bg-white border border-blue-200 shadow-sm" : "bg-[#0d1e3a] border border-[#1e3a5f]"
              }`}>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${isLight ? "text-blue-600" : "text-blue-400"}`}>
                  {h}
                </span>
              </div>
              {i < headers.length - 1 && (
                <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${isLight ? "text-blue-300" : "text-blue-700"}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      {/* Data rows */}
      {dataRows.map((row, ri) => (
        <div key={ri} className={`flex items-start gap-1 px-4 py-3 flex-wrap ${
          ri < dataRows.length - 1 ? `border-b ${isLight ? "border-slate-100" : "border-[#1e3a5f]/30"}` : ""
        }`}>
          {headers.map((_, ci) => {
            const cell = row[ci] || "";
            return (
              <React.Fragment key={ci}>
                <div className="flex-1 min-w-[80px] text-center">
                  {cell ? (
                    <span className={`inline-block text-[12.5px] font-medium px-2 py-0.5 rounded-md ${
                      isLight ? "text-slate-700 bg-slate-50" : "text-slate-200 bg-[#1e3a5f]/40"
                    }`}>
                      {renderMd(cell)}
                    </span>
                  ) : (
                    <span className={`text-[11px] ${isLight ? "text-slate-300" : "text-slate-600"}`}>—</span>
                  )}
                </div>
                {ci < headers.length - 1 && (
                  <ArrowRight className={`w-3.5 h-3.5 shrink-0 mt-1 ${isLight ? "text-slate-200" : "text-slate-700"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const DataTable: React.FC<{ rows: string[][]; isLight: boolean }> = ({ rows, isLight }) => {
  if (!rows.length) return null;
  const header = rows[0];
  const body = rows.slice(1);
  return (
    <div className={`mb-5 rounded-2xl border overflow-hidden ${isLight ? "border-slate-200 shadow-sm" : "border-[#1e3050]/60"}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] border-collapse">
          <thead>
            <tr className={isLight ? "bg-[#f0f5ff]" : "bg-[#0d1e3a]"}>
              {header.map((cell, i) => (
                <th key={i} className={`px-3.5 py-2.5 text-left font-semibold tracking-wide border-b ${
                  isLight ? "text-blue-700 border-blue-100" : "text-blue-300 border-[#1e3050]"
                }`}>
                  {renderMd(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className={`border-b last:border-0 transition-colors ${
                isLight
                  ? `border-slate-100 ${ri % 2 === 0 ? "bg-white" : "bg-slate-50/60"} hover:bg-blue-50/30`
                  : `border-[#1e3050]/40 ${ri % 2 === 0 ? "bg-transparent" : "bg-[#0d1525]/30"} hover:bg-[#0d1e3a]/40`
              }`}>
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-3.5 py-2.5 align-top leading-relaxed ${
                    isLight ? "text-slate-700" : "text-slate-300"
                  }`}>
                    {cell ? renderMd(cell) : <span className={isLight ? "text-slate-300" : "text-slate-600"}>—</span>}
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

const StepCards: React.FC<{ steps: { num: string; text: string }[]; isLight: boolean }> = ({ steps, isLight }) => (
  <div className="mb-5 space-y-2">
    {steps.map((step, i) => (
      <div key={i} className={`flex gap-3.5 items-start p-3.5 rounded-xl border transition-colors ${
        isLight
          ? "bg-gradient-to-r from-blue-50/80 to-white border-blue-100"
          : "bg-gradient-to-r from-[#0d1e3a]/60 to-transparent border-[#1e3050]/50"
      }`}>
        <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow-sm ${
          isLight ? "bg-blue-600 text-white" : "bg-blue-600/80 text-white shadow-blue-900/30"
        }`}>
          {i + 1}
        </span>
        <p className={`text-[13px] leading-relaxed flex-1 ${isLight ? "text-slate-700" : "text-slate-200"}`}>
          {renderMd(step.text)}
        </p>
      </div>
    ))}
  </div>
);

function renderSection(sec: any, i: number, isLight: boolean): React.ReactNode {
  switch (sec.type) {
    case "steps":
      return <StepCards key={i} steps={sec.steps} isLight={isLight} />;

    case "table":
      if (isPipelineTable(sec.rows || [])) {
        return <PipelineTable key={i} rows={sec.rows} isLight={isLight} />;
      }
      return <DataTable key={i} rows={sec.rows} isLight={isLight} />;

    case "h1":
      return (
        <h2 key={i} className={`text-[15px] font-bold mt-7 mb-3 pb-2 border-b ${
          isLight ? "text-slate-800 border-slate-200" : "text-white border-[#1e3050]"
        }`}>
          {renderMd(sec.text || "")}
        </h2>
      );

    case "h2":
      return (
        <h3 key={i} className={`text-[11.5px] font-bold uppercase tracking-[0.08em] mt-6 mb-2.5 flex items-center gap-2 ${
          isLight ? "text-blue-600" : "text-blue-400"
        }`}>
          <span className={`h-px flex-1 ${isLight ? "bg-blue-100" : "bg-[#1e3050]"}`} />
          {renderMd(sec.text || "")}
          <span className={`h-px flex-1 ${isLight ? "bg-blue-100" : "bg-[#1e3050]"}`} />
        </h3>
      );

    case "h3":
      return (
        <h4 key={i} className={`text-[13px] font-semibold mt-5 mb-2 ${isLight ? "text-slate-700" : "text-slate-200"}`}>
          {renderMd(sec.text || "")}
        </h4>
      );

    case "paragraph": {
      const text = sec.text || "";
      // Goal / note lines get a special callout style
      if (/^goal:/i.test(text) || /^note:/i.test(text) || /^important:/i.test(text)) {
        return (
          <div key={i} className={`mb-3 px-4 py-3 rounded-xl border-l-4 ${
            isLight
              ? "bg-amber-50 border-amber-400 text-amber-900"
              : "bg-amber-950/30 border-amber-500 text-amber-200"
          }`}>
            <p className="text-[13px] leading-relaxed">{renderMd(text)}</p>
          </div>
        );
      }
      // ** only (bold asterisks) = standalone label
      if (/^\*\*$/.test(text.trim())) return null;
      return (
        <p key={i} className={`text-[13px] leading-relaxed mb-3 ${isLight ? "text-slate-600" : "text-slate-300"}`}>
          {renderMd(text)}
        </p>
      );
    }

    case "list":
      return (
        <ul key={i} className="mb-4 space-y-1.5 pl-1">
          {(sec.items || []).map((item: string, li: number) => (
            <li key={li} className={`flex items-start gap-2.5 text-[13px] ${isLight ? "text-slate-600" : "text-slate-300"}`}>
              <span className={`mt-[5px] shrink-0 w-1.5 h-1.5 rounded-full ${isLight ? "bg-blue-400" : "bg-blue-500"}`} />
              <span>{renderMd(item)}</span>
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
  const [partialLoad, setPartialLoad] = useState(false);

  const TOTAL_WORKFLOWS = 10;

  const fetchWorkflows = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== "undefined"
        ? localStorage.getItem("google_access_token") || (googleUser as any)?.accessToken || ""
        : "";
      const qs = token ? `?userAccessToken=${encodeURIComponent(token)}` : "";
      const bust = forceRefresh ? `${qs ? "&" : "?"}bust=${Date.now()}` : "";
      const resp = await fetch(`/api/workflows${qs}${bust}`);
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || "Failed to load workflows");
      const wfs: Workflow[] = data.workflows || [];
      setWorkflows(wfs);
      setPartialLoad(wfs.length > 0 && wfs.length < TOTAL_WORKFLOWS);
      setCached(!!data.cached);
      setLastFetched(new Date());
      if (wfs.length > 0 && !activeId) setActiveId(wfs[0].id);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [googleUser, activeId]);

  useEffect(() => { fetchWorkflows(); }, []); // eslint-disable-line

  const activeWorkflow = workflows.find(w => w.id === activeId);
  const meta = activeId ? WORKFLOW_META[activeId] : undefined;
  const enriched = activeWorkflow ? groupSteps(activeWorkflow.sections) : [];

  return (
    <div className={`flex h-full overflow-hidden ${isLight ? "bg-slate-50" : "bg-[#060a11]"}`}>

      {/* ── Left nav ───────────────────────────────────────────────────────── */}
      <aside className={`w-56 shrink-0 flex flex-col border-r ${
        isLight ? "bg-white border-slate-200" : "bg-[#080f1c] border-[#1a2e4a]"
      }`}>
        <div className={`px-4 pt-5 pb-3 border-b ${isLight ? "border-slate-100" : "border-[#1a2e4a]"}`}>
          <div className="flex items-center gap-2 mb-0.5">
            <BookOpen className={`w-4 h-4 ${isLight ? "text-blue-600" : "text-blue-400"}`} />
            <span className={`text-[13px] font-bold ${isLight ? "text-slate-800" : "text-white"}`}>Workflows</span>
          </div>
          <p className={`text-[10.5px] ${isLight ? "text-slate-400" : "text-slate-500"}`}>
            Standard operating procedures
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {loading && workflows.length === 0
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={`h-8 rounded-lg mb-1 animate-pulse ${isLight ? "bg-slate-100" : "bg-[#1a2e4a]/40"}`} />
              ))
            : workflows.map(wf => {
                const m = WORKFLOW_META[wf.id];
                const isActive = wf.id === activeId;
                return (
                  <button
                    key={wf.id}
                    onClick={() => setActiveId(wf.id)}
                    className={`w-full text-left px-2.5 py-2 flex items-center gap-2 transition-all text-[12px] rounded-lg mb-0.5 ${
                      isActive
                        ? isLight
                          ? "bg-blue-50 text-blue-700 font-semibold shadow-sm"
                          : "bg-[#0d1e3a] text-blue-300 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,.04)]"
                        : isLight
                          ? "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                          : "text-slate-500 hover:bg-[#0d1525]/60 hover:text-slate-300"
                    }`}
                  >
                    <span className={`shrink-0 ${m?.color || "text-slate-400"} ${isActive ? "opacity-100" : "opacity-60"}`}>
                      {m?.icon ?? <FileText className="w-4 h-4" />}
                    </span>
                    <span className="leading-snug flex-1">{wf.title}</span>
                    {isActive && <ChevronRight className={`w-3 h-3 shrink-0 ${isLight ? "text-blue-400" : "text-blue-600"}`} />}
                  </button>
                );
              })
          }
        </nav>

        <div className={`px-3 py-2.5 border-t ${isLight ? "border-slate-100" : "border-[#1a2e4a]"}`}>
          <button
            onClick={() => fetchWorkflows(true)}
            disabled={loading}
            className={`w-full flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded-lg transition-all ${
              isLight ? "text-slate-400 hover:text-blue-600 hover:bg-blue-50" : "text-slate-600 hover:text-blue-400 hover:bg-[#0d1e3a]/50"
            }`}
          >
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

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <AlertCircle className={`w-8 h-8 ${isLight ? "text-rose-400" : "text-rose-500"}`} />
            <p className={`text-sm font-semibold ${isLight ? "text-slate-700" : "text-slate-300"}`}>Could not load workflows</p>
            <p className={`text-xs max-w-xs ${isLight ? "text-slate-500" : "text-slate-500"}`}>{error}</p>
            <button onClick={() => fetchWorkflows(true)}
              className="mt-1 px-4 py-1.5 rounded-lg text-[12.5px] font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">
              Try again
            </button>
          </div>
        ) : !activeWorkflow || loading ? (
          <div className="p-8 max-w-3xl mx-auto space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`h-4 rounded-full animate-pulse ${isLight ? "bg-slate-200" : "bg-[#1a2e4a]/50"}`}
                style={{ width: `${[80, 60, 90, 45, 70][i]}%` }} />
            ))}
          </div>
        ) : (
          <div className="p-7 max-w-3xl mx-auto">

            {/* Partial load notice */}
            {partialLoad && (
              <div className={`mb-5 flex items-start gap-2.5 px-4 py-3 rounded-xl border text-[12px] ${
                isLight
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-amber-950/30 border-amber-800/40 text-amber-300"
              }`}>
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Showing {workflows.length} of {TOTAL_WORKFLOWS} workflows — the remaining tabs require the{" "}
                  <strong>Google Docs API</strong> to be enabled in your Cloud Console.{" "}
                  <a
                    href="https://console.cloud.google.com/apis/library/docs.googleapis.com"
                    target="_blank" rel="noreferrer"
                    className={`underline underline-offset-2 ${isLight ? "text-amber-700" : "text-amber-400"}`}
                  >
                    Enable it here
                  </a>, then refresh.
                </span>
              </div>
            )}

            {/* Workflow header */}
            <div className={`mb-6 pb-5 border-b ${isLight ? "border-slate-200" : "border-[#1a2e4a]"}`}>
              <div className="flex items-center gap-3.5">
                {meta && (
                  <div className={`p-2.5 rounded-xl ${meta.bg} ${meta.color}`}>
                    {meta.icon}
                  </div>
                )}
                <div>
                  <h1 className={`text-[20px] font-bold leading-tight ${isLight ? "text-slate-900" : "text-white"}`}>
                    {activeWorkflow.title}
                  </h1>
                  {meta?.description && (
                    <p className={`text-[12.5px] mt-0.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                      {meta.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Sections */}
            <div>
              {enriched.map((s, i) => renderSection(s, i, isLight))}
            </div>

            {enriched.length === 0 && (
              <div className={`flex flex-col items-center justify-center py-16 gap-3 text-center ${isLight ? "text-slate-400" : "text-slate-600"}`}>
                <FileText className="w-8 h-8 opacity-30" />
                <p className="text-sm">No content for this workflow yet.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
