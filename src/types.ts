export type EntityName = string; // open-ended — new entities are detected from the sheet

export type APBucket = "past-due" | "this-week" | "next-week" | "rest-of-month" | "rest-of-year" | "remaining" | "on-hold" | "paid";

export type PaymentMethod = "Autodebit" | "Manual" | "Check" | "Online" | "Cash" | "Wire" | "ACH" | "Credit Card";

export interface APBill {
  id: string;
  vendor: string;
  entity: EntityName;
  company?: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  method: PaymentMethod;
  status: "unpaid" | "paid" | "hold";
  bucket: APBucket;
  sheet?: string;
  row?: number;
  invoiceNo?: string;
  remarks?: string;
  notes?: string;
  inQBO?: boolean;
  subentity?: string;
  subcategory?: string;
  category?: string;
  invoiceDate?: string;
  status1?: string;
  paidVia?: string;
  paidStatus?: string;
  paymentInstructions?: string;
  confirmationNo?: string;
  onHold?: boolean;
  monthYear?: string;
  monthName?: string;
  paymentType?: "Auto-Debit" | "Manual";
  recurringType?: "Recurring" | "Non-Recurring";
  costType?: "Fixed" | "Estimate";
}

export interface BankAccount {
  id: string;
  entity: EntityName;
  bank: string;
  type: string;
  acct: string;
  balance: number;
  asOf: string;
  status: "Active" | "Inactive";
  trend: "up" | "down";
  yesterday?: number;
  row?: number; // 1-indexed row within fetched data range (set by parser; used for per-item sheet writes)
}

export interface Loan {
  id: string;
  entity: EntityName;
  lender: string;
  purpose: string;
  principal: number;
  outstanding: number;
  monthly: number;
  nextPay: string;
  maturity: string;
  status: "Active" | "Paid" | "Refinanced";
  row?: number; // 1-indexed row within fetched data range (set by parser; used for per-item sheet writes)
}

export interface ARItem {
  id: string;
  entity: EntityName;
  customer: string;
  occurrence: string;
  description: string;
  month: string;
  invoice: boolean;
  approval: boolean;
  sent: boolean;
  payment: boolean;
  dueDate: string;
  amount: number;
  remarks: string;
  row?: number; // 1-indexed row within fetched data range (set by parser; used for per-item sheet writes)
}

export interface BankStatement {
  id: string;
  period: string;
  entity: EntityName;
  bankName: string;
  occurrence: string;
  remarks: string;
  statementDate: string;
  requestDate: string;
  downloaded: boolean;
  downloadedAt: string;
  rowIndex: number;
}

export interface PayrollWeek {
  weekNum: string;
  year: number;
  label: string;
  startDate: string;
  endDate: string;
  sheetName: string;
}

export interface PayrollPivot {
  [company: string]: {
    [job: string]: {
      [subCat: string]: {
        hours: number;
        amount: number;
      };
    };
  };
}

export interface AuditLog {
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export interface SheetMappingConfig {
  id: string;
  module: "ap" | "banks" | "loans" | "ar" | "statements" | "payroll" | "calendar";
  name: string;
  spreadsheetIdOrUrl: string;
  tabName: string;
  range: string;
  lastSyncedAt?: string;
  status: "connected" | "disconnected" | "error" | "syncing";
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  direction: "PULL" | "PUSH";
  module: string;
  status: "SUCCESS" | "FAILED";
  details: string;
  rowCount?: number;
}

export interface PortalCalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string;
  type: "ap" | "loan" | "ar" | "payroll" | "task" | "google";
  description?: string;
  entity?: EntityName | "ALL";
  isGoogleEvent?: boolean;
}

export interface CalendarLocalEvent {
  id: string;
  createdDate?: string;
  weekLabel?: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM extracted from ms timestamp
  entity: string;
  vendor: string;
  description: string;
  done: boolean;
  completedAt?: string;
  row?: number;
}

export interface DashboardNote {
  id: string;
  title: string;
  content: string;
  itemType?: "note" | "link" | "folder";
  url?: string;
  folderId?: string;
  category: "General" | "AP" | "Bank" | "Loan" | "Payroll" | string;
  entity?: string;
  vendorName?: string;
  createdAt: string;
  status?: "open" | "done";
  completedAt?: string;
  assignedMember?: string;
  memberId?: string;
}

export interface ExternalLinkItem {
  id: string;
  name: string;
  url: string;
  iconType?: "sheet" | "mail" | "calendar" | "users" | "link" | "folder" | "wrench" | "globe";
  color?: string;
  category?: "entities" | "quicklinks" | "tools" | "platforms" | "drive";
  description?: string;
  embedId?: string;
}

export type PageRoute = 
  | "hub"
  | "ap"
  | "banks"
  | "loans"
  | "ar"
  | "statements"
  | "payroll"
  | "calendar"
  | "rubys"
  | "ti"
  | "msdx"
  | "curcumin"
  | "fouryr"
  | "ziglar"
  | "workspace-tools"
  | "workspace-platforms"
  | "workspace-drive"
  | "member-workspace"
  | "datasync"
  | "notes";
