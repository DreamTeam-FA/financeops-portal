import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { DashboardNote } from "../../types";
import { formatPossessiveName, formatCleanName } from "../../utils/formatters";
import {
  User,
  Plus,
  Trash2,
  Check,
  Edit2,
  Search,
  ExternalLink,
  Folder,
  FolderPlus,
  Globe,
  Link as LinkIcon,
  StickyNote,
  FileText,
  ArrowLeft,
  ChevronRight,
  Calendar,
  X
} from "lucide-react";

interface MemberWorkspacePageProps {
  memberId: string;
  memberName: string;
  memberColor?: string;
}

export const MemberWorkspacePage: React.FC<MemberWorkspacePageProps> = ({
  memberId,
  memberName: initialMemberName,
  memberColor = "#1a73e8"
}) => {
  const { theme, quickNotes, addQuickNote, updateQuickNote, deleteQuickNote, setActiveMember } = useFinance();
  const isLight = theme === "light";

  // Editable Member Name State
  const [currentMemberName, setCurrentMemberName] = useState(formatCleanName(initialMemberName));
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedNameInput, setEditedNameInput] = useState(formatCleanName(initialMemberName));

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<"all" | "note" | "link" | "folder">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Add Item Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [itemType, setItemType] = useState<"note" | "link" | "folder">("note");
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [targetFolderId, setTargetFolderId] = useState<string>("");

  // Clean current display name
  const displayName = formatCleanName(currentMemberName);
  const possessiveTitle = `${formatPossessiveName(displayName)} Workspace`;

  // Filter notes/links/folders strictly for this member
  const memberItems = quickNotes.filter(
    (n) => n.memberId === memberId || (n.entity as string) === memberId
  );

  // Folders for dropdown/navigation
  const folders = memberItems.filter((i) => i.itemType === "folder");

  const handleSaveNameEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedNameInput.trim()) return;
    const cleaned = formatCleanName(editedNameInput);
    setCurrentMemberName(cleaned);
    setActiveMember({ id: memberId, name: cleaned, color: memberColor });
    setIsEditingName(false);
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    let formattedUrl = newUrl.trim();
    if (itemType === "link" && formattedUrl && !/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    addQuickNote({
      title: newTitle.trim(),
      content: newContent.trim(),
      itemType,
      url: itemType === "link" ? formattedUrl : undefined,
      folderId: targetFolderId || (selectedFolderId ?? undefined),
      category: itemType === "folder" ? "Folder" : newCategory || "General",
      entity: "TI",
      memberId: memberId,
      status: "open",
      createdAt: new Date().toISOString().split("T")[0]
    });

    setNewTitle("");
    setNewUrl("");
    setNewContent("");
    setTargetFolderId("");
    setIsAddModalOpen(false);
  };

  // Filter items based on activeTab, selectedFolderId, and searchTerm
  const filteredItems = memberItems.filter((item) => {
    // If inside a folder, only show items belonging to that folder
    if (selectedFolderId) {
      if (item.id === selectedFolderId) return false;
      if (item.folderId !== selectedFolderId) return false;
    } else {
      // If at root and viewing all/folder tabs, show folders or items not in subfolders
      if (item.itemType !== "folder" && item.folderId) return false;
    }

    // Filter by tab
    if (activeTab === "note" && (item.itemType || "note") !== "note") return false;
    if (activeTab === "link" && item.itemType !== "link") return false;
    if (activeTab === "folder" && item.itemType !== "folder") return false;

    // Search query
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      (item.content && item.content.toLowerCase().includes(q)) ||
      (item.url && item.url.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  });

  const selectedFolderObj = folders.find((f) => f.id === selectedFolderId);

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#0a0a0a] text-[#e8e8e8]"}`}>
      <PageHeader
        title={possessiveTitle}
        bgClass="bg-[#1a73e8]"
        moduleId="member-workspace"
        showEntityPills={false}
        onAddClick={() => setIsAddModalOpen(true)}
        addLabel="Add Note / Link / Folder"
      />

      {/* Top Bar with Name Editing & Workspace Tabs */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b ${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} shrink-0`}>
        {/* Workspace Identity & Edit Button */}
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: memberColor }} />
          {isEditingName ? (
            <form onSubmit={handleSaveNameEdit} className="flex items-center gap-1.5">
              <input
                type="text"
                value={editedNameInput}
                onChange={(e) => setEditedNameInput(e.target.value)}
                className={`px-2 py-1 text-xs border rounded-md font-bold ${
                  isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
                } focus:outline-none focus:border-[#1a73e8]`}
                autoFocus
              />
              <button
                type="submit"
                className="px-2 py-1 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-bold rounded-md flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditingName(false)}
                className="px-2 py-1 bg-slate-200 dark:bg-[#222] text-xs font-bold rounded-md"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold">{formatPossessiveName(displayName)} Personal Space</span>
              <button
                onClick={() => {
                  setEditedNameInput(displayName);
                  setIsEditingName(true);
                }}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#222] text-slate-400 hover:text-[#1a73e8] transition-colors"
                title="Edit Label / Member Name"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isLight ? "bg-slate-100 text-slate-600" : "bg-[#222] text-gray-300"}`}>
            {memberItems.length} total
          </span>
        </div>

        {/* Tab Filters: All, Notes, Links, Folders */}
        <div className="flex items-center gap-1">
          {(
            [
              { id: "all", label: "All Items", icon: StickyNote },
              { id: "note", label: "Notes", icon: FileText },
              { id: "link", label: "URLs / Links", icon: LinkIcon },
              { id: "folder", label: "Folders", icon: Folder }
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  isActive
                    ? "bg-[#1a73e8] text-white shadow-xs"
                    : isLight
                    ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    : "bg-[#1e1e1e] hover:bg-[#2a2a2a] text-[#aaa]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-56">
          <Search className={`w-3.5 h-3.5 absolute left-2.5 top-2.5 ${isLight ? "text-slate-400" : "text-[#666]"}`} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${displayName}'s items...`}
            className={`w-full pl-8 pr-3 py-1 text-xs border rounded-lg ${
              isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
            }`}
          />
        </div>
      </div>

      {/* Breadcrumb Navigation if inside folder */}
      {selectedFolderId && selectedFolderObj && (
        <div className={`flex items-center gap-2 px-4 py-2 border-b text-xs font-bold ${isLight ? "bg-blue-50/50 border-blue-100 text-blue-900" : "bg-[#141d2b] border-[#1e2a3a] text-blue-300"}`}>
          <button
            onClick={() => setSelectedFolderId(null)}
            className="flex items-center gap-1 text-[#1a73e8] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Root Space
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" />
          <span>{selectedFolderObj.title}</span>
        </div>
      )}

      {/* Main Grid Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredItems.length === 0 ? (
          <div className={`text-center py-16 border rounded-2xl p-8 space-y-3 ${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"}`}>
            <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto">
              {activeTab === "folder" ? <Folder className="w-6 h-6" /> : activeTab === "link" ? <LinkIcon className="w-6 h-6" /> : <User className="w-6 h-6" />}
            </div>
            <h3 className="text-sm font-bold">{displayName}'s Workspace is empty for this view</h3>
            <p className={`text-xs max-w-sm mx-auto ${isLight ? "text-slate-500" : "text-gray-400"}`}>
              No items found. Click below to add a note, URL link, or folder specifically for {displayName}.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#1a73e8] hover:bg-[#1557b0] text-white font-bold text-xs inline-flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" /> Add Item for {displayName}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredItems.map((item) => {
              const type = item.itemType || "note";

              // 1. FOLDER CARD
              if (type === "folder") {
                const subItemsCount = memberItems.filter((i) => i.folderId === item.id).length;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedFolderId(item.id)}
                    className={`border rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-xs cursor-pointer transition-all hover:border-[#1a73e8] ${
                      isLight ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-[#111] hover:bg-[#181818] border-[#262626]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          <Folder className="w-5 h-5 fill-amber-500/20" />
                        </div>
                        <div>
                          <h4 className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                            {item.title}
                          </h4>
                          <p className={`text-[11px] ${isLight ? "text-slate-500" : "text-gray-400"}`}>
                            {subItemsCount} item{subItemsCount === 1 ? "" : "s"} inside
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteQuickNote(item.id);
                        }}
                        className="text-slate-400 hover:text-red-500 p-1"
                        title="Delete Folder"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {item.content && (
                      <p className={`text-xs line-clamp-2 ${isLight ? "text-slate-600" : "text-gray-300"}`}>
                        {item.content}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-[#222] text-[11px] text-blue-600 dark:text-blue-400 font-bold">
                      <span>Open Folder</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                );
              }

              // 2. LINK / URL CARD
              if (type === "link") {
                let domain = "";
                try {
                  if (item.url) domain = new URL(item.url).hostname.replace(/^www\./, "");
                } catch {
                  domain = item.url || "";
                }

                return (
                  <div
                    key={item.id}
                    className={`border rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-xs ${
                      isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Globe className="w-3 h-3" /> {item.category || "URL Link"}
                        </span>
                        <button
                          onClick={() => deleteQuickNote(item.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                          title="Delete Link"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <h4 className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                        {item.title}
                      </h4>

                      {item.content && (
                        <p className={`text-xs mt-1 leading-relaxed ${isLight ? "text-slate-600" : "text-gray-300"}`}>
                          {item.content}
                        </p>
                      )}

                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-[#1a73e8] text-xs font-bold border border-blue-500/20 transition-colors break-all"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate max-w-[200px]">{domain || item.url}</span>
                        </a>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-[#222] text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3" /> {item.createdAt}
                      </span>
                    </div>
                  </div>
                );
              }

              // 3. NOTE CARD
              return (
                <div
                  key={item.id}
                  className={`border rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-xs ${
                    isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-blue-500/15 text-blue-600 dark:text-blue-400">
                        {item.category || "General Note"}
                      </span>
                      <button
                        onClick={() => deleteQuickNote(item.id)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                        title="Delete Note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <h4 className={`text-sm font-bold ${item.status === "done" ? "line-through text-slate-400" : isLight ? "text-slate-900" : "text-white"}`}>
                      {item.title}
                    </h4>
                    {item.content && (
                      <p className={`text-xs mt-1 leading-relaxed ${isLight ? "text-slate-600" : "text-gray-300"}`}>
                        {item.content}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-[#222] text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Calendar className="w-3 h-3" /> {item.createdAt}
                    </span>
                    <button
                      onClick={() => {
                        if (item.status === "done") {
                          updateQuickNote(item.id, { status: "open", completedAt: undefined });
                        } else {
                          updateQuickNote(item.id, {
                            status: "done",
                            completedAt: new Date().toISOString().split("T")[0]
                          });
                        }
                      }}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors ${
                        item.status === "done"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      <Check className="w-3 h-3" />
                      {item.status === "done" ? "Done" : "Mark Done"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Item Modal (Notes, Links, Folders) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-md rounded-xl border p-5 space-y-4 shadow-2xl ${
            isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#121212] border-[#2d2d2d] text-white"
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-[#262626]">
              <h3 className="text-sm font-bold flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <Plus className="w-4 h-4" /> Add Item for {displayName}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddItem} className="space-y-3 text-xs">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Item Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "note", label: "Note", icon: StickyNote },
                      { id: "link", label: "URL / Link", icon: LinkIcon },
                      { id: "folder", label: "Folder", icon: Folder }
                    ] as const
                  ).map((t) => {
                    const Icon = t.icon;
                    const isSel = itemType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setItemType(t.id)}
                        className={`py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all ${
                          isSel
                            ? "bg-[#1a73e8] text-white border-[#1a73e8]"
                            : isLight
                            ? "bg-slate-100 border-slate-300 text-slate-700"
                            : "bg-[#1e1e1e] border-[#333] text-[#aaa]"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" /> {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  {itemType === "folder" ? "Folder Name *" : itemType === "link" ? "Link Title *" : "Note Title *"}
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={
                    itemType === "folder"
                      ? "e.g. Weekly Financial Reports"
                      : itemType === "link"
                      ? "e.g. Master Payroll Google Sheet"
                      : "Note title..."
                  }
                  className={`w-full border rounded-lg p-2 text-xs ${
                    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
                  }`}
                />
              </div>

              {/* URL (for links) */}
              {itemType === "link" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">URL / Web Link *</label>
                  <input
                    type="text"
                    required
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className={`w-full border rounded-lg p-2 text-xs ${
                      isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
                    }`}
                  />
                </div>
              )}

              {/* Category (for notes & links) */}
              {itemType !== "folder" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="e.g. General, Priority, Reminders, QBO"
                    className={`w-full border rounded-lg p-2 text-xs ${
                      isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
                    }`}
                  />
                </div>
              )}

              {/* Folder Selector if folders exist */}
              {folders.length > 0 && itemType !== "folder" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Place Inside Folder (Optional)</label>
                  <select
                    value={targetFolderId}
                    onChange={(e) => setTargetFolderId(e.target.value)}
                    className={`w-full border rounded-lg p-2 text-xs ${
                      isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
                    }`}
                  >
                    <option value="">Root (No Folder)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        📁 {f.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Details / Content */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Additional remarks or details..."
                  className={`w-full border rounded-lg p-2 text-xs ${
                    isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#262626]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-white/10 text-gray-300"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-bold"
                >
                  Add {itemType === "folder" ? "Folder" : itemType === "link" ? "Link" : "Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
