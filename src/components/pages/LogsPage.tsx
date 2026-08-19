import React, { useState, useEffect, useCallback } from "react";
import { useFinance } from "../../context/FinanceContext";
import { readLogsSheet, LOGS_SHEET_TITLE } from "../../services/logsSheetService";
import { getAccessToken } from "../../services/googleAuth";
import { ExternalLink, RefreshCw } from "lucide-react";

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
  if (/add|create|new/i.test(action))             return "#22c55e";
  if (/delet|remov/i.test(action))                return "#ef4444";
  if (/updat|edit|toggle|change/i.test(action))   return "#f59e0b";
  if (/pull|push|sync/i.test(action))             return "#3b82f6";
  if (/login|auth|sign/i.test(action))            return "#a78bfa";
  return "#94a3b8";
};

const Empty: React.FC<{ msg: string }> = ({ msg }) => (
  <div className="flex flex-col items-center justify-center py-20 opacity-40 gap-2 text-sm">
    <span className="text-3xl">🗂️</span>
    <span>{msg}</span>
  </div>
);

/* ── Login History table ─────────────────────────────── */
const LoginTable: React.FC<{ rows: string[][]; isLight: boolean }> = ({ rows, isLight }) => {
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
          {[...rows].reverse().map((r, i) => (
            <tr key={i} className={`border-b ${row} hover:opacity-80`}>
              <td className={`px-4 py-2.5 ${sub}`}>{i + 1}</td>
              <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11px]">{r[0] || "—"}</td>
              <td className="px-4 py-2.5 font-medium">{r[1] || "—"}</td>
              <td className="px-4 py-2.5">{r[2] || "—"}</td>
              <td className="px-4 py-2.5">{[r[3], r[4], r[5]].filter(Boolean).join(", ") || <span className={sub}>—</span>}</td>
              <td className={`px-4 py-2.5 font-mono ${sub}`}>{r[6] || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ── Activity Log table ──────────────────────────────── */
const ActivityTable: React.FC<{ rows: string[][]; isLight: boolean }> = ({ rows, isLight }) => {
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
          {[...rows].reverse().map((r, i) => (
            <tr key={i} className={`border-b ${row} hover:opacity-80`}>
              <td className={`px-4 py-2.5 ${sub}`}>{i + 1}</td>
              <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11px]">{r[0] || "—"}</td>
              <td className={`px-4 py-2.5 ${sub}`}>{r[1] || "—"}</td>
              <td className="px-4 py-2.5">{badge(r[2] || "—", actionColor(r[2] || ""))}</td>
              <td className={`px-4 py-2.5 ${sub}`}>{r[3] || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ── Main page ───────────────────────────────────────── */
export const LogsPage: React.FC = () => {
  const { theme, logsSheetId } = useFinance();
  const isLight = theme === "light";
  const [tab, setTab]           = useState<Tab>("login");
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loginRows, setLoginRows]       = useState<string[][]>([]);
  const [activityRows, setActivityRows] = useState<string[][]>([]);
  const [sheetUrl, setSheetUrl]         = useState<string>("");

  const bg   = isLight ? "bg-slate-100"  : "bg-[#0a0a0a]";
  const card = isLight ? "bg-white border-slate-200" : "bg-[#111318] border-[#1e2433]";
  const txt  = isLight ? "text-slate-800" : "text-slate-100";
  const txt2 = isLight ? "text-slate-500" : "text-slate-400";
  const inp  = isLight
    ? "bg-white border-slate-300 text-slate-800 placeholder-slate-400"
    : "bg-[#181c24] border-[#2a3140] text-white placeholder-slate-500";

  const loadSheet = useCallback(async () => {
    if (!logsSheetId) return;
    const token = getAccessToken();
    if (!token) { setError("Google token not available — sign in to view logs."); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await readLogsSheet(token, logsSheetId);
      setLoginRows(data.loginRows);
      setActivityRows(data.activityRows);
      setSheetUrl(data.sheetUrl);
    } catch (e: any) {
      setError(`Could not load logs: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [logsSheetId]);

  useEffect(() => { loadSheet(); }, [loadSheet]);

  const q = search.toLowerCase();
  const filteredLogin = loginRows.filter(r =>
    !q || r.some(v => v?.toLowerCase().includes(q))
  );
  const filteredActivity = activityRows.filter(r =>
    !q || r.some(v => v?.toLowerCase().includes(q))
  );
  const count = tab === "login" ? filteredLogin.length : filteredActivity.length;

  return (
    <div className={`flex flex-col h-full ${bg} ${txt} overflow-hidden`}>

      {/* ── Header ── */}
      <div className={`shrink-0 flex items-center justify-between px-6 py-4 border-b ${isLight ? "border-slate-200" : "border-[#1e2433]"}`}>
        <div>
          <h1 className="font-bold text-base">Portal Logs</h1>
          <p className={`text-xs mt-0.5 ${txt2}`}>
            {logsSheetId
              ? <>Stored permanently in Google Drive · {loginRows.length} logins · {activityRows.length} activities</>
              : "Logs sheet will be created on your next sign-in"}
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

          {/* Refresh */}
          <button
            onClick={loadSheet}
            disabled={loading || !logsSheetId}
            className={`p-1.5 rounded-lg border ${isLight ? "border-slate-300 hover:bg-slate-50" : "border-[#2a3140] hover:bg-[#1a1e27]"} disabled:opacity-40 transition-colors`}
            title="Refresh from Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""} ${txt2}`} />
          </button>

          {/* Open in Google Sheets */}
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "#1a6b36" }}
              title={LOGS_SHEET_TITLE}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Sheet
            </a>
          )}
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

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-4 mt-4 px-4 py-3 rounded-lg text-xs text-red-400 bg-red-950/30 border border-red-800/40">
            ⚠️ {error}
          </div>
        )}

        {!logsSheetId && !error && (
          <div className="mx-4 mt-4 px-4 py-3 rounded-lg text-xs bg-amber-950/30 border border-amber-800/40 text-amber-400">
            🔐 Sign out and sign back in — the logs Google Sheet will be created automatically on your next login.
          </div>
        )}

        <div className={`border ${card} rounded-xl m-4 overflow-hidden`}>
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-xs opacity-50">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading from Google Sheets…
            </div>
          ) : tab === "login" ? (
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
