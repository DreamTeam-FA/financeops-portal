import React, { useState, useMemo } from "react";
import { StickyNote, X, Plus, Trash2, Edit2, Check, Search, Calendar, ExternalLink } from "lucide-react";
import { useFinance } from "../../context/FinanceContext";
import { DashboardNote } from "../../types";
import { getEntityBadgeColor } from "../pages/NotesPage";

/** "Week of Aug 4–10, 2026" for any ISO date (defaults to today). */
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
  return `Week of ${monStr}–${sunday.getDate()}, ${monday.getFullYear()}`;
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

  const [isOpen, setIsOpen]           = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "all">("open");
  const [isCreating, setIsCreating]   = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);

  // ── Drag / position ────────────────────────────────────────────────────────
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = React.useRef<{ x: number; y: number; px: number; py: number; moved: boolean }>({
    x: 0, y: 0, px: 0, py: 0, moved: false,
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const px = position?.x ?? window.innerWidth - 130;
    const py = position?.y ?? window.innerHeight - 70;
    dragRef.current = { x: e.clientX, y: e.clientY, px, py, moved: false };
    setIsDragging(true);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch (_) {}
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    setPosition({
      x: Math.max(10, Math.min(window.innerWidth  - 110, dragRef.current.px + dx)),
      y: Math.max(10, Math.min(window.innerHeight - 45,  dragRef.current.py + dy)),
    });
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}
    if (!dragRef.current.moved) setIsOpen(true);
  };

  // ── Form state — GAS model: subject = vendor/who note is about (Column F)
  //                             content = instruction body (Column G)          ─
  const [subject, setSubject] = useState("");  // → note.title + note.vendorName
  const [content, setContent] = useState("");  // → note.content
  const [entity, setEntity]   = useState("ALL");

  // ── TI sub-companies from AP bills ─────────────────────────────────────────
  const tiSubCompanies = useMemo(() => {
    const set = new Set<string>();
    apBills
      .filter((b) => b.entity === "TI" && b.company && b.company !== "TI")
      .forEach((b) => set.add(b.company!));
    return Array.from(set).sort();
  }, [apBills]);

  // ── Vendor options filtered by selected entity (falls back to all vendors) ──
  const vendorOptions = useMemo(() => {
    const allVendors = new Set<string>();
    apBills.forEach((b) => b.vendor && allVendors.add(b.vendor));

    if (!entity || entity === "ALL") return Array.from(allVendors).sort();

    const filtered = new Set<string>();
    const ent = entity.toLowerCase();
    apBills
      .filter((b) =>
        (b.entity || "").toLowerCase().includes(ent) ||
        (b.company || "").toLowerCase().includes(ent)
      )
      .forEach((b) => b.vendor && filtered.add(b.vendor));

    // Fall back to all vendors so the datalist is never empty
    return (filtered.size > 0 ? Array.from(filtered) : Array.from(allVendors)).sort();
  }, [apBills, entity]);

  const resetForm = () => {
    setSubject(""); setContent(""); setEntity("ALL");
    setIsCreating(false); setEditingId(null);
  };

  const handleSave = () => {
    if (!subject.trim() && !content.trim()) return;
    const today    = new Date().toISOString().split("T")[0];
    const weekLabel = buildWeekLabel(today);
    const subjectVal = subject.trim() || "Quick Note";

    if (editingId) {
      updateQuickNote(editingId, {
        title:      subjectVal,
        content,
        category:   weekLabel,
        weekLabel,
        entity:     entity !== "ALL" ? entity : undefined,
        vendorName: subjectVal,
      });
    } else {
      addQuickNote({
        title:      subjectVal,
        content,
        category:   weekLabel,
        weekLabel,
        entity:     entity !== "ALL" ? entity : undefined,
        vendorName: subjectVal,
        createdAt:  today,
        status:     "open",
      });
    }
    resetForm();
  };

  const handleEdit = (note: DashboardNote) => {
    setEditingId(note.id);
    setSubject(note.vendorName || note.title || "");
    setContent(note.content || "");
    setEntity(note.entity || "ALL");
    setIsCreating(true);
  };

  const openCount = quickNotes.filter((n) => !n.status || n.status === "open").length;
  const doneCount = quickNotes.filter((n) => n.status === "done").length;

  const filteredNotes = quickNotes.filter((n) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !searchQuery ||
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q) ||
      (n.vendorName && n.vendorName.toLowerCase().includes(q));
    const s = n.status || "open";
    return matchSearch && (statusFilter === "all" || s === statusFilter);
  });

  const inp = `w-full p-2 rounded-lg text-xs font-medium border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
    isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#111] border-[#333] text-white"
  }`;
  const lbl = `text-[10px] font-bold block mb-1 uppercase tracking-wide ${isLight ? "text-slate-500" : "text-[#888]"}`;

  return (
    <>
      {/* ── Floating Action Pill ─────────────────────────────────────────────── */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
        className={`fixed z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full
          bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500
          text-white font-bold text-[11px] shadow-lg cursor-grab active:cursor-grabbing select-none
          transition-shadow ${!position ? "bottom-16 right-4 md:bottom-6 md:right-6" : ""}`}
        title="Drag to move | Click to open Quick Notes"
      >
        <StickyNote className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
        <span>Notes</span>
        {quickNotes.length > 0 && (
          <span className="bg-amber-400 text-slate-950 rounded-full px-1.5 py-0.5 text-[9px] font-black">
            {openCount > 0 ? `${openCount} Open` : quickNotes.length}
          </span>
        )}
      </div>

      {/* ── Modal ────────────────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl flex flex-col max-h-[85vh] overflow-hidden ${
            isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#121212] border-[#2a2a2a] text-[#e8e8e8]"
          }`}>

            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b shrink-0 ${
              isLight ? "border-slate-200 bg-slate-50" : "border-[#262626] bg-[#181818]"
            }`}>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <StickyNote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`text-sm font-extrabold ${isLight ? "text-slate-900" : "text-white"}`}>
                    Dashboard Quick Notes
                  </h3>
                  <p className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                    Action items, instructions & remarks
                  </p>
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
                  className={`p-1.5 rounded-lg transition-colors ${
                    isLight ? "hover:bg-slate-200 text-slate-500" : "hover:bg-[#262626] text-[#888]"
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* ── Create / Edit Form ────────────────────────────────────── */}
              {isCreating ? (
                <div className={`p-4 rounded-xl border space-y-3 ${
                  isLight ? "bg-slate-50 border-slate-200" : "bg-[#181818] border-[#2a2a2a]"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                      {editingId ? "Edit Note" : "New Note"}
                    </span>
                    <button onClick={resetForm} className="text-xs text-slate-400 hover:underline">Cancel</button>
                  </div>

                  {/* Entity + Vendor/Subject */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={lbl}>Company / Entity</label>
                      <select
                        value={entity}
                        onChange={(e) => { setEntity(e.target.value); setSubject(""); }}
                        className={inp}
                      >
                        <option value="ALL">— Select Entity —</option>
                        <option value="Ruby's bills">Ruby's Bills</option>
                        <option value="MSDx Bills">MSDx Bills</option>
                        <option value="TI">TI</option>
                        {tiSubCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
                        <option value="4YR">4YR</option>
                        <option value="CurcuminPro">CurcuminPro</option>
                      </select>
                    </div>

                    <div>
                      <label className={lbl}>Vendor / Subject</label>
                      <input
                        type="text"
                        list="fw-vendor-list"
                        placeholder="e.g. US Foods, NSSB Loan"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className={inp}
                      />
                      <datalist id="fw-vendor-list">
                        {vendorOptions.map((v) => <option key={v} value={v} />)}
                      </datalist>
                    </div>
                  </div>

                  {/* Instructions body */}
                  <div>
                    <label className={lbl}>Instructions / Note</label>
                    <textarea
                      rows={3}
                      placeholder="Payment instructions, remarks, action steps..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className={inp}
                    />
                  </div>

                  <button
                    onClick={handleSave}
                    className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Check className="w-4 h-4" /> Save Note
                  </button>
                </div>

              ) : (
                /* ── Note List ──────────────────────────────────────────── */
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
                          className={`bg-transparent w-full text-xs focus:outline-none ${
                            isLight ? "text-slate-900" : "text-white"
                          }`}
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
                              : isLight
                                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                : "bg-[#222] text-slate-400 hover:bg-[#2a2a2a]"
                          }`}
                        >
                          {f === "open"
                            ? `Open (${openCount})`
                            : f === "done"
                              ? `Done (${doneCount})`
                              : `All (${quickNotes.length})`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredNotes.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      No notes found. Click "Add" to create one!
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
                          {/* Badge row */}
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Week label badge */}
                              {(note.weekLabel || (note.category && note.category !== "General")) && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                                  {note.weekLabel || note.category}
                                </span>
                              )}
                              {/* Entity badge */}
                              {note.entity && (
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${getEntityBadgeColor(note.entity)}`}>
                                  {note.entity}
                                </span>
                              )}
                              {/* Status badge */}
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                                note.status === "done"
                                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                  : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                              }`}>
                                {note.status === "done" ? "Done" : "Open"}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleEdit(note)}
                                className="p-1 text-slate-400 hover:text-purple-500 transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteQuickNote(note.id)}
                                className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Title = vendor/subject (Column F) — bold header */}
                          <p className={`text-xs font-bold leading-snug ${
                            isLight ? "text-slate-800" : "text-white"
                          }`}>
                            {note.title}
                          </p>

                          {/* Body = instructions (Column G) — only if distinct from title */}
                          {note.content && note.content !== note.title && (
                            <p className={`text-[11px] mt-0.5 leading-relaxed line-clamp-2 ${
                              isLight ? "text-slate-500" : "text-[#aaa]"
                            }`}>
                              {note.content}
                            </p>
                          )}

                          {/* Footer */}
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
                                  const ts = new Date().toLocaleString("en-US", {
                                    month: "short", day: "numeric", year: "numeric",
                                    hour: "numeric", minute: "2-digit", hour12: true,
                                  });
                                  updateQuickNote(note.id, { status: "done", completedAt: ts });
                                }
                              }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors border ${
                                note.status === "done"
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                              }`}
                            >
                              <Check className="w-3 h-3" />
                              {note.status === "done" ? "Reopen" : "Mark Done"}
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
