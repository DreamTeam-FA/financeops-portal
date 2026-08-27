import React, { useState, useEffect, useCallback } from "react";
import { useFinance } from "../../context/FinanceContext";
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  AlertCircle,
  FileText,
  Users,
  ArrowRight,
  CheckCircle2,
  Table2,
  List,
  Layers,
  TrendingUp,
  Receipt,
  Banknote,
  DollarSign,
  FileSpreadsheet,
  BarChart3,
  ClipboardList,
  GitBranch,
  Repeat,
  Building2,
  Calculator,
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

// ── Workflow metadata (icon + description) ───────────────────────────────────
const WORKFLOW_META: Record<string, { icon: React.ReactNode; description: string; color: string }> = {
  "invoice-to-clients": {
    icon: <Receipt className="w-5 h-5" />,
    description: "End-to-end invoicing process for all client entities",
    color: "text-blue-400",
  },
  "accounts-receivable": {
    icon: <TrendingUp className="w-5 h-5" />,
    description: "Tracking and following up on incoming client payments",
    color: "text-emerald-400",
  },
  "reimbursements": {
    icon: <DollarSign className="w-5 h-5" />,
    description: "Employee and vendor reimbursement request handling",
    color: "text-amber-400",
  },
  "accounts-payable": {
    icon: <Banknote className="w-5 h-5" />,
    description: "Bill processing, approval, and payment workflow",
    color: "text-rose-400",
  },
  "qbo-clarifications": {
    icon: <Calculator className="w-5 h-5" />,
    description: "QuickBooks Online transaction review and clarification",
    color: "text-violet-400",
  },
  "transfers": {
    icon: <Repeat className="w-5 h-5" />,
    description: "Inter-entity and bank transfer procedures",
    color: "text-cyan-400",
  },
  "ruby-s-usu-fta-report": {
    icon: <BarChart3 className="w-5 h-5" />,
    description: "Ruby's USU Food and Tobacco Adjustment report process",
    color: "text-orange-400",
  },
  "ruby-s-toast-recon-report": {
    icon: <FileSpreadsheet className="w-5 h-5" />,
    description: "Ruby's Toast POS reconciliation report workflow",
    color: "text-pink-400",
  },
  "cpro-reports": {
    icon: <ClipboardList className="w-5 h-5" />,
    description: "CurcuminPRO reporting and financial statement generation",
    color: "text-teal-400",
  },
  "ziglar-reports": {
    icon: <Building2 className="w-5 h-5" />,
    description: "Ziglar entity reporting and reconciliation procedures",
    color: "text-indigo-400",
  },
};

// ── Inline markdown bold/italic renderer ─────────────────────────────────────
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Match ***bold+italic***, **bold**, *italic*
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={key++} className="font-bold italic">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<strong key={key++} className="font-semibold">{match[3]}</strong>);
    } else if (match[4]) {
      parts.push(<em key={key++}>{match[4]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

// ── Section renderers ────────────────────────────────────────────────────────
interface SectionProps {
  section: WorkflowSection;
  index: number;
  isLight: boolean;
}

const ParagraphBlock: React.FC<SectionProps> = ({ section, isLight }) => (
  <p className={`text-[13.5px] leading-relaxed mb-3 ${isLight ? "text-slate-600" : "text-slate-300"}`}>
    {renderInlineMarkdown(section.text || "")}
  </p>
);

const HeadingBlock: React.FC<SectionProps> = ({ section, isLight }) => {
  const t = section.type;
  if (t === "h1") return (
    <h2 className={`text-base font-bold mt-6 mb-3 pb-1.5 border-b ${isLight ? "text-slate-800 border-slate-200" : "text-white border-[#243554]"}`}>
      {renderInlineMarkdown(section.text || "")}
    </h2>
  );
  if (t === "h2") return (
    <h3 className={`text-[13px] font-semibold uppercase tracking-wide mt-5 mb-2 ${isLight ? "text-blue-700" : "text-blue-300"}`}>
      {renderInlineMarkdown(section.text || "")}
    </h3>
  );
  return (
    <h4 className={`text-[12.5px] font-semibold mt-4 mb-1.5 ${isLight ? "text-slate-700" : "text-slate-200"}`}>
      {renderInlineMarkdown(section.text || "")}
    </h4>
  );
};

const ListBlock: React.FC<SectionProps> = ({ section, index, isLight }) => (
  <ul className="mb-3 space-y-1.5 pl-1">
    {(section.items || []).map((item, i) => (
      <li key={i} className={`flex items-start gap-2.5 text-[13px] ${isLight ? "text-slate-600" : "text-slate-300"}`}>
        <span className={`mt-[3px] shrink-0 w-1.5 h-1.5 rounded-full ${isLight ? "bg-blue-400" : "bg-blue-500"}`} />
        <span>{renderInlineMarkdown(item)}</span>
      </li>
    ))}
  </ul>
);

const TableBlock: React.FC<SectionProps> = ({ section, isLight }) => {
  const rows = section.rows || [];
  if (rows.length === 0) return null;
  const header = rows[0];
  const body = rows.slice(1);
  return (
    <div className="mb-4 overflow-x-auto rounded-xl border border-[#1e3050]/60">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className={`${isLight ? "bg-blue-50" : "bg-[#0d1e3a]"}`}>
            {header.map((cell, i) => (
              <th
                key={i}
                className={`px-3 py-2.5 text-left font-semibold tracking-wide ${
                  isLight ? "text-blue-700 border-b border-blue-200" : "text-blue-300 border-b border-[#1e3050]"
                }`}
              >
                {renderInlineMarkdown(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr
              key={ri}
              className={`border-b last:border-0 ${
                isLight
                  ? ri % 2 === 0 ? "bg-white" : "bg-slate-50/80"
                  : ri % 2 === 0 ? "bg-[#0d1525]/40" : "bg-[#111d32]/40"
              } ${isLight ? "border-slate-100" : "border-[#1e3050]/50"}`}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-2 align-top ${isLight ? "text-slate-700" : "text-slate-300"}`}
                >
                  {renderInlineMarkdown(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function renderSection(section: WorkflowSection, i: number, isLight: boolean) {
  switch (section.type) {
    case "h1":
    case "h2":
    case "h3":
      return <HeadingBlock key={i} section={section} index={i} isLight={isLight} />;
    case "paragraph":
      return <ParagraphBlock key={i} section={section} index={i} isLight={isLight} />;
    case "list":
      return <ListBlock key={i} section={section} index={i} isLight={isLight} />;
    case "table":
      return <TableBlock key={i} section={section} index={i} isLight={isLight} />;
    default:
      return null;
  }
}

// ── Numbered step detector (paragraph starting with "1." "2." etc.) ──────────
function groupIntoSteps(sections: WorkflowSection[]): (WorkflowSection | { type: "steps"; steps: { num: string; text: string }[] })[] {
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

interface StepCardProps {
  step: { num: string; text: string };
  idx: number;
  isLight: boolean;
}
const StepCard: React.FC<StepCardProps> = ({ step, idx, isLight }) => (
  <div className={`flex gap-3 items-start p-3 rounded-xl mb-2.5 border ${
    isLight ? "bg-blue-50/60 border-blue-100" : "bg-[#0d1e3a]/60 border-[#1e3050]/60"
  }`}>
    <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
      isLight ? "bg-blue-600 text-white" : "bg-blue-600/90 text-white"
    }`}>
      {idx + 1}
    </span>
    <p className={`text-[13px] leading-relaxed ${isLight ? "text-slate-700" : "text-slate-200"}`}>
      {renderInlineMarkdown(step.text)}
    </p>
  </div>
);

// ── Empty / error / skeleton states ─────────────────────────────────────────
const WorkflowSkeleton: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <div className="space-y-3 p-4 animate-pulse">
    {[80, 60, 100, 45, 90, 70].map((w, i) => (
      <div key={i} className={`h-3 rounded-full ${isLight ? "bg-slate-200" : "bg-[#1e3050]/60"}`} style={{ width: `${w}%` }} />
    ))}
  </div>
);

// ── Main page ────────────────────────────────────────────────────────────────
export const WorkflowsPage: React.FC = () => {
  const { theme, googleUser } = useFinance();
  const isLight = theme === "light";

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchWorkflows = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const token = (googleUser as any)?.accessToken || "";
      const qs = token ? `?userAccessToken=${encodeURIComponent(token)}` : "";
      const url = forceRefresh
        ? `/api/workflows${qs}${qs ? "&" : "?"}bust=${Date.now()}`
        : `/api/workflows${qs}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || "Failed to load workflows");
      setWorkflows(data.workflows || []);
      setCached(!!data.cached);
      setLastFetched(new Date());
      if (data.workflows?.length > 0 && !activeId) {
        setActiveId(data.workflows[0].id);
      }
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [googleUser, activeId]);

  useEffect(() => {
    fetchWorkflows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeWorkflow = workflows.find((w) => w.id === activeId);
  const meta = activeId ? (WORKFLOW_META[activeId] || WORKFLOW_META[activeId.replace(/'/g, "-s-")]) : undefined;

  // Group steps for richer rendering
  const enrichedSections = activeWorkflow ? groupIntoSteps(activeWorkflow.sections) : [];

  return (
    <div className={`flex h-full ${isLight ? "bg-slate-50" : "bg-[#060a11]"}`}>

      {/* ── Left panel: workflow list ───────────────────────────────────── */}
      <aside className={`w-60 shrink-0 flex flex-col border-r ${
        isLight ? "bg-white border-slate-200" : "bg-[#0a1220] border-[#1e3050]"
      }`}>
        {/* Header */}
        <div className={`px-4 pt-5 pb-3 border-b ${isLight ? "border-slate-200" : "border-[#1e3050]"}`}>
          <div className="flex items-center gap-2 mb-0.5">
            <BookOpen className={`w-4 h-4 ${isLight ? "text-blue-600" : "text-blue-400"}`} />
            <span className={`text-[13px] font-bold tracking-wide ${isLight ? "text-slate-800" : "text-white"}`}>
              Workflows
            </span>
          </div>
          <p className={`text-[11px] ${isLight ? "text-slate-400" : "text-slate-500"}`}>
            10 standard operating procedures
          </p>
        </div>

        {/* Workflow list */}
        <nav className="flex-1 overflow-y-auto py-2">
          {loading && workflows.length === 0 ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={`h-8 rounded-lg animate-pulse ${isLight ? "bg-slate-100" : "bg-[#1e3050]/40"}`} />
              ))}
            </div>
          ) : workflows.length === 0 ? (
            <div className={`p-4 text-[12px] text-center ${isLight ? "text-slate-400" : "text-slate-500"}`}>
              No workflows loaded
            </div>
          ) : (
            workflows.map((wf) => {
              const m = WORKFLOW_META[wf.id] || WORKFLOW_META[wf.id.replace(/'/g, "-s-")];
              const isActive = wf.id === activeId;
              return (
                <button
                  key={wf.id}
                  onClick={() => setActiveId(wf.id)}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-all text-[12.5px] rounded-lg mx-1.5 mb-0.5 ${
                    isActive
                      ? isLight
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "bg-[#0d1e3a] text-blue-300 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"
                      : isLight
                        ? "text-slate-600 hover:bg-slate-50"
                        : "text-slate-400 hover:bg-[#111d32]/50 hover:text-slate-300"
                  }`}
                  style={{ width: "calc(100% - 12px)" }}
                >
                  <span className={`shrink-0 ${m ? m.color : "text-slate-400"} ${isActive ? "" : "opacity-70"}`}>
                    {m?.icon ?? <FileText className="w-4 h-4" />}
                  </span>
                  <span className="leading-snug">{wf.title}</span>
                  {isActive && <ChevronRight className={`w-3 h-3 ml-auto shrink-0 ${isLight ? "text-blue-400" : "text-blue-500"}`} />}
                </button>
              );
            })
          )}
        </nav>

        {/* Footer: refresh */}
        <div className={`px-3 py-2.5 border-t ${isLight ? "border-slate-200" : "border-[#1e3050]"}`}>
          <button
            onClick={() => fetchWorkflows(true)}
            disabled={loading}
            className={`w-full flex items-center justify-center gap-1.5 text-[11.5px] py-1.5 rounded-lg transition-all ${
              isLight
                ? "text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                : "text-slate-500 hover:text-blue-400 hover:bg-[#0d1e3a]/60"
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : cached ? "Refresh (cached)" : "Refresh"}
          </button>
          {lastFetched && !loading && (
            <p className={`text-center text-[10px] mt-0.5 ${isLight ? "text-slate-300" : "text-slate-600"}`}>
              Updated {lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </aside>

      {/* ── Right panel: workflow content ───────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <AlertCircle className={`w-8 h-8 ${isLight ? "text-rose-400" : "text-rose-500"}`} />
            <p className={`text-sm font-semibold ${isLight ? "text-slate-700" : "text-slate-300"}`}>
              Could not load workflows
            </p>
            <p className={`text-xs max-w-sm ${isLight ? "text-slate-500" : "text-slate-500"}`}>{error}</p>
            <button
              onClick={() => fetchWorkflows(true)}
              className="mt-1 px-4 py-1.5 rounded-lg text-[12.5px] font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : !activeWorkflow || loading ? (
          <div className="p-6 max-w-3xl mx-auto">
            <WorkflowSkeleton isLight={isLight} />
          </div>
        ) : (
          <div className="p-6 max-w-3xl mx-auto">
            {/* ── Workflow header ─────────────────────────────────────────── */}
            <div className={`mb-6 pb-4 border-b ${isLight ? "border-slate-200" : "border-[#1e3050]"}`}>
              <div className="flex items-center gap-3 mb-2">
                {meta && (
                  <span className={`p-2 rounded-xl ${isLight ? "bg-slate-100" : "bg-[#1e3050]/80"} ${meta.color}`}>
                    {meta.icon}
                  </span>
                )}
                <div>
                  <h1 className={`text-[18px] font-bold leading-snug ${isLight ? "text-slate-900" : "text-white"}`}>
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

            {/* ── Workflow content ─────────────────────────────────────────── */}
            <div className="workflow-content">
              {enrichedSections.map((s: any, i: number) => {
                if (s.type === "steps") {
                  return (
                    <div key={i} className="mb-4">
                      {(s.steps as { num: string; text: string }[]).map((step, si) => (
                        <StepCard key={si} step={step} idx={si} isLight={isLight} />
                      ))}
                    </div>
                  );
                }
                return renderSection(s as WorkflowSection, i, isLight);
              })}
            </div>

            {/* ── Empty content fallback ───────────────────────────────────── */}
            {enrichedSections.length === 0 && (
              <div className={`flex flex-col items-center justify-center py-16 text-center gap-3 ${isLight ? "text-slate-400" : "text-slate-600"}`}>
                <FileText className="w-8 h-8 opacity-40" />
                <p className="text-sm">No content found for this workflow.</p>
                <p className="text-xs">The tab may be empty in the source document.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
