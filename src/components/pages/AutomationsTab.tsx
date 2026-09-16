/**
 * AutomationsTab — rendered inside WorkspacePage when the "Automations" tab is active.
 *
 * Features:
 *  - Script cards: trigger button + description per automation
 *  - Live SSE log panel (streams from /stream/{job_id})
 *  - Continue button when a checkpoint fires (job status = waiting_input)
 *  - Cookie upload form (uploads JSON file to /cookies/upload/{profile})
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Play, Square, RefreshCw, ChevronRight, Upload,
  Terminal, Wifi, WifiOff, AlertCircle, CheckCircle2, Clock,
} from "lucide-react";

const RUNNER_BASE = import.meta.env.VITE_AUTOMATION_RUNNER_URL || "http://localhost:8001";

// ---------------------------------------------------------------------------
// Script registry (must match server.py SCRIPT_MODULES keys)
// ---------------------------------------------------------------------------

interface ScriptDef {
  key: string;
  label: string;
  description: string;
  profile: string;   // cookie profile name
  color: string;
}

const SCRIPTS: ScriptDef[] = [
  {
    key: "rubys_toast_recon",
    label: "Ruby's Toast Recon",
    description: "Downloads Toast Payouts CSV for previous month, cleans columns, pastes into Google Sheet.",
    profile: "toasttab",
    color: "#e85d04",
  },
  {
    key: "rubys_fta",
    label: "Ruby's FTA Report",
    description: "Scrapes Toast Admin for Monday orders filtered by $12.99 discount, duplicates template tab, pastes data.",
    profile: "toasttab",
    color: "#d62828",
  },
  {
    key: "qbo_report",
    label: "QBO Report",
    description: "Downloads Excel from QuickBooks Online, formats it (delete col F, autofit, add filter).",
    profile: "quickbooks",
    color: "#2d6a4f",
  },
  {
    key: "cpro_report",
    label: "CPRO Weekly/Monthly Report",
    description: "Unified CPRO report: Amazon Seller Central, Ads, FBA Inventory, WooCommerce → Google Sheets.",
    profile: "amazon",
    color: "#1a73e8",
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JobStatus = "pending" | "running" | "waiting_input" | "completed" | "failed" | "cancelled" | null;

interface JobState {
  jobId: string;
  scriptKey: string;
  status: JobStatus;
  logs: string[];
  inputPrompt: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AutomationsTabProps {
  isLight: boolean;
}

export const AutomationsTab: React.FC<AutomationsTabProps> = ({ isLight }) => {
  const [activeJob, setActiveJob] = useState<JobState | null>(null);
  const [continueInput, setContinueInput] = useState("y");
  const [runnerOnline, setRunnerOnline] = useState<boolean | null>(null);
  const [cookieProfile, setCookieProfile] = useState("toasttab");
  const [cookieFile, setCookieFile] = useState<File | null>(null);
  const [cookieStatus, setCookieStatus] = useState<string>("");
  const logRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // ── Ping runner health ────────────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${RUNNER_BASE}/`, { signal: AbortSignal.timeout(4000) });
        setRunnerOnline(r.ok);
      } catch {
        setRunnerOnline(false);
      }
    };
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Auto-scroll logs ──────────────────────────────────────────────────────
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [activeJob?.logs]);

  // ── SSE stream ────────────────────────────────────────────────────────────
  const startStream = useCallback((jobId: string, scriptKey: string) => {
    if (esRef.current) esRef.current.close();

    setActiveJob({ jobId, scriptKey, status: "pending", logs: [], inputPrompt: null });

    const es = new EventSource(`${RUNNER_BASE}/stream/${jobId}`);
    esRef.current = es;

    es.onmessage = (ev) => {
      const line: string = ev.data;

      if (line === "[STREAM_END]") {
        es.close();
        esRef.current = null;
        // Final status fetch
        fetch(`${RUNNER_BASE}/status/${jobId}`)
          .then((r) => r.json())
          .then((data) => {
            setActiveJob((prev) =>
              prev ? { ...prev, status: data.status, inputPrompt: null } : prev
            );
          })
          .catch(() => {});
        return;
      }

      setActiveJob((prev) => {
        if (!prev) return prev;
        const inputPrompt = line.startsWith("[WAITING]")
          ? line.replace("[WAITING]", "").trim()
          : prev.inputPrompt?.startsWith("[WAITING]")
          ? null
          : prev.inputPrompt;

        const status: JobStatus = line.startsWith("[WAITING]")
          ? "waiting_input"
          : line.startsWith("[DONE]")
          ? "completed"
          : line.startsWith("[ERROR]")
          ? "failed"
          : prev.status === "waiting_input" && line.startsWith("[CONTINUE]")
          ? "running"
          : prev.status;

        return {
          ...prev,
          logs: [...prev.logs, line],
          inputPrompt,
          status,
        };
      });
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  // ── Trigger script ────────────────────────────────────────────────────────
  const handleRun = async (script: ScriptDef) => {
    try {
      const r = await fetch(`${RUNNER_BASE}/run/${script.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params: {} }),
      });
      if (!r.ok) throw new Error(await r.text());
      const { job_id } = await r.json();
      startStream(job_id, script.key);
    } catch (err: any) {
      setActiveJob({
        jobId: "",
        scriptKey: script.key,
        status: "failed",
        logs: [`[ERROR] Could not start: ${err.message}`],
        inputPrompt: null,
      });
    }
  };

  // ── Continue / checkpoint ─────────────────────────────────────────────────
  const handleContinue = async () => {
    if (!activeJob?.jobId) return;
    await fetch(`${RUNNER_BASE}/continue/${activeJob.jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: continueInput }),
    });
    setContinueInput("y");
  };

  // ── Cookie upload ─────────────────────────────────────────────────────────
  const handleCookieUpload = async () => {
    if (!cookieFile) return;
    setCookieStatus("Uploading…");
    try {
      const fd = new FormData();
      fd.append("file", cookieFile);
      const r = await fetch(`${RUNNER_BASE}/cookies/upload/${cookieProfile}`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setCookieStatus(`Saved ${data.count} cookies for "${cookieProfile}"`);
      setCookieFile(null);
    } catch (err: any) {
      setCookieStatus(`Error: ${err.message}`);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeScript = SCRIPTS.find((s) => s.key === activeJob?.scriptKey);
  const isRunning = activeJob?.status === "running" || activeJob?.status === "pending";
  const isWaiting = activeJob?.status === "waiting_input";

  const statusColor = (s: JobStatus) => {
    if (s === "completed") return isLight ? "text-emerald-600" : "text-emerald-400";
    if (s === "failed")    return isLight ? "text-red-500"     : "text-red-400";
    if (s === "waiting_input") return isLight ? "text-amber-600" : "text-amber-400";
    if (s === "running" || s === "pending") return isLight ? "text-blue-600" : "text-blue-400";
    return isLight ? "text-slate-400" : "text-[#666]";
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Runner status banner */}
      <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs font-semibold ${
        runnerOnline === null
          ? isLight ? "bg-slate-50 border-slate-200 text-slate-400" : "bg-[#0d111a] border-[#1a2235] text-[#666]"
          : runnerOnline
          ? isLight ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-emerald-950/30 border-emerald-800/40 text-emerald-400"
          : isLight ? "bg-red-50 border-red-200 text-red-600" : "bg-red-950/30 border-red-800/40 text-red-400"
      }`}>
        {runnerOnline === null ? <Wifi className="w-3.5 h-3.5 animate-pulse" /> :
         runnerOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
        {runnerOnline === null ? "Checking automation runner…" :
         runnerOnline ? `Runner online — ${RUNNER_BASE}` :
         `Runner offline — deploy to Render first (${RUNNER_BASE})`}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">

        {/* ── Script cards (left 2 cols) ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-2">
          <p className={`text-[11px] font-bold uppercase tracking-widest mb-2 ${isLight ? "text-slate-400" : "text-[#555]"}`}>
            Scripts
          </p>
          {SCRIPTS.map((script) => {
            const isActive = activeJob?.scriptKey === script.key;
            return (
              <div
                key={script.key}
                className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border transition-all ${
                  isActive
                    ? isLight
                      ? "bg-blue-50 border-blue-300"
                      : "bg-blue-950/20 border-blue-700/40"
                    : isLight
                    ? "bg-white border-slate-200 hover:border-slate-300"
                    : "bg-[#0d111a] border-[#1a2235] hover:border-[#2a2a2a]"
                }`}
              >
                <div
                  className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-white mt-0.5"
                  style={{ backgroundColor: script.color }}
                >
                  <Terminal className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                    {script.label}
                  </div>
                  <div className={`text-[11px] mt-0.5 leading-snug ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                    {script.description}
                  </div>
                  <button
                    onClick={() => handleRun(script)}
                    disabled={!!isRunning}
                    className={`mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      isRunning
                        ? isLight ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-[#1a1a1a] text-[#555] cursor-not-allowed"
                        : "bg-[#1a73e8] text-white hover:bg-[#1557b0]"
                    }`}
                  >
                    <Play className="w-3 h-3" />
                    Run
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Log panel (right 3 cols) ───────────────────────────────── */}
        <div className={`lg:col-span-3 rounded-xl border overflow-hidden ${
          isLight ? "bg-white border-slate-200" : "bg-[#080c14] border-[#1a2235]"
        }`}>

          {/* Log header */}
          <div className={`flex items-center justify-between px-4 py-2.5 border-b text-xs ${
            isLight ? "bg-slate-50 border-slate-200" : "bg-[#0d111a] border-[#1a2235]"
          }`}>
            <div className="flex items-center gap-2">
              <Terminal className={`w-3.5 h-3.5 ${isLight ? "text-slate-400" : "text-[#555]"}`} />
              <span className={`font-bold ${isLight ? "text-slate-700" : "text-[#aaa]"}`}>
                {activeJob ? `${activeScript?.label ?? activeJob.scriptKey} — ${activeJob.jobId}` : "Live Log"}
              </span>
            </div>
            {activeJob && (
              <div className={`flex items-center gap-1.5 font-semibold ${statusColor(activeJob.status)}`}>
                {activeJob.status === "running" || activeJob.status === "pending" ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : activeJob.status === "completed" ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : activeJob.status === "failed" ? (
                  <AlertCircle className="w-3 h-3" />
                ) : activeJob.status === "waiting_input" ? (
                  <Clock className="w-3 h-3" />
                ) : null}
                {activeJob.status?.replace("_", " ")}
              </div>
            )}
          </div>

          {/* Log body */}
          <div
            ref={logRef}
            className="h-64 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed space-y-0.5"
          >
            {!activeJob ? (
              <div className={`flex items-center justify-center h-full ${isLight ? "text-slate-400" : "text-[#444]"}`}>
                Select a script above and click Run.
              </div>
            ) : activeJob.logs.length === 0 ? (
              <div className={`${isLight ? "text-slate-400" : "text-[#444]"}`}>Starting…</div>
            ) : (
              activeJob.logs.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("[ERROR]") ? "text-red-400" :
                    line.startsWith("[DONE]")  ? "text-emerald-400" :
                    line.startsWith("[WAITING]") ? "text-amber-400" :
                    line.startsWith("[CONTINUE]") ? "text-blue-400" :
                    line.startsWith("[START]") ? (isLight ? "text-slate-500" : "text-[#666]") :
                    isLight ? "text-slate-700" : "text-[#ccc]"
                  }
                >
                  {line}
                </div>
              ))
            )}
          </div>

          {/* Checkpoint / Continue bar */}
          {isWaiting && activeJob && (
            <div className={`border-t px-4 py-3 space-y-2 ${
              isLight ? "bg-amber-50 border-amber-200" : "bg-amber-950/20 border-amber-800/40"
            }`}>
              <div className={`text-[11px] font-semibold flex items-center gap-1.5 ${isLight ? "text-amber-700" : "text-amber-400"}`}>
                <Clock className="w-3.5 h-3.5" />
                Waiting for input: {activeJob.inputPrompt}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={continueInput}
                  onChange={(e) => setContinueInput(e.target.value)}
                  placeholder='Type response (default "y")'
                  className={`flex-1 text-xs px-3 py-1.5 rounded-lg border focus:outline-none focus:border-[#1a73e8] ${
                    isLight
                      ? "bg-white border-amber-300 text-slate-900"
                      : "bg-[#0d111a] border-amber-800/40 text-white"
                  }`}
                  onKeyDown={(e) => { if (e.key === "Enter") handleContinue(); }}
                />
                <button
                  onClick={handleContinue}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  Continue
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Cookie Upload panel ─────────────────────────────────────────── */}
      <div className={`rounded-xl border ${isLight ? "bg-white border-slate-200" : "bg-[#0d111a] border-[#1a2235]"} overflow-hidden`}>
        <div className={`px-4 py-2.5 border-b text-xs font-bold ${
          isLight ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-[#0d0f17] border-[#1a2235] text-[#aaa]"
        }`}>
          Cookie Sync — Upload browser cookies to server
        </div>
        <div className="px-4 py-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              Profile
            </label>
            <select
              value={cookieProfile}
              onChange={(e) => setCookieProfile(e.target.value)}
              className={`text-xs px-3 py-1.5 rounded-lg border focus:outline-none ${
                isLight
                  ? "bg-slate-50 border-slate-300 text-slate-800"
                  : "bg-[#0d111a] border-[#333] text-white"
              }`}
            >
              <option value="toasttab">toasttab</option>
              <option value="quickbooks">quickbooks</option>
              <option value="amazon">amazon</option>
              <option value="google">google</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>
              Cookies JSON file
            </label>
            <input
              type="file"
              accept=".json"
              onChange={(e) => setCookieFile(e.target.files?.[0] ?? null)}
              className={`text-xs file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:text-xs file:font-semibold cursor-pointer ${
                isLight
                  ? "file:bg-slate-200 file:text-slate-700 text-slate-700"
                  : "file:bg-[#222] file:text-[#ccc] text-[#aaa]"
              }`}
            />
          </div>

          <button
            onClick={handleCookieUpload}
            disabled={!cookieFile}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              cookieFile
                ? "bg-[#1a73e8] text-white hover:bg-[#1557b0]"
                : isLight ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-[#1a1a1a] text-[#555] cursor-not-allowed"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload
          </button>

          {cookieStatus && (
            <span className={`text-[11px] font-semibold ${
              cookieStatus.startsWith("Error")
                ? isLight ? "text-red-500" : "text-red-400"
                : isLight ? "text-emerald-600" : "text-emerald-400"
            }`}>
              {cookieStatus}
            </span>
          )}
        </div>

        <div className={`px-4 pb-3 text-[11px] ${isLight ? "text-slate-400" : "text-[#555]"}`}>
          Export cookies from Brave using EditThisCookie or Cookie-Editor extension → Save as JSON → upload here.
          The server stores them in Google Drive and injects them before each script run.
        </div>
      </div>
    </div>
  );
};
