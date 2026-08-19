import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { LoginLogEntry, AuditLog } from "../../types";
import { Download } from "lucide-react";

const TABS = [
  { id: "login",    label: "🔐 Login History" },
  { id: "activity", label: "📋 Activity Log" },
] as const;
type Tab = typeof TABS[number]["id"];

/* ── CSV download helper ─────────────────────────────── */
function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const lines  = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))];
  const blob   = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href       = url;
  a.download   = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
  if (/add|create|new/i.test(action))             return "#22c55e";
  if (/delet|remov/i.test(action))                return "#ef4444";
  if (/updat|edit|toggle|change/i.test(action))   return "#f59e0b";
  if (/pull|push|sync/i.test(action))             return "#3b82f6";
  if (/login|auth|sign/i.test(action))            return "#a78bfa";
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
            <th className="text-left px-4 py-2 font-semibold">#</th>
            <th className="text-left px-4 py-2 font-semibold">Timestamp</th>
            <th className="text-left px-4 py-2 font-semibold">User</th>
            <th className="text-left px-4 py-2 font-semibold">Device</th>
            <th className="text-left px-4 py-2 font-semibold">Location</th>
            <th className="text-left px-4 py-2 font-semibold">IP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={`border-b ${row} hover:opacity-80 transition-opacity`}>
              <td className={`px-4 py-2.5 ${sub}`}>{i + 1}</td>
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
            <th className="text-left px-4 py-2 font-semibold">#</th>
            <th className="text-left px-4 py-2 font-semibold">Timestamp</th>
            <th className="text-left px-4 py-2 font-semibold">User</th>
            <th className="text-left px-4 py-2 font-semibold">Action</th>
            <th className="text-left px-4 py-2 font-semibold">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b ${row} hover:opacity-80 transition-opacity`}>
              <td className={`px-4 py-2.5 ${sub}`}>{i + 1}</td>
              <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11px]">{r.timestamp}</td>
              <td className={`px-4 py-2.5 ${sub}`}>{r.user}</td>
              <td className="px-4 py-2.5">{badge(r.action, actionColor(r.action))}</td>
              <td className={`px-4 py-2.5 ${sub}`} title={r.details}>{r.details || "—"}</td>
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
  const [tab, setTab]       = useState<Tab>("login");
  const [search, setSearch] = useState("");

  const bg   = isLight ? "bg-slate-100"  : "bg-[#0a0a0a]";
  const card = isLight ? "bg-white border-slate-200" : "bg-[#111318] border-[#1e2433]";
  const txt  = isLight ? "text-slate-800" : "text-slate-100";
  const txt2 = isLight ? "text-slate-500" : "text-slate-400";
  const inp  = isLight
    ? "bg-white border-slate-300 text-slate-800 placeholder-slate-400"
    : "bg-[#181c24] border-[#2a3140] text-white placeholder-slate-500";

  const q = search.toLowerCase();
  const filteredLogin = loginLogs.filter(r =>
    !q || [r.user, r.device, r.city, r.region, r.country, r.ip].some(v => v?.toLowerCase().includes(q))
  );
  const filteredActivity = auditLogs.filter(r =>
    !q || [r.user, r.action, r.details].some(v => v?.toLowerCase().includes(q))
  );

  const handleDownload = () => {
    const ts = new Date().toISOString().slice(0, 10);
    if (tab === "login") {
      downloadCSV(
        `login-history-${ts}.csv`,
        ["#", "Timestamp", "User", "Device", "City", "Region", "Country", "IP"],
        filteredLogin.map((r, i) => [
          String(i + 1), r.timestamp, r.user, r.device,
          r.city, r.region, r.country, r.ip
        ])
      );
    } else {
      downloadCSV(
        `activity-log-${ts}.csv`,
        ["#", "Timestamp", "User", "Action", "Details"],
        filteredActivity.map((r, i) => [
          String(i + 1), r.timestamp, r.user, r.action, r.details
        ])
      );
    }
  };

  const count = tab === "login" ? filteredLogin.length : filteredActivity.length;

  return (
    <div className={`flex flex-col h-full ${bg} ${txt} overflow-hidden`}>

      {/* ── Header ── */}
      <div className={`shrink-0 flex items-center justify-between px-6 py-4 border-b ${isLight ? "border-slate-200" : "border-[#1e2433]"}`}>
        <div>
          <h1 className="font-bold text-base">Portal Logs</h1>
          <p className={`text-xs mt-0.5 ${txt2}`}>
            {loginLogs.length} login events &nbsp;·&nbsp; {auditLogs.length} activity entries
            &nbsp;·&nbsp; all users
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <input
            type="search"
            placeholder="Search logs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`w-44 text-xs px-3 py-1.5 rounded-lg border focus:outline-none ${inp}`}
          />

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={count === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: "#1a73e8" }}
            title={`Download current view as CSV (${count} rows)`}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
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
            <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${isLight ? "bg-slate-100 text-slate-500" : "bg-[#1a1e27] text-slate-400"}`}>
              {t.id === "login" ? filteredLogin.length : filteredActivity.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto">
        <div className={`border ${card} rounded-xl m-4 overflow-hidden`}>
          {tab === "login" ? (
            filteredLogin.length === 0
              ? <Empty msg={search ? "No matching login entries" : "No login history yet — entries appear after the first sign-in"} />
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
