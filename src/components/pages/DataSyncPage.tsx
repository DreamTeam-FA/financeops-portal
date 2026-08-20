import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import {
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  FileSpreadsheet,
  ShieldAlert,
  ArrowDownToLine,
  ArrowUpFromLine,
  Key,
  LogOut,
  Save,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  Zap,
  ExternalLink,
  Link as LinkIcon
} from "lucide-react";
import { SheetMappingConfig } from "../../types";

export const DataSyncPage: React.FC = () => {
  const {
    apBills,
    bankAccounts,
    loans,
    arItems,
    bankStatements,
    importSheetData,
    logAction,
    googleUser,
    handleGoogleSignIn,
    handleGoogleSignOut,
    sheetMappings,
    updateSheetMapping,
    addCustomSheetMapping,
    deleteSheetMapping,
    syncModuleFromGoogleSheet,
    syncModuleToGoogleSheet,
    autoDetectSheetTabs,
    syncAllFromGoogleSheets,
    syncAllToGoogleSheets,
    isSyncing,
    syncLogs,
    autoPushEnabled,
    setAutoPushEnabled,
    theme,
    externalLinks,
    addExternalLink,
    updateExternalLink,
    deleteExternalLink,
    gasUrls,
    updateGasUrl
  } = useFinance();

  const isLight = theme === "light";

  const [pasteData, setPasteData] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Local state for editing sheet configs keyed by mapping.id
  const [editingConfigs, setEditingConfigs] = useState<Record<string, SheetMappingConfig>>({});

  // New custom mapping form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMappingName, setNewMappingName] = useState("");
  const [newMappingModule, setNewMappingModule] = useState<SheetMappingConfig["module"]>("ap");
  const [newMappingUrl, setNewMappingUrl] = useState("");
  const [newMappingTab, setNewMappingTab] = useState("");
  const [newMappingRange, setNewMappingRange] = useState("A1:Z200");

  // New External Link modal state
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkCategory, setNewLinkCategory] = useState<"entities" | "quicklinks">("entities");
  const [newLinkIcon, setNewLinkIcon] = useState<"sheet" | "mail" | "calendar" | "users" | "link">("sheet");

  const handleCreateExternalLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkName || !newLinkUrl) return;
    addExternalLink({
      name: newLinkName,
      url: newLinkUrl,
      category: newLinkCategory,
      iconType: newLinkIcon
    });
    setNewLinkName("");
    setNewLinkUrl("");
    setShowAddLinkModal(false);
  };

  const handleConfigChange = (id: string, field: keyof SheetMappingConfig, value: string) => {
    const current = editingConfigs[id] || sheetMappings.find((m) => m.id === id);
    if (!current) return;
    setEditingConfigs((prev) => ({
      ...prev,
      [id]: {
        ...current,
        [field]: value
      }
    }));
  };

  const handleSaveConfig = (id: string) => {
    const updated = editingConfigs[id];
    if (updated) {
      updateSheetMapping(id, updated);
    }
  };

  const handleCreateCustomMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMappingName || !newMappingUrl) {
      return;
    }
    addCustomSheetMapping({
      module: newMappingModule,
      name: newMappingName,
      spreadsheetIdOrUrl: newMappingUrl,
      tabName: newMappingTab || "Sheet1",
      range: newMappingRange || "A1:Z200",
      status: "connected"
    });
    setNewMappingName("");
    setNewMappingUrl("");
    setNewMappingTab("");
    setShowAddModal(false);
  };

  const handleExportJSON = () => {
    const fullState = {
      ap: apBills,
      banks: bankAccounts,
      loans,
      ar: arItems,
      statements: bankStatements
    };
    const jsonStr = JSON.stringify(fullState, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FinanceOps_Portal_Export_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    logAction("Exported JSON Data", "Downloaded full FinanceOps dataset.");
  };

  const handleImportPastedJSON = () => {
    if (!pasteData) return;
    try {
      const parsed = JSON.parse(pasteData);
      importSheetData(parsed);
      setImportStatus("Successfully imported and updated portal data!");
      setPasteData("");
    } catch (e) {
      setImportStatus("Error parsing JSON data. Please ensure valid format.");
    }
  };

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader title="2-Way Google Sheets Sync Hub" bgClass={isLight ? "bg-slate-800 text-white" : "bg-[#0d111a] border-b border-[#1a2235]"} />

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Google Authentication & Connection Status Card */}
        <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-5 space-y-4 shadow-sm`}>
          <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${isLight ? "border-slate-200" : "border-[#222]"} pb-4`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#1a73e8]/20 border border-[#1a73e8]/40 flex items-center justify-center text-[#1a73e8] dark:text-[#60a5fa]">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h2 className={`text-sm font-bold flex items-center gap-2 ${isLight ? "text-slate-900" : "text-white"}`}>
                  Google Workspace Authentication
                  {googleUser ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      Connected
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      Needs OAuth Login
                    </span>
                  )}
                </h2>
                <p className={`text-xs ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                  {googleUser
                    ? `Signed in as ${googleUser.email || "accounting@marktimm.com"} (Read & Write permissions granted)`
                    : "Connect your Google account to enable live 2-way syncing with your target Google Sheets."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {googleUser ? (
                <button
                  onClick={handleGoogleSignOut}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                    isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300" : "bg-[#1e1e1e] hover:bg-[#282828] text-[#888] hover:text-white border-[#333]"
                  } flex items-center gap-1.5 transition-colors`}
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              ) : (
                <button
                  onClick={handleGoogleSignIn}
                  className="px-4 py-2 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
                >
                  <Key className="w-4 h-4" /> Sign In with Google
                </button>
              )}
            </div>
          </div>

          {/* Master Sync Action Buttons & Instant Auto-Push Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3">
              <span className={`text-xs ${isLight ? "text-slate-500" : "text-[#aaa]"}`}>
                Sync Engine Controls:
              </span>
              <button
                onClick={() => setAutoPushEnabled(!autoPushEnabled)}
                className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all border ${
                  autoPushEnabled
                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
                    : isLight
                    ? "bg-slate-100 text-slate-600 border-slate-300"
                    : "bg-[#222] text-[#888] border-[#333]"
                }`}
                title="When enabled, any edit in the dashboard instantly pushes updates back to Google Sheets automatically"
              >
                <Zap className={`w-3.5 h-3.5 ${autoPushEnabled ? "text-emerald-500 fill-emerald-500" : ""}`} />
                {autoPushEnabled ? "Instant Auto-Push: ON" : "Instant Auto-Push: OFF"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={syncAllFromGoogleSheets}
                disabled={isSyncing}
                className="px-3.5 py-1.5 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] disabled:opacity-50"
              >
                <ArrowDownToLine className={`w-4 h-4 ${isSyncing ? "animate-bounce" : ""}`} />
                Pull All Modules
              </button>
              <button
                onClick={() => syncAllToGoogleSheets(true)}
                disabled={isSyncing}
                className="px-3.5 py-1.5 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] disabled:opacity-50"
              >
                <ArrowUpFromLine className="w-4 h-4" />
                Push All Modules
              </button>
            </div>
          </div>
        </div>

        {/* GAS Dashboard Web App URLs Section */}
        <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] p-5 space-y-4`}>
          <div>
            <h3 className={`text-xs font-extrabold uppercase tracking-wider ${isLight ? "text-slate-900" : "text-white"} flex items-center gap-2`}>
              <Zap className="w-4 h-4 text-purple-500" />
              Other Dashboards Web App URLs (Google Apps Script)
            </h3>
            <p className={`text-xs ${isLight ? "text-slate-500" : "text-gray-400"} mt-0.5`}>
              Input the deployed Google Apps Script (GAS) Web App URL for each entity. Clicking these dashboards in the sidebar will open their custom interactive views.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* CurcuminPRO */}
            <div className={`p-4 rounded-xl border space-y-2 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#161616] border-[#2a2a2a]"}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">CurcuminPRO</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-mono">GAS Dashboard</span>
              </div>
              <input
                type="url"
                value={gasUrls?.curcumin || ""}
                onChange={(e) => updateGasUrl("curcumin", e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono ${
                  isLight ? "bg-white border-slate-300 text-slate-900 placeholder-slate-400" : "bg-[#1f1f1f] border-[#333] text-white placeholder-[#666]"
                } focus:ring-2 focus:ring-amber-500 focus:outline-none`}
              />
            </div>

            {/* 4YR Payroll */}
            <div className={`p-4 rounded-xl border space-y-2 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#161616] border-[#2a2a2a]"}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">4YR Payroll</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-mono">GAS Dashboard</span>
              </div>
              <input
                type="url"
                value={gasUrls?.fouryr || ""}
                onChange={(e) => updateGasUrl("fouryr", e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono ${
                  isLight ? "bg-white border-slate-300 text-slate-900 placeholder-slate-400" : "bg-[#1f1f1f] border-[#333] text-white placeholder-[#666]"
                } focus:ring-2 focus:ring-emerald-500 focus:outline-none`}
              />
            </div>

            {/* Ziglar */}
            <div className={`p-4 rounded-xl border space-y-2 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#161616] border-[#2a2a2a]"}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-600 dark:text-purple-400">Ziglar</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 font-mono">GAS Dashboard</span>
              </div>
              <input
                type="url"
                value={gasUrls?.ziglar || ""}
                onChange={(e) => updateGasUrl("ziglar", e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className={`w-full px-3 py-2 rounded-lg border text-xs font-mono ${
                  isLight ? "bg-white border-slate-300 text-slate-900 placeholder-slate-400" : "bg-[#1f1f1f] border-[#333] text-white placeholder-[#666]"
                } focus:ring-2 focus:ring-purple-500 focus:outline-none`}
              />
            </div>
          </div>
        </div>

        {/* Module Sheet Mappings Config Table */}
        <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl overflow-hidden shadow-sm`}>
          <div className={`p-4 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border-b flex flex-wrap items-center justify-between gap-2`}>
            <div>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-slate-900" : "text-white"} flex items-center gap-2`}>
                <FileSpreadsheet className="w-4 h-4 text-[#1a73e8]" />
                Target Google Sheet Mappings & Sync Controls
              </h3>
              <p className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"} mt-0.5`}>
                Paste Google Sheet URL/ID. Click "Auto-Detect Tabs" to read tab names and cell ranges directly from Google's API.
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 rounded bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add New Sheet Mapping
            </button>
          </div>

          <div className="divide-y divide-[#222]">
            {sheetMappings.map((cfg) => {
              const currentEdit = editingConfigs[cfg.id] || cfg;

              return (
                <div key={cfg.id} className="p-4 space-y-3 hover:bg-white/2 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-[#1a73e8]/20 text-[#60a5fa] uppercase tracking-wider">
                        {cfg.name}
                      </span>
                      {cfg.lastSyncedAt && (
                        <span className="text-[11px] text-[#666] flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Last synced: {cfg.lastSyncedAt}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const detected = await autoDetectSheetTabs(cfg.id);
                          if (detected && detected.length > 0) {
                            const updatedMapping = sheetMappings.find((m) => m.id === cfg.id);
                            if (updatedMapping) {
                              setEditingConfigs((prev) => ({
                                ...prev,
                                [cfg.id]: updatedMapping
                              }));
                            }
                          }
                        }}
                        disabled={isSyncing}
                        className="px-2.5 py-1 rounded bg-[#8b5cf6]/20 hover:bg-[#8b5cf6]/30 text-[#c084fc] border border-[#8b5cf6]/40 text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                        title="Inspect Google Sheet and auto-detect all tab names & ranges"
                      >
                        <Sparkles className="w-3 h-3" /> Auto-Detect Tabs
                      </button>

                      <button
                        onClick={() => handleSaveConfig(cfg.id)}
                        className="px-2.5 py-1 rounded bg-[#222] hover:bg-[#333] text-xs font-medium text-white border border-[#444] flex items-center gap-1 transition-colors"
                      >
                        <Save className="w-3 h-3" /> Save Config
                      </button>

                      <button
                        onClick={() => syncModuleFromGoogleSheet(cfg.id)}
                        disabled={isSyncing}
                        className="px-2.5 py-1 rounded bg-[#16a34a]/20 hover:bg-[#16a34a]/30 text-[#4ade80] border border-[#16a34a]/40 text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <ArrowDownToLine className="w-3 h-3" /> Pull
                      </button>

                      <button
                        onClick={() => syncModuleToGoogleSheet(cfg.id, true)}
                        disabled={isSyncing}
                        className="px-2.5 py-1 rounded bg-[#1a73e8]/20 hover:bg-[#1a73e8]/30 text-[#60a5fa] border border-[#1a73e8]/40 text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <ArrowUpFromLine className="w-3 h-3" /> Push
                      </button>

                      {cfg.id.startsWith("map-custom-") && (
                        <button
                          onClick={() => deleteSheetMapping(cfg.id)}
                          className="p-1 rounded text-red-400 hover:bg-red-500/20 transition-colors"
                          title="Delete custom mapping"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-[10px] font-semibold text-[#888] uppercase mb-1">
                        Spreadsheet ID or URL
                      </label>
                      <input
                        type="text"
                        value={currentEdit.spreadsheetIdOrUrl}
                        onChange={(e) => handleConfigChange(cfg.id, "spreadsheetIdOrUrl", e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#1a73e8]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-[#888] uppercase mb-1">
                        Sheet Tab Name
                      </label>
                      <input
                        type="text"
                        value={currentEdit.tabName}
                        onChange={(e) => handleConfigChange(cfg.id, "tabName", e.target.value)}
                        placeholder="e.g. Accounts Payable"
                        className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#1a73e8]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-[#888] uppercase mb-1">
                        Cell Range
                      </label>
                      <input
                        type="text"
                        value={currentEdit.range}
                        onChange={(e) => handleConfigChange(cfg.id, "range", e.target.value)}
                        placeholder="A1:Z100"
                        className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#1a73e8]"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* External Links & Sheets Manager Card */}
        <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-5 space-y-4 shadow-sm`}>
          <div className="flex flex-wrap items-center justify-between border-b border-[#1a2235] pb-3 gap-2">
            <div>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-slate-900" : "text-white"} flex items-center gap-2`}>
                <LinkIcon className="w-4 h-4 text-purple-400" /> Sidebar External Links Manager
              </h3>
              <p className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"} mt-0.5`}>
                Edit, add, or delete sidebar links (CurcuminPRO, 4YR Payroll, Gmail, Google Calendar, etc.). Changes update immediately in the sidebar!
              </p>
            </div>
            <button
              onClick={() => setShowAddLinkModal(true)}
              className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
            >
              <Plus className="w-3.5 h-3.5" /> Add External Link
            </button>
          </div>

          <div className="space-y-2.5">
            {externalLinks.map((link) => (
              <div key={link.id} className={`flex flex-wrap items-center justify-between gap-3 p-3 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-lg`}>
                <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 uppercase">
                    {link.category || "entities"}
                  </span>
                  <input
                    type="text"
                    value={link.name}
                    onChange={(e) => updateExternalLink(link.id, { name: e.target.value })}
                    className={`border rounded px-2.5 py-1 text-xs font-semibold w-36 ${isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`}
                  />
                  <input
                    type="text"
                    value={link.url}
                    onChange={(e) => updateExternalLink(link.id, { url: e.target.value })}
                    className={`border rounded px-2.5 py-1 text-xs flex-1 min-w-[220px] ${isLight ? "bg-white border-slate-300 text-slate-700" : "bg-[#0d111a] border-[#333] text-[#aaa]"}`}
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-sky-400 hover:text-sky-300 transition-colors"
                    title="Test Link"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => deleteExternalLink(link.id)}
                    className="p-1 text-red-500 hover:text-red-400 transition-colors"
                    title="Delete Link"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal to add Custom External Link */}
        {showAddLinkModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-[#0d111a] border border-[#333] rounded-xl max-w-md w-full p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-purple-400" /> Add New External Sidebar Link
              </h3>
              <form onSubmit={handleCreateExternalLink} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#aaa] mb-1">Link Label / Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CurcuminPRO Sheet"
                    value={newLinkName}
                    onChange={(e) => setNewLinkName(e.target.value)}
                    className="w-full bg-[#0d111a] border border-[#333] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#aaa] mb-1">URL</label>
                  <input
                    type="url"
                    required
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    className="w-full bg-[#0d111a] border border-[#333] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#aaa] mb-1">Category</label>
                    <select
                      value={newLinkCategory}
                      onChange={(e) => setNewLinkCategory(e.target.value as any)}
                      className="w-full bg-[#0d111a] border border-[#333] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="entities">Entities Section</option>
                      <option value="quicklinks">Quick Links Section</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#aaa] mb-1">Icon Type</label>
                    <select
                      value={newLinkIcon}
                      onChange={(e) => setNewLinkIcon(e.target.value as any)}
                      className="w-full bg-[#0d111a] border border-[#333] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="sheet">Google Sheet</option>
                      <option value="users">Payroll / Users</option>
                      <option value="mail">Mail / Email</option>
                      <option value="calendar">Calendar</option>
                      <option value="link">Generic Link</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddLinkModal(false)}
                    className="px-3 py-1.5 rounded bg-[#222] text-xs font-semibold text-[#aaa] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-700 text-xs font-semibold text-white"
                  >
                    Add Link
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal to add Custom Sheet Mapping */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className={`${isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"} border rounded-xl max-w-md w-full p-5 space-y-4`}>
              <h3 className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} flex items-center gap-2`}>
                <FileSpreadsheet className="w-4 h-4 text-[#1a73e8]" /> Add Custom Sheet Mapping
              </h3>
              <form onSubmit={handleCreateCustomMapping} className="space-y-3">
                <div>
                  <label className={`block text-xs font-semibold ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>Mapping Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Custom Payroll Sheet"
                    value={newMappingName}
                    onChange={(e) => setNewMappingName(e.target.value)}
                    className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"} border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#1a73e8]`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-semibold ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>Target Module</label>
                  <select
                    value={newMappingModule}
                    onChange={(e) => setNewMappingModule(e.target.value as any)}
                    className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"} border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#1a73e8]`}
                  >
                    <option value="ap">Accounts Payable (AP)</option>
                    <option value="banks">Bank Balances</option>
                    <option value="loans">Loans & Credit</option>
                    <option value="ar">Accounts Receivable (AR)</option>
                    <option value="statements">Bank Statements Checklist</option>
                    <option value="payroll">Payroll Summary</option>
                    <option value="calendar">Financial Calendar / Events</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-xs font-semibold ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>Spreadsheet ID or URL</label>
                  <input
                    type="text"
                    required
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={newMappingUrl}
                    onChange={(e) => setNewMappingUrl(e.target.value)}
                    className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"} border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#1a73e8]`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-semibold ${isLight ? "text-slate-600" : "text-[#aaa]"} mb-1`}>Tab Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="Auto-detected if left blank"
                    value={newMappingTab}
                    onChange={(e) => setNewMappingTab(e.target.value)}
                    className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"} border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#1a73e8]`}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className={`px-3 py-1.5 rounded ${isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-[#222] hover:bg-[#333] text-[#aaa] hover:text-white"} text-xs font-semibold`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-[#1a73e8] hover:bg-[#1557b0] text-xs font-semibold text-white"
                  >
                    Add Mapping
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Sync Logs */}
        <div className="bg-[#0d111a] border border-[#1a2235] rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#fb923c]" /> 2-Way Sync Activity Log
          </h3>
          <div className="bg-[#0d111a] border border-[#1a2235] rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 font-mono text-[11px]">
            {syncLogs.length > 0 ? (
              syncLogs.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-2 border-b border-[#222] pb-1.5 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${log.status === "SUCCESS" ? "bg-emerald-400" : "bg-red-400"}`} />
                    <span className="font-bold text-white uppercase">{log.module}</span>
                    <span className="text-[#888]">{log.direction}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[#aaa] block">{log.details}</span>
                    <span className="text-[#555] text-[10px]">{log.timestamp}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-[#666]">
                No sync activity logged yet. Click "Pull" or "Push" on any module above to initiate sync.
              </div>
            )}
          </div>
        </div>

        {/* Diagnostic Explanation Card */}
        <div className="bg-[#0d111a] border border-[#1a2235] rounded-xl p-5 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-[#fb923c] font-bold text-sm">
            <ShieldAlert className="w-5 h-5" /> Architecture Analysis: Why your original GAS Portal struggled
          </div>
          <div className="text-xs text-[#aaa] space-y-2 leading-relaxed">
            <p>
              1. <strong>Synchronous Execution Bottleneck:</strong> In Google Apps Script HTMLService, calling <code>google.script.run</code> multiple times asynchronously on page load queues synchronous executions on GAS servers, leading to timeouts, 10+ second delays, and silent <code>script error</code> failures.
            </p>
            <p>
              2. <strong>Unindexed Spreadsheet Queries:</strong> Opening spreadsheet ranges by row on every browser boot causes severe execution throttling in Google Sheets.
            </p>
            <p>
              3. <strong>Solution in this Modern Portal:</strong> This portal decouples the frontend UI into a high-performance Express & React application with instant client state, real-time filters, full sub-dashboard feature inheritance (Ruby's, TI, MSDx, 4YR Payroll, AR matrix), and direct 2-way Google Sheets API integration!
            </p>
          </div>
        </div>

        {/* Data Export / Backup Utility */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0d111a] border border-[#1a2235] rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Download className="w-4 h-4 text-[#1a73e8]" /> Export Portal Data (JSON Backup)
            </div>
            <p className="text-xs text-[#888]">
              Download your current consolidated financial state (AP Bills, Bank Balances, Loans, AR Invoices, Statements) as JSON to back up or migrate.
            </p>
            <button
              onClick={handleExportJSON}
              className="px-4 py-2 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
            >
              <Download className="w-4 h-4" /> Export Complete Dataset
            </button>
          </div>

          <div className="bg-[#0d111a] border border-[#1a2235] rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Upload className="w-4 h-4 text-[#16a34a]" /> Import Data Payload
            </div>
            <p className="text-xs text-[#888]">
              Paste exported JSON or structured data to update all portal tables instantly.
            </p>
            <textarea
              rows={3}
              value={pasteData}
              onChange={(e) => setPasteData(e.target.value)}
              placeholder="Paste JSON payload here..."
              className="w-full bg-[#0d111a] border border-[#1a2235] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#1a73e8]"
            />
            {importStatus && (
              <div className="text-xs font-semibold text-[#4ade80] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> {importStatus}
              </div>
            )}
            <button
              onClick={handleImportPastedJSON}
              className="px-4 py-2 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
            >
              <RefreshCw className="w-4 h-4" /> Apply & Update Portal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
