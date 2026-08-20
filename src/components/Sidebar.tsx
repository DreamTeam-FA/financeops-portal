import React, { useState } from "react";
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
  PanelLeftOpen
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
    isSyncing
  } = useFinance();

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

  const navItems: { id: PageRoute; label: string; icon: React.ReactNode }[] = [
    { id: "hub", label: "Finance Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "ap", label: "Accounts Payables", icon: <CreditCard className="w-4 h-4" /> },
    { id: "ar", label: "Accounts Receivables", icon: <Receipt className="w-4 h-4" /> },
    { id: "banks", label: "Bank Balances", icon: <Landmark className="w-4 h-4" /> },
    { id: "loans", label: "Loans & CC Dues", icon: <TrendingDown className="w-4 h-4" /> },
    { id: "statements", label: "Bank Statements", icon: <FileText className="w-4 h-4" /> },
    { id: "calendar", label: "Calendar", icon: <CalendarDays className="w-4 h-4" /> },
    { id: "notes", label: "Quick Notes", icon: <StickyNote className="w-4 h-4 text-purple-400" /> }
  ];

  const userInitial = userEmail ? userEmail.slice(0, 2).toUpperCase() : "MC";
  const isLight = theme === "light";

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
        isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#060a11] border-[#1a2235] text-[#c8d4e8]"
      } border-r flex flex-col h-screen overflow-y-auto overflow-x-hidden transition-all duration-200 ease-in-out`}
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
          className={`p-1 rounded-lg ${
            isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-[#1a1a1a] text-[#888] hover:text-white"
          } transition-colors cursor-pointer`}
          title={isSidebarFolded ? "Expand Sidebar" : "Fold Sidebar"}
        >
          {isSidebarFolded ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Main Dashboards Section */}
      <div className="px-2 py-2">
        {!isSidebarFolded && (
          <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? "text-slate-400" : "text-[#3d5478]"} px-3 py-1 block`}>
            Dashboards
          </span>
        )}
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === "ap") {
                  setSelectedEntities(new Set(["ALL"]));
                }
                setCurrentPage(item.id);
              }}
              title={item.label}
              className={`w-full flex items-center ${
                isSidebarFolded ? "justify-center px-0 py-2" : "gap-2.5 px-3 py-1.5"
              } rounded-md text-[13px] font-medium transition-colors relative ${
                isActive
                  ? isLight
                    ? "bg-blue-50 text-blue-700 font-semibold nav-active-pill"
                    : "bg-[#0d1e3a] text-blue-300 font-semibold nav-active-pill"
                  : isLight
                    ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    : "text-[#7a90b0] hover:bg-[#0d1525] hover:text-[#c8d4e8]"
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              {!isSidebarFolded && (
                <>
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  <ChevronRight
                    className={`w-3 h-3 ${isLight ? "text-slate-400" : "text-[#555]"} transition-opacity ${
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  />
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Entities Section */}
      <div className="px-2 py-2">
        {!isSidebarFolded && (
          <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? "text-slate-400" : "text-[#3d5478]"} px-3 py-1 block`}>
            Entities AP Views
          </span>
        )}
        {/* 1. Ruby's */}
        <button
          onClick={() => {
            setSelectedEntities(new Set(["Ruby's"]));
            setCurrentPage("rubys");
          }}
          className={`w-full flex items-center ${isSidebarFolded ? "justify-center px-0 py-2" : "justify-between gap-2 px-3 py-2"} rounded-lg transition-all ${
            (currentPage === "rubys" || (currentPage === "ap" && selectedEntities.has("Ruby's") && selectedEntities.size === 1))
              ? isLight ? "bg-blue-50 border border-blue-200 shadow-xs" : "bg-[#0d1a2e] border border-[#1e3358] shadow-xs"
              : isLight ? "hover:bg-slate-50" : "hover:bg-[#0a1220]"
          }`}
          title="Ruby's AP View"
        >
          {isSidebarFolded ? (
            <span className="w-7 h-7 rounded bg-red-500/20 text-red-500 font-extrabold text-xs flex items-center justify-center">R</span>
          ) : (
            <>
              <RubysLogo className="h-7 max-w-[170px]" isLight={isLight} />
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 shrink-0">
                AP
              </span>
            </>
          )}
        </button>

        {/* 2. TI */}
        <button
          onClick={() => {
            setSelectedEntities(new Set(["TI"]));
            setCurrentPage("ti");
          }}
          className={`w-full flex items-center ${isSidebarFolded ? "justify-center px-0 py-2" : "justify-between gap-2 px-3 py-2"} rounded-lg transition-all ${
            (currentPage === "ti" || (currentPage === "ap" && selectedEntities.has("TI") && selectedEntities.size === 1))
              ? isLight ? "bg-blue-50 border border-blue-200 shadow-xs" : "bg-[#0d1a2e] border border-[#1e3358] shadow-xs"
              : isLight ? "hover:bg-slate-50" : "hover:bg-[#0a1220]"
          }`}
          title="TI AP View"
        >
          {isSidebarFolded ? (
            <span className="w-7 h-7 rounded bg-blue-500/20 text-blue-500 font-extrabold text-xs flex items-center justify-center">TI</span>
          ) : (
            <>
              <TILogo className="h-7 max-w-[170px]" isLight={isLight} />
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 shrink-0">
                AP
              </span>
            </>
          )}
        </button>

        {/* 3. MSDx */}
        <button
          onClick={() => {
            setSelectedEntities(new Set(["MSDx"]));
            setCurrentPage("msdx");
          }}
          className={`w-full flex items-center ${isSidebarFolded ? "justify-center px-0 py-2" : "justify-between gap-2 px-3 py-2"} rounded-lg transition-all ${
            (currentPage === "msdx" || (currentPage === "ap" && selectedEntities.has("MSDx") && selectedEntities.size === 1))
              ? isLight ? "bg-blue-50 border border-blue-200 shadow-xs" : "bg-[#0d1a2e] border border-[#1e3358] shadow-xs"
              : isLight ? "hover:bg-slate-50" : "hover:bg-[#0a1220]"
          }`}
          title="MSDx AP View"
        >
          {isSidebarFolded ? (
            <span className="w-7 h-7 rounded bg-teal-500/20 text-teal-500 font-extrabold text-xs flex items-center justify-center">MS</span>
          ) : (
            <>
              <MSDxLogo className="h-7 max-w-[170px]" isLight={isLight} />
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-500 shrink-0">
                AP
              </span>
            </>
          )}
        </button>
      </div>

      {/* Other Dashboards Section */}
      <div className="px-2 py-2">
        {!isSidebarFolded && (
          <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? "text-slate-400" : "text-[#3d5478]"} px-3 py-1 block`}>
            Other Dashboards
          </span>
        )}

        <button
          onClick={() => {
            setSelectedEntities(new Set(["CurcuminPro"]));
            setCurrentPage("curcumin");
          }}
          className={`w-full flex items-center ${isSidebarFolded ? "justify-center px-0 py-2" : "justify-between gap-2 px-3 py-2"} rounded-lg transition-all ${
            currentPage === "curcumin"
              ? isLight ? "bg-blue-50 border border-blue-200 shadow-xs" : "bg-[#0d1a2e] border border-[#1e3358] shadow-xs"
              : isLight ? "hover:bg-slate-50" : "hover:bg-[#0a1220]"
          }`}
          title="CurcuminPRO Dashboard"
        >
          {isSidebarFolded ? (
            <span className="w-7 h-7 rounded bg-amber-500/20 text-amber-500 font-extrabold text-xs flex items-center justify-center">C</span>
          ) : (
            <>
              <CurcuminLogo className="h-7 max-w-[170px]" isLight={isLight} />
              <ChevronRight className="w-3.5 h-3.5 text-[#666] shrink-0" />
            </>
          )}
        </button>

        <button
          onClick={() => setCurrentPage("fouryr-payroll")}
          className={`w-full flex items-center ${isSidebarFolded ? "justify-center px-0 py-2" : "justify-between gap-2 px-3 py-2"} rounded-lg transition-all ${
            currentPage === "fouryr-payroll"
              ? isLight ? "bg-blue-50 border border-blue-200 shadow-xs" : "bg-[#0d1a2e] border border-[#1e3358] shadow-xs"
              : isLight ? "hover:bg-slate-50" : "hover:bg-[#0a1220]"
          }`}
          title="4You Pros Dashboard"
        >
          {isSidebarFolded ? (
            <span className="w-7 h-7 rounded bg-purple-500/20 text-purple-400 font-extrabold text-xs flex items-center justify-center">4Y</span>
          ) : (
            <>
              <FourYrLogo className="h-7 max-w-[170px]" isLight={isLight} />
              <ChevronRight className="w-3.5 h-3.5 text-[#666] shrink-0" />
            </>
          )}
        </button>

        <button
          onClick={() => {
            setSelectedEntities(new Set(["Ziglar"]));
            setCurrentPage("ziglar");
          }}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-all ${
            currentPage === "ziglar"
              ? isLight ? "bg-blue-50 border border-blue-200 shadow-xs" : "bg-[#0d1a2e] border border-[#1e3358] shadow-xs"
              : isLight ? "hover:bg-slate-50" : "hover:bg-[#0a1220]"
          }`}
          title="Ziglar Dashboard"
        >
          <ZiglarLogo className="h-7 max-w-[170px]" isLight={isLight} />
          <ChevronRight className="w-3.5 h-3.5 text-[#666] shrink-0" />
        </button>
      </div>

      {/* WORKSPACE Section */}
      <div className="px-2 py-2">
        <div className="flex items-center justify-between px-3 py-1">
          <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? "text-slate-400" : "text-[#3d5478]"}`}>
            WORKSPACE
          </span>
          <button
            onClick={() => setCurrentPage("workspace-tools")}
            className="text-[#1a73e8] hover:text-[#1557b0] p-0.5 rounded hover:bg-slate-100 dark:hover:bg-[#1a1a1a] transition-colors"
            title="Manage Workspace Spaces"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          onClick={() => setCurrentPage("workspace-tools")}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
            currentPage === "workspace-tools"
              ? isLight ? "bg-blue-50 text-blue-700 font-semibold" : "bg-[#0d1e3a] text-blue-300 font-semibold"
              : isLight ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900" : "text-[#7a90b0] hover:bg-[#0d1525] hover:text-[#c8d4e8]"
          }`}
        >
          <Wrench className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="flex-1 text-left truncate font-medium">Tools & sheets</span>
        </button>

        <button
          onClick={() => setCurrentPage("workspace-platforms")}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
            currentPage === "workspace-platforms"
              ? isLight ? "bg-blue-50 text-blue-700 font-semibold" : "bg-[#0d1e3a] text-blue-300 font-semibold"
              : isLight ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900" : "text-[#7a90b0] hover:bg-[#0d1525] hover:text-[#c8d4e8]"
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="flex-1 text-left truncate font-medium">Platforms</span>
        </button>

        <button
          onClick={() => setCurrentPage("workspace-drive")}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
            currentPage === "workspace-drive"
              ? isLight ? "bg-blue-50 text-blue-700 font-semibold" : "bg-[#0d1e3a] text-blue-300 font-semibold"
              : isLight ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900" : "text-[#7a90b0] hover:bg-[#0d1525] hover:text-[#c8d4e8]"
          }`}
        >
          <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="flex-1 text-left truncate font-medium">Drive folders</span>
        </button>
      </div>

      {/* MEMBER'S WORKSPACE Section */}
      <div className="px-2 py-2">
        <div className="flex items-center justify-between px-3 py-1">
          <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? "text-slate-400" : "text-[#3d5478]"}`}>
            MEMBER'S WORKSPACE
          </span>
          <button
            onClick={() => setShowAddMemberModal(true)}
            className="text-[#1a73e8] hover:text-[#1557b0] p-0.5 rounded hover:bg-slate-100 dark:hover:bg-[#1a1a1a] transition-colors"
            title="Add Team Member Workspace"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {memberWorkspaces.map((mem) => {
          const isMemActive = currentPage === "member-workspace" && activeMember?.id === mem.id;
          return (
            <button
              key={mem.id}
              onClick={() => {
                setActiveMember({ id: mem.id, name: mem.name, color: mem.color });
                setCurrentPage("member-workspace");
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                isMemActive
                  ? isLight ? "bg-blue-50 text-blue-700 font-semibold" : "bg-[#0d1e3a] text-blue-300 font-semibold"
                  : isLight ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900" : "text-[#7a90b0] hover:bg-[#0d1525] hover:text-[#c8d4e8]"
              }`}
              title={`Open Workspace for ${mem.name}`}
            >
              <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="flex-1 text-left truncate font-medium">{formatPossessiveName(mem.name)}</span>
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                style={{ backgroundColor: mem.color }}
              />
            </button>
          );
        })}
      </div>

      {/* Quick External Links Section */}
      <div className="px-2 py-2">
        <span className={`text-[9px] font-bold tracking-widest uppercase ${isLight ? "text-slate-400" : "text-[#3d5478]"} px-3 py-1 block`}>
          Quick Links
        </span>
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
            <div className="flex items-center justify-between border-b pb-2.5 dark:border-[#262626]">
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
                    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Category / Type</label>
                <select
                  value={wsType}
                  onChange={(e) => setWsType(e.target.value as any)}
                  className={`w-full border rounded-lg p-2 text-xs ${
                    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
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
                    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
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
            <div className="flex items-center justify-between border-b pb-2.5 dark:border-[#262626]">
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
                    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
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
              <div className="w-7 h-7 rounded-full bg-[#1e1e1e] flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                {greetingName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[12px] font-bold truncate ${isLight ? "text-slate-900" : "text-white"}`}>{greetingName}</div>
                <div className={`text-[10px] truncate ${isLight ? "text-slate-500" : "text-[#888]"}`}>{userEmail}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 pt-1.5">
              <button
                onClick={signOutUser}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg ${
                  isLight ? "bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200" : "bg-purple-950/30 hover:bg-purple-900/40 text-purple-300 border border-purple-800/40"
                } text-[11px] font-extrabold transition-colors`}
                title="Change User Profile"
              >
                <UserIcon className="w-3.5 h-3.5 text-purple-500" />
                Change User
              </button>
              <GearDropdown variant="wide" />
              <button
                onClick={syncAllFromGoogleSheets}
                disabled={isSyncing}
                className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg ${
                  isLight ? "hover:bg-emerald-50 text-emerald-600 disabled:text-slate-400" : "hover:bg-emerald-950/30 text-emerald-400 disabled:text-[#444]"
                } text-[11px] font-bold transition-colors disabled:cursor-not-allowed`}
                title="Pull live data from Google Sheets"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={signOutUser}
                className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg ${
                  isLight ? "hover:bg-red-50 text-red-600" : "hover:bg-red-950/30 text-red-400"
                } text-[11px] font-bold transition-colors`}
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1">
            <button
              onClick={signOutUser}
              className="w-8 h-8 rounded-full bg-[#1e1e1e] flex items-center justify-center text-xs font-bold text-white shadow-xs"
              title={`Active User: ${greetingName} (${userEmail})`}
            >
              {greetingName.charAt(0).toUpperCase()}
            </button>
            <GearDropdown variant="collapsed" />
            <button
              onClick={syncAllFromGoogleSheets}
              disabled={isSyncing}
              className={`p-1.5 rounded-lg ${isLight ? "hover:bg-emerald-50 text-emerald-600 disabled:text-slate-400" : "hover:bg-emerald-950/30 text-emerald-400 disabled:text-[#444]"} disabled:cursor-not-allowed`}
              title="Pull live data from Google Sheets"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={signOutUser}
              className={`p-1.5 rounded-lg ${isLight ? "hover:bg-red-50 text-red-600" : "hover:bg-red-950/30 text-red-400"}`}
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
