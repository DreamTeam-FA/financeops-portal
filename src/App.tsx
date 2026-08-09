import React from "react";
import { FinanceProvider, useFinance } from "./context/FinanceContext";
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
import { NotesFloatingWidget } from "./components/modals/NotesFloatingWidget";
import { LoginModal } from "./components/modals/LoginModal";
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

const SyncToastBanner: React.FC = () => {
  const { syncToast, clearSyncToast, handleGoogleSignIn } = useFinance();
  if (!syncToast) return null;
  const cfg = TOAST_CFG[syncToast.type];
  const isAuthError = syncToast.type === "auth-error";

  const handleReconnect = async () => {
    clearSyncToast();
    await handleGoogleSignIn();
  };

  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col overflow-hidden rounded-xl border shadow-xl text-sm font-medium"
      style={{ minWidth: 300, maxWidth: 520 }}
    >
      {/* Colored top accent bar */}
      <div className={`h-1 w-full ${cfg.bar}`} />

      {/* Body */}
      <div className={`flex items-start gap-3 px-4 py-3 ${cfg.pill}`}>
        {cfg.icon}
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${cfg.labelCls}`}>
            {cfg.label}
          </p>
          <p className="text-[13px] font-medium leading-snug">{syncToast.message}</p>
          {isAuthError && (
            <button
              onClick={handleReconnect}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold transition-colors shadow-xs"
            >
              🔄 Reconnect Google Sheets
            </button>
          )}
        </div>
        <button
          onClick={clearSyncToast}
          className="p-0.5 rounded-full opacity-40 hover:opacity-100 transition-opacity shrink-0 mt-0.5"
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
          <button onClick={confirmModal.onConfirm} className="text-xs px-5 py-2 rounded text-white font-semibold hover:opacity-90" style={{ background:"#1a6b36" }}>
            ✓ Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

const PortalContent: React.FC = () => {
  const { currentPage, setCurrentPage, isLoading, theme, activeMember, needsAuth } = useFinance();

  if (isLoading) {
    return (
      <div className={`flex h-screen w-screen items-center justify-center ${theme === "light" ? "bg-slate-100 text-slate-800" : "bg-[#0a0a0a] text-white"} text-sm font-semibold`}>
        Loading FinanceOps Hub...
      </div>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case "hub":
        return <HubPage />;
      case "ap":
        return <APPage />;
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
        return <APPage filterEntityOverride="MSDx" />;
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
        {renderPage()}
      </main>

      {/* Login Gate Modal */}
      <LoginModal isOpen={needsAuth} />

      {/* Floating Notes Widget */}
      <NotesFloatingWidget />

      {/* Sync Toast Notification */}
      <SyncToastBanner />

      {/* Global Confirm Modal — replaces all window.confirm native dialogs */}
      <GlobalConfirmModal />

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
      <PortalContent />
    </FinanceProvider>
  );
}
