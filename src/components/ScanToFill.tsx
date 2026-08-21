/**
 * ScanToFill — compact inline scanner used inside modals.
 * Shows a small drop zone; on successful scan calls onFill(data) and collapses.
 * Stays collapsed unless resetKey changes (parent can force a reset).
 */
import React, { useState, useRef, useCallback } from "react";
import { ScanLine, Loader2, AlertCircle, X } from "lucide-react";

type ScanType = "invoice" | "timesheet";

interface Props {
  type: ScanType;
  isLight: boolean;
  /** Called with raw Gemini result once scan succeeds */
  onFill: (data: any) => void;
  /** Changing this resets the component back to the drop zone */
  resetKey?: number;
}

export const ScanToFill: React.FC<Props> = ({ type, isLight, onFill, resetKey }) => {
  const [state, setState] = useState<"idle" | "scanning" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevKey = useRef(resetKey);

  // Reset when resetKey changes
  if (resetKey !== prevKey.current) {
    prevKey.current = resetKey;
    if (done) setDone(false);
    if (state !== "idle") setState("idle");
    setError(null);
  }

  const endpoint = type === "invoice" ? "/api/invoice/scan" : "/api/timesheet/scan";

  const processFile = useCallback(async (file: File) => {
    const isAccepted = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!isAccepted) return;
    setError(null);
    setState("scanning");

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type || "image/jpeg" })
        });
        const json = await resp.json();
        if (!resp.ok || !json.ok) {
          setState("error");
          setError(json.error || "Scan failed — try again");
        } else {
          const data = type === "invoice" ? json.invoice : json.timesheet;
          onFill(data);
          setDone(true);
          setState("idle");
        }
      } catch (err: any) {
        setState("error");
        setError(err?.message || "Network error");
      }
    };
    reader.readAsDataURL(file);
  }, [endpoint, type, onFill]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  if (done) return null;

  const accent = type === "invoice" ? "#1a73e8" : "#16a34a";
  const label  = type === "invoice" ? "Scan bill to auto-fill" : "Scan timesheet to auto-fill";

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={() => state === "idle" && inputRef.current?.click()}
      className={[
        "relative flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 cursor-pointer transition-all text-xs select-none",
        state === "scanning" ? "opacity-70 cursor-default" : "hover:opacity-90",
        isLight
          ? "border-slate-300 bg-slate-50 hover:border-[var(--accent)] text-slate-600"
          : "border-[#1e2a3a] bg-[#0a1220] hover:border-[var(--accent)] text-[#8099b8]",
      ].join(" ")}
      style={{ "--accent": accent } as React.CSSProperties}
    >
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFileChange} />

      {state === "scanning" ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: accent }} />
      ) : (
        <ScanLine className="w-4 h-4 shrink-0" style={{ color: accent }} />
      )}

      <span className="font-semibold" style={{ color: accent }}>
        {state === "scanning" ? "Scanning…" : label}
      </span>

      {state === "idle" && (
        <span className={`ml-auto text-[10px] ${isLight ? "text-slate-400" : "text-[#556]"}`}>
          drop or click
        </span>
      )}

      {state === "error" && error && (
        <span className="ml-auto flex items-center gap-1 text-red-400 text-[10px]">
          <AlertCircle className="w-3 h-3" /> {error}
          <button
            onClick={(e) => { e.stopPropagation(); setState("idle"); setError(null); }}
            className="ml-1 opacity-60 hover:opacity-100"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}
    </div>
  );
};
