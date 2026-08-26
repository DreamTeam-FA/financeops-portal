import React, { useState, useEffect, useCallback } from "react";
import { useFinance } from "../../context/FinanceContext";
import { RefreshCw, Download } from "lucide-react";
import { getAccessToken } from "../../services/googleAuth";
import { LOGS_SHEET_TITLE, SHARED_LOGS_SHEET_ID, appendLogRow, readLogsSheet } from "../../services/logsSheetService";

// Target users whose individual log sheets we want to locate in their Drives
const TARGET_USERS = ["monica@marktimm.com", "finances@marktimm.com"];

/** Search Drive for ALL sheets with the portal logs title (may be > 1 if each user created their own) */
async function findAllIndividualSheets(token: string): Promise<{ id: string; name: string }[]> {
  const q = encodeURIComponent(
    `name='${LOGS_SHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=50&includeItemsFromAllDrives=true&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return (data.files || []) as { id: string; name: string }[];
}

/** Search Drive for the log sheet owned by a specific user email.
 *  Only works if the file is visible to the requesting user (shared/org-shared).
 *  Returns the file id if found, or null. */
async function findSheetByOwner(ownerEmail: string, token: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${LOGS_SHEET_TITLE}' and '${ownerEmail}' in owners and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,owners)&pageSize=10&includeItemsFromAllDrives=true&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  const files = (data.files || []) as { id: string; name: string }[];
  return files[0]?.id ?? null;
}

/** Make a Drive copy of a file into the current user's My Drive.
 *  Returns the new file's id, or null if the copy failed. */
async function copyFileToDrive(fileId: string, copyName: string, token: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: copyName }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.id ?? null;
}

/** For each target user, attempt to locate their log sheet and copy it to this user's drive.
 *  Returns list of { ownerEmail, copiedId } for successful copies. */
async function locateAndCopyUserSheets(
  token: string,
  onProgress: (msg: string) => void
): Promise<{ ownerEmail: string; copiedId: string }[]> {
  const copied: { ownerEmail: string; copiedId: string }[] = [];
  for (const email of TARGET_USERS) {
    onProgress(`Searching for ${email}'s log sheet…`);
    try {
      const fileId = await findSheetByOwner(email, token);
      if (!fileId) {
        onProgress(`  ↳ ${email}: sheet not found or not shared with you`);
        continue;
      }
      onProgress(`  ↳ ${email}: sheet found — copying to your drive…`);
      const copyName = `[Copy] ${LOGS_SHEET_TITLE} — ${email}`;
      const copiedId = await copyFileToDrive(fileId, copyName, token);
      if (copiedId) {
        onProgress(`  ↳ ${email}: copy created ✓`);
        copied.push({ ownerEmail: email, copiedId });
      } else {
        onProgress(`  ↳ ${email}: copy failed (restricted)`);
      }
    } catch {
      onProgress(`  ↳ ${email}: error during search`);
    }
  }
  return copied;
}

/** Copy ALL entries (no time filter) from an individual sheet into the central sheet */
async function migrateSheetIntoCenter(sourceId: string, token: string): Promise<{ login: number; activity: number }> {
  const data = await readLogsSheet(token, sourceId);
  let login = 0, activity = 0;

  for (const r of data.loginRows) {
    if (!r[0]) continue; // skip rows with no timestamp
    await appendLogRow(token, SHARED_LOGS_SHEET_ID, "Login History", r);
    login++;
  }
  for (const r of data.activityRows) {
    if (!r[0]) continue;
    await appendLogRow(token, SHARED_LOGS_SHEET_ID, "Activity Log", r);
    activity++;
  }
  return { login, activity };
}

/** Pull login + activity entries from the server's stored JSON and write to the central sheet.
 *  This captures logs from all users who've ever logged in (monica@, finances@, accounting@, etc.)
 *  even if their individual Drive sheets are inaccessible. */
async function migrateServerLogsToSheet(token: string): Promise<{ login: number; activity: number }> {
  const [loginRes, actRes] = await Promise.all([
    fetch("/api/login-log"),
    fetch("/api/activity-log"),
  ]);
  const loginData: any[] = await loginRes.json();
  const actData: any[]   = await actRes.json();
  let login = 0, activity = 0;

  for (const entry of (Array.isArray(loginData) ? loginData : [])) {
    const ts  = entry.timestamp || "";
    const row = [ts, entry.user || entry.email || "—", entry.device || "—",
                 entry.city || "—", entry.region || "", entry.country || "—", entry.ip || "—"];
    if (!ts) continue;
    await appendLogRow(token, SHARED_LOGS_SHEET_ID, "Login History", row);
    login++;
  }
  for (const entry of (Array.isArray(actData) ? actData : [])) {
    const ts  = entry.timestamp || "";
    const row = [ts, entry.user || entry.userEmail || "—", entry.action || "—", entry.details || "—"];
    if (!ts) continue;
    await appendLogRow(token, SHARED_LOGS_SHEET_ID, "Activity Log", row);
    activity++;
  }
  return { login, activity };
}

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
const LoginTable: React.FC<{ rows: any[]; isLight: boolean }> = ({ rows, isLight }) => {
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
            <tr key={r.id || i} className={`border-b ${row} hover:opacity-80`}>
              <td className={`px-4 py-2.5 ${sub}`}>{i + 1}</td>
              <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11px]">{r.timestamp || "—"}</td>
              <td className="px-4 py-2.5 font-medium">{r.user || "—"}</td>
              <td className="px-4 py-2.5">{r.device || "—"}</td>
              <td className="px-4 py-2.5">{[r.city, r.region, r.country].filter(Boolean).join(", ") || r.location || <span className={sub}>—</span>}</td>
              <td className={`px-4 py-2.5 font-mono ${sub}`}>{r.ip || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ── Activity Log table ──────────────────────────────── */
const ActivityTable: React.FC<{ rows: any[]; isLight: boolean }> = ({ rows, isLight }) => {
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
            <tr key={r.id || i} className={`border-b ${row} hover:opacity-80`}>
              <td className={`px-4 py-2.5 ${sub}`}>{i + 1}</td>
              <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11px]">{r.timestamp || "—"}</td>
              <td className={`px-4 py-2.5 ${sub}`}>{r.user || r.userEmail || "—"}</td>
              <td className="px-4 py-2.5">{badge(r.action || "—", actionColor(r.action || ""))}</td>
              <td className={`px-4 py-2.5 ${sub}`}>{r.details || r.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ── Main page ───────────────────────────────────────── */
export const LogsPage: React.FC = () => {
  const { theme } = useFinance();
  const isLight = theme === "light";
  const [tab, setTab]           = useState<Tab>("login");
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loginRows, setLoginRows]       = useState<any[]>([]);
  const [activityRows, setActivityRows] = useState<any[]>([]);
  const [migrating, setMigrating]     = useState(false);
  const [migrateMsg, setMigrateMsg]   = useState<string | null>(null);
  const [migrateLog, setMigrateLog]   = useState<string[]>([]);   // live step-by-step progress

  const bg   = isLight ? "bg-slate-100"  : "bg-[#070b12]";
  const card = isLight ? "bg-white border-slate-200" : "bg-[#111318] border-[#1e2433]";
  const txt  = isLight ? "text-slate-800" : "text-slate-100";
  const txt2 = isLight ? "text-slate-500" : "text-slate-400";
  const inp  = isLight
    ? "bg-white border-slate-300 text-slate-800 placeholder-slate-400"
    : "bg-[#181c24] border-[#2a3140] text-white placeholder-slate-500";

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loginRes, actRes] = await Promise.all([
        fetch("/api/login-log"),
        fetch("/api/activity-log"),
      ]);
      const loginData = await loginRes.json();
      const actData = await actRes.json();
      if (Array.isArray(loginData)) setLoginRows(loginData);
      if (Array.isArray(actData)) setActivityRows(actData);
    } catch (e: any) {
      setError(`Could not load logs: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  /** One-time migration: pull ALL log entries from individual Drive sheets AND server JSON into central sheet */
  const migrateIndividualLogs = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError("Sign in to Google first."); return; }
    setMigrating(true);
    setMigrateMsg(null);
    setMigrateLog([]);
    setError(null);

    const log = (msg: string) => setMigrateLog(prev => [...prev, msg]);

    try {
      let totalLogin = 0, totalActivity = 0;
      let sheetCount = 0;

      // ── Pass 1: general Drive search (sheets visible to current user) ──────
      log("Searching Drive for individual log sheets…");
      const allSheets = await findAllIndividualSheets(token);
      const individualSheets = allSheets.filter(s => s.id !== SHARED_LOGS_SHEET_ID);
      log(`  ↳ Found ${individualSheets.length} individual sheet(s) via general search`);
      for (const sheet of individualSheets) {
        try {
          log(`  ↳ Migrating: ${sheet.name} (${sheet.id})`);
          const { login, activity } = await migrateSheetIntoCenter(sheet.id, token);
          totalLogin    += login;
          totalActivity += activity;
          sheetCount++;
        } catch { log(`  ↳ Skipped (inaccessible)`); }
      }

      // ── Pass 2: search by owner email for target users ────────────────────
      log("Searching each target user's Drive by owner…");
      const copied = await locateAndCopyUserSheets(token, log);
      for (const { ownerEmail, copiedId } of copied) {
        try {
          log(`  ↳ Migrating copy from ${ownerEmail}…`);
          const { login, activity } = await migrateSheetIntoCenter(copiedId, token);
          totalLogin    += login;
          totalActivity += activity;
          sheetCount++;
          log(`  ↳ Done: +${login} login, +${activity} activity`);
        } catch (e: any) { log(`  ↳ Read error on copy: ${e.message}`); }
      }

      // ── Pass 3: server stored JSON logs (captures all users who logged in) ──
      log("Pulling server stored logs (all users)…");
      try {
        const { login: sLogin, activity: sAct } = await migrateServerLogsToSheet(token);
        totalLogin    += sLogin;
        totalActivity += sAct;
        log(`  ↳ Server JSON: +${sLogin} login, +${sAct} activity`);
      } catch { log("  ↳ Server logs unavailable"); }

      const parts: string[] = [];
      if (sheetCount > 0) parts.push(`${sheetCount} Drive sheet(s)`);
      parts.push("server log store");

      setMigrateMsg(
        `✓ Migration complete: copied ${totalLogin} login + ${totalActivity} activity entries from ${parts.join(" + ")} into central log.`
      );
      // Reload to show updated central log
      await loadLogs();
    } catch (e: any) {
      setError(`Migration failed: ${e.message}`);
    } finally {
      setMigrating(false);
    }
  }, [loadLogs]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const q = search.toLowerCase();
  const filteredLogin = loginRows.filter(r =>
    !q || Object.values(r).some(v => String(v || "").toLowerCase().includes(q))
  );
  const filteredActivity = activityRows.filter(r =>
    !q || Object.values(r).some(v => String(v || "").toLowerCase().includes(q))
  );

  return (
    <div className={`flex flex-col h-full ${bg} ${txt} overflow-hidden`}>

      {/* ── Header ── */}
      <div className={`shrink-0 flex items-center justify-between px-6 py-4 border-b ${isLight ? "border-slate-200" : "border-[#1e2433]"}`}>
        <div>
          <h1 className="font-bold text-base">Portal Logs</h1>
          <p className={`text-xs mt-0.5 ${txt2}`}>
            Centralized activity for all users · {loginRows.length} logins · {activityRows.length} activities
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Migrate individual → central (one-time) */}
          <button
            onClick={migrateIndividualLogs}
            disabled={migrating || loading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-40 ${
              isLight ? "border-[#1a73e8] text-[#1a73e8] hover:bg-blue-50" : "border-[#2a4a8a] text-[#5b8fef] hover:bg-[#0d1a30]"
            }`}
            title="Find log sheets for monica@ and finances@, copy to your drive, then migrate all entries into the central sheet"
          >
            {migrating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {migrating ? "Migrating…" : "Compile Individual Logs"}
          </button>

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
            onClick={loadLogs}
            disabled={loading}
            className={`p-1.5 rounded-lg border ${isLight ? "border-slate-300 hover:bg-slate-50" : "border-[#2a3140] hover:bg-[#1a1e27]"} disabled:opacity-40 transition-colors`}
            title="Refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""} ${txt2}`} />
          </button>
        </div>
      </div>

      {/* Migration result banner */}
      {/* Live migration progress (while running) */}
      {migrating && migrateLog.length > 0 && (
        <div className={`shrink-0 mx-4 mt-3 px-4 py-2.5 rounded-lg text-[11px] font-mono ${
          isLight ? "bg-slate-100 border border-slate-300 text-slate-600" : "bg-[#0d1117] border border-[#2a3140] text-slate-400"
        }`}>
          {migrateLog.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          <div className="mt-1 animate-pulse opacity-60">▌</div>
        </div>
      )}

      {/* Final result banner */}
      {migrateMsg && !migrating && (
        <div className={`shrink-0 mx-4 mt-3 px-4 py-2.5 rounded-lg text-xs flex flex-col gap-1.5 ${
          isLight ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-emerald-950/30 border border-emerald-800/40 text-emerald-300"
        }`}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{migrateMsg}</span>
            <button onClick={() => { setMigrateMsg(null); setMigrateLog([]); }} className="opacity-60 hover:opacity-100 shrink-0">✕</button>
          </div>
          {migrateLog.length > 0 && (
            <details className="text-[10px] font-mono opacity-70">
              <summary className="cursor-pointer">Show step log</summary>
              <div className="mt-1 space-y-0.5">
                {migrateLog.map((line, i) => <div key={i}>{line}</div>)}
              </div>
            </details>
          )}
        </div>
      )}

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

        <div className={`border ${card} rounded-xl m-4 overflow-hidden`}>
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-xs opacity-50">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading logs…
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
