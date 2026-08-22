import React, { useState, useEffect, useRef, useCallback } from "react";
import { useFinance } from "../context/FinanceContext";
import { PageRoute } from "../types";
import {
  Search,
  X,
  CreditCard,
  TrendingDown,
  Landmark,
  Receipt,
  StickyNote,
  ArrowRight,
  AlertCircle,
  CheckCircle2
} from "lucide-react";

/* ─── Result shape ──────────────────────────────────────────── */
interface SearchResult {
  id: string;
  type: "bill" | "ar" | "loan" | "bank" | "note";
  title: string;
  subtitle: string;
  rightLabel: string;
  badge?: string;
  badgeColor?: string;
  page: PageRoute;
}

const TYPE_META: Record<SearchResult["type"], { label: string; Icon: React.FC<{ className?: string }> ; color: string }> = {
  bill:  { label: "AP Bills",    Icon: CreditCard,   color: "text-red-400"     },
  ar:    { label: "AR",          Icon: TrendingDown,  color: "text-emerald-400" },
  loan:  { label: "Loans",       Icon: Receipt,       color: "text-amber-400"   },
  bank:  { label: "Bank Accounts", Icon: Landmark,    color: "text-blue-400"    },
  note:  { label: "Notes",       Icon: StickyNote,    color: "text-purple-400"  },
};

const ORDER: SearchResult["type"][] = ["bill", "ar", "loan", "bank", "note"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/* ─── The modal ─────────────────────────────────────────────── */
export const GlobalSearchModal: React.FC = () => {
  const { apBills, arItems, loans, bankAccounts, quickNotes, setCurrentPage, theme } = useFinance();
  const isLight = theme === "light";

  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  /* Open via keyboard or custom event */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-global-search", onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-global-search", onEvent);
    };
  }, []);

  /* Reset on open */
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  /* ── Build results ─────────────────────────────────────────── */
  const results = useCallback((): SearchResult[] => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    const out: SearchResult[] = [];

    // AP Bills
    apBills.forEach(b => {
      const hay = [b.vendor, b.entity, b.invoiceNo, b.remarks, b.notes, b.status, b.bucket].join(" ").toLowerCase();
      if (!hay.includes(q)) return;
      const statusColor = b.status === "paid"
        ? "text-emerald-400"
        : b.status === "hold"
        ? "text-amber-400"
        : b.dueDate < new Date().toISOString().slice(0,10)
        ? "text-red-400"
        : "text-slate-400";
      out.push({
        id: b.id,
        type: "bill",
        title: b.vendor,
        subtitle: `${b.entity}${b.invoiceNo ? " · #" + b.invoiceNo : ""}`,
        rightLabel: fmt(b.amount),
        badge: b.status.toUpperCase(),
        badgeColor: statusColor,
        page: "ap",
      });
    });

    // AR
    arItems.forEach(a => {
      const hay = [a.customer, a.entity, a.description, a.remarks, a.occurrence].join(" ").toLowerCase();
      if (!hay.includes(q)) return;
      out.push({
        id: a.id,
        type: "ar",
        title: a.customer,
        subtitle: `${a.entity} · ${a.description}`,
        rightLabel: fmt(a.amount),
        badge: a.payment ? "PAID" : "UNPAID",
        badgeColor: a.payment ? "text-emerald-400" : "text-amber-400",
        page: "ar",
      });
    });

    // Loans
    loans.forEach(l => {
      const hay = [l.lender, l.entity, l.purpose, l.status].join(" ").toLowerCase();
      if (!hay.includes(q)) return;
      out.push({
        id: l.id,
        type: "loan",
        title: l.lender,
        subtitle: `${l.entity} · ${l.purpose}`,
        rightLabel: fmt(l.outstanding),
        badge: l.status,
        badgeColor: l.status === "Active" ? "text-blue-400" : "text-slate-400",
        page: "loans",
      });
    });

    // Banks
    bankAccounts.forEach(b => {
      const hay = [b.bank, b.entity, b.acct, b.type, b.status].join(" ").toLowerCase();
      if (!hay.includes(q)) return;
      out.push({
        id: b.id,
        type: "bank",
        title: b.bank,
        subtitle: `${b.entity} · ${b.type}${b.acct ? " ···" + b.acct.slice(-4) : ""}`,
        rightLabel: fmt(b.balance),
        badge: b.status,
        badgeColor: b.status === "Active" ? "text-emerald-400" : "text-slate-400",
        page: "banks",
      });
    });

    // Notes / Workspace items
    quickNotes.forEach(n => {
      const hay = [n.title, n.content, n.category, n.entity].join(" ").toLowerCase();
      if (!hay.includes(q)) return;
      out.push({
        id: n.id,
        type: "note",
        title: n.title || "(untitled)",
        subtitle: [n.category, n.entity].filter(Boolean).join(" · "),
        rightLabel: n.itemType === "link" ? "Link" : n.itemType === "folder" ? "Folder" : "Note",
        badge: n.status === "done" ? "DONE" : undefined,
        badgeColor: "text-emerald-400",
        page: "notes",
      });
    });

    return out;
  }, [query, apBills, arItems, loans, bankAccounts, quickNotes]);

  const grouped = useCallback(() => {
    const r = results();
    const map: Partial<Record<SearchResult["type"], SearchResult[]>> = {};
    r.forEach(item => {
      if (!map[item.type]) map[item.type] = [];
      map[item.type]!.push(item);
    });
    return map;
  }, [results]);

  /* Flat list for keyboard nav */
  const flat = useCallback(() => {
    const map = grouped();
    return ORDER.flatMap(t => map[t] ?? []);
  }, [grouped]);

  const allItems = flat();
  const safeIdx  = Math.min(cursor, allItems.length - 1);

  /* Arrow key nav */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && allItems[safeIdx]) {
      navigate(allItems[safeIdx]);
    }
  };

  /* Scroll active into view */
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-active='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const navigate = (item: SearchResult) => {
    setCurrentPage(item.page);
    setOpen(false);
  };

  if (!open) return null;

  const map = grouped();
  const hasResults = allItems.length > 0;
  const q = query.trim();

  /* ── Colors ─────────────────────────────────────────────────── */
  const bg      = isLight ? "bg-white"          : "bg-[#0d111a]";
  const border  = isLight ? "border-slate-200"  : "border-[#1a2235]";
  const inputBg = isLight ? "bg-slate-50"       : "bg-[#070b12]";
  const txt     = isLight ? "text-slate-800"    : "text-slate-200";
  const muted   = isLight ? "text-slate-400"    : "text-[#4a6080]";
  const hover   = isLight ? "hover:bg-slate-50" : "hover:bg-[#151c29]";
  const active  = isLight ? "bg-blue-50"        : "bg-[#1a2640]";
  const divider = isLight ? "border-slate-100"  : "border-[#1a2235]";

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh] px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div
        className={`relative z-10 w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden ${bg} ${border}`}
        style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)" }}
      >
        {/* Search input */}
        <div className={`flex items-center gap-3 px-4 py-3.5 border-b ${border} ${inputBg}`}>
          <Search className={`w-4 h-4 shrink-0 ${muted}`} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search bills, AR, loans, banks, notes…"
            className={`flex-1 bg-transparent text-sm outline-none placeholder:text-[#4a6080] ${txt}`}
          />
          <div className="flex items-center gap-2 shrink-0">
            {query && (
              <button onClick={() => setQuery("")} className={`${muted} hover:opacity-70`}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <kbd className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${border} ${muted}`}>ESC</kbd>
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {!q ? (
            /* Empty state — tips */
            <div className="px-5 py-8 text-center">
              <Search className={`w-8 h-8 mx-auto mb-3 ${muted} opacity-40`} />
              <p className={`text-sm font-medium ${txt}`}>Search across everything</p>
              <p className={`text-xs mt-1 ${muted}`}>AP bills, AR, loans, banks &amp; notes — all from one place</p>
              <div className={`flex items-center justify-center gap-4 mt-4 text-[11px] ${muted}`}>
                <span>↑↓ navigate</span>
                <span>↵ open</span>
                <span>Ctrl+K toggle</span>
              </div>
            </div>
          ) : !hasResults ? (
            <div className="px-5 py-8 text-center">
              <AlertCircle className={`w-8 h-8 mx-auto mb-3 ${muted} opacity-40`} />
              <p className={`text-sm font-medium ${txt}`}>No results for "{query}"</p>
              <p className={`text-xs mt-1 ${muted}`}>Try a vendor name, customer, bank, or note title</p>
            </div>
          ) : (
            ORDER.map(type => {
              const items = map[type];
              if (!items?.length) return null;
              const meta = TYPE_META[type];
              return (
                <div key={type}>
                  {/* Group header */}
                  <div className={`flex items-center gap-2 px-4 py-2 border-b ${divider} sticky top-0 ${isLight ? "bg-slate-50" : "bg-[#080d16]"}`}>
                    <meta.Icon className={`w-3 h-3 ${meta.color}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>{meta.label}</span>
                    <span className={`text-[10px] ${muted}`}>({items.length})</span>
                  </div>
                  {/* Result rows */}
                  {items.map(item => {
                    const globalIdx = allItems.findIndex(r => r.id === item.id && r.type === item.type);
                    const isActive  = globalIdx === safeIdx;
                    return (
                      <button
                        key={item.id}
                        data-active={isActive ? "true" : undefined}
                        onClick={() => navigate(item)}
                        onMouseEnter={() => setCursor(globalIdx)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b ${divider} last:border-0 ${isActive ? active : hover}`}
                      >
                        {/* Title + subtitle */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${txt}`}>{item.title}</p>
                          {item.subtitle && (
                            <p className={`text-[11px] truncate mt-0.5 ${muted}`}>{item.subtitle}</p>
                          )}
                        </div>

                        {/* Right side */}
                        <div className="shrink-0 flex items-center gap-2">
                          {item.badge && (
                            <span className={`text-[10px] font-bold ${item.badgeColor}`}>{item.badge}</span>
                          )}
                          <span className={`text-xs font-semibold tabular-nums ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                            {item.rightLabel}
                          </span>
                          {isActive && <ArrowRight className={`w-3 h-3 ${muted}`} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {hasResults && (
          <div className={`flex items-center justify-between px-4 py-2 border-t ${border} ${isLight ? "bg-slate-50" : "bg-[#070b12]"}`}>
            <span className={`text-[10px] ${muted}`}>{allItems.length} result{allItems.length !== 1 ? "s" : ""}</span>
            <div className={`flex items-center gap-3 text-[10px] ${muted}`}>
              <span>↑↓ navigate</span>
              <span>↵ open</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
