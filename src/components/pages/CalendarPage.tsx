import React, { useState, useEffect, useMemo } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { Tooltip } from "../Tooltip";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  X,
  Users,
  Check,
  Edit2,
  Download,
  ListTodo,
  RefreshCw,
  AlertTriangle,
  Zap,
  Filter
} from "lucide-react";
import { getAccessToken, clearAccessToken } from "../../services/googleAuth";
import {
  fetchGoogleCalendarEvents,
  createGoogleCalendarEvent,
  fetchCalendarSheetEvents,
  loadCalendarSheet,
  appendCalendarRow,
  updateCalendarDone,
  updateCalendarRow,
  clearCalendarRow,
  CalSheetRow,
  ColMap,
  GoogleCalendarEvent
} from "../../services/googleCalendarService";
import { PortalCalendarEvent } from "../../types";

const INITIAL_TEAM_ASSIGNEES = [
  { id: "a1", name: "Norlan", color: "#1D6AE5" },
  { id: "a2", name: "Micah", color: "#8E24AA" },
  { id: "a3", name: "Monica", color: "#D81B60" },
  { id: "a4", name: "Iza", color: "#00897b" },
  { id: "a5", name: "Mark", color: "#F09300" }
];

const CALENDAR_OVERRIDES_KEY = "financeops_calendar_overrides";

function readCalendarOverrides(): { done: Record<string, boolean>; deleted: string[] } {
  try {
    const saved = JSON.parse(localStorage.getItem(CALENDAR_OVERRIDES_KEY) || "{}");
    return { done: saved.done || {}, deleted: Array.isArray(saved.deleted) ? saved.deleted : [] };
  } catch {
    return { done: {}, deleted: [] };
  }
}

// Extracted edit-form body so we avoid an IIFE inside JSX ternary (invalid in esbuild/vite)
const EditFormBody: React.FC<{
  editDate: string; setEditDate: (v: string) => void;
  editTime: string; setEditTime: (v: string) => void;
  editCategory: "event"|"task"|"meeting"; setEditCategory: (v: "event"|"task"|"meeting") => void;
  editUrgency: "critical"|"high"|"normal"|"low"; setEditUrgency: (v: "critical"|"high"|"normal"|"low") => void;
  editAssignee: string; setEditAssignee: (v: string) => void;
  editDesc: string; setEditDesc: (v: string) => void;
  assignees: { id: string; name: string; color: string }[];
  isLight: boolean;
  accentHex: string;
  urgencyPill: Record<"critical"|"high"|"normal"|"low", { dot: string; active: string; inactive: string }>;
}> = ({ editDate, setEditDate, editTime, setEditTime, editCategory, setEditCategory, editUrgency, setEditUrgency, editAssignee, setEditAssignee, editDesc, setEditDesc, assignees, isLight, accentHex, urgencyPill }) => {
  const inputCls = `w-full rounded-lg px-2.5 py-2 border-[1.5px] text-[13px] transition-colors focus:outline-none ${isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#2a2f3e] border-[#3a3f50] text-white"}`;
  const onFocus = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => { e.target.style.borderColor = accentHex; };
  const onBlur  = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => { e.target.style.borderColor = ""; };
  const lbl = `block text-[11px] font-bold mb-1 ${isLight ? "text-slate-500" : "text-slate-400"}`;
  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* Date + Time */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl}>Date</label>
          <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={inputCls} onFocus={onFocus} onBlur={onBlur} />
        </div>
        <div>
          <label className={lbl}>Time</label>
          <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className={inputCls} onFocus={onFocus} onBlur={onBlur} />
        </div>
      </div>
      {/* Category — full width */}
      <div>
        <label className={lbl}>Category</label>
        <select value={editCategory} onChange={e => setEditCategory(e.target.value as any)} className={inputCls} onFocus={onFocus} onBlur={onBlur}>
          <option value="task">✅ Task</option>
          <option value="event">📅 Event</option>
          <option value="meeting">🤝 Meeting</option>
        </select>
      </div>
      {/* Urgency — full-width 4-pill row */}
      <div>
        <label className={lbl}>Urgency Level</label>
        <div className="grid grid-cols-4 gap-1.5">
          {(["critical", "high", "normal", "low"] as const).map((urg) => {
            const p = urgencyPill[urg];
            const isSel = editUrgency === urg;
            return (
              <button key={urg} type="button" onClick={() => setEditUrgency(urg)}
                className={`py-1.5 rounded-full border text-[11px] font-extrabold capitalize transition-all flex items-center justify-center gap-1 ${isSel ? p.active : p.inactive}`}>
                <span className={`text-[8px] leading-none ${isSel ? "text-white" : p.dot}`}>●</span>
                {urg.charAt(0).toUpperCase() + urg.slice(1)}
              </button>
            );
          })}
        </div>
      </div>
      {/* Assignee */}
      <div>
        <label className={lbl}>Assignee</label>
        <select value={editAssignee} onChange={e => setEditAssignee(e.target.value)} className={inputCls} onFocus={onFocus} onBlur={onBlur}>
          <option value="">— Unassigned —</option>
          {assignees.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
        </select>
      </div>
      {/* Notes */}
      <div>
        <label className={lbl}>Notes / Description</label>
        <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
          className={`${inputCls} resize-vertical`} placeholder="Add notes..."
          onFocus={onFocus as any} onBlur={onBlur as any} />
      </div>
    </div>
  );
};

export const CalendarPage: React.FC = () => {
  const {
    apBills,
    loans,
    arItems,
    payrollWeeks,
    localCalendarEvents,
    addCalendarEvent,
    deleteCalendarEvent,
    updateCalendarEvent,
    calendarLocalEvents = [],
    toggleCalendarLocalEventDone,
    googleUser,
    handleGoogleSignIn,
    theme,
    showToast
  } = useFinance() as any;

  const isLight = theme === "light";

  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<"week" | "month">("month");
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loadingGoogleCal, setLoadingGoogleCal] = useState(false);
  const [hasGoogleToken, setHasGoogleToken] = useState(() => !!getAccessToken());

  // Assignees State with localStorage persistence so deletions stick across sessions
  const [assignees, setAssignees] = useState(() => {
    try {
      const saved = localStorage.getItem("calendar_team_assignees");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_TEAM_ASSIGNEES;
  });

  useEffect(() => {
    try {
      localStorage.setItem("calendar_team_assignees", JSON.stringify(assignees));
    } catch (e) {}
  }, [assignees]);

  const [showAssigneeModal, setShowAssigneeModal] = useState(false);
  const [newAssigneeName, setNewAssigneeName] = useState("");
  const [newAssigneeColor, setNewAssigneeColor] = useState("#1D6AE5");
  const [editingColorId, setEditingColorId] = useState<string | null>(null); // which assignee's color picker is open

  const ASSIGNEE_COLORS = [
    // Blues
    "#1D6AE5","#3B82F6","#0EA5E9","#06B6D4","#6366F1","#8B5CF6",
    // Pinks / Reds
    "#D81B60","#EC4899","#F43F5E","#EF4444","#F97316","#F59E0B",
    // Greens
    "#10B981","#059669","#16A34A","#22C55E","#84CC16","#EAB308",
    // Neutrals / others
    "#64748B","#78716C","#6B7280","#0F766E","#7C3AED","#9333EA",
  ];

  // Calendar Sheet Sync State
  const [sheetEvents, setSheetEvents] = useState<CalSheetRow[]>([]);
  const [doneOverrides, setDoneOverrides] = useState<Record<string, boolean>>(() => readCalendarOverrides().done);
  const [sheetTab, setSheetTab] = useState("Events"); // actual tab name — "Events" not "Calendar"
  const [sheetColMap, setSheetColMap] = useState<ColMap>({ date: 4, end: 5, allDay: 6, title: 2, notes: 3, entity: 7, type: 9, assignee: 11, urgency: 8, done: 15, id: 0 });
  const [sheetLoading, setSheetLoading] = useState(false);
  // IDs of events deleted this session — suppresses them even if still in calendarLocalEvents
  const [deletedEventIds, setDeletedEventIds] = useState<Set<string>>(() => new Set(readCalendarOverrides().deleted));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // On mount: load server-stored calendar overrides to seed doneOverrides + deletedEventIds
  // so they survive page refresh (server is source of truth, not React state)
  useEffect(() => {
    fetch("/api/data")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const overrides = data.calendarOverrides;
        if (!overrides) return;
        if (overrides.done && Object.keys(overrides.done).length > 0) {
          // Client cache covers a refresh immediately after a click, before the
          // background API request has reached the server.
          setDoneOverrides(current => ({ ...overrides.done, ...current }));
        }
        if (overrides.deleted && overrides.deleted.length > 0) {
          setDeletedEventIds(current => new Set([...overrides.deleted, ...current]));
        }
      })
      .catch(() => {}); // non-fatal
  }, []);

  // Keep a synchronous browser-side copy as a safety net for in-flight writes;
  // the source sheet and server remain the shared persistence layers.
  useEffect(() => {
    localStorage.setItem(CALENDAR_OVERRIDES_KEY, JSON.stringify({
      done: doneOverrides,
      deleted: Array.from(deletedEventIds),
    }));
  }, [doneOverrides, deletedEventIds]);

  // Load events from the calendar sheet — runs on mount, on auth change, and after silent token refresh
  const loadSheetEvents = () => {
    const token = getAccessToken();
    if (!token) return;
    setSheetLoading(true);
    loadCalendarSheet(token)
      .then(({ events, tab, colMap }) => {
        setSheetEvents(events);
        setSheetTab(tab);
        setSheetColMap(colMap);
        setHasGoogleToken(true);
      })
      .catch(err => {
        if ((err as any)?.status === 401) {
          clearAccessToken();
          setHasGoogleToken(false);
        } else {
          console.warn("Calendar sheet load failed:", err);
        }
      })
      .finally(() => setSheetLoading(false));
  };

  useEffect(() => {
    loadSheetEvents();
    const onRefresh = () => { setHasGoogleToken(true); loadSheetEvents(); };
    window.addEventListener("google-token-refreshed", onRefresh);
    return () => window.removeEventListener("google-token-refreshed", onRefresh);
  }, [googleUser]);

  // Bottom Notes / Remarks Bar State

  // Modal State for New Event / Task
  const [showModal, setShowModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<{
    title: string;
    type: string;
    date: string;
    time?: string;
    endTime?: string;
    description?: string;
    vendor?: string;
    amount?: number;
    id?: string;
    isLocalTask?: boolean;
    urgency?: string;
    assignee?: string;
    assigneeColor?: string;
    assigneeIds?: string[];
    done?: boolean;
    sheetRow?: number;
    category?: string;
    entity?: string;
    billsList?: typeof apBills;
    arList?: typeof arItems;
  } | null>(null);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState(new Date().toISOString().split("T")[0]);
  const [taskTime, setTaskTime] = useState("09:00");
  const [taskCategory, setTaskCategory] = useState<"event" | "task" | "meeting">("event");
  const [taskUrgency, setTaskUrgency] = useState<"critical" | "high" | "normal" | "low">("normal");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [syncToGoogleCal, setSyncToGoogleCal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit event modal state
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [showUrgencyPicker, setShowUrgencyPicker] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editCategory, setEditCategory] = useState<"event" | "task" | "meeting">("task");
  const [editUrgency, setEditUrgency] = useState<"critical" | "high" | "normal" | "low">("normal");
  const [editAssignee, setEditAssignee] = useState("");
  const [editDesc, setEditDesc] = useState("");


  const calYear = currentDate.getFullYear();
  const calMonth = currentDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const normalizeDateToYYYYMMDD = (rawDateStr: string | undefined): string | null => {
    if (!rawDateStr) return null;
    const str = rawDateStr.trim();
    if (!str) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    const mdyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (mdyMatch) {
      const month = mdyMatch[1].padStart(2, "0");
      const day = mdyMatch[2].padStart(2, "0");
      const year = mdyMatch[3];
      return `${year}-${month}-${day}`;
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    return null;
  };

  const handlePrev = () => {
    if (calendarView === "week") {
      setCurrentDate(new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000));
    } else {
      setCurrentDate(new Date(calYear, calMonth - 1, 1));
    }
  };

  const handleNext = () => {
    if (calendarView === "week") {
      setCurrentDate(new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000));
    } else {
      setCurrentDate(new Date(calYear, calMonth + 1, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Fetch Google Calendar Events — also re-runs after silent token refresh
  const fetchGoogleEvents = () => {
    const token = getAccessToken();
    const timeMin = new Date(calYear, calMonth, 1).toISOString();
    const timeMax = new Date(calYear, calMonth + 1, 0, 23, 59, 59).toISOString();
    setLoadingGoogleCal(true);
    Promise.all([
      token ? fetchGoogleCalendarEvents(token, timeMin, timeMax) : Promise.resolve([]),
      // Only fetch sheet events via GViz fallback when NOT authenticated —
      // when authenticated, sheetEvents (loaded via loadSheetEvents/OAuth) covers it
      // and avoids returning unstructured bank-calendar junk entries
      token ? Promise.resolve([]) : fetchCalendarSheetEvents(undefined)
    ])
      .then(([gCalEvs, sheetEvs]) => {
        setGoogleEvents([...gCalEvs, ...sheetEvs]);
        setHasGoogleToken(true);
      })
      .catch(err => {
        if ((err as any)?.status === 401) {
          clearAccessToken();
          setHasGoogleToken(false);
        }
      })
      .finally(() => setLoadingGoogleCal(false));
  };

  useEffect(() => {
    fetchGoogleEvents();
    const onRefresh = () => { setHasGoogleToken(true); fetchGoogleEvents(); };
    window.addEventListener("google-token-refreshed", onRefresh);
    return () => window.removeEventListener("google-token-refreshed", onRefresh);
  }, [calYear, calMonth, googleUser]);

  // AP Bills by Date Key — exclude paid bills from calendar
  const apBillsByDate: { [dateStr: string]: typeof apBills } = {};
  apBills.filter((b) => b.status !== "paid").forEach((b) => {
    const key = normalizeDateToYYYYMMDD(b.dueDate);
    if (!key) return;
    if (!apBillsByDate[key]) apBillsByDate[key] = [];
    apBillsByDate[key].push(b);
  });

  // AR Items by Date Key — exclude paid (payment===true) receivables from calendar
  const arByDate: { [dateStr: string]: typeof arItems } = {};
  arItems.filter((a) => !a.payment).forEach((a) => {
    const key = normalizeDateToYYYYMMDD(a.dueDate);
    if (!key) return;
    if (!arByDate[key]) arByDate[key] = [];
    arByDate[key].push(a);
  });

  // Calculate Status & Color for AP Due Date Pills
  const getApDueDateColor = (dateStr: string, bills: typeof apBills) => {
    let hasHold = false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + "T00:00:00");
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 3600 * 24));

    bills.forEach((b) => {
      const st = (b.status || "").toLowerCase();
      if (st.includes("hold") || st.includes("pending approval")) hasHold = true;
    });

    if (hasHold) return { bg: "bg-amber-600", text: "text-white" };
    if (diffDays <= 0) return { bg: "bg-red-600", text: "text-white" };
    if (diffDays <= 2) return { bg: "bg-amber-500", text: "text-white" };
    return { bg: "bg-emerald-600", text: "text-white" };
  };

  // Event chip color style helper
  // Convert 24h "23:30" → "11:30 PM" (matches GAS fmtT function)
  const to12h = (t: string): string => {
    const [hStr, mStr] = t.split(":");
    let h = parseInt(hStr, 10);
    const m = String(mStr || "00").padStart(2, "0");
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ap}`;
  };

  const urgencyDisplay = (u?: string): string => {
    if (u === "critical") return "🔴 Critical";
    if (u === "high") return "🟠 High priority";
    if (u === "normal") return "🔵 Normal";
    if (u === "low") return "🟢 Low";
    return "";
  };

  // Build assigneeId → color map by scanning all events (mirrors GAS calAssignees lookup)
  const assigneeColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    calendarLocalEvents.forEach((ev: any) => {
      if (ev.assigneeId && ev.assigneeColor) map[ev.assigneeId] = ev.assigneeColor;
    });
    sheetEvents.forEach((ev) => {
      if ((ev as any).assigneeId && (ev as any).assigneeColor) {
        map[(ev as any).assigneeId] = (ev as any).assigneeColor;
      }
    });
    return map;
  }, [calendarLocalEvents, sheetEvents]);

  // Get colored bar array for an event chip (one per assignee, like GAS eventPillBars)
  const getEventColorBars = (ev: { assigneeIds?: string[]; assigneeColor?: string }): string[] => {
    if (ev.assigneeIds && ev.assigneeIds.length > 0) {
      return ev.assigneeIds.map(id => assigneeColorMap[id] || ev.assigneeColor || "").filter(Boolean);
    }
    return ev.assigneeColor ? [ev.assigneeColor] : [];
  };

  const getChipStyle = (type: string, category?: string, urgency?: string) => {
    if (type === "loan")    return { border: "border-l-[3px] border-purple-500", bg: isLight ? "bg-purple-100 ring-1 ring-purple-200" : "bg-purple-500/25 ring-1 ring-purple-500/30", text: isLight ? "text-purple-900" : "text-purple-100", shadow: "shadow-[0_1px_6px_rgba(168,85,247,.35)]" };
    if (type === "ar")      return { border: "border-l-[3px] border-emerald-500", bg: isLight ? "bg-emerald-100 ring-1 ring-emerald-200" : "bg-emerald-500/25 ring-1 ring-emerald-500/30", text: isLight ? "text-emerald-900" : "text-emerald-100", shadow: "shadow-[0_1px_6px_rgba(16,185,129,.35)]" };
    if (type === "payroll") return { border: "border-l-[3px] border-blue-500", bg: isLight ? "bg-blue-100 ring-1 ring-blue-200" : "bg-blue-500/25 ring-1 ring-blue-500/30", text: isLight ? "text-blue-900" : "text-blue-100", shadow: "shadow-[0_1px_6px_rgba(59,130,246,.35)]" };
    if (type === "google" && !category) return { border: "border-l-[3px] border-sky-400", bg: isLight ? "bg-sky-100 ring-1 ring-sky-200" : "bg-sky-500/25 ring-1 ring-sky-500/30", text: isLight ? "text-sky-900" : "text-sky-100", shadow: "shadow-[0_1px_6px_rgba(56,189,248,.35)]" };
    if (urgency === "critical") return { border: "border-l-[3px] border-red-500", bg: isLight ? "bg-red-100 ring-1 ring-red-200" : "bg-red-500/25 ring-1 ring-red-500/30", text: isLight ? "text-red-900" : "text-red-100", shadow: "shadow-[0_1px_6px_rgba(239,68,68,.4)]" };
    if (urgency === "high")     return { border: "border-l-[3px] border-orange-500", bg: isLight ? "bg-orange-100 ring-1 ring-orange-200" : "bg-orange-500/25 ring-1 ring-orange-500/30", text: isLight ? "text-orange-900" : "text-orange-100", shadow: "shadow-[0_1px_6px_rgba(249,115,22,.4)]" };
    if (urgency === "low")      return { border: "border-l-[3px] border-slate-400", bg: isLight ? "bg-slate-100 ring-1 ring-slate-200" : "bg-slate-500/20 ring-1 ring-slate-500/20", text: isLight ? "text-slate-600" : "text-slate-300", shadow: "" };
    return { border: "border-l-[3px] border-teal-500", bg: isLight ? "bg-teal-100 ring-1 ring-teal-200" : "bg-teal-500/25 ring-1 ring-teal-500/30", text: isLight ? "text-teal-900" : "text-teal-100", shadow: "shadow-[0_1px_6px_rgba(20,184,166,.35)]" };
  };

  const getEventIcon = (type: string, category?: string) =>
    category === "meeting" ? "🤝" : category === "event" ? "📅" : category === "task" ? "✅" :
    type === "loan" ? "🏛️" : type === "ar" ? "💵" : type === "payroll" ? "⏱️" : type === "google" ? "🗓️" : "";

  // Per-level urgency accent hex — used to theme the Add modal dynamically
  const URGENCY_ACCENT: Record<"critical"|"high"|"normal"|"low", { hex: string; hover: string }> = {
    critical: { hex: "#ef4444", hover: "#dc2626" },
    high:     { hex: "#f97316", hover: "#ea580c" },
    normal:   { hex: "#3b82f6", hover: "#2563eb" },
    low:      { hex: "#22c55e", hover: "#16a34a" },
  };

  // Per-level urgency pill styles — dot color + inactive/active classes
  const URGENCY_PILL: Record<"critical"|"high"|"normal"|"low", { dot: string; active: string; inactive: string }> = {
    critical: { dot: "text-red-500",    active: "bg-red-500    border-red-500    text-white",  inactive: "bg-red-50    dark:bg-red-900/15    border-red-200    dark:border-red-700    text-red-600    dark:text-red-400"    },
    high:     { dot: "text-orange-500", active: "bg-orange-500 border-orange-500 text-white",  inactive: "bg-orange-50 dark:bg-orange-900/15 border-orange-200 dark:border-orange-700 text-orange-600 dark:text-orange-400" },
    normal:   { dot: "text-blue-500",   active: "bg-blue-500   border-blue-500   text-white",  inactive: "bg-blue-50   dark:bg-blue-900/15   border-blue-200   dark:border-blue-700   text-blue-600   dark:text-blue-400"   },
    low:      { dot: "text-green-500",  active: "bg-green-500  border-green-500  text-white",  inactive: "bg-green-50  dark:bg-green-900/15  border-green-200  dark:border-green-700  text-green-600  dark:text-green-400"  },
  };

  const getEventHexColor = (type: string, category?: string, urgency?: string): string => {
    if (type === "loan")    return "#8B5CF6";
    if (type === "ar")      return "#10B981";
    if (type === "payroll") return "#3B82F6";
    if (type === "google" && !category) return "#38BDF8";
    if (urgency === "critical") return "#EF4444";
    if (urgency === "high")     return "#F97316";
    if (urgency === "low")      return "#94A3B8";
    return "#1D6AE5";
  };

  // Edit save handler
  const handleSaveEdit = () => {
    if (!selectedEvent) return;
    const updates = {
      title: editTitle,
      date: editDate,
      time: editTime || undefined,
      description: editDesc || undefined,
      category: editCategory as any,
      urgency: editUrgency,
      assignee: editAssignee || undefined,
    };

    const eventId = selectedEvent.id;

    if (selectedEvent.sheetRow && selectedEvent.sheetRow > 0) {
      // Sheet-backed event — update local state optimistically
      setSheetEvents(prev => prev.map(e =>
        e.id === eventId
          ? { ...e, title: editTitle, date: editDate, time: editTime || undefined, notes: editDesc, urgency: editUrgency, assignee: editAssignee, type: editCategory }
          : e
      ));
      // Persist to portal server (survives GViz cache and page refresh)
      if (eventId) {
        fetch("/api/calendar-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "edit", id: eventId, value: {
            title: editTitle, date: editDate, time: editTime || undefined, notes: editDesc || "", urgency: editUrgency,
            type: editCategory, assignee: editAssignee || ""
          }})
        }).catch(err => console.warn("calendar-action edit failed:", err));
      }
      // Write to Google Sheet, then re-read immediately so state is fresh
      const token = getAccessToken();
      if (token) {
        updateCalendarRow(token, sheetTab, selectedEvent.sheetRow, sheetColMap, {
          title: editTitle, date: editDate, time: editTime || undefined, endTime: selectedEvent.endTime, notes: editDesc || "", urgency: editUrgency,
          type: editCategory, assignee: editAssignee || "",
        }).then(() => loadSheetEvents()).catch((err: Error) => {
          console.warn("Sheet edit write failed:", err.message);
        });
      }
    } else if (eventId && selectedEvent.isLocalTask) {
      // Portal-only local task — persist to server overrides + FinanceContext
      fetch("/api/calendar-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "edit", id: eventId, value: updates })
      }).catch(err => console.warn("calendar-action edit failed:", err));
      updateCalendarEvent(eventId, updates as any);
    }

    setSelectedEvent(prev => prev ? { ...prev, ...updates } : null);
    setIsEditingEvent(false);
  };

  // Source Filters State
  const [showApBillsFilter, setShowApBillsFilter] = useState(true);
  const [showLoansFilter, setShowLoansFilter] = useState(true);
  const [showArFilter, setShowArFilter] = useState(true);
  const [showPayrollFilter, setShowPayrollFilter] = useState(true);
  const [showGoogleCalFilter, setShowGoogleCalFilter] = useState(true);
  const [showTasksFilter, setShowTasksFilter] = useState(true);
  const [showNotesFilter, setShowNotesFilter] = useState(true);

  // Events grouped by date
  const eventsByDate: {
    [dateStr: string]: {
      id?: string;
      label: string;
      type: "ap" | "loan" | "ar" | "payroll" | "task" | "google";
      time?: string;
      endTime?: string;
      isGoogleEvent?: boolean;
      isLocalTask?: boolean;
      urgency?: "critical" | "high" | "normal" | "low";
      description?: string;
      assignee?: string;
      assigneeColor?: string;
      assigneeIds?: string[];
      done?: boolean;
      sheetRow?: number;
      category?: string;
      entity?: string;
    }[];
  } = {};

  // Local Events & Schedules from Calendar Dashboard sheet
  if (showTasksFilter && calendarLocalEvents) {
    calendarLocalEvents.forEach((ev) => {
      if (ev.id && deletedEventIds.has(ev.id)) return; // suppressed this session
      const key = normalizeDateToYYYYMMDD(ev.date);
      if (!key) return;
      const vendorLower = (ev.vendor || "").toLowerCase();
      const descLower = (ev.description || "").toLowerCase();
      // Skip if it's an AP/AR bill or note duplicate logged into calendar sheet
      if (
        vendorLower.includes("bills") ||
        descLower.includes("bills") ||
        vendorLower.includes("cheque") ||
        descLower.includes("cheque") ||
        descLower.includes("prepare $") ||
        vendorLower.startsWith("[ap]") ||
        vendorLower.startsWith("[ar]") ||
        vendorLower.includes("payroll cutoff") ||
        vendorLower.includes("quicknote") ||
        descLower.includes("quicknote") ||
        vendorLower.includes("quick note") ||
        descLower.includes("quick note") ||
        vendorLower.includes("meeting notes") ||
        descLower.includes("meeting notes") ||
        vendorLower.startsWith("note") ||
        descLower.startsWith("note")
      ) {
        return;
      }
      if (!eventsByDate[key]) eventsByDate[key] = [];
      const label = `[${ev.entity || "Ruby's"}] ${ev.vendor || ev.description}`;
      const exists = eventsByDate[key].some((e) => e.id === ev.id || e.label === label);
      if (!exists) {
        eventsByDate[key].push({
          id: ev.id,
          label,
          type: "task",
          time: ev.time,
          endTime: ev.endTime,
          isLocalTask: true,
          entity: ev.entity || "",
          description: ev.description && ev.description !== ev.vendor ? ev.description : "",
          urgency: (ev.urgency || "normal") as "critical" | "high" | "normal" | "low",
          done: doneOverrides[ev.id] ?? ev.done,
          assignee: ev.assignee,
          assigneeColor: ev.assigneeColor,
          assigneeIds: ev.assigneeIds,
          category: (ev.type || "").toLowerCase(),
          sheetRow: (ev as any).row, // row from server = actual sheet row number
        });
      }
    });
  }

  // Loans
  if (showLoansFilter) {
    loans.forEach((l) => {
      const key = normalizeDateToYYYYMMDD(l.nextPay);
      if (!key) return;
      // Skip placeholder/empty lender names and $0 monthly payments
      const lenderName = (l.lender || "").trim();
      if (!lenderName) return;
      if (/^(lender|card|n\/a|placeholder|tbd)$/i.test(lenderName)) return;
      if ((l.monthly || 0) <= 0) return;
      if (!eventsByDate[key]) eventsByDate[key] = [];
      eventsByDate[key].push({
        label: `Loan: ${lenderName} ($${(l.monthly || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })})`,
        type: "loan"
      });
    });
  }

  // AR items are now rendered via arByDate (summary chip per day, like AP bills)

  // Payroll
  if (showPayrollFilter) {
    payrollWeeks.forEach((w) => {
      const key = normalizeDateToYYYYMMDD(w.endDate);
      if (!key) return;
      if (!eventsByDate[key]) eventsByDate[key] = [];
      eventsByDate[key].push({
        label: `Payroll Cutoff: ${w.weekNum}`,
        type: "payroll"
      });
    });
  }

  // Local Tasks
  if (showTasksFilter) {
    localCalendarEvents.forEach((ev) => {
      if (ev.id && deletedEventIds.has(ev.id)) return; // suppressed this session
      const key = normalizeDateToYYYYMMDD(ev.date);
      if (!key) return;
      if (!eventsByDate[key]) eventsByDate[key] = [];
      eventsByDate[key].push({
        id: ev.id,
        label: `${ev.time ? ev.time + " " : ""}${ev.title}`,
        type: "task",
        time: ev.time,
        isLocalTask: true,
        description: ev.description,
        done: ev.done ?? false,
        urgency: (ev.urgency as any) || "normal",
        assignee: ev.assignee,
      });
    });
  }

  // Calendar Sheet Events (meetings, tasks, events) — render on calendar day cells
  if (showTasksFilter) sheetEvents.forEach((ev) => {
    if (deletedEventIds.has(ev.id)) return;
    if (!ev.date) return;
    const key = normalizeDateToYYYYMMDD(ev.date);
    if (!key) return;
    if (!eventsByDate[key]) eventsByDate[key] = [];
    const typeLC = (ev.type || "task").toLowerCase();
    const calType: "task" | "google" = typeLC.includes("meet") ? "google" : "task";
    const category = typeLC.includes("meet") ? "meeting" : typeLC.includes("event") ? "event" : "task";
    const existingIdx = eventsByDate[key].findIndex((e) => e.id === ev.id);
    const evDone = doneOverrides[ev.id] ?? ev.done;
    if (existingIdx !== -1) {
      eventsByDate[key][existingIdx] = {
        ...eventsByDate[key][existingIdx],
        done: evDone,
        sheetRow: ev.sheetRow,
        urgency: (ev.urgency || "normal") as "critical" | "high" | "normal" | "low",
      };
    } else {
      eventsByDate[key].push({
        id: ev.id,
        label: ev.title,
        type: calType,
        time: ev.time,
        endTime: ev.endTime,
        isLocalTask: true,
        description: ev.notes || ev.title,
        urgency: (ev.urgency || "normal") as "critical" | "high" | "normal" | "low",
        assignee: ev.assignee,
        assigneeColor: ev.assigneeColor,
        assigneeIds: ev.assigneeIds,
        done: evDone,
        sheetRow: ev.sheetRow,
        category,
      });
    }
  });

  // Google Calendar Events (actual Google Calendar, not Sheet)
  if (showGoogleCalFilter) {
    googleEvents.forEach((ge) => {
      if (!ge.summary) return;
      const cleanSum = ge.summary.trim();
      const lowerSum = cleanSum.toLowerCase();

      // Filter out invalid/junk titles like n178..., note-, id-, remarks, vendor headers
      if (
        cleanSum.length < 3 ||
        /^n\d+/i.test(cleanSum) ||
        /^note[-_:\s]/i.test(cleanSum) ||
        /^id[-_:\s]/i.test(cleanSum) ||
        /^memo[-_:\s]/i.test(cleanSum) ||
        /^task[-_:\s]/i.test(cleanSum) ||
        /^map[-_]/i.test(cleanSum) ||
        /^cal\s*:/i.test(cleanSum) ||      // bank-calendar junk like "Cal: Ruby's - Zions"
        /^\d+\.?\d*$/.test(cleanSum) ||    // pure numeric amounts like "693.57"
        ["title", "vendor", "event title", "date", "id", "remarks", "amount", "status", "company", "description"].includes(lowerSum)
      ) {
        return;
      }

      const rawDate = ge.start.dateTime ? ge.start.dateTime.split("T")[0] : ge.start.date;
      const key = normalizeDateToYYYYMMDD(rawDate);
      if (!key) return;
      if (!eventsByDate[key]) eventsByDate[key] = [];

      const labelText = cleanSum.startsWith("Cal:") ? cleanSum : `Cal: ${cleanSum}`;
      const exists = eventsByDate[key].some((ev) => ev.label === labelText);
      if (!exists) {
        eventsByDate[key].push({
          label: labelText,
          type: "google",
          isGoogleEvent: true,
          description: ge.description || `Event: ${cleanSum}`
        });
      }
    });
  }

  // Add Note
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle || !taskDate) return;

    setIsSubmitting(true);
    try {
      const fullTitle = taskAssignee.trim()
        ? `[${taskCategory.toUpperCase()}] ${taskTitle} (${taskAssignee.trim()})`
        : `[${taskCategory.toUpperCase()}] ${taskTitle}`;

      const newId = `cal-${Date.now()}`;

      addCalendarEvent({
        title: fullTitle,
        date: taskDate,
        time: taskTime,
        type: "task",
        description: `${taskDesc}\n\nPriority: ${taskUrgency.toUpperCase()}`
      });

      // Optimistic update to sheet events state
      const newSheetRow: CalSheetRow = {
        id: newId,
        date: taskDate,
        title: fullTitle,
        notes: taskDesc,
        entity: "Ruby's",
        type: taskCategory,
        assignee: taskAssignee.trim(),
        urgency: taskUrgency,
        done: false,
        sheetRow: -1, // unknown until appended
      };
      setSheetEvents(prev => [...prev, newSheetRow]);

      // Write to sheet if token is available
      const token = getAccessToken();
      if (token) {
        appendCalendarRow(token, sheetTab, {
          date: taskDate,
          time: taskTime,
          title: fullTitle,
          notes: taskDesc,
          entity: "Ruby's",
          type: taskCategory,
          assignee: taskAssignee.trim(),
          urgency: taskUrgency,
          id: newId,
        }).then(() => {
          // Reload sheet to get accurate row numbers
          loadCalendarSheet(token).then(({ events, tab, colMap }) => {
            setSheetEvents(events);
            setSheetTab(tab);
            setSheetColMap(colMap);
          }).catch(() => {});
        }).catch(err => console.warn("Sheet append failed:", err));
      }

      if (syncToGoogleCal) {
        const token = getAccessToken();
        if (token) {
          const gEv = await createGoogleCalendarEvent(token, {
            summary: fullTitle,
            description: taskDesc,
            date: taskDate,
            time: taskTime
          });
          if (gEv) setGoogleEvents((prev) => [...prev, gEv]);
        }
      }

      setTaskTitle("");
      setTaskAssignee("");
      setTaskDesc("");
      setShowModal(false);
    } catch (err) {
      console.error("Error creating event:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Month grid calculations
  const firstDayOfMonth = new Date(calYear, calMonth, 1);
  const lastDayOfMonth = new Date(calYear, calMonth + 1, 0);
  let startDow = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();
  const prevMonthLastDate = new Date(calYear, calMonth, 0).getDate();
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#070b12] text-[#e8e8e8]"}`}>
      <PageHeader title="Integrated Finance & Schedule Calendar" bgClass="bg-[#0d9488]" sheetUrl="https://docs.google.com/spreadsheets/d/1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo/edit#gid=0" />

      <div className="flex-1 flex overflow-hidden">
        {/* Main Calendar Content Area */}
        <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-3 min-w-0">
          {/* Control Bar */}
          <div className={`flex flex-wrap items-center justify-between gap-3 ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} p-3 rounded-xl border shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
            {/* Prev / Next / Today / Month Label */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Tooltip label="Previous">
                <button
                  onClick={handlePrev}
                  className={`p-1.5 rounded-lg border ${isLight ? "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700" : "bg-[#0d111a] hover:bg-[#222] border-[#1a2235] text-white"}`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                </Tooltip>
                <button
                  onClick={handleToday}
                  className="px-3 py-1 rounded-lg bg-[#0d9488] hover:bg-[#0f766e] text-xs font-bold text-white shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
                >
                  Today
                </button>
                <Tooltip label="Next">
                <button
                  onClick={handleNext}
                  className={`p-1.5 rounded-lg border ${isLight ? "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700" : "bg-[#0d111a] hover:bg-[#222] border-[#1a2235] text-white"}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                </Tooltip>
              </div>

              <h2 className={`text-base font-extrabold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>
                {calendarView === "week" ? (() => {
                  const d = new Date(currentDate);
                  const dow = d.getDay();
                  const sun = new Date(d);
                  sun.setDate(d.getDate() - dow);
                  const sat = new Date(sun);
                  sat.setDate(sun.getDate() + 6);
                  const sunM = monthNames[sun.getMonth()].slice(0, 3);
                  const satM = monthNames[sat.getMonth()].slice(0, 3);
                  if (sun.getMonth() === sat.getMonth()) {
                    return `${sunM} ${sun.getDate()} – ${sat.getDate()}, ${sun.getFullYear()}`;
                  }
                  return `${sunM} ${sun.getDate()} – ${satM} ${sat.getDate()}, ${sat.getFullYear()}`;
                })() : `${monthNames[calMonth]} ${calYear}`}
              </h2>
            </div>

            {/* View Mode & Actions */}
            <div className="flex items-center gap-2">
              <div className={`p-0.5 rounded-lg border flex items-center gap-0.5 ${isLight ? "bg-slate-100 border-slate-200" : "bg-[#0d111a] border-[#282828]"}`}>
                <button
                  onClick={() => setCalendarView("week")}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    calendarView === "week"
                      ? "bg-[#0d9488] text-white shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
                      : isLight ? "text-slate-600 hover:text-slate-900" : "text-[#aaa] hover:text-white"
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setCalendarView("month")}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    calendarView === "month"
                      ? "bg-[#0d9488] text-white shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]"
                      : isLight ? "text-slate-600 hover:text-slate-900" : "text-[#aaa] hover:text-white"
                  }`}
                >
                  Month
                </button>
              </div>

              {!googleUser || !hasGoogleToken ? (
                <button
                  onClick={handleGoogleSignIn}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  {googleUser && !hasGoogleToken ? "Token expired — Reconnect" : "Connect Google"}
                </button>
              ) : (
                <span className={`text-[11px] ${isLight ? "text-slate-600" : "text-[#888]"} flex items-center gap-1 font-semibold`}>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  {loadingGoogleCal ? "Loading..." : googleUser.email.split("@")[0]}
                </span>
              )}

              <button
                onClick={() => setShowModal(true)}
                className="px-3.5 py-1.5 rounded-lg bg-[#10b981] hover:bg-[#059669] text-white text-xs font-bold flex items-center gap-1.5 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Event / Task
              </button>
            </div>
          </div>

          {/* Legends Bar: Urgency, Categories, Assignees */}
          <div className={`p-3 rounded-xl border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} grid grid-cols-1 md:grid-cols-3 gap-3 text-xs`}>
            {/* Urgency */}
            <div className="space-y-1">
              <span className={`text-[10px] font-extrabold uppercase tracking-wider ${isLight ? "text-slate-500" : "text-[#888]"}`}>Urgency Level</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">🔴 Critical</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">🟠 High</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">🔵 Normal</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">🟢 Low</span>
              </div>
            </div>

            {/* Categories */}
            <div className="space-y-1">
              <span className={`text-[10px] font-extrabold uppercase tracking-wider ${isLight ? "text-slate-500" : "text-[#888]"}`}>Category</span>
              <div className="flex flex-wrap items-center gap-2 font-bold">
                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">📅 Event</span>
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">✅ Task</span>
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">🤝 Meeting</span>
              </div>
            </div>

            {/* Assignees */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${isLight ? "text-slate-500" : "text-[#888]"}`}>Team Assignees</span>
                <button
                  onClick={() => setShowAssigneeModal(true)}
                  className="text-[11px] font-bold text-[#0d9488] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" /> Manage
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {assignees.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 font-bold">
                    <span className="w-4 h-4 rounded-full text-[9px] text-white flex items-center justify-center font-black shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]" style={{ backgroundColor: a.color }}>
                      {a.name.charAt(0)}
                    </span>
                    <span className="text-[11px]">{a.name}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Calendar Source Filters */}
          <div className={`p-3 rounded-xl border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} flex flex-wrap items-center justify-between gap-2 text-xs`}>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-[#0d9488]" />
              <span className={`text-[10px] font-extrabold uppercase tracking-wider ${isLight ? "text-slate-500" : "text-[#888]"}`}>Visible Sources:</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 font-bold text-[11px]">
              <button
                onClick={() => setShowApBillsFilter(!showApBillsFilter)}
                className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                  showApBillsFilter
                    ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 font-extrabold"
                    : isLight ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-[#0d111a] text-[#4a5568] border-[#1a2235]"
                }`}
              >
                📋 AP Bills
              </button>
              <button
                onClick={() => setShowLoansFilter(!showLoansFilter)}
                className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                  showLoansFilter
                    ? "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400 font-extrabold"
                    : isLight ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-[#0d111a] text-[#4a5568] border-[#1a2235]"
                }`}
              >
                🏛️ Loans
              </button>
              <button
                onClick={() => setShowArFilter(!showArFilter)}
                className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                  showArFilter
                    ? "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 font-extrabold"
                    : isLight ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-[#0d111a] text-[#4a5568] border-[#1a2235]"
                }`}
              >
                💵 AR Invoices
              </button>
              <button
                onClick={() => setShowPayrollFilter(!showPayrollFilter)}
                className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                  showPayrollFilter
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 font-extrabold"
                    : isLight ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-[#0d111a] text-[#4a5568] border-[#1a2235]"
                }`}
              >
                ⏱️ Payroll
              </button>
              <button
                onClick={() => setShowGoogleCalFilter(!showGoogleCalFilter)}
                className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                  showGoogleCalFilter
                    ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 font-extrabold"
                    : isLight ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-[#0d111a] text-[#4a5568] border-[#1a2235]"
                }`}
              >
                🗓️ Google Events
              </button>
              <button
                onClick={() => setShowTasksFilter(!showTasksFilter)}
                className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                  showTasksFilter
                    ? "bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400 font-extrabold"
                    : isLight ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-[#0d111a] text-[#4a5568] border-[#1a2235]"
                }`}
              >
                ✅ Local Tasks
              </button>
            </div>
          </div>

          {/* Calendar Main Grid */}
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} border rounded-xl p-2 sm:p-4 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)]`}>
            {/* Day Headers */}
            <div className={`border ${isLight ? "border-slate-200" : "border-[#1a2235]"} rounded-lg overflow-hidden overflow-x-auto`}>
              <div className={`grid grid-cols-7 ${isLight ? "bg-slate-100 border-slate-200 text-slate-700" : "bg-[#0d111a] border-[#222] text-slate-300"} border-b text-center text-xs font-bold py-2`}>
                <div>SUN</div>
                <div>MON</div>
                <div>TUE</div>
                <div>WED</div>
                <div>THU</div>
                <div>FRI</div>
                <div>SAT</div>
              </div>

              <div className={`grid grid-cols-7 divide-x divide-y ${isLight ? "divide-slate-200 bg-white" : "divide-[#222] bg-[#0d111a]"}`}>
                {calendarView === "week" ? (
                  /* WEEK VIEW (7 Days) */
                  (() => {
                    const d = new Date(currentDate);
                    const dow = d.getDay();
                    const sun = new Date(d);
                    sun.setDate(d.getDate() - dow);

                    const weekDays: Date[] = [];
                    for (let i = 0; i < 7; i++) {
                      const next = new Date(sun);
                      next.setDate(sun.getDate() + i);
                      weekDays.push(next);
                    }

                    const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

                    return weekDays.map((dateObj, i) => {
                      const y = dateObj.getFullYear();
                      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
                      const dayNum = dateObj.getDate();
                      const dayStr = String(dayNum).padStart(2, "0");
                      const dateKey = `${y}-${m}-${dayStr}`;
                      const isToday = dateKey === todayStr;
                      const dayEvents = eventsByDate[dateKey] || [];
                      const dayApBills = apBillsByDate[dateKey] || [];

                      const apColor = dayApBills.length > 0 ? getApDueDateColor(dateKey, dayApBills) : null;
                      const totalApAmt = dayApBills.reduce((sum, b) => sum + b.amount, 0);

                      return (
                        <div
                          key={`week-day-${i}`}
                          className={`min-h-[380px] p-2 text-xs transition-colors group relative ${
                            isToday ? "bg-[#0d9488]/10 border border-[#0d9488]" : isLight ? "hover:bg-slate-50" : "hover:bg-white/5"
                          }`}
                        >
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-[#222]">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[11px] font-bold ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                                {dayNames[i]}
                              </span>
                              <span
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold ${
                                  isToday ? "bg-[#0d9488] text-white" : isLight ? "bg-slate-200 text-slate-800" : "bg-[#222] text-white"
                                }`}
                              >
                                {dayNum}
                              </span>
                            </div>
                            <Tooltip label="Add event on this date">
                            <button
                              onClick={() => {
                                setTaskDate(dateKey);
                                setShowModal(true);
                              }}
                              className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/30 transition-colors"
                            >
                              + Add
                            </button>
                            </Tooltip>
                          </div>

                          <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-0.5">
                            {/* AP Bills Summary Pill */}
                            {showApBillsFilter && dayApBills.length > 0 && apColor && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEvent({
                                    title: `AP Bills Due (${dayApBills.length})`,
                                    type: "AP BILLS",
                                    date: dateKey,
                                    amount: totalApAmt,
                                    billsList: dayApBills,
                                    description: dayApBills
                                      .map((b) => `${b.company || "AP"} · ${b.vendor} · $${b.amount.toFixed(2)} [${b.status || "Unpaid"}]`)
                                      .join("\n")
                                  });
                                }}
                                title={dayApBills
                                  .map((b) => `${b.company || "AP"}: ${b.vendor} ($${b.amount.toFixed(2)})`)
                                  .join("\n")}
                                className={`text-[11px] px-2 py-1 rounded-md font-bold ${apColor.bg} ${apColor.text} shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] cursor-pointer transition-opacity hover:opacity-90 flex flex-col gap-0.5 border border-amber-300/30`}
                              >
                                <div className="flex items-center justify-between">
                                  <span>📋 AP Bills ({dayApBills.length})</span>
                                  <span>${totalApAmt.toLocaleString("en-US", { minimumFractionDigits: 0 })}</span>
                                </div>
                                <div className="text-[10px] opacity-90 font-medium truncate">
                                  {dayApBills.map((b) => b.vendor).slice(0, 2).join(", ")}
                                  {dayApBills.length > 2 ? "..." : ""}
                                </div>
                              </div>
                            )}

                            {/* AR Summary Pill */}
                            {showArFilter && (arByDate[dateKey] || []).length > 0 && (() => {
                              const dayArItems = arByDate[dateKey] || [];
                              const totalArAmt = dayArItems.reduce((sum, a) => sum + a.amount, 0);
                              return (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEvent({
                                      title: `AR Due (${dayArItems.length})`,
                                      type: "AR",
                                      date: dateKey,
                                      amount: totalArAmt,
                                      arList: dayArItems,
                                      description: dayArItems
                                        .map((a) => `${a.customer}${a.amount > 0 ? ` · $${a.amount.toFixed(2)}` : ""} [Open]`)
                                        .join("\n")
                                    });
                                  }}
                                  title={dayArItems.map((a) => `${a.customer}${a.amount > 0 ? ` ($${a.amount.toFixed(2)})` : ""}`).join("\n")}
                                  className="text-[11px] px-2 py-1 rounded-md font-bold bg-orange-500/20 text-orange-700 dark:text-orange-300 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] cursor-pointer transition-opacity hover:opacity-90 flex flex-col gap-0.5 border border-orange-400/30"
                                >
                                  <div className="flex items-center justify-between">
                                    <span>🧾 AR ({dayArItems.length})</span>
                                    {totalArAmt > 0 && <span>${totalArAmt.toLocaleString("en-US", { minimumFractionDigits: 0 })}</span>}
                                  </div>
                                  <div className="text-[10px] opacity-90 font-medium truncate">
                                    {dayArItems.map((a) => a.customer).slice(0, 2).join(", ")}
                                    {dayArItems.length > 2 ? "..." : ""}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Other Events */}
                            {dayEvents.map((ev, idx) => {
                              const style = getChipStyle(ev.type, ev.category, ev.urgency);
                              const icon = getEventIcon(ev.type, ev.category);
                              return (
                              <div
                                key={idx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const sel = {
                                    title: ev.label,
                                    type: ev.type,
                                    date: dateKey,
                                    time: ev.time,
                                    endTime: ev.endTime,
                                    description: ev.description || "",
                                    id: ev.id,
                                    isLocalTask: ev.isLocalTask,
                                    urgency: ev.urgency,
                                    assignee: ev.assignee,
                                    assigneeColor: ev.assigneeColor,
                                    assigneeIds: ev.assigneeIds,
                                    done: ev.done,
                                    sheetRow: ev.sheetRow,
                                    category: ev.category,
                                    entity: (ev as any).entity || "",
                                  };
                                  setSelectedEvent(sel);
                                  setEditTitle(sel.title.replace(/^\[[^\]]+\]\s*/, ""));
                                  setEditDate(sel.date);
                                  setEditTime(sel.time || "");
                                  setEditCategory((sel.category as any) || "task");
                                  setEditUrgency((sel.urgency as any) || "normal");
                                  setEditAssignee(sel.assignee || "");
                                  setEditDesc(sel.description || "");
                                  setIsEditingEvent(false);
                                }}
                                title={`${ev.label.replace(/^\[[^\]]+\]\s*/, "")} — Click to view`}
                                className={`text-[10px] px-1.5 py-[3px] rounded-md cursor-pointer hover:brightness-110 transition-all flex items-center gap-1 ${style.bg} ${style.border} ${style.shadow} ${ev.done ? "opacity-50" : ""} group/chip overflow-hidden`}
                              >
                                {/* Assignee color bars (like GAS pill-color-bars) */}
                                {(() => {
                                  const bars = getEventColorBars(ev);
                                  return bars.length > 0 ? (
                                    <span className="flex gap-[2px] shrink-0 self-stretch items-stretch py-[1px]">
                                      {bars.map((c, bi) => (
                                        <span key={bi} className="rounded-[1px]" style={{ background: c, width: 3, display: "block" }} />
                                      ))}
                                    </span>
                                  ) : null;
                                })()}
                                {icon && <span className="shrink-0 text-[10px] leading-none">{icon}</span>}
                                {ev.time && <span className={`font-mono text-[8px] shrink-0 font-bold ${style.text} opacity-70`}>{to12h(ev.time)}</span>}
                                <span className={`truncate font-semibold ${style.text} ${ev.done ? "line-through" : ""} leading-tight`}>
                                  {ev.label.replace(/^\[[^\]]+\]\s*/, "")}
                                </span>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()
                ) : (
                  <>
                    {/* Padding Previous Month */}
                {Array.from({ length: startDow }).map((_, i) => (
                  <div key={`prev-${i}`} className={`min-h-[100px] p-1.5 text-xs ${isLight ? "text-slate-300 bg-slate-50/60" : "text-[#2d3748] bg-[#060a10]"}`}>
                    {prevMonthLastDate - startDow + i + 1}
                  </div>
                ))}

                {/* Days in Month */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const monthStr = String(calMonth + 1).padStart(2, "0");
                  const dayStr = String(dayNum).padStart(2, "0");
                  const dateKey = `${calYear}-${monthStr}-${dayStr}`;
                  const isToday = dateKey === todayStr;
                  const dayEvents = eventsByDate[dateKey] || [];
                  const dayApBills = apBillsByDate[dateKey] || [];

                  const apColor = dayApBills.length > 0 ? getApDueDateColor(dateKey, dayApBills) : null;
                  const totalApAmt = dayApBills.reduce((sum, b) => sum + b.amount, 0);

                  return (
                    <div
                      key={`day-${dayNum}`}
                      className={`min-h-[100px] p-1.5 text-xs transition-colors group relative ${
                        isToday ? "bg-[#0d9488]/10 border border-[#0d9488]" : isLight ? "hover:bg-slate-50" : "hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-extrabold ${
                            isToday ? "bg-[#0d9488] text-white" : isLight ? "text-slate-700" : "text-[#aaa]"
                          }`}
                        >
                          {dayNum}
                        </span>
                        <Tooltip label="Add event on this date">
                        <button
                          onClick={() => {
                            setTaskDate(dateKey);
                            setShowModal(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-[#10b981] hover:underline font-bold"
                        >
                          + Add
                        </button>
                        </Tooltip>
                      </div>

                      <div className="space-y-1 max-h-[140px] overflow-y-auto">
                        {/* AP Bills Summary Pill */}
                        {showApBillsFilter && dayApBills.length > 0 && apColor && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent({
                                title: `AP Bills Due (${dayApBills.length})`,
                                type: "AP BILLS",
                                date: dateKey,
                                amount: totalApAmt,
                                billsList: dayApBills,
                                description: dayApBills
                                  .map((b) => `${b.company || "AP"} · ${b.vendor} · $${b.amount.toFixed(2)} [${b.status || "Unpaid"}]`)
                                  .join("\n")
                              });
                            }}
                            title={dayApBills
                              .map((b) => `${b.company || "AP"}: ${b.vendor} ($${b.amount.toFixed(2)})`)
                              .join("\n")}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${apColor.bg} ${apColor.text} shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] cursor-pointer truncate transition-opacity hover:opacity-90 flex items-center gap-1`}
                          >
                            <span>📋</span>
                            <span className="truncate">
                              {dayApBills.length === 1
                                ? `[${dayApBills[0].company || "AP"}] ${dayApBills[0].vendor} $${totalApAmt.toLocaleString("en-US", { minimumFractionDigits: 0 })}`
                                : `${dayApBills.length} bills due: $${totalApAmt.toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
                            </span>
                          </div>
                        )}

                        {/* AR Summary Pill */}
                        {showArFilter && (arByDate[dateKey] || []).length > 0 && (() => {
                          const dayArItems = arByDate[dateKey] || [];
                          const totalArAmt = dayArItems.reduce((sum, a) => sum + a.amount, 0);
                          return (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent({
                                  title: `AR Due (${dayArItems.length})`,
                                  type: "AR",
                                  date: dateKey,
                                  amount: totalArAmt,
                                  arList: dayArItems,
                                  description: dayArItems
                                    .map((a) => `${a.customer}${a.amount > 0 ? ` · $${a.amount.toFixed(2)}` : ""} [Open]`)
                                    .join("\n")
                                });
                              }}
                              title={dayArItems.map((a) => `${a.customer}${a.amount > 0 ? ` ($${a.amount.toFixed(2)})` : ""}`).join("\n")}
                              className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-orange-500/20 text-orange-700 dark:text-orange-300 shadow-[0_2px_12px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] cursor-pointer truncate transition-opacity hover:opacity-90 flex items-center gap-1"
                            >
                              <span>🧾</span>
                              <span className="truncate">
                                {dayArItems.length === 1
                                  ? `${dayArItems[0].customer}${totalArAmt > 0 ? ` $${totalArAmt.toLocaleString("en-US", { minimumFractionDigits: 0 })}` : ""}`
                                  : `${dayArItems.length} AR due${totalArAmt > 0 ? `: $${totalArAmt.toLocaleString("en-US", { minimumFractionDigits: 0 })}` : ""}`}
                              </span>
                            </div>
                          );
                        })()}

                        {/* Other Events */}
                        {dayEvents.map((ev, idx) => {
                          const style = getChipStyle(ev.type, ev.category, ev.urgency);
                          const icon = getEventIcon(ev.type, ev.category);
                          return (
                          <div
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              const sel = {
                                title: ev.label,
                                type: ev.type,
                                date: dateKey,
                                time: ev.time,
                                endTime: ev.endTime,
                                description: ev.description || "",
                                id: ev.id,
                                isLocalTask: ev.isLocalTask,
                                urgency: ev.urgency,
                                assignee: ev.assignee,
                                assigneeColor: ev.assigneeColor,
                                assigneeIds: ev.assigneeIds,
                                done: ev.done,
                                sheetRow: ev.sheetRow,
                                category: ev.category,
                                entity: (ev as any).entity || "",
                              };
                              setSelectedEvent(sel);
                              setEditTitle(sel.title.replace(/^\[[^\]]+\]\s*/, ""));
                              setEditDate(sel.date);
                              setEditTime(sel.time || "");
                              setEditCategory((sel.category as any) || "task");
                              setEditUrgency((sel.urgency as any) || "normal");
                              setEditAssignee(sel.assignee || "");
                              setEditDesc(sel.description || "");
                              setIsEditingEvent(false);
                            }}
                            title={`${ev.label.replace(/^\[[^\]]+\]\s*/, "")} — Click to view`}
                            className={`text-[10px] px-1.5 py-[3px] rounded cursor-pointer hover:brightness-95 transition-all flex items-center gap-1 ${style.bg} ${ev.done ? "opacity-50" : ""} overflow-hidden group/chip border ${isLight ? "border-slate-200/60" : "border-white/5"}`}
                          >
                            {/* Assignee color bars (like GAS pill-color-bars) */}
                            {(() => {
                              const bars = getEventColorBars(ev);
                              return bars.length > 0 ? (
                                <span className="flex gap-[2px] shrink-0 self-stretch items-stretch py-[1px]">
                                  {bars.map((c, bi) => (
                                    <span key={bi} className="rounded-[1px]" style={{ background: c, width: 3, display: "block" }} />
                                  ))}
                                </span>
                              ) : null;
                            })()}
                            {icon && <span className="shrink-0 text-[10px] leading-none">{icon}</span>}
                            {ev.time && <span className={`font-mono shrink-0 text-[8px] ${isLight ? "text-slate-400" : "text-slate-500"}`}>{to12h(ev.time)}</span>}
                            <span className={`truncate font-medium ${style.text} ${ev.done ? "line-through" : ""} leading-tight`}>
                              {ev.label.replace(/^\[[^\]]+\]\s*/, "")}
                            </span>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
            </div>
          </div>

        </div>

      </div>

      {/* Selected Event Details Modal */}
      {selectedEvent && !selectedEvent.billsList && !selectedEvent.arList && (() => {
        const displayTitle = selectedEvent.title.replace(/^\[[^\]]+\]\s*/, "");
        const entityMatch = selectedEvent.title.match(/^\[([^\]]+)\]/);
        // sourceLabel: prefer explicit entity field; for Google events always show "GOOGLE CALENDAR";
        // never show the bracket-prefix extraction as a source label (it's already stripped from displayTitle)
        const sourceLabel = selectedEvent.type === "google" || selectedEvent.isGoogleEvent
          ? "GOOGLE CALENDAR"
          : selectedEvent.entity
            ? selectedEvent.entity.toUpperCase()
            : selectedEvent.category?.toUpperCase() || selectedEvent.type?.toUpperCase() || "CALENDAR EVENT";
        const typeLabel = selectedEvent.category
          ? selectedEvent.category.charAt(0).toUpperCase() + selectedEvent.category.slice(1)
          : selectedEvent.type === "task" ? "Task"
          : selectedEvent.type === "google" ? "Calendar Event"
          : selectedEvent.type === "loan" ? "Loan" : selectedEvent.type === "ar" ? "AR" : selectedEvent.type === "payroll" ? "Payroll" : "";
        const typeIcon = selectedEvent.category === "meeting" ? "🤝" : selectedEvent.category === "task" || selectedEvent.type === "task" ? "✅" : selectedEvent.category === "event" ? "📅" : selectedEvent.type === "google" ? "🗓️" : "";
        // Use urgency-level accent color for theming the modal (when event has urgency)
        const urgencyKey = (selectedEvent.urgency || "normal") as "critical"|"high"|"normal"|"low";
        const evColor = (selectedEvent.urgency && URGENCY_ACCENT[urgencyKey])
          ? URGENCY_ACCENT[urgencyKey].hex
          : getEventHexColor(selectedEvent.type, selectedEvent.category, selectedEvent.urgency);
        return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div
            className={`${isLight ? "bg-white text-slate-900" : "bg-[#20242E] text-white"} rounded-2xl w-full overflow-hidden max-w-[440px] mx-auto my-auto transition-all duration-300`}
            style={{ border: `1px solid ${evColor}40`, boxShadow: `0 0 0 1px ${evColor}18, 0 24px 64px rgba(0,0,0,.35)` }}
          >
            {/* Top accent bar — urgency color */}
            <div className="h-1.5 w-full transition-colors duration-300" style={{ background: evColor }} />

            {/* Header */}
            <div className="px-5 pt-4 pb-3 relative">
              {/* Close */}
              <button
                onClick={() => { setSelectedEvent(null); setIsEditingEvent(false); setShowUrgencyPicker(false); }}
                className={`absolute top-3.5 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-base transition-colors ${isLight ? "text-slate-400 hover:bg-slate-100 hover:text-slate-600" : "text-slate-500 hover:bg-white/10 hover:text-slate-300"}`}>
                ×
              </button>
              {/* Source label */}
              <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 opacity-70" style={{ color: evColor }}>
                {sourceLabel}
              </div>
              {/* Title */}
              {isEditingEvent ? (
                <div>
                  <label className={`block text-[11px] font-bold mb-1 ${isLight ? "text-slate-500" : "text-slate-400"}`}>Title</label>
                  <input
                    className={`w-full rounded-lg px-3 py-1.5 border text-[13px] transition-colors focus:outline-none ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"}`}
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onFocus={e => { e.target.style.borderColor = URGENCY_ACCENT[editUrgency].hex; }}
                    onBlur={e => { e.target.style.borderColor = ""; }}
                    autoFocus
                  />
                </div>
              ) : (
                <h3 className={`text-[17px] font-bold leading-snug pr-7 ${selectedEvent.done ? "line-through opacity-50" : ""}`}>
                  {displayTitle}
                </h3>
              )}
            </div>

            {/* Divider */}
            <div className={`mx-5 border-t ${isLight ? "border-slate-100" : "border-white/8"}`} />

            {/* Body rows */}
            <div className="px-5 pt-4 pb-4 flex flex-col gap-3">
              {!isEditingEvent ? (
                <div className={`flex flex-col gap-2.5 text-[13px] ${isLight ? "text-slate-600" : "text-slate-300"}`}>
                  {/* Date / time */}
                  <div className="flex gap-2.5 items-center">
                    <span className="w-[18px] text-center shrink-0 opacity-50">🕐</span>
                    <span>
                      {new Date(selectedEvent.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })}
                      {selectedEvent.time && (
                        <span className="ml-1.5 font-mono font-semibold text-[12px]">
                          {to12h(selectedEvent.time)}
                          {selectedEvent.endTime && ` – ${to12h(selectedEvent.endTime)}`}
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Type */}
                  {typeLabel && (
                    <div className="flex gap-2.5 items-center">
                      <span className="w-[18px] text-center shrink-0 opacity-50">{typeIcon || "📅"}</span>
                      <span>{typeLabel}</span>
                    </div>
                  )}
                  {/* Urgency — colored pill */}
                  {selectedEvent.urgency && (
                    <div className="flex gap-2.5 items-center">
                      <span className="w-[18px] text-center shrink-0 opacity-50">⚡</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold capitalize border ${URGENCY_PILL[urgencyKey].inactive}`}>
                        <span className={`text-[8px] mr-1 ${URGENCY_PILL[urgencyKey].dot}`}>●</span>
                        {urgencyKey.charAt(0).toUpperCase() + urgencyKey.slice(1)}
                      </span>
                    </div>
                  )}
                  {/* Assignee */}
                  {selectedEvent.assignee && (
                    <div className="flex gap-2.5 items-center">
                      <span className="w-[18px] text-center shrink-0 opacity-50">👤</span>
                      <span>{selectedEvent.assignee}</span>
                    </div>
                  )}
                  {/* Description */}
                  {selectedEvent.description && (
                    <div className="flex gap-2.5 items-start min-w-0 mt-0.5">
                      <span className="w-[18px] text-center shrink-0 opacity-50 mt-px">📝</span>
                      <span className={`text-[12.5px] leading-relaxed whitespace-pre-wrap break-all overflow-hidden min-w-0 ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                        {selectedEvent.description}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* Edit form */
                <EditFormBody
                  editDate={editDate} setEditDate={setEditDate}
                  editTime={editTime} setEditTime={setEditTime}
                  editCategory={editCategory} setEditCategory={setEditCategory}
                  editUrgency={editUrgency} setEditUrgency={setEditUrgency}
                  editAssignee={editAssignee} setEditAssignee={setEditAssignee}
                  editDesc={editDesc} setEditDesc={setEditDesc}
                  assignees={assignees}
                  isLight={isLight}
                  accentHex={URGENCY_ACCENT[editUrgency].hex}
                  urgencyPill={URGENCY_PILL}
                />
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap px-5 pb-[18px]">
                {isEditingEvent ? (
                  <>
                    <button onClick={handleSaveEdit}
                      className="px-[14px] py-[7px] rounded-lg text-white text-xs font-bold flex items-center gap-1.5 transition-all hover:brightness-110"
                      style={{ background: URGENCY_ACCENT[editUrgency].hex }}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Save Changes
                    </button>
                    <button onClick={() => setIsEditingEvent(false)}
                      className={`px-[14px] py-[7px] rounded-lg text-xs font-bold border transition-colors ${isLight ? "border-slate-200 text-slate-500 bg-white hover:bg-slate-50" : "border-[#2E3340] text-slate-400 bg-[#20242E] hover:bg-white/5"}`}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {!selectedEvent.billsList && selectedEvent.isLocalTask && (
                      <button
                        onClick={() => {
                          const newDone = !selectedEvent.done;
                          const eventId = selectedEvent.id;
                          if (!eventId) return;
                          // Optimistic UI update
                          setSheetEvents(prev => prev.map(e => e.id === eventId ? { ...e, done: newDone } : e));
                          setDoneOverrides(prev => ({ ...prev, [eventId]: newDone }));
                          setSelectedEvent(prev => prev ? { ...prev, done: newDone } : null);
                          // Persist to portal server (survives GViz cache and page refresh)
                          fetch("/api/calendar-action", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ type: "done", id: eventId, value: newDone })
                          }).catch(err => console.warn("calendar-action done failed:", err));
                          // Write to Google Sheet — use sheetRow from selectedEvent or fall back
                          // to sheetEvents (covers the case where event was clicked before sheet loaded)
                          const token = getAccessToken();
                          const resolvedSheetRow = (selectedEvent.sheetRow && selectedEvent.sheetRow > 0)
                            ? selectedEvent.sheetRow
                            : sheetEvents.find(e => e.id === eventId)?.sheetRow;
                          if (token && resolvedSheetRow && resolvedSheetRow > 0) {
                            updateCalendarDone(token, sheetTab, resolvedSheetRow, sheetColMap.done, newDone)
                              .then(() => loadSheetEvents())
                              .catch(err => console.warn("Sheet done write failed:", err));
                          } else {
                            // No sheet row — update via context (portal-created events)
                            updateCalendarEvent(eventId, { done: newDone } as any);
                          }
                        }}
                        className={`px-[14px] py-[7px] rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all ${
                          selectedEvent.done
                            ? `${isLight ? "border-slate-200 text-slate-500 bg-white hover:bg-slate-50" : "border-[#2E3340] text-slate-400 bg-[#20242E] hover:bg-white/5"}`
                            : "border-[#BBF0CA] text-[#1A7F3C] bg-[#F2FDF4] hover:brightness-95"
                        }`}>
                        {selectedEvent.done ? "↩ Undo Done" : "✅ Mark Done"}
                      </button>
                    )}
                    {!selectedEvent.billsList && selectedEvent.isLocalTask && (
                      <div className="relative">
                        <button
                          onClick={() => setShowUrgencyPicker(v => !v)}
                          className={`px-[14px] py-[7px] rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all ${isLight ? "border-slate-200 text-slate-700 bg-white hover:bg-slate-50" : "border-[#2E3340] text-slate-300 bg-[#20242E] hover:bg-white/5"}`}>
                          ⚡ Urgency
                        </button>
                        {showUrgencyPicker && (
                          <div className={`absolute bottom-full mb-1 left-0 rounded-xl shadow-xl border p-2 z-10 grid grid-cols-2 gap-1.5 w-40 ${isLight ? "bg-white border-slate-200" : "bg-[#20242E] border-[#2E3340]"}`}>
                            {(["critical","high","normal","low"] as const).map(u => {
                              const p = URGENCY_PILL[u];
                              const isSel = selectedEvent.urgency === u;
                              return (
                                <button key={u} onClick={() => {
                                  const eventId = selectedEvent.id;
                                  setSelectedEvent(prev => prev ? { ...prev, urgency: u } : null);
                                  if (eventId) {
                                    fetch("/api/calendar-action", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ type: "edit", id: eventId, value: { urgency: u } })
                                    }).catch(err => console.warn("calendar-action urgency failed:", err));
                                    const token = getAccessToken();
                                    const sheetRow = (selectedEvent.sheetRow && selectedEvent.sheetRow > 0)
                                      ? selectedEvent.sheetRow
                                      : sheetEvents.find(e => e.id === eventId)?.sheetRow;
                                    if (token && sheetRow && sheetRow > 0) {
                                      updateCalendarRow(token, sheetTab, sheetRow, sheetColMap, { urgency: u })
                                        .then(() => loadSheetEvents())
                                        .catch(err => console.warn("Sheet urgency write failed:", err));
                                    }
                                    updateCalendarEvent(eventId, { urgency: u } as any);
                                  }
                                  setShowUrgencyPicker(false);
                                }}
                                className={`py-1 rounded-full border text-[10px] font-extrabold capitalize transition-all flex items-center justify-center gap-1 ${isSel ? p.active : p.inactive}`}>
                                  <span className={`text-[7px] leading-none ${isSel ? "text-white" : p.dot}`}>●</span>
                                  {u.charAt(0).toUpperCase() + u.slice(1)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {!selectedEvent.billsList && selectedEvent.isLocalTask && (
                      <button onClick={() => setIsEditingEvent(true)}
                        className={`px-[14px] py-[7px] rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all ${isLight ? "border-slate-200 text-slate-700 bg-white hover:bg-slate-50" : "border-[#2E3340] text-slate-300 bg-[#20242E] hover:bg-white/5"}`}>
                        ✏️ Edit
                      </button>
                    )}
                    {!selectedEvent.billsList && selectedEvent.isLocalTask && (
                      <button
                        onClick={() => setConfirmDeleteId(selectedEvent.id || "__pending__")}
                        className="px-[14px] py-[7px] rounded-lg text-xs font-bold flex items-center gap-1.5 border border-[#FFC9C9] text-[#D92D20] bg-[#FFF0F0] hover:brightness-95 transition-all ml-auto">
                        🗑 Delete
                      </button>
                    )}
                  </>
                )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* AP Bills Detail Modal (separate, read-only) */}
      {selectedEvent?.billsList && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`${isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#141414] border-[#333] text-white"} border rounded-2xl max-w-md w-full shadow-2xl overflow-hidden`}>
            <div className="h-1.5 w-full bg-[#1a73e8]" />
            <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{selectedEvent.title}</h3>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={`flex items-center gap-2 text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              <Clock className="w-3.5 h-3.5" />
              <span>{selectedEvent.date}</span>
              {selectedEvent.amount !== undefined && (
                <span className="ml-auto font-bold text-emerald-500">${selectedEvent.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              )}
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {selectedEvent.billsList.map((b, idx) => (
                <div key={idx} className={`p-2 rounded-lg border flex items-center justify-between text-xs ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#1c1c1c] border-[#2c2c2c]"}`}>
                  <div>
                    <span className="font-bold text-[#0d9488]">[{b.company || "AP"}]</span> <span className="font-semibold">{b.vendor}</span>
                  </div>
                  <span className="font-bold text-emerald-500">${b.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setSelectedEvent(null)} className={`px-4 py-1.5 rounded text-xs font-semibold ${isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800" : "bg-[#262626] hover:bg-[#333] text-white"}`}>
                Close
              </button>
            </div>
            </div>{/* end p-5 */}
          </div>
        </div>
      )}

      {/* AR Detail Modal (separate, read-only) */}
      {selectedEvent?.arList && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`${isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#141414] border-[#333] text-white"} border rounded-2xl max-w-md w-full shadow-2xl overflow-hidden`}>
            <div className="h-1.5 w-full bg-orange-500" />
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">{selectedEvent.title}</h3>
                <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-slate-700 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className={`flex items-center gap-2 text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                <Clock className="w-3.5 h-3.5" />
                <span>{selectedEvent.date}</span>
                {selectedEvent.amount !== undefined && selectedEvent.amount > 0 && (
                  <span className="ml-auto font-bold text-orange-500">${selectedEvent.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                )}
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {selectedEvent.arList.map((a, idx) => (
                  <div key={idx} className={`p-2 rounded-lg border flex items-center justify-between text-xs ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#1c1c1c] border-[#2c2c2c]"}`}>
                    <div>
                      <span className="font-bold text-orange-500">[{a.entity || "AR"}]</span> <span className="font-semibold">{a.customer}</span>
                      {a.description && <div className="text-[10px] text-slate-500 mt-0.5">{a.description}</div>}
                    </div>
                    {a.amount > 0 && <span className="font-bold text-orange-500">${a.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button onClick={() => setSelectedEvent(null)} className={`px-4 py-1.5 rounded text-xs font-semibold ${isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800" : "bg-[#262626] hover:bg-[#333] text-white"}`}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-[60]">
          <div className={`${isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#141414] border-[#333] text-white"} border rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden`}>
            <div className="h-1.5 w-full bg-[#D92D20]" />
            <div className="p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#D92D20]">🗑 Delete Event?</h3>
            <p className="text-xs text-slate-500">
              This will permanently remove <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedEvent?.title}</span> from the calendar. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className={`px-4 py-1.5 rounded text-xs font-semibold ${isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-[#222] hover:bg-[#333] text-slate-300"}`}>
                Cancel
              </button>
              <button
                onClick={() => {
                  const evId = confirmDeleteId === "__pending__" ? selectedEvent?.id : confirmDeleteId;
                  if (evId) {
                    // Use sheetRow from selectedEvent directly (already merged from eventsByDate)
                    const sheetRow = selectedEvent?.sheetRow && selectedEvent.sheetRow > 0
                      ? selectedEvent.sheetRow
                      : sheetEvents.find(e => e.id === evId)?.sheetRow;
                    // Remove from sheetEvents local state
                    setSheetEvents(prev => prev.filter(e => e.id !== evId));
                    // Suppress from calendarLocalEvents display this session
                    setDeletedEventIds(prev => new Set([...prev, evId]));
                    // Persist delete to portal server — PRIMARY persistence (survives GViz cache)
                    fetch("/api/calendar-action", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "delete", id: evId })
                    }).catch(err => console.warn("calendar-action delete failed:", err));
                    // Clear the sheet row, then re-read so deletion is confirmed fresh
                    const token = getAccessToken();
                    if (token && sheetRow && sheetRow > 0) {
                      clearCalendarRow(token, sheetTab, sheetRow)
                        .then(() => loadSheetEvents())
                        .catch(err => console.warn("Sheet row clear failed:", err));
                    }
                    // Remove from FinanceContext local tasks (portal-created)
                    deleteCalendarEvent(evId);
                  }
                  setConfirmDeleteId(null);
                  setSelectedEvent(null);
                }}
                className="px-4 py-1.5 rounded text-xs font-bold bg-[#D92D20] hover:bg-[#b91c1c] text-white">
                Yes, Delete
              </button>
            </div>
            </div>{/* end p-5 */}
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      {showModal && (() => {
        const accent = URGENCY_ACCENT[taskUrgency];
        return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div
            className={`${isLight ? "bg-white text-slate-900" : "bg-[#0d111a] text-white"} border rounded-2xl max-w-md w-full shadow-2xl overflow-hidden transition-all duration-300`}
            style={{ borderColor: accent.hex + "55", boxShadow: `0 0 0 1px ${accent.hex}22, 0 20px 60px rgba(0,0,0,.5)` }}
          >
            {/* Urgency-colored accent bar */}
            <div className="h-1.5 w-full transition-colors duration-300" style={{ background: accent.hex }} />
            <div className="p-5 space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 transition-colors duration-300" style={{ color: accent.hex }} />
              <span>Add Calendar Event or Task</span>
            </h3>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              {/* Category */}
              <div>
                <label className="block font-semibold mb-1 text-slate-500">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["event", "task", "meeting"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setTaskCategory(cat)}
                      className={`py-1.5 rounded-lg border font-bold capitalize transition-all ${
                        taskCategory === cat
                          ? "text-white"
                          : isLight ? "bg-slate-100 border-slate-300 text-slate-700" : "bg-[#1e1e1e] border-[#333] text-[#aaa]"
                      }`}
                      style={taskCategory === cat ? { background: accent.hex, borderColor: accent.hex } : {}}
                    >
                      {cat === "event" ? "📅 Event" : cat === "task" ? "✅ Task" : "🤝 Meeting"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-500">Event Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Executive Cash Flow Review"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"} border rounded-lg px-3 py-1.5 focus:outline-none transition-colors`}
                  style={{ outlineColor: accent.hex }}
                  onFocus={e => (e.target.style.borderColor = accent.hex)}
                  onBlur={e => (e.target.style.borderColor = "")}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-500">Date</label>
                  <input
                    type="date"
                    required
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                    className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"} border rounded-lg px-3 py-1.5 focus:outline-none`}
                    onFocus={e => (e.target.style.borderColor = accent.hex)}
                    onBlur={e => (e.target.style.borderColor = "")}
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-500">Time</label>
                  <input
                    type="time"
                    value={taskTime}
                    onChange={(e) => setTaskTime(e.target.value)}
                    className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"} border rounded-lg px-3 py-1.5 focus:outline-none`}
                    onFocus={e => (e.target.style.borderColor = accent.hex)}
                    onBlur={e => (e.target.style.borderColor = "")}
                  />
                </div>
              </div>

              {/* Urgency */}
              <div>
                <label className="block font-semibold mb-1 text-slate-500">Urgency Level</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["critical", "high", "normal", "low"] as const).map((urg) => {
                    const p = URGENCY_PILL[urg];
                    const isSelected = taskUrgency === urg;
                    return (
                      <button
                        key={urg}
                        type="button"
                        onClick={() => setTaskUrgency(urg)}
                        className={`py-1.5 rounded-full border text-[11px] font-extrabold capitalize transition-all flex items-center justify-center gap-1 ${isSelected ? p.active : p.inactive}`}
                      >
                        <span className={`text-[8px] leading-none ${isSelected ? "text-white" : p.dot}`}>●</span>
                        {urg.charAt(0).toUpperCase() + urg.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-500">Assignee</label>
                <select
                  value={taskAssignee}
                  onChange={(e) => setTaskAssignee(e.target.value)}
                  className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"} border rounded-lg px-3 py-1.5 focus:outline-none`}
                  onFocus={e => (e.target.style.borderColor = accent.hex)}
                  onBlur={e => (e.target.style.borderColor = "")}
                >
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-500">Description / Notes</label>
                <textarea
                  rows={2}
                  placeholder="Details..."
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#0d111a] border-[#333] text-white"} border rounded-lg px-3 py-1.5 focus:outline-none`}
                  onFocus={e => (e.target.style.borderColor = accent.hex)}
                  onBlur={e => (e.target.style.borderColor = "")}
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={syncToGoogleCal}
                    onChange={(e) => setSyncToGoogleCal(e.target.checked)}
                    className="rounded focus:ring-0"
                    style={{ accentColor: accent.hex }}
                  />
                  <span>Sync to connected Google Calendar</span>
                </label>
              </div>

              <div className={`flex items-center justify-end gap-2 pt-2 border-t ${isLight ? "border-slate-200" : "border-[#222]"}`}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-700" : "bg-[#222] text-[#aaa] hover:text-white"}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer transition-colors duration-300 hover:brightness-110"
                  style={{ background: accent.hex }}
                >
                  <Plus className="w-3.5 h-3.5" /> Save Event
                </button>
              </div>
            </form>
            </div>{/* end p-5 */}
          </div>
        </div>
        );
      })()}

      {/* Manage Assignees Modal */}
      {showAssigneeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`${isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#0d111a] border-[#1a2235] text-white"} border rounded-2xl shadow-2xl overflow-hidden`} style={{ maxWidth: 400, maxHeight: "85vh" }}>
            <div className="h-1.5 w-full bg-[#0d9488]" />
            <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(85vh - 6px)" }}>
            <div className={`flex items-center justify-between border-b pb-2.5 ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
              <h3 className={`text-sm font-bold flex items-center gap-2 ${isLight ? "text-slate-900" : "text-white"}`}>
                <Users className="w-4 h-4 text-[#0d9488]" /> Manage Team Assignees
              </h3>
              <button onClick={() => { setShowAssigneeModal(false); setEditingColorId(null); }} className={`${isLight ? "text-slate-400 hover:text-slate-700" : "text-gray-400 hover:text-white"}`}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Existing assignees */}
            <div className="space-y-2 text-xs">
              {assignees.map((a) => (
                <div key={a.id}>
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${isLight ? "bg-slate-50 border-slate-200 text-slate-800" : "bg-[#131824] border-[#1a2235] text-white"}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Color avatar */}
                      <span
                        className="w-7 h-7 rounded-full text-white font-black text-[11px] flex items-center justify-center shadow-md shrink-0"
                        style={{ backgroundColor: a.color }}
                      >
                        {a.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="font-semibold truncate">{a.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {/* Explicit color change button */}
                      <button
                        onClick={() => setEditingColorId(editingColorId === a.id ? null : a.id)}
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                          editingColorId === a.id
                            ? "bg-[#1a2235] border-[#0d9488] text-[#60a5fa]"
                            : isLight ? "bg-slate-100 border-slate-300 text-slate-500 hover:text-slate-700" : "bg-[#0d111a] border-[#1a2235] text-[#4a6080] hover:text-[#7a90b0]"
                        }`}
                      >
                        {editingColorId === a.id ? "✕ Close" : "🎨 Color"}
                      </button>
                      <button
                        onClick={() => { setAssignees(prev => prev.filter(item => item.id !== a.id)); setEditingColorId(null); }}
                        className="text-red-500 hover:text-red-400 text-[11px] font-semibold cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {/* Inline color picker for this assignee */}
                  {editingColorId === a.id && (
                    <div className={`mt-1.5 p-3 rounded-xl border ${isLight ? "bg-white border-slate-200" : "bg-[#0d1525] border-[#1a2235]"}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isLight ? "text-slate-400" : "text-[#3d5478]"}`}>Pick a color</p>
                      <div className="grid grid-cols-6 gap-1.5">
                        {ASSIGNEE_COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => { setAssignees(prev => prev.map(item => item.id === a.id ? { ...item, color: c } : item)); setEditingColorId(null); }}
                            className="w-8 h-8 rounded-lg transition-transform hover:scale-110 hover:shadow-lg relative"
                            style={{ backgroundColor: c }}
                            title={c}
                          >
                            {a.color === c && (
                              <span className="absolute inset-0 flex items-center justify-center text-white text-[12px] font-black drop-shadow">✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add new assignee */}
            <div className={`pt-3 border-t ${isLight ? "border-slate-200" : "border-[#1a2235]"} space-y-2.5`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${isLight ? "text-slate-400" : "text-[#3d5478]"}`}>Add New Assignee</p>

              {/* Color palette for new assignee */}
              <div className="grid grid-cols-6 gap-1.5">
                {ASSIGNEE_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewAssigneeColor(c)}
                    className="w-8 h-8 rounded-lg transition-transform hover:scale-110 hover:shadow-lg relative"
                    style={{ backgroundColor: c }}
                    title={c}
                  >
                    {newAssigneeColor === c && (
                      <span className="absolute inset-0 flex items-center justify-center text-white text-[12px] font-black drop-shadow">✓</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {/* Preview avatar */}
                <span
                  className="w-8 h-8 rounded-full text-white font-black text-sm flex items-center justify-center shrink-0 shadow-md"
                  style={{ backgroundColor: newAssigneeColor }}
                >
                  {newAssigneeName ? newAssigneeName.charAt(0).toUpperCase() : "?"}
                </span>
                <input
                  type="text"
                  placeholder="Name..."
                  value={newAssigneeName}
                  onChange={(e) => setNewAssigneeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newAssigneeName.trim()) {
                      setAssignees(prev => [...prev, { id: `a-${Date.now()}`, name: newAssigneeName.trim(), color: newAssigneeColor }]);
                      setNewAssigneeName("");
                    }
                  }}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-[#0d9488] transition-colors ${isLight ? "bg-slate-50 border-slate-300 text-slate-900" : "bg-[#131824] border-[#1a2235] text-white placeholder-[#4a5568]"}`}
                />
                <button
                  onClick={() => {
                    if (!newAssigneeName.trim()) return;
                    setAssignees(prev => [...prev, { id: `a-${Date.now()}`, name: newAssigneeName.trim(), color: newAssigneeColor }]);
                    setNewAssigneeName("");
                  }}
                  className="px-3 py-2 rounded-lg bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold text-xs cursor-pointer transition-colors shrink-0"
                >
                  + Add
                </button>
              </div>
            </div>
            </div>{/* end p-5 wrapper */}
          </div>
        </div>
      )}
    </div>
  );
};
