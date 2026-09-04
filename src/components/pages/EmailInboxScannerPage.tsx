import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useFinance } from "../../context/FinanceContext";
import { fuzzyBest } from "../../utils/fuzzyMatch";
import { bumpGeminiCounter } from "../../utils/geminiCounter";
import firebaseConfig from "../../../firebase-applet-config.json";
import {
  Mail, Search, Loader2, AlertTriangle, CheckCircle2,
  FileText, ChevronDown, X, Eye, Inbox, RefreshCw,
  ChevronLeft, Paperclip, LogIn, LogOut, UserCircle2,
  Download, ExternalLink
} from "lucide-react";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email";
const LS_TOKEN = "gmail_scanner_token";
const LS_EMAIL = "gmail_scanner_email";

// ─────────────────────────────────────────── Types

interface EmailAttachment {
  filename: string;
  attachmentId: string;
  mimeType: string;
  size: number;
}

interface ScannedEmail {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body?: string;
  attachments: EmailAttachment[];
  // queue state
  status?: "pending" | "ignored" | "processing" | "done";
  selectedAttachmentIdx?: number;
}

interface ExtractedData {
  vendor?: string;
  invoiceNo?: string;
  amount?: number | null;
  dueDate?: string | null;
  issueDate?: string | null;
  entity?: string;
  description?: string;
  remarks?: string;
}

// ─────────────────────────────────────────── Helpers

const cl = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

function formatBytes(b: number) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric"
    });
  } catch { return dateStr; }
}

// ─────────────────────────────────────────── Preview Modal

interface PreviewModalProps {
  email: ScannedEmail;
  attachment: EmailAttachment | null;
  action: "Bill" | "Invoice";
  data: ExtractedData;
  isLight: boolean;
  onClose: () => void;
  onConfirm: (data: ExtractedData) => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({
  email, attachment, action, data, isLight, onClose, onConfirm
}) => {
  const [form, setForm] = useState<ExtractedData>({ ...data });

  const bg   = isLight ? "bg-white"       : "bg-[#181c24]";
  const bdr  = isLight ? "border-slate-200" : "border-[#2a3140]";
  const txt  = isLight ? "text-slate-800"   : "text-slate-100";
  const txt2 = isLight ? "text-slate-500"   : "text-slate-400";
  const inp  = isLight
    ? "bg-slate-50 border-slate-300 text-slate-800 focus:ring-cyan-400"
    : "bg-[#1e2435] border-[#2a3140] text-slate-100 focus:ring-cyan-500";
  const lbl  = isLight ? "text-slate-600" : "text-slate-400";

  const F = ({ label, field, type = "text" }: { label: string; field: keyof ExtractedData; type?: string }) => (
    <div className="flex flex-col gap-1">
      <label className={`text-[10px] font-bold uppercase tracking-wider ${lbl}`}>{label}</label>
      <input
        type={type}
        value={(form[field] as string) ?? ""}
        onChange={e => setForm(prev => ({ ...prev, [field]: type === "number" ? parseFloat(e.target.value) || null : e.target.value }))}
        className={`px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 ${inp}`}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 rounded-2xl shadow-2xl border ${bdr} ${bg} w-full max-w-lg flex flex-col max-h-[90vh]`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: isLight ? "#e2e8f0" : "#2a3140" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/30">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className={`font-bold text-sm ${txt}`}>Create as {action}</h2>
              <p className={`text-[11px] ${txt2} truncate max-w-[260px]`}>{attachment?.filename || email.subject}</p>
            </div>
          </div>
          <button onClick={onClose} className={`w-7 h-7 flex items-center justify-center rounded-lg ${txt2} hover:opacity-70`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source */}
        <div className={`px-5 py-2.5 border-b text-[11px] ${txt2} flex items-center gap-1.5`} style={{ borderColor: isLight ? "#e2e8f0" : "#2a3140" }}>
          <Mail className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{email.from}</span>
          <span className="mx-1">·</span>
          <span className="shrink-0">{formatDate(email.date)}</span>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 px-5 py-4 grid grid-cols-2 gap-3">
          <div className="col-span-2"><F label="Vendor / Sender" field="vendor" /></div>
          <F label="Invoice / Bill No." field="invoiceNo" />
          <F label="Amount (USD)" field="amount" type="number" />
          <F label="Issue Date" field="issueDate" />
          <F label="Due Date" field="dueDate" />
          <div className="col-span-2"><F label="Entity (Ruby's / TI / MSDx)" field="entity" /></div>
          <div className="col-span-2"><F label="Description" field="description" /></div>
          <div className="col-span-2"><F label="Remarks" field="remarks" /></div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-2 px-5 py-3.5 border-t`} style={{ borderColor: isLight ? "#e2e8f0" : "#2a3140" }}>
          <button onClick={onClose} className={`text-xs px-4 py-2 rounded-lg border ${bdr} ${txt2} hover:opacity-70`}>Cancel</button>
          <button
            onClick={() => onConfirm(form)}
            className="text-xs px-5 py-2 rounded-lg text-white font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 transition-all shadow-md shadow-cyan-500/25"
          >
            ✓ Confirm &amp; Create {action}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────── Email Detail Modal

interface EmailDetailModalProps {
  email: ScannedEmail;
  isLight: boolean;
  gmailToken: string | null;
  onAction: (email: ScannedEmail, action: "Bill" | "Invoice" | "Ignore", attachIdx: number) => void;
  onClose: () => void;
}

const EmailDetailModal: React.FC<EmailDetailModalProps> = ({ email, isLight, gmailToken, onAction, onClose }) => {
  const [attachPreviews, setAttachPreviews] = useState<Record<number, { loading: boolean; data: string | null; mime: string }>>({});

  const bg    = isLight ? "bg-white border-slate-200"       : "bg-[#141820] border-[#232b3a]";
  const hdrBg = isLight ? "bg-slate-50 border-slate-200"    : "bg-[#0d111a] border-[#1a2235]";
  const txt   = isLight ? "text-slate-800"                  : "text-slate-100";
  const txt2  = isLight ? "text-slate-500"                  : "text-slate-400";
  const bodyTxt = isLight ? "text-slate-700"                : "text-[#8090a8]";
  const attBg = isLight ? "border-slate-200 bg-slate-50"    : "border-[#1e2738] bg-[#0e1420]";

  const fetchPreview = async (att: EmailAttachment, idx: number) => {
    if (attachPreviews[idx] || !gmailToken) return;
    setAttachPreviews(p => ({ ...p, [idx]: { loading: true, data: null, mime: att.mimeType } }));
    try {
      const resp = await fetch(`/api/email/attachment/${email.id}/${att.attachmentId}?accessToken=${encodeURIComponent(gmailToken)}`);
      const json = await resp.json();
      if (json.ok) {
        setAttachPreviews(p => ({ ...p, [idx]: { loading: false, data: json.data, mime: att.mimeType } }));
      } else {
        setAttachPreviews(p => ({ ...p, [idx]: { loading: false, data: null, mime: att.mimeType } }));
      }
    } catch {
      setAttachPreviews(p => ({ ...p, [idx]: { loading: false, data: null, mime: att.mimeType } }));
    }
  };

  const isProcessing = email.status === "processing";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 flex flex-col rounded-2xl border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden ${bg}`}>

        {/* Accent bar */}
        <div className="h-1.5 w-full bg-cyan-500 shrink-0" />

        {/* Header */}
        <div className={`flex items-start justify-between gap-3 px-5 py-4 border-b shrink-0 ${hdrBg}`}>
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 flex items-center justify-center shrink-0 mt-0.5">
              <Mail className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-bold leading-snug ${txt}`}>{email.subject}</p>
              <p className={`text-[11px] truncate ${txt2} mt-0.5`}>{email.from}</p>
              <p className={`text-[11px] ${txt2}`}>{formatDate(email.date)}</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg shrink-0 ${txt2} hover:opacity-70`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Email body text */}
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${txt2}`}>Message</p>
            <div className={`rounded-xl border p-4 text-[12px] leading-relaxed whitespace-pre-wrap ${attBg} ${bodyTxt}`}>
              {email.body || email.snippet || "(No preview available)"}
            </div>
          </div>

          {/* Attachments */}
          {email.attachments.length > 0 && (
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${txt2}`}>
                Attachments ({email.attachments.length})
              </p>
              <div className="space-y-3">
                {email.attachments.map((att, idx) => {
                  const preview = attachPreviews[idx];
                  return (
                    <div key={att.attachmentId} className={`rounded-xl border overflow-hidden ${attBg}`}>
                      {/* Attachment header */}
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <Paperclip className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className={`text-[12px] flex-1 font-medium truncate ${txt}`}>{att.filename}</span>
                        <span className={`text-[11px] shrink-0 ${txt2}`}>{formatBytes(att.size)}</span>
                        <button
                          onClick={() => fetchPreview(att, idx)}
                          disabled={!!preview}
                          className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg shrink-0 transition-colors
                            ${preview ? (isLight ? "text-slate-400" : "text-slate-600") : "text-cyan-400 hover:bg-cyan-500/10"}`}
                        >
                          {preview?.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                          {preview?.loading ? "Loading…" : preview?.data ? "Loaded" : "Preview"}
                        </button>
                      </div>
                      {/* Inline preview */}
                      {preview?.data && (
                        <div className={`border-t ${isLight ? "border-slate-200" : "border-[#1e2738]"} bg-black`}>
                          {preview.mime === "application/pdf" || att.filename.toLowerCase().endsWith(".pdf") ? (
                            <iframe
                              src={`data:application/pdf;base64,${preview.data}`}
                              className="w-full h-[400px]"
                              title={att.filename}
                            />
                          ) : preview.mime.startsWith("image/") ? (
                            <img
                              src={`data:${preview.mime};base64,${preview.data}`}
                              alt={att.filename}
                              className="w-full max-h-[400px] object-contain"
                            />
                          ) : (
                            <p className={`p-3 text-[11px] ${txt2}`}>Preview not available for this file type.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Action footer */}
        <div className={`shrink-0 flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-t ${hdrBg}`}>
          <button
            onClick={() => { onClose(); onAction(email, "Ignore", -1); }}
            className={`text-[12px] font-semibold px-3 py-2 rounded-lg transition-colors
              ${isLight ? "text-slate-500 hover:bg-slate-200" : "text-slate-400 hover:bg-[#1a1f2e]"}`}
          >
            🚫 Ignore
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Headley's detection from email metadata — show dedicated button */}
            {(/headley/i.test(email.from) || /headley/i.test(email.subject)) ? (
              <button
                onClick={() => { onClose(); onAction(email, "Bill", email.attachments.length > 0 ? 0 : -1); }}
                disabled={isProcessing}
                className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg transition-colors
                  ${isProcessing ? "bg-[#5c35a5]/20 text-purple-400 cursor-wait" : "bg-[#5c35a5] hover:bg-[#4a2a8a] text-white"}`}
              >
                {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : "🛒"}
                Import to Headley's
              </button>
            ) : email.attachments.length > 0 ? (
              <>
                {email.attachments.map((att, idx) => (
                  <div key={att.attachmentId} className="flex items-center gap-1.5">
                    {(["Bill", "Invoice"] as const).map(act => (
                      <button
                        key={act}
                        onClick={() => { onClose(); onAction(email, act, idx); }}
                        disabled={isProcessing}
                        className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg transition-colors
                          ${isProcessing ? "bg-cyan-500/20 text-cyan-300 cursor-wait" : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white shadow-lg shadow-cyan-500/25"}`}
                      >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : act === "Bill" ? "📄" : "🧾"}
                        {email.attachments.length > 1 ? `${att.filename.slice(0, 10)}… → ${act}` : `Create AP ${act === "Bill" ? "Bill" : "AR Invoice"}`}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              <>
                {(["Bill", "Invoice"] as const).map(act => (
                  <button
                    key={act}
                    onClick={() => { onClose(); onAction(email, act, -1); }}
                    disabled={isProcessing}
                    className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg transition-colors
                      ${isProcessing ? "bg-cyan-500/20 text-cyan-300 cursor-wait" : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white shadow-lg shadow-cyan-500/25"}`}
                  >
                    {act === "Bill" ? "📄" : "🧾"} Create {act === "Bill" ? "AP Bill" : "AR Invoice"}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────── Email Card (click to open detail)

interface EmailCardProps {
  email: ScannedEmail;
  isLight: boolean;
  onOpen: (email: ScannedEmail) => void;
}

const EmailCard: React.FC<EmailCardProps> = ({ email, isLight, onOpen }) => {
  const bg   = isLight ? "bg-white border-slate-200"   : "bg-[#141820] border-[#232b3a]";
  const txt  = isLight ? "text-slate-800"              : "text-slate-100";
  const txt2 = isLight ? "text-slate-500"              : "text-slate-400";
  const tagBg= isLight ? "bg-cyan-50 text-cyan-700 border-cyan-200" : "bg-cyan-900/30 text-cyan-300 border-cyan-700/40";

  if (email.status === "ignored") return null;
  if (email.status === "done") {
    return (
      <div className={cl("rounded-xl border p-4 flex items-center gap-3 opacity-50", bg)}>
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        <span className={`text-sm truncate ${txt2}`}>{email.subject}</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => onOpen(email)}
      className={cl("w-full text-left rounded-xl border transition-all hover:scale-[1.01] hover:shadow-lg active:scale-100 cursor-pointer", bg,
        email.status === "processing" ? "opacity-60 pointer-events-none" : ""
      )}
    >
      <div className="p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0 mt-0.5">
          {email.status === "processing"
            ? <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
            : <Mail className="w-4 h-4 text-cyan-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${txt}`}>{email.subject}</p>
          <p className={`text-[11px] truncate ${txt2}`}>{email.from}</p>
          <p className={`text-[11px] ${txt2} mt-0.5`}>{formatDate(email.date)}</p>
          {email.snippet && (
            <p className={`text-[11px] mt-1.5 leading-relaxed line-clamp-2 ${isLight ? "text-slate-400" : "text-[#5a6a80]"}`}>
              {email.snippet}
            </p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2 ml-2">
          {email.attachments.length > 0 && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tagBg}`}>
              <Paperclip className="w-2.5 h-2.5 inline mr-0.5" />
              {email.attachments.length}
            </span>
          )}
          <Eye className={`w-3.5 h-3.5 ${txt2} opacity-50`} />
        </div>
      </div>
    </button>
  );
};

// ─────────────────────────────────────────── Main Page

interface EmailInboxScannerPageProps {
  onBack?: () => void;
}

export const EmailInboxScannerPage: React.FC<EmailInboxScannerPageProps> = ({ onBack }) => {
  const { theme, logAction, setCurrentPage, setEmailPrefill, setHeadleysPrefill, apBills = [] } = useFinance() as any;
  const isLight = theme === "light";

  // ── Vendor lookup maps (mirrors AddBillModal) — used for email scan autofill ─
  const allVendorNames = useMemo(
    () => Array.from(new Set((apBills as any[]).map((b: any) => b.vendor).filter(Boolean))) as string[],
    [apBills]
  );
  const vendorCategoriesMap = useMemo(() => {
    const map: Record<string, string> = {};
    (apBills as any[]).forEach((b: any) => {
      if (b.vendor && b.category) map[b.vendor.toLowerCase().trim()] = b.category;
    });
    return map;
  }, [apBills]);
  const vendorDescriptionMap = useMemo(() => {
    const map: Record<string, string> = {};
    (apBills as any[]).forEach((b: any) => {
      if (b.vendor && b.description) map[b.vendor.toLowerCase().trim()] = b.description;
    });
    return map;
  }, [apBills]);
  const vendorEntityMap = useMemo(() => {
    const map: Record<string, { entity?: string; company?: string }> = {};
    (apBills as any[]).forEach((b: any) => {
      if (b.vendor) map[b.vendor.toLowerCase().trim()] = { entity: b.entity, company: b.company };
    });
    return map;
  }, [apBills]);

  // ── Gmail account state (auto-linked to active Google session) ───────────
  const [gmailToken, setGmailToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_TOKEN) || localStorage.getItem("google_access_token");
    } catch { return null; }
  });
  const [gmailEmail, setGmailEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_EMAIL) || null;
    } catch { return null; }
  });
  const [connecting, setConnecting] = useState(false);
  const [hasRefreshToken, setHasRefreshToken] = useState(false);

  // Fetch team-wide shared inbox status from server (auto-refreshes if token expired)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/email/shared-inbox")
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data?.ok && data?.email) {
          if (data.accessToken) setGmailToken(data.accessToken);
          setGmailEmail(data.email);
          setHasRefreshToken(!!data.hasRefreshToken);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Sync token whenever global Google auth refreshes
  useEffect(() => {
    const syncToken = () => {
      const activeTok = localStorage.getItem(LS_TOKEN) || localStorage.getItem("google_access_token");
      if (activeTok) setGmailToken(activeTok);
    };
    window.addEventListener("google-token-refreshed", syncToken);
    syncToken();
    return () => window.removeEventListener("google-token-refreshed", syncToken);
  }, []);

  // Keep localStorage in sync
  useEffect(() => {
    try {
      if (gmailToken) localStorage.setItem(LS_TOKEN, gmailToken);
      if (gmailEmail) localStorage.setItem(LS_EMAIL, gmailEmail);
    } catch {}
  }, [gmailToken, gmailEmail]);

  // ── Connect a Gmail inbox using authorization code flow (gets refresh token) ──
  // Uses initCodeClient so the server receives a refresh token — teammates never
  // need to reconnect even after the 1-hour access token expires.
  // FinanceOps Portal OAuth 2.0 client (Web application) — used for Gmail code flow
  const GMAIL_CLIENT_ID = "564960992869-clr0a355cl5u7db147461q86hmqt8100.apps.googleusercontent.com";

  const connectGmail = useCallback(() => {
    const gis = (window as any).google?.accounts?.oauth2;
    const clientId = GMAIL_CLIENT_ID;
    if (!gis || !clientId) {
      setError("Google Identity Services not loaded. Please refresh the page.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const codeClient = gis.initCodeClient({
        client_id: clientId,
        scope: GMAIL_SCOPE,
        ux_mode: "popup",
        callback: async (resp: any) => {
          setConnecting(false);
          if (resp.error) {
            if (resp.error === "popup_closed" || resp.error === "popup_failed_to_open") return;
            setError("Gmail authorization failed: " + resp.error);
            return;
          }
          const code = resp.code as string;
          try {
            // Exchange the code on the server — this yields both access + refresh tokens
            const result = await fetch("/api/email/exchange-gmail-code", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            }).then(r => r.json());

            if (!result.ok) {
              // If server exchange fails (e.g. GOOGLE_CLIENT_SECRET not yet set),
              // fall back gracefully with a clear message
              setError(
                result.error?.includes("not configured")
                  ? "Server is missing GOOGLE_CLIENT_SECRET. Add it to Render environment variables and redeploy."
                  : "Failed to connect Gmail: " + result.error
              );
              return;
            }

            setGmailEmail(result.email);
            // Use a sentinel so UI shows "connected" — actual token lives server-side
            setGmailToken("server-managed");
            localStorage.setItem(LS_EMAIL, result.email);
            localStorage.setItem(LS_TOKEN, "server-managed");
          } catch (e: any) {
            setError("Could not exchange Gmail code: " + (e?.message || e));
          }
          setQueue([]);
          setScanned(false);
          setCacheAge(null);
          try { localStorage.removeItem(CACHE_KEY); } catch {}
        },
        error_callback: (err: any) => {
          setConnecting(false);
          const code = err?.type || err?.error || "";
          if (code === "popup_closed" || code === "popup_failed_to_open") return;
          if (code === "origin_mismatch" || String(err).includes("origin")) {
            setError(
              `OAuth origin not authorized. Add https://${window.location.hostname} as an` +
              ` "Authorized JavaScript origin" in Google Cloud Console → APIs & Services →` +
              ` Credentials → OAuth 2.0 Client ID (the web client used by this portal).`
            );
          } else {
            setError("Gmail authorization failed: " + (code || JSON.stringify(err)));
          }
        },
      });
      // Force account selector so user can choose ANY email account
      codeClient.requestCode();
    } catch (e: any) {
      setConnecting(false);
      setError("Could not connect Gmail: " + (e?.message || e));
    }
  }, []);

  const disconnectGmail = useCallback(() => {
    setGmailToken(null);
    setGmailEmail(null);
    setQueue([]);
    setScanned(false);
    setCacheAge(null);
    try { localStorage.removeItem(CACHE_KEY); } catch {}
  }, []);

  const CACHE_KEY = "gmail_scan_cache";
  const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  // Restore cached results on mount (if within TTL and same Gmail account)
  const [scanning, setScanning] = useState(false);
  const [queue, setQueue] = useState<ScannedEmail[]>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      const cached = JSON.parse(raw);
      const age = Date.now() - (cached.ts || 0);
      const email = localStorage.getItem(LS_EMAIL);
      if (age < CACHE_TTL && cached.forEmail === email && Array.isArray(cached.emails)) {
        return cached.emails as ScannedEmail[];
      }
    } catch {}
    return [];
  });
  const [scanned, setScanned] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const cached = JSON.parse(raw);
      const age = Date.now() - (cached.ts || 0);
      const email = localStorage.getItem(LS_EMAIL);
      return age < CACHE_TTL && cached.forEmail === email && Array.isArray(cached.emails) && cached.emails.length >= 0;
    } catch { return false; }
  });
  const [error, setError]       = useState<string | null>(null);
  const [detailEmail, setDetailEmail] = useState<ScannedEmail | null>(null);
  const [scanRange, setScanRange] = useState<"3d"|"7d"|"14d"|"30d"|"60d"|"90d">("30d");
  const [cacheAge, setCacheAge] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      const age = Date.now() - (cached.ts || 0);
      const email = localStorage.getItem(LS_EMAIL);
      if (age < CACHE_TTL && cached.forEmail === email) return cached.ts;
    } catch {}
    return null;
  });

  // Preview modal state
  const [preview, setPreview] = useState<{
    email: ScannedEmail;
    attachment: EmailAttachment | null;
    action: "Bill" | "Invoice";
    data: ExtractedData;
  } | null>(null);

  // ── Theme tokens ───────────────────────────────────────────────────────────
  const pageBg  = isLight ? "bg-slate-100"   : "bg-[#0a0a0a]";
  const cardBg  = isLight ? "bg-white border-slate-200"   : "bg-[#111520] border-[#1e2535]";
  const txt     = isLight ? "text-slate-800"  : "text-slate-100";
  const txt2    = isLight ? "text-slate-500"  : "text-slate-400";

  // ── Scan inbox ─────────────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    const activeToken = gmailToken || localStorage.getItem("google_access_token") || "";
    setScanning(true);
    setError(null);
    try {
      const resp = await fetch("/api/email/scan-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: activeToken, newerThan: scanRange }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) throw new Error(json.details || json.error || "Scan failed");
      const emails: ScannedEmail[] = (json.emails || []).map((e: any) => ({
        ...e,
        status: "pending" as const,
        selectedAttachmentIdx: 0,
      }));
      setQueue(emails);
      setScanned(true);
      const ts = Date.now();
      setCacheAge(ts);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ emails, ts, forEmail: gmailEmail, range: scanRange }));
      } catch {}
      logAction?.("Email Inbox Scanned", `Found ${emails.length} financial emails`);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setScanning(false);
    }
  }, [gmailToken, scanRange, gmailEmail, logAction]);

  // ── Handle action selection ────────────────────────────────────────────────
  const handleAction = useCallback(async (
    email: ScannedEmail,
    action: "Bill" | "Invoice" | "Ignore",
    attachIdx: number
  ) => {
    if (action === "Ignore") {
      setQueue(prev => prev.map(e => e.id === email.id ? { ...e, status: "ignored" } : e));
      return;
    }

    const token = gmailToken;
    if (!token) { setError("Gmail inbox not connected. Please connect an inbox first."); return; }

    // Mark processing
    setQueue(prev => prev.map(e => e.id === email.id ? { ...e, status: "processing" } : e));
    setDetailEmail(prev => prev?.id === email.id ? { ...prev, status: "processing" } : prev);

    try {
      const att = email.attachments[attachIdx];

      // No attachment path — pre-fill from email metadata and navigate to AP/AR (or Headley's)
      if (!att) {
        const vendorRaw = email.from.replace(/<[^>]+>/g, "").trim();
        // Detect Headley's from email metadata
        if (/headley/i.test(vendorRaw) || /headley/i.test(email.from) || /headley/i.test(email.subject)) {
          setQueue(prev => prev.map(e => e.id === email.id ? { ...e, status: "done" } : e));
          setDetailEmail(null);
          setHeadleysPrefill?.({ rawText: "" });
          setCurrentPage?.("headleys");
          return;
        }
        // Fuzzy-match vendor to closest known vendor, then autofill from bill history
        const resolvedVendor = fuzzyBest(vendorRaw, allVendorNames);
        const vendorKey = resolvedVendor.toLowerCase().trim();
        const emailLink = `https://mail.google.com/mail/u/0/#inbox/${email.id}`;
        const extracted: ExtractedData = {
          vendor:      resolvedVendor,
          invoiceNo:   undefined,
          amount:      null,
          dueDate:     null,
          issueDate:   null,
          entity:      vendorEntityMap[vendorKey]?.entity || "",
          description: vendorDescriptionMap[vendorKey] || email.subject,
          remarks:     emailLink,
        };
        setQueue(prev => prev.map(e => e.id === email.id ? { ...e, status: "done" } : e));
        setDetailEmail(null);
        setEmailPrefill?.({ type: action === "Bill" ? "bill" : "invoice", data: extracted });
        setCurrentPage?.(action === "Bill" ? "ap" : "ar");
        return;
      }

      // 1. Fetch attachment from Gmail via server proxy
      const attResp = await fetch(
        `/api/email/attachment/${email.id}/${att.attachmentId}?accessToken=${encodeURIComponent(token)}`
      );
      const attText = await attResp.text();
      let attJson: any = null;
      try { attJson = JSON.parse(attText); } catch { attJson = null; }
      if (!attResp.ok || !attJson || !attJson.ok || !attJson.data) {
        throw new Error(attJson?.error || `Failed to fetch attachment (${attResp.status})`);
      }

      const base64 = attJson.data as string;

      // 2. Scan with Gemini via /api/invoice/scan
      const scanResp = await fetch("/api/invoice/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: att.mimeType }),
      });
      const scanText = await scanResp.text();
      let scanJson: any = null;
      try { scanJson = JSON.parse(scanText); } catch { scanJson = null; }
      if (!scanResp.ok || !scanJson || !scanJson.ok) {
        throw new Error(scanJson?.error || scanJson?.details || (scanResp.status === 413 ? "Attachment too large (max 50MB)" : `Scan failed (${scanResp.status})`));
      }
      bumpGeminiCounter("email");
      // Server returns { ok: true, invoice: { vendor, invoiceNo, ... } }
      const inv = scanJson.invoice || scanJson;

      // 3. Pre-populate with email metadata if Gemini left fields empty
      const rawVendor = inv.vendor || email.from.replace(/<[^>]+>/g, "").trim();
      // Fuzzy-match vendor to closest known vendor, then autofill from bill history
      const resolvedVendor = fuzzyBest(rawVendor, allVendorNames);
      const vendorKey = resolvedVendor.toLowerCase().trim();
      const emailLink = `https://mail.google.com/mail/u/0/#inbox/${email.id}`;
      const extracted: ExtractedData = {
        vendor:      resolvedVendor,
        invoiceNo:   inv.invoiceNo   || null,
        amount:      inv.amount      ?? null,
        dueDate:     inv.dueDate     || null,
        issueDate:   inv.issueDate   || null,
        entity:      inv.entity      || vendorEntityMap[vendorKey]?.entity || "",
        description: inv.description || vendorDescriptionMap[vendorKey] || email.subject,
        remarks:     emailLink,
      };

      // 4. Route based on vendor — Headley's goes to the dedicated import tool
      const vendorStr = extracted.vendor?.toLowerCase() || "";
      const isHeadleys = vendorStr.includes("headley") ||
                         email.from.toLowerCase().includes("headley") ||
                         email.subject.toLowerCase().includes("headley");

      setQueue(prev => prev.map(e => e.id === email.id ? { ...e, status: "done" } : e));
      setDetailEmail(null);

      if (isHeadleys) {
        // Re-scan with Headley's endpoint to extract raw tabular text
        let rawText = "";
        try {
          const hdlResp = await fetch("/api/headleys/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64, mimeType: att.mimeType }),
          });
          const hdlJson = await hdlResp.json();
          if (hdlJson.ok) rawText = hdlJson.text || "";
        } catch {}
        setHeadleysPrefill?.({ rawText });
        setCurrentPage?.("headleys");
        return;
      }

      // Non-Headley's: navigate to AP/AR page with pre-filled data
      setEmailPrefill?.({ type: action === "Bill" ? "bill" : "invoice", data: extracted });
      setCurrentPage?.(action === "Bill" ? "ap" : "ar");
    } catch (e: any) {
      console.error("[EmailScanner]", e);
      setError(e?.message || "Failed to process attachment");
      setQueue(prev => prev.map(e => e.id === email.id ? { ...e, status: "pending" } : e));
    }
  }, [gmailToken, allVendorNames, vendorEntityMap, vendorDescriptionMap]);

  // ── Confirm from modal ─────────────────────────────────────────────────────
  const handleConfirm = useCallback(async (data: ExtractedData) => {
    if (!preview) return;
    const { email, action } = preview;
    setPreview(null);

    try {
      if (action === "Bill") {
        const resp = await fetch("/api/ap/add-scanned-bill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor:      data.vendor      || "Unknown",
            entity:      data.entity      || "",
            invoiceNo:   data.invoiceNo   || "",
            amount:      data.amount      ?? 0,
            dueDate:     data.dueDate     || "",
            issueDate:   data.issueDate   || "",
            description: data.description || "",
            remarks:     data.remarks     || "",
          }),
        });
        if (!resp.ok) throw new Error("Failed to create bill");
        logAction?.("Bill Created from Email", `${data.vendor} – ${data.invoiceNo || "no inv#"}`);
      } else {
        // Invoice — saved to AR data
        const resp = await fetch("/api/ar/add-scanned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client:      data.vendor      || "Unknown",
            vendor:      data.vendor      || "Unknown",
            invoiceNo:   data.invoiceNo   || "",
            amount:      data.amount      ?? 0,
            dueDate:     data.dueDate     || "",
            issueDate:   data.issueDate   || "",
            entity:      data.entity      || "",
            description: data.description || "",
            remarks:     data.remarks     || "",
          }),
        });
        if (!resp.ok) throw new Error("Failed to create invoice");
        logAction?.("Invoice Created from Email", `${data.vendor} – ${data.invoiceNo || "no inv#"}`);
      }

      setQueue(prev => prev.map(e => e.id === email.id ? { ...e, status: "done" } : e));
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    }
  }, [preview, logAction]);

  // ── Counts ─────────────────────────────────────────────────────────────────
  const pendingCount = queue.filter(e => e.status === "pending").length;
  const doneCount    = queue.filter(e => e.status === "done").length;
  const ignoredCount = queue.filter(e => e.status === "ignored").length;

  // ─────────────────────────────────────────── Render

  return (
    <div className={`flex flex-col h-full min-h-0 ${pageBg}`}>
      {/* Page header */}
      <div className="bg-gradient-to-r from-[#070b12] via-cyan-950/60 to-[#070b12] border-b border-white/8 px-6 py-4 flex items-center gap-4 shrink-0">
        <button
          onClick={() => { if (onBack) onBack(); else setCurrentPage?.("workspace-tools"); }}
          className="flex items-center gap-1.5 text-sm text-[#7a8394] hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />Back
        </button>
        <div className="h-5 w-px bg-white/10" />
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-xl shadow-cyan-500/30">
          <Mail className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-white font-bold text-base leading-tight">Email Invoice Scanner</h1>
          <p className="text-[#7a8394] text-xs">
            {gmailEmail ? `Scanning: ${gmailEmail}` : "Connect a Gmail inbox to scan for invoices and bills"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-5 flex flex-col gap-4">
        {/* ── Account chooser card ─────────────────────────────────────────── */}
        <div className={cl("rounded-xl border p-4", cardBg)}>
          <p className={`text-[11px] font-bold uppercase tracking-wider ${txt2} mb-3`}>Gmail Inbox</p>

          {gmailEmail ? (
            /* Connected (or stale) state — token may be null if expired */
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${gmailToken ? "bg-cyan-500/15" : "bg-red-500/15"}`}>
                  <UserCircle2 className={`w-5 h-5 ${gmailToken ? "text-cyan-400" : "text-amber-500"}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${txt}`}>{gmailEmail}</p>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shrink-0">
                      Team Shared
                    </span>
                  </div>
                  <p className={`text-[11px] ${gmailToken ? txt2 : "text-amber-500"}`}>
                    {gmailToken
                      ? hasRefreshToken
                        ? "Permanently connected · Auto-renews · Accessible to all team members"
                        : "Shared Gmail connected · Accessible to all team members (reconnect to make permanent)"
                      : "Session expired — reconnect to refresh team access"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={connectGmail}
                  disabled={connecting}
                  className={cl(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors",
                    isLight
                      ? "border-slate-300 text-slate-600 hover:bg-slate-50"
                      : "border-[#2a3140] text-slate-300 hover:bg-white/5"
                  )}
                >
                  {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                  Change Account
                </button>
                <button
                  onClick={disconnectGmail}
                  className={cl(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors",
                    isLight ? "text-red-500 hover:bg-red-50" : "text-red-400 hover:bg-red-950/20"
                  )}
                >
                  <LogOut className="w-3.5 h-3.5" /> Disconnect
                </button>
              </div>
            </div>
          ) : (
            /* Not connected state */
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className={`text-sm font-semibold ${txt}`}>No inbox connected</p>
                <p className={`text-[11px] ${txt2} mt-0.5`}>
                  Choose which Gmail account to scan. This can be different from your portal login.
                </p>
              </div>
              <button
                onClick={connectGmail}
                disabled={connecting}
                className={cl(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shrink-0",
                  connecting
                    ? "bg-cyan-500/40 text-cyan-200 cursor-wait"
                    : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white shadow-lg shadow-cyan-500/25"
                )}
              >
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {connecting ? "Opening…" : "Connect Inbox"}
              </button>
            </div>
          )}
        </div>

        {/* ── Scan trigger row ─────────────────────────────────────────────── */}
        <div className={cl("rounded-xl border p-4 space-y-3", cardBg)}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className={`text-sm font-semibold ${txt}`}>Scan for Financial Emails</p>
              <p className={`text-[11px] ${txt2} mt-0.5`}>
                Searches for invoice, bill, statement, or payment keywords (with or without attachments).
              </p>
              {cacheAge && !scanning && (
                <p className="text-[11px] text-cyan-400 mt-1 font-medium">
                  ✓ Results cached · scanned {Math.round((Date.now() - cacheAge) / 60000)} min ago · auto-expires in {Math.max(0, 30 - Math.round((Date.now() - cacheAge) / 60000))} min
                </p>
              )}
            </div>
            <button
              onClick={handleScan}
              disabled={scanning || !gmailEmail || !gmailToken}
              className={cl(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shrink-0",
                (!gmailEmail || !gmailToken)
                  ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                  : scanning
                    ? "bg-cyan-500/40 text-cyan-200 cursor-wait"
                    : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white shadow-lg shadow-cyan-500/25"
              )}
            >
              {scanning
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : scanned ? <RefreshCw className="w-4 h-4" /> : <Search className="w-4 h-4" />
              }
              {scanning ? "Scanning…" : scanned ? "Re-scan" : "Scan Inbox"}
            </button>
          </div>

          {/* Date range selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-semibold shrink-0 ${txt2}`}>Search range:</span>
            {([
              { label: "Last 3 days",  value: "3d"  },
              { label: "Last week",    value: "7d"  },
              { label: "Last 2 weeks", value: "14d" },
              { label: "Last month",   value: "30d" },
              { label: "Last 2 months",value: "60d" },
              { label: "Last 3 months",value: "90d" },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  setScanRange(opt.value);
                  // Clear cache when range changes so stale results don't show
                  if (opt.value !== scanRange) {
                    setQueue([]); setScanned(false); setCacheAge(null);
                    try { localStorage.removeItem(CACHE_KEY); } catch {}
                  }
                }}
                className={cl(
                  "text-[11px] font-semibold px-3 py-1 rounded-lg border transition-colors",
                  scanRange === opt.value
                    ? "bg-cyan-500 border-cyan-500 text-white"
                    : isLight
                      ? "border-slate-300 text-slate-600 hover:border-cyan-500 hover:text-cyan-400"
                      : "border-[#2a3140] text-slate-400 hover:border-cyan-500 hover:text-cyan-400"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className={cl("rounded-xl border px-4 py-3 flex items-start gap-3",
            isLight ? "bg-red-50 border-red-200" : "bg-red-950/20 border-red-900/40"
          )}>
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className={`text-sm font-semibold ${isLight ? "text-red-700" : "text-red-400"}`}>Error</p>
              <p className={`text-[12px] ${isLight ? "text-red-600" : "text-red-300"}`}>{error}</p>
              {error.includes("scope") || error.includes("permission") || error.includes("auth") ? (
                <p className={`text-[11px] mt-1.5 ${isLight ? "text-red-500" : "text-red-400"}`}>
                  The Gmail read scope may not be authorized yet. Sign out and sign back in to grant Gmail access.
                </p>
              ) : null}
            </div>
            <button onClick={() => setError(null)} className={`ml-auto p-1 ${isLight ? "text-red-400 hover:text-red-600" : "text-red-500 hover:text-red-300"}`}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Stats row */}
        {scanned && queue.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "Pending Review", value: pendingCount, color: "text-amber-500" },
              { label: "Created",        value: doneCount,    color: "text-emerald-500" },
              { label: "Ignored",        value: ignoredCount, color: isLight ? "text-slate-400" : "text-slate-500" },
            ].map(({ label, value, color }) => (
              <div key={label} className={cl("rounded-xl border p-3 text-center", cardBg)}>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className={`text-[10px] uppercase tracking-wider font-bold ${txt2}`}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Queue */}
        {scanned && (
          queue.length === 0 ? (
            <div className={cl("rounded-xl border p-10 flex flex-col items-center gap-3 text-center", cardBg)}>
              <Inbox className={`w-10 h-10 ${txt2} opacity-40`} />
              <p className={`text-sm font-semibold ${txt2}`}>No matching emails found</p>
              <p className={`text-[12px] ${txt2} opacity-70`}>
                No emails with financial keywords were found in the last 30 days.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {queue.map(email => (
                <EmailCard
                  key={email.id}
                  email={email}
                  isLight={isLight}
                  onOpen={setDetailEmail}
                />
              ))}
            </div>
          )
        )}

        {/* Empty state before scan */}
        {!scanned && !scanning && (
          <div className={cl("rounded-xl border p-10 flex flex-col items-center gap-3 text-center", cardBg)}>
            <Mail className={`w-10 h-10 ${txt2} opacity-30`} />
            <p className={`text-sm font-semibold ${txt}`}>Ready to scan</p>
            <p className={`text-[12px] ${txt2}`}>
              Click "Scan Inbox" to search your Gmail for all financial emails from the last 30 days.
            </p>
          </div>
        )}
      </div>

      {/* Email Detail Modal */}
      {detailEmail && (
        <EmailDetailModal
          email={detailEmail}
          isLight={isLight}
          gmailToken={gmailToken}
          onAction={(email, action, attachIdx) => {
            setDetailEmail(null);
            handleAction(email, action, attachIdx);
          }}
          onClose={() => setDetailEmail(null)}
        />
      )}

      {/* PreviewModal removed — actions now navigate directly to AP/AR native modals */}
    </div>
  );
};

