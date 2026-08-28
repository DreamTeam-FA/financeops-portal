/**
 * PortalAuditModal.tsx
 *
 * Shown automatically every 48 hours after the portal's data is loaded.
 * Presents prioritised health-check findings (critical / warning /
 * improvement) with one-click navigation to the relevant page.
 */

import React from "react";
import { X, ShieldAlert, AlertTriangle, Lightbulb, ClipboardCheck } from "lucide-react";
import type { AuditFinding, AuditSeverity } from "../utils/portalAudit";

// ── Severity config ─────────────────────────────────────────────────────────

const SEVERITY_META: Record<
  AuditSeverity,
  {
    label:     string;
    icon:      React.FC<{ className?: string }>;
    dot:       string; // bg colour for the dot
    tagLight:  string;
    tagDark:   string;
    rowLight:  string;
    rowDark:   string;
    barLight:  string;
    barDark:   string;
  }
> = {
  critical: {
    label:    "Critical",
    icon:     ({ className }) => <ShieldAlert className={className} />,
    dot:      "bg-red-500",
    tagLight: "bg-red-50  border-red-200  text-red-700",
    tagDark:  "bg-red-950/60 border-red-700/40 text-red-300",
    rowLight: "bg-red-50/70 border-l-4 border-red-400",
    rowDark:  "bg-red-950/30 border-l-4 border-red-600",
    barLight: "bg-red-400",
    barDark:  "bg-red-600",
  },
  warning: {
    label:    "Warning",
    icon:     ({ className }) => <AlertTriangle className={className} />,
    dot:      "bg-amber-400",
    tagLight: "bg-amber-50  border-amber-200  text-amber-700",
    tagDark:  "bg-amber-950/60 border-amber-700/40 text-amber-300",
    rowLight: "bg-amber-50/60 border-l-4 border-amber-400",
    rowDark:  "bg-amber-950/30 border-l-4 border-amber-500",
    barLight: "bg-amber-400",
    barDark:  "bg-amber-500",
  },
  improvement: {
    label:    "Improvement",
    icon:     ({ className }) => <Lightbulb className={className} />,
    dot:      "bg-blue-400",
    tagLight: "bg-blue-50  border-blue-200  text-blue-700",
    tagDark:  "bg-blue-950/60 border-blue-700/40 text-blue-300",
    rowLight: "bg-blue-50/40 border-l-4 border-blue-400",
    rowDark:  "bg-blue-950/20 border-l-4 border-blue-600",
    barLight: "bg-blue-400",
    barDark:  "bg-blue-600",
  },
};

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  findings:    AuditFinding[];
  auditTs:     number;                              // unix ms when audit ran
  isLight:     boolean;
  onDismiss:   () => void;
  onNavigate:  (page: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export const PortalAuditModal: React.FC<Props> = ({
  findings,
  auditTs,
  isLight,
  onDismiss,
  onNavigate,
}) => {
  const criticalCount    = findings.filter(f => f.severity === "critical").length;
  const warningCount     = findings.filter(f => f.severity === "warning").length;
  const improvementCount = findings.filter(f => f.severity === "improvement").length;

  const auditDate = new Date(auditTs).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  // ── base classes ─────────────────────────────────────────────────────────
  const overlay = "fixed inset-0 z-[9997] flex items-center justify-center p-4";
  const modal   = isLight
    ? "bg-white border border-slate-200 text-slate-800"
    : "bg-[#181c24] border border-[#262d3d] text-slate-100";
  const sub     = isLight ? "text-slate-500" : "text-slate-400";
  const divider = isLight ? "border-slate-100" : "border-[#252d3a]";
  const close   = isLight
    ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
    : "text-slate-500 hover:text-slate-200 hover:bg-[#262d3a]";

  return (
    <div className={overlay}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onDismiss}
      />

      {/* Modal card */}
      <div
        className={`relative z-10 rounded-2xl shadow-2xl border ${modal} w-full max-w-xl flex flex-col overflow-hidden`}
        style={{ maxHeight: "90vh" }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className={`px-5 py-4 border-b ${divider} flex items-start gap-3`}>
          <div className="flex-shrink-0 mt-0.5">
            <ClipboardCheck className={`w-5 h-5 ${isLight ? "text-[#1a73e8]" : "text-blue-400"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm leading-tight">Portal Health Audit</h2>
            <p className={`text-[11px] mt-0.5 ${sub}`}>
              {findings.length === 0
                ? "All clear — no issues detected."
                : `${findings.length} finding${findings.length !== 1 ? "s" : ""} — audited ${auditDate}`}
            </p>
          </div>

          {/* Summary pills */}
          {findings.length > 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {criticalCount > 0 && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold
                  ${isLight ? SEVERITY_META.critical.tagLight : SEVERITY_META.critical.tagDark}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                  {criticalCount}
                </span>
              )}
              {warningCount > 0 && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold
                  ${isLight ? SEVERITY_META.warning.tagLight : SEVERITY_META.warning.tagDark}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                  {warningCount}
                </span>
              )}
              {improvementCount > 0 && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold
                  ${isLight ? SEVERITY_META.improvement.tagLight : SEVERITY_META.improvement.tagDark}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                  {improvementCount}
                </span>
              )}
            </div>
          )}

          <button
            onClick={onDismiss}
            className={`ml-1 flex-shrink-0 p-1.5 rounded-lg transition-colors ${close}`}
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {findings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <span className="text-3xl">✅</span>
              <p className={`text-sm font-medium ${sub}`}>
                No issues found — the portal looks healthy.
              </p>
            </div>
          ) : (
            findings.map(f => {
              const meta  = SEVERITY_META[f.severity];
              const Icon  = meta.icon;
              const row   = isLight ? meta.rowLight  : meta.rowDark;
              const tag   = isLight ? meta.tagLight  : meta.tagDark;
              const btnBg = isLight
                ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                : "bg-[#1e2533] border border-[#2d3748] text-slate-300 hover:bg-[#252d3d]";

              return (
                <div
                  key={f.id}
                  className={`rounded-lg px-4 py-3 ${row} flex items-start gap-3`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5
                    ${f.severity === "critical"
                      ? isLight ? "text-red-500"   : "text-red-400"
                      : f.severity === "warning"
                      ? isLight ? "text-amber-500" : "text-amber-400"
                      : isLight ? "text-blue-500"  : "text-blue-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${tag}`}>
                        {meta.label}
                      </span>
                      <span className="text-[12px] font-semibold leading-snug">
                        {f.title}
                      </span>
                    </div>
                    <p className={`text-[11px] leading-relaxed ${sub}`}>{f.detail}</p>
                    {f.action && (
                      <button
                        onClick={() => {
                          if (f.action?.page) onNavigate(f.action.page);
                          onDismiss();
                        }}
                        className={`mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${btnBg}`}
                      >
                        {f.action.label} →
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className={`px-5 py-3.5 border-t ${divider} flex items-center justify-between`}>
          <p className={`text-[10px] ${sub}`}>
            Runs automatically every 48 hours · Next check in ~2 days
          </p>
          <button
            onClick={onDismiss}
            className={`text-[11px] font-semibold px-4 py-1.5 rounded-lg transition-colors
              ${isLight
                ? "bg-slate-800 text-white hover:bg-slate-700"
                : "bg-[#1a73e8] text-white hover:bg-[#1557b0]"}`}
          >
            Dismiss for 2 days
          </button>
        </div>
      </div>
    </div>
  );
};
