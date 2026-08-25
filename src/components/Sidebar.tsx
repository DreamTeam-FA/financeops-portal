import React, { useState, useMemo } from "react";
import { AlertsBell } from "./AlertsCenter";
import { Tooltip } from "./Tooltip";
import { useFinance } from "../context/FinanceContext";
import { getUserGreetingName } from "../utils/userGreeting";
import { formatPossessiveName, formatCleanName } from "../utils/formatters";
import { UserSwitchModal } from "./modals/UserSwitchModal";
import { GearDropdown } from "./modals/GearDropdown";
import {
  RubysLogo,
  TILogo,
  MSDxLogo,
  CurcuminLogo,
  ZiglarLogo,
  FourYrLogo
} from "./EntityLogos";
import {
  Landmark,
  LayoutDashboard,
  CreditCard,
  Banknote,
  TrendingDown,
  Receipt,
  FileText,
  Users,
  CalendarDays,
  ExternalLink,
  ChevronRight,
  Mail,
  LogOut,
  RefreshCw,
  FileSpreadsheet,
  Link as LinkIcon,
  StickyNote,
  Wrench,
  Globe,
  Folder,
  User as UserIcon,
  Plus,
  FolderPlus,
  UserPlus,
  X,
  PieChart,
  BarChart3,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Search
} from "lucide-react";
import { PageRoute, ExternalLinkItem } from "../types";

export const Sidebar: React.FC = () => {
  const {
    currentPage,
    setCurrentPage,
    selectedEntities,
    setSelectedEntities,
    userEmail,
    googleUser,
    theme,
    externalLinks,
    addExternalLink,
    activeMember,
    setActiveMember,
    signOutUser,
    isSidebarFolded,
    toggleSidebarFold,
    syncAllFromGoogleSheets,
    isSyncing,
    apBills,
    loans,
    bankStatements,
    quickNotes,
    calendarLocalEvents,
  } = useFinance() as any;

  const greetingName = getUserGreetingName(userEmail, googleUser?.displayName);

  // Custom member workspaces state
  const [memberWorkspaces, setMemberWorkspaces] = useState<
    { id: string; name: string; color: string }[]
  >([
    { id: "mem-norlan", name: "Norlan", color: "#3b82f6" },
    { id: "mem-micah", name: "Micah", color: "#eab308" },
    { id: "mem-monica", name: "Monica", color: "#ec4899" }
  ]);

  // Modal states for adding workspace items / members
  const [showAddWorkspaceModal, setShowAddWorkspaceModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  const [wsName, setWsName] = useState("");
  const [wsUrl, setWsUrl] = useState("");
  const [wsType, setWsType] = useState<"tools" | "platforms" | "drive">("tools");

  const [memberName, setMemberName] = useState("");
  const [memberColor, setMemberColor] = useState("#a855f7");
  const [isUserSwitchModalOpen, setIsUserSwitchModalOpen] = useState(false);

  const handleCreateWorkspaceItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsName.trim()) return;
    addExternalLink({
      name: wsName.trim(),
      url: wsUrl.trim() || "https://drive.google.com",
      iconType: wsType === "drive" ? "sheet" : wsType === "tools" ? "users" : "calendar",
      category: wsType === "drive" ? "entities" : "quicklinks"
    });
    setWsName("");
    setWsUrl("");
    setShowAddWorkspaceModal(false);
  };

  const handleCreateMemberWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim()) return;
    setMemberWorkspaces((prev) => [
      ...prev,
      {
        id: `mem-${Date.now()}`,
        name: memberName.trim().endsWith("'s") ? memberName.trim() : `${memberName.trim()}'s`,
        color: memberColor
      }
    ]);
    setMemberName("");
    setShowAddMemberModal(false);
  };

  const navItems: { id: PageRoute; label: string; icon: React.ReactNode; badgeKey?: keyof typeof navBadges; badgeColor?: string }[] = [
    { id: "hub",         label: "Finance Overview",    icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "ap",          label: "Accounts Payables",   icon: <Banknote className="w-4 h-4" />,     badgeKey: "ap",         badgeColor: "bg-red-500" },
    { id: "ar",          label: "Accounts Receivables",icon: <Receipt className="w-4 h-4" /> },
    { id: "banks",       label: "Bank Balances",       icon: <Landmark className="w-4 h-4" /> },
    { id: "loans",       label: "Loans & CC Dues",     icon: <TrendingDown className="w-4 h-4" />,  badgeKey: "loans",      badgeColor: "bg-orange-500" },
    { id: "statements",  label: "Bank Statements",     icon: <FileText className="w-4 h-4" />,      badgeKey: "statements", badgeColor: "bg-amber-500" },
    { id: "calendar",    label: "Calendar",            icon: <CalendarDays className="w-4 h-4" />,  badgeKey: "calendar",   badgeColor: "bg-blue-500" },
    { id: "notes",       label: "Quick Notes",         icon: <StickyNote className="w-4 h-4 text-purple-400" />, badgeKey: "notes", badgeColor: "bg-purple-500" },
    { id: "cc-expenses", label: "CC Expenses",         icon: <CreditCard className="w-4 h-4" /> }
  ];

  const userInitial = userEmail ? userEmail.slice(0, 2).toUpperCase() : "MC";
  const isLight = theme === "light";

  // ── Nav badge counts ────────────────────────────────────────────────────────
  const navBadges = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7Days = new Date(today); in7Days.setDate(today.getDate() + 7);

    // AP: unpaid bills (status not "paid")
    const apOpen = (apBills as any[] || []).filter((b: any) =>
      b.status && !["paid", "done", "completed"].includes((b.status || "").toLowerCase())
    ).length;

    // Loans: upcoming due within 7 days or overdue
    const loansAlert = (loans as any[] || []).filter((l: any) => {
      if (!l.nextDueDate) return false;
      const d = new Date(l.nextDueDate);
      return !isNaN(d.getTime()) && d <= in7Days;
    }).length;

    // Bank Statements: unchecked/pending items
    const stmtsPending = (bankStatements as any[] || []).filter((s: any) =>
      s.status && !["done", "complete", "completed", "checked"].includes((s.status || "").toLowerCase())
    ).length;

    // Calendar: events within the next 7 days
    const calUpcoming = (calendarLocalEvents as any[] || []).filter((ev: any) => {
      if (!ev.date && !ev.startDate) return false;
      const d = new Date(ev.date || ev.startDate);
      return !isNaN(d.getTime()) && d >= today && d <= in7Days;
    }).length;

    // Quick Notes: open notes
    const notesOpen = (quickNotes as any[] || []).filter((n: any) =>
      !n.status || n.status === "open"
    ).length;

    return { ap: apOpen, loans: loansAlert, statements: stmtsPending, calendar: calUpcoming, notes: notesOpen };
  }, [apBills, loans, bankStatements, calendarLocalEvents, quickNotes]);

  const renderLinkIcon = (link: ExternalLinkItem) => {
    if (link.iconType === "users") return <Users className="w-3.5 h-3.5 text-purple-500 shrink-0" />;
    if (link.iconType === "mail") return <Mail className="w-3.5 h-3.5 text-red-400 shrink-0" />;
    if (link.iconType === "calendar") return <CalendarDays className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    if (link.iconType === "sheet") {
      return (
        <span
          className="w-3.5 h-3.5 rounded shrink-0"
          style={{ backgroundColor: link.color || "#16a34a" }}
        />
      );
    }
    return <LinkIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
  };

  const entityExternalLinks = externalLinks.filter(
    (l) => l.category === "entities" || !l.category
  );
  const quickLinks = externalLinks.filter((l) => l.category === "quicklinks");

  return (
    <aside
      className={`${
        isSidebarFolded ? "w-16" : "w-[240px]"
      } shrink-0 ${
        isLight ? "bg-white border-slate-200 text-slate-800" : "border-[#1a2235] text-[#c8d4e8]"
      } border-r flex flex-col h-screen overflow-y-auto overflow-x-hidden transition-all duration-200 ease-in-out`}
      style={isLight ? {} : {
        background: "linear-gradient(180deg, #080d18 0%, #060a11 40%, #060a11 100%)",
        boxShadow: "inset -1px 0 0 rgba(26,34,53,0.6), 2px 0 16px rgba(0,0,0,0.4)"
      }}
    >
      {/* Brand Header */}
      <div
        className={`flex items-center ${
          isSidebarFolded ? "justify-center p-3" : "justify-between p-4"
        } border-b ${isLight ? "border-slate-200" : "border-[#1a2235]"} shrink-0 ${
          isLight ? "" : "bg-gradient-to-b from-[#0a1020] to-[#060a11]"
        }`}
      >
        {!isSidebarFolded ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 text-white shadow-md">
              <Landmark className="w-4 h-4" />
            </div>
            <div>
              <div className={`text-[13px] font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"} leading-tight`}>
                FinanceOps
              </div>
              <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#6a7f9e]"}`}>Company Portal</div>
              <div className="text-[10px] font-semibold text-blue-500 mt-0.5">® Made by Finance Team</div>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 text-white shadow-md" title="FinanceOps Portal">
            <Landmark className="w-4 h-4" />
          </div>
        )}

        <button
          onClick={toggleSidebarFold}
          className={`p-1.5 rounded-lg transition-all ${
            isLight ? "hover:bg-slate-100 text-slate-400 hover:text-slate-700" : "hover:bg-[#1a2235] text-[#3d5478] hover:text-[#7a90b0]"
          } cursor-pointer`}
          title={isSidebarFolded ? "Expand Sidebar" : "Fold Sidebar"}
        >
          {isSidebarFolded ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Global Search trigger */}
      <div className={`px-2 pt-2.5 pb-1 border-b ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
        <Tooltip label="Search (Ctrl+K)" disabled={!isSidebarFolded}>
          <button
            onClick={() => window.dispatchEvent(new Event("open-global-search"))}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left group ${
              isLight
                ? "bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                : "bg-[#0d111a] hover:bg-[#151c29] text-[#4a6080] hover:text-[#7a90b0] border border-[#1a2235]"
            }`}
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            {!isSidebarFolded && (
              <>
                <span className="text-[12px] flex-1">Search…</span>
                <kbd className={`text-[9px] font-mono px-1 py-0.5 rounded ${
                  isLight ? "bg-slate-200 text-slate-500" : "bg-[#1a2235] text-[#4a6080]"
                }`}>⌃K</kbd>
              </>
            )}
          </button>
        </Tooltip>
      </div>

      {/* Main Dashboards Section */}
      <div className="px-2 pt-3 pb-2">
        {!isSidebarFolded && (
          <div className={`flex items-center gap-2 px-3 mb-1.5`}>
            <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? "text-slate-400" : "text-[#3d5478]"}`}>Dashboards</span>
            <div className={`flex-1 h-px ${isLight ? "bg-slate-200" : "bg-[#1a2235]"}`} />
            <AlertsBell isLight={isLight} />
          </div>
        )}
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const badgeCount = item.badgeKey ? (navBadges[item.badgeKey] ?? 0) : 0;
          const showBadge = badgeCount > 0;
          return (
            <Tooltip key={item.id} label={item.label} disabled={!isSidebarFolded}>
            <button
              onClick={() => {
                if (item.id === "ap") {
                  setSelectedEntities(new Set(["ALL"]));
                }
                setCurrentPage(item.id);
              }}
              className={`w-full flex items-center ${
                isSidebarFolded ? "justify-center px-0 py-2" : "gap-2.5 px-3 py-1.5"
              } rounded-md text-[13px] font-medium transition-all duration-150 relative ${
                isActive
                  ? isLight
                    ? "bg-blue-50 text-blue-700 font-semibold nav-active-pill shadow-[inset_0_1px_0_rgba(255,255,255,.8),0_1px_4px_rgba(37,99,235,.08)]"
                    : "bg-[#0d1e3a] text-blue-300 font-semibold nav-active-pill shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_0_12px_rgba(59,130,246,.08)]"
                  : isLight
                    ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    : "text-[#7a90b0] hover:bg-[#0d1525] hover:text-[#c8d4e8]"
              }`}
            >
              {/* Icon + badge dot (folded) */}
              <span className={`shrink-0 relative ${isActive ? (isLight ? "text-blue-600" : "text-blue-400") : ""}`}>
                {item.icon}
                {showBadge && isSidebarFolded && (
                  <span className={`absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full ${item.badgeColor || "bg-red-500"} text-white text-[8px] font-black flex items-center justify-center px-0.5 leading-none`}>
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </span>
              {!isSidebarFolded && (
                <>
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {showBadge && (
                    <span className={`shrink-0 min-w-[18px] h-[18px] rounded-full ${item.badgeColor || "bg-red-500"} text-white text-[10px] font-black flex items-center justify-center px-1 leading-none`}>
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </>
              )}
            </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Entities Section */}
      <div className={`px-2 pt-3 pb-2 border-t ${isLight ? "border-slate-100" : "border-[#1a2235]"}`}>
        {!isSidebarFolded && (
          <div className="flex items-center gap-2 px-3 mb-1.5">
            <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? "text-slate-400" : "text-[#3d5478]"}`}>Entities AP Views</span>
            <div className={`flex-1 h-px ${isLight ? "bg-slate-200" : "bg-[#1a2235]"}`} />
          </div>
        )}
        {/* 1. Ruby's */}
        {(() => {
          const isRubysActive = currentPage === "rubys" || (currentPage === "ap" && selectedEntities.has("Ruby's") && selectedEntities.size === 1);
          return (
            <Tooltip label="Ruby's Pizzeria & Grill" sublabel="Accounts Payable View" color="#ec4899">
            <button
              onClick={() => { setSelectedEntities(new Set(["Ruby's"])); setCurrentPage("rubys"); }}
              className={`w-full flex items-center ${isSidebarFolded ? "justify-center px-0 py-2" : "justify-between gap-2 px-3 py-2"} rounded-lg transition-all relative overflow-hidden ${
                isRubysActive
                  ? isLight
                    ? "bg-pink-100 border border-pink-300 shadow-[0_2px_10px_rgba(236,72,153,.2)]"
                    : "bg-pink-900/30 border border-pink-700/50 shadow-[0_2px_10px_rgba(236,72,153,.25)]"
                  : isLight ? "hover:bg-slate-50 border border-transparent" : "hover:bg-[#0a1220] border border-transparent"
              }`}
            >
              {isRubysActive && !isSidebarFolded && (
                <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-pink-500 rounded-r" />
              )}
              {isSidebarFolded ? (
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-xs transition-all ${
                  isRubysActive ? "bg-pink-500 text-white shadow-md shadow-pink-500/40" : "bg-pink-500/15 text-pink-400"
                }`}>R</span>
              ) : (
                <>
                  <RubysLogo className="h-7 max-w-[150px]" isLight={isLight} />
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${
                    isRubysActive ? "bg-pink-500 text-white" : "bg-pink-500/10 text-pink-500"
                  }`}>AP</span>
                </>
              )}
            </button>
            </Tooltip>
          );
        })()}

        {/* 2. TI */}
        {(() => {
          const isTIActive = currentPage === "ti" || (currentPage === "ap" && selectedEntities.has("TI") && selectedEntities.size === 1);
          return (
            <Tooltip label="Timm Investments LLC" sublabel="Accounts Payable View" color="#3b82f6">
            <button
              onClick={() => { setSelectedEntities(new Set(["TI"])); setCurrentPage("ti"); }}
              className={`w-full flex items-center ${isSidebarFolded ? "justify-center px-0 py-2" : "justify-between gap-2 px-3 py-2"} rounded-lg transition-all relative overflow-hidden ${
                isTIActive
                  ? isLight
                    ? "bg-blue-100 border border-blue-300 shadow-[0_2px_10px_rgba(59,130,246,.2)]"
                    : "bg-blue-900/30 border border-blue-700/50 shadow-[0_2px_10px_rgba(59,130,246,.25)]"
                  : isLight ? "hover:bg-slate-50 border border-transparent" : "hover:bg-[#0a1220] border border-transparent"
              }`}
            >
              {isTIActive && !isSidebarFolded && (
                <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 rounded-r" />
              )}
              {isSidebarFolded ? (
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-xs transition-all ${
                  isTIActive ? "bg-blue-500 text-white shadow-md shadow-blue-500/40" : "bg-blue-500/15 text-blue-400"
                }`}>TI</span>
              ) : (
                <>
                  <TILogo className="h-7 max-w-[150px]" isLight={isLight} />
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${
                    isTIActive ? "bg-blue-500 text-white" : "bg-blue-500/10 text-blue-500"
                  }`}>AP</span>
                </>
              )}
            </button>
            </Tooltip>
          );
        })()}

        {/* 3. MSDx */}
        {(() => {
          const isMSDxActive = currentPage === "msdx" || (currentPage === "ap" && selectedEntities.has("MSDx") && selectedEntities.size === 1);
          return (
            <Tooltip label="Mobile Swallowing Diagnostics" sublabel="Accounts Payable View" color="#14b8a6">
            <button
              onClick={() => { setSelectedEntities(new Set(["MSDx"])); setCurrentPage("msdx"); }}
              className={`w-full flex items-center ${isSidebarFolded ? "justify-center px-0 py-2" : "justify-between gap-2 px-3 py-2"} rounded-lg transition-all relative overflow-hidden ${
                isMSDxActive
                  ? isLight
                    ? "bg-teal-100 border border-teal-300 shadow-[0_2px_10px_rgba(20,184,166,.2)]"
                    : "bg-teal-900/30 border border-teal-700/50 shadow-[0_2px_10px_rgba(20,184,166,.25)]"
                  : isLight ? "hover:bg-slate-50 border border-transparent" : "hover:bg-[#0a1220] border border-transparent"
              }`}
            >
              {isMSDxActive && !isSidebarFolded && (
                <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-teal-500 rounded-r" />
              )}
              {isSidebarFolded ? (
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-xs transition-all ${
                  isMSDxActive ? "bg-teal-500 text-white shadow-md shadow-teal-500/40" : "bg-teal-500/15 text-teal-400"
                }`}>MS</span>
              ) : (
                <>
                  <MSDxLogo className="h-7 max-w-[150px]" isLight={isLight} />
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${
                    isMSDxActive ? "bg-teal-500 text-white" : "bg-teal-500/10 text-teal-500"
                  }`}>AP</span>
                </>
              )}
            </button>
            </Tooltip>
          );
        })()}
      </div>

      {/* Other Dashboards Section */}
      <div className={`px-2 pt-3 pb-2 border-t ${isLight ? "border-slate-100" : "border-[#1a2235]"}`}>
        {!isSidebarFolded && (
          <div className="flex items-center gap-2 px-3 mb-1.5">
            <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? "text-slate-400" : "text-[#3d5478]"}`}>Other Dashboards</span>
            <div className={`flex-1 h-px ${isLight ? "bg-slate-200" : "bg-[#1a2235]"}`} />
          </div>
        )}

        <Tooltip label="CurcuminPRO" sublabel="Dashboard" color="#f59e0b">
        <button
          onClick={() => {
            setSelectedEntities(new Set(["CurcuminPro"]));
            setCurrentPage("curcumin");
          }}
          className={`w-full flex items-center ${isSidebarFolded ? "justify-center px-0 py-2" : "justify-between gap-2 px-3 py-2"} rounded-lg transition-all relative overflow-hidden ${
            currentPage === "curcumin"
              ? isLight ? "bg-amber-100 border border-amber-300 shadow-[0_2px_10px_rgba(245,158,11,.2)]" : "bg-amber-900/30 border border-amber-700/50 shadow-[0_2px_10px_rgba(245,158,11,.25)]"
              : isLight ? "hover:bg-slate-50 border border-transparent" : "hover:bg-[#0a1220] border border-transparent"
          }`}
        >
          {currentPage === "curcumin" && !isSidebarFolded && (
            <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-500 rounded-r" />
          )}
          {isSidebarFolded ? (
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-xs transition-all ${currentPage === "curcumin" ? "bg-amber-500 text-white shadow-md shadow-amber-500/40" : "bg-amber-500/15 text-amber-500"}`}>C</span>
          ) : (
            <>
              <CurcuminLogo className="h-7 max-w-[170px]" isLight={isLight} />
              <ChevronRight className="w-3.5 h-3.5 text-[#666] shrink-0" />
            </>
          )}
        </button>
        </Tooltip>

        <Tooltip label="4You Pros" sublabel="4-Year Payroll Dashboard" color="#22c55e">
        <button
          onClick={() => setCurrentPage("fouryr-payroll")}
          className={`w-full flex items-center ${isSidebarFolded ? "justify-center px-0 py-2" : "justify-between gap-2 px-3 py-2"} rounded-lg transition-all relative overflow-hidden ${
            currentPage === "fouryr-payroll"
              ? isLight ? "bg-green-100 border border-green-300 shadow-[0_2px_10px_rgba(34,197,94,.2)]" : "bg-green-900/30 border border-green-700/50 shadow-[0_2px_10px_rgba(34,197,94,.25)]"
              : isLight ? "hover:bg-slate-50 border border-transparent" : "hover:bg-[#0a1220] border border-transparent"
          }`}
        >
          {currentPage === "fouryr-payroll" && !isSidebarFolded && (
            <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-green-500 rounded-r" />
          )}
          {isSidebarFolded ? (
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-xs transition-all ${currentPage === "fouryr-payroll" ? "bg-green-500 text-white shadow-md shadow-green-500/40" : "bg-green-500/15 text-green-500"}`}>4Y</span>
          ) : (
            <>
              <FourYrLogo className="h-7 max-w-[170px]" isLight={isLight} />
              <ChevronRight className="w-3.5 h-3.5 text-[#666] shrink-0" />
            </>
          )}
        </button>
        </Tooltip>

        <Tooltip label="Ziglar" sublabel="Dashboard" color="#6366f1">
        <button
          onClick={() => {
            setSelectedEntities(new Set(["Ziglar"]));
            setCurrentPage("ziglar");
          }}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-all relative overflow-hidden ${
            currentPage === "ziglar"
              ? isLight ? "bg-indigo-100 border border-indigo-300 shadow-[0_2px_10px_rgba(99,102,241,.2)]" : "bg-indigo-900/30 border border-indigo-700/50 shadow-[0_2px_10px_rgba(99,102,241,.25)]"
              : isLight ? "hover:bg-slate-50 border border-transparent" : "hover:bg-[#0a1220] border border-transparent"
          }`}
        >
          {currentPage === "ziglar" && (
            <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500 rounded-r" />
          )}
          <ZiglarLogo className="h-7 max-w-[170px]" isLight={isLight} />
          <ChevronRight className="w-3.5 h-3.5 text-[#666] shrink-0" />
        </button>
        </Tooltip>
      </div>

      {/* WORKSPACE Section */}
      <div className={`px-2 pt-3 pb-2 border-t ${isLight ? "border-slate-100" : "border-[#1a2235]"}`}>
        <div className="flex items-center justify-between px-3 mb-1.5">
          <div className="flex items-center gap-2 flex-1">
            <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? "text-slate-400" : "text-[#3d5478]"}`}>WORKSPACE</span>
            <div className={`flex-1 h-px ${isLight ? "bg-slate-200" : "bg-[#1a2235]"}`} />
          </div>
          <Tooltip label="Manage Workspace Spaces">
          <button
            onClick={() => setCurrentPage("workspace-tools")}
            className="text-[#1a73e8] hover:text-[#1557b0] p-0.5 rounded hover:bg-slate-100 dark:hover:bg-[#1a1a1a] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          </Tooltip>
        </div>

        <button
          onClick={() => setCurrentPage("workspace-tools")}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-all relative ${
            currentPage === "workspace-tools"
              ? isLight ? "bg-amber-50 text-amber-800 font-semibold border border-amber-200" : "bg-amber-950/20 text-amber-200 font-semibold border border-amber-900/40 shadow-[0_1px_8px_rgba(245,158,11,.1)]"
              : isLight ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent" : "text-[#7a90b0] hover:bg-[#0d1525] hover:text-[#c8d4e8] border border-transparent"
          }`}
        >
          <Wrench className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="flex-1 text-left truncate font-medium">Tools & sheets</span>
        </button>

        <button
          onClick={() => setCurrentPage("workspace-platforms")}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-all relative ${
            currentPage === "workspace-platforms"
              ? isLight ? "bg-sky-50 text-sky-800 font-semibold border border-sky-200" : "bg-sky-950/20 text-sky-200 font-semibold border border-sky-900/40 shadow-[0_1px_8px_rgba(14,165,233,.1)]"
              : isLight ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent" : "text-[#7a90b0] hover:bg-[#0d1525] hover:text-[#c8d4e8] border border-transparent"
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="flex-1 text-left truncate font-medium">Platforms</span>
        </button>

        <button
          onClick={() => setCurrentPage("workspace-drive")}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-all relative ${
            currentPage === "workspace-drive"
              ? isLight ? "bg-amber-50 text-amber-800 font-semibold border border-amber-200" : "bg-amber-950/20 text-amber-200 font-semibold border border-amber-900/40 shadow-[0_1px_8px_rgba(245,158,11,.1)]"
              : isLight ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent" : "text-[#7a90b0] hover:bg-[#0d1525] hover:text-[#c8d4e8] border border-transparent"
          }`}
        >
          <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="flex-1 text-left truncate font-medium">Drive folders</span>
        </button>
      </div>

      {/* MEMBER'S WORKSPACE Section */}
      <div className={`px-2 pt-3 pb-2 border-t ${isLight ? "border-slate-100" : "border-[#1a2235]"}`}>
        <div className="flex items-center justify-between px-3 mb-1.5">
          <div className="flex items-center gap-2 flex-1">
            <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? "text-slate-400" : "text-[#3d5478]"}`}>MEMBER'S WORKSPACE</span>
            <div className={`flex-1 h-px ${isLight ? "bg-slate-200" : "bg-[#1a2235]"}`} />
          </div>
          <Tooltip label="Add Team Member Workspace">
          <button
            onClick={() => setShowAddMemberModal(true)}
            className="text-[#1a73e8] hover:text-[#1557b0] p-0.5 rounded hover:bg-slate-100 dark:hover:bg-[#1a1a1a] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          </Tooltip>
        </div>

        {memberWorkspaces.map((mem) => {
          const isMemActive = currentPage === "member-workspace" && activeMember?.id === mem.id;
          // Parse hex → rgb components for dynamic rgba() values
          const h = mem.color.replace("#", "");
          const rgb = `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
          const activeStyle: React.CSSProperties = isMemActive ? {
            backgroundColor: isLight ? `rgba(${rgb},0.12)` : `rgba(${rgb},0.18)`,
            borderColor: `rgba(${rgb},0.4)`,
            boxShadow: `0 1px 8px rgba(${rgb},${isLight ? 0.15 : 0.22})`
          } : {};

          return (
            <Tooltip label={`${formatPossessiveName(mem.name)} Workspace`} sublabel="Member Dashboard" color={mem.color}>
            <button
              key={mem.id}
              onClick={() => {
                setActiveMember({ id: mem.id, name: mem.name, color: mem.color });
                setCurrentPage("member-workspace");
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-all border ${
                isMemActive
                  ? isLight ? "font-semibold text-slate-800" : "font-semibold text-[#c8d4e8]"
                  : isLight ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-transparent" : "text-[#7a90b0] hover:bg-[#0d1525] hover:text-[#c8d4e8] border-transparent"
              }`}
              style={activeStyle}
            >
              <UserIcon
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: isMemActive ? mem.color : undefined }}
              />
              <span className="flex-1 text-left truncate font-medium">{formatPossessiveName(mem.name)}</span>
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: mem.color,
                  boxShadow: `0 2px 8px rgba(${rgb},0.55), inset 0 1px 0 rgba(255,255,255,0.07)`
                }}
              />
            </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Quick External Links Section */}
      <div className={`px-2 pt-3 pb-2 border-t ${isLight ? "border-slate-100" : "border-[#1a2235]"}`}>
        <div className="flex items-center gap-2 px-3 mb-1.5">
          <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? "text-slate-400" : "text-[#3d5478]"}`}>Quick Links</span>
          <div className={`flex-1 h-px ${isLight ? "bg-slate-200" : "bg-[#1a2235]"}`} />
        </div>
        {quickLinks.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
              isLight ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900" : "text-[#7a90b0] hover:bg-[#0d1525] hover:text-[#c8d4e8]"
            }`}
          >
            {renderLinkIcon(link)}
            <span className="flex-1 text-left truncate">{link.name}</span>
            <ExternalLink className="w-3 h-3 text-[#555]" />
          </a>
        ))}
      </div>

      {/* Add Workspace Item Modal */}
      {showAddWorkspaceModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-md rounded-xl border p-5 space-y-4 shadow-2xl ${
            isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#121212] border-[#2d2d2d] text-white"
          }`}>
            <div className="flex items-center justify-between border-b pb-2.5 dark:border-[#1a2235]">
              <h3 className="text-sm font-bold flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <FolderPlus className="w-4 h-4" /> Add Workspace Item
              </h3>
              <button onClick={() => setShowAddWorkspaceModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateWorkspaceItem} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  placeholder="e.g. Operations Drive, Marketing Sheet"
                  className={`w-full border rounded-lg p-2 text-xs ${
                    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Category / Type</label>
                <select
                  value={wsType}
                  onChange={(e) => setWsType(e.target.value as any)}
                  className={`w-full border rounded-lg p-2 text-xs ${
                    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"
                  }`}
                >
                  <option value="tools">Tools & sheets</option>
                  <option value="platforms">Platforms</option>
                  <option value="drive">Drive folders</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">URL / Link</label>
                <input
                  type="url"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  placeholder="https://docs.google.com/..."
                  className={`w-full border rounded-lg p-2 text-xs ${
                    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddWorkspaceModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                >
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Member Workspace Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-md rounded-xl border p-5 space-y-4 shadow-2xl ${
            isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#121212] border-[#2d2d2d] text-white"
          }`}>
            <div className="flex items-center justify-between border-b pb-2.5 dark:border-[#1a2235]">
              <h3 className="text-sm font-bold flex items-center gap-2 text-purple-600 dark:text-purple-400">
                <UserPlus className="w-4 h-4" /> Add Member's Workspace
              </h3>
              <button onClick={() => setShowAddMemberModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateMemberWorkspace} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Member Name</label>
                <input
                  type="text"
                  required
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="e.g. Alex, Sarah"
                  className={`w-full border rounded-lg p-2 text-xs ${
                    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Status Dot Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={memberColor}
                    onChange={(e) => setMemberColor(e.target.value)}
                    className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
                  />
                  <span className="text-xs font-mono">{memberColor}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-[16px]" />

      {/* Sidebar Footer */}
      <div className={`border-t ${isLight ? "border-slate-200" : "border-[#1a2235]"} p-2 shrink-0 ${isLight ? "" : "bg-[#060a11]"}`}>
        {!isSidebarFolded ? (
          <>
            <div className="flex items-center gap-2.5 px-2 pb-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-700 flex items-center justify-center text-[12px] font-extrabold text-white shrink-0 shadow-md shadow-blue-500/30 ring-2 ring-blue-500/20">
                {greetingName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[12px] font-bold truncate ${isLight ? "text-slate-900" : "text-white"}`}>{greetingName}</div>
                <div className={`text-[10px] truncate ${isLight ? "text-slate-500" : "text-[#888]"}`}>{userEmail}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 pt-1.5">
              <Tooltip label="Change User" sublabel="Switch Google account">
              <button
                onClick={signOutUser}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg ${
                  isLight ? "bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200" : "bg-purple-950/30 hover:bg-purple-900/40 text-purple-300 border border-purple-800/40"
                } text-[11px] font-extrabold transition-colors`}
              >
                <UserIcon className="w-3.5 h-3.5 text-purple-500" />
                Change User
              </button>
              </Tooltip>
              <GearDropdown variant="wide" />
              <Tooltip label="Sync Data" sublabel="Pull live data from Google Sheets" color="#10b981">
              <button
                onClick={syncAllFromGoogleSheets}
                disabled={isSyncing}
                className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg ${
                  isLight ? "hover:bg-emerald-50 text-emerald-600 disabled:text-slate-400" : "hover:bg-emerald-950/30 text-emerald-400 disabled:text-[#444]"
                } text-[11px] font-bold transition-colors disabled:cursor-not-allowed`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              </button>
              </Tooltip>
              <Tooltip label="Sign Out" sublabel="End your session" color="#ef4444">
              <button
                onClick={signOutUser}
                className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg ${
                  isLight ? "hover:bg-red-50 text-red-600" : "hover:bg-red-950/30 text-red-400"
                } text-[11px] font-bold transition-colors`}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
              </Tooltip>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1">
            <Tooltip label={greetingName} sublabel={userEmail} color="#3b82f6">
            <button
              onClick={signOutUser}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-700 flex items-center justify-center text-xs font-extrabold text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-500/20"
            >
              {greetingName.charAt(0).toUpperCase()}
            </button>
            </Tooltip>
            <GearDropdown variant="collapsed" />
            <Tooltip label="Sync Data" sublabel="Pull live from Google Sheets" color="#10b981">
            <button
              onClick={syncAllFromGoogleSheets}
              disabled={isSyncing}
              className={`p-1.5 rounded-lg ${isLight ? "hover:bg-emerald-50 text-emerald-600 disabled:text-slate-400" : "hover:bg-emerald-950/30 text-emerald-400 disabled:text-[#444]"} disabled:cursor-not-allowed`}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            </button>
            </Tooltip>
            <Tooltip label="Sign Out" sublabel="End your session" color="#ef4444">
            <button
              onClick={signOutUser}
              className={`p-1.5 rounded-lg ${isLight ? "hover:bg-red-50 text-red-600" : "hover:bg-red-950/30 text-red-400"}`}
            >
              <LogOut className="w-4 h-4" />
            </button>
            </Tooltip>
          </div>
        )}
      </div>
    </aside>
  );
};
