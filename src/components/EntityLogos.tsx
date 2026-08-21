import React, { useState, useEffect } from "react";

interface LogoProps {
  className?: string;
  isLight?: boolean;
  size?: "sm" | "md" | "lg";
}

// Module-level cache so canvas work is done once per session per image
const _cache = new Map<string, string>();

/** Remove near-white pixels AND crop to tight bounding box of remaining content */
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

        // 1. Remove near-white pixels
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] >= threshold && d[i + 1] >= threshold && d[i + 2] >= threshold) {
            d[i + 3] = 0;
          }
        }
        ctx.putImageData(id, 0, 0);

        // No crop — keep original dimensions so dark/light mode logos are the same visual size.
        // Whitespace pixels are now transparent (invisible on dark bg) but image dimensions unchanged.
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

/** Returns null while processing (hides flicker), then the processed URL */
function useDarkLogo(src: string, isLight: boolean) {
  // In light mode, cache hit, or first paint: resolve synchronously from cache
  const cached = _cache.get(src);
  const [processed, setProcessed] = useState<string | null>(
    isLight ? src : (cached ?? null)
  );

  useEffect(() => {
    if (isLight) { setProcessed(src); return; }
    if (_cache.has(src)) { setProcessed(_cache.get(src)!); return; }
    setProcessed(null);
    removeWhiteBg(src).then(setProcessed);
  }, [src, isLight]);

  return processed; // null = still processing, render nothing until ready
}

const wrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: "100%",
  flexShrink: 0,
};
const imgStyle: React.CSSProperties = {
  maxHeight: 24,
  maxWidth: 130,
  width: "auto",
  height: "auto",
  objectFit: "contain",
  display: "block",
};

export const RubysLogo: React.FC<LogoProps> = ({ isLight = false }) => {
  const src = useDarkLogo("/logos/rubys.png", isLight);
  if (!src) return <div style={{ width: 110, height: 30 }} />;
  return <div style={wrapStyle}><img src={src} alt="Ruby's Pizzeria & Grill" style={imgStyle} /></div>;
};

export const TILogo: React.FC<LogoProps> = ({ isLight = false }) => {
  const src = useDarkLogo("/logos/ti.png", isLight);
  if (!src) return <div style={{ width: 110, height: 30 }} />;
  return <div style={wrapStyle}><img src={src} alt="Timm Investments LLC" style={imgStyle} /></div>;
};

// MSDx has a dark background — canvas white-removal would erase the text.
// Light mode: invert so dark bg → white. Dark mode: blends naturally with sidebar.
export const MSDxLogo: React.FC<LogoProps> = ({ isLight = false }) => (
  <div style={wrapStyle}>
    <img
      src="/logos/msdx.png"
      alt="Mobile Swallowing Diagnostics"
      style={{ ...imgStyle, filter: isLight ? "invert(1) hue-rotate(180deg)" : "none" }}
    />
  </div>
);

export const CurcuminLogo: React.FC<LogoProps> = ({ isLight = false }) => {
  const src = useDarkLogo("/logos/curcuminpro.jpg", isLight);
  if (!src) return <div style={{ width: 130, height: 36 }} />;
  return <div style={wrapStyle}><img src={src} alt="CurcuminPRO" style={{ ...imgStyle, maxHeight: 28, maxWidth: 140 }} /></div>;
};

export const ZiglarLogo: React.FC<LogoProps> = ({ isLight = false }) => {
  const src = useDarkLogo("/logos/ziglar.jpg", isLight);
  if (!src) return <div style={{ width: 110, height: 30 }} />;
  // Ziglar has a dark background — screen blend makes dark areas transparent on the dark sidebar
  return <div style={wrapStyle}><img src={src} alt="Ziglar" style={{ ...imgStyle, mixBlendMode: isLight ? "normal" : "screen" }} /></div>;
};

export const FourYrLogo: React.FC<LogoProps> = ({ isLight = false }) => {
  const src = useDarkLogo("/logos/4yr.png", isLight);
  if (!src) return <div style={{ width: 110, height: 30 }} />;
  return <div style={wrapStyle}><img src={src} alt="4You Pros" style={imgStyle} /></div>;
};
