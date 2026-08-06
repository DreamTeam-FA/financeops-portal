import React, { useState, useMemo } from "react";
import { StickyNote, X, Plus, Trash2, Edit2, Check, Search, Calendar, ExternalLink } from "lucide-react";
import { useFinance } from "../../context/FinanceContext";
import { DashboardNote } from "../../types";
import { getEntityBadgeColor } from "../pages/NotesPage";

/** Compute "Week of Aug 4–10, 2026" for any ISO date string (defaults to today). */
function getWeekLabel(isoDate?: string): string {
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

export const NotesFloatingWidget: React.FC = () => {
  const {
    theme,
    quickNotes,
    apBills,
    addQuickNote,
    updateQuickNote,
    deleteQuickNote,
    setCurrentPage
  } = useFinance();

  const isLight = theme === "light";

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "all">("open");
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Position and drag state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = React.useRef<{ x: number; y: number; startPosX: number; startPosY: number; hasMoved: boolean }>({
    x: 0, y: 0, startPosX: 0, startPosY: 0, hasMoved: false
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const initialX = position ? position.x : window.innerWidth - 130;
    const initialY = position ? position.y : window.innerHeight - 70;
    dragStartRef.current = { x: e.clientX, y: e.clientY, startPosX: initialX, startPosY: initialY, hasMoved: false };
    setIsDragging(true);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch (_) {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragStartRef.current.hasMoved = true;
    const newX = Math.max(10, Math.min(window.innerWidth - 110, dragStartRef.current.startPosX + dx));
    const newY = Math.max(10, Math.min(window.innerHeight - 45, dragStartRef.current.startPosY + dy));
    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}
    if (!dragStartRef.current.hasMoved) setIsOpen(true);
  };

  // ── Form states ────────────────────────────────────────────────────────────
  const [title, setTitle]   = useState("");
  const [content, setContent] = useState("");
  const [vendor, setVendor] = useState("");   // <-- fixed: own state, not title
  const [entity, setEntity] = useState("ALL");

  // ── TI sub-companies derived from AP bills ─────────────────────────────────
  const tiSubCompanies = useMemo(() => {
    const set = new Set<string>();
    apBills.filter((b) => b.entity === "TI" && b.company && b.company !== "TI").forEach((b) => set.add(b.company!));
    return Array.from(set).sort();
  }, [apBills]);

  // ── Vendor options filtered by selected entity ─────────────────────────────
  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    apBills
      .filter((b) => {
        if (!entity || entity === "ALL") return true;
        return b.entity === entity || b.company === entity || (b.sheet || "").includes(entity);
      })
      .forEach((b) => b.vendor && set.add(b.vendor));
    return Array.from(set).sort();
  }, [apBills, entity]);

  const resetForm = () => {
    setTitle(""); setContent(""); setVendor(""); setEntity("ALL");
    setIsCreating(false); setEditingId(null);
  };

  const handleSave = () => {
    if (!title.trim() && !content.trim()) return;
    const today = new Date().toISOString().split("T")[0];
    const weekLabel = getWeekLabel(today);

    if (editingId) {
      updateQuickNote(editingId, {
        title: title.trim() || "Untitled Note",
        content,
        category: weekLabel,
        weekLabel,
        entity: entity !== "ALL" ? entity : undefined,
        vendorName: vendor.trim() || undefined,
      });
    } else {
      addQuickNote({
        title: title.trim() || "Quick Note",
        content,
        category: weekLabel,
        weekLabel,
        entity: entity !== "ALL" ? entity : undefined,
        vendorName: vendor.trim() || undefined,
        createdAt: today,
        status: "open",
      });
    }
    resetForm();
  };

  const handleEdit = (note: DashboardNote) => {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setVendor(note.vendorName || "");
    setEntity(note.entity || "ALL");
    setIsCreating(true);
  };

  const openCount = quickNotes.filter((n) => n.status === "open" || !n.status).length;
  const doneCount = quickNotes.filter((n) => n.status === "done").length;

  const filteredNotes = quickNotes.filter((n) => {
    const matchesSearch =
      !searchQuery ||
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.vendorName && n.vendorName.toLowerCase().includes(searchQuery.toLowerCase()));
    const statusVal = n.status || "open";
    return matchesSearch && (statusFilter === "all" ? true : statusVal === statusFilter);
  });

  const inp = `w-full p-2 rounded-lg text-xs font-medium border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
    isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#111] border-[#333] text-white"
  }`;
  const lbl = `text-[10px] font-bold block mb-1 uppercase ${isLight ? "text-slate-500" : "text-[#888]"}`;

  return (
    <>
      {/* Floating Action Pill */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
        className={`fixed z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-[11px] shadow-lg cursor-grab active:cursor-grabbing select-none transition-shadow ${
          !position ? "bottom-16 right-4 md:bottom-6 md:right-6" : ""
        }`}
        title="Drag to move | Click to open Quick Notes"
      >
        <StickyNote className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
        <span>Notes</span>
        {quickNotes.length > 0 && (
          <span className="bg-amber-400 text-slate-950 rounded-full px-1.5 py-0.2 text-[9px] font-black">
            {openCount > 0 ? `${openCount} Open` : `${quickNotes.length}`}
          </span>
        )}
      </div>

      {/* Floating Notes Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl flex flex-col max-h-[85vh] overflow-hidden ${
            isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#121212] border-[#2a2a2a] text-[#e8e8e8]"
          }`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${isLight ? "border-slate-200 bg-slate-50" : "border-[#262626] bg-[#181818]"}`}>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <StickyNote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`text-sm font-extrabold ${isLight ? "text-slate-900" : "text-white"}`}>Dashboard Quick Notes</h3>
                  <p className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>Action items, instructions & remarks</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setIsOpen(false); setCurrentPage("notes"); }}
                  className="px-2.5 py-1 rounded bg-purple-600/20 hover:bg-purple-600/30 text-purple-600 dark:text-purple-300 font-bold text-xs flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Full Page
                </button>
                <button
                  onClick={() => { setIsOpen(false); resetForm(); }}
                  className={`p-1.5 rounded-lg ${isLight ? "hover:bg-slate-200 text-slate-500" : "hover:bg-[#262626] text-[#888]"} transition-colors`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isCreating ? (
                <div className={`p-4 rounded-xl border space-y-3 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#181818] border-[#2a2a2a]"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                      {editingId ? "Edit Note" : "New Note"}
                    </span>
                    <button onClick={resetForm} className="text-xs text-slate-500 hover:underline">Cancel</button>
                  </div>

                  {/* Note Title */}
                  <input
                    type="text"
                    placeholder="Note Title (e.g., AP Follow Up)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={inp}
                  />

                  {/* Details / content */}
                  <textarea
                    rows={3}
                    placeholder="Write details, payment remarks, or instructions..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className={inp}
                  />

                  {/* Entity + Vendor row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={lbl}>Company / Entity</label>
                      <select value={entity} onChange={(e) => { setEntity(e.target.value); setVendor(""); }} className={inp}>
                        <option value="ALL">All Entities</option>
                        <option value="Ruby's">Ruby's</option>
                        <option value="Ruby's Bills">Ruby's Bills</option>
                        <option value="MSDx">MSDx</option>
                        <option value="MSDx Bills">MSDx Bills</option>
                        <option value="TI">TI</option>
                        {tiSubCompanies.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        <option value="CurcuminPro">CurcuminPro</option>
                      </select>
                    </div>

                    <div>
                      <label className={lbl}>Vendor Name</label>
                      <input
                        type="text"
                        list="fw-vendor-list"
                        placeholder="e.g. Sysco, McKesson"
                        value={vendor}
                        onChange={(e) => setVendor(e.target.value)}
                        className={inp}
                      />
                      <datalist id="fw-vendor-list">
                        {vendorOptions.map((v) => <option key={v} value={v} />)}
                      </datalist>
                    </div>
                  </div>

                  <button
                    onClick={handleSave}
                    className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Check className="w-4 h-4" /> Save Note
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                        isLight ? "bg-slate-50 border-slate-200" : "bg-[#181818] border-[#262626]"
                      }`}>
                        <Search className="w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search notes..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className={`bg-transparent w-full text-xs focus:outline-none ${isLight ? "text-slate-900" : "text-white"}`}
                        />
                      </div>
                      <button
                        onClick={() => { resetForm(); setIsCreating(true); }}
                        className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1 shrink-0 transition-colors shadow-xs"
                      >
                        <Plus className="w-4 h-4" /> Add
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(["open", "done", "all"] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setStatusFilter(f)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                            statusFilter === f
                              ? f === "open"
                                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40"
                                : f === "done"
                                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
                                  : "bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/40"
                              : isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#222] text-slate-400 hover:bg-[#2a2a2a]"
                          }`}
                        >
                          {f === "open" ? `Open (${openCount})` : f === "done" ? `Done (${doneCount})` : `All (${quickNotes.length})`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredNotes.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      No notes found. Click "Add" to create a note!
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredNotes.map((note) => (
                        <div
                          key={note.id}
                          className={`p-3.5 rounded-xl border transition-all ${
                            isLight
                              ? "bg-slate-50 border-slate-200 hover:border-purple-300"
                              : "bg-[#181818] border-[#262626] hover:border-purple-500/50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {note.weekLabel && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-700 dark:text-purple-300 uppercase">
                                  {note.weekLabel}
                                </span>
                              )}
                              {!note.weekLabel && note.category && note.category !== "General" && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-700 dark:text-purple-300 uppercase">
                                  {note.category}
                                </span>
                              )}
                              {note.entity && (
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getEntityBadgeColor(note.entity)}`}>
                                  {note.entity}
                                </span>
                              )}
                              {note.vendorName && (
                                <span className={`text-[10px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                                  {note.vendorName}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => handleEdit(note)} className="p-1 text-slate-400 hover:text-purple-500 transition-colors">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteQuickNote(note.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <p className={`text-xs font-semibold ${isLight ? "text-slate-800" : "text-[#e8e8e8]"} whitespace-pre-wrap leading-relaxed`}>
                            {note.title}
                          </p>
                          {note.content && (
                            <p className={`text-[11px] mt-0.5 ${isLight ? "text-slate-500" : "text-[#888]"} whitespace-pre-wrap leading-relaxed line-clamp-2`}>
                              {note.content}
                            </p>
                          )}

                          <div className={`mt-2 pt-2 border-t text-[10px] flex items-center justify-between ${
                            isLight ? "border-slate-200 text-slate-400" : "border-[#222] text-[#666]"
                          }`}>
                            <span className="flex items-center gap-1 font-mono">
                              <Calendar className="w-3 h-3" /> {note.createdAt}
                            </span>
                            <button
                              onClick={() => {
                                if (note.status === "done") {
                                  updateQuickNote(note.id, { status: "open", completedAt: undefined });
                                } else {
                                  const nowStr = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
                                  updateQuickNote(note.id, { status: "done", completedAt: nowStr });
                                }
                              }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors ${
                                note.status === "done"
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                              }`}
                            >
                              <Check className="w-3 h-3" />
                              {note.status === "done" ? "Done" : "Mark Done"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
