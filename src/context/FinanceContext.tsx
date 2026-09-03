import React, { createContext, useContext, useState, useEffect } from "react";
import { User } from "firebase/auth";
import {
  APBill,
  BankAccount,
  Loan,
  ARItem,
  BankStatement,
  PayrollWeek,
  PayrollPivot,
  AuditLog,
  LoginLogEntry,
  PageRoute,
  EntityName,
  SheetMappingConfig,
  SyncLogEntry,
  PortalCalendarEvent,
  CalendarLocalEvent,
  ExternalLinkItem,
  DashboardNote,
  HeadleysItem
} from "../types";
import {
  initAuthListener,
  googleSignIn,
  logoutGoogle,
  getAccessToken,
  clearAccessToken,
  startAutoTokenRefresh,
  stopAutoTokenRefresh
} from "../services/googleAuth";
import {
  SHARED_LOGS_SHEET_ID,
  appendLogRow,
} from "../services/logsSheetService";
import {
  readAllConfig,
  writeConfigKey,
} from "../services/configSheetService";
import {
  fetchSheetValues,
  updateSheetValues,
  fetchSpreadsheetTabs,
  parseAPSheetRows,
  parseBankSheetRows,
  parseLoanSheetRows,
  parseARSheetRows,
  parseStatementSheetRows,
  parsePayrollSheetRows,
  formatAPSheetRowsForTab,
  getAPTabRange,
  formatBankSheetRows,
  formatLoanSheetRows,
  formatARSheetRows,
  formatStatementSheetRows,
  formatPayrollSheetRows,
  writeSingleAPBill,
  appendAPBill,
  clearSingleAPBill,
  fetchAvailableAPTabs,
  writeSingleBankAccount,
  appendBankAccount,
  writeSingleLoan,
  appendLoan,
  writeSingleARItem,
  appendARItem,
  writeSingleStatement,
  appendStatement,
  appendNoteToSheet,
  writeSingleNote,
  clearNoteRow
} from "../services/googleSheetsService";

interface FinanceContextType {
  currentPage: PageRoute;
  setCurrentPage: (page: PageRoute) => void;
  activeMember: { id: string; name: string; color?: string } | null;
  setActiveMember: (m: { id: string; name: string; color?: string } | null) => void;
  userEmail: string;
  setUserEmail: (email: string) => void;
  isLoading: boolean;
  theme: "dark" | "light";
  toggleTheme: () => void;
  isSidebarFolded: boolean;
  toggleSidebarFold: () => void;
  
  // Google Auth
  googleUser: User | null;
  needsAuth: boolean;
  setNeedsAuth: (needed: boolean) => void;
  handleGoogleSignIn: () => Promise<void>;
  handleGoogleLogout: () => Promise<void>;
  
  // Sheet Mappings & Sync
  sheetMappings: SheetMappingConfig[];
  updateSheetMapping: (id: string, updates: Partial<SheetMappingConfig>) => void;
  syncLogs: SyncLogEntry[];
  isSyncing: boolean;
  lastSyncedAt: string | null;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (enabled: boolean) => void;
  syncAllFromGoogleSheets: () => Promise<void>;
  syncAllToGoogleSheets: (confirmFirst?: boolean) => Promise<void>;
  syncModuleFromGoogleSheet: (moduleId: string) => Promise<void>;
  syncModuleToGoogleSheet: (moduleId: string, confirmFirst?: boolean) => Promise<void>;
  autoDetectSheetTabs: (moduleId: string) => Promise<string[]>;

  // Data
  apBills: APBill[];
  bankAccounts: BankAccount[];
  loans: Loan[];
  arItems: ARItem[];
  bankStatements: BankStatement[];
  payrollWeeks: PayrollWeek[];
  payrollPivot: PayrollPivot;
  auditLogs: AuditLog[];
  headleys: HeadleysItem[];
  
  // Filters
  selectedEntities: Set<string>;
  setSelectedEntities: (entities: Set<string>) => void;
  toggleEntityFilter: (entity: string) => void;
  paymentMethodFilter: string;
  setPaymentMethodFilter: (method: string) => void;
  
  availableAPEntities: string[];

  // CRUD Actions
  addBill: (bill: Omit<APBill, "id">) => APBill;
  updateBill: (bill: APBill) => void;
  toggleBillStatus: (id: string, status: "unpaid" | "paid" | "hold", paidDate?: string) => void;
  deleteBill: (id: string) => void;
  
  addBankAccount: (acc: Omit<BankAccount, "id">) => void;
  updateBankAccount: (account: BankAccount) => void;
  updateBankBalance: (id: string, newBalance: number) => void;
  copyAllBalancesToYesterday: () => void;
  deleteBankAccount: (id: string) => void;
  
  addLoan: (loan: Omit<Loan, "id">) => void;
  updateLoan: (loan: Loan) => void;
  deleteLoan: (id: string) => void;
  
  addARItem: (item: Omit<ARItem, "id">) => void;
  updateARItem: (item: ARItem) => void;
  deleteARItem: (id: string) => void;
  toggleARStage: (id: string, stage: "invoice" | "approval" | "sent" | "payment") => void;
  updateARRemarks: (id: string, remarks: string) => void;
  
  addBankStatement: (statement: Omit<BankStatement, "id">) => void;
  updateBankStatement: (statement: BankStatement) => void;
  toggleStatementDownload: (id: string) => void;
  deleteBankStatement: (id: string) => void;
  
  updatePayrollPivot: (newPivot: PayrollPivot) => void;
  
  // Custom Sheet Mapping Management
  addCustomSheetMapping: (mapping: Omit<SheetMappingConfig, "id">) => void;
  deleteSheetMapping: (id: string) => void;

  // Calendar Task Management
  localCalendarEvents: PortalCalendarEvent[];
  addCalendarEvent: (event: Omit<PortalCalendarEvent, "id">) => void;
  deleteCalendarEvent: (id: string) => void;
  updateCalendarEvent: (id: string, updates: Partial<Omit<PortalCalendarEvent, "id">>) => void;

  // Calendar Dashboard Sheet Local Events
  calendarLocalEvents: CalendarLocalEvent[];
  toggleCalendarLocalEventDone: (id: string) => void;

  // External Links Management
  externalLinks: ExternalLinkItem[];
  addExternalLink: (link: Omit<ExternalLinkItem, "id">) => void;
  updateExternalLink: (id: string, updates: Partial<ExternalLinkItem>) => void;
  deleteExternalLink: (id: string) => void;

  // Quick Notes Management
  quickNotes: DashboardNote[];
  addQuickNote: (note: Omit<DashboardNote, "id">) => void;
  updateQuickNote: (id: string, updates: Partial<DashboardNote>) => void;
  deleteQuickNote: (id: string) => void;
  clearAllQuickNotes: () => void;
  bulkSeedWorkspace: (items: DashboardNote[]) => void;
  reorderQuickNotes: (orderedIds: string[]) => void;

  // GAS Dashboard URLs
  gasUrls: { curcumin: string; fouryr: string; ziglar: string; msdx: string };
  updateGasUrl: (key: "curcumin" | "fouryr" | "ziglar" | "msdx", url: string) => void;

  // User Auth & Switcher
  switchUser: (email: string, name?: string) => void;
  signOutUser: () => Promise<void>;

  // Auto Push (Instant Sync on Edit)
  autoPushEnabled: boolean;
  setAutoPushEnabled: (enabled: boolean) => void;

  // Sync toast notification
  syncToast: { message: string; type: "success" | "error" | "info" | "auth-error" } | null;
  clearSyncToast: () => void;
  showToast: (message: string, type?: "success" | "error" | "info" | "auth-error", duration?: number) => void;

  // Global confirm modal (replaces all window.confirm/alert/prompt native dialogs)
  confirmModal: { message: string; onConfirm: () => void } | null;
  showConfirm: (message: string, onConfirm: () => void) => void;
  clearConfirmModal: () => void;

  // Global date-picker modal — used e.g. to ask payment date when marking a bill paid
  datePickerModal: { message: string; defaultDate: string; onConfirm: (date: string) => void } | null;
  showDatePicker: (message: string, defaultDate: string, onConfirm: (date: string) => void) => void;
  clearDatePickerModal: () => void;

  importSheetData: (data: any) => void;
  logAction: (action: string, details: string) => void;

  // Global Search Deep Link
  searchHighlightId: string | null;
  setSearchHighlightId: (id: string | null) => void;

  // Logs
  loginLogs: LoginLogEntry[];
  logsSheetId: string | null;

  // Email Scanner → AP/AR prefill
  emailPrefill: {
    type: "bill" | "invoice";
    data: {
      vendor?: string;
      invoiceNo?: string;
      amount?: number | null;
      dueDate?: string | null;
      issueDate?: string | null;
      entity?: string;
      description?: string;
      remarks?: string;
    };
  } | null;
  setEmailPrefill: (p: {
    type: "bill" | "invoice";
    data: {
      vendor?: string;
      invoiceNo?: string;
      amount?: number | null;
      dueDate?: string | null;
      issueDate?: string | null;
      entity?: string;
      description?: string;
      remarks?: string;
    };
  } | null) => void;

  // Email Scanner → Headley's import prefill
  headleysPrefill: { rawText: string } | null;
  setHeadleysPrefill: (p: { rawText: string } | null) => void;
}

const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit?usp=sharing";

const DEFAULT_EXTERNAL_LINKS: ExternalLinkItem[] = [
  // ── TOOLS TAB → SHEETS ──────────────────────────────────────────────────────
  {
    id: "tool-master",
    name: "Master Finance Spreadsheet",
    url: "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit",
    iconType: "sheet",
    color: "#1a73e8",
    category: "tools",
    subType: "sheet",
    description: "Primary Google Spreadsheet sync source for AP, Banks, Loans, and AR"
  },
  {
    id: "tool-payroll-sheet",
    name: "4YR Payroll Master Sheet",
    url: "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit",
    iconType: "sheet",
    color: "#7c3aed",
    category: "tools",
    subType: "sheet",
    description: "Payroll details, pivot data, and weekly breakdown tabs"
  },
  {
    id: "tool-big3-sheet",
    name: "Weekly Big 3 Sheet",
    url: "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit",
    iconType: "sheet",
    color: "#059669",
    category: "tools",
    subType: "sheet",
    description: "Weekly Big 3 Goals for Stand Up Meeting Discussion"
  },
  // ── TOOLS TAB → PORTALS ─────────────────────────────────────────────────────
  {
    id: "portal-zions-bank",
    name: "Zion's Bank",
    url: "https://www.zionsbank.com",
    iconType: "globe",
    color: "#1d4ed8",
    category: "tools",
    subType: "portal",
    description: "Treasury & Banking"
  },
  {
    id: "portal-usfoods",
    name: "US Foods",
    url: "https://www.usfoods.com",
    iconType: "globe",
    color: "#dc2626",
    category: "tools",
    subType: "portal",
    description: "Portal. Use VPN"
  },
  {
    id: "portal-remc",
    name: "Parke County REMC",
    url: "https://www.parkecountyremc.com",
    iconType: "globe",
    color: "#16a34a",
    category: "tools",
    subType: "portal",
    description: "Portal. Use VPN"
  },
  {
    id: "portal-godaddy",
    name: "GoDaddy",
    url: "https://account.godaddy.com",
    iconType: "globe",
    color: "#16a34a",
    category: "tools",
    subType: "portal",
    description: "Website Hosting & Billing"
  },
  {
    id: "portal-lastpass",
    name: "LastPASS",
    url: "https://www.lastpass.com",
    iconType: "globe",
    color: "#dc2626",
    category: "tools",
    subType: "portal",
    description: "Password Vault"
  },
  {
    id: "portal-toggl",
    name: "Toggl",
    url: "https://track.toggl.com",
    iconType: "globe",
    color: "#e11d48",
    category: "tools",
    subType: "portal",
    description: "Time tracking tool"
  },
  {
    id: "portal-sinc",
    name: "SINC",
    url: "https://sincsync.com",
    iconType: "globe",
    color: "#7c3aed",
    category: "tools",
    subType: "portal",
    description: "4YR Payroll Time Tracking"
  },
  // ── TOOLS TAB → TOOLS ───────────────────────────────────────────────────────
  {
    id: "tool-content-week",
    name: "Your Content Week",
    url: "https://yourcontentweek.com",
    iconType: "wrench",
    color: "#0891b2",
    category: "tools",
    subType: "tool",
    description: "Content Prompt Creator"
  },
  {
    id: "tool-ops-portal",
    name: "OPS Team Portal",
    url: "https://opsteam-portal.onrender.com",
    iconType: "wrench",
    color: "#f59e0b",
    category: "tools",
    subType: "tool",
    description: "Operations team portal"
  },
  // ── PLATFORMS TAB ───────────────────────────────────────────────────────────
  {
    id: "plat-qbo",
    name: "QuickBooks Online",
    url: "https://qbo.intuit.com",
    iconType: "globe",
    color: "#16a34a",
    category: "platforms",
    description: "Accounting & general ledger software"
  },
  {
    id: "plat-gusto",
    name: "Gusto Payroll Portal",
    url: "https://gusto.com",
    iconType: "globe",
    color: "#f59e0b",
    category: "platforms",
    description: "Team payroll processing & tax filings"
  },
  {
    id: "plat-bill",
    name: "Bill.com",
    url: "https://bill.com",
    iconType: "globe",
    color: "#0891b2",
    category: "platforms",
    description: "Digital vendor payment automation"
  },
  {
    id: "plat-ghl",
    name: "GoHighLevel",
    url: "https://app.gohighlevel.com",
    iconType: "globe",
    color: "#7c3aed",
    category: "platforms",
    description: "GHL Platform"
  },
  {
    id: "plat-amazon-sc",
    name: "Amazon Seller Central",
    url: "https://sellercentral.amazon.com",
    iconType: "globe",
    color: "#f59e0b",
    category: "platforms",
    description: "Seller Central for CPRO"
  },
  {
    id: "plat-shopify",
    name: "Shopify",
    url: "https://admin.shopify.com",
    iconType: "globe",
    color: "#16a34a",
    category: "platforms",
    description: "Shopify admin for Ziglar"
  },
  {
    id: "plat-woocommerce",
    name: "WooCommerce",
    url: "https://cpro.com/wp-admin",
    iconType: "globe",
    color: "#7c3aed",
    category: "platforms",
    description: "WC Backend for CPRO"
  },
  {
    id: "plat-lightspeed",
    name: "Lightspeed VT",
    url: "https://app.lightspeedvt.com",
    iconType: "globe",
    color: "#0891b2",
    category: "platforms",
    description: "Superuser account for Ziglar"
  },
  {
    id: "plat-keap",
    name: "KEAP",
    url: "https://app.keap.com",
    iconType: "globe",
    color: "#16a34a",
    category: "platforms",
    description: "Coaching Sales for Ziglar"
  },
  {
    id: "plat-toast",
    name: "Toast Tab",
    url: "https://pos.toasttab.com",
    iconType: "globe",
    color: "#dc2626",
    category: "platforms",
    description: "Toast portal for Ruby's"
  },
  {
    id: "plat-klaviyo",
    name: "Klaviyo",
    url: "https://www.klaviyo.com",
    iconType: "globe",
    color: "#1d4ed8",
    category: "platforms",
    description: "Email Campaigns"
  },
  // ── DRIVE FOLDERS TAB ───────────────────────────────────────────────────────
  {
    id: "drive-receipts-2026",
    name: "Scanned Receipts (2026)",
    url: "https://drive.google.com/drive/folders/16Qje85kzbRanWgbyuB5h2tVR7J_NrZ9m",
    iconType: "folder",
    color: "#f59e0b",
    category: "drive",
    description: "Scanned & Uploaded Receipts from the Office - 2026"
  },
  {
    id: "drive-statements",
    name: "Monthly Bank Statements Folder",
    url: "https://drive.google.com/drive/folders/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs",
    iconType: "folder",
    color: "#00897b",
    category: "drive",
    description: "Directory for bank PDFs, credit card statements, and reconciliations"
  },
  {
    id: "drive-ar-invoices",
    name: "Accounts Receivables Invoices",
    url: "https://drive.google.com/drive/folders/17A6yyvoPIlCfegus79yD3Vvt6HJnCoL2",
    iconType: "folder",
    color: "#1d4ed8",
    category: "drive",
    description: "Categorized AR Invoices"
  },
  {
    id: "drive-ap-invoices",
    name: "Accounts Payables Invoices",
    url: "https://drive.google.com/drive/folders/1AzwpWEMdyp1SEeNtXrie5171cSk5L7Za",
    iconType: "folder",
    color: "#7c3aed",
    category: "drive",
    description: "Uploaded AP Invoices from the Portal"
  },
  {
    id: "drive-entity-docs",
    name: "Entity Documents",
    url: "https://drive.google.com/drive/folders/162s6Jnfw9DYeP-15ypnbtScHMJCuHNix",
    iconType: "folder",
    color: "#dc2626",
    category: "drive",
    description: "Company/Entity operations and registration documents"
  },
  {
    id: "drive-ai-advantage",
    name: "AI Advantage",
    url: "https://drive.google.com/drive/folders/1hJI4zz7u3rh8kxKwvC3p8-Rl4vOs5iE3",
    iconType: "folder",
    color: "#0891b2",
    category: "drive",
    description: "AI docs, information & activities"
  },
  {
    id: "drive-main",
    name: "Finance & Receipts Drive",
    url: "https://drive.google.com/drive/folders/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs",
    iconType: "folder",
    color: "#f59e0b",
    category: "drive",
    description: "Main Google Drive folder storing invoices, receipts, and reports"
  },
  // ── QUICK LINKS ─────────────────────────────────────────────────────────────
  {
    id: "ext-gmail",
    name: "Gmail",
    url: "https://mail.google.com",
    iconType: "mail",
    category: "quicklinks"
  },
  {
    id: "ext-gcal",
    name: "Google Calendar",
    url: "https://calendar.google.com",
    iconType: "calendar",
    category: "quicklinks"
  }
];


const DEFAULT_MAPPINGS: SheetMappingConfig[] = [
  {
    id: "map-ap",
    module: "ap",
    name: "Accounts Payable (Bills)",
    spreadsheetIdOrUrl: DEFAULT_SHEET_URL,
    tabName: "Ruby's Bills, TI Bills, MSDX Bills",
    range: "'Ruby\\'s Bills'!A1:G200, 'TI Bills'!A1:G200, 'MSDX Bills'!A1:G200",
    status: "connected"
  },
  {
    id: "map-banks",
    module: "banks",
    name: "Bank Account Balances",
    spreadsheetIdOrUrl: DEFAULT_SHEET_URL,
    tabName: "Bank Balances",
    range: "'Bank Balances'!A1:G50",
    status: "connected"
  },
  {
    id: "map-loans",
    module: "loans",
    name: "Loans & Credit Facilities",
    spreadsheetIdOrUrl: DEFAULT_SHEET_URL,
    tabName: "Loans, Credit Cards",
    range: "'Loans'!A1:I50, 'Credit Cards'!A1:I50",
    status: "connected"
  },
  {
    id: "map-ar",
    module: "ar",
    name: "Accounts Receivable (Invoices)",
    spreadsheetIdOrUrl: DEFAULT_SHEET_URL,
    tabName: "AR Dashboard Data",
    range: "'AR Dashboard Data'!A1:L200",
    status: "connected"
  },
  {
    id: "map-statements",
    module: "statements",
    name: "Bank Statements Checklist",
    spreadsheetIdOrUrl: DEFAULT_SHEET_URL,
    tabName: "Bank Statements",
    range: "'Bank Statements'!A1:I50",
    status: "connected"
  },
  {
    id: "map-payroll",
    module: "payroll",
    name: "4YR Payroll",
    spreadsheetIdOrUrl: DEFAULT_SHEET_URL,
    tabName: "raw",
    range: "'raw'!A1:Z500",
    status: "connected"
  }
];

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPage, setCurrentPage] = useState<PageRoute>("hub");
  const [searchHighlightId, setSearchHighlightId] = useState<string | null>(null);
  const [emailPrefill, setEmailPrefill] = useState<FinanceContextType["emailPrefill"]>(null);
  const [headleysPrefill, setHeadleysPrefill] = useState<{ rawText: string } | null>(null);
  const [userEmail, setUserEmailState] = useState<string>(() => {
    return localStorage.getItem("financeops_user_email") || "accounting@marktimm.com";
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = (localStorage.getItem("financeops_theme") as "dark" | "light") || "dark";
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    return saved;
  });

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("financeops_theme", next);
      if (next === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  };

  // Auth State
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  // Show login modal once per calendar day. If the user already signed in today
  // (tracked in localStorage 'financeops_login_date'), skip the modal on reload.
  const _localDateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [needsAuth, setNeedsAuth] = useState<boolean>(
    () => localStorage.getItem("financeops_login_date") !== _localDateStr()
  );

  const setUserEmail = (email: string) => {
    const clean = email.trim();
    setUserEmailState(clean);
    if (clean) {
      localStorage.setItem("financeops_user_email", clean);
      setNeedsAuth(false);
    } else {
      localStorage.removeItem("financeops_user_email");
      setNeedsAuth(true);
    }
  };

  // Sync & Mappings State
  const [sheetMappings, setSheetMappings] = useState<SheetMappingConfig[]>(DEFAULT_MAPPINGS);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(false);
  const [autoPushEnabled, setAutoPushEnabled] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<{ message: string; type: "success" | "error" | "info" | "auth-error" } | null>(null);
  const clearSyncToast = () => setSyncToast(null);
  const showToast = (message: string, type: "success" | "error" | "info" | "auth-error" = "info", duration = 4000) => {
    setSyncToast({ message, type });
    if (duration > 0) setTimeout(() => setSyncToast(null), duration);
    // duration=0 → persistent until user dismisses or action resolves
  };

  // Global confirm modal — replaces all window.confirm/alert native dialogs
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const showConfirm = (message: string, onConfirm: () => void) => setConfirmModal({ message, onConfirm });
  const clearConfirmModal = () => setConfirmModal(null);

  const [datePickerModal, setDatePickerModal] = useState<{ message: string; defaultDate: string; onConfirm: (date: string) => void } | null>(null);
  const showDatePicker = (message: string, defaultDate: string, onConfirm: (date: string) => void) => setDatePickerModal({ message, defaultDate, onConfirm });
  const clearDatePickerModal = () => setDatePickerModal(null);
  const [localCalendarEvents, setLocalCalendarEvents] = useState<PortalCalendarEvent[]>([]);

  // Sidebar Fold State
  const [isSidebarFolded, setIsSidebarFolded] = useState<boolean>(() => {
    try {
      return localStorage.getItem("financeops_sidebar_folded") === "true";
    } catch (e) {
      return false;
    }
  });

  const toggleSidebarFold = () => {
    setIsSidebarFolded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("financeops_sidebar_folded", String(next));
      } catch (e) {}
      return next;
    });
  };

  // Active Member Workspace State
  const [activeMember, setActiveMember] = useState<{ id: string; name: string; color?: string } | null>(null);

  // External Links State
  const [externalLinks, setExternalLinks] = useState<ExternalLinkItem[]>(() => {
    try {
      const saved = localStorage.getItem("financeops_external_links");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_EXTERNAL_LINKS;
  });

  const addExternalLink = (link: Omit<ExternalLinkItem, "id">) => {
    const newLink: ExternalLinkItem = {
      ...link,
      id: `ext-${Date.now()}`
    };
    const updated = [...externalLinks, newLink];
    setExternalLinks(updated);
    localStorage.setItem("financeops_external_links", JSON.stringify(updated));
    persistChanges({ externalLinks: updated });
    // Persist to config sheet — survives Render restarts and browser cache clears
    const tok = getAccessToken();
    if (tok) writeConfigKey(tok, "externalLinks", updated, userEmail).catch(() => {});
    logAction("Added External Link", `Added '${link.name}' link (${link.url})`);
  };

  const updateExternalLink = (id: string, updates: Partial<ExternalLinkItem>) => {
    const updated = externalLinks.map((l) => (l.id === id ? { ...l, ...updates } : l));
    setExternalLinks(updated);
    localStorage.setItem("financeops_external_links", JSON.stringify(updated));
    persistChanges({ externalLinks: updated });
    const tok = getAccessToken();
    if (tok) writeConfigKey(tok, "externalLinks", updated, userEmail).catch(() => {});
    logAction("Updated External Link", `Updated link ID '${id}'`);
  };

  const deleteExternalLink = (id: string) => {
    const updated = externalLinks.filter((l) => l.id !== id);
    setExternalLinks(updated);
    localStorage.setItem("financeops_external_links", JSON.stringify(updated));
    persistChanges({ externalLinks: updated });
    const tok = getAccessToken();
    if (tok) writeConfigKey(tok, "externalLinks", updated, userEmail).catch(() => {});
    logAction("Deleted External Link", `Removed link ID '${id}'`);
  };

  // Quick Notes State
  // Quick notes come exclusively from the Google Sheet pull — never from localStorage.
  const [quickNotes, setQuickNotes] = useState<DashboardNote[]>([]);

  // GAS Web App URLs for Dashboards
  const [gasUrls, setGasUrls] = useState<{ curcumin: string; fouryr: string; ziglar: string; msdx: string }>(() => {
    try {
      const saved = localStorage.getItem("financeops_gas_urls");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Back-fill msdx if not yet in saved data
        if (!parsed.msdx) parsed.msdx = "https://script.google.com/a/macros/marktimm.com/s/AKfycbzXDYff37EY3VQKlLMNLvdT1kJJGwde9wvPllMbOtIOeKPTUunMiNg_3HVB8UV2lR_-/exec";
        return parsed;
      }
    } catch (e) {}
    return { curcumin: "", fouryr: "", ziglar: "", msdx: "https://script.google.com/a/macros/marktimm.com/s/AKfycbzXDYff37EY3VQKlLMNLvdT1kJJGwde9wvPllMbOtIOeKPTUunMiNg_3HVB8UV2lR_-/exec" };
  });

  const updateGasUrl = (key: "curcumin" | "fouryr" | "ziglar" | "msdx", url: string) => {
    const next = { ...gasUrls, [key]: url };
    setGasUrls(next);
    localStorage.setItem("financeops_gas_urls", JSON.stringify(next));
    persistChanges({ gasUrls: next } as any);
    // Persist to shared Google Sheet config tab so all users get the updated URL
    const tok = getAccessToken();
    if (tok) writeConfigKey(tok, "gasUrls", next, userEmail).catch(err =>
      console.warn("[updateGasUrl] config sheet write failed:", err)
    );
    logAction("Updated GAS Dashboard URL", `Updated URL for ${key}`);
  };

  const switchUser = (email: string, name?: string) => {
    const cleanEmail = email.trim();
    setUserEmail(cleanEmail);
    localStorage.setItem("financeops_user_email", cleanEmail);
    logAction("Switched User Profile", `Switched active user to ${name ? `${name} (${cleanEmail})` : cleanEmail}`);
  };

  const signOutUser = async () => {
    await handleGoogleLogout();
    setUserEmailState("");
    localStorage.removeItem("financeops_user_email");
    setNeedsAuth(true);
    logAction("User Signed Out", "User signed out completely from active session.");
  };

  // Helper: push a note to the Meeting Notes sheet tab (fire-and-forget).
  const pushNoteToSheet = (note: DashboardNote, action: "append" | "write" | "clear") => {
    const token = getAccessToken();
    if (!token) {
      // No token — note is saved locally but not synced to the sheet
      showToast("Note saved locally. Reconnect Google Sheets to sync.", "auth-error");
      return;
    }
    const apMapping = sheetMappings.find((m) => m.module === "ap");
    const spreadsheetId = apMapping?.spreadsheetIdOrUrl || "";
    if (!spreadsheetId) return;
    (async () => {
      try {
        if (action === "append") await appendNoteToSheet(note, spreadsheetId, token);
        else if (action === "write") await writeSingleNote(note, spreadsheetId, token);
        else if (action === "clear" && note.row) await clearNoteRow(note.row, spreadsheetId, token);
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.warn("Note sheet sync failed:", msg);
        if (msg.includes("401") || msg.includes("invalid_grant") || msg.includes("unauthorized")) {
          showToast("Google Sheets token expired. Reconnect to sync notes.", "auth-error");
        }
      }
    })();
  };

  const addQuickNote = (note: Omit<DashboardNote, "id">) => {
    const newNote: DashboardNote = {
      ...note,
      // "qn-n" prefix: "qn-" is stripped by buildNoteRow → sheet gets "n<timestamp>"
      // matching the GAS convention so other portals/dashboards can read the note
      id: "qn-n" + Date.now(),
      createdAt: note.createdAt || new Date().toISOString().split("T")[0]
    };
    const updated = [newNote, ...quickNotes];
    setQuickNotes(updated);
    localStorage.setItem("financeops_quick_notes", JSON.stringify(updated));
    persistChanges({ quickNotes: updated } as any);
    pushNoteToSheet(newNote, "append");
    logAction("Added Note", `Created note '${newNote.title}'`);
  };

  const updateQuickNote = (id: string, updates: Partial<DashboardNote>) => {
    const updated = quickNotes.map((n) => (n.id === id ? { ...n, ...updates } : n));
    setQuickNotes(updated);
    localStorage.setItem("financeops_quick_notes", JSON.stringify(updated));
    persistChanges({ quickNotes: updated } as any);
    const updatedNote = updated.find((n) => n.id === id);
    if (updatedNote) pushNoteToSheet(updatedNote, "write");
    logAction("Updated Note", `Updated note ID '${id}'`);
  };

  const deleteQuickNote = (id: string) => {
    const noteToDelete = quickNotes.find((n) => n.id === id);
    const updated = quickNotes.filter((n) => n.id !== id);
    setQuickNotes(updated);
    localStorage.setItem("financeops_quick_notes", JSON.stringify(updated));
    persistChanges({ quickNotes: updated } as any);
    if (noteToDelete) pushNoteToSheet(noteToDelete, "clear");
    logAction("Deleted Note", `Removed note ID '${id}'`);
  };

  const clearAllQuickNotes = () => {
    setQuickNotes([]);
    localStorage.setItem("financeops_quick_notes", JSON.stringify([]));
    persistChanges({ quickNotes: [] } as any);
    logAction("Cleared Notes", "All quick notes cleared");
  };

  /** Bulk-load workspace items (e.g. from Tabme seed) without sheet API calls.
   *  Items whose IDs already exist are skipped so re-running is idempotent. */
  const bulkSeedWorkspace = (items: DashboardNote[]) => {
    const existingIds = new Set(quickNotes.map((n) => n.id));
    const fresh = items.filter((i) => !existingIds.has(i.id));
    if (fresh.length === 0) return;
    const updated = [...quickNotes, ...fresh];
    setQuickNotes(updated);
    localStorage.setItem("financeops_quick_notes", JSON.stringify(updated));
    persistChanges({ quickNotes: updated } as any);
    logAction("Seeded Workspace", `Loaded ${fresh.length} items`);
  };

  /** Reorder a subset of quickNotes by supplying their IDs in the desired order.
   *  Items not in orderedIds are untouched; those that are get re-inserted at the
   *  same index slots they originally occupied (preserving interleaving with others). */
  const reorderQuickNotes = (orderedIds: string[]) => {
    if (orderedIds.length === 0) return;
    const idSet = new Set(orderedIds);

    // Original positions (indices in quickNotes) of the items to reorder
    const slots: number[] = [];
    quickNotes.forEach((n, i) => { if (idSet.has(n.id)) slots.push(i); });

    // Build the reordered items in the requested sequence
    const byId: Record<string, DashboardNote> = {};
    quickNotes.forEach((n) => { byId[n.id] = n; });
    const reordered = orderedIds.map((id) => byId[id]).filter(Boolean);

    // Place reordered items back into their original slots
    const newNotes = [...quickNotes];
    slots.forEach((slotIdx, i) => { newNotes[slotIdx] = reordered[i]; });

    setQuickNotes(newNotes);
    localStorage.setItem("financeops_quick_notes", JSON.stringify(newNotes));
    persistChanges({ quickNotes: newNotes } as any);
  };

  // State collections
  const [availableAPEntities, setAvailableAPEntities] = useState<string[]>(["Ruby's", "TI", "MSDx"]);
  const [apBills, setApBills] = useState<APBill[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [arItems, setArItems] = useState<ARItem[]>([]);
  // Filter AEI-A / AEI-B entries that are injected on every Render restart.
  // Match by customer name so the filter survives ID reassignment across syncs.
  const sanitizeAr = (items: ARItem[]) =>
    items.filter(i =>
      !(i.customer || "").match(/^AEI\s*[-–]\s*[AB]$/i) &&
      i.id !== 'ar-1788266535918' && i.id !== 'ar-1788266562934'
    );
  const [bankStatements, setBankStatements] = useState<BankStatement[]>([]);
  const [payrollWeeks, setPayrollWeeks] = useState<PayrollWeek[]>([]);
  const [payrollPivot, setPayrollPivot] = useState<PayrollPivot>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLogEntry[]>([]);
  const [logsSheetId, setLogsSheetId] = useState<string | null>(null);
  const [calendarLocalEvents, setCalendarLocalEvents] = useState<CalendarLocalEvent[]>([]);
  const [headleys, setHeadleys] = useState<HeadleysItem[]>([]);

  const toggleCalendarLocalEventDone = (id: string) => {
    const updated = calendarLocalEvents.map((ev) =>
      ev.id === id ? { ...ev, done: !ev.done, completedAt: !ev.done ? new Date().toISOString().split("T")[0] : undefined } : ev
    );
    setCalendarLocalEvents(updated);
    persistChanges({ calendarLocalEvents: updated } as any);
  };

  // Entity Filters
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set(["ALL"]));
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("All");

  // Auth Listener
  useEffect(() => {
    const unsubscribe = initAuthListener(
      (user, _token) => {
        setGoogleUser(user);
        startAutoTokenRefresh();
        // If the user already signed in today, dismiss the modal automatically
        // (their Firebase session + token restored silently — no need to show the gate)
        if (localStorage.getItem("financeops_login_date") === _localDateStr()) {
          setNeedsAuth(false);
        }
        // Fetch available AP sheet tabs so the portal picks up any new entities
        const tok = getAccessToken();
        const apMapping = sheetMappings.find((m) => m.module === "ap");
        if (tok && apMapping) {
          fetchAvailableAPTabs(apMapping.spreadsheetIdOrUrl, tok).then((entities) => {
            if (entities.length > 0) setAvailableAPEntities(entities);
          });
        }
      },
      () => {
        setGoogleUser(null);
        setNeedsAuth(true);
        stopAutoTokenRefresh();
      }
    );
    return () => {
      unsubscribe();
      stopAutoTokenRefresh();
    };
  }, []);

  // ── Startup data load ────────────────────────────────────────────────────────
  //
  //  Order of operations:
  //   1. localStorage cache  → instant paint with last-session data (survives deploys)
  //   2. Server JSON         → config fields (mappings, auditLog) + financial fallback if no cache
  //   3. Wait for OAuth token (polls until Firebase auth fires, up to 10 s)
  //   4. pull-live           → authoritative Sheets data; saves back to localStorage cache
  //                            → one automatic retry on failure + error toast
  //
  //  This eliminates the stale flash and the "token not ready" silent-fail that
  //  previously caused the portal to show old data until the user clicked Sync.
  useEffect(() => {
    const CACHE_KEY = "financeops_data_cache_v2";
    const CACHE_TTL = 20 * 60 * 1000; // 20 min — fresh enough; pull-live always replaces anyway

    // ── Cache helpers ────────────────────────────────────────────────────
    const loadCache = (): any | null => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts > CACHE_TTL) return null;
        return data;
      } catch { return null; }
    };

    const saveCache = (data: any) => {
      try {
        // Only cache financial/display fields — not config or server-only fields
        const slim = {
          ap: data.ap, banks: data.banks, loans: data.loans, ar: data.ar,
          statements: data.statements, headleys: data.headleys,
          payrollPivot: data.payrollPivot, payrollWeeks: data.payrollWeeks,
          calendarLocalEvents: data.calendarLocalEvents,
          quickNotes: data.quickNotes, lastSyncedAt: data.lastSyncedAt,
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: slim }));
      } catch {}
    };

    // ── Apply financial data to React state ──────────────────────────────
    const applyData = (data: any) => {
      if (data.ap && data.ap.length > 0) setApBills(recomputeBills(data.ap));
      if (data.banks)      setBankAccounts(data.banks);
      if (data.loans)      setLoans(data.loans);
      if (data.ar) {
        const cleaned = sanitizeAr(data.ar);
        setArItems(cleaned);
        // If AEI items were filtered out, purge them from the server JSON cache
        // so sync-portal-items-to-sheet doesn't re-write them to the sheet on next login.
        if (cleaned.length < data.ar.length) {
          setTimeout(() => {
            fetch("/api/data", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...data, ar: cleaned }),
            }).catch(() => {});
          }, 1500);
        }
      }
      if (data.statements) setBankStatements(data.statements);
      if (data.headleys)   setHeadleys(data.headleys);
      if (data.payrollPivot)  setPayrollPivot(data.payrollPivot);
      if (data.payrollWeeks)  setPayrollWeeks(data.payrollWeeks);
      if (data.lastSyncedAt)  setLastSyncedAt(data.lastSyncedAt);
      if (data.calendarLocalEvents && Array.isArray(data.calendarLocalEvents))
        setCalendarLocalEvents(data.calendarLocalEvents);
      if (data.quickNotes && Array.isArray(data.quickNotes) && data.quickNotes.length > 0) {
        const seen = new Set<string>();
        const deduped = (data.quickNotes as DashboardNote[]).filter((n) => {
          if (!n.id) return true;
          if (seen.has(String(n.id))) return false;
          seen.add(String(n.id));
          return true;
        });
        setQuickNotes(deduped);
        localStorage.setItem("financeops_quick_notes", JSON.stringify(deduped));
      }
      // Restore externalLinks from server if localStorage is cleared (browser cache reset)
      if (data.externalLinks && Array.isArray(data.externalLinks) && data.externalLinks.length > 0) {
        const lsRaw = (() => { try { return localStorage.getItem("financeops_external_links"); } catch { return null; } })();
        const lsLinks: ExternalLinkItem[] = lsRaw ? (() => { try { return JSON.parse(lsRaw); } catch { return []; } })() : [];
        // Only restore from server if localStorage has no user-added items (only defaults or empty)
        const defaultIds = new Set(DEFAULT_EXTERNAL_LINKS.map(d => d.id));
        const hasUserAdded = lsLinks.some(l => !defaultIds.has(l.id));
        if (!hasUserAdded) {
          const serverOnlyAdded = (data.externalLinks as ExternalLinkItem[]).filter(l => !defaultIds.has(l.id));
          if (serverOnlyAdded.length > 0) {
            const merged = [...lsLinks.filter(l => defaultIds.has(l.id)), ...serverOnlyAdded];
            setExternalLinks(merged);
            localStorage.setItem("financeops_external_links", JSON.stringify(merged));
          }
        }
      }
    };

    // ── Poll for OAuth token — Firebase auth is async, don't fire pull-live blind ──
    const waitForToken = (timeoutMs = 10_000): Promise<string | null> =>
      new Promise(resolve => {
        const start = Date.now();
        const check = () => {
          const tok = getAccessToken();
          if (tok) return resolve(tok);
          if (Date.now() - start >= timeoutMs) return resolve(null);
          setTimeout(check, 300);
        };
        check();
      });

    // ── Main init sequence ───────────────────────────────────────────────
    const init = async () => {

      // Step 1 — localStorage cache: instant paint with last-session data
      // driveViewUrl is stripped from cached AP bills — it is ONLY sourced from the live sheet
      // via pull-live, never from the local cache. This prevents autoPush from writing stale
      // drive URLs back to the sheet during the window before pull-live completes.
      const cache = loadCache();
      if (cache) {
        if (Array.isArray(cache.ap)) {
          cache.ap = cache.ap.map((b: any) => { const { driveViewUrl: _d, driveFileName: _f, ...rest } = b; return rest; });
        }
        try { localStorage.removeItem("billDriveLinks_v2"); } catch {}
        applyData(cache);
        setIsLoading(false);
      }

      // Step 2 — Server JSON: config fields + financial fallback when no cache
      // serverMappings is captured here and used in Step 3.5 to seed the config
      // sheet on first run (one-time migration from ephemeral server JSON → Sheet).
      let serverMappings: SheetMappingConfig[] | null = null;
      let serverGasUrls: Record<string, string> | null = null;
      try {
        const serverData = await fetch("/api/data").then(r => r.json());
        if (serverData) {
          // Config / server-only fields (always apply regardless of cache)
          if (serverData.auditLog)   setAuditLogs(serverData.auditLog);
          if (serverData.syncLogs)   setSyncLogs(serverData.syncLogs);
          if (serverData.sheetMappings && Array.isArray(serverData.sheetMappings)) {
            const existingIds = new Set(serverData.sheetMappings.map((m: SheetMappingConfig) => m.id));
            const missingDefaults = DEFAULT_MAPPINGS.filter(dm => !existingIds.has(dm.id));
            const merged = [...serverData.sheetMappings, ...missingDefaults];
            setSheetMappings(merged);
            serverMappings = merged; // captured for Step 3.5 seed
          }
          if (serverData.gasUrls && typeof serverData.gasUrls === "object") {
            serverGasUrls = serverData.gasUrls; // captured for Step 3.5 seed
          }
          // Fire-and-forget: logs are read from Google Sheet, sheet ID from server
          fetch("/api/login-log").then(r => r.json()).then(ll => { if (Array.isArray(ll)) setLoginLogs(ll); }).catch(() => {});
          fetch("/api/logs-sheet-id").then(r => r.json()).then(({ logsSheetId: id }) => { if (id) setLogsSheetId(id); }).catch(() => {});

          // NOTE: Do NOT apply server JSON financial data (ap/ar/banks) as a fallback.
          // Server JSON is from the last committed financeops_data.json and can be weeks stale.
          // Financial data only comes from localStorage cache (< 20 min) or pull-live (Step 4).
          // If neither is available, keep isLoading true until pull-live delivers fresh Sheet data.
        }
      } catch (err) {
        console.error("[init] Failed to load server data:", err);
        if (!cache) setIsLoading(false);
      }

      // Step 3 — Wait for OAuth token (Firebase auth fires asynchronously)
      setIsSyncing(true);
      const tok = await waitForToken(10_000);

      if (!tok) {
        // No token after 10 s — user not yet signed in.
        // Fire a one-shot pull-live using the server's cached token so non-auth
        // users (guests, slow Firebase) still see fresh sheet data instead of
        // the potentially stale server JSON cache.
        fetch("/api/pull-live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}), // server falls back to its cached token
        })
          .then(r => r.json())
          .then(resp => {
            if (resp?.data) {
              try { localStorage.removeItem("billDriveLinks_v2"); } catch {}
              applyData(resp.data);
              saveCache(resp.data);
              setIsLoading(false);
              try {
                const bc = new BroadcastChannel("financeops_sync");
                bc.postMessage({ type: "data-refreshed", ts: Date.now() });
                bc.close();
              } catch {}
            }
          })
          .catch(() => {}); // non-fatal — silent if server has no cached token
        setIsSyncing(false);
        if (!cache) setIsLoading(false);
        return;
      }

      // Step 3.5 — Config sheet: load shared config (sheetMappings, gasUrls) that
      //            survives Render deploys and is visible to all users.
      //            Also flush any pending log rows that were queued while offline.
      readAllConfig(tok).then(cfg => {
        if (cfg.sheetMappings && Array.isArray(cfg.sheetMappings)) {
          // Config sheet has mappings — apply them (authoritative, cross-user)
          const existingIds = new Set(cfg.sheetMappings.map((m: SheetMappingConfig) => m.id));
          const missingDefaults = DEFAULT_MAPPINGS.filter(dm => !existingIds.has(dm.id));
          setSheetMappings([...cfg.sheetMappings, ...missingDefaults]);
        } else if (serverMappings && serverMappings.length > 0) {
          // Config tab is empty (first deploy with this feature) — seed it now
          // from the server JSON mappings captured in Step 2. This is a one-time
          // migration; after this every updateSheetMapping call keeps the tab current.
          writeConfigKey(tok, "sheetMappings", serverMappings, userEmail).catch(() => {});
        }
        if (cfg.gasUrls && typeof cfg.gasUrls === "object") {
          // Config sheet has gasUrls — apply them (cross-user)
          setGasUrls(prev => ({ ...prev, ...cfg.gasUrls }));
          localStorage.setItem("financeops_gas_urls", JSON.stringify({ ...cfg.gasUrls }));
        } else if (serverGasUrls && Object.keys(serverGasUrls).length > 0) {
          // Seed gasUrls too on first run
          writeConfigKey(tok, "gasUrls", serverGasUrls, userEmail).catch(() => {});
        }
        // Restore externalLinks (portals, platforms, drive folders) from config sheet
        // — the ONLY storage that survives Render restarts and browser cache clears
        if (cfg.externalLinks && Array.isArray(cfg.externalLinks) && cfg.externalLinks.length > 0) {
          const defaultIds = new Set(DEFAULT_EXTERNAL_LINKS.map(d => d.id));
          const lsRaw = (() => { try { return localStorage.getItem("financeops_external_links"); } catch { return null; } })();
          const lsLinks: ExternalLinkItem[] = lsRaw ? (() => { try { return JSON.parse(lsRaw); } catch { return []; } })() : [];
          const lsHasUserAdded = lsLinks.some(l => !defaultIds.has(l.id));
          // Config sheet is always authoritative — it has more user-added links than localStorage
          const cfgUserAdded = (cfg.externalLinks as ExternalLinkItem[]).filter(l => !defaultIds.has(l.id));
          if (cfgUserAdded.length > 0 && !lsHasUserAdded) {
            // localStorage has only defaults — restore user links from config sheet
            const merged = [...DEFAULT_EXTERNAL_LINKS, ...cfgUserAdded];
            setExternalLinks(merged);
            localStorage.setItem("financeops_external_links", JSON.stringify(merged));
          } else if (cfgUserAdded.length > lsLinks.filter(l => !defaultIds.has(l.id)).length) {
            // Config sheet has more user-added links than localStorage — merge in the extras
            const lsUserIds = new Set(lsLinks.filter(l => !defaultIds.has(l.id)).map(l => l.id));
            const newFromCfg = cfgUserAdded.filter(l => !lsUserIds.has(l.id));
            if (newFromCfg.length > 0) {
              const merged = [...lsLinks, ...newFromCfg];
              setExternalLinks(merged);
              localStorage.setItem("financeops_external_links", JSON.stringify(merged));
            }
          }
        }
      }).catch(() => {}); // non-fatal — fall back to server JSON / localStorage

      // Flush pending log rows queued while offline
      try {
        const pending = JSON.parse(localStorage.getItem("financeops_pending_logs") || "[]");
        if (pending.length > 0) {
          localStorage.removeItem("financeops_pending_logs");
          Promise.all(
            pending.map((entry: { ts: string; user: string; action: string; details: string }) =>
              appendLogRow(tok, SHARED_LOGS_SHEET_ID, "Activity Log",
                [entry.ts, entry.user, entry.action, entry.details]).catch(() => {})
            )
          );
        }
      } catch {}

      // Step 4 — pull-live: authoritative data from Google Sheets, one retry on failure
      let pullOk = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const resp = await fetch("/api/pull-live", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: tok }),
          }).then(r => r.json());

          if (resp?.data) {
            // Sheet is source of truth — clear stale localStorage drive cache before applying
            // so deleted sheet links don't get re-injected from browser storage
            try { localStorage.removeItem("billDriveLinks_v2"); } catch {}
            applyData(resp.data);
            saveCache(resp.data); // refresh localStorage cache with authoritative live data
            // Notify other open tabs so they re-read the cache without a full pull-live
            try {
              const bc = new BroadcastChannel("financeops_sync");
              bc.postMessage({ type: "data-refreshed", ts: Date.now() });
              bc.close();
            } catch {}
            pullOk = true;

            // Auto-refresh bank data from GViz using the fixed frontend parser
            // (Render server has stale bank column mapping until Oct 1 redeploy)
            setTimeout(async () => {
              try {
                const bankMap = serverMappings?.find(m => m.module === "banks");
                if (bankMap && tok) {
                  // Fetch wide enough range to cover all bank sheet columns
                  const bankRange = (bankMap as any).range || "'Bank Balances'!A1:J100";
                  const bankRows = await fetchSheetValues(bankMap.spreadsheetIdOrUrl, bankRange, tok);
                  if (bankRows && bankRows.length > 0) {
                    const parsed = parseBankSheetRows(bankRows);
                    if (parsed.length > 0) {
                      setBankAccounts(parsed);
                      // Save corrected bank data to localStorage cache so hard refreshes show correct values
                      try {
                        const cachedRaw = localStorage.getItem("financeops_data_cache_v2");
                        if (cachedRaw) {
                          const cached = JSON.parse(cachedRaw);
                          if (cached?.data) {
                            cached.data.banks = parsed;
                            localStorage.setItem("financeops_data_cache_v2", JSON.stringify(cached));
                          }
                        }
                      } catch {}
                      // Update server cache too
                      fetch("/api/data", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...resp.data, banks: parsed }),
                      }).catch(() => {});
                    }
                  }
                }
              } catch {} // non-fatal — bank data still visible from pull-live
            }, 0);

            break;
          }
        } catch {
          if (attempt === 0) {
            // Wait 3 s then retry once before giving up
            await new Promise(r => setTimeout(r, 3_000));
          }
        }
      }

      if (!pullOk) {
        // Both attempts failed — tell the user and let them manually sync
        setSyncToast({
          message: "⚠️ Live data refresh failed — showing cached data. Click Sync to retry.",
          type: "error",
        });
        setTimeout(() => setSyncToast(null), 9_000);
      }

      setIsSyncing(false);
      setIsLoading(false);
    };

    init();

    // ── Cross-tab sync via BroadcastChannel ──────────────────────────────────
    // When another tab completes a pull-live it broadcasts "data-refreshed".
    // This tab re-reads the updated localStorage cache to stay in sync
    // without its own network request.
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("financeops_sync");
      bc.onmessage = (e) => {
        if (e.data?.type === "data-refreshed") {
          const fresh = loadCache();
          if (fresh) applyData(fresh);
        }
      };
    } catch {}

    return () => {
      try { bc?.close(); } catch {}
    };
  }, []);

  // Cross-tab auth sharing via BroadcastChannel:
  //   - If this tab needs auth, ask other tabs if they're already signed in.
  //   - If another tab signs in/out, update this tab too.
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try { ch = new BroadcastChannel("financeops_auth"); } catch { return; }

    ch.onmessage = (e: MessageEvent) => {
      const { type, authed } = e.data || {};
      if (type === "AUTH_STATE") {
        // Another tab logged out — require re-auth here too
        if (!authed) setNeedsAuth(true);
      }
    };

    return () => { try { ch?.close(); } catch {} };
  }, []);

  // Listen for token expiry from the silent-refresh scheduler
  useEffect(() => {
    const onTokenExpired = () => {
      // Only show the toast if the user had a token (i.e. was connected)
      if (!needsAuth) {
        // Mark as needing re-auth so the persistent header banner appears on ALL pages
        setNeedsAuth(true);
        setSyncToast({
          message: "⚠️ Google Sheets token expired — your changes won't sync until you reconnect.",
          type: "auth-error",
        });
        // duration 0 → persistent; user must click Reconnect or dismiss
      }
    };
    window.addEventListener("google-token-expired", onTokenExpired);
    return () => window.removeEventListener("google-token-expired", onTokenExpired);
  }, [needsAuth]);

  // Collect device + approximate location metadata for the login log
  const captureLoginMetadata = async (): Promise<{
    device: string; ip: string; city: string; region: string; country: string;
  }> => {
    const ua = navigator.userAgent;
    const os = /Windows/.test(ua) ? "Windows"
      : /Macintosh|Mac OS/.test(ua) ? "macOS"
      : /Android/.test(ua) ? "Android"
      : /iPhone|iPad/.test(ua) ? "iOS"
      : /Linux/.test(ua) ? "Linux" : "Unknown OS";
    const browser = /Edg\//.test(ua) ? "Edge"
      : /OPR\//.test(ua) ? "Opera"
      : /Chrome\//.test(ua) ? "Chrome"
      : /Firefox\//.test(ua) ? "Firefox"
      : /Safari\//.test(ua) ? "Safari" : "Unknown Browser";
    const device = `${os} / ${browser}`;
    try {
      const geo = await fetch("https://ipapi.co/json/").then(r => r.json());
      return { device, ip: geo.ip || "—", city: geo.city || "—", region: geo.region || "", country: geo.country_name || "—" };
    } catch {
      return { device, ip: "—", city: "—", region: "", country: "—" };
    }
  };

  // Google Sign In / Out Handlers
  const handleGoogleSignIn = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setUserEmail(res.user.email || "accounting@marktimm.com");
        setNeedsAuth(false);
        // Record today's date so the modal is skipped for the rest of the day
        localStorage.setItem("financeops_login_date", _localDateStr());
        // Tell other open tabs that we're now authenticated
        try {
          const ch = new BroadcastChannel("financeops_auth");
          ch.postMessage({ type: "AUTH_STATE", authed: true });
          ch.close();
        } catch {}
        startAutoTokenRefresh();
        logAction("Google OAuth Authenticated", `Connected as ${res.user.email}`);
        window.dispatchEvent(new Event("google-token-refreshed"));
        // After sign-in: pull live from Google Sheets immediately.
        // Sheets are the ONLY source of truth — do NOT write any cached data back to the sheet.
        setTimeout(() => {
          syncAllFromGoogleSheets().catch(() => {});
        }, 500);
        // Capture device + location, then ensure the logs sheet exists and append the login entry
        captureLoginMetadata().then(async (meta) => {
          const token = getAccessToken();
          if (!token) return;

          const email = res.user.email || userEmail;
          const ts    = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });

          // Always use the single shared logs sheet — hardcoded so all users append here
          const sheetId = SHARED_LOGS_SHEET_ID;
          if (!logsSheetId) setLogsSheetId(sheetId);

          // Append login entry to the shared Google Sheet
          appendLogRow(token, sheetId, "Login History", [
            ts, email, meta.device, meta.city, meta.region, meta.country, meta.ip
          ]).catch(() => {});

          // Also persist to server JSON as backup
          const entry = { user: email, ...meta };
          fetch("/api/login-log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry)
          })
            .then(r => r.json())
            .then(({ entry: saved }) => {
              if (saved) setLoginLogs(prev => [saved, ...prev.slice(0, 499)]);
            })
            .catch(() => {});
        });
      }
    } catch (err: any) {
      console.error("Sign in failed:", err);
      const errCode = err?.code || "";
      const errMsg: string = err?.message || "";
      if (errCode === "auth/cancelled-popup-request") {
        // Another popup was already open — silently ignore
      } else if (errCode === "auth/popup-blocked") {
        showToast(
          "Google sign-in popup was blocked by your browser. Please allow popups for this site, then click Reconnect.",
          "auth-error",
          0
        );
      } else if (errCode === "auth/popup-closed-by-user") {
        // May be intentional, or user closed after seeing an OAuth error page —
        // show a soft reminder they can reconnect.
        showToast(
          "Google sign-in was not completed. Click Reconnect to try again.",
          "auth-error",
          8000
        );
      } else if (errCode === "auth/unauthorized-domain") {
        showToast(
          "This domain isn't authorized in Firebase. Please contact the administrator.",
          "error",
          0
        );
      } else if (
        errMsg.toLowerCase().includes("origin") ||
        errMsg.includes("origin_mismatch") ||
        errMsg.includes("400")
      ) {
        showToast(
          "Google OAuth error: the app domain isn't authorized yet. Contact your admin to add it to Google Cloud Console.",
          "auth-error",
          0
        );
      } else {
        showToast(
          "Google sign-in failed. Click Reconnect to try again.",
          "auth-error",
          0
        );
      }
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    sessionStorage.removeItem("financeops_session_authed");
    // Clear the daily login stamp so the modal appears on next load
    localStorage.removeItem("financeops_login_date");
    // Tell other open tabs to also require re-auth
    try {
      const ch = new BroadcastChannel("financeops_auth");
      ch.postMessage({ type: "AUTH_STATE", authed: false });
      ch.close();
    } catch {}
    setNeedsAuth(true);
    logAction("Google Logout", "User signed out from Google OAuth session.");
  };

  // Sync to backend JSON on state mutation
  const persistChanges = (updatedData: Partial<{
    ap: APBill[];
    banks: BankAccount[];
    loans: Loan[];
    ar: ARItem[];
    statements: BankStatement[];
    payrollPivot: PayrollPivot;
    auditLog: AuditLog[];
    sheetMappings: SheetMappingConfig[];
    syncLogs: SyncLogEntry[];
    localCalendarEvents: PortalCalendarEvent[];
    quickNotes: DashboardNote[];
    gasUrls: { curcumin: string; fouryr: string; ziglar: string; msdx: string };
    externalLinks: ExternalLinkItem[];
  }>) => {
    const payload = {
      ap: updatedData.ap || apBills,
      banks: updatedData.banks || bankAccounts,
      loans: updatedData.loans || loans,
      ar: updatedData.ar || arItems,
      statements: updatedData.statements || bankStatements,
      payrollWeeks,
      payrollPivot: updatedData.payrollPivot || payrollPivot,
      auditLog: updatedData.auditLog || auditLogs,
      sheetMappings: updatedData.sheetMappings || sheetMappings,
      syncLogs: updatedData.syncLogs || syncLogs,
      localCalendarEvents: updatedData.localCalendarEvents || localCalendarEvents,
      quickNotes: updatedData.quickNotes !== undefined
        ? updatedData.quickNotes
        : (() => { try { return JSON.parse(localStorage.getItem("financeops_quick_notes") || "[]"); } catch { return quickNotes; } })(),
      gasUrls: updatedData.gasUrls || gasUrls,
      externalLinks: updatedData.externalLinks !== undefined
        ? updatedData.externalLinks
        : (() => { try { return JSON.parse(localStorage.getItem("financeops_external_links") || "[]"); } catch { return externalLinks; } })()
    };

    fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then((r) => {
        if (!r.ok) console.warn("[persistChanges] Server responded with", r.status);
      })
      .catch((err) => {
        // Network error — data is safe in localStorage but server-side backup failed.
        // Show toast only if it's a real network failure (not just the server being unavailable on Free tier).
        console.error("[persistChanges] Network error — data saved locally only:", err);
        // Debounce: only fire once per minute to avoid toast storm
        const lastWarn = Number(sessionStorage.getItem("_persist_warn_ts") || "0");
        if (Date.now() - lastWarn > 60_000) {
          sessionStorage.setItem("_persist_warn_ts", String(Date.now()));
          showToast("Data saved locally. Server backup unavailable — check connection.", "error", 6000);
        }
      });
  };

  const logAction = (action: string, details: string) => {
    const ts = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
    const newLog: AuditLog = { timestamp: ts, user: userEmail, action, details };
    const nextLogs = [newLog, ...auditLogs.slice(0, 499)];
    setAuditLogs(nextLogs);
    persistChanges({ auditLog: nextLogs });

    // Fire-and-forget: post to centralized server activity log (shared across all users)
    fetch("/api/activity-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: userEmail, action, details, timestamp: ts })
    }).catch(() => {});

    // Append to the shared logs Google Sheet.
    // If no token is available right now, queue the entry in localStorage and
    // show a subtle toast. The queue is flushed automatically when the user
    // reconnects (auth listener → Step 3.5 in init()).
    const token = getAccessToken();
    if (token) {
      appendLogRow(token, SHARED_LOGS_SHEET_ID, "Activity Log", [ts, userEmail, action, details])
        .catch(() => {
          // Sheet write failed even with a token — queue for retry
          try {
            const pending = JSON.parse(localStorage.getItem("financeops_pending_logs") || "[]");
            pending.push({ ts, user: userEmail, action, details });
            localStorage.setItem("financeops_pending_logs", JSON.stringify(pending.slice(-50)));
          } catch {}
        });
    } else {
      // No token — queue the entry; it will be flushed on reconnect
      try {
        const pending = JSON.parse(localStorage.getItem("financeops_pending_logs") || "[]");
        pending.push({ ts, user: userEmail, action, details });
        localStorage.setItem("financeops_pending_logs", JSON.stringify(pending.slice(-50)));
      } catch {}
      // Notify only once per session per token-gap to avoid toast fatigue
      const lastWarn = Number(sessionStorage.getItem("_log_warn_ts") || "0");
      if (Date.now() - lastWarn > 120_000) {
        sessionStorage.setItem("_log_warn_ts", String(Date.now()));
        setSyncToast({
          message: "📋 Activity logged locally — reconnect Google Sheets to sync to the log sheet.",
          type: "auth-error",
        });
        setTimeout(() => setSyncToast(null), 7_000);
      }
    }
  };

  const addSyncLog = (entry: Omit<SyncLogEntry, "id">) => {
    const newEntry: SyncLogEntry = {
      ...entry,
      id: `sync-${Date.now()}`
    };
    const nextLogs = [newEntry, ...syncLogs.slice(0, 49)];
    setSyncLogs(nextLogs);
    persistChanges({ syncLogs: nextLogs });
  };

  const updateSheetMapping = (id: string, updates: Partial<SheetMappingConfig>) => {
    const next = sheetMappings.map((m) => (m.id === id ? { ...m, ...updates } : m));
    setSheetMappings(next);
    persistChanges({ sheetMappings: next });
    // Persist to shared Google Sheet config tab so ALL users see the change
    // and it survives Render deploys (server JSON is ephemeral).
    const tok = getAccessToken();
    if (tok) writeConfigKey(tok, "sheetMappings", next, userEmail).catch(err =>
      console.warn("[updateSheetMapping] config sheet write failed:", err)
    );
    logAction("Updated Sheet Mapping", `Mapping ID ${id} modified`);
  };

  // --- GOOGLE SHEETS 2-WAY SYNC FUNCTIONS ---

  const autoDetectSheetTabs = async (moduleId: string): Promise<string[]> => {
    const token = getAccessToken();
    if (!token) {
      console.warn("Google sign-in required to access sheet.");
      setNeedsAuth(true);
      return [];
    }

    const mapping = sheetMappings.find((m) => m.id === moduleId || m.module === moduleId);
    if (!mapping || !mapping.spreadsheetIdOrUrl) {
      console.warn("No Google Spreadsheet ID or URL configured for this module.");
      return [];
    }

    setIsSyncing(true);
    try {
      const tabs = await fetchSpreadsheetTabs(mapping.spreadsheetIdOrUrl, token);
      const titles = tabs.map((t) => t.title);
      if (titles.length > 0) {
        const detectedTabString = titles.join(", ");
        updateSheetMapping(mapping.id, {
          tabName: detectedTabString,
          range: mapping.range || "A1:Z200"
        });

        const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
        addSyncLog({
          timestamp: now,
          direction: "PULL",
          module: mapping.name,
          status: "SUCCESS",
          details: `Auto-detected ${titles.length} tab(s): ${titles.join(", ")}`,
          rowCount: titles.length
        });
      }
      setIsSyncing(false);
      return titles;
    } catch (err: any) {
      console.error("Auto-detect tabs error:", err);
      console.error("Auto-detection failed:", err.message || err);
      setIsSyncing(false);
      return [];
    }
  };

  const syncModuleFromGoogleSheet = async (moduleId: string) => {
    const token = getAccessToken();
    if (!token) {
      console.warn("Google sign-in required to access source Google Sheets.");
      setNeedsAuth(true);
      return;
    }

    const mapping = sheetMappings.find((m) => m.id === moduleId || m.module === moduleId);
    if (!mapping) return;

    setIsSyncing(true);
    try {
      // If tabName is empty, auto-detect tabs from spreadsheet metadata
      let activeTabName = mapping.tabName;
      if (!activeTabName || activeTabName.trim() === "") {
        const detectedTabs = await fetchSpreadsheetTabs(mapping.spreadsheetIdOrUrl, token).catch(() => []);
        if (detectedTabs.length > 0) {
          activeTabName = detectedTabs.map((t) => t.title).join(", ");
          updateSheetMapping(mapping.id, { tabName: activeTabName });
        } else {
          activeTabName = "Sheet1";
        }
      }

      // Determine target ranges to fetch (supports comma-separated tab names or ranges)
      let targetsToFetch: { rangeStr: string; tabName: string }[] = [];

      if (mapping.range && mapping.range.includes(",")) {
        // Multi-range e.g. "'Ruby\'s Bills'!A1:G100, 'TI Bills'!A1:G100"
        const splitRanges = mapping.range.split(",").map((s) => s.trim()).filter(Boolean);
        targetsToFetch = splitRanges.map((r) => {
          const exclIdx = r.lastIndexOf("!");
          let tab = activeTabName;
          if (exclIdx !== -1) {
            let rawTab = r.substring(0, exclIdx).trim();
            if (rawTab.startsWith("'") && rawTab.endsWith("'")) {
              rawTab = rawTab.slice(1, -1);
            }
            tab = rawTab;
          }
          return { rangeStr: r, tabName: tab || activeTabName };
        });
      } else if (activeTabName.includes(",")) {
        // Multi-tab e.g. "Ruby's Bills, TI Bills, MSDx Bills" with cell range "A1:G100"
        const tabs = activeTabName.split(",").map((s) => s.trim()).filter(Boolean);
        const cellRange = mapping.range.includes("!") ? mapping.range.split("!")[1] : (mapping.range || "A1:Z200");
        targetsToFetch = tabs.map((t) => ({
          rangeStr: `'${t}'!${cellRange}`,
          tabName: t
        }));
      } else {
        const rangeToUse = mapping.range ? (mapping.range.includes("!") ? mapping.range : `'${activeTabName}'!${mapping.range}`) : `'${activeTabName}'!A1:Z200`;
        targetsToFetch = [{ rangeStr: rangeToUse, tabName: activeTabName }];
      }

      let aggregatedAP: APBill[] = [];
      let aggregatedBanks: BankAccount[] = [];
      let aggregatedLoans: Loan[] = [];
      let aggregatedAR: ARItem[] = [];
      let aggregatedStatements: BankStatement[] = [];
      let aggregatedPayroll: PayrollPivot = {};
      let totalFetchedCount = 0;

      for (const target of targetsToFetch) {
        try {
          let rows: any[][] = [];
          try {
            rows = await fetchSheetValues(mapping.spreadsheetIdOrUrl, target.rangeStr, token);
          } catch (rangeErr) {
            // Fallback: If specified range fails (e.g. wrong tab name), try auto-detecting real tab names from Google Sheet metadata
            console.warn(`Primary range fetch failed for ${target.rangeStr}, trying tab auto-detection...`);
            const detected = await fetchSpreadsheetTabs(mapping.spreadsheetIdOrUrl, token).catch(() => []);
            if (detected.length > 0) {
              // Find matching tab or take first tab
              const matchedTab = detected.find(t => 
                t.title.toLowerCase().includes(mapping.module) || 
                t.title.toLowerCase().includes(target.tabName.toLowerCase()) ||
                (mapping.module === "payroll" && /payroll|4yr/i.test(t.title))
              ) || detected[0];

              const fallbackRange = matchedTab.rangeSuggestion;
              rows = await fetchSheetValues(mapping.spreadsheetIdOrUrl, fallbackRange, token);
              
              // Update mapping with auto-resolved tab and range
              updateSheetMapping(mapping.id, {
                tabName: matchedTab.title,
                range: fallbackRange
              });
            } else {
              throw rangeErr;
            }
          }

          if (rows && rows.length > 0) {
            if (mapping.module === "ap") {
              const parsed = parseAPSheetRows(rows, undefined, target.tabName);
              aggregatedAP = [...aggregatedAP, ...parsed];
              totalFetchedCount += parsed.length;
            } else if (mapping.module === "banks") {
              const parsed = parseBankSheetRows(rows);
              aggregatedBanks = [...aggregatedBanks, ...parsed];
              totalFetchedCount += parsed.length;
            } else if (mapping.module === "loans") {
              const parsed = parseLoanSheetRows(rows);
              aggregatedLoans = [...aggregatedLoans, ...parsed];
              totalFetchedCount += parsed.length;
            } else if (mapping.module === "ar") {
              const parsed = parseARSheetRows(rows);
              aggregatedAR = [...aggregatedAR, ...parsed];
              totalFetchedCount += parsed.length;
            } else if (mapping.module === "statements") {
              const parsed = parseStatementSheetRows(rows);
              aggregatedStatements = [...aggregatedStatements, ...parsed];
              totalFetchedCount += parsed.length;
            } else if (mapping.module === "payroll") {
              const parsed = parsePayrollSheetRows(rows);
              aggregatedPayroll = { ...aggregatedPayroll, ...parsed };
              totalFetchedCount += Object.keys(parsed).length;
            }
          }
        } catch (fetchErr: any) {
          console.warn(`Warning fetching target ${target.rangeStr}:`, fetchErr);
        }
      }

      if (mapping.module === "ap" && aggregatedAP.length > 0) {
        setApBills(recomputeBills(aggregatedAP));
        persistChanges({ ap: aggregatedAP });
      } else if (mapping.module === "banks" && aggregatedBanks.length > 0) {
        setBankAccounts(aggregatedBanks);
        persistChanges({ banks: aggregatedBanks });
      } else if (mapping.module === "loans" && aggregatedLoans.length > 0) {
        setLoans(aggregatedLoans);
        persistChanges({ loans: aggregatedLoans });
      } else if (mapping.module === "ar" && aggregatedAR.length > 0) {
        setArItems(aggregatedAR);
        persistChanges({ ar: aggregatedAR });
      } else if (mapping.module === "statements" && aggregatedStatements.length > 0) {
        setBankStatements(aggregatedStatements);
        persistChanges({ statements: aggregatedStatements });
      } else if (mapping.module === "payroll" && Object.keys(aggregatedPayroll).length > 0) {
        setPayrollPivot(aggregatedPayroll);
        persistChanges({ payrollPivot: aggregatedPayroll });
      }

      const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
      updateSheetMapping(mapping.id, { lastSyncedAt: now, status: "connected" });
      addSyncLog({
        timestamp: now,
        direction: "PULL",
        module: mapping.name,
        status: "SUCCESS",
        details: `Pulled ${totalFetchedCount} total rows from ${targetsToFetch.length} tab/range configuration(s)`,
        rowCount: totalFetchedCount
      });
      setLastSyncedAt(now);
      logAction("Pulled Google Sheet Data", `PULL ${mapping.name}: ${totalFetchedCount} total records loaded.`);
    } catch (err: any) {
      console.error(`Error pulling from Google Sheet (${mapping.name}):`, err);
      updateSheetMapping(mapping.id, { status: "error" });
      addSyncLog({
        timestamp: new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }),
        direction: "PULL",
        module: mapping.name,
        status: "FAILED",
        details: err.message || "Failed to fetch from Google Sheet."
      });
      console.error(`Sync Error for ${mapping.name}:`, err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncModuleToGoogleSheet = async (moduleId: string, confirmFirst = true) => {
    const token = getAccessToken();
    if (!token) {
      console.warn("Google sign-in required to write to source Google Sheets.");
      setNeedsAuth(true);
      return;
    }

    const mapping = sheetMappings.find((m) => m.id === moduleId || m.module === moduleId);
    if (!mapping) return;

    if (confirmFirst) {
      setConfirmModal({
        message: `Sync to Google Sheet tab "${mapping.tabName}"? This will overwrite the contents of your source spreadsheet.`,
        onConfirm: () => { setConfirmModal(null); syncModuleToGoogleSheet(moduleId, false); }
      });
      return;
    }

    setIsSyncing(true);
    try {
      let totalRows = 0;

      if (mapping.module === "ap") {
        // AP bills live in separate per-entity tabs — write each one individually.
        // Each entity has different column positions and a different starting row
        // (Ruby's/MSDx: A3+ to preserve summary+header rows 1-2;
        //  TI: A2+ to preserve header row 1).
        const AP_ENTITIES = availableAPEntities;
        for (const entity of AP_ENTITIES) {
          const tabBills = apBills.filter((b) => b.entity === entity);
          const rows = formatAPSheetRowsForTab(tabBills, entity); // pads to 500 rows
          const range = getAPTabRange(entity);
          await updateSheetValues(mapping.spreadsheetIdOrUrl, range, rows, token!);
          totalRows += tabBills.length;
        }
      } else {
        let valuesToPush: any[][] = [];
        if (mapping.module === "banks") {
          valuesToPush = formatBankSheetRows(bankAccounts);
        } else if (mapping.module === "loans") {
          valuesToPush = formatLoanSheetRows(loans);
        } else if (mapping.module === "ar") {
          valuesToPush = formatARSheetRows(arItems);
        } else if (mapping.module === "statements") {
          valuesToPush = formatStatementSheetRows(bankStatements);
        } else if (mapping.module === "payroll") {
          valuesToPush = formatPayrollSheetRows(payrollPivot);
        }
        await updateSheetValues(mapping.spreadsheetIdOrUrl, mapping.range, valuesToPush, token!);
        totalRows = valuesToPush.length > 1 ? valuesToPush.length - 1 : 0;
      }

      const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
      updateSheetMapping(mapping.id, { lastSyncedAt: now, status: "connected" });
      addSyncLog({
        timestamp: now,
        direction: "PUSH",
        module: mapping.name,
        status: "SUCCESS",
        details: `Pushed ${totalRows} rows to tab '${mapping.tabName}' in Google Sheets`,
        rowCount: totalRows
      });
      setLastSyncedAt(now);
      logAction("Pushed Google Sheet Data", `PUSH ${mapping.name}: ${totalRows} rows synced to source sheet.`);
    } catch (err: any) {
      console.error(`Error pushing to Google Sheet (${mapping.name}):`, err);
      updateSheetMapping(mapping.id, { status: "error" });
      addSyncLog({
        timestamp: new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }),
        direction: "PUSH",
        module: mapping.name,
        status: "FAILED",
        details: err.message || "Failed to update Google Sheet."
      });
      console.error(`Push Error for ${mapping.name}:`, err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncAllFromGoogleSheets = async () => {
    setIsSyncing(true);
    try {
      // force: true tells the server to always overwrite existing data with sheet data
      const token = getAccessToken();
      const res = await fetch("/api/pull-live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true, accessToken: token || undefined }) });
      const resp = await res.json();
      if (resp && resp.data) {
        const live = resp.data;
        // Sheet is source of truth — clear stale localStorage drive cache before applying
        try { localStorage.removeItem("billDriveLinks_v2"); } catch {}
        if (live.ap && live.ap.length > 0) setApBills(recomputeBills(live.ap));
        if (live.banks && live.banks.length > 0) setBankAccounts(live.banks);
        if (live.loans && live.loans.length > 0) setLoans(live.loans);
        if (live.ar && live.ar.length > 0) setArItems(sanitizeAr(live.ar));
        if (live.statements && live.statements.length > 0) setBankStatements(live.statements);
        if (live.quickNotes && Array.isArray(live.quickNotes) && live.quickNotes.length > 0) {
          const mergedNotes = (live.quickNotes as DashboardNote[]).map((n) => {
            const localNotes: DashboardNote[] = (() => {
              try { return JSON.parse(localStorage.getItem("financeops_quick_notes") || "[]"); } catch { return []; }
            })();
            const local = localNotes.find((ln) => ln.id === n.id);
            if (local?.status === "done" && n.status !== "done") {
              return { ...n, status: "done" as const, completedAt: local.completedAt };
            }
            return n;
          });
          setQuickNotes(mergedNotes);
          localStorage.setItem("financeops_quick_notes", JSON.stringify(mergedNotes));
        }
        if (live.lastSyncedAt) setLastSyncedAt(live.lastSyncedAt);

        // Update localStorage cache so the next page load starts with this fresh data
        // (including driveViewUrls from column AM/AA) instead of the previous session's snapshot.
        try {
          const slim = {
            ap: live.ap, banks: live.banks, loans: live.loans, ar: live.ar,
            statements: live.statements, headleys: live.headleys,
            payrollPivot: live.payrollPivot, payrollWeeks: live.payrollWeeks,
            calendarLocalEvents: live.calendarLocalEvents,
            quickNotes: live.quickNotes, lastSyncedAt: live.lastSyncedAt,
          };
          localStorage.setItem("financeops_data_cache_v2", JSON.stringify({ ts: Date.now(), data: slim }));
        } catch { /* non-fatal */ }

        // Correct bank data using frontend GViz parser — server bank column mapping is stale until Oct 1 redeploy
        const bankMapEntry = sheetMappings.find(m => m.module === "banks");
        const bankTok = getAccessToken();
        if (bankMapEntry && bankTok) {
          (async () => {
            try {
              const bankRange = (bankMapEntry as any).range || "'Bank Balances'!A1:J100";
              const bankRows = await fetchSheetValues(bankMapEntry.spreadsheetIdOrUrl, bankRange, bankTok);
              if (bankRows && bankRows.length > 0) {
                const parsed = parseBankSheetRows(bankRows);
                if (parsed.length > 0) {
                  setBankAccounts(parsed);
                  // Overwrite the cache entry for banks with the correct values
                  try {
                    const cachedRaw = localStorage.getItem("financeops_data_cache_v2");
                    if (cachedRaw) {
                      const cached = JSON.parse(cachedRaw);
                      if (cached?.data) {
                        cached.data.banks = parsed;
                        localStorage.setItem("financeops_data_cache_v2", JSON.stringify(cached));
                      }
                    }
                  } catch {}
                }
              }
            } catch {} // non-fatal — bank data from pull-live still visible
          })();
        }

        const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
        addSyncLog({
          timestamp: now,
          direction: "PULL",
          module: "All Modules (Live Google Sheets)",
          status: "SUCCESS",
          details: `Pulled ${live.ap?.length || 0} AP bills, ${live.banks?.length || 0} Bank accounts, ${live.loans?.length || 0} Loans/CCs, ${live.ar?.length || 0} AR items from Google Sheet`,
          rowCount: (live.ap?.length || 0) + (live.banks?.length || 0) + (live.loans?.length || 0) + (live.ar?.length || 0)
        });
        logAction("Synced All Modules", "Live Google Sheets dataset pulled successfully.");
      } else {
        // Fallback to module-by-module if available
        for (const mapping of sheetMappings) {
          await syncModuleFromGoogleSheet(mapping.module);
        }
      }
    } catch (err: any) {
      console.warn("[syncAllFromGoogleSheets] Server pull-live failed, falling back to client-side fetch:", err);
      // Notify user that the fast path failed so they know something tried
      showToast("Live sync fell back to direct Sheet fetch — this may be slower.", "info", 4000);
      try {
        for (const mapping of sheetMappings) {
          await syncModuleFromGoogleSheet(mapping.module);
        }
      } catch (fallbackErr: any) {
        const msg = fallbackErr?.message || "unknown error";
        console.error("[syncAllFromGoogleSheets] Fallback also failed:", fallbackErr);
        showToast(`Sync failed: ${msg}. Check your Google connection and try again.`, "error", 7000);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const syncAllToGoogleSheets = async (confirmFirst = true) => {
    if (confirmFirst) {
      setConfirmModal({
        message: "Push all current portal records across AP, AR, Banks, Loans, and Statements to their respective Google Sheet tabs?",
        onConfirm: () => { setConfirmModal(null); syncAllToGoogleSheets(false); }
      });
      return;
    }
    for (const mapping of sheetMappings) {
      await syncModuleToGoogleSheet(mapping.module, false);
    }
  };

  const toggleEntityFilter = (entity: string) => {
    if (entity === "ALL") {
      setSelectedEntities(new Set(["ALL"]));
      return;
    }
    const next = new Set(selectedEntities.has("ALL") ? [] : selectedEntities);
    if (next.has(entity)) {
      next.delete(entity);
      if (next.size === 0) {
        setSelectedEntities(new Set(["ALL"]));
        return;
      }
    } else {
      next.add(entity);
    }
    setSelectedEntities(next);
  };

  // Helper to re-compute bill bucket
  const computeBucket = (dueDate: string, status: string): APBill["bucket"] => {
    if (status === "paid") return "paid";
    if (status === "hold") return "on-hold";
    if (!dueDate) return "rest-of-year";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + "T00:00:00");
    if (isNaN(due.getTime())) return "rest-of-year";

    // Monday-based week (matches GAS: if Sunday go back 6, else go back dow-1)
    const dow = today.getDay();
    const thisWeekMon = new Date(today);
    thisWeekMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    thisWeekMon.setHours(0, 0, 0, 0);

    const thisWeekSun = new Date(thisWeekMon);
    thisWeekSun.setDate(thisWeekMon.getDate() + 6);
    thisWeekSun.setHours(23, 59, 59, 999);

    const nextWeekMon = new Date(thisWeekMon);
    nextWeekMon.setDate(thisWeekMon.getDate() + 7);
    nextWeekMon.setHours(0, 0, 0, 0);

    const nextWeekSun = new Date(thisWeekSun);
    nextWeekSun.setDate(thisWeekSun.getDate() + 7);
    nextWeekSun.setHours(23, 59, 59, 999);

    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    if (due < thisWeekMon) return "past-due";
    if (due <= thisWeekSun) return "this-week";
    if (due >= nextWeekMon && due <= nextWeekSun) return "next-week";
    if (due > nextWeekSun && due <= endOfMonth) return "rest-of-month";
    return "rest-of-year";
  };

  // ── localStorage Drive-link cache ────────────────────────────────────────
  // Render's ephemeral filesystem wipes stored JSON on every deploy, so we
  // also cache driveViewUrl in the browser's localStorage.  Keyed by a stable
  // composite that matches the server recovery logic.
  const DRIVE_CACHE_KEY = "billDriveLinks_v2";
  const driveKeyFor = (b: any) => {
    const n = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return `${n(b.entity)}_${n(b.vendor)}_${n(b.invoiceNo || "")}_${b.dueDate || ""}`;
  };
  const saveDriveCache = (bills: any[]) => {
    try {
      const prev: Record<string, any> = JSON.parse(localStorage.getItem(DRIVE_CACHE_KEY) || "{}");
      bills.forEach(b => {
        if (b.driveViewUrl) {
          prev[driveKeyFor(b)] = { driveViewUrl: b.driveViewUrl, driveFileName: b.driveFileName || "" };
        }
      });
      localStorage.setItem(DRIVE_CACHE_KEY, JSON.stringify(prev));
    } catch { /* non-fatal */ }
  };
  const mergeDriveCache = (bills: any[]): any[] => {
    try {
      const cache: Record<string, any> = JSON.parse(localStorage.getItem(DRIVE_CACHE_KEY) || "{}");
      if (!Object.keys(cache).length) return bills;
      return bills.map(b => {
        if (b.driveViewUrl) return b;
        const hit = cache[driveKeyFor(b)];
        return hit?.driveViewUrl ? { ...b, driveViewUrl: hit.driveViewUrl, driveFileName: hit.driveFileName } : b;
      });
    } catch { return bills; }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const recomputeBills = (bills: APBill[]): APBill[] => {
    const withLinks = mergeDriveCache(bills);
    // Persist any driveViewUrls we just received (from server recovery) into cache
    saveDriveCache(withLinks);

    // NOTE: removed automatic restore-links push — sheet is source of truth.
    // localStorage cache is display-only; it must never write back to the server or sheet.
    // Pull All clears the cache so deleted sheet links cannot be re-injected from localStorage.

    return (withLinks || []).map((b) => ({
      ...b,
      bucket: computeBucket(b.dueDate, b.status)
    }));
  };

  // Helper to trigger background auto-push to Google Sheets if autoPush is enabled
  const triggerAutoPush = (moduleKey: string) => {
    if (autoPushEnabled && getAccessToken()) {
      syncModuleToGoogleSheet(moduleKey, false).catch((err) => {
        console.warn(`Background auto-push failed for ${moduleKey}:`, err);
      });
    }
  };

  // AP-specific push that accepts fresh bill data directly — avoids stale closure
  // when called immediately after setApBills (React state is async).
  // Only used for DataSync full-tab pushes now; CRUD operations use per-item helpers below.
  const pushAPBillsToSheet = (bills: APBill[]) => {
    if (!autoPushEnabled) return;
    const token = getAccessToken();
    if (!token) {
      showToast("Not synced to Google Sheets — reconnect in the header.", "error");
      return;
    }
    const mapping = sheetMappings.find((m) => m.module === "ap");
    if (!mapping) return;

    const AP_ENTITIES = ["Ruby's", "TI", "MSDx"] as const;
    (async () => {
      try {
        for (const entity of AP_ENTITIES) {
          const tabBills = bills.filter((b) => b.entity === entity);
          const rows = formatAPSheetRowsForTab(tabBills, entity);
          const range = getAPTabRange(entity);
          await updateSheetValues(mapping.spreadsheetIdOrUrl, range, rows, token);
        }
        const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
        addSyncLog({ timestamp: now, direction: "PUSH", module: mapping.name, status: "SUCCESS", details: "Auto-pushed AP bills to Google Sheets", rowCount: bills.length });
        showToast("Saved to Google Sheets ✓", "success", 2500);
      } catch (err: any) {
        const msg: string = err?.message || "";
        const isAuthError = msg.includes("401") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("invalid credentials") || msg.toLowerCase().includes("invalid authentication") || msg.toLowerCase().includes("access token");
        if (isAuthError) {
          clearAccessToken();
          setNeedsAuth(true);
          showToast("Google token expired — click Reconnect to restore sync.", "auth-error", 0);
        } else {
          showToast(`Sheet sync failed: ${msg || "unknown error"}`, "error", 5000);
          console.warn("AP auto-push failed:", msg);
        }
        const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
        addSyncLog({ timestamp: now, direction: "PUSH", module: mapping.name, status: "FAILED", details: msg || "Auto-push failed" });
      }
    })();
  };

  // Write a single AP bill to its exact sheet row — only touches that one row.
  const pushSingleAPBillToSheet = (bill: APBill, action: "write" | "append" | "clear") => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast("Connect Google Sheets to save changes to the sheet.", "error", 5000);
      return;
    }
    const mapping = sheetMappings.find((m) => m.module === "ap");
    if (!mapping) return;
    const entity = bill.entity as "Ruby's" | "TI" | "MSDx";
    (async () => {
      try {
        if (action === "append") {
          const sheetRow = await appendAPBill(bill, entity, mapping.spreadsheetIdOrUrl, token);
          // Store the sheet row number on the bill so future updateBill calls can
          // write to the correct row (writeSingleAPBill requires bill.row).
          setApBills(prev => prev.map(b => b.id === bill.id ? { ...b, row: sheetRow } as APBill : b));
        } else if (action === "clear") {
          await clearSingleAPBill(bill, entity, mapping.spreadsheetIdOrUrl, token);
        } else {
          if (!bill.row) return; // no sheet row — bill was never synced, skip
          await writeSingleAPBill(bill, entity, mapping.spreadsheetIdOrUrl, token);
        }
        showToast("Saved to Google Sheets ✓", "success", 2500);
      } catch (err: any) {
        const msg: string = err?.message || "";
        const isAuthError = msg.includes("401") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("invalid credentials") || msg.toLowerCase().includes("invalid authentication") || msg.toLowerCase().includes("access token");
        if (isAuthError) {
          clearAccessToken();
          setNeedsAuth(true);
          showToast("Google token expired — click Reconnect to restore sync.", "auth-error", 0);
        } else {
          showToast(`Sheet sync failed: ${msg || "unknown error"}`, "error", 5000);
          console.warn("AP per-item push failed:", msg);
        }
      }
    })();
  };

  // Shared error handler for per-item sheet pushes
  const handleSheetPushError = (err: any, label: string) => {
    const msg: string = err?.message || "";
    const isAuthError = msg.includes("401") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("invalid credentials") || msg.toLowerCase().includes("invalid authentication") || msg.toLowerCase().includes("access token");
    if (isAuthError) {
      clearAccessToken();
      setNeedsAuth(true);
      showToast("Google token expired — click Reconnect to restore sync.", "auth-error", 0);
    } else {
      showToast(`Sheet sync failed: ${msg || "unknown error"}`, "error", 5000);
      console.warn(`${label} per-item push failed:`, msg);
    }
  };

  const pushSingleBankToSheet = (account: BankAccount, action: "write" | "append") => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast("Connect Google Sheets to save bank balance to the sheet.", "error", 5000);
      return;
    }
    const mapping = sheetMappings.find((m) => m.module === "banks");
    if (!mapping) return;
    (async () => {
      try {
        if (action === "append") await appendBankAccount(account, mapping.range, mapping.spreadsheetIdOrUrl, token);
        else await writeSingleBankAccount(account, mapping.range, mapping.spreadsheetIdOrUrl, token);
        showToast("Saved to Google Sheets ✓", "success", 2500);
      } catch (err) { handleSheetPushError(err, "banks"); }
    })();
  };

  const pushSingleLoanToSheet = (loan: Loan, action: "write" | "append") => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast("Connect Google Sheets to save loan changes to the sheet.", "error", 5000);
      return;
    }
    const mapping = sheetMappings.find((m) => m.module === "loans");
    if (!mapping) return;
    (async () => {
      try {
        if (action === "append") await appendLoan(loan, mapping.range, mapping.spreadsheetIdOrUrl, token);
        else await writeSingleLoan(loan, mapping.range, mapping.spreadsheetIdOrUrl, token);
        showToast("Saved to Google Sheets ✓", "success", 2500);
      } catch (err) { handleSheetPushError(err, "loans"); }
    })();
  };

  const pushSingleARToSheet = (item: ARItem, action: "write" | "append") => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast("Connect Google Sheets to save AR changes to the sheet.", "error", 5000);
      return;
    }
    const mapping = sheetMappings.find((m) => m.module === "ar");
    if (!mapping) return;
    (async () => {
      try {
        if (action === "append") await appendARItem(item, mapping.range, mapping.spreadsheetIdOrUrl, token);
        else await writeSingleARItem(item, mapping.range, mapping.spreadsheetIdOrUrl, token);
        showToast("Saved to Google Sheets ✓", "success", 2500);
      } catch (err) { handleSheetPushError(err, "AR"); }
    })();
  };

  const pushSingleStatementToSheet = (statement: BankStatement, action: "write" | "append") => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      showToast("Connect Google Sheets to save statement changes to the sheet.", "error", 5000);
      return;
    }
    const mapping = sheetMappings.find((m) => m.module === "statements");
    if (!mapping) return;
    (async () => {
      try {
        if (action === "append") await appendStatement(statement, mapping.range, mapping.spreadsheetIdOrUrl, token);
        else await writeSingleStatement(statement, mapping.range, mapping.spreadsheetIdOrUrl, token);
        showToast("Saved to Google Sheets ✓", "success", 2500);
      } catch (err) { handleSheetPushError(err, "statements"); }
    })();
  };

  // Generic push for non-AP modules — ONLY used for DataSync full-tab pushes now.
  // CRUD operations use the per-item helpers above.
  const pushModuleToSheet = (moduleKey: "banks" | "loans" | "ar" | "statements", freshData: any[]) => {
    if (!autoPushEnabled) return;
    const token = getAccessToken();
    if (!token) {
      showToast("Not synced to Google Sheets — reconnect in the header.", "error");
      return;
    }
    const mapping = sheetMappings.find((m) => m.module === moduleKey);
    if (!mapping) return;

    (async () => {
      try {
        let rows: any[][] = [];
        if (moduleKey === "banks") rows = formatBankSheetRows(freshData as BankAccount[]);
        else if (moduleKey === "loans") rows = formatLoanSheetRows(freshData as Loan[]);
        else if (moduleKey === "ar") rows = formatARSheetRows(freshData as ARItem[]);
        else if (moduleKey === "statements") rows = formatStatementSheetRows(freshData as BankStatement[]);
        if (!rows.length) return;
        await updateSheetValues(mapping.spreadsheetIdOrUrl, mapping.range, rows, token);
        const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
        addSyncLog({ timestamp: now, direction: "PUSH", module: mapping.name, status: "SUCCESS", details: `Auto-pushed ${moduleKey} to Google Sheets`, rowCount: freshData.length });
        showToast("Saved to Google Sheets ✓", "success", 2500);
      } catch (err: any) {
        const msg: string = err?.message || "";
        const isAuthError = msg.includes("401") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("invalid credentials") || msg.toLowerCase().includes("invalid authentication") || msg.toLowerCase().includes("access token");
        if (isAuthError) {
          clearAccessToken();
          setNeedsAuth(true);
          showToast("Google token expired — click Reconnect to restore sync.", "auth-error", 0);
        } else {
          showToast(`Sheet sync failed: ${msg || "unknown error"}`, "error", 5000);
          console.warn(`${moduleKey} auto-push failed:`, msg);
        }
        const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
        addSyncLog({ timestamp: now, direction: "PUSH", module: mapping.name, status: "FAILED", details: msg || "Auto-push failed" });
      }
    })();
  };

  const addCalendarEvent = (eventData: Omit<PortalCalendarEvent, "id">) => {
    const newEv: PortalCalendarEvent = {
      ...eventData,
      id: `cal-task-${Date.now()}`
    };
    const next = [newEv, ...localCalendarEvents];
    setLocalCalendarEvents(next);
    persistChanges({ localCalendarEvents: next });
    logAction("Created Calendar Task", `${newEv.title} on ${newEv.date}`);
  };

  const deleteCalendarEvent = (id: string) => {
    const next = localCalendarEvents.filter((e) => e.id !== id);
    setLocalCalendarEvents(next);
    persistChanges({ localCalendarEvents: next });
    logAction("Deleted Calendar Task", `Task ID ${id} removed`);
  };

  const updateCalendarEvent = (id: string, updates: Partial<Omit<PortalCalendarEvent, "id">>) => {
    const next = localCalendarEvents.map((e) => e.id === id ? { ...e, ...updates } : e);
    setLocalCalendarEvents(next);
    persistChanges({ localCalendarEvents: next });
    logAction("Updated Calendar Task", `Task ID ${id} updated`);
  };

  const addCustomSheetMapping = (mappingData: Omit<SheetMappingConfig, "id">) => {
    const newMapping: SheetMappingConfig = {
      ...mappingData,
      id: `map-custom-${Date.now()}`
    };
    const next = [...sheetMappings, newMapping];
    setSheetMappings(next);
    persistChanges({ sheetMappings: next });
    logAction("Added Custom Sheet Mapping", newMapping.name);
  };

  const deleteSheetMapping = (id: string) => {
    const next = sheetMappings.filter((m) => m.id !== id);
    setSheetMappings(next);
    persistChanges({ sheetMappings: next });
    logAction("Deleted Sheet Mapping", `Mapping ID ${id} removed`);
  };

  // --- CRUD FUNCTIONS WITH EDIT SUPPORT ---

  const addBill = (newBillData: Omit<APBill, "id">): APBill => {
    const id = "ap-" + Date.now();
    const bucket = computeBucket(newBillData.dueDate, newBillData.status);
    const newBill: APBill = { ...newBillData, id, bucket };
    const nextBills = [newBill, ...apBills];
    setApBills(nextBills);
    persistChanges({ ap: nextBills });
    logAction("Added Bill", `${newBill.vendor} (${newBill.entity}) - $${newBill.amount}`);
    pushSingleAPBillToSheet(newBill, "append");
    return newBill;
  };

  const updateBill = (updatedBill: APBill) => {
    const bucket = computeBucket(updatedBill.dueDate, updatedBill.status);
    const billWithBucket = { ...updatedBill, bucket };
    const nextBills = apBills.map((b) => (b.id === updatedBill.id ? billWithBucket : b));
    setApBills(nextBills);
    persistChanges({ ap: nextBills });
    logAction("Updated Bill", `${updatedBill.vendor} (${updatedBill.entity}) - $${updatedBill.amount}`);
    pushSingleAPBillToSheet(billWithBucket, "write");
  };

  const toggleBillStatus = (id: string, newStatus: "unpaid" | "paid" | "hold", paidDate?: string) => {
    let updatedBill: APBill | undefined;
    const nextBills = apBills.map((b) => {
      if (b.id === id) {
        const bucket = computeBucket(b.dueDate, newStatus);
        const pd = newStatus === "paid" ? (paidDate || new Date().toISOString().split("T")[0]) : undefined;
        updatedBill = { ...b, status: newStatus, bucket, paidDate: pd };
        return updatedBill;
      }
      return b;
    });
    setApBills(nextBills);
    persistChanges({ ap: nextBills });
    logAction("Updated Bill Status", `Bill ID ${id} marked as ${newStatus}`);
    if (updatedBill) pushSingleAPBillToSheet(updatedBill, "write");
  };

  const deleteBill = (id: string) => {
    const billToDelete = apBills.find((b) => b.id === id);
    const nextBills = apBills.filter((b) => b.id !== id);
    setApBills(nextBills);
    persistChanges({ ap: nextBills });
    logAction("Deleted Bill", `Bill ID ${id} deleted`);
    if (billToDelete) pushSingleAPBillToSheet(billToDelete, "clear");
  };

  const addBankAccount = (accData: Omit<BankAccount, "id">) => {
    const newAcc: BankAccount = { ...accData, id: "b-" + Date.now() };
    const nextAccs = [...bankAccounts, newAcc];
    setBankAccounts(nextAccs);
    persistChanges({ banks: nextAccs });
    logAction("Added Bank Account", `${newAcc.bank} (${newAcc.entity})`);
    pushSingleBankToSheet(newAcc, "append");
  };

  const updateBankAccount = (updatedAccount: BankAccount) => {
    const nextAccs = bankAccounts.map((a) => (a.id === updatedAccount.id ? updatedAccount : a));
    setBankAccounts(nextAccs);
    persistChanges({ banks: nextAccs });
    logAction("Updated Bank Account", `${updatedAccount.bank} (${updatedAccount.entity})`);
    pushSingleBankToSheet(updatedAccount, "write");
  };

  // Local-timezone date string — adapts to whichever timezone the browser is in
  const todayPHT = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const updateBankBalance = (id: string, newBalance: number) => {
    let updatedAcc: BankAccount | undefined;
    const asOf = todayPHT();
    const nextAccs = bankAccounts.map((a) => {
      if (a.id === id) {
        const trend: "up" | "down" = newBalance >= a.balance ? "up" : "down";
        // Always copy current balance → yesterday before applying the new value
        updatedAcc = { ...a, yesterday: a.balance, balance: newBalance, asOf, trend };
        return updatedAcc;
      }
      return a;
    });
    setBankAccounts(nextAccs);
    persistChanges({ banks: nextAccs });
    logAction("Updated Bank Balance", `Account ID ${id}: prev $${updatedAcc?.yesterday ?? "?"} → new $${newBalance} (as of ${asOf} PHT)`);
    if (updatedAcc) pushSingleBankToSheet(updatedAcc, "write");
  };

  // Copy ALL current balances → yesterday at 6pm PHT each day
  const copyAllBalancesToYesterday = () => {
    const today = todayPHT();
    const nextAccs = bankAccounts.map((a) => ({
      ...a,
      yesterday: a.balance,
      asOf: today,
    }));
    setBankAccounts(nextAccs);
    persistChanges({ banks: nextAccs });
    logAction("Bank Balances — EOD Copy", `Copied current balances to yesterday column for ${nextAccs.length} accounts`);
    // Push each updated account to the sheet
    nextAccs.forEach((acc) => pushSingleBankToSheet(acc, "write"));
  };

  const deleteBankAccount = (id: string) => {
    const nextAccs = bankAccounts.filter((a) => a.id !== id);
    setBankAccounts(nextAccs);
    persistChanges({ banks: nextAccs });
    logAction("Deleted Bank Account", `Account ID ${id} deleted`);
    // No sheet row clear on delete — use DataSync to reconcile
  };

  const addLoan = (loanData: Omit<Loan, "id">) => {
    const newLoan: Loan = { ...loanData, id: "l-" + Date.now() };
    const nextLoans = [...loans, newLoan];
    setLoans(nextLoans);
    persistChanges({ loans: nextLoans });
    logAction("Added Loan", `${newLoan.lender} (${newLoan.entity}) - $${newLoan.principal}`);
    pushSingleLoanToSheet(newLoan, "append");
  };

  const updateLoan = (updatedLoan: Loan) => {
    const nextLoans = loans.map((l) => (l.id === updatedLoan.id ? updatedLoan : l));
    setLoans(nextLoans);
    persistChanges({ loans: nextLoans });
    logAction("Updated Loan", `${updatedLoan.lender} (${updatedLoan.entity})`);
    pushSingleLoanToSheet(updatedLoan, "write");
  };

  const deleteLoan = (id: string) => {
    const nextLoans = loans.filter((l) => l.id !== id);
    setLoans(nextLoans);
    persistChanges({ loans: nextLoans });
    logAction("Deleted Loan", `Loan ID ${id} deleted`);
    // No sheet row clear on delete — use DataSync to reconcile
  };

  const addARItem = (arData: Omit<ARItem, "id">) => {
    const newAR: ARItem = { ...arData, id: "ar-" + Date.now() };
    const nextAR = [newAR, ...arItems];
    setArItems(nextAR);
    persistChanges({ ar: nextAR });
    logAction("Added AR Item", `${newAR.customer} (${newAR.entity}) - $${newAR.amount}`);
    // Rule #1: sheet is source of truth — write directly to AR Dashboard Data sheet
    const token = getAccessToken();
    if (token) {
      fetch("/api/ar/add-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newAR, userAccessToken: token }),
      }).then(r => r.json()).then(result => {
        if (result.ok) showToast("AR Invoice saved to Sheet ✓", "success", 2500);
        else { console.warn("[addARItem] sheet write failed:", result.error); showToast("Saved locally; sheet write failed — try Pull All later.", "warning", 4000); }
      }).catch(e => { console.warn("[addARItem] sheet write error:", e?.message); });
    }
  };

  const updateARItem = (updatedAR: ARItem) => {
    const nextAR = arItems.map((a) => (a.id === updatedAR.id ? updatedAR : a));
    setArItems(nextAR);
    persistChanges({ ar: nextAR });
    logAction("Updated AR Invoice", `${updatedAR.customer} (${updatedAR.entity})`);
    pushSingleARToSheet(updatedAR, "write");
  };

  const deleteARItem = (id: string) => {
    const nextAR = arItems.filter((a) => a.id !== id);
    setArItems(nextAR);
    persistChanges({ ar: nextAR });
    logAction("Deleted AR Invoice", `Invoice ID ${id} deleted`);
    // No sheet row clear on delete — use DataSync to reconcile
  };

  const toggleARStage = (id: string, stage: "invoice" | "approval" | "sent" | "payment") => {
    let updatedAR: ARItem | undefined;
    const nextAR = arItems.map((a) => {
      if (a.id === id) {
        updatedAR = { ...a, [stage]: !a[stage] };
        return updatedAR;
      }
      return a;
    });
    setArItems(nextAR);
    persistChanges({ ar: nextAR });
    logAction("Toggled AR Stage", `Item ID ${id} stage ${stage} toggled`);
    if (updatedAR) pushSingleARToSheet(updatedAR, "write");
  };

  const updateARRemarks = (id: string, remarks: string) => {
    let updatedAR: ARItem | undefined;
    const nextAR = arItems.map((a) => {
      if (a.id === id) {
        updatedAR = { ...a, remarks };
        return updatedAR;
      }
      return a;
    });
    setArItems(nextAR);
    persistChanges({ ar: nextAR });
    logAction("Updated AR Remarks", `Item ID ${id}`);
    if (updatedAR) pushSingleARToSheet(updatedAR, "write");
  };

  const addBankStatement = (statementData: Omit<BankStatement, "id">) => {
    const newSt: BankStatement = { ...statementData, id: "st-" + Date.now() };
    const nextSt = [newSt, ...bankStatements];
    setBankStatements(nextSt);
    persistChanges({ statements: nextSt });
    logAction("Added Bank Statement Record", `${newSt.bankName} (${newSt.period})`);
    pushSingleStatementToSheet(newSt, "append");
  };

  const updateBankStatement = (updatedStatement: BankStatement) => {
    const nextSt = bankStatements.map((s) => (s.id === updatedStatement.id ? updatedStatement : s));
    setBankStatements(nextSt);
    persistChanges({ statements: nextSt });
    logAction("Updated Bank Statement Record", `${updatedStatement.bankName} (${updatedStatement.period})`);
    pushSingleStatementToSheet(updatedStatement, "write");
  };

  const deleteBankStatement = (id: string) => {
    const nextSt = bankStatements.filter((s) => s.id !== id);
    setBankStatements(nextSt);
    persistChanges({ statements: nextSt });
    logAction("Deleted Bank Statement Record", `Statement ID ${id} deleted`);
    // No sheet row clear on delete — use DataSync to reconcile
  };

  const toggleStatementDownload = (id: string) => {
    let updatedSt: BankStatement | undefined;
    const nextSt = bankStatements.map((s) => {
      if (s.id === id) {
        const nextDownloaded = !s.downloaded;
        const downloadedAt = nextDownloaded
          ? new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
          : "";
        updatedSt = { ...s, downloaded: nextDownloaded, downloadedAt };
        return updatedSt;
      }
      return s;
    });
    setBankStatements(nextSt);
    persistChanges({ statements: nextSt });
    logAction("Toggled Bank Statement Download", `Statement ID ${id}`);
    if (updatedSt) pushSingleStatementToSheet(updatedSt, "write");
  };

  const updatePayrollPivot = (newPivot: PayrollPivot) => {
    setPayrollPivot(newPivot);
    persistChanges({ payrollPivot: newPivot });
    logAction("Updated Payroll Data", "Payroll pivot table updated.");
  };

  const importSheetData = (parsedData: any) => {
    if (parsedData.ap && Array.isArray(parsedData.ap)) setApBills(parsedData.ap);
    if (parsedData.banks && Array.isArray(parsedData.banks)) setBankAccounts(parsedData.banks);
    if (parsedData.loans && Array.isArray(parsedData.loans)) setLoans(parsedData.loans);
    if (parsedData.ar && Array.isArray(parsedData.ar)) setArItems(parsedData.ar);
    if (parsedData.statements && Array.isArray(parsedData.statements)) setBankStatements(parsedData.statements);
    
    persistChanges({
      ap: parsedData.ap || apBills,
      banks: parsedData.banks || bankAccounts,
      loans: parsedData.loans || loans,
      ar: parsedData.ar || arItems,
      statements: parsedData.statements || bankStatements
    });
    logAction("Imported External Sheet Data", "Updated portal datasets via Google Sheets import.");
  };

  return (
    <FinanceContext.Provider
      value={{
        currentPage,
        setCurrentPage,
        activeMember,
        setActiveMember,
        userEmail,
        setUserEmail,
        isLoading,
        theme,
        toggleTheme,
        isSidebarFolded,
        toggleSidebarFold,
        googleUser,
        needsAuth,
        setNeedsAuth,
        handleGoogleSignIn,
        handleGoogleLogout,
        sheetMappings,
        updateSheetMapping,
        syncLogs,
        isSyncing,
        lastSyncedAt,
        autoSyncEnabled,
        setAutoSyncEnabled,
        syncAllFromGoogleSheets,
        syncAllToGoogleSheets,
        syncModuleFromGoogleSheet,
        syncModuleToGoogleSheet,
        autoDetectSheetTabs,
        apBills,
        bankAccounts,
        loans,
        arItems,
        bankStatements,
        payrollWeeks,
        payrollPivot,
        auditLogs,
        headleys,
        selectedEntities,
        setSelectedEntities,
        toggleEntityFilter,
        paymentMethodFilter,
        setPaymentMethodFilter,
        availableAPEntities,
        addBill,
        updateBill,
        toggleBillStatus,
        deleteBill,
        addBankAccount,
        updateBankAccount,
        updateBankBalance,
        copyAllBalancesToYesterday,
        deleteBankAccount,
        addLoan,
        updateLoan,
        deleteLoan,
        addARItem,
        updateARItem,
        deleteARItem,
        toggleARStage,
        updateARRemarks,
        addBankStatement,
        updateBankStatement,
        toggleStatementDownload,
        deleteBankStatement,
        updatePayrollPivot,
        addCustomSheetMapping,
        deleteSheetMapping,
        localCalendarEvents,
        addCalendarEvent,
        deleteCalendarEvent,
        updateCalendarEvent,
        calendarLocalEvents,
        toggleCalendarLocalEventDone,
        externalLinks,
        addExternalLink,
        updateExternalLink,
        deleteExternalLink,
        quickNotes,
        addQuickNote,
        updateQuickNote,
        deleteQuickNote,
        clearAllQuickNotes,
        bulkSeedWorkspace,
        reorderQuickNotes,
        gasUrls,
        updateGasUrl,
        switchUser,
        signOutUser,
        autoPushEnabled,
        setAutoPushEnabled,
        syncToast,
        clearSyncToast,
        showToast,
        confirmModal,
        showConfirm,
        clearConfirmModal,
        datePickerModal,
        showDatePicker,
        clearDatePickerModal,
        importSheetData,
        logAction,
        loginLogs,
        logsSheetId,
        searchHighlightId,
        setSearchHighlightId,
        emailPrefill,
        setEmailPrefill,
        headleysPrefill,
        setHeadleysPrefill,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error("useFinance must be used within a FinanceProvider");
  }
  return context;
};
