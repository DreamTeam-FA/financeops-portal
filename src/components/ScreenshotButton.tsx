import React, { useState, useEffect, useRef } from "react";
import { toPng } from "html-to-image";
import { useFinance } from "../context/FinanceContext";

export const ScreenshotButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus] = useState<string>("");
  const { theme } = useFinance();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const timestamp = () =>
    new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const capture = async (fullPage: boolean) => {
    setOpen(false);
    setCapturing(true);
    setStatus(fullPage ? "Capturing full page…" : "Capturing view…");
    try {
      const target = document.querySelector("main") as HTMLElement;
      if (!target) throw new Error("No main element found");

      const pixelRatio = window.devicePixelRatio || 1;

      let dataUrl: string;
      if (fullPage) {
        const prevOverflow = target.style.overflow;
        const prevHeight = target.style.height;
        target.style.overflow = "visible";
        target.style.height = target.scrollHeight + "px";
        dataUrl = await toPng(target, {
          quality: 1,
          pixelRatio,
          width: target.scrollWidth,
          height: target.scrollHeight,
          filter: (node) => {
            if (node instanceof HTMLElement && node.tagName === "IFRAME") return false;
            return true;
          },
        });
        target.style.overflow = prevOverflow;
        target.style.height = prevHeight;
      } else {
        dataUrl = await toPng(target, {
          quality: 1,
          pixelRatio,
          width: target.clientWidth,
          height: target.clientHeight,
          filter: (node) => {
            if (node instanceof HTMLElement && node.tagName === "IFRAME") return false;
            return true;
          },
        });
      }

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `financeops-${fullPage ? "full" : "view"}-${timestamp()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setStatus("Saved!");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      console.error("Screenshot failed:", e);
      setStatus("Failed");
      setTimeout(() => setStatus(""), 2000);
    } finally {
      setCapturing(false);
    }
  };

  const isDark = theme === "dark";

  return (
    <div
      ref={containerRef}
      className="fixed bottom-20 right-4 md:bottom-6 z-[60] flex flex-col items-end gap-1"
    >
      {open && (
        <div
          className={`rounded-xl shadow-2xl border overflow-hidden text-sm w-52 ${
            isDark
              ? "bg-[#1a1a1a] border-[#333] text-white"
              : "bg-white border-slate-200 text-slate-800"
          }`}
        >
          <button
            onClick={() => capture(false)}
            disabled={capturing}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
              isDark ? "hover:bg-[#2a2a2a]" : "hover:bg-slate-50"
            }`}
          >
            <span className="text-lg">📷</span>
            <div>
              <div className="font-semibold text-xs">Current View</div>
              <div className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Visible area only
              </div>
            </div>
          </button>
          <div className={`h-px mx-3 ${isDark ? "bg-[#2a2a2a]" : "bg-slate-100"}`} />
          <button
            onClick={() => capture(true)}
            disabled={capturing}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
              isDark ? "hover:bg-[#2a2a2a]" : "hover:bg-slate-50"
            }`}
          >
            <span className="text-lg">🖼️</span>
            <div>
              <div className="font-semibold text-xs">Full Page</div>
              <div className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Including unscrolled content
              </div>
            </div>
          </button>
        </div>
      )}

      <button
        onClick={() => !capturing && setOpen((v) => !v)}
        title="Screenshot"
        className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center text-lg transition-all border ${
          isDark
            ? "bg-[#1a1a1a] border-[#333] hover:bg-[#252525] text-slate-200"
            : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
        } ${capturing ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
      >
        {capturing ? "⏳" : "📷"}
      </button>

      {status && (
        <div className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
          status === "Saved!" ? "text-emerald-600" : status === "Failed" ? "text-red-500" : isDark ? "text-slate-400" : "text-slate-500"
        }`}>
          {status}
        </div>
      )}
    </div>
  );
};
