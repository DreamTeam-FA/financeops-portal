import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { ExternalLinkItem } from "../../types";
import {
  Wrench,
  FileSpreadsheet,
  Folder,
  Globe,
  Plus,
  ExternalLink,
  Edit2,
  Trash2,
  Search,
  Maximize2,
  X,
  Layers,
  FolderOpen
} from "lucide-react";

interface WorkspacePageProps {
  initialCategory?: "tools" | "platforms" | "drive";
}

export const WorkspacePage: React.FC<WorkspacePageProps> = ({
  initialCategory = "tools"
}) => {
  const {
    externalLinks,
    addExternalLink,
    updateExternalLink,
    deleteExternalLink,
    theme
  } = useFinance();

  const isLight = theme === "light";
  const [activeTab, setActiveTab] = useState<"tools" | "platforms" | "drive">(initialCategory);

  React.useEffect(() => {
    setActiveTab(initialCategory);
  }, [initialCategory]);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal States for Add/Edit
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ExternalLinkItem | null>(null);

  // Embedded Drive Viewer State
  const [viewingDriveFolder, setViewingDriveFolder] = useState<ExternalLinkItem | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    description: "",
    category: activeTab as "tools" | "platforms" | "drive",
    color: "#1a73e8"
  });

  const categoryTitles = {
    tools: {
      title: "Tools & Sheets Space",
      sub: "Editable directory of central spreadsheets, tools & resources",
      icon: <Wrench className="w-5 h-5 text-blue-500" />
    },
    platforms: {
      title: "Platforms Directory",
      sub: "Editable portal links for accounting, payroll, banking & software tools",
      icon: <Globe className="w-5 h-5 text-purple-500" />
    },
    drive: {
      title: "Google Drive Folders",
      sub: "Manually organized Drive folders — viewable inside dashboard or externally",
      icon: <Folder className="w-5 h-5 text-amber-500" />
    }
  };

  const handleOpenAdd = (cat: "tools" | "platforms" | "drive") => {
    setFormData({
      name: "",
      url: "",
      description: "",
      category: cat,
      color: cat === "tools" ? "#1a73e8" : cat === "platforms" ? "#7c3aed" : "#f59e0b"
    });
    setEditingItem(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (item: ExternalLinkItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      url: item.url,
      description: item.description || "",
      category: (item.category as "tools" | "platforms" | "drive") || activeTab,
      color: item.color || "#1a73e8"
    });
    setIsAddModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.url.trim()) return;

    if (editingItem) {
      updateExternalLink(editingItem.id, {
        name: formData.name.trim(),
        url: formData.url.trim(),
        description: formData.description.trim(),
        category: formData.category,
        color: formData.color
      });
    } else {
      addExternalLink({
        name: formData.name.trim(),
        url: formData.url.trim(),
        description: formData.description.trim(),
        category: formData.category,
        color: formData.color,
        iconType: formData.category === "drive" ? "folder" : formData.category === "platforms" ? "globe" : "wrench"
      });
    }

    setIsAddModalOpen(false);
    setEditingItem(null);
  };

  // Filter items for active category
  const activeItems = externalLinks.filter((item) => {
    const isCatMatch = item.category === activeTab;
    const isQueryMatch =
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.url.toLowerCase().includes(searchQuery.toLowerCase());

    return isCatMatch && isQueryMatch;
  });

  // Extract folder ID for Drive embedding if possible
  const extractDriveFolderId = (url: string): string | null => {
    if (!url) return null;
    const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) return match[1];
    if (url.includes("drive.google.com") && url.includes("id=")) {
      const matchId = url.match(/id=([a-zA-Z0-9-_]+)/);
      if (matchId && matchId[1]) return matchId[1];
    }
    return null;
  };

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#0a0a0a] text-[#e8e8e8]"}`}>
      <PageHeader
        title={categoryTitles[activeTab].title}
        bgClass={isLight ? "bg-slate-800 text-white" : "bg-[#181818] border-b border-[#262626]"}
        tabs={[
          { id: "tools", label: "Tools & Sheets" },
          { id: "platforms", label: "Platforms" },
          { id: "drive", label: "Drive Folders" }
        ]}
        activeTab={activeTab}
        onTabChange={(t) => setActiveTab(t as any)}
        onAddClick={() => handleOpenAdd(activeTab)}
        addLabel={`Add ${activeTab === "tools" ? "Tool/Sheet" : activeTab === "platforms" ? "Platform" : "Drive Folder"}`}
      />

      {/* Filter and Action Bar */}
      <div className={`flex items-center justify-between gap-3 px-4 py-3 ${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border-b shrink-0`}>
        <div className="relative flex-1 max-w-md">
          <Search className={`w-3.5 h-3.5 absolute left-3 top-2.5 ${isLight ? "text-slate-400" : "text-[#666]"}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400" : "bg-[#181818] border-[#262626] text-white placeholder-[#666]"} border rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#1a73e8]`}
          />
        </div>

        <button
          onClick={() => handleOpenAdd(activeTab)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add New</span>
        </button>
      </div>

      {/* Main Grid Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Category Header Banner */}
        <div className={`p-4 rounded-xl border ${isLight ? "bg-white border-slate-200 shadow-xs" : "bg-[#111] border-[#262626]"} flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${isLight ? "bg-slate-100" : "bg-[#1f1f1f]"}`}>
              {categoryTitles[activeTab].icon}
            </div>
            <div>
              <h3 className={`text-base font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                {categoryTitles[activeTab].title}
              </h3>
              <p className={`text-xs ${isLight ? "text-slate-500" : "text-[#888]"} mt-0.5`}>
                {categoryTitles[activeTab].sub}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${isLight ? "bg-slate-100 text-slate-700" : "bg-[#1e1e1e] text-slate-300"}`}>
            {activeItems.length} items saved
          </span>
        </div>

        {/* Item Cards Grid */}
        {activeItems.length === 0 ? (
          <div className={`text-center py-12 rounded-xl border border-dashed ${isLight ? "border-slate-300 bg-white" : "border-[#262626] bg-[#111]"} p-6`}>
            <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-[#1f1f1f] flex items-center justify-center mx-auto mb-3">
              {categoryTitles[activeTab].icon}
            </div>
            <h4 className={`text-sm font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
              No {activeTab} added yet
            </h4>
            <p className={`text-xs ${isLight ? "text-slate-500" : "text-[#888]"} mt-1 max-w-sm mx-auto`}>
              This space is editable. Click "Add New" above to save links, sheets, platform portals, or Drive folders.
            </p>
            <button
              onClick={() => handleOpenAdd(activeTab)}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#1a73e8] text-white hover:bg-[#1557b0] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add First {activeTab === "drive" ? "Drive Folder" : activeTab === "platforms" ? "Platform" : "Tool/Sheet"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeItems.map((item) => {
              const driveFolderId = extractDriveFolderId(item.url);

              return (
                <div
                  key={item.id}
                  className={`group border ${isLight ? "bg-white border-slate-200 hover:border-slate-300 shadow-xs" : "bg-[#111] border-[#262626] hover:border-[#333]"} rounded-xl p-4 flex flex-col justify-between transition-all`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 font-bold text-xs"
                          style={{ backgroundColor: item.color || "#1a73e8" }}
                        >
                          {activeTab === "drive" ? (
                            <Folder className="w-4 h-4" />
                          ) : activeTab === "platforms" ? (
                            <Globe className="w-4 h-4" />
                          ) : (
                            <FileSpreadsheet className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className={`text-sm font-bold truncate ${isLight ? "text-slate-900" : "text-white"}`}>
                            {item.name}
                          </h4>
                          <span className={`text-[10px] font-medium uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#666]"}`}>
                            {activeTab}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className={`p-1.5 rounded-md ${isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-[#222] text-[#888]"} transition-colors`}
                          title="Edit item"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteExternalLink(item.id)}
                          className="p-1.5 rounded-md hover:bg-red-500/10 text-red-400 hover:text-red-500 transition-colors"
                          title="Delete item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {item.description && (
                      <p className={`text-xs ${isLight ? "text-slate-600" : "text-[#aaa]"} line-clamp-2`}>
                        {item.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 dark:border-[#1e1e1e] flex items-center gap-2">
                    {/* Drive Folder Embedded Viewer Toggle */}
                    {activeTab === "drive" && (
                      <button
                        onClick={() => setViewingDriveFolder(item)}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                          isLight
                            ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                            : "bg-amber-950/30 text-amber-300 border-amber-800/40 hover:bg-amber-950/50"
                        } transition-colors`}
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Open in Dashboard</span>
                      </button>
                    )}

                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        activeTab === "drive" ? "shrink-0" : "flex-1"
                      } bg-[#1a73e8] text-white hover:bg-[#1557b0] transition-colors`}
                    >
                      <span>Open Link</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ADD / EDIT ITEM MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className={`w-full max-w-md ${isLight ? "bg-white text-slate-900" : "bg-[#181818] text-white"} border ${isLight ? "border-slate-200" : "border-[#333]"} rounded-xl shadow-2xl p-5 space-y-4`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-[#262626]">
              <h3 className="text-base font-bold flex items-center gap-2">
                {editingItem ? <Edit2 className="w-4 h-4 text-blue-500" /> : <Plus className="w-4 h-4 text-blue-500" />}
                {editingItem ? "Edit Item" : `Add New ${formData.category}`}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                  className={`w-full ${isLight ? "bg-slate-50 border-slate-300" : "bg-[#111] border-[#333]"} border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#1a73e8]`}
                >
                  <option value="tools">Tools & Sheets</option>
                  <option value="platforms">Platforms</option>
                  <option value="drive">Drive Folders</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Title / Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Financial Sheet / QuickBooks / AP Receipts"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full ${isLight ? "bg-slate-50 border-slate-300" : "bg-[#111] border-[#333]"} border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#1a73e8]`}
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">URL / Link *</label>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className={`w-full ${isLight ? "bg-slate-50 border-slate-300" : "bg-[#111] border-[#333]"} border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#1a73e8]`}
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Notes / Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Brief summary or purpose of this tool/folder..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={`w-full ${isLight ? "bg-slate-50 border-slate-300" : "bg-[#111] border-[#333]"} border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#1a73e8]`}
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Badge Accent Color</label>
                <div className="flex items-center gap-2">
                  {["#1a73e8", "#7c3aed", "#16a34a", "#f59e0b", "#d81b60", "#0891b2", "#475569"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: c })}
                      className={`w-6 h-6 rounded-full border-2 ${
                        formData.color === c ? "border-white scale-110 shadow-md" : "border-transparent opacity-80 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#262626]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className={`px-3 py-1.5 rounded-lg font-semibold ${isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-[#222] hover:bg-[#2e2e2e] text-slate-300"}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg font-semibold bg-[#1a73e8] hover:bg-[#1557b0] text-white shadow-xs"
                >
                  {editingItem ? "Save Changes" : "Add to Space"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EMBEDDED DRIVE FOLDER VIEWER MODAL */}
      {viewingDriveFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-md">
          <div className={`w-full max-w-5xl h-[88vh] ${isLight ? "bg-white text-slate-900" : "bg-[#141414] text-white"} border ${isLight ? "border-slate-200" : "border-[#333]"} rounded-2xl shadow-2xl flex flex-col overflow-hidden`}>
            {/* Modal Header */}
            <div className={`flex items-center justify-between px-5 py-3 border-b ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#1c1c1c] border-[#2d2d2d]"} shrink-0`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-500">
                  <Folder className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate">{viewingDriveFolder.name}</h3>
                  <p className="text-[11px] text-gray-400 truncate">{viewingDriveFolder.url}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={viewingDriveFolder.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1a73e8] text-white text-xs font-semibold hover:bg-[#1557b0]"
                >
                  <span>Open in Drive</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => setViewingDriveFolder(null)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Embedded Drive Frame */}
            <div className="flex-1 bg-black relative">
              {extractDriveFolderId(viewingDriveFolder.url) ? (
                <iframe
                  src={`https://drive.google.com/embeddedfolderview?id=${extractDriveFolderId(viewingDriveFolder.url)}#list`}
                  className="w-full h-full border-0"
                  title={`Embedded Drive Folder - ${viewingDriveFolder.name}`}
                />
              ) : (
                <iframe
                  src={viewingDriveFolder.url}
                  className="w-full h-full border-0"
                  title={`Embedded Drive View - ${viewingDriveFolder.name}`}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
