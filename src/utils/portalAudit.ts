/**
 * portalAudit.ts
 *
 * Runs a health-check sweep of the portal's in-memory financial state
 * and returns a prioritised list of findings. Designed to be called once
 * every 48 hours (gated by localStorage timestamp) so the user gets a
 * lightweight "what needs attention" report without manual inspection.
 */

export type AuditSeverity = "critical" | "warning" | "improvement";

export interface AuditFinding {
  id: string;
  severity: AuditSeverity;
  title: string;
  detail: string;
  action?: {
    label: string;
    /** FinanceContext currentPage value to navigate to */
    page?: string;
  };
}

export interface AuditResult {
  /** Unix ms timestamp of when the audit ran */
  ts: number;
  findings: AuditFinding[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const AUDIT_KEY      = "financeops_last_audit";
const AUDIT_INTERVAL = 48 * 60 * 60 * 1000; // 48 h

export function shouldRunAudit(): boolean {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    if (!raw) return true;
    const { ts } = JSON.parse(raw) as AuditResult;
    return Date.now() - ts > AUDIT_INTERVAL;
  } catch {
    return true;
  }
}

export function saveAuditResult(result: AuditResult): void {
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(result));
  } catch {}
}

export function getLastAuditResult(): AuditResult | null {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    return raw ? (JSON.parse(raw) as AuditResult) : null;
  } catch {
    return null;
  }
}

// ─── Checks ─────────────────────────────────────────────────────────────────

export interface AuditInput {
  apBills:      any[];
  bankAccounts: any[];
  loans:        any[];
  arItems:      any[];
  lastSyncedAt: string | null;
  syncLogs:     any[];
}

export function runPortalAudit(data: AuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const now = Date.now();

  // ── 1. Data freshness ───────────────────────────────────────────────────
  if (data.lastSyncedAt) {
    const ageH = (now - new Date(data.lastSyncedAt).getTime()) / 3_600_000;
    if (ageH > 6) {
      findings.push({
        id:       "stale-sync",
        severity: "warning",
        title:    `Data not synced in ${Math.round(ageH)}h`,
        detail:   "Live Sheets data may differ from what the portal is showing. A fresh pull keeps figures accurate.",
        action:   { label: "Go to Data Sync", page: "datasync" },
      });
    }
  }

  // ── 2. AP: bills with clearly missing required fields ───────────────────
  const malformed = data.apBills.filter(
    (b: any) => !b.vendor && !b.amount && !b.entity
  );
  if (malformed.length > 0) {
    findings.push({
      id:       "ap-malformed",
      severity: "warning",
      title:    `${malformed.length} AP bill(s) missing vendor, amount & entity`,
      detail:   "These bills may be incomplete scan entries that weren't reviewed after capture.",
      action:   { label: "Review AP Bills", page: "ap" },
    });
  }

  // ── 3. AP: unpaid bills overdue > 60 days ───────────────────────────────
  const overdueCutoff = 60 * 86_400_000;
  const overdueBills  = data.apBills.filter((b: any) => {
    const paid = ["paid","Paid","PAID"].includes(b.status || "");
    if (paid || !b.dueDate) return false;
    return now - new Date(b.dueDate).getTime() > overdueCutoff;
  });
  if (overdueBills.length > 0) {
    const total = overdueBills.reduce(
      (s: number, b: any) => s + (parseFloat(b.amount) || 0), 0
    );
    findings.push({
      id:       "ap-overdue",
      severity: "critical",
      title:    `${overdueBills.length} unpaid bill(s) overdue > 60 days`,
      detail:   `Combined exposure: $${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Immediate follow-up recommended.`,
      action:   { label: "View AP Bills", page: "ap" },
    });
  }

  // ── 4. Bank: negative balances ──────────────────────────────────────────
  const negAccounts = data.bankAccounts.filter(
    (b: any) => (parseFloat(b.balance) || 0) < 0
  );
  if (negAccounts.length > 0) {
    findings.push({
      id:       "bank-negative",
      severity: "critical",
      title:    `${negAccounts.length} bank account(s) with negative balance`,
      detail:   negAccounts
        .map((b: any) => `${b.name || b.bank || "Account"}: $${Number(b.balance).toLocaleString()}`)
        .join(" · "),
      action:   { label: "View Bank Accounts", page: "banks" },
    });
  }

  // ── 5. AR: overdue > 90 days ────────────────────────────────────────────
  const arCutoff   = 90 * 86_400_000;
  const overdueAR  = data.arItems.filter((a: any) => {
    const paid = ["paid","Paid","PAID"].includes(a.status || "");
    if (paid) return false;
    const dt = a.dueDate || a.date;
    if (!dt) return false;
    return now - new Date(dt).getTime() > arCutoff;
  });
  if (overdueAR.length > 0) {
    const total = overdueAR.reduce(
      (s: number, a: any) => s + (parseFloat(a.amount) || 0), 0
    );
    findings.push({
      id:       "ar-overdue",
      severity: "warning",
      title:    `${overdueAR.length} AR receivable(s) overdue > 90 days`,
      detail:   `$${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} outstanding. Consider sending follow-up invoices.`,
      action:   { label: "View Accounts Receivable", page: "ar" },
    });
  }

  // ── 6. Loans: payment date past ─────────────────────────────────────────
  const overdueLoans = data.loans.filter((l: any) => {
    if (!l.nextPaymentDate) return false;
    return now > new Date(l.nextPaymentDate).getTime();
  });
  if (overdueLoans.length > 0) {
    findings.push({
      id:       "loans-overdue",
      severity: "critical",
      title:    `${overdueLoans.length} loan payment(s) past due date`,
      detail:   overdueLoans
        .map((l: any) => l.name || l.lender || "Loan")
        .join(", "),
      action:   { label: "View Loans", page: "loans" },
    });
  }

  // ── 7. Sync errors in last 24 h ─────────────────────────────────────────
  const recentErrors = (data.syncLogs || []).filter((l: any) => {
    if (!l.ts && !l.timestamp) return false;
    const ts  = l.ts || l.timestamp;
    const age = now - new Date(ts).getTime();
    if (age > 86_400_000) return false;
    const msg = (l.message || l.action || "").toLowerCase();
    return l.type === "error" || l.status === "error" || msg.includes("error") || msg.includes("fail");
  });
  if (recentErrors.length > 0) {
    findings.push({
      id:       "sync-errors",
      severity: "warning",
      title:    `${recentErrors.length} sync error(s) logged in the last 24 hours`,
      detail:   "Review the Data Sync page for details and re-sync affected modules.",
      action:   { label: "View Sync Log", page: "datasync" },
    });
  }

  // ── 8. Improvement: no local cache (cold start) ─────────────────────────
  try {
    const hasCache = !!localStorage.getItem("financeops_data_cache_v2");
    if (!hasCache) {
      findings.push({
        id:       "no-cache",
        severity: "improvement",
        title:    "No local data cache — first load will always hit live Sheets",
        detail:   "Performing a full sync now will warm the cache for instant paint on your next visit.",
        action:   { label: "Warm Cache via Sync", page: "datasync" },
      });
    }
  } catch {}

  // ── 9. Improvement: large AP backlog ────────────────────────────────────
  const unpaidBills = data.apBills.filter(
    (b: any) => !["paid","Paid","PAID"].includes(b.status || "")
  );
  if (unpaidBills.length > 100) {
    findings.push({
      id:       "ap-large-backlog",
      severity: "improvement",
      title:    `AP backlog is large (${unpaidBills.length} unpaid bills)`,
      detail:   "Consider bulk-marking resolved bills as paid to keep the active list manageable.",
      action:   { label: "View AP Bills", page: "ap" },
    });
  }

  // Sort: critical → warning → improvement
  const ORDER: Record<AuditSeverity, number> = { critical: 0, warning: 1, improvement: 2 };
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  return findings;
}
