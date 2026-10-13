/**
 * Calc — floating assistant (Phase 1: read-only).
 *  • Data lookups run in the browser over the sheet-synced portal state (src/services/calcTools.ts).
 *  • The server (/api/calc/ask) only plans + phrases answers with AI, and checks the user is signed in.
 *  • If the AI is busy or unreachable, Calc falls back to a plain keyword lookup — it still answers.
 *  • Chats are stored ONLY in this browser, keyed to the signed-in account. Never sent to a server store.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Send, History, Plus, Trash2, ExternalLink, Copy, Check } from "lucide-react";
import { useFinance } from "../../context/FinanceContext";
import { getAccessToken } from "../../services/googleAuth";
import { verifyAmounts } from "../../services/calcVerify";
import { CalcAvatar, CalcAvatarState } from "./CalcAvatar";
import {
  CalcEvent, CalcLink, CalcSnapshot, ToolResult, entityLabel, routeQuestion, runTool, toolCatalogText,
} from "../../services/calcTools";

interface Suggest { label: string; tool: string; args: any }
interface Msg { id: string; role: "user" | "calc"; text: string; links?: CalcLink[]; suggest?: Suggest[]; ts: number }
interface Chat { id: string; title: string; updatedAt: number; messages: Msg[] }

const KEY_PREFIX = "calc_chats_v1:";
const DAY_PREFIX = "calc_briefing_day:";
const GREETING = "Hi! I'm Calc. I can look up bills, bank balances and statements, check the calendar and notes, find platforms, and explain how things work in the portal. I can't change anything yet. What do you need?";

const CHIPS: { label: string; tool?: string; args?: any; prefill?: string }[] = [
  { label: "Daily briefing", tool: "briefing" },
  { label: "Overdue bills", tool: "ap_overdue" },
  { label: "Due this week", tool: "ap_due_soon", args: { days: 7 } },
  { label: "Statements to download", tool: "statements_pending" },
  { label: "Bank balances", tool: "bank_balances" },
  { label: "Today's calendar", tool: "calendar", args: { days: 1 } },
  { label: "Open notes", tool: "notes_open" },
  { label: "How do I…", prefill: "How do I " },
];

/** Local testing only: on localhost the server accepts requests without a Google token (it checks the TCP peer is loopback). */
const IS_LOCAL = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Remove every saved Calc chat in this browser (called on sign-out). */
export function clearAllCalcChats() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(KEY_PREFIX) || k.startsWith(DAY_PREFIX)).forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// ── tiny markdown: **bold**, [text](https://…), and "Source:" lines in muted small text ──
const inline = (text: string, keyBase: string): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={`${keyBase}b${i++}`}>{m[1].slice(2, -2)}</strong>);
    else {
      const mm = m[2].match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)!;
      out.push(<a key={`${keyBase}a${i++}`} href={mm[2]} target="_blank" rel="noopener noreferrer" className="underline text-[#2f6fc9]">{mm[1]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};
const RenderText: React.FC<{ text: string }> = ({ text }) => (
  <div className="space-y-1 break-words">
    {text.split("\n").map((ln, i) =>
      ln.trim() === "" ? <div key={i} className="h-1" /> :
      /^Source:/i.test(ln.trim()) ? <div key={i} className="text-[11px] opacity-60 pt-1">{ln}</div> :
      <div key={i} className={/^\s{2,}[–-]/.test(ln) ? "pl-4" : ""}>{inline(ln, String(i))}</div>
    )}
  </div>
);

const formatResults = (rs: ToolResult[]): { text: string; links: CalcLink[]; suggest: Suggest[] } => {
  const blocks = rs.map(r => r.lines.join("\n"));
  const seen = new Set<string>(); const links: CalcLink[] = [];
  rs.forEach(r => (r.links || []).forEach(l => { if (!seen.has(l.page)) { seen.add(l.page); links.push(l); } }));
  const srcs = Array.from(new Set(rs.filter(r => r.source).map(r => (r.asOf ? `${r.source}, ${r.asOf}` : r.source))));
  const src = srcs.length ? `\nSource: ${srcs.join(" · ")}.` : "";
  const suggest = (rs.find(r => r.suggest && r.suggest.length)?.suggest || []).slice(0, 4);
  return { text: blocks.join("\n\n") + src, links: links.slice(0, 3), suggest };
};

export const CalcWidget: React.FC = () => {
  const fin = useFinance() as any;
  const { theme, isLoading, userEmail, setCurrentPage, lastSyncedAt } = fin;
  const isLight = theme === "light";
  const email = String(userEmail || "guest").toLowerCase();
  const storeKey = KEY_PREFIX + email;

  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string>(() => uid());
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState<{ id: string; n: number } | null>(null);
  const [av, setAv] = useState<CalcAvatarState>("idle");
  const [statusNote, setStatusNote] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const avTimer = useRef<any>(null);
  const briefedRef = useRef(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyMsg = (m: Msg) => {
    const plain = m.text.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)");
    try { navigator.clipboard.writeText(plain); setCopiedId(m.id); setTimeout(() => setCopiedId(c => (c === m.id ? null : c)), 1500); } catch { /* clipboard blocked */ }
  };

  // ── snapshot of the sheet-synced portal state ──
  const snapshot = useMemo<CalcSnapshot>(() => {
    const events: CalcEvent[] = [];
    (fin.calSheetEvents || []).forEach((e: any) => events.push({ date: e.date, time: e.time, title: e.title, entity: e.entity, assignee: e.assignee, done: !!e.done, source: "sheet" }));
    (fin.calendarLocalEvents || []).forEach((e: any) => events.push({ date: e.date, time: e.time, title: [e.vendor, e.description].filter(Boolean).join(": "), entity: e.entity, done: !!e.done, source: "dashboard" }));
    (fin.googleCalEvents || []).forEach((e: any) => {
      const dt = e.start?.dateTime || e.start?.date || "";
      if (!dt) return;
      const d = new Date(dt);
      const date = e.start?.dateTime ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : String(dt).slice(0, 10);
      const time = e.start?.dateTime ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : undefined;
      events.push({ date, time, title: e.summary || "(no title)", source: "google" });
    });
    const seen = new Set<string>();
    const uniq = events.filter(e => { const k = `${e.date}|${(e.title || "").toLowerCase()}|${e.time || ""}`; if (seen.has(k)) return false; seen.add(k); return true; });
    return {
      now: new Date(), lastSyncedAt: lastSyncedAt || null,
      apBills: fin.apBills || [], bankAccounts: fin.bankAccounts || [], bankStatements: fin.bankStatements || [],
      events: uniq, quickNotes: fin.quickNotes || [], externalLinks: fin.externalLinks || [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fin.apBills, fin.bankAccounts, fin.bankStatements, fin.calSheetEvents, fin.calendarLocalEvents, fin.googleCalEvents, fin.quickNotes, fin.externalLinks, lastSyncedAt, open]);

  const setAvFor = useCallback((s: CalcAvatarState, ms = 0) => {
    clearTimeout(avTimer.current);
    setAv(s);
    if (ms) avTimer.current = setTimeout(() => setAv("idle"), ms);
  }, []);

  // ── load this account's saved chats; always start on a clean chat ──
  useEffect(() => {
    try { setChats(JSON.parse(localStorage.getItem(storeKey) || "[]")); } catch { setChats([]); }
    setMessages([]); setActiveId(uid()); briefedRef.current = false;
  }, [storeKey]);

  // ── persist the active chat (this browser only) ──
  useEffect(() => {
    if (!messages.some(m => m.role === "user") && messages.length < 2) return;
    const title = (messages.find(m => m.role === "user")?.text || "Daily briefing").slice(0, 44);
    setChats(prev => {
      const next = [{ id: activeId, title, updatedAt: Date.now(), messages: messages.slice(-60) }, ...prev.filter(c => c.id !== activeId)].slice(0, 30);
      try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* storage full */ }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, typing, busy, open, showHistory]);

  const push = useCallback((m: Omit<Msg, "id" | "ts">) => {
    const msg: Msg = { ...m, id: uid(), ts: Date.now() };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  // reveal a Calc answer gradually while the avatar "talks"
  const reveal = useCallback((text: string, links?: CalcLink[], suggest?: Suggest[]) => {
    const msg = push({ role: "calc", text, links, suggest });
    const total = text.length, step = Math.max(2, Math.ceil(total / 90));
    let n = 0;
    setTyping({ id: msg.id, n: 0 }); setAvFor("talk");
    const iv = setInterval(() => {
      n += step;
      if (n >= total) { clearInterval(iv); setTyping(null); setAvFor("idle"); }
      else setTyping({ id: msg.id, n });
    }, 16);
  }, [push, setAvFor]);

  const fail = useCallback((text: string) => { setAvFor("busy", 3500); push({ role: "calc", text }); }, [push, setAvFor]);

  // ── daily briefing on first open of the day (needs loaded data) ──
  useEffect(() => {
    if (!open || isLoading || briefedRef.current || messages.length > 0) return;
    briefedRef.current = true;
    let seenDay = "";
    try { seenDay = localStorage.getItem(DAY_PREFIX + email) || ""; } catch { /* ignore */ }
    setAvFor("greet", 3200);
    if (seenDay !== todayKey() && snapshot.apBills.length + snapshot.bankAccounts.length > 0) {
      const r = runTool("briefing", snapshot, {});
      if (r) {
        try { localStorage.setItem(DAY_PREFIX + email, todayKey()); } catch { /* ignore */ }
        const f = formatResults([r]);
        push({ role: "calc", text: "Good to see you! " + f.text, links: f.links });
        return;
      }
    }
    push({ role: "calc", text: GREETING });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading]);

  const askServer = useCallback(async (body: any) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 28000);
    try {
      const r = await fetch("/api/calc/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
      const j = await r.json().catch(() => ({}));
      return { status: r.status, j };
    } finally { clearTimeout(t); }
  }, []);

  const lastCallsRef = useRef<{ tool: string; args: any }[] | null>(null);
  /** "list them", "show me", "yes please" right after a summary → re-run the same lookup, this time listing the bills. */
  const followUpCalls = (q: string) => {
    const last = lastCallsRef.current;
    if (!last) return null;
    const t = q.trim().toLowerCase();
    if (/^(are there|is there|any|got|do you have)( any)? ?(more|others?|other ones|else)\b|^(what|anything|show me) else\b|^(and )?(more|the rest)\b[ ?.!]*$/.test(t)) return last.map(c => ({ ...c, args: { ...c.args, list: true } }));
    if (/^(yes|yeah|yep|sure|ok|okay|please)\b[ ,.!]*(please|list|show)?[ a-z]*[.!?]*$/.test(t) || /^(please )?(list|show|itemi[sz]e)( me)?( them| these| those| it| all| the bills)?( all)?( of them)?( please)?[.!?]*$/.test(t))
      return last.map(c => ({ ...c, args: { ...c.args, list: true } }));
    return null;
  };

  const runLocal = useCallback((calls: { tool: string; args: any }[], note?: string) => {
    const rs = calls.map(c => runTool(c.tool, snapshot, c.args || {})).filter(Boolean) as ToolResult[];
    if (!rs.length) return false;
    lastCallsRef.current = calls;
    const f = formatResults(rs);
    reveal((note ? note + "\n\n" : "") + f.text, f.links, f.suggest);
    return true;
  }, [snapshot, reveal]);

  const send = useCallback(async (raw: string, quick?: { tool: string; args?: any }) => {
    const q = raw.trim();
    if (!q || busy) return;
    setInput(""); setShowHistory(false); setStatusNote("");
    push({ role: "user", text: q });
    setBusy(true); setAvFor("think");
    try {
      if (quick) { await new Promise(r => setTimeout(r, 450)); if (!runLocal([{ tool: quick.tool, args: quick.args || {} }])) fail("I couldn't read that data just now."); return; }

      const follow = followUpCalls(q);
      if (follow) { await new Promise(r => setTimeout(r, 350)); if (runLocal(follow)) return; }

      const token = getAccessToken();
      const history = messages.slice(-6).map(m => ({ role: m.role, text: m.text.slice(0, 400) }));
      const today = new Date().toString().slice(0, 33);
      if (!token && !IS_LOCAL) {
        const calls = routeQuestion(q, snapshot);
        if (calls && runLocal(calls, "(Sign in with Google for full chat. I answered from a direct lookup.)")) return;
        fail("Please sign in with Google first, then ask me again."); return;
      }

      // 1) plan
      let plan: { calls: { tool: string; args: any }[]; direct: string } | null = null;
      let planNote = "The AI is busy right now, so here's the straight lookup:";
      let aiNoKey = false;
      try {
        const { status, j } = await askServer({ phase: "plan", accessToken: IS_LOCAL ? "" : token, question: q, history, today, toolCatalog: toolCatalogText(), entities: Array.from(new Set(snapshot.apBills.map(b => entityLabel(b)).filter(Boolean))) });
        if (status === 401) {
          const calls = routeQuestion(q, snapshot);
          if (calls && runLocal(calls, "Your Google session has expired, so I used the direct lookup. Sign in again for full chat:")) return;
          fail("Your Google session expired. Sign in again and I'll be right here."); return;
        }
        if (status === 429) { fail(j?.error || "Slow down a little — try again in a minute."); return; }
        if (j?.ok) plan = { calls: j.calls || [], direct: j.direct || "" };
        else if (j?.code === "nokey") { aiNoKey = true; planNote = "The AI isn't set up on this server yet, so here's the straight lookup:"; }
      } catch { /* fall through to fallback */ }

      if (!plan) {
        const calls = routeQuestion(q, snapshot);
        if (calls && runLocal(calls, planNote)) return;
        fail(aiNoKey ? "That one needs the AI, which isn't set up on this server yet. The quick buttons still work." : "I'm busy right now and couldn't work that one out. Try one of the quick buttons, or ask again in a minute."); return;
      }
      if (plan.calls.length === 0) { reveal(plan.direct || "I'm not sure how to help with that yet. I can look up bills, bank balances, statements, the calendar, notes and platforms, or explain how the portal works."); return; }

      // 2) run the lookups here, over the live synced data
      lastCallsRef.current = plan.calls;
      const results = plan.calls.map(c => runTool(c.tool, snapshot, c.args || {})).filter(Boolean) as ToolResult[];
      if (!results.length) { reveal("I couldn't find a lookup for that. I can do bills, bank balances, statements, calendar, notes, platforms, and how-to help."); return; }
      const f = formatResults(results);

      // 3) phrase the answer
      try {
        const { j } = await askServer({
          phase: "answer", accessToken: IS_LOCAL ? "" : token, question: q, history, today,
          results: results.map(r => ({ tool: r.tool, title: r.title, source: r.source, asOf: r.asOf, data: r.data })),
        });
        if (j?.ok && j.text) {
          // Number guard: every $ figure in the AI's wording must trace back to the lookup data.
          const check = verifyAmounts(j.text, results.map(r => r.data), history.map(h => h.text));
          if (check.ok) { reveal(j.text, f.links, f.suggest); return; }
          console.warn("[Calc] AI answer had unverifiable amounts, using the plain lookup:", check.bad);
          reveal("I double-checked my AI-written answer against the data and one figure didn't match, so here's the straight lookup instead:\n\n" + f.text, f.links, f.suggest);
          return;
        }
      } catch { /* use the plain lookup */ }
      reveal("The AI is busy, so here's the straight lookup:\n\n" + f.text, f.links, f.suggest);
    } catch (e: any) {
      fail("Something went wrong on my side. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [busy, messages, snapshot, push, setAvFor, runLocal, fail, reveal, askServer]);

  const newChat = () => { setMessages([]); setActiveId(uid()); setShowHistory(false); briefedRef.current = true; push({ role: "calc", text: GREETING }); setAvFor("greet", 2500); inputRef.current?.focus(); };
  const loadChat = (c: Chat) => { setActiveId(c.id); setMessages(c.messages); setShowHistory(false); briefedRef.current = true; };
  const deleteChat = (id: string) => {
    setChats(prev => { const n = prev.filter(c => c.id !== id); try { localStorage.setItem(storeKey, JSON.stringify(n)); } catch { /* ignore */ } return n; });
    if (id === activeId) { setMessages([]); setActiveId(uid()); }
  };
  const deleteAll = () => { setChats([]); try { localStorage.removeItem(storeKey); } catch { /* ignore */ } setMessages([]); setActiveId(uid()); };

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 150); }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open]);

  const panel = isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#121212] border-[#2a2a2a] text-slate-100";
  const sub = isLight ? "text-slate-500" : "text-slate-400";
  const bubbleCalc = isLight ? "bg-slate-100 text-slate-800" : "bg-[#1d1d1d] text-slate-100";
  const line = isLight ? "border-slate-200" : "border-[#2a2a2a]";
  const statusText = av === "think" ? "Thinking…" : av === "talk" ? "Answering…" : av === "busy" ? "Busy — try again soon" : "Online — ask me anything!";
  const statusColor = av === "busy" ? "text-amber-500" : "text-emerald-500";

  const launcher = (
    <button
      onClick={() => { setOpen(true); }}
      aria-label="Open Calc, the portal assistant"
      title="Ask Calc"
      className={`fixed z-[60] right-3 bottom-[7.6rem] md:right-5 md:bottom-24 transition-transform hover:scale-105 active:scale-95 ${open ? "hidden" : ""}`}
      style={{ width: 76, height: 76, filter: "drop-shadow(0 6px 10px rgba(0,0,0,.28))" }}
    >
      <CalcAvatar state={open ? "idle" : av} size={76} />
    </button>
  );

  return (
    <>
      {launcher}
      {open && (
        <div
          role="dialog" aria-label="Calc assistant"
          className={`fixed z-[70] right-3 bottom-16 md:right-6 md:bottom-6 flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${panel}`}
          style={{ width: "min(390px, calc(100vw - 1.5rem))", height: "min(600px, calc(100vh - 5.5rem))" }}
        >
          {/* header */}
          <div className={`flex items-center gap-2 px-3 py-2 border-b ${line}`}>
            <div style={{ width: 46, height: 46 }} className="shrink-0"><CalcAvatar state={av} size={46} /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-tight">Calc</div>
              <div className={`text-[11px] leading-tight ${statusColor}`}>● {statusText}</div>
            </div>
            <button onClick={newChat} title="New chat" aria-label="New chat" className={`p-1.5 rounded-lg hover:bg-black/5 ${sub}`}><Plus className="w-4 h-4" /></button>
            <button onClick={() => setShowHistory(s => !s)} title="Chat history" aria-label="Chat history" className={`p-1.5 rounded-lg hover:bg-black/5 ${showHistory ? "text-[#2f6fc9]" : sub}`}><History className="w-4 h-4" /></button>
            <button onClick={() => setOpen(false)} title="Close" aria-label="Close" className={`p-1.5 rounded-lg hover:bg-black/5 ${sub}`}><X className="w-4 h-4" /></button>
          </div>

          {/* body */}
          {showHistory ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className={`text-[11px] ${sub}`}>Your chats are saved only in this browser and only for your account. Nobody else can see them.</div>
              {chats.length === 0 && <div className={`text-sm ${sub} py-6 text-center`}>No saved chats yet.</div>}
              {chats.map(c => (
                <div key={c.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${line}`}>
                  <button className="flex-1 text-left min-w-0" onClick={() => loadChat(c)}>
                    <div className="text-sm truncate">{c.title}</div>
                    <div className={`text-[11px] ${sub}`}>{new Date(c.updatedAt).toLocaleString()}</div>
                  </button>
                  <button onClick={() => deleteChat(c.id)} aria-label="Delete chat" className={`p-1 rounded hover:bg-red-500/10 ${sub} hover:text-red-500`}><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {chats.length > 0 && <button onClick={deleteAll} className="text-xs text-red-500 hover:underline">Delete all chats</button>}
            </div>
          ) : (
            <div ref={scrollRef} aria-live="polite" className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {messages.map(m => {
                const shown = typing && typing.id === m.id ? m.text.slice(0, typing.n) : m.text;
                return (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${m.role === "user" ? "bg-[#2f6fc9] text-white" : bubbleCalc}`}>
                      {m.role === "user" ? shown : <RenderText text={shown} />}
                      {m.role === "calc" && !(typing && typing.id === m.id) && m.text.length > 60 && (
                        <button onClick={() => copyMsg(m)} aria-label="Copy this answer" title="Copy"
                          className={`mt-1.5 -mb-0.5 inline-flex items-center gap-1 text-[10px] opacity-50 hover:opacity-100 ${sub}`}>
                          {copiedId === m.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}{copiedId === m.id ? "Copied" : "Copy"}
                        </button>
                      )}
                      {m.role === "calc" && m.suggest && m.suggest.length > 0 && !(typing && typing.id === m.id) && m.id === messages[messages.length - 1]?.id && (
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          {m.suggest.map(sg => (
                            <button key={sg.label} disabled={busy} onClick={() => send(sg.label, { tool: sg.tool, args: sg.args })}
                              className={`text-[12px] px-2.5 py-1 rounded-full border ${isLight ? "border-slate-300 bg-white hover:bg-slate-50" : "border-[#3a3a3a] hover:bg-[#262626]"}`}>
                              {sg.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {m.role === "calc" && m.links && m.links.length > 0 && !(typing && typing.id === m.id) && (
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          {m.links.map(l => (
                            <button key={l.page} onClick={() => { setCurrentPage(l.page as any); }} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-[#2f6fc9]/40 text-[#2f6fc9] hover:bg-[#2f6fc9]/10">
                              {l.label}<ExternalLink className="w-3 h-3" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {busy && av === "think" && <div className={`text-xs ${sub} pl-1`}>Calc is working on it…</div>}
              {messages.filter(m => m.role === "user").length === 0 && messages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {CHIPS.map(c => (
                    <button key={c.label} disabled={busy}
                      onClick={() => c.tool ? send(c.label, { tool: c.tool, args: c.args }) : (setInput(c.prefill || ""), inputRef.current?.focus())}
                      className={`text-[12px] px-2.5 py-1 rounded-full border ${isLight ? "border-slate-300 hover:bg-slate-50" : "border-[#333] hover:bg-[#1c1c1c]"}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* input */}
          <form onSubmit={e => { e.preventDefault(); send(input); }} className={`flex items-center gap-2 px-3 py-2 border-t ${line}`}>
            <input
              ref={inputRef} value={input} onChange={e => setInput(e.target.value)} maxLength={400} disabled={busy}
              placeholder="Ask Calc about bills, balances, statements…"
              className={`flex-1 rounded-xl border px-3 py-2 text-[13px] outline-none focus:border-[#2f6fc9] ${isLight ? "bg-white border-slate-300" : "bg-[#0d0d0d] border-[#333]"}`}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="p-2 rounded-xl bg-[#2f6fc9] text-white disabled:opacity-40">
              <Send className="w-4 h-4" />
            </button>
          </form>
          {statusNote && <div className="sr-only">{statusNote}</div>}
        </div>
      )}
    </>
  );
};

export default CalcWidget;
