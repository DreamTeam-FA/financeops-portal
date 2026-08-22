/* ── Export utilities: CSV + print-to-PDF ─────────────────────── */

/** Convert a 2D array to a CSV string and trigger download */
export function downloadCSV(rows: (string | number)[][], filename: string) {
  const csv = rows
    .map(row =>
      row
        .map(cell => {
          const s = String(cell ?? "");
          // Wrap in quotes if contains comma, quote, or newline
          return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }); // BOM for Excel
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmtDate(d?: string) { return d || ""; }
function fmtAmt(n: number)   { return n.toFixed(2); }

/* ── AP Bills ──────────────────────────────────────────────────── */
import type { APBill, ARItem, Loan, BankAccount } from "../types";

export function exportAPBillsCSV(bills: APBill[], label = "AP Bills") {
  const header = [
    "Vendor", "Entity", "Amount", "Due Date", "Status", "Bucket",
    "Method", "Invoice No", "Remarks", "In QBO"
  ];
  const rows = bills.map(b => [
    b.vendor, b.entity, fmtAmt(b.amount), fmtDate(b.dueDate),
    b.status, b.bucket, b.method, b.invoiceNo || "",
    b.remarks || "", b.inQBO ? "Yes" : "No"
  ]);
  downloadCSV([header, ...rows], `${label.replace(/\s/g, "_")}_${today()}.csv`);
}

/* ── AR ────────────────────────────────────────────────────────── */
export function exportARItemsCSV(items: ARItem[], label = "AR") {
  const header = [
    "Customer", "Entity", "Amount", "Due Date", "Month",
    "Invoice", "Approval", "Sent", "Payment", "Description", "Remarks"
  ];
  const rows = items.map(a => [
    a.customer, a.entity, fmtAmt(a.amount), fmtDate(a.dueDate),
    a.month, a.invoice ? "Yes" : "No", a.approval ? "Yes" : "No",
    a.sent ? "Yes" : "No", a.payment ? "Yes" : "No",
    a.description, a.remarks
  ]);
  downloadCSV([header, ...rows], `${label.replace(/\s/g, "_")}_${today()}.csv`);
}

/* ── Loans ─────────────────────────────────────────────────────── */
export function exportLoansCSV(loans: Loan[], label = "Loans") {
  const header = [
    "Lender", "Entity", "Purpose", "Principal", "Outstanding",
    "Monthly Payment", "Next Payment", "Maturity", "Status"
  ];
  const rows = loans.map(l => [
    l.lender, l.entity, l.purpose, fmtAmt(l.principal),
    fmtAmt(l.outstanding), fmtAmt(l.monthly),
    fmtDate(l.nextPay), fmtDate(l.maturity), l.status
  ]);
  downloadCSV([header, ...rows], `${label.replace(/\s/g, "_")}_${today()}.csv`);
}

/* ── Banks ─────────────────────────────────────────────────────── */
export function exportBanksCSV(accounts: BankAccount[], label = "Bank Accounts") {
  const header = [
    "Bank", "Entity", "Type", "Account (last 4)", "Balance", "As Of", "Status"
  ];
  const rows = accounts.map(b => [
    b.bank, b.entity, b.type,
    b.acct ? "···" + b.acct.slice(-4) : "",
    fmtAmt(b.balance), fmtDate(b.asOf), b.status
  ]);
  downloadCSV([header, ...rows], `${label.replace(/\s/g, "_")}_${today()}.csv`);
}

/* ── Print to PDF helper ───────────────────────────────────────── */
export function printPage(title?: string) {
  if (title) {
    const prev = document.title;
    document.title = title;
    window.print();
    document.title = prev;
  } else {
    window.print();
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
