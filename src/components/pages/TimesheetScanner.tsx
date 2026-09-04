/**
 * TimesheetScanner — Drop or paste one or more photos of handwritten timesheets.
 * Sends each image to /api/timesheet/scan (Gemini Vision) in parallel,
 * user verifies each result, then saves them to the portal.
 */
import React, { useState, useRef, useCallback } from "react";
import { Upload, ScanLine, Loader2, CheckCircle2, AlertCircle, X, RefreshCw, Save, FileStack } from "lucide-react";
import { bumpGeminiCounter } from "../../utils/geminiCounter";

interface TimesheetDay {
  dayOfWeek: string;
  date: string;
  clockIn: string;
  clockOut: string;
  totalHours: number | null;
}

interface NameMatch {
  matched: string | null;
  confidence: number;
  isNew: boolean;
}

interface TimesheetData {
  employeeName: string;
  weekStart: string;
  weekEnd: string;
  submittedOn: string;
  job: string;
  weeklyTotalHours: number | null;
  days: TimesheetDay[];
  employeeMatch?: NameMatch;
}

interface ScanItem {
  id: string;
  preview: string;
  status: "scanning" | "done" | "error";
  result: TimesheetData | null;
  error: string | null;
  saving: boolean;
  saved: boolean;
}

interface Props {
  isLight: boolean;
}

export const TimesheetScanner: React.FC<Props> = ({ isLight }) => {
  const [dragOver, setDragOver] = useState(false);
  const [items, setItems] = useState<ScanItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const card  = isLight ? "bg-white border-slate-200 text-slate-800"  : "bg-[#0d111a] border-[#1a2235] text-white";
  const muted = isLight ? "text-slate-500" : "text-[#888]";
  const rowBg = isLight ? "bg-slate-50 border-slate-200" : "bg-[#111623] border-[#1e2940]";
  const inp   = isLight
    ? "bg-white border-slate-300 text-slate-800 focus:border-[#7c3aed]"
    : "bg-[#0a0f1c] border-[#1a2235] text-white focus:border-[#7c3aed]";

  const scanFile = useCallback(async (file: File): Promise<{ result: TimesheetData | null; error: string | null }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        const mimeType = file.type || "image/jpeg";
        try {
          const resp = await fetch("/api/timesheet/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64, mimeType })
          });
          const text = await resp.text();
          let json: any = null;
          try { json = JSON.parse(text); } catch { json = null; }
          if (!resp.ok || !json || !json.ok) {
            resolve({ result: null, error: json?.error || json?.details || (resp.status === 413 ? "File too large (max 50MB)" : `Scan failed (${resp.status})`) });
          } else {
            bumpGeminiCounter("timesheet");
            resolve({ result: json.timesheet, error: null });
          }
        } catch (err: any) {
          resolve({ result: null, error: err?.message || "Network error" });
        }
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const getPreview = (file: File): Promise<string> =>
    new Promise((res) => {
      const r = new FileReader();
      r.onload = (e) => res(e.target?.result as string);
      r.readAsDataURL(file);
    });

  const processFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith("image/") || f.type === "application/pdf");
    if (imageFiles.length === 0) return;

    // Create placeholder items immediately
    const newItems: ScanItem[] = await Promise.all(
      imageFiles.map(async (file) => ({
        id: `ts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        preview: await getPreview(file),
        status: "scanning" as const,
        result: null,
        error: null,
        saving: false,
        saved: false,
      }))
    );

    setItems(prev => [...newItems, ...prev]);

    // Scan with limited concurrency (2 at a time) to avoid Gemini rate limits
    const CONCURRENCY = 2;
    const queue = imageFiles.map((file, i) => ({ file, i }));
    const runNext = async (): Promise<void> => {
      const entry = queue.shift();
      if (!entry) return;
      const { file, i } = entry;
      const { result, error } = await scanFile(file);
      setItems(prev =>
        prev.map(item =>
          item.id === newItems[i].id
            ? { ...item, status: error ? "error" : (result ? "done" : "error"), result, error: error || (!result ? "No data returned from scan" : undefined) }
            : item
        )
      );
      await runNext();
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, imageFiles.length) }, runNext));
  }, [scanFile]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  const updateResult = (id: string, updated: TimesheetData) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, result: updated } : item));
  };

  const updateDay = (id: string, dayIdx: number, field: keyof TimesheetDay, value: string | number | null) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id || !item.result) return item;
      const days = item.result.days.map((d, i) => i === dayIdx ? { ...d, [field]: value } : d);
      return { ...item, result: { ...item.result, days } };
    }));
  };

  const saveItem = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item?.result) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, saving: true } : i));
    try {
      const resp = await fetch("/api/timesheet/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.result)
      });
      setItems(prev => prev.map(i =>
        i.id === id ? { ...i, saving: false, saved: resp.ok, error: resp.ok ? null : "Save failed" } : i
      ));
    } catch (e: any) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, saving: false, error: e?.message } : i));
    }
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const clearAll = () => setItems([]);

  const scanningCount = items.filter(i => i.status === "scanning").length;
  const doneCount = items.filter(i => i.status === "done").length;
  const savedCount = items.filter(i => i.saved).length;

  return (
    <div className="space-y-4">

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200",
          "min-h-[160px] p-6 text-center select-none",
          dragOver
            ? "border-[#7c3aed] bg-[#7c3aed]/10"
            : isLight
              ? "border-slate-300 bg-slate-50 hover:border-[#7c3aed] hover:bg-[#7c3aed]/5"
              : "border-[#1a2235] bg-[#0d111a] hover:border-[#7c3aed] hover:bg-[#7c3aed]/5",
        ].join(" ")}
      >
        <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onFileChange} />

        <div className="w-12 h-12 rounded-2xl bg-[#7c3aed]/15 flex items-center justify-center">
          {scanningCount > 0
            ? <Loader2 className="w-6 h-6 text-[#7c3aed] animate-spin" />
            : <FileStack className="w-6 h-6 text-[#7c3aed]" />
          }
        </div>
        <div>
          <p className={`text-sm font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
            {scanningCount > 0 ? `Scanning ${scanningCount} timesheet${scanningCount > 1 ? "s" : ""}…` : "Drop timesheet photos here"}
          </p>
          <p className={`text-xs mt-1 ${muted}`}>
            {items.length > 0
              ? `${doneCount} ready · ${scanningCount} scanning · ${savedCount} saved — drop more to add`
              : "Multiple files supported — JPEG, PNG, HEIC"
            }
          </p>
        </div>
        <div className={`flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-full ${isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]"}`}>
          <Upload className="w-3 h-3" /> Powered by Gemini Vision AI
        </div>
      </div>

      {/* Clear all */}
      {items.length > 1 && (
        <div className="flex justify-end">
          <button onClick={clearAll} className={`text-[11px] flex items-center gap-1 ${muted} hover:opacity-70`}>
            <X className="w-3 h-3" /> Clear all
          </button>
        </div>
      )}

      {/* Result Cards */}
      {items.map((item) => (
        <div key={item.id} className={`rounded-xl border overflow-hidden ${card}`}>

          {/* Card header */}
          <div className={`px-4 py-2.5 border-b flex items-center justify-between ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#111623] border-[#1a2235]"}`}>
            <div className="flex items-center gap-2">
              {item.status === "scanning" && <Loader2 className="w-4 h-4 text-[#7c3aed] animate-spin" />}
              {item.status === "done" && !item.saved && <ScanLine className="w-4 h-4 text-[#7c3aed]" />}
              {item.saved && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {item.status === "error" && <AlertCircle className="w-4 h-4 text-red-400" />}
              <span className={`text-xs font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
                {item.status === "scanning" ? "Scanning…"
                  : item.status === "error" ? "Scan failed"
                  : item.saved ? `Saved — ${item.result?.employeeName || "Timesheet"}`
                  : item.result?.employeeName || "Timesheet"}
              </span>
              {item.result?.weekStart && item.result?.weekEnd && (
                <span className={`text-[11px] ${muted}`}>· {item.result.weekStart} – {item.result.weekEnd}</span>
              )}
            </div>
            <button onClick={() => removeItem(item.id)} className={`p-1 rounded opacity-40 hover:opacity-100 transition-opacity ${isLight ? "hover:bg-slate-200" : "hover:bg-white/10"}`}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Scanning placeholder */}
          {item.status === "scanning" && (
            <div className="flex items-center gap-3 p-4">
              <img src={item.preview} alt="" className="w-20 h-20 rounded object-cover opacity-40 shrink-0" />
              <p className={`text-xs ${muted}`}>Reading handwriting with AI…</p>
            </div>
          )}

          {/* Error */}
          {item.status === "error" && (
            <div className="flex items-center gap-3 p-4">
              <img src={item.preview} alt="" className="w-20 h-20 rounded object-cover shrink-0" />
              <p className="text-xs text-red-400">{item.error}</p>
            </div>
          )}

          {/* Result */}
          {item.status === "done" && item.result && (
            <div className="p-4 space-y-3">
              {/* Metadata row */}
              <div className="flex items-start gap-3">
                <img src={item.preview} alt="" className="w-20 h-20 rounded object-cover shrink-0" />
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {(["employeeName","job","weekStart","weekEnd","submittedOn"] as (keyof TimesheetData)[]).map(field => (
                    <label key={field} className="flex flex-col gap-0.5">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>
                        {field === "employeeName" ? "Employee" : field === "weekStart" ? "Week Start" : field === "weekEnd" ? "Week End" : field === "submittedOn" ? "Submitted" : "Job"}
                      </span>
                      <input
                        value={(item.result as any)[field] ?? ""}
                        onChange={e => updateResult(item.id, { ...item.result!, [field]: e.target.value })}
                        className={`px-2 py-1 rounded border text-xs ${inp} ${field === "employeeName" ? "font-bold" : ""}`}
                        disabled={item.saved}
                      />
                    </label>
                  ))}
                  <label className="flex flex-col gap-0.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>Weekly Hrs</span>
                    <input
                      type="number"
                      value={item.result.weeklyTotalHours ?? ""}
                      onChange={e => updateResult(item.id, { ...item.result!, weeklyTotalHours: e.target.value === "" ? null : Number(e.target.value) })}
                      className={`px-2 py-1 rounded border text-xs font-bold text-[#7c3aed] ${inp}`}
                      disabled={item.saved}
                    />
                  </label>
                </div>
              </div>

              {/* Employee match notice */}
              {item.result.employeeMatch && (
                item.result.employeeMatch.isNew ? (
                  <div className={`flex items-start gap-1.5 px-2.5 py-2 rounded text-[11px] leading-snug ${isLight ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-amber-950/30 border border-amber-800/40 text-amber-300"}`}>
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      <strong>Employee not in records</strong>
                      {item.result.employeeMatch.matched
                        ? ` — closest match: "${item.result.employeeMatch.matched}" (${Math.round(item.result.employeeMatch.confidence * 100)}% similar). Please verify or correct the employee name.`
                        : " — no similar employee found. Please verify the employee name is correct."}
                    </span>
                  </div>
                ) : (
                  <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] ${isLight ? "bg-green-50 border border-green-200 text-green-700" : "bg-green-950/30 border border-green-900/40 text-green-300"}`}>
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>Matched to known employee ({Math.round(item.result.employeeMatch.confidence * 100)}% confidence)</span>
                  </div>
                )
              )}

              {/* Days table */}
              <div className={`rounded-lg border overflow-hidden ${isLight ? "border-slate-200" : "border-[#1a2235]"}`}>
                <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[360px]">
                  <thead>
                    <tr className={`border-b ${isLight ? "bg-slate-100 border-slate-200 text-slate-600" : "bg-[#141414] border-[#1a2235] text-[#888]"}`}>
                      {["Day","Date","Clock In","Clock Out","Hrs"].map(h => (
                        <th key={h} className={`p-2 font-semibold text-left whitespace-nowrap ${h === "Hrs" ? "text-right" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? "divide-slate-200" : "divide-[#1a2235]"}`}>
                    {item.result.days.map((day, di) => (
                      <tr key={di} className={rowBg}>
                        <td className="p-2 font-semibold">{day.dayOfWeek}</td>
                        {(["date","clockIn","clockOut"] as (keyof TimesheetDay)[]).map(f => (
                          <td key={f} className="p-2">
                            <input
                              value={(day as any)[f] ?? ""}
                              onChange={e => updateDay(item.id, di, f, e.target.value)}
                              className={`px-1.5 py-0.5 w-20 rounded border text-xs ${inp}`}
                              disabled={item.saved}
                            />
                          </td>
                        ))}
                        <td className="p-2 text-right">
                          <input
                            type="number" step="0.5"
                            value={day.totalHours ?? ""}
                            onChange={e => updateDay(item.id, di, "totalHours", e.target.value === "" ? null : Number(e.target.value))}
                            className={`px-1.5 py-0.5 w-14 rounded border text-xs text-right font-bold text-[#7c3aed] ${inp}`}
                            disabled={item.saved}
                          />
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[#7c3aed]/10 font-bold text-[#7c3aed]">
                      <td colSpan={4} className="p-2 text-xs">Weekly Total</td>
                      <td className="p-2 text-right text-xs">
                        {item.result.weeklyTotalHours ?? item.result.days.reduce((s, d) => s + (d.totalHours ?? 0), 0)} hrs
                      </td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>

              {/* Actions */}
              {item.saved ? (
                <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-semibold ${isLight ? "bg-green-50 border border-green-200 text-green-800" : "bg-green-950/30 border border-green-900/40 text-green-300"}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved to portal
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    onClick={() => saveItem(item.id)}
                    disabled={item.saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-60 transition-colors"
                  >
                    {item.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {item.saving ? "Saving…" : "Save to Portal"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
