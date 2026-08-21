/**
 * TimesheetScanner — Drop or paste a photo of a handwritten timesheet.
 * Sends the image to /api/timesheet/scan (Gemini Vision) and displays
 * the structured result as an editable table.
 */
import React, { useState, useRef, useCallback } from "react";
import { Upload, ScanLine, Loader2, CheckCircle2, AlertCircle, X, RefreshCw, Save } from "lucide-react";

interface TimesheetDay {
  dayOfWeek: string;
  date: string;
  clockIn: string;
  clockOut: string;
  totalHours: number | null;
}

interface TimesheetData {
  employeeName: string;
  weekStart: string;
  weekEnd: string;
  submittedOn: string;
  job: string;
  weeklyTotalHours: number | null;
  days: TimesheetDay[];
}

interface Props {
  isLight: boolean;
}

export const TimesheetScanner: React.FC<Props> = ({ isLight }) => {
  const [dragOver, setDragOver] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<TimesheetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const card   = isLight ? "bg-white border-slate-200 text-slate-800"    : "bg-[#0d111a] border-[#1a2235] text-white";
  const muted  = isLight ? "text-slate-500"  : "text-[#888]";
  const rowBg  = isLight ? "bg-slate-50 border-slate-200" : "bg-[#111623] border-[#1e2940]";
  const inp    = isLight
    ? "bg-white border-slate-300 text-slate-800 focus:border-[#7c3aed]"
    : "bg-[#0a0f1c] border-[#1a2235] text-white focus:border-[#7c3aed]";

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please drop an image file (JPEG, PNG, HEIC, etc.)");
      return;
    }

    setError(null);
    setResult(null);

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Convert to base64 for API
    const b64Reader = new FileReader();
    b64Reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";

      setScanning(true);
      try {
        const resp = await fetch("/api/timesheet/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType })
        });
        const json = await resp.json();
        if (!resp.ok || !json.ok) {
          setError(json.error || "Scan failed. Please try again.");
        } else {
          setResult(json.timesheet);
        }
      } catch (err: any) {
        setError(err?.message || "Network error — check server connection.");
      } finally {
        setScanning(false);
      }
    };
    b64Reader.readAsDataURL(file);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const updateDay = (i: number, field: keyof TimesheetDay, value: string | number | null) => {
    if (!result) return;
    const days = result.days.map((d, idx) => idx === i ? { ...d, [field]: value } : d);
    setResult({ ...result, days });
  };

  const updateField = (field: keyof TimesheetData, value: string | number | null) => {
    if (!result) return;
    setResult({ ...result, [field]: value });
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setImagePreview(null);
    setScanning(false);
    setSaved(false);
  };

  const saveTimesheet = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const resp = await fetch("/api/timesheet/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result)
      });
      if (resp.ok) {
        setSaved(true);
      } else {
        const j = await resp.json();
        setError(j.error || "Save failed");
      }
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* Drop Zone */}
      {!result && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !scanning && inputRef.current?.click()}
          className={[
            "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200",
            "min-h-[220px] p-8 text-center select-none",
            dragOver
              ? "border-[#7c3aed] bg-[#7c3aed]/10"
              : isLight
                ? "border-slate-300 bg-slate-50 hover:border-[#7c3aed] hover:bg-[#7c3aed]/5"
                : "border-[#1a2235] bg-[#0d111a] hover:border-[#7c3aed] hover:bg-[#7c3aed]/5",
          ].join(" ")}
        >
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

          {scanning ? (
            <>
              {imagePreview && (
                <img src={imagePreview} alt="Timesheet preview" className="max-h-32 rounded-lg opacity-50 mb-1 object-contain" />
              )}
              <Loader2 className="w-8 h-8 text-[#7c3aed] animate-spin" />
              <p className={`text-sm font-semibold ${muted}`}>Reading handwriting with AI…</p>
              <p className={`text-xs ${muted}`}>Extracting employee, dates, clock times & hours</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/15 flex items-center justify-center">
                <ScanLine className="w-7 h-7 text-[#7c3aed]" />
              </div>
              <div>
                <p className={`text-sm font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
                  Drop a timesheet photo here
                </p>
                <p className={`text-xs mt-1 ${muted}`}>
                  Or click to browse — JPEG, PNG, HEIC accepted
                </p>
              </div>
              <div className={`flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-full ${isLight ? "bg-slate-200 text-slate-600" : "bg-[#1a2235] text-[#888]"}`}>
                <Upload className="w-3 h-3" /> Powered by Gemini Vision AI
              </div>
            </>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${isLight ? "bg-red-50 border-red-200 text-red-800" : "bg-red-950/30 border-red-900/50 text-red-300"}`}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
          <div className="flex-1 text-xs">{error}</div>
          <button onClick={reset} className="shrink-0 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">

          {/* Header with image + metadata */}
          <div className={`rounded-xl border p-4 ${card}`}>
            <div className="flex items-start gap-4">
              {imagePreview && (
                <img src={imagePreview} alt="Scanned timesheet" className="w-28 h-28 rounded-lg object-cover border border-[#1a2235] shrink-0" />
              )}
              <div className="flex-1 grid grid-cols-2 gap-3 text-xs">
                <label className="flex flex-col gap-1">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Employee Name</span>
                  <input
                    value={result.employeeName}
                    onChange={e => updateField("employeeName", e.target.value)}
                    className={`px-2.5 py-1.5 rounded border text-xs font-bold ${inp}`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Job / Entity</span>
                  <input
                    value={result.job}
                    onChange={e => updateField("job", e.target.value)}
                    className={`px-2.5 py-1.5 rounded border text-xs ${inp}`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Week Start</span>
                  <input
                    value={result.weekStart}
                    onChange={e => updateField("weekStart", e.target.value)}
                    className={`px-2.5 py-1.5 rounded border text-xs ${inp}`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Week End</span>
                  <input
                    value={result.weekEnd}
                    onChange={e => updateField("weekEnd", e.target.value)}
                    className={`px-2.5 py-1.5 rounded border text-xs ${inp}`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Submitted On</span>
                  <input
                    value={result.submittedOn}
                    onChange={e => updateField("submittedOn", e.target.value)}
                    className={`px-2.5 py-1.5 rounded border text-xs ${inp}`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`font-semibold uppercase tracking-wider text-[10px] ${muted}`}>Weekly Total Hrs</span>
                  <input
                    type="number"
                    value={result.weeklyTotalHours ?? ""}
                    onChange={e => updateField("weeklyTotalHours", e.target.value === "" ? null : Number(e.target.value))}
                    className={`px-2.5 py-1.5 rounded border text-xs font-bold text-[#7c3aed] ${inp}`}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Daily Breakdown Table */}
          <div className={`rounded-xl border overflow-hidden ${card}`}>
            <div className={`px-4 py-2.5 border-b flex items-center justify-between ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#111623] border-[#1a2235]"}`}>
              <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-[#7c3aed]">
                <CheckCircle2 className="w-4 h-4" /> Daily Hours Breakdown
              </h4>
              <span className={`text-[11px] font-semibold ${muted}`}>{result.days.length} day{result.days.length !== 1 ? "s" : ""} extracted — edit if needed</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className={`border-b ${isLight ? "bg-slate-100 border-slate-200 text-slate-600" : "bg-[#141414] border-[#1a2235] text-[#888]"}`}>
                    <th className="p-3 text-left font-semibold">Day</th>
                    <th className="p-3 text-left font-semibold">Date</th>
                    <th className="p-3 text-left font-semibold">Clock In</th>
                    <th className="p-3 text-left font-semibold">Clock Out</th>
                    <th className="p-3 text-right font-semibold">Total Hrs</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? "divide-slate-200" : "divide-[#1a2235]"}`}>
                  {result.days.map((day, i) => (
                    <tr key={i} className={`${rowBg} transition-colors`}>
                      <td className="p-2.5 font-semibold">{day.dayOfWeek}</td>
                      <td className="p-2.5">
                        <input
                          value={day.date}
                          onChange={e => updateDay(i, "date", e.target.value)}
                          className={`px-2 py-1 w-20 rounded border text-xs ${inp}`}
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          value={day.clockIn}
                          onChange={e => updateDay(i, "clockIn", e.target.value)}
                          className={`px-2 py-1 w-20 rounded border text-xs ${inp}`}
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          value={day.clockOut}
                          onChange={e => updateDay(i, "clockOut", e.target.value)}
                          className={`px-2 py-1 w-20 rounded border text-xs ${inp}`}
                        />
                      </td>
                      <td className="p-2.5 text-right">
                        <input
                          type="number"
                          step="0.5"
                          value={day.totalHours ?? ""}
                          onChange={e => updateDay(i, "totalHours", e.target.value === "" ? null : Number(e.target.value))}
                          className={`px-2 py-1 w-16 rounded border text-xs text-right font-bold text-[#7c3aed] ${inp}`}
                        />
                      </td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className="bg-[#7c3aed]/10 border-t-2 border-[#7c3aed]/40 font-bold text-[#7c3aed]">
                    <td colSpan={4} className="p-3 text-sm">Weekly Total</td>
                    <td className="p-3 text-right text-sm">
                      {result.weeklyTotalHours ?? result.days.reduce((s, d) => s + (d.totalHours ?? 0), 0)} hrs
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Buttons */}
          {saved ? (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-semibold ${isLight ? "bg-green-50 border border-green-200 text-green-800" : "bg-green-950/30 border border-green-900/40 text-green-300"}`}>
              <CheckCircle2 className="w-4 h-4" />
              Timesheet saved to portal successfully!
              <button onClick={reset} className="ml-auto flex items-center gap-1.5 underline opacity-70 hover:opacity-100">
                <RefreshCw className="w-3 h-3" /> Scan another
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={reset}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-semibold transition-colors ${isLight ? "border-slate-300 text-slate-600 hover:bg-slate-100" : "border-[#1a2235] text-[#888] hover:bg-white/5"}`}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Scan Another
              </button>
              <button
                onClick={() => {
                  const text = [
                    `Employee: ${result.employeeName}`,
                    `Job: ${result.job}`,
                    `Week: ${result.weekStart} – ${result.weekEnd}`,
                    `Submitted: ${result.submittedOn}`,
                    `Weekly Total: ${result.weeklyTotalHours} hrs`,
                    "",
                    "Day | Date | In | Out | Hours",
                    ...result.days.map(d => `${d.dayOfWeek} | ${d.date} | ${d.clockIn} | ${d.clockOut} | ${d.totalHours ?? "?"}`),
                  ].join("\n");
                  navigator.clipboard.writeText(text).catch(() => {});
                  const btn = document.activeElement as HTMLButtonElement;
                  if (btn) { const orig = btn.textContent; btn.textContent = "✓ Copied!"; setTimeout(() => { if(btn) btn.textContent = orig; }, 1500); }
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-semibold transition-colors ${isLight ? "border-slate-300 text-slate-700 hover:bg-slate-100" : "border-[#1a2235] text-[#aaa] hover:bg-white/5"}`}
              >
                Copy as Text
              </button>
              <button
                onClick={saveTimesheet}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-60 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Saving…" : "Save to Portal"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
