import React, { useState, useEffect } from "react";
import { FinanceProvider, useFinance } from "./context/FinanceContext";
import { PortalAuditModal } from "./components/PortalAuditModal";
import {
  shouldRunAudit,
  saveAuditResult,
  runPortalAudit,
  type AuditFinding,
} from "./utils/portalAudit";
import { LoginModal } from "./components/modals/LoginModal";
import { Sidebar } from "./components/Sidebar";
import { HubPage } from "./components/pages/HubPage";
import { APPage } from "./components/pages/APPage";
import { BankBalancesPage } from "./components/pages/BankBalancesPage";
import { LoansPage } from "./components/pages/LoansPage";
import { ARPage } from "./components/pages/ARPage";
import { BankStatementsPage } from "./components/pages/BankStatementsPage";
import { PayrollPage } from "./components/pages/PayrollPage";
import { CalendarPage } from "./components/pages/CalendarPage";
import { DataSyncPage } from "./components/pages/DataSyncPage";
import { NotesPage } from "./components/pages/NotesPage";
import { WorkspacePage } from "./components/pages/WorkspacePage";
import { MemberWorkspacePage } from "./components/pages/MemberWorkspacePage";
import { GasDashboardView } from "./components/pages/GasDashboardView";
import { HeadleysPage } from "./components/pages/HeadleysPage";
import { FourYrPayrollPage } from "./components/pages/FourYrPayrollPage";
import { LogsPage } from "./components/pages/LogsPage";
import { ServiceLimitsPage } from "./components/pages/ServiceLimitsPage";
import { HelpPage } from "./components/pages/HelpPage";
import { ReceiptRenamerPage } from "./components/pages/ReceiptRenamerPage";
import { BankStatementPage } from "./components/pages/BankStatementPage";
import { PDFTableExtractorPage } from "./components/pages/PDFTableExtractorPage";
import { EmailInboxScannerPage } from "./components/pages/EmailInboxScannerPage";
import { CCExpensePage } from "./components/pages/CCExpensePage";
import { WorkflowsPage } from "./components/pages/WorkflowsPage";
import { PayablesCalendarPage } from "./components/pages/PayablesCalendarPage";
import { GlobalSearchModal } from "./components/GlobalSearchModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NotesFloatingWidget } from "./components/modals/NotesFloatingWidget";
import { AlertsProvider, AlertsToasts } from "./components/AlertsCenter";
import { TooltipProvider } from "./components/Tooltip";

import {
  LayoutDashboard,
  CreditCard,
  Landmark,
  Users,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Info,
  X
} from "lucide-react";

/* ── Toast config per type ───────────────────────────────────────────── */
const TOAST_CFG = {
  success: {
    bar:      "bg-emerald-500",
    pill:     "bg-emerald-50 border-emerald-200 text-emerald-900",
    icon:     <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />,
    label:    "Success",
    labelCls: "text-emerald-600",
  },
  error: {
    bar:      "bg-red-500",
    pill:     "bg-red-50 border-red-200 text-red-900",
    icon:     <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />,
    label:    "Error",
    labelCls: "text-red-600",
  },
  info: {
    bar:      "bg-[#1a73e8]",
    pill:     "bg-blue-50 border-blue-200 text-blue-900",
    icon:     <Info className="w-4 h-4 text-[#1a73e8] shrink-0" />,
    label:    "Info",
    labelCls: "text-[#1a73e8]",
  },
  "auth-error": {
    bar:      "bg-amber-500",
    pill:     "bg-amber-50 border-amber-200 text-amber-900",
    icon:     <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />,
    label:    "Google Auth",
    labelCls: "text-amber-600",
  },
} as const;

const TOAST_DARK_CFG = {
  success:    { label: "text-emerald-400", border: "border-emerald-500/25", glow: "shadow-emerald-500/10" },
  error:      { label: "text-red-400",     border: "border-red-500/25",     glow: "shadow-red-500/10"     },
  info:       { label: "text-blue-400",    border: "border-blue-500/25",    glow: "shadow-blue-500/10"    },
  "auth-error":{ label: "text-amber-400", border: "border-amber-500/25",   glow: "shadow-amber-500/10"   },
} as const;

const SyncToastBanner: React.FC = () => {
  const { syncToast, clearSyncToast, handleGoogleSignIn, theme } = useFinance();
  if (!syncToast) return null;
  const cfg   = TOAST_CFG[syncToast.type];
  const dark  = TOAST_DARK_CFG[syncToast.type];
  const isAuthError = syncToast.type === "auth-error";
  const isLight = theme === "light";

  const handleReconnect = async () => {
    clearSyncToast();
    await handleGoogleSignIn();
  };

  /* ── theme-aware classes ── */
  const wrapCls = isLight
    ? `${cfg.pill} shadow-xl`
    : `bg-[#0d111a] ${dark.border} border text-white shadow-2xl ${dark.glow}`;
  const labelCls = isLight ? cfg.labelCls : dark.label;
  const msgCls   = isLight ? "" : "text-[#d0d6e0]";
  const closeCls = isLight ? "" : "text-[#888] hover:text-white";

  return (
    <div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col overflow-hidden rounded-xl border ${isLight ? "border-transparent" : ""} text-sm font-medium animate-in slide-in-from-bottom-2 duration-200`}
      style={{ minWidth: 300, maxWidth: 520 }}
    >
      {/* Colored top accent bar */}
      <div className={`h-[3px] w-full ${cfg.bar}`} />

      {/* Body */}
      <div className={`flex items-start gap-3 px-4 py-3.5 ${wrapCls}`}>
        {cfg.icon}
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${labelCls}`}>
            {cfg.label}
          </p>
          <p className={`text-[13px] font-medium leading-snug ${msgCls}`}>{syncToast.message}</p>
          {isAuthError && (
            <button
              onClick={handleReconnect}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold transition-colors"
            >
              🔄 Reconnect Google Sheets
            </button>
          )}
        </div>
        <button
          onClick={clearSyncToast}
          className={`p-1 rounded-full opacity-40 hover:opacity-100 transition-opacity shrink-0 mt-0.5 ${closeCls}`}
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

const GlobalConfirmModal: React.FC = () => {
  const { confirmModal, clearConfirmModal, theme } = useFinance();
  if (!confirmModal) return null;
  const isLight = theme === "light";
  const bg   = isLight ? "bg-white"   : "bg-[#181c24]";
  const bdr  = isLight ? "border-slate-200" : "border-[#2a3140]";
  const txt  = isLight ? "text-slate-800" : "text-slate-100";
  const txt2 = isLight ? "text-slate-500" : "text-slate-400";
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={clearConfirmModal} />
      <div className={`relative z-10 rounded-xl shadow-2xl border ${bdr} ${bg} w-full max-w-sm p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`font-bold text-sm ${txt}`}>⚠️ Confirm</h2>
          <button onClick={clearConfirmModal} className={`w-7 h-7 flex items-center justify-center rounded text-lg ${txt2} hover:opacity-70`}>×</button>
        </div>
        <p className={`text-xs leading-relaxed mb-5 ${txt2}`}>{confirmModal.message}</p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={clearConfirmModal} className={`text-xs px-4 py-2 rounded border ${bdr} ${txt2} hover:opacity-70`}>Cancel</button>
          <button onClick={() => { clearConfirmModal(); confirmModal.onConfirm(); }} className="text-xs px-5 py-2 rounded text-white font-semibold hover:opacity-90" style={{ background:"#1a6b36" }}>
            ✓ Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

const GlobalDatePickerModal: React.FC = () => {
  const { datePickerModal, clearDatePickerModal, theme } = useFinance() as any;
  const [picked, setPicked] = React.useState<string>("");

  React.useEffect(() => {
    if (datePickerModal) setPicked(datePickerModal.defaultDate);
  }, [datePickerModal]);

  if (!datePickerModal) return null;
  const isLight = theme === "light";
  const bg   = isLight ? "bg-white"   : "bg-[#181c24]";
  const bdr  = isLight ? "border-slate-200" : "border-[#2a3140]";
  const txt  = isLight ? "text-slate-800" : "text-slate-100";
  const txt2 = isLight ? "text-slate-500" : "text-slate-400";
  const inp  = isLight
    ? "bg-slate-50 border-slate-300 text-slate-800"
    : "bg-[#1e1e1e] border-[#333] text-white";

  const handleConfirm = () => {
    datePickerModal.onConfirm(picked || datePickerModal.defaultDate);
    clearDatePickerModal();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={clearDatePickerModal} />
      <div className={`relative z-10 rounded-xl shadow-2xl border ${bdr} ${bg} w-full max-w-sm p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`font-bold text-sm ${txt}`}>📅 Payment Date</h2>
          <button onClick={clearDatePickerModal} className={`w-7 h-7 flex items-center justify-center rounded text-lg ${txt2} hover:opacity-70`}>×</button>
        </div>
        <p className={`text-xs leading-relaxed mb-4 ${txt2}`}>{datePickerModal.message}</p>
        <input
          type="date"
          value={picked}
          onChange={e => setPicked(e.target.value)}
          className={`w-full px-3 py-2 rounded-lg border text-sm font-medium focus:outline-none mb-5 ${inp}`}
        />
        <div className="flex items-center justify-end gap-2">
          <button onClick={clearDatePickerModal} className={`text-xs px-4 py-2 rounded border ${bdr} ${txt2} hover:opacity-70`}>Cancel</button>
          <button onClick={handleConfirm} className="text-xs px-5 py-2 rounded text-white font-semibold hover:opacity-90" style={{ background:"#1a6b36" }}>
            ✓ Mark Paid
          </button>
        </div>
      </div>
    </div>
  );
};

const PortalContent: React.FC = () => {
  const { currentPage, setCurrentPage, isLoading, theme, activeMember, needsAuth,
          apBills, bankAccounts, loans, arItems, lastSyncedAt, syncLogs } = useFinance();

  // ── Keep-alive ping — prevents Render free-tier sleep (every 12 min) ────
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/health", { cache: "no-store" }).catch(() => {});
    }, 12 * 60 * 1000); // 12 minutes — Render sleeps after 15 min idle
    return () => clearInterval(id);
  }, []);

  // ── Scheduled portal audit (fires every 48 h, after data loads) ─────────
  const [auditFindings, setAuditFindings] = useState<AuditFinding[] | null>(null);
  const [auditTs, setAuditTs]             = useState<number>(0);
  const [auditOpen, setAuditOpen]         = useState(false);

  useEffect(() => {
    if (isLoading) return;                          // wait until data is ready
    if (!shouldRunAudit()) return;                  // not yet 48 h since last run
    const ts       = Date.now();
    const findings = runPortalAudit({
      apBills:      apBills      || [],
      bankAccounts: bankAccounts || [],
      loans:        loans        || [],
      arItems:      arItems      || [],
      lastSyncedAt: lastSyncedAt || null,
      syncLogs:     syncLogs     || [],
    });
    saveAuditResult({ ts, findings });
    setAuditFindings(findings);
    setAuditTs(ts);
    // Brief delay so the portal finishes rendering before the modal pops
    setTimeout(() => setAuditOpen(true), 2_500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  if (isLoading) {
    const LOGOS = [
      { src: "/logos/rubys.png",       alt: "Ruby's",      bg: "#eef1f8" },
      { src: "/logos/msdx.png",        alt: "MSDx",        bg: "#0d1f3c" },
      { src: "/logos/ti.png",          alt: "TI",          bg: "#eef1f8" },
      { src: "/logos/4yr.png",         alt: "4You Pros",   bg: "#eef1f8" },
      { src: "/logos/curcuminpro.jpg", alt: "CurcuminPro", bg: "#eef1f8" },
      { src: "/logos/ziglar.jpg",      alt: "Ziglar",      bg: "#eef1f8" },
    ];
    const ORBIT_DUR = 14;
    const ORBIT_R   = 180;
    const isLight   = theme === "light";
    return (
      <div
        className="flex h-screen w-screen items-center justify-center overflow-hidden relative"
        style={{ background: isLight ? "#f1f5f9" : "linear-gradient(180deg,#0e2040 0%,#0c1a2e 50%,#091626 100%)" }}
      >
        <style>{`
          @keyframes lo-spin    { from{transform:rotate(0deg)}    to{transform:rotate(360deg)} }
          @keyframes lo-counter { from{transform:translateX(${ORBIT_R}px) rotate(0deg)}
                                  to  {transform:translateX(${ORBIT_R}px) rotate(-360deg)} }
          @keyframes lo-pulse   { 0%,100%{border-color:rgba(100,160,255,.12)} 50%{border-color:rgba(100,160,255,.28)} }
          @keyframes lo-dot     { 0%,100%{opacity:.4} 50%{opacity:1} }
        `}</style>

        {/* Subtle grid overlay (dark mode only) */}
        {!isLight && (
          <div style={{
            position:"absolute",inset:0,pointerEvents:"none",
            backgroundImage:"linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px)",
            backgroundSize:"48px 48px",
            maskImage:"radial-gradient(ellipse 80% 80% at 50% 50%,black 20%,transparent 75%)",
            WebkitMaskImage:"radial-gradient(ellipse 80% 80% at 50% 50%,black 20%,transparent 75%)",
          }} />
        )}

        {/* Radial glow */}
        <div style={{
          position:"absolute",inset:0,pointerEvents:"none",
          background:`radial-gradient(ellipse 55% 55% at 50% 50%,${isLight ? "rgba(26,115,232,.07)" : "rgba(26,115,232,.15)"} 0%,transparent 70%)`,
        }} />

        {/* Orbit stage */}
        <div style={{ position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:0,height:0,pointerEvents:"none" }}>
          {/* Dashed orbit track */}
          <div style={{
            position:"absolute",
            top:-(ORBIT_R+24),left:-(ORBIT_R+24),
            width:(ORBIT_R+24)*2,height:(ORBIT_R+24)*2,
            borderRadius:"50%",
            border:"1px dashed rgba(100,160,255,.18)",
            animation:"lo-pulse 4s ease-in-out infinite",
          }} />
          {/* Orbiting logos */}
          {LOGOS.map((logo, i) => (
            <div key={logo.alt} style={{
              position:"absolute",top:0,left:0,width:0,height:0,
              animation:`lo-spin ${ORBIT_DUR}s linear infinite`,
              animationDelay:`${-(ORBIT_DUR/LOGOS.length)*i}s`,
            }}>
              <div style={{
                position:"absolute",top:-22,left:-22,
                width:44,height:44,borderRadius:12,
                background:logo.bg,padding:5,overflow:"hidden",
                boxShadow:"0 4px 20px rgba(0,0,0,.4),0 0 0 2px rgba(255,255,255,.18)",
                animation:`lo-counter ${ORBIT_DUR}s linear infinite`,
                animationDelay:`${-(ORBIT_DUR/LOGOS.length)*i}s`,
              }}>
                <img src={logo.src} alt={logo.alt} style={{ width:"100%",height:"100%",objectFit:"contain",borderRadius:7,display:"block" }} />
              </div>
            </div>
          ))}
        </div>

        {/* Centre label */}
        <div className="relative z-10 flex flex-col items-center gap-3 select-none">
          <div className={`text-sm font-bold tracking-wide ${isLight ? "text-slate-700" : "text-slate-200"}`}>
            Loading FinanceOps Hub…
          </div>
          <div className="flex items-center gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} style={{ width:5,height:5,borderRadius:"50%",background:"#1a73e8",animation:`lo-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case "hub":
        return <HubPage />;
      case "ap":
        return <APPage />;
      case "ap-calendar":
        return <PayablesCalendarPage />;
      case "banks":
        return <BankBalancesPage />;
      case "loans":
        return <LoansPage />;
      case "ar":
        return <ARPage />;
      case "statements":
        return <BankStatementsPage />;
      case "payroll":
        return <PayrollPage />;
      case "calendar":
        return <CalendarPage />;
      case "rubys":
        return <APPage filterEntityOverride="Ruby's" />;
      case "ti":
        return <APPage filterEntityOverride="TI" />;
      case "msdx":
        return <GasDashboardView entityKey="msdx" title="Mobile Swallowing Diagnostics" />;
      case "curcumin":
        return <GasDashboardView entityKey="curcumin" title="CurcuminPRO" />;
      case "fouryr":
        return <GasDashboardView entityKey="fouryr" title="4YR Payroll" />;
      case "ziglar":
        return <GasDashboardView entityKey="ziglar" title="Ziglar" />;
      case "workspace-tools":
        return <WorkspacePage initialCategory="tools" />;
      case "workspace-platforms":
        return <WorkspacePage initialCategory="platforms" />;
      case "workspace-drive":
        return <WorkspacePage initialCategory="drive" />;
      case "member-workspace":
        return (
          <MemberWorkspacePage
            key={activeMember?.id || "mem-default"}
            memberId={activeMember?.id || "mem-default"}
            memberName={activeMember?.name || "Team Member"}
            memberColor={activeMember?.color}
          />
        );
      case "datasync":
        return <DataSyncPage />;
      case "notes":
        return <NotesPage />;
      case "headleys":
        return <HeadleysPage />;
      case "fouryr-payroll":
        return <FourYrPayrollPage />;
      case "logs":
        return <LogsPage />;
      case "service-limits":
        return <ServiceLimitsPage />;
      case "help":
        return <HelpPage />;
      case "receipt-renamer":
        return <ReceiptRenamerPage onBack={() => setCurrentPage("workspace-tools")} />;
      case "bank-statement":
        return <BankStatementPage onBack={() => setCurrentPage("workspace-tools")} />;
      case "pdf-table-extractor":
        return <PDFTableExtractorPage onBack={() => setCurrentPage("workspace-tools")} />;
      case "email-scanner":
        return <EmailInboxScannerPage onBack={() => setCurrentPage("workspace-tools")} />;
      case "cc-expenses":
        return <CCExpensePage />;
      case "workflows":
        return <WorkflowsPage />;
      default:
        return <HubPage />;
    }
  };

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${theme === "light" ? "bg-slate-100 text-slate-900" : "bg-[#0a0a0a] text-white"}`}>
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main Content View */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden pb-14 md:pb-0 relative">
        <ErrorBoundary label={currentPage}>
          {renderPage()}
        </ErrorBoundary>
      </main>

      {/* Login Gate — shown only on first visit of each calendar day */}
      <LoginModal isOpen={needsAuth} />

      {/* Floating Notes Widget */}
      <NotesFloatingWidget />

      {/* Alert Toasts — fires on login for critical/warn items */}
      <AlertsToasts isLight={theme === "light"} />

      {/* Scheduled Portal Health Audit — every 48 h */}
      {auditOpen && auditFindings !== null && (
        <PortalAuditModal
          findings={auditFindings}
          auditTs={auditTs}
          isLight={theme === "light"}
          onDismiss={() => setAuditOpen(false)}
          onNavigate={(page) => setCurrentPage(page as any)}
        />
      )}

      {/* Sync Toast Notification */}
      <SyncToastBanner />
      <GlobalDatePickerModal />

      {/* Global Confirm Modal — replaces all window.confirm native dialogs */}
      <GlobalConfirmModal />

      {/* Global Search — Ctrl+K */}
      <GlobalSearchModal />

      {/* Mobile Bottom Navigation */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 ${theme === "light" ? "bg-white border-slate-200" : "bg-[#0f0f0f] border-[#262626]"} border-t flex justify-around items-center py-2 px-1 z-50 text-[10px]`}>
        <button
          onClick={() => setCurrentPage("hub")}
          className={`flex flex-col items-center gap-1 ${
            currentPage === "hub" ? "text-[#1a73e8]" : "text-[#888]"
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          Hub
        </button>
        <button
          onClick={() => setCurrentPage("ap")}
          className={`flex flex-col items-center gap-1 ${
            currentPage === "ap" ? "text-[#1a73e8]" : "text-[#888]"
          }`}
        >
          <CreditCard className="w-5 h-5" />
          AP
        </button>
        <button
          onClick={() => setCurrentPage("banks")}
          className={`flex flex-col items-center gap-1 ${
            currentPage === "banks" ? "text-[#1a73e8]" : "text-[#888]"
          }`}
        >
          <Landmark className="w-5 h-5" />
          Banks
        </button>
        <button
          onClick={() => setCurrentPage("payroll")}
          className={`flex flex-col items-center gap-1 ${
            currentPage === "payroll" ? "text-[#1a73e8]" : "text-[#888]"
          }`}
        >
          <Users className="w-5 h-5" />
          Payroll
        </button>
        <button
          onClick={() => setCurrentPage("calendar")}
          className={`flex flex-col items-center gap-1 ${
            currentPage === "calendar" ? "text-[#1a73e8]" : "text-[#888]"
          }`}
        >
          <CalendarDays className="w-5 h-5" />
          Calendar
        </button>
      </nav>
    </div>
  );
};

export default function App() {
  return (
    <FinanceProvider>
      <AlertsProvider>
        <TooltipProvider>
          <PortalContent />
        </TooltipProvider>
      </AlertsProvider>
    </FinanceProvider>
  );
}
