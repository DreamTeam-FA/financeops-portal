/**
 * AlertsCenter — global alert system for FinanceOps Portal
 *
 * Two surfaces:
 *  1. Bell icon with badge count (render <AlertsBell> in the Sidebar footer)
 *  2. Toast stack (render <AlertsToasts> in App.tsx, appears bottom-right)
 *
 * Alerts are derived live from FinanceContext data. No logic changes — read-only.
 */
import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { useFinance } from "../context/FinanceContext";
import {
  Bell, X, AlertTriangle, AlertCircle, Info, CheckCircle2,
  CreditCard, Receipt, Landmark, CalendarDays, ChevronRight
} from "lucide-react";
import { PageRoute } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertLevel = "critical" | "warn" | "info";

export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  page?: PageRoute;
  icon: React.ReactNode;
}

// ─── Compute alerts from live data ────────────────────────────────────────────

function useComputedAlerts(): Alert[] {
  const { apBills, arItems, bankAccounts, calendarLocalEvents, loans } = useFinance();

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
  const todayStr = today.toISOString().slice(0, 10);

  const alerts: Alert[] = [];

  // Overdue AP bills — critical
  const overdueBills = (apBills || []).filter(
    b => b.status !== "paid" && b.dueDate && new Date(b.dueDate + "T00:00:00") < today
  );
  if (overdueBills.length > 0)
    alerts.push({
      id: "ap-overdue",
      level: "critical",
      title: `${overdueBills.length} Overdue Bill${overdueBills.length > 1 ? "s" : ""}`,
      detail: `AP payments past due — action needed`,
      page: "ap",
      icon: <AlertCircle className="w-4 h-4" />,
    });

  // Bills due this week — warn
  const dueSoon = (apBills || []).filter(b => {
    const d = b.status !== "paid" && b.dueDate ? new Date(b.dueDate + "T00:00:00") : null;
    return d && d >= today && d <= nextWeek;
  });
  if (dueSoon.length > 0)
    alerts.push({
      id: "ap-soon",
      level: "warn",
      title: `${dueSoon.length} Bill${dueSoon.length > 1 ? "s" : ""} Due This Week`,
      detail: `Upcoming AP payments within 7 days`,
      page: "ap",
      icon: <CreditCard className="w-4 h-4" />,
    });

  // Overdue AR — critical
  const overdueAR = (arItems || []).filter(
    a => !a.payment && a.dueDate && new Date(a.dueDate + "T00:00:00") < today
  );
  if (overdueAR.length > 0)
    alerts.push({
      id: "ar-overdue",
      level: "critical",
      title: `${overdueAR.length} Overdue Invoice${overdueAR.length > 1 ? "s" : ""}`,
      detail: `Uncollected AR past due date`,
      page: "ar",
      icon: <Receipt className="w-4 h-4" />,
    });

  // Critical bank accounts — critical
  const critical = (bankAccounts || []).filter(a => a.balance < 500);
  if (critical.length > 0)
    alerts.push({
      id: "bank-critical",
      level: "critical",
      title: `${critical.length} Account${critical.length > 1 ? "s" : ""} Below $500`,
      detail: critical.map(a => a.name || a.bank).join(", "),
      page: "bank",
      icon: <Landmark className="w-4 h-4" />,
    });
  else {
    const low = (bankAccounts || []).filter(a => a.balance < 1000);
    if (low.length > 0)
      alerts.push({
        id: "bank-low",
        level: "warn",
        title: `${low.length} Account${low.length > 1 ? "s" : ""} Below $1,000`,
        detail: low.map(a => a.name || a.bank).join(", "),
        page: "bank",
        icon: <Landmark className="w-4 h-4" />,
      });
  }

  // Today's calendar events — info
  const todayEvents = (calendarLocalEvents || []).filter(e => e.date === todayStr && !e.done);
  if (todayEvents.length > 0)
    alerts.push({
      id: "cal-today",
      level: "info",
      title: `${todayEvents.length} Event${todayEvents.length > 1 ? "s" : ""} Today`,
      detail: todayEvents.slice(0, 2).map(e => e.title).join(" · ") + (todayEvents.length > 2 ? ` +${todayEvents.length - 2} more` : ""),
      page: "calendar",
      icon: <CalendarDays className="w-4 h-4" />,
    });

  return alerts;
}

// ─── Shared panel state (open/close bell panel) ───────────────────────────────

const AlertsPanelCtx = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
  alerts: Alert[];
}>({ open: false, setOpen: () => {}, alerts: [] });

export const AlertsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const alerts = useComputedAlerts();
  return (
    <AlertsPanelCtx.Provider value={{ open, setOpen, alerts }}>
      {children}
    </AlertsPanelCtx.Provider>
  );
};

// ─── Bell icon (for Sidebar) ──────────────────────────────────────────────────

export const AlertsBell: React.FC<{ isLight: boolean }> = ({ isLight }) => {
  const { open, setOpen, alerts } = useContext(AlertsPanelCtx);
  const criticalCount = alerts.filter(a => a.level === "critical").length;
  const totalCount    = alerts.length;

  return (
    <button
      onClick={() => setOpen(!open)}
      className={`relative flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
        open
          ? isLight ? "bg-slate-200 text-slate-800" : "bg-white/10 text-white"
          : isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-white/6 text-[#5a7090]"
      }`}
      title="Alerts"
    >
      <Bell className="w-3.5 h-3.5" />
      {totalCount > 0 && (
        <span
          className={`absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-extrabold flex items-center justify-center text-white ${
            criticalCount > 0 ? "bg-red-500" : "bg-amber-500"
          }`}
        >
          {totalCount > 9 ? "9+" : totalCount}
        </span>
      )}
    </button>
  );
};

// ─── Alerts panel (dropdown from bell) ───────────────────────────────────────

export const AlertsPanel: React.FC<{ isLight: boolean }> = ({ isLight }) => {
  const { open, setOpen, alerts } = useContext(AlertsPanelCtx);
  const { setCurrentPage } = useFinance();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, setOpen]);

  if (!open) return null;

  const levelStyle = {
    critical: {
      icon: "text-red-400",
      dot:  "bg-red-500",
      row:  isLight ? "bg-red-50 border-red-200 hover:bg-red-100" : "bg-red-500/8 border-red-500/20 hover:bg-red-500/14",
    },
    warn: {
      icon: "text-amber-400",
      dot:  "bg-amber-400",
      row:  isLight ? "bg-amber-50 border-amber-200 hover:bg-amber-100" : "bg-amber-500/8 border-amber-500/20 hover:bg-amber-500/14",
    },
    info: {
      icon: "text-blue-400",
      dot:  "bg-blue-400",
      row:  isLight ? "bg-blue-50 border-blue-200 hover:bg-blue-100" : "bg-blue-500/8 border-blue-500/20 hover:bg-blue-500/14",
    },
  };

  return (
    <div
      ref={ref}
      className={`absolute bottom-full left-0 right-0 mb-2 mx-1 rounded-xl overflow-hidden z-50 shadow-2xl border ${
        isLight ? "bg-white border-slate-200" : "border-[#1e2d45]"
      }`}
      style={isLight ? {} : {
        background: "linear-gradient(145deg, #0d1525 0%, #0a1020 100%)",
        boxShadow: "0 -16px 48px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04)",
      }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isLight ? "border-slate-100" : "border-[#1a2a3a]"}`}>
        <div className="flex items-center gap-2">
          <Bell className={`w-3.5 h-3.5 ${isLight ? "text-slate-500" : "text-[#4a6080]"}`} />
          <span className={`text-[12px] font-bold ${isLight ? "text-slate-700" : "text-[#a0b8cc]"}`}>Active Alerts</span>
          {alerts.length > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isLight ? "bg-slate-100 text-slate-500" : "bg-white/8 text-[#5a7090]"}`}>
              {alerts.length}
            </span>
          )}
        </div>
        <button onClick={() => setOpen(false)} className={`p-1 rounded-md ${isLight ? "hover:bg-slate-100 text-slate-400" : "hover:bg-white/6 text-[#4a6080]"}`}>
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Alert list */}
      <div className="px-3 py-2.5 space-y-1.5 max-h-72 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 opacity-60" />
            <span className={`text-[12px] font-medium ${isLight ? "text-slate-400" : "text-[#4a6080]"}`}>All clear — no active alerts</span>
          </div>
        ) : alerts.map(alert => {
          const s = levelStyle[alert.level];
          return (
            <div
              key={alert.id}
              onClick={() => { if (alert.page) { setCurrentPage(alert.page); setOpen(false); } }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${s.row} ${alert.page ? "cursor-pointer" : ""}`}
            >
              <span className={`shrink-0 ${s.icon}`}>{alert.icon}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-[12px] font-semibold leading-tight truncate ${isLight ? "text-slate-800" : "text-[#c0d4e8]"}`}>{alert.title}</div>
                <div className={`text-[11px] mt-0.5 truncate ${isLight ? "text-slate-500" : "text-[#4a6080]"}`}>{alert.detail}</div>
              </div>
              {alert.page && <ChevronRight className={`w-3 h-3 shrink-0 ${s.icon} opacity-50`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Toast stack (bottom-right corner, shows on login for critical items) ─────

let _toastsShownForEmail: string | null = null;

export const AlertsToasts: React.FC<{ isLight: boolean }> = ({ isLight }) => {
  const { googleUser, setCurrentPage } = useFinance();
  const alerts = useComputedAlerts();
  const [visible, setVisible] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Show critical+warn toasts once per login session
  useEffect(() => {
    const email = googleUser?.email ?? null;
    if (!email) { _toastsShownForEmail = null; return; }
    if (email === _toastsShownForEmail) return;
    _toastsShownForEmail = email;

    const critical = alerts.filter(a => a.level === "critical" || a.level === "warn");
    if (critical.length === 0) return;

    // Stagger toasts: show one every 600ms
    critical.forEach((alert, i) => {
      setTimeout(() => {
        setVisible(prev => prev.find(a => a.id === alert.id) ? prev : [...prev, alert]);
        // Auto-dismiss after 8s
        setTimeout(() => setVisible(prev => prev.filter(a => a.id !== alert.id)), 8000 + i * 600);
      }, 1800 + i * 600);
    });
  }, [googleUser?.email, alerts.length]);

  const dismiss = useCallback((id: string) => {
    setVisible(prev => prev.filter(a => a.id !== id));
    setDismissed(prev => new Set([...prev, id]));
  }, []);

  const toasts = visible.filter(a => !dismissed.has(a.id));
  if (toasts.length === 0) return null;

  const toastStyle = {
    critical: {
      bar:  "bg-red-500",
      icon: "text-red-400",
      bg:   isLight ? "bg-white border-red-200 shadow-red-100" : "border-red-500/25",
    },
    warn: {
      bar:  "bg-amber-400",
      icon: "text-amber-400",
      bg:   isLight ? "bg-white border-amber-200 shadow-amber-100" : "border-amber-500/25",
    },
    info: {
      bar:  "bg-blue-400",
      icon: "text-blue-400",
      bg:   isLight ? "bg-white border-blue-200" : "border-blue-500/25",
    },
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 items-end pointer-events-none">
      {toasts.map((alert, idx) => {
        const s = toastStyle[alert.level];
        return (
          <div
            key={alert.id}
            className={`pointer-events-auto flex items-start gap-3 w-72 rounded-xl border shadow-xl overflow-hidden transition-all ${s.bg}`}
            style={isLight
              ? { background: "#fff", animationDelay: `${idx * 80}ms` }
              : {
                  background: "linear-gradient(135deg, #0d1525 0%, #0a1020 100%)",
                  boxShadow: "0 8px 32px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04)",
                  animationDelay: `${idx * 80}ms`,
                }
            }
          >
            {/* Left severity bar */}
            <div className={`w-1 self-stretch shrink-0 ${s.bar}`} />

            {/* Content */}
            <div className="flex-1 py-3 pr-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`${s.icon} shrink-0`}>{alert.icon}</span>
                <span className={`text-[12px] font-bold truncate ${isLight ? "text-slate-800" : "text-[#c0d4e8]"}`}>{alert.title}</span>
              </div>
              <p className={`text-[11px] leading-snug ${isLight ? "text-slate-500" : "text-[#4a6080]"}`}>{alert.detail}</p>
              {alert.page && (
                <button
                  onClick={() => { setCurrentPage(alert.page!); dismiss(alert.id); }}
                  className={`mt-1.5 text-[11px] font-semibold flex items-center gap-0.5 ${s.icon} hover:underline`}
                >
                  View <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Dismiss */}
            <button
              onClick={() => dismiss(alert.id)}
              className={`mt-2.5 mr-2.5 p-0.5 rounded shrink-0 ${isLight ? "text-slate-300 hover:text-slate-500" : "text-[#2a3a4a] hover:text-[#5a7090]"}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
