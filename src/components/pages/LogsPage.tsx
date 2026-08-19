import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { LoginLogEntry, AuditLog } from "../../types";

const TABS = [
  { id: "login",    label: "🔐 Login History" },
  { id: "activity", label: "📋 Activity Log" },
] as const;
type Tab = typeof TABS[number]["id"];

/* ── helpers ─────────────────────────────────────────── */
const badge = (text: string, color: string) => (
  <span
    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
    style={{ background: color + "22", color }}
  >
    {text}
  </span>
);

const actionColor = (action: string) => {
  if (/add|create|new/i.test(action))    return "#22c55e";
  if (/delet|remov/i.test(action))       return "#ef4444";
  if (/updat|edit|toggle|change/i.test(action)) return "#f59e0b";
  if (/pull|push|sync/i.test(action))    return "#3b82f6";
  if (/login|auth|sign/i.test(action))   return "#a78bfa";
  return "#94a3b8";
};

/* ── empty state ─────────────────────────────────────── */
const Empty: React.FC<{ msg: string }> = ({ msg }) => (
  <div className="flex flex-col items-center justify-center py-20 opacity-40 gap-2 text-sm">
    <span className="text-3xl">🗂️</span>
    {msg}
  </div>
);

/* ── Login History table ─────────────────────────────── */
const LoginTable: React.FC<{ rows: LoginLogEntry[]; isLight: boolean }> = ({ rows, isLight }) => {
  const hdr = isLight ? "bg-slate-100 text-slate-500" : "bg-[#1a1e27] text-[#888]";
  const row = isLight ? "border-slate-100 text-slate-700" : "border-[#1e2433] text-slate-300";
  const sub = isLight ? "text-slate-400" : "text-slate-500";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className={hdr}>
            <th className="text-left px-4 py-2 font-semibold">Timestamp</th>
            <th className="text-left px-4 py-2 font-semibold">User</th>
            <th className="text-left px-4 py-2 font-semibold">Device</th>
            <th className="text-left px-4 py-2 font-semibold">Location</th>
            <th className="text-left px-4 py-2 font-semibold">IP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-b ${row}`}>
              <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11px]">{r.timestamp}</td>
              <td className="px-4 py-2.5 font-medium">{r.user}</td>
              <td className="px-4 py-2.5">{r.device}</td>
              <td className="px-4 py-2.5">
                {r.city || r.region || r.country
                  ? [r.city, r.region, r.country].filter(Boolean).join(", ")
                  : <span className={sub}>—</span>}
              </td>
              <td className={`px-4 py-2.5 font-mono ${sub}`}>{r.ip || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ── Activity Log table ──────────────────────────────── */
const ActivityTable: React.FC<{ rows: AuditLog[]; isLight: boolean }> = ({ rows, isLight }) => {
  const hdr = isLight ? "bg-slate-100 text-slate-500" : "bg-[#1a1e27] text-[#888]";
  const row = isLight ? "border-slate-100 text-slate-700" : "border-[#1e2433] text-slate-300";
  const sub = isLight ? "text-slate-400" : "text-slate-500";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className={hdr}>
            <th className="text-left px-4 py-2 font-semibold">Timestamp</th>
            <th className="text-left px-4 py-2 font-semibold">User</th>
            <th className="text-left px-4 py-2 font-semibold">Action</th>
            <th className="text-left px-4 py-2 font-semibold">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b ${row}`}>
              <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11px]">{r.timestamp}</td>
              <td className={`px-4 py-2.5 ${sub}`}>{r.user}</td>
              <td className="px-4 py-2.5">{badge(r.action, actionColor(r.action))}</td>
              <td className={`px-4 py-2.5 ${sub} max-w-xs truncate`} title={r.details}>{r.details || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ── Main page ───────────────────────────────────────── */
export const LogsPage: React.FC = () => {
  const { theme, auditLogs, loginLogs } = useFinance();
  const isLight = theme === "light";
  const [tab, setTab] = useState<Tab>("login");
  const [search, setSearch] = useState("");

  const bg    = isLight ? "bg-slate-100"     : "bg-[#0a0a0a]";
  const card  = isLight ? "bg-white border-slate-200"   : "bg-[#111318] border-[#1e2433]";
  const txt   = isLight ? "text-slate-800"   : "text-slate-100";
  const txt2  = isLight ? "text-slate-500"   : "text-slate-400";
  const inp   = isLight ? "bg-white border-slate-300 text-slate-800 placeholder-slate-400"
                        : "bg-[#181c24] border-[#2a3140] text-white placeholder-slate-500";

  const filteredLogin = loginLogs.filter(r =>
    !search || [r.user, r.device, r.city, r.region, r.country, r.ip].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );
  const filteredActivity = auditLogs.filter(r =>
    !search || [r.user, r.action, r.details].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className={`flex flex-col h-full ${bg} ${txt} overflow-hidden`}>
      {/* Header */}
      <div className={`shrink-0 flex items-center justify-between px-6 py-4 border-b ${isLight ? "border-slate-200" : "border-[#1e2433]"}`}>
        <div>
          <h1 className="font-bold text-base">Portal Logs</h1>
          <p className={`text-xs mt-0.5 ${txt2}`}>
            {loginLogs.length} login events · {auditLogs.length} activity entries
          </p>
        </div>
        {/* Search */}
        <input
          type="search"
          placeholder="Search logs…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={`w-52 text-xs px-3 py-1.5 rounded-lg border focus:outline-none ${inp}`}
        />
      </div>

      {/* Tabs */}
      <div className={`shrink-0 flex gap-1 px-6 pt-3 border-b ${isLight ? "border-slate-200" : "border-[#1e2433]"}`}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSearch(""); }}
            className={`pb-2.5 px-1 text-xs font-semibold border-b-2 transition-colors ${
              tab === t.id
                ? "border-[#1a73e8] text-[#1a73e8]"
                : `border-transparent ${txt2} hover:opacity-80`
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${isLight ? "bg-slate-100" : "bg-[#1a1e27]"}`}>
              {t.id === "login" ? filteredLogin.length : filteredActivity.length}
            </span>
          </button>
        ))}
      </div>

      {/* Table body */}
      <div className="flex-1 overflow-y-auto">
        <div className={`border ${card} rounded-xl m-4 overflow-hidden`}>
          {tab === "login" ? (
            filteredLogin.length === 0
              ? <Empty msg={search ? "No matching login entries" : "No login history yet"} />
              : <LoginTable rows={filteredLogin} isLight={isLight} />
          ) : (
            filteredActivity.length === 0
              ? <Empty msg={search ? "No matching activity entries" : "No activity recorded yet"} />
              : <ActivityTable rows={filteredActivity} isLight={isLight} />
          )}
        </div>
      </div>
    </div>
  );
};
