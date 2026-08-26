import React, { useState, useCallback, useEffect } from "react";
import { useFinance } from "../../context/FinanceContext";
import firebaseConfig from "../../../firebase-applet-config.json";
import {
  Mail, Search, Loader2, AlertTriangle, CheckCircle2,
  FileText, ChevronDown, X, Eye, Inbox, RefreshCw,
  ChevronLeft, Paperclip, LogIn, LogOut, UserCircle2
} from "lucide-react";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/oauth2/v3.userinfo.email";
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
  attachment: EmailAttachment;
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
    ? "bg-slate-50 border-slate-300 text-slate-800 focus:ring-violet-400"
    : "bg-[#1e2435] border-[#2a3140] text-slate-100 focus:ring-violet-500";
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
            <div className="w-8 h-8 rounded-lg bg-[#7c3aed] flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className={`font-bold text-sm ${txt}`}>Create as {action}</h2>
              <p className={`text-[11px] ${txt2} truncate max-w-[260px]`}>{attachment.filename}</p>
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
            className="text-xs px-5 py-2 rounded-lg text-white font-semibold bg-[#7c3aed] hover:bg-[#6d28d9] transition-colors"
          >
            ✓ Confirm &amp; Create {action}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────── Email Card

interface EmailCardProps {
  email: ScannedEmail;
  isLight: boolean;
  onAction: (email: ScannedEmail, action: "Bill" | "Invoice" | "Ignore", attachIdx: number) => void;
}

const EmailCard: React.FC<EmailCardProps> = ({ email, isLight, onAction }) => {
  const [open, setOpen] = useState(false);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const bg   = isLight ? "bg-white border-slate-200"         : "bg-[#141820] border-[#232b3a]";
  const txt  = isLight ? "text-slate-800"                    : "text-slate-100";
  const txt2 = isLight ? "text-slate-500"                    : "text-slate-400";
  const snip = isLight ? "text-slate-600"                    : "text-[#8090a8]";
  const tagBg= isLight ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-violet-900/30 text-violet-300 border-violet-700/40";

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
    <div className={cl("rounded-xl border transition-all", bg)}>
      {/* Header row */}
      <div className="p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#7c3aed]/10 flex items-center justify-center shrink-0 mt-0.5">
          <Mail className="w-4 h-4 text-[#7c3aed]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${txt}`}>{email.subject}</p>
          <p className={`text-[11px] truncate ${txt2}`}>{email.from}</p>
          <p className={`text-[11px] ${txt2} mt-0.5`}>{formatDate(email.date)}</p>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          className={`p-1.5 rounded-lg ${txt2} hover:opacity-70 transition-opacity`}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Snippet */}
      {open && (
        <div className={`px-4 pb-3 text-[12px] leading-relaxed ${snip}`}>
          {email.snippet}
        </div>
      )}

      {/* Attachments */}
      <div className="px-4 pb-4 flex flex-col gap-2">
        {email.attachments.map((att, idx) => (
          <div key={att.attachmentId} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${isLight ? "border-slate-100 bg-slate-50" : "border-[#1e2738] bg-[#0e1420]"}`}>
            <Paperclip className="w-3.5 h-3.5 text-[#7c3aed] shrink-0" />
            <span className={`text-[12px] flex-1 truncate font-medium ${txt}`}>{att.filename}</span>
            <span className={`text-[11px] ${txt2} shrink-0`}>{formatBytes(att.size)}</span>

            {/* Action dropdown */}
            <div className="relative">
              <button
                onClick={() => setDropIdx(dropIdx === idx ? null : idx)}
                disabled={email.status === "processing"}
                className={cl(
                  "flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors",
                  email.status === "processing"
                    ? "bg-[#7c3aed]/20 text-violet-400 cursor-wait"
                    : "bg-[#7c3aed] hover:bg-[#6d28d9] text-white"
                )}
              >
                {email.status === "processing" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Scan & Create
                <ChevronDown className="w-3 h-3" />
              </button>
              {dropIdx === idx && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDropIdx(null)} />
                  <div className={cl(
                    "absolute right-0 top-full mt-1 z-20 w-36 rounded-xl border shadow-xl overflow-hidden",
                    isLight ? "bg-white border-slate-200" : "bg-[#181c24] border-[#2a3140]"
                  )}>
                    {(["Bill", "Invoice"] as const).map(action => (
                      <button
                        key={action}
                        onClick={() => { setDropIdx(null); onAction(email, action, idx); }}
                        className={cl(
                          "w-full text-left px-3 py-2 text-[12px] font-medium transition-colors",
                          isLight ? "text-slate-700 hover:bg-violet-50" : "text-slate-200 hover:bg-violet-900/20"
                        )}
                      >
                        {action === "Bill" ? "📄" : "🧾"} Create as {action}
                      </button>
                    ))}
                    <div className={`border-t ${isLight ? "border-slate-100" : "border-[#2a3140]"}`} />
                    <button
                      onClick={() => { setDropIdx(null); onAction(email, "Ignore", idx); }}
                      className={cl(
                        "w-full text-left px-3 py-2 text-[12px] font-medium transition-colors",
                        isLight ? "text-slate-500 hover:bg-slate-50" : "text-slate-400 hover:bg-[#1a1f2e]"
                      )}
                    >
                      🚫 Ignore
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Badge */}
      <div className={`px-4 pb-3 flex items-center gap-1.5`}>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tagBg}`}>
          {email.attachments.length} attachment{email.attachments.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────── Main Page

interface EmailInboxScannerPageProps {
  onBack?: () => void;
}

export const EmailInboxScannerPage: React.FC<EmailInboxScannerPageProps> = ({ onBack }) => {
  const { theme, logAction, setCurrentPage } = useFinance() as any;
  const isLight = theme === "light";

  // ── Gmail account state (separate from portal login) ───────────────────────
  const [gmailToken, setGmailToken] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_TOKEN); } catch { return null; }
  });
  const [gmailEmail, setGmailEmail] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_EMAIL); } catch { return null; }
  });
  const [connecting, setConnecting] = useState(false);

  // Keep localStorage in sync
  useEffect(() => {
    try {
      if (gmailToken) localStorage.setItem(LS_TOKEN, gmailToken);
      else localStorage.removeItem(LS_TOKEN);
      if (gmailEmail) localStorage.setItem(LS_EMAIL, gmailEmail);
      else localStorage.removeItem(LS_EMAIL);
    } catch {}
  }, [gmailToken, gmailEmail]);

  // ── Connect a Gmail inbox ──────────────────────────────────────────────────
  const connectGmail = useCallback(() => {
    const gis = (window as any).google?.accounts?.oauth2;
    const clientId = (firebaseConfig as any).oAuthClientId;
    if (!gis || !clientId) {
      setError("Google Identity Services not loaded. Please refresh the page.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const tokenClient = gis.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        callback: async (resp: any) => {
          setConnecting(false);
          if (resp.error) {
            setError("Gmail authorization failed: " + resp.error);
            return;
          }
          const tok = resp.access_token as string;
          setGmailToken(tok);
          // Fetch the chosen account's email address
          try {
            const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: "Bearer " + tok }
            }).then(r => r.json());
            setGmailEmail(info.email || null);
          } catch {
            setGmailEmail(null);
          }
          // Reset queue so user re-scans with the new inbox
          setQueue([]);
          setScanned(false);
        },
        error_callback: (err: any) => {
          setConnecting(false);
          const code = err?.type || err?.error || "";
          if (code === "popup_closed" || code === "popup_failed_to_open") return;
          // origin_mismatch = Render URL not yet in Google Cloud Console
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
      // prompt:"select_account" forces the Google account chooser every time
      tokenClient.requestAccessToken({ prompt: "select_account" });
    } catch (e: any) {
      setConnecting(false);
      setError("Could not open account picker: " + (e?.message || e));
    }
  }, []);

  const disconnectGmail = useCallback(() => {
    setGmailToken(null);
    setGmailEmail(null);
    setQueue([]);
    setScanned(false);
  }, []);

  const [scanning, setScanning] = useState(false);
  const [queue, setQueue]       = useState<ScannedEmail[]>([]);
  const [scanned, setScanned]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Preview modal state
  const [preview, setPreview] = useState<{
    email: ScannedEmail;
    attachment: EmailAttachment;
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
    if (!gmailToken) {
      setError("No Gmail inbox connected. Click 'Connect Inbox' to choose an email account.");
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const resp = await fetch("/api/email/scan-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: gmailToken, maxResults: 50 }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) throw new Error(json.error || json.details || "Scan failed");
      const emails: ScannedEmail[] = (json.emails || []).map((e: any) => ({
        ...e,
        status: "pending" as const,
        selectedAttachmentIdx: 0,
      }));
      setQueue(emails);
      setScanned(true);
      logAction?.("Email Inbox Scanned", `Found ${emails.length} financial emails`);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setScanning(false);
    }
  }, [logAction]);

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

    try {
      const att = email.attachments[attachIdx];

      // 1. Fetch attachment from Gmail via server proxy
      const attResp = await fetch(
        `/api/email/attachment/${email.id}/${att.attachmentId}?accessToken=${encodeURIComponent(token)}`
      );
      const attJson = await attResp.json();
      if (!attResp.ok || !attJson.ok) throw new Error(attJson.error || "Failed to fetch attachment");

      const base64 = attJson.data as string;

      // 2. Scan with Gemini via /api/invoice/scan
      const scanResp = await fetch("/api/invoice/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: att.mimeType }),
      });
      const scanJson = await scanResp.json();
      if (!scanResp.ok) throw new Error(scanJson.error || "Scan failed");

      // 3. Pre-populate with email metadata if Gemini left fields empty
      const extracted: ExtractedData = {
        vendor:      scanJson.vendor      || email.from.replace(/<[^>]+>/g, "").trim(),
        invoiceNo:   scanJson.invoiceNo   || null,
        amount:      scanJson.amount      ?? null,
        dueDate:     scanJson.dueDate     || null,
        issueDate:   scanJson.issueDate   || null,
        entity:      scanJson.entity      || "",
        description: scanJson.description || email.subject,
        remarks:     scanJson.remarks     || `Imported from email on ${new Date().toLocaleDateString()}`,
      };

      // Reset processing state while modal is open
      setQueue(prev => prev.map(e => e.id === email.id ? { ...e, status: "pending" } : e));

      // 4. Show preview modal
      setPreview({ email, attachment: att, action, data: extracted });
    } catch (e: any) {
      console.error("[EmailScanner]", e);
      setError(e?.message || "Failed to process attachment");
      setQueue(prev => prev.map(e => e.id === email.id ? { ...e, status: "pending" } : e));
    }
  }, []);

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
      <div className="bg-[#7c3aed] px-5 py-4 flex items-center gap-3 shrink-0">
        <button
          onClick={() => { if (onBack) onBack(); else setCurrentPage?.("workspace-tools"); }}
          className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
          <Mail className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-white font-bold text-sm">Email Invoice Scanner</h1>
          <p className="text-white/60 text-[11px]">
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
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${gmailToken ? "bg-[#7c3aed]/15" : "bg-amber-500/15"}`}>
                  <UserCircle2 className={`w-5 h-5 ${gmailToken ? "text-[#7c3aed]" : "text-amber-500"}`} />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${txt}`}>{gmailEmail}</p>
                  <p className={`text-[11px] ${gmailToken ? txt2 : "text-amber-500"}`}>
                    {gmailToken ? "Gmail connected · read-only access" : "Session expired — reconnect to scan"}
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
                    ? "bg-[#7c3aed]/40 text-violet-300 cursor-wait"
                    : "bg-[#7c3aed] hover:bg-[#6d28d9] text-white"
                )}
              >
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {connecting ? "Opening…" : "Connect Inbox"}
              </button>
            </div>
          )}
        </div>

        {/* ── Scan trigger row ─────────────────────────────────────────────── */}
        <div className={cl("rounded-xl border p-4 flex items-center justify-between gap-4", cardBg)}>
          <div>
            <p className={`text-sm font-semibold ${txt}`}>Scan for Financial Emails</p>
            <p className={`text-[11px] ${txt2} mt-0.5`}>
              Searches last 30 days for emails with invoice, bill, statement, or payment keywords (with or without PDF attachments).
            </p>
          </div>
          <button
            onClick={handleScan}
            disabled={scanning || !gmailEmail || !gmailToken}
            className={cl(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shrink-0",
              (!gmailEmail || !gmailToken)
                ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                : scanning
                  ? "bg-[#7c3aed]/40 text-violet-300 cursor-wait"
                  : "bg-[#7c3aed] hover:bg-[#6d28d9] text-white"
            )}
          >
            {scanning
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : scanned ? <RefreshCw className="w-4 h-4" /> : <Search className="w-4 h-4" />
            }
            {scanning ? "Scanning…" : scanned ? "Re-scan" : "Scan Inbox"}
          </button>
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
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pending Review", value: pendingCount, color: "text-violet-500" },
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
                No emails with financial keywords and PDF attachments were found in the last 30 days.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {queue.map(email => (
                <EmailCard
                  key={email.id}
                  email={email}
                  isLight={isLight}
                  onAction={handleAction}
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
              Click "Scan Inbox" to search your Gmail for financial emails from the last 30 days.
              Only emails with PDF attachments are included.
            </p>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {preview && (
        <PreviewModal
          email={preview.email}
          attachment={preview.attachment}
          action={preview.action}
          data={preview.data}
          isLight={isLight}
          onClose={() => {
            setQueue(prev => prev.map(e => e.id === preview.email.id ? { ...e, status: "pending" } : e));
            setPreview(null);
          }}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
};
