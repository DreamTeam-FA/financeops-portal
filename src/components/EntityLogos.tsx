import React, { useState, useEffect } from "react";

interface LogoProps {
  className?: string;
  isLight?: boolean;
  size?: "sm" | "md" | "lg";
}

const W = 110, H = 28, MAX_H = 26, MAX_W = 106;

const wrap: React.CSSProperties = {
  width: W, height: H, borderRadius: 6, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const img: React.CSSProperties = {
  maxHeight: MAX_H, maxWidth: MAX_W, objectFit: "contain",
};

// Module-level cache so canvas work is done once per session per image
const _cache = new Map<string, string>();

function removeWhiteBg(src: string, threshold = 238): Promise<string> {
  if (_cache.has(src)) return Promise.resolve(_cache.get(src)!);
  return new Promise((resolve) => {
    const el = new Image();
    el.onload = () => {
      const c = document.createElement("canvas");
      c.width = el.naturalWidth;
      c.height = el.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) { resolve(src); return; }
      ctx.drawImage(el, 0, 0);
      try {
        const id = ctx.getImageData(0, 0, c.width, c.height);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] >= threshold && d[i + 1] >= threshold && d[i + 2] >= threshold) {
            d[i + 3] = 0; // make near-white pixels transparent
          }
        }
        ctx.putImageData(id, 0, 0);
        const url = c.toDataURL("image/png");
        _cache.set(src, url);
        resolve(url);
      } catch {
        resolve(src); // CORS fallback — show original
      }
    };
    el.onerror = () => resolve(src);
    el.src = src;
  });
}

// Hook: returns transparent version in dark mode, original in light mode
function useDarkLogo(src: string, isLight: boolean) {
  const [processed, setProcessed] = useState(src);
  useEffect(() => {
    if (isLight) { setProcessed(src); return; }
    removeWhiteBg(src).then(setProcessed);
  }, [src, isLight]);
  return processed;
}

export const RubysLogo: React.FC<LogoProps> = ({ isLight = false }) => {
  const src = useDarkLogo("/logos/rubys.png", isLight);
  return <div style={wrap}><img src={src} alt="Ruby's Pizzeria & Grill" style={img} /></div>;
};

export const TILogo: React.FC<LogoProps> = ({ isLight = false }) => {
  const src = useDarkLogo("/logos/ti.png", isLight);
  return <div style={wrap}><img src={src} alt="Timm Investments LLC" style={img} /></div>;
};

// MSDx has a DARK background with white text — canvas white-removal would erase the text.
// Instead: in light mode invert so the dark bg flips to white and text becomes dark/readable.
// In dark mode: dark bg blends naturally with the dark sidebar — no processing needed.
export const MSDxLogo: React.FC<LogoProps> = ({ isLight = false }) => (
  <div style={wrap}>
    <img
      src="/logos/msdx.png"
      alt="Mobile Swallowing Diagnostics"
      style={{ ...img, filter: isLight ? "invert(1) hue-rotate(180deg)" : "none" }}
    />
  </div>
);

const curcuminImg: React.CSSProperties = { maxHeight: 42, maxWidth: 130, objectFit: "contain" };

export const CurcuminLogo: React.FC<LogoProps> = ({ isLight = false }) => {
  const src = useDarkLogo("/logos/curcuminpro.jpg", isLight);
  return <div style={wrap}><img src={src} alt="CurcuminPRO" style={curcuminImg} /></div>;
};

export const ZiglarLogo: React.FC<LogoProps> = ({ isLight = false }) => {
  const src = useDarkLogo("/logos/ziglar.jpg", isLight);
  return <div style={wrap}><img src={src} alt="Ziglar" style={img} /></div>;
};

export const FourYrLogo: React.FC<LogoProps> = ({ isLight = false }) => {
  const src = useDarkLogo("/logos/4yr.png", isLight);
  return <div style={wrap}><img src={src} alt="4You Pros" style={img} /></div>;
};
