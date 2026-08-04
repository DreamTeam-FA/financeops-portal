import React, { useState, useRef, useEffect } from "react";
import { Camera } from "lucide-react";
import { toPng } from "html-to-image";

/**
 * Inline screenshot button — lives in the PageHeader bar between Refresh and Dark toggle.
 * No floating, no drag. Click opens a small dropdown; options trigger html-to-image capture.
 */
export const ScreenshotButton: React.FC = () => {
  const [open, setOpen]           = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus]       = useState("");
  const wrapRef                   = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const capture = async (fullPage: boolean) => {
    setOpen(false);
    setCapturing(true);
    setStatus(fullPage ? "Capturing…" : "Capturing…");
    try {
      const target = document.querySelector("main") as HTMLElement;
      if (!target) throw new Error("No <main> element");
      const pixelRatio = window.devicePixelRatio || 1;
      let dataUrl: string;
      if (fullPage) {
        const prevOvf = target.style.overflow, prevH = target.style.height;
        target.style.overflow = "visible";
        target.style.height   = target.scrollHeight + "px";
        dataUrl = await toPng(target, {
          quality: 1, pixelRatio,
          width: target.scrollWidth, height: target.scrollHeight,
          filter: n => !(n instanceof HTMLElement && n.tagName === "IFRAME"),
        });
        target.style.overflow = prevOvf;
        target.style.height   = prevH;
      } else {
        dataUrl = await toPng(target, {
          quality: 1, pixelRatio,
          width: target.clientWidth, height: target.clientHeight,
          filter: n => !(n instanceof HTMLElement && n.tagName === "IFRAME"),
        });
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `financeops-${fullPage ? "full" : "view"}-${timestamp()}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setStatus("✓ Saved");
    } catch (e) {
      console.error("Screenshot failed:", e);
      setStatus("Failed");
    } finally {
      setCapturing(false);
      setTimeout(() => setStatus(""), 2500);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => !capturing && setOpen(v => !v)}
        disabled={capturing}
        title="Screenshot"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/15 border border-white/30 text-white text-[12px] font-medium hover:bg-white/25 transition-colors disabled:opacity-50"
      >
        <Camera className={`w-3.5 h-3.5 ${capturing ? "animate-pulse" : ""}`} />
        {status && <span className="hidden sm:inline text-[11px]">{status}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-[200] w-48 rounded-xl border shadow-2xl overflow-hidden bg-white text-slate-800 border-slate-200">
          <button
            onClick={() => capture(false)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs hover:bg-slate-50 transition-colors"
          >
            <span className="text-base">📷</span>
            <div>
              <div className="font-semibold">Current View</div>
              <div className="text-[11px] text-slate-500">Visible area only</div>
            </div>
          </button>
          <div className="h-px mx-3 bg-slate-100" />
          <button
            onClick={() => capture(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs hover:bg-slate-50 transition-colors"
          >
            <span className="text-base">🖼️</span>
            <div>
              <div className="font-semibold">Full Page</div>
              <div className="text-[11px] text-slate-500">Including unscrolled content</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
