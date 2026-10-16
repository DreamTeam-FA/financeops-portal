import React, { useEffect, useState } from "react";
import { getAccessToken } from "../../services/googleAuth";
import { X, ExternalLink, FileWarning } from "lucide-react";
import { useFinance } from "../../context/FinanceContext";

interface BillCopyViewerModalProps {
  url: string;
  fileName?: string;
  vendor?: string;
  accentColor?: string;
  onClose: () => void;
}

// Google Drive "webViewLink" files (https://drive.google.com/file/d/<ID>/view) can be
// embedded read-only via the /preview endpoint — that's what lets this render inline
// instead of forcing a new browser tab.
const toEmbedUrl = (url: string): string | null => {
  const m = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
  return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null;
};

export const BillCopyViewerModal: React.FC<BillCopyViewerModalProps> = ({ url, fileName, vendor, accentColor = "#1a73e8", onClose }) => {
  const { theme } = useFinance() as any;
  const isLight = theme === "light";
  const embedUrl = toEmbedUrl(url);
  const fileId = (url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/))?.[1];
  // The Drive /preview iframe relies on the BROWSER's Google cookies (third-party, often blocked
  // or on another account) -> "Sign in" page even when the portal is signed in. Fetch the file
  // with the portal's own OAuth token instead and show it from a blob URL.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!fileId);
  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      if (!fileId || !token) { setLoading(false); return; }
      try {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(String(r.status));
        const b = await r.blob();
        if (cancelled) return;
        revoke = URL.createObjectURL(b);
        setBlobUrl(revoke);
      } catch { /* fall back to the Drive preview iframe */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke); };
  }, [fileId]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-3xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden border flex flex-col ${
          isLight ? "border-slate-200 bg-white" : "border-[#2a2a2a] bg-[#0d111a]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colored accent bar — matches the rest of the portal's modal chrome */}
        <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: accentColor }} />

        {/* Header */}
        <div className={`px-5 py-3 flex items-center justify-between border-b shrink-0 ${
          isLight ? "border-slate-100" : "border-[#222]"
        }`}>
          <div className="min-w-0">
            <p className={`text-[9px] font-bold uppercase tracking-wider ${isLight ? "text-slate-400" : "text-[#666]"}`}>
              Bill Copy{vendor ? ` · ${vendor}` : ""}
            </p>
            <p className={`text-[13px] font-bold truncate ${isLight ? "text-slate-900" : "text-white"}`}>
              {fileName || "Attached document"}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in a new tab"
              className={`p-2 rounded-lg transition-colors ${isLight ? "text-slate-400 hover:bg-slate-100" : "text-[#556] hover:bg-white/5"}`}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${isLight ? "text-slate-400 hover:bg-slate-100" : "text-[#556] hover:bg-white/5"}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={`flex-1 min-h-0 ${isLight ? "bg-slate-50" : "bg-[#050607]"}`}>
          {loading ? (
            <div className="w-full h-full flex items-center justify-center text-[12px] text-slate-400">Loading bill copy…</div>
          ) : embedUrl ? (
            <iframe
              src={blobUrl || embedUrl}
              title={fileName || "Bill copy"}
              className="w-full h-full border-0"
              allow="autoplay"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              <FileWarning className={`w-8 h-8 ${isLight ? "text-slate-300" : "text-[#444]"}`} />
              <p className={`text-[13px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"}`}>
                This file can't be previewed inline.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all hover:opacity-90"
                style={{ backgroundColor: accentColor }}
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open in New Tab
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
