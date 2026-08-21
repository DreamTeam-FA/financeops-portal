/**
 * Premium Tooltip system — replaces all native `title=""` browser tooltips.
 *
 * Usage:
 *   <Tooltip label="Accounts Payable" sublabel="Manage bills & payments">
 *     <button>...</button>
 *   </Tooltip>
 *
 *   <Tooltip label="Ruby's Pizzeria" sublabel="AP View" color="#ec4899">
 *     <button>...</button>
 *   </Tooltip>
 *
 * `color` makes it brand-tinted: colored left bar, colored text accent, soft glow.
 * Without `color`, it defaults to a clean dark glass style.
 */
import React, {
  createContext, useContext, useState, useCallback,
  useRef, useEffect, type ReactNode, Children, isValidElement, cloneElement,
} from "react";
import { createPortal } from "react-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  sublabel?: string;
  color?: string; // hex brand color
}

interface TooltipCtxType {
  showTooltip: (s: Omit<TooltipState, "visible">) => void;
  moveTooltip: (x: number, y: number) => void;
  hideTooltip: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const TooltipCtx = createContext<TooltipCtxType>({
  showTooltip: () => {},
  moveTooltip: () => {},
  hideTooltip: () => {},
});

// ─── Provider + Portal renderer ───────────────────────────────────────────────

export const TooltipProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<TooltipState>({
    visible: false, x: 0, y: 0, label: "",
  });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback((s: Omit<TooltipState, "visible">) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setState({ ...s, visible: true });
  }, []);

  const moveTooltip = useCallback((x: number, y: number) => {
    setState(prev => prev.visible ? { ...prev, x, y } : prev);
  }, []);

  const hideTooltip = useCallback(() => {
    hideTimer.current = setTimeout(() => {
      setState(prev => ({ ...prev, visible: false }));
    }, 80);
  }, []);

  return (
    <TooltipCtx.Provider value={{ showTooltip, moveTooltip, hideTooltip }}>
      {children}
      {createPortal(
        <TooltipRenderer state={state} />,
        document.body
      )}
    </TooltipCtx.Provider>
  );
};

// ─── Tooltip renderer (portal) ────────────────────────────────────────────────

const TooltipRenderer: React.FC<{ state: TooltipState }> = ({ state }) => {
  const { visible, x, y, label, sublabel, color } = state;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      // Tiny delay to let position settle before fade-in
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [visible]);

  if (!visible && !mounted) return null;

  // Convert hex to rgb for rgba shadows
  const hexRgb = color
    ? (() => {
        const h = color.replace("#", "");
        return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
      })()
    : null;

  // Smart positioning: flip above cursor when too close to bottom edge
  const OFFSET = 14;
  const vpH = window.innerHeight;
  const above = y + OFFSET + 80 > vpH;
  const top   = above ? y - OFFSET - (sublabel ? 52 : 34) : y + OFFSET;
  const left  = Math.min(x + 8, window.innerWidth - 220);

  return (
    <div
      role="tooltip"
      style={{
        position:    "fixed",
        top,
        left,
        zIndex:      9999,
        pointerEvents: "none",
        opacity:     mounted && visible ? 1 : 0,
        transform:   mounted && visible ? "translateY(0)" : above ? "translateY(4px)" : "translateY(-4px)",
        transition:  "opacity 140ms ease, transform 140ms ease",
      }}
    >
      <div
        style={{
          display:        "flex",
          alignItems:     "stretch",
          borderRadius:   10,
          overflow:       "hidden",
          border:         `1px solid ${color ? `rgba(${hexRgb},.28)` : "rgba(255,255,255,.08)"}`,
          background:     color
            ? `linear-gradient(135deg, rgba(${hexRgb},.14) 0%, rgba(10,16,32,.97) 60%)`
            : "rgba(8,13,24,.96)",
          boxShadow:      color
            ? `0 8px 24px rgba(0,0,0,.55), 0 0 0 0.5px rgba(${hexRgb},.18), 0 2px 12px rgba(${hexRgb},.15)`
            : "0 8px 24px rgba(0,0,0,.55), 0 0 0 0.5px rgba(255,255,255,.04)",
          backdropFilter: "blur(12px)",
          maxWidth:       240,
        }}
      >
        {/* Brand color left bar */}
        {color && (
          <div
            style={{
              width: 3,
              flexShrink: 0,
              background: `linear-gradient(180deg, ${color} 0%, rgba(${hexRgb},.4) 100%)`,
            }}
          />
        )}

        <div style={{ padding: "7px 11px" }}>
          <div
            style={{
              fontSize:      11,
              fontWeight:    700,
              letterSpacing: "0.02em",
              lineHeight:    1.3,
              color:         color ? color : "#e8f0fe",
              fontFamily:    "system-ui, -apple-system, sans-serif",
              whiteSpace:    "nowrap",
            }}
          >
            {label}
          </div>
          {sublabel && (
            <div
              style={{
                fontSize:   10,
                fontWeight: 500,
                marginTop:  2,
                color:      color ? `rgba(${hexRgb},.75)` : "rgba(160,180,210,.7)",
                whiteSpace: "nowrap",
              }}
            >
              {sublabel}
            </div>
          )}
        </div>
      </div>

      {/* Arrow */}
      <div
        style={{
          position:   "absolute",
          left:       12,
          [above ? "bottom" : "top"]: -5,
          width:      0,
          height:     0,
          borderLeft: "5px solid transparent",
          borderRight:"5px solid transparent",
          ...(above
            ? { borderTop: `5px solid ${color ? `rgba(${hexRgb},.28)` : "rgba(255,255,255,.08)"}` }
            : { borderBottom: `5px solid ${color ? `rgba(${hexRgb},.28)` : "rgba(255,255,255,.08)"}` }
          ),
        }}
      />
    </div>
  );
};

// ─── Tooltip wrapper component ────────────────────────────────────────────────

interface TooltipProps {
  label: string;
  sublabel?: string;
  color?: string;
  children: ReactNode;
  disabled?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
  label, sublabel, color, children, disabled = false,
}) => {
  const { showTooltip, moveTooltip, hideTooltip } = useContext(TooltipCtx);

  if (disabled) return <>{children}</>;

  // Inject handlers directly onto the child — no wrapper div, no layout impact.
  const child = Children.only(children);
  if (!isValidElement(child)) return <>{children}</>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = child.props as any;

  return cloneElement(child as React.ReactElement<any>, {
    onMouseEnter: (e: React.MouseEvent) => {
      showTooltip({ label, sublabel, color, x: e.clientX, y: e.clientY });
      existing.onMouseEnter?.(e);
    },
    onMouseMove: (e: React.MouseEvent) => {
      moveTooltip(e.clientX, e.clientY);
      existing.onMouseMove?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hideTooltip();
      existing.onMouseLeave?.(e);
    },
  });
};

export const useTooltip = () => useContext(TooltipCtx);
