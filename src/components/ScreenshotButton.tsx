import React, { useState, useEffect, useRef } from "react";
import { toPng } from "html-to-image";
import { useFinance } from "../context/FinanceContext";

const BTN_SIZE = 40; // w-10 h-10
const MENU_W   = 208; // w-52

export const ScreenshotButton: React.FC = () => {
  const [open, setOpen]           = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus]       = useState<string>("");
  const { theme }                 = useFinance();
  const containerRef              = useRef<HTMLDivElement>(null);

  // ── Position state ────────────────────────────────────────────────────────────
  const [pos, setPos]       = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    startMouseX: number; startMouseY: number;
    startPosX:  number; startPosY:  number;
    hasMoved:   boolean;
  }>({ startMouseX:0, startMouseY:0, startPosX:0, startPosY:0, hasMoved:false });

  // Default: bottom-right corner (matches screenshot)
  const defaultPos = () => ({
    x: window.innerWidth  - BTN_SIZE - 16,
    y: window.innerHeight - BTN_SIZE - 24,
  });

  const clamp = (x: number, y: number) => ({
    x: Math.max(8, Math.min(window.innerWidth  - BTN_SIZE - 8, x)),
    y: Math.max(8, Math.min(window.innerHeight - BTN_SIZE - 8, y)),
  });

  // ── Pointer drag handlers ─────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || capturing) return;
    const cur = pos ?? defaultPos();
    dragRef.current = {
      startMouseX: e.clientX, startMouseY: e.clientY,
      startPosX: cur.x,       startPosY:  cur.y,
      hasMoved: false,
    };
    setDragging(true);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch (_) {}
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragRef.current.startMouseX;
    const dy = e.clientY - dragRef.current.startMouseY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.hasMoved = true;
    setPos(clamp(dragRef.current.startPosX + dx, dragRef.current.startPosY + dy));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}
    if (!dragRef.current.hasMoved && !capturing) setOpen(v => !v);
  };

  // Close on outside click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // ── Screenshot capture ────────────────────────────────────────────────────────
  const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const capture = async (fullPage: boolean) => {
    setOpen(false);
    setCapturing(true);
    setStatus(fullPage ? "Capturing full page…" : "Capturing view…");
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
          quality:1, pixelRatio,
          width:target.scrollWidth, height:target.scrollHeight,
          filter: n => !(n instanceof HTMLElement && n.tagName === "IFRAME"),
        });
        target.style.overflow = prevOvf;
        target.style.height   = prevH;
      } else {
        dataUrl = await toPng(target, {
          quality:1, pixelRatio,
          width:target.clientWidth, height:target.clientHeight,
          filter: n => !(n instanceof HTMLElement && n.tagName === "IFRAME"),
        });
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `financeops-${fullPage ? "full" : "view"}-${timestamp()}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setStatus("Saved!");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      console.error("Screenshot failed:", e);
      setStatus("Failed");
      setTimeout(() => setStatus(""), 2000);
    } finally { setCapturing(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const isDark   = theme === "dark";
  const computed = pos ?? defaultPos();

  // Dynamic popup direction: open up if near bottom, down if near top;
  // open left if near right edge, right if near left edge.
  const spaceBelow  = window.innerHeight - computed.y - BTN_SIZE;
  const spaceAbove  = computed.y;
  const spaceRight  = window.innerWidth  - computed.x - BTN_SIZE;
  const openUpward  = spaceBelow < 160 || spaceAbove > spaceBelow; // prefer up when near bottom
  const openLeftward = spaceRight < MENU_W;                         // flip left when near right edge

  const popupStyle: React.CSSProperties = {
    position: "absolute",
    ...(openUpward  ? { bottom: BTN_SIZE + 6 } : { top: BTN_SIZE + 6 }),
    ...(openLeftward ? { right: 0 }             : { left: 0 }),
    zIndex: 1,
  };

  const menuCls = `rounded-xl shadow-2xl border overflow-hidden text-sm w-52 ${
    isDark ? "bg-[#1a1a1a] border-[#333] text-white" : "bg-white border-slate-200 text-slate-800"
  }`;

  const itemCls = `w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
    isDark ? "hover:bg-[#2a2a2a]" : "hover:bg-slate-50"
  }`;

  return (
    <div
      ref={containerRef}
      style={{ position:"fixed", left:computed.x, top:computed.y, zIndex:60 }}
    >
      {/* Popup menu — dynamic position */}
      {open && (
        <div style={popupStyle} className={menuCls}>
          <button onClick={() => capture(false)} disabled={capturing} className={itemCls}>
            <span className="text-lg">📷</span>
            <div>
              <div className="font-semibold text-xs">Current View</div>
              <div className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Visible area only</div>
            </div>
          </button>
          <div className={`h-px mx-3 ${isDark ? "bg-[#2a2a2a]" : "bg-slate-100"}`} />
          <button onClick={() => capture(true)} disabled={capturing} className={itemCls}>
            <span className="text-lg">🖼️</span>
            <div>
              <div className="font-semibold text-xs">Full Page</div>
              <div className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Including unscrolled content</div>
            </div>
          </button>
        </div>
      )}

      {/* Draggable button */}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="Screenshot (drag to move)"
        className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center text-lg border select-none ${
          isDark
            ? "bg-[#1a1a1a] border-[#333] hover:bg-[#252525] text-slate-200"
            : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
        } ${capturing ? "opacity-60 cursor-wait" : dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        {capturing ? "⏳" : "📷"}
      </button>

      {status && (
        <div
          style={{ position:"absolute", ...(openUpward ? {bottom: BTN_SIZE + 4} : {top: BTN_SIZE + 4}), left:0 }}
          className={`text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap pointer-events-none ${
            status === "Saved!"  ? "text-emerald-600" :
            status === "Failed"  ? "text-red-500"     :
            isDark ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {status}
        </div>
      )}
    </div>
  );
};
