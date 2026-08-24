import React, { useState, useMemo } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { DashboardNote } from "../../types";
import { Tooltip } from "../Tooltip";
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
} from "lucide-react";

export const getEntityBadgeColor = (entityStr?: string) => {
  if (!entityStr || entityStr === "ALL") return "bg-slate-500/15 text-slate-500";
  const e = entityStr.toLowerCase();
  if (e.includes("ruby")) return "bg-[#d81b60]/20 text-[#e91e63]";
  if (e.includes("msdx")) return "bg-[#00897b]/20 text-[#00897b]";
  if (e.includes("curcumin")) return "bg-[#6d4c41]/20 text-[#8d6e63]";
  // TI umbrella: TI itself + known sub-companies
  if (e === "ti" || e.includes("4g") || e === "4yr" || e === "e1" || e.includes("corner property") || e.includes("co-alliance") || e.includes("funnels"))
    return "bg-[#1a73e8]/20 text-[#1a73e8]";
  return "bg-blue-500/20 text-blue-600 dark:text-blue-300";
};

/** "Week of Aug 4–10, 2026" for a given ISO date string (uses today if omitted) */
function buildWeekLabel(isoDate?: string): string {
  const base = isoDate ? new Date(isoDate + "T00:00:00") : new Date();
  if (isNaN(base.getTime())) return "";
  const day = base.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const monStr = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const sunNum = sunday.getDate();
  const yr = monday.getFullYear();
  return `Week of ${monStr}–${sunNum}, ${yr}`;
}

// Known TI sub-companies (hardcoded + derived from apBills at runtime)
const STATIC_TI_SUBS = ["4G", "4YR", "E1", "Corner Property Group", "Co-Alliance"];

// Entity options that match the sheet's Company column
const ENTITY_OPTIONS = [
  { value: "Ruby's bills",  label: "Ruby's Bills" },
  { value: "MSDx Bills",    label: "MSDx Bills" },
  { value: "TI",            label: "TI" },
  { value: "4G",            label: "4G" },
  { value: "4YR",           label: "4YR" },
  { value: "E1",            label: "E1" },
  { value: "Corner Property Group", label: "Corner Property Group" },
  { value: "Co-Alliance",   label: "Co-Alliance" },
  { value: "CurcuminPro",   label: "CurcuminPro" },
];

export const NotesPage: React.FC = () => {
  const {
    quickNotes,
    apBills,
    addQuickNote,
    updateQuickNote,
    deleteQuickNote,
    showToast,
    theme
  } = useFinance();

  const isLight = theme === "light";

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<string>("ALL");
  const [selectedWeekRange, setSelectedWeekRange] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // Modal / Editing states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<DashboardNote | null>(null);

  // Form inputs — GAS model: formSubject = vendor/subject (Col F), formContent = body (Col G)
  const [formSubject, setFormSubject] = useState("");   // vendor/subject → note.title + note.vendorName
  const [formContent, setFormContent] = useState("");   // instructions   → note.content
  const [formEntity, setFormEntity]   = useState("ALL");
  const [formDate, setFormDate]       = useState(new Date().toISOString().split("T")[0]);

  // Inline delete confirmation
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const confirmDelete = (id: string) => {
    deleteQuickNote(id);
    setPendingDeleteId(null);
    showToast("Note deleted.", "success", 2500);
  };

  // Collapsed state for week groups
  const [collapsedWeeks, setCollapsedWeeks] = useState<{ [key: string]: boolean }>({});

  const toggleWeekGroup = (weekLabel: string) => {
    setCollapsedWeeks((prev) => ({ ...prev, [weekLabel]: !prev[weekLabel] }));
  };

  // ── TI sub-companies derived from AP bills (augments the static list) ─────
  const tiSubCompanies = useMemo(() => {
    const set = new Set(STATIC_TI_SUBS);
    apBills
      .filter((b) => b.entity === "TI" && b.company && b.company !== "TI")
      .forEach((b) => set.add(b.company!));
    return Array.from(set).sort();
  }, [apBills]);

  // All entity options: static base + any dynamic TI subs not already listed
  const allEntityOptions = useMemo(() => {
    const base = [...ENTITY_OPTIONS];
    tiSubCompanies.forEach((sub) => {
      if (!base.some((o) => o.value === sub)) {
        base.splice(base.findIndex((o) => o.value === "CurcuminPro"), 0, { value: sub, label: sub });
      }
    });
    return base;
  }, [tiSubCompanies]);

  // ── Vendor options filtered by selected entity (falls back to all vendors) ──
  const vendorOptions = useMemo(() => {
    const allVendors = new Set<string>();
    apBills.forEach((b) => b.vendor && allVendors.add(b.vendor));

    if (!formEntity || formEntity === "ALL") return Array.from(allVendors).sort();

    const filtered = new Set<string>();
    const fEnt = formEntity.toLowerCase();
    apBills
      .filter((b) => {
        const bEnt = (b.entity || "").toLowerCase();
        const bCom = (b.company || "").toLowerCase();
        return bEnt.includes(fEnt) || bCom.includes(fEnt) || b.company === formEntity || b.entity === formEntity;
      })
      .forEach((b) => b.vendor && filtered.add(b.vendor));

    // Fall back to all vendors so the datalist is never empty
    return (filtered.size > 0 ? Array.from(filtered) : Array.from(allVendors)).sort();
  }, [apBills, formEntity]);

  const handleMarkDone = (id: string) => {
    const nowStr = new Date().toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true
    });
    updateQuickNote(id, { status: "done", completedAt: nowStr });
  };

  const handleMarkOpen = (id: string) => {
    updateQuickNote(id, { status: "open", completedAt: undefined });
  };

  const openCreateModal = () => {
    setEditingNote(null);
    setFormSubject(""); setFormContent(""); setFormEntity("ALL");
    setFormDate(new Date().toISOString().split("T")[0]);
    setIsModalOpen(true);
  };

  const openEditModal = (note: DashboardNote) => {
    setEditingNote(note);
    setFormSubject(note.vendorName || note.title || "");
    setFormContent(note.content || "");
    setFormEntity(note.entity || "ALL");
    setFormDate(note.createdAt || new Date().toISOString().split("T")[0]);
    setIsModalOpen(true);
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubject.trim() && !formContent.trim()) return;

    const weekLabel  = buildWeekLabel(formDate);
    const subjectVal = formSubject.trim() || "Quick Note";

    if (editingNote) {
      updateQuickNote(editingNote.id, {
        title:      subjectVal,
        content:    formContent,
        category:   weekLabel || editingNote.category || "General",
        weekLabel:  weekLabel || editingNote.weekLabel,
        entity:     formEntity !== "ALL" ? formEntity : undefined,
        vendorName: subjectVal,
        createdAt:  formDate,
      });
    } else {
      addQuickNote({
        title:      subjectVal,
        content:    formContent,
        category:   weekLabel || "General",
        weekLabel:  weekLabel || undefined,
        entity:     formEntity !== "ALL" ? formEntity : undefined,
        vendorName: subjectVal,
        createdAt:  formDate,
        status:     "open",
      });
    }

    setIsModalOpen(false);
  };

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredNotes = quickNotes.filter((note) => {
    const matchesSearch =
      !searchTerm ||
      note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (note.vendorName && note.vendorName.toLowerCase().includes(searchTerm.toLowerCase()));

    // Entity filter: partial match so "Ruby's" filter catches "Ruby's bills" etc.
    const matchesEntity =
      selectedEntity === "ALL" ||
      (note.entity && note.entity.toLowerCase().includes(selectedEntity.toLowerCase())) ||
      (!note.entity && selectedEntity === "ALL");

    const noteStatus = note.status || "open";
    const matchesStatus = selectedStatus === "ALL" || noteStatus === selectedStatus;

    const noteWeekLabel = getNoteWeekLabel(note.createdAt);
    const matchesWeekRange = selectedWeekRange === "ALL" || noteWeekLabel === selectedWeekRange;

    return matchesSearch && matchesEntity && matchesStatus && matchesWeekRange;
  });

  // ── Week Grouping ──────────────────────────────────────────────────────────
  function getNoteWeekLabel(dateStr: string): string {
    if (!dateStr) return "Older Notes";
    const noteDate = new Date(dateStr);
    if (isNaN(noteDate.getTime())) return "Older Notes";

    const now = new Date();
    const currentMonday = new Date(now);
    const day = currentMonday.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    currentMonday.setHours(0, 0, 0, 0);
    currentMonday.setDate(currentMonday.getDate() + diffToMon);

    const noteMonday = new Date(noteDate);
    const noteDay = noteMonday.getDay();
    const noteDiffToMon = noteDay === 0 ? -6 : 1 - noteDay;
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

  const weekKeys = Object.keys(weekGroupMap).sort((a, b) => {
    const idxA = weekOrderPreference.indexOf(a);
    const idxB = weekOrderPreference.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return b.localeCompare(a);
  });

  const sel = `border rounded-lg px-2.5 py-1.5 text-xs font-medium ${
    isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#0d111a] border-[#1a2235] text-white"
  }`;
  const inp = `w-full border rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-purple-500 ${
    isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"
  }`;

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader
        title="Quick Notes & Action Logs"
        bgClass="bg-purple-700"
        onAddClick={openCreateModal}
        addLabel="New Note"
        sheetUrl="https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit#gid=320158278"
      />

      {/* Filter Toolbar */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border-b shrink-0`}>
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-sm">
            <Search className={`w-3.5 h-3.5 absolute left-3 top-2.5 ${isLight ? "text-slate-400" : "text-[#666]"}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search notes by keyword, title, or vendor..."
              className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#1a2235] text-white"} border rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-purple-500`}
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className={`w-3.5 h-3.5 ${isLight ? "text-slate-400" : "text-[#666]"}`} />

            <select value={selectedEntity} onChange={(e) => setSelectedEntity(e.target.value)} className={sel}>
              <option value="ALL">All Entities</option>
              <option value="Ruby">Ruby's Bills</option>
              <option value="MSDx">MSDx Bills</option>
              <option value="TI">TI</option>
              <option value="4G">4G</option>
              <option value="4YR">4YR</option>
              <option value="E1">E1</option>
              <option value="Corner Property">Corner Property Group</option>
              <option value="Co-Alliance">Co-Alliance</option>
              <option value="CurcuminPro">CurcuminPro</option>
            </select>

            <select value={selectedWeekRange} onChange={(e) => setSelectedWeekRange(e.target.value)} className={sel}>
              <option value="ALL">All Week Ranges</option>
              <option value="This Week">This Week</option>
              <option value="Last Week">Last Week</option>
              <option value="2 Weeks Ago">2 Weeks Ago</option>
              <option value="3 Weeks Ago">3 Weeks Ago</option>
              <option value="Older Notes">Older Notes</option>
            </select>

            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className={sel}>
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
        </div>
      </div>

      {/* Main Content Area: Notes Grouped By Weeks */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {weekKeys.length === 0 ? (
          <div className={`text-center py-12 rounded-2xl border ${isLight ? "bg-white border-slate-200 text-slate-500" : "bg-[#0d111a] border-[#222] text-[#888]"}`}>
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
                className={`border rounded-2xl overflow-hidden ${isLight ? "bg-white border-slate-200 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]" : "bg-[#0d111a] border-[#1a2235]"}`}
              >
                <div
                  onClick={() => toggleWeekGroup(weekLabel)}
                  className={`px-4 py-3 flex items-center justify-between cursor-pointer select-none border-b transition-colors ${
                    isLight ? "bg-slate-50 border-slate-200 hover:bg-slate-100/80" : "bg-[#0d111a] border-[#1a2235] hover:bg-[#202020]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {!isCollapsed ? <ChevronDown className="w-4 h-4 text-purple-500" /> : <ChevronRight className="w-4 h-4 text-purple-500" />}
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

                {!isCollapsed && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {notesInWeek.map((note) => (
                      <div
                        key={note.id}
                        className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                          isLight
                            ? "bg-slate-50/70 border-slate-200 hover:border-purple-300 hover:shadow-sm"
                            : "bg-[#161616] border-[#1a2235] hover:border-purple-500/40"
                        }`}
                      >
                        <div>
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

                              {/* Entity badge — hidden to keep cards clean */}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {pendingDeleteId === note.id ? (
                                <>
                                  <span className={`text-[10px] font-semibold ${isLight ? "text-slate-600" : "text-[#aaa]"}`}>Delete?</span>
                                  <button
                                    onClick={() => confirmDelete(note.id)}
                                    className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold transition-colors"
                                  >Yes</button>
                                  <button
                                    onClick={() => setPendingDeleteId(null)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${isLight ? "bg-slate-200 text-slate-700 hover:bg-slate-300" : "bg-[#333] text-[#ccc] hover:bg-[#444]"}`}
                                  >No</button>
                                </>
                              ) : (
                                <>
                                  <Tooltip label="Edit Note">
                                  <button onClick={() => openEditModal(note)} className="p-1 text-slate-400 hover:text-purple-500 transition-colors">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  </Tooltip>
                                  <Tooltip label="Delete Note">
                                  <button
                                    onClick={() => setPendingDeleteId(note.id)}
                                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  </Tooltip>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Week label badge — hidden to keep cards clean */}

                          {/* Title = vendor/subject (Column F) */}
                          <h4 className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                            {note.title}
                          </h4>
                          {/* Body = instructions (Column G) */}
                          {note.content && note.content !== note.title && (
                            <p className={`text-xs ${isLight ? "text-slate-600" : "text-[#ccc]"} mt-1.5 whitespace-pre-wrap leading-relaxed`}>
                              {note.content}
                            </p>
                          )}
                        </div>

                        <div className={`pt-2.5 border-t text-[10px] flex items-center justify-between gap-2 ${isLight ? "border-slate-200 text-slate-400" : "border-[#242424] text-[#666]"}`}>
                          <span className="flex items-center gap-1 font-mono shrink-0">
                            <Calendar className="w-3 h-3 text-purple-400" /> {note.createdAt}
                          </span>

                          {note.status === "done" ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {note.completedAt || "Done"}
                              </span>
                              <Tooltip label="Reopen Note">
                              <button onClick={() => handleMarkOpen(note.id)} className="text-[10px] text-slate-400 hover:text-slate-200 underline">
                                Reopen
                              </button>
                              </Tooltip>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleMarkDone(note.id)}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 transition-colors shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] shrink-0"
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
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-[#1a2235]">
              <h3 className="text-sm font-bold text-purple-600 dark:text-purple-400 flex items-center gap-2">
                <StickyNote className="w-4 h-4" />
                {editingNote ? "Edit Quick Note" : "Create New Quick Note"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-xs text-slate-400 hover:text-white">
                Cancel
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-3">
              {/* Entity + Vendor/Subject row */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-[#aaa] mb-1">Company / Entity</label>
                  <select
                    value={formEntity}
                    onChange={(e) => { setFormEntity(e.target.value); setFormSubject(""); }}
                    className={inp}
                  >
                    <option value="ALL">— Select Entity —</option>
                    {allEntityOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-[#aaa] mb-1">Vendor / Subject</label>
                  <input
                    type="text"
                    list="np-vendor-list"
                    required
                    placeholder="e.g. US Foods, NSSB Loan, Payroll"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    className={inp}
                  />
                  <datalist id="np-vendor-list">
                    {vendorOptions.map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-[#aaa] mb-1">Instructions / Note Details</label>
                <textarea
                  rows={4}
                  placeholder="Enter payment instructions, meeting discussion details, or action steps..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  className={inp}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-[#aaa] mb-1">Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className={inp}
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
