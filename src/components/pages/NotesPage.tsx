import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { DashboardNote } from "../../types";
import {
  StickyNote,
  Plus,
  Search,
  Trash2,
  Edit2,
  Calendar,
  Filter,
  Check,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Sparkles
} from "lucide-react";

export const getEntityBadgeColor = (entityStr?: string) => {
  if (!entityStr || entityStr === "ALL") return "bg-slate-500/15 text-slate-500";
  if (entityStr.includes("Ruby")) return "bg-[#d81b60]/20 text-[#e91e63]";
  if (entityStr.includes("MSDx")) return "bg-[#00897b]/20 text-[#00897b]";
  if (entityStr.includes("Curcumin")) return "bg-[#6d4c41]/20 text-[#8d6e63]";
  if (entityStr.includes("TI")) return "bg-[#1a73e8]/20 text-[#1a73e8]";
  return "bg-blue-500/20 text-blue-600 dark:text-blue-300";
};

export const NotesPage: React.FC = () => {
  const {
    quickNotes,
    addQuickNote,
    updateQuickNote,
    deleteQuickNote,
    theme
  } = useFinance();

  const isLight = theme === "light";

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedEntity, setSelectedEntity] = useState<string>("ALL");
  const [selectedWeekRange, setSelectedWeekRange] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // Modal / Editing states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<DashboardNote | null>(null);

  // Form inputs
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formVendor, setFormVendor] = useState("");
  const [formEntity, setFormEntity] = useState("ALL");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);

  // Collapsed state for week groups
  const [collapsedWeeks, setCollapsedWeeks] = useState<{ [key: string]: boolean }>({});

  const toggleWeekGroup = (weekLabel: string) => {
    setCollapsedWeeks((prev) => ({ ...prev, [weekLabel]: !prev[weekLabel] }));
  };

  const handleMarkDone = (id: string) => {
    const nowStr = new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
    updateQuickNote(id, { status: "done", completedAt: nowStr });
  };

  const handleMarkOpen = (id: string) => {
    updateQuickNote(id, { status: "open", completedAt: undefined });
  };

  const openCreateModal = () => {
    setEditingNote(null);
    setFormTitle("");
    setFormContent("");
    setFormVendor("");
    setFormEntity("ALL");
    setFormDate(new Date().toISOString().split("T")[0]);
    setIsModalOpen(true);
  };

  const openEditModal = (note: DashboardNote) => {
    setEditingNote(note);
    setFormTitle(note.title);
    setFormContent(note.content);
    setFormVendor(note.vendorName || "");
    setFormEntity(note.entity || "ALL");
    setFormDate(note.createdAt || new Date().toISOString().split("T")[0]);
    setIsModalOpen(true);
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() && !formContent.trim()) return;

    if (editingNote) {
      updateQuickNote(editingNote.id, {
        title: formTitle.trim() || "Untitled Note",
        content: formContent,
        category: "General",
        entity: formEntity,
        vendorName: formVendor.trim(),
        createdAt: formDate
      });
    } else {
      addQuickNote({
        title: formTitle.trim() || "Quick Note",
        content: formContent,
        category: "General",
        entity: formEntity,
        vendorName: formVendor.trim(),
        createdAt: formDate,
        status: "open"
      });
    }

    setIsModalOpen(false);
  };

  // Filtering
  const filteredNotes = quickNotes.filter((note) => {
    const matchesSearch =
      !searchTerm ||
      note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (note.vendorName && note.vendorName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesEntity =
      selectedEntity === "ALL" ||
      note.entity === selectedEntity ||
      (!note.entity && selectedEntity === "ALL");

    const noteStatus = note.status || "open";
    const matchesStatus =
      selectedStatus === "ALL" || noteStatus === selectedStatus;

    const noteWeekLabel = getNoteWeekLabel(note.createdAt);
    const matchesWeekRange =
      selectedWeekRange === "ALL" || noteWeekLabel === selectedWeekRange;

    return matchesSearch && matchesEntity && matchesStatus && matchesWeekRange;
  });

  // Week Grouping Logic
  function getNoteWeekLabel(dateStr: string): string {
    if (!dateStr) return "Older Notes";
    const noteDate = new Date(dateStr);
    if (isNaN(noteDate.getTime())) return "Older Notes";

    const now = new Date();
    
    // Normalize to midnight
    const currentMonday = new Date(now);
    const day = currentMonday.getDay();
    const diffToMon = (day === 0 ? -6 : 1 - day);
    currentMonday.setHours(0, 0, 0, 0);
    currentMonday.setDate(currentMonday.getDate() + diffToMon);

    const noteMonday = new Date(noteDate);
    const noteDay = noteMonday.getDay();
    const noteDiffToMon = (noteDay === 0 ? -6 : 1 - noteDay);
    noteMonday.setHours(0, 0, 0, 0);
    noteMonday.setDate(noteMonday.getDate() + noteDiffToMon);

    const diffInDays = Math.round((currentMonday.getTime() - noteMonday.getTime()) / (1000 * 60 * 60 * 24));
    const diffInWeeks = Math.floor(diffInDays / 7);

    if (diffInWeeks <= 0) return "This Week";
    if (diffInWeeks === 1) return "Last Week";
    if (diffInWeeks === 2) return "2 Weeks Ago";
    if (diffInWeeks === 3) return "3 Weeks Ago";

    return `${noteDate.toLocaleString("default", { month: "short" })} ${noteDate.getFullYear()}`;
  }

  // Group notes into weeks
  const weekGroupMap: { [key: string]: DashboardNote[] } = {};
  const weekOrderPreference = ["This Week", "Last Week", "2 Weeks Ago", "3 Weeks Ago"];

  filteredNotes.forEach((note) => {
    const label = getNoteWeekLabel(note.createdAt);
    if (!weekGroupMap[label]) weekGroupMap[label] = [];
    weekGroupMap[label].push(note);
  });

  // Sorted week keys
  const weekKeys = Object.keys(weekGroupMap).sort((a, b) => {
    const idxA = weekOrderPreference.indexOf(a);
    const idxB = weekOrderPreference.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return b.localeCompare(a);
  });

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#0a0a0a] text-[#e8e8e8]"}`}>
      <PageHeader
        title="Quick Notes & Action Logs"
        bgClass="bg-purple-700"
        onAddClick={openCreateModal}
        addLabel="New Note"
      />

      {/* Filter Toolbar */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border-b shrink-0`}>
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-sm">
            <Search className={`w-3.5 h-3.5 absolute left-3 top-2.5 ${isLight ? "text-slate-400" : "text-[#666]"}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search notes by keyword, title, or content..."
              className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#181818] border-[#262626] text-white"} border rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-purple-500`}
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className={`w-3.5 h-3.5 ${isLight ? "text-slate-400" : "text-[#666]"}`} />
            
            {/* Entity Filter */}
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className={`border rounded-lg px-2.5 py-1.5 text-xs font-medium ${isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#181818] border-[#262626] text-white"}`}
            >
              <option value="ALL">All Entities</option>
              <option value="Ruby's">Ruby's</option>
              <option value="TI">TI</option>
              <option value="MSDx">MSDx</option>
              <option value="CurcuminPro">CurcuminPro</option>
            </select>

            {/* Week Range Filter */}
            <select
              value={selectedWeekRange}
              onChange={(e) => setSelectedWeekRange(e.target.value)}
              className={`border rounded-lg px-2.5 py-1.5 text-xs font-medium ${isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#181818] border-[#262626] text-white"}`}
            >
              <option value="ALL">All Week Ranges</option>
              <option value="This Week">This Week</option>
              <option value="Last Week">Last Week</option>
              <option value="2 Weeks Ago">2 Weeks Ago</option>
              <option value="3 Weeks Ago">3 Weeks Ago</option>
              <option value="Older Notes">Older Notes</option>
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className={`border rounded-lg px-2.5 py-1.5 text-xs font-medium ${isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#181818] border-[#262626] text-white"}`}
            >
              <option value="ALL">All Statuses</option>
              <option value="open">Open Notes</option>
              <option value="done">Completed (Done)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            {filteredNotes.length} Total Notes
          </span>
          <button
            onClick={openCreateModal}
            className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" /> New Note
          </button>
        </div>
      </div>

      {/* Main Content Area: Notes Grouped By Weeks */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {weekKeys.length === 0 ? (
          <div className={`text-center py-12 rounded-2xl border ${isLight ? "bg-white border-slate-200 text-slate-500" : "bg-[#111] border-[#222] text-[#888]"}`}>
            <StickyNote className="w-8 h-8 text-purple-400 mx-auto mb-2 opacity-60" />
            <p className="text-sm font-semibold">No notes found matching your filters.</p>
            <p className="text-xs text-slate-400 mt-1">Click "New Note" to record instructions or action items.</p>
          </div>
        ) : (
          weekKeys.map((weekLabel) => {
            const notesInWeek = weekGroupMap[weekLabel];
            const isCollapsed = collapsedWeeks[weekLabel] === true;

            return (
              <div
                key={weekLabel}
                className={`border rounded-2xl overflow-hidden ${
                  isLight ? "bg-white border-slate-200 shadow-xs" : "bg-[#111] border-[#262626]"
                }`}
              >
                {/* Week Group Header */}
                <div
                  onClick={() => toggleWeekGroup(weekLabel)}
                  className={`px-4 py-3 flex items-center justify-between cursor-pointer select-none border-b transition-colors ${
                    isLight
                      ? "bg-slate-50 border-slate-200 hover:bg-slate-100/80"
                      : "bg-[#181818] border-[#262626] hover:bg-[#202020]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {!isCollapsed ? (
                      <ChevronDown className="w-4 h-4 text-purple-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-purple-500" />
                    )}
                    <h3 className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"} flex items-center gap-2`}>
                      <Calendar className="w-4 h-4 text-purple-400" />
                      {weekLabel}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-600 dark:text-purple-300">
                      {notesInWeek.length} {notesInWeek.length === 1 ? "note" : "notes"}
                    </span>
                  </div>

                  <span className={`text-[11px] font-medium ${isLight ? "text-slate-400" : "text-[#666]"}`}>
                    {isCollapsed ? "Click to expand" : "Click to collapse"}
                  </span>
                </div>

                {/* Notes Grid */}
                {!isCollapsed && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {notesInWeek.map((note) => (
                      <div
                        key={note.id}
                        className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                          isLight
                            ? "bg-slate-50/70 border-slate-200 hover:border-purple-300 hover:shadow-sm"
                            : "bg-[#161616] border-[#262626] hover:border-purple-500/40"
                        }`}
                      >
                        <div>
                          {/* Note Header Badges */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Status Badge */}
                              {note.status === "done" ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-1 uppercase tracking-wider">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Done
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                  Open
                                </span>
                              )}

                              {/* Company entity badge with official color coding */}
                              {note.entity && (
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getEntityBadgeColor(
                                    note.entity
                                  )}`}
                                >
                                  {note.entity}
                                </span>
                              )}

                              {/* Vendor Name Badge */}
                              {note.vendorName && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-600 dark:text-purple-300 uppercase tracking-wider">
                                  Vendor: {note.vendorName}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => openEditModal(note)}
                                className="p-1 text-slate-400 hover:text-purple-500 transition-colors"
                                title="Edit Note"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this note?")) {
                                    deleteQuickNote(note.id);
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                title="Delete Note"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Note Title & Body */}
                          <h4 className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                            {note.title}
                          </h4>

                          <p className={`text-xs ${isLight ? "text-slate-600" : "text-[#ccc]"} mt-1.5 whitespace-pre-wrap leading-relaxed`}>
                            {note.content}
                          </p>
                        </div>

                        {/* Footer info & Done action */}
                        <div className={`pt-2.5 border-t text-[10px] flex items-center justify-between gap-2 ${
                          isLight ? "border-slate-200 text-slate-400" : "border-[#242424] text-[#666]"
                        }`}>
                          <span className="flex items-center gap-1 font-mono shrink-0">
                            <Calendar className="w-3 h-3 text-purple-400" /> {note.createdAt}
                          </span>

                          {note.status === "done" ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {note.completedAt || "Done"}
                              </span>
                              <button
                                onClick={() => handleMarkOpen(note.id)}
                                className="text-[10px] text-slate-400 hover:text-slate-200 underline"
                                title="Reopen Note"
                              >
                                Reopen
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleMarkDone(note.id)}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 transition-colors shadow-xs shrink-0"
                            >
                              <Check className="w-3 h-3" /> Done
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Note Creation / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className={`w-full max-w-lg rounded-2xl border p-5 space-y-4 ${
            isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#121212] border-[#2c2c2c] text-white"
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-[#262626]">
              <h3 className="text-sm font-bold text-purple-600 dark:text-purple-400 flex items-center gap-2">
                <StickyNote className="w-4 h-4" />
                {editingNote ? "Edit Quick Note" : "Create New Quick Note"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-[#aaa] mb-1">
                    Company / Entity
                  </label>
                  <select
                    value={formEntity}
                    onChange={(e) => setFormEntity(e.target.value)}
                    className={`w-full border rounded-lg p-2 text-xs font-medium ${
                      isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
                    }`}
                  >
                    <option value="ALL">All Entities</option>
                    <option value="Ruby's">Ruby's</option>
                    <option value="TI">TI</option>
                    <option value="MSDx">MSDx</option>
                    <option value="CurcuminPro">CurcuminPro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-[#aaa] mb-1">
                    Vendor Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sysco, McKesson, Delta"
                    value={formVendor}
                    onChange={(e) => setFormVendor(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-xs font-medium ${
                      isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
                    } focus:outline-none focus:border-purple-500`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-[#aaa] mb-1">
                  Note Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Payment Schedule Agreement"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-medium ${
                    isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
                  } focus:outline-none focus:border-purple-500`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-[#aaa] mb-1">
                  Notes & Discussion Points
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Enter notes, meeting discussion details, or action steps..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-medium ${
                    isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
                  } focus:outline-none focus:border-purple-500`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-[#aaa] mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className={`w-full border rounded-lg p-2 text-xs font-medium ${
                    isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#181818] border-[#333] text-white"
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-200 dark:bg-[#222] text-xs font-semibold text-slate-700 dark:text-[#aaa] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1"
                >
                  <Check className="w-4 h-4" /> Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
