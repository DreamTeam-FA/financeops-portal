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
import { NotesFloatingWidget } from "./components/modals/NotesFloatingWidget";
import { ScreenshotButton } from "./components/ScreenshotButton";
import { LoginModal } from "./components/modals/LoginModal";
import {
  LayoutDashboard,
  CreditCard,
  Landmark,
  Users,
  CalendarDays
} from "lucide-react";

const SyncToastBanner: React.FC = () => {
  const { syncToast, clearSyncToast, theme } = useFinance();
  if (!syncToast) return null;
  const colors = {
    success: "bg-emerald-600 text-white border-emerald-500",
    error:   "bg-red-600 text-white border-red-500",
    info:    "bg-[#1a73e8] text-white border-blue-400",
  };
  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-2.5 rounded-lg border shadow-lg text-sm font-medium transition-all ${colors[syncToast.type]}`}
      style={{ minWidth: 260, maxWidth: 480 }}
    >
      <span className="flex-1">{syncToast.message}</span>
      <button onClick={clearSyncToast} className="opacity-70 hover:opacity-100 text-base leading-none">✕</button>
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

      {/* Screenshot Button */}
      <ScreenshotButton />

      {/* Sync Toast Notification */}
      <SyncToastBanner />

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
