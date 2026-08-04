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
  appendStatement
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
  addBill: (bill: Omit<APBill, "id">) => void;
  updateBill: (bill: APBill) => void;
  toggleBillStatus: (id: string, status: "unpaid" | "paid" | "hold", paidDate?: string) => void;
  deleteBill: (id: string) => void;
  
  addBankAccount: (acc: Omit<BankAccount, "id">) => void;
  updateBankAccount: (account: BankAccount) => void;
  updateBankBalance: (id: string, newBalance: number) => void;
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

  // GAS Dashboard URLs
  gasUrls: { curcumin: string; fouryr: string; ziglar: string };
  updateGasUrl: (key: "curcumin" | "fouryr" | "ziglar", url: string) => void;

  // User Auth & Switcher
  switchUser: (email: string, name?: string) => void;
  signOutUser: () => Promise<void>;

  // Auto Push (Instant Sync on Edit)
  autoPushEnabled: boolean;
  setAutoPushEnabled: (enabled: boolean) => void;

  // Sync toast notification
  syncToast: { message: string; type: "success" | "error" | "info" } | null;
  clearSyncToast: () => void;

  importSheetData: (data: any) => void;
  logAction: (action: string, details: string) => void;
}

const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit?usp=sharing";

const DEFAULT_EXTERNAL_LINKS: ExternalLinkItem[] = [
  {
    id: "tool-master",
    name: "Master Finance Spreadsheet",
    url: "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit",
    iconType: "sheet",
    color: "#1a73e8",
    category: "tools",
    description: "Primary Google Spreadsheet sync source for AP, Banks, Loans, and AR"
  },
  {
    id: "tool-payroll-sheet",
    name: "4YR Payroll Master Sheet",
    url: "https://docs.google.com/spreadsheets/d/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs/edit",
    iconType: "sheet",
    color: "#7c3aed",
    category: "tools",
    description: "Payroll details, pivot data, and weekly breakdown tabs"
  },
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
    id: "drive-main",
    name: "Finance & Receipts Drive",
    url: "https://drive.google.com/drive/folders/15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs",
    iconType: "folder",
    color: "#f59e0b",
    category: "drive",
    description: "Main Google Drive folder storing invoices, receipts, and reports"
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
  const [needsAuth, setNeedsAuth] = useState<boolean>(() => {
    return !localStorage.getItem("financeops_user_email");
  });

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
  const [syncToast, setSyncToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const clearSyncToast = () => setSyncToast(null);
  const showToast = (message: string, type: "success" | "error" | "info" = "info", duration = 4000) => {
    setSyncToast({ message, type });
    setTimeout(() => setSyncToast(null), duration);
  };
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
    logAction("Added External Link", `Added '${link.name}' link (${link.url})`);
  };

  const updateExternalLink = (id: string, updates: Partial<ExternalLinkItem>) => {
    const updated = externalLinks.map((l) => (l.id === id ? { ...l, ...updates } : l));
    setExternalLinks(updated);
    localStorage.setItem("financeops_external_links", JSON.stringify(updated));
    logAction("Updated External Link", `Updated link ID '${id}'`);
  };

  const deleteExternalLink = (id: string) => {
    const updated = externalLinks.filter((l) => l.id !== id);
    setExternalLinks(updated);
    localStorage.setItem("financeops_external_links", JSON.stringify(updated));
    logAction("Deleted External Link", `Removed link ID '${id}'`);
  };

  // Quick Notes State
  const [quickNotes, setQuickNotes] = useState<DashboardNote[]>(() => {
    try {
      const saved = localStorage.getItem("financeops_quick_notes");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  // GAS Web App URLs for Dashboards
  const [gasUrls, setGasUrls] = useState<{ curcumin: string; fouryr: string; ziglar: string }>(() => {
    try {
      const saved = localStorage.getItem("financeops_gas_urls");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { curcumin: "", fouryr: "", ziglar: "" };
  });

  const updateGasUrl = (key: "curcumin" | "fouryr" | "ziglar", url: string) => {
    const next = { ...gasUrls, [key]: url };
    setGasUrls(next);
    localStorage.setItem("financeops_gas_urls", JSON.stringify(next));
    persistChanges({ gasUrls: next } as any);
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

  const addQuickNote = (note: Omit<DashboardNote, "id">) => {
    const newNote: DashboardNote = {
      ...note,
      id: "note-" + Date.now(),
      createdAt: note.createdAt || new Date().toISOString().split("T")[0]
    };
    const updated = [newNote, ...quickNotes];
    setQuickNotes(updated);
    localStorage.setItem("financeops_quick_notes", JSON.stringify(updated));
    persistChanges({ quickNotes: updated } as any);
    logAction("Added Note", `Created note '${newNote.title}'`);
  };

  const updateQuickNote = (id: string, updates: Partial<DashboardNote>) => {
    const updated = quickNotes.map((n) => (n.id === id ? { ...n, ...updates } : n));
    setQuickNotes(updated);
    localStorage.setItem("financeops_quick_notes", JSON.stringify(updated));
    persistChanges({ quickNotes: updated } as any);
    logAction("Updated Note", `Updated note ID '${id}'`);
  };

  const deleteQuickNote = (id: string) => {
    const updated = quickNotes.filter((n) => n.id !== id);
    setQuickNotes(updated);
    localStorage.setItem("financeops_quick_notes", JSON.stringify(updated));
    persistChanges({ quickNotes: updated } as any);
    logAction("Deleted Note", `Removed note ID '${id}'`);
  };

  const clearAllQuickNotes = () => {
    setQuickNotes([]);
    localStorage.setItem("financeops_quick_notes", JSON.stringify([]));
    persistChanges({ quickNotes: [] } as any);
    logAction("Cleared Notes", "All quick notes cleared");
  };

  // State collections
  const [availableAPEntities, setAvailableAPEntities] = useState<string[]>(["Ruby's", "TI", "MSDx"]);
  const [apBills, setApBills] = useState<APBill[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [arItems, setArItems] = useState<ARItem[]>([]);
  const [bankStatements, setBankStatements] = useState<BankStatement[]>([]);
  const [payrollWeeks, setPayrollWeeks] = useState<PayrollWeek[]>([]);
  const [payrollPivot, setPayrollPivot] = useState<PayrollPivot>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
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
        setUserEmail(user.email || "accounting@marktimm.com");
        setNeedsAuth(false);
        startAutoTokenRefresh();
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

  // Fetch initial data from server API
  useEffect(() => {
    fetch("/api/data")
      .then((res) => res.json())
      .then((data) => {
        let hasSufficientData = false;
        if (data) {
          if (data.ap && data.ap.length >= 20) {
            const tiCount = data.ap.filter((b: APBill) => b.entity === "TI" || b.sheet === "TI Bills").length;
            if (tiCount >= 5) {
              hasSufficientData = true;
            }
            setApBills(recomputeBills(data.ap));
          }
          if (data.banks) setBankAccounts(data.banks);
          if (data.loans) setLoans(data.loans);
          if (data.ar) setArItems(data.ar);
          if (data.statements) setBankStatements(data.statements);
          if (data.quickNotes) {
            setQuickNotes(data.quickNotes);
            localStorage.setItem("financeops_quick_notes", JSON.stringify(data.quickNotes));
          }
          if (data.calendarLocalEvents && Array.isArray(data.calendarLocalEvents)) setCalendarLocalEvents(data.calendarLocalEvents);
          if (data.payrollWeeks) setPayrollWeeks(data.payrollWeeks);
          if (data.payrollPivot) setPayrollPivot(data.payrollPivot);
          if (data.auditLog) setAuditLogs(data.auditLog);
          if (data.headleys) setHeadleys(data.headleys);
          if (data.lastSyncedAt) setLastSyncedAt(data.lastSyncedAt);
          if (data.sheetMappings && Array.isArray(data.sheetMappings)) {
            const existingIds = new Set(data.sheetMappings.map((m: SheetMappingConfig) => m.id));
            const missingDefaults = DEFAULT_MAPPINGS.filter((dm) => !existingIds.has(dm.id));
            setSheetMappings([...data.sheetMappings, ...missingDefaults]);
          }
          if (data.syncLogs) setSyncLogs(data.syncLogs);
        }

        // Only auto-pull-live if AP data is sparse/missing — prevents the sheet from
        // overwriting portal-side changes that haven't been pushed to the sheet yet.
        // When data is sufficient, the portal is the source of truth on startup;
        // users can manually Pull Live from Settings when they know the sheet was edited externally.
        const hasCalendarData = data.calendarLocalEvents && Array.isArray(data.calendarLocalEvents) && data.calendarLocalEvents.length > 0;
        if (hasSufficientData) {
          // Data is good; skip auto-pull to preserve portal-side changes
          setIsLoading(false);
        } else {
          setIsSyncing(true);
          fetch("/api/pull-live", { method: "POST" })
            .then((res) => res.json())
            .then((resp) => {
              if (resp && resp.data) {
                const live = resp.data;
                if (live.ap) setApBills(recomputeBills(live.ap));
                if (live.banks) setBankAccounts(live.banks);
                if (live.loans) setLoans(live.loans);
                if (live.ar) setArItems(live.ar);
                if (live.statements) setBankStatements(live.statements);
                if (live.quickNotes && Array.isArray(live.quickNotes) && live.quickNotes.length > 0) {
                  setQuickNotes(live.quickNotes);
                  localStorage.setItem("financeops_quick_notes", JSON.stringify(live.quickNotes));
                }
                if (!hasCalendarData && live.calendarLocalEvents && Array.isArray(live.calendarLocalEvents)) setCalendarLocalEvents(live.calendarLocalEvents);
                if (live.payrollPivot) setPayrollPivot(live.payrollPivot);
                if (live.payrollWeeks) setPayrollWeeks(live.payrollWeeks);
                if (live.lastSyncedAt) setLastSyncedAt(live.lastSyncedAt);
                if (live.headleys) setHeadleys(live.headleys);
              }
            })
            .catch((e) => console.error("Initial live pull failed:", e))
            .finally(() => {
              setIsSyncing(false);
              setIsLoading(false);
            });
        }
      })
      .catch((err) => {
        console.error("Failed to load initial finance data:", err);
        setIsLoading(false);
      });
  }, []);

  // Google Sign In / Out Handlers
  const handleGoogleSignIn = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setUserEmail(res.user.email || "accounting@marktimm.com");
        setNeedsAuth(false);
        startAutoTokenRefresh();
        logAction("Google OAuth Authenticated", `Connected as ${res.user.email}`);
        window.dispatchEvent(new Event("google-token-refreshed"));
      }
    } catch (err: any) {
      console.error("Sign in failed:", err);
      const errCode = err?.code || "";
      if (errCode === "auth/popup-blocked") {
        console.warn("Sign-in popup was blocked by browser iframe settings.");
      } else if (errCode === "auth/cancelled-popup-request") {
        console.warn("Sign-in popup request cancelled because another authentication popup was opened.");
      } else if (errCode === "auth/popup-closed-by-user") {
        console.log("Sign-in popup closed by user.");
      } else {
        console.warn("Sign-in note:", err.message || err);
      }
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleUser(null);
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
    gasUrls: { curcumin: string; fouryr: string; ziglar: string };
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
      gasUrls: updatedData.gasUrls || gasUrls
    };

    fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch((err) => console.error("Error saving data:", err));
  };

  const logAction = (action: string, details: string) => {
    const newLog: AuditLog = {
      timestamp: new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }),
      user: userEmail,
      action,
      details
    };
    const nextLogs = [newLog, ...auditLogs.slice(0, 99)];
    setAuditLogs(nextLogs);
    persistChanges({ auditLog: nextLogs });
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
      const confirmed = window.confirm(
        `Are you sure you want to write and sync the current portal data to Google Sheet tab '${mapping.tabName}'? This will update the contents of your source spreadsheet.`
      );
      if (!confirmed) return;
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
        if (live.ap && live.ap.length > 0) setApBills(recomputeBills(live.ap));
        if (live.banks && live.banks.length > 0) setBankAccounts(live.banks);
        if (live.loans && live.loans.length > 0) setLoans(live.loans);
        if (live.ar && live.ar.length > 0) setArItems(live.ar);
        if (live.statements && live.statements.length > 0) setBankStatements(live.statements);
        if (live.lastSyncedAt) setLastSyncedAt(live.lastSyncedAt);

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
      console.warn("Server pull-live failed, falling back to client-side sheet fetch:", err);
      for (const mapping of sheetMappings) {
        await syncModuleFromGoogleSheet(mapping.module);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const syncAllToGoogleSheets = async (confirmFirst = true) => {
    if (confirmFirst) {
      const confirmed = window.confirm(
        "Are you sure you want to push all current portal records across AP, AR, Banks, Loans, and Statements to their respective Google Sheet tabs?"
      );
      if (!confirmed) return;
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

  const recomputeBills = (bills: APBill[]): APBill[] => {
    return (bills || []).map((b) => ({
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
          showToast("Google token expired — click 'Connect Google Sheets' to reconnect.", "error", 6000);
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
          await appendAPBill(bill, entity, mapping.spreadsheetIdOrUrl, token);
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
          showToast("Google token expired — click 'Connect Google Sheets' to reconnect.", "error", 6000);
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
      showToast("Google token expired — click 'Connect Google Sheets' to reconnect.", "error", 6000);
    } else {
      showToast(`Sheet sync failed: ${msg || "unknown error"}`, "error", 5000);
      console.warn(`${label} per-item push failed:`, msg);
    }
  };

  const pushSingleBankToSheet = (account: BankAccount, action: "write" | "append") => {
    const token = getAccessToken();
    if (!token) return;
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
    if (!token) return;
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
    if (!token) return;
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
    if (!token) return;
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
          showToast("Google token expired — click 'Connect Google Sheets' to reconnect.", "error", 6000);
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

  const addBill = (newBillData: Omit<APBill, "id">) => {
    const id = "ap-" + Date.now();
    const bucket = computeBucket(newBillData.dueDate, newBillData.status);
    const newBill: APBill = { ...newBillData, id, bucket };
    const nextBills = [newBill, ...apBills];
    setApBills(nextBills);
    persistChanges({ ap: nextBills });
    logAction("Added Bill", `${newBill.vendor} (${newBill.entity}) - $${newBill.amount}`);
    pushSingleAPBillToSheet(newBill, "append");
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

  const updateBankBalance = (id: string, newBalance: number) => {
    let updatedAcc: BankAccount | undefined;
    const nextAccs = bankAccounts.map((a) => {
      if (a.id === id) {
        const trend: "up" | "down" = newBalance >= a.balance ? "up" : "down";
        updatedAcc = { ...a, yesterday: a.balance, balance: newBalance, asOf: new Date().toISOString().split("T")[0], trend };
        return updatedAcc;
      }
      return a;
    });
    setBankAccounts(nextAccs);
    persistChanges({ banks: nextAccs });
    logAction("Updated Bank Balance", `Account ID ${id} set to $${newBalance}`);
    if (updatedAcc) pushSingleBankToSheet(updatedAcc, "write");
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
    pushSingleARToSheet(newAR, "append");
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
        gasUrls,
        updateGasUrl,
        switchUser,
        signOutUser,
        autoPushEnabled,
        setAutoPushEnabled,
        syncToast,
        clearSyncToast,
        importSheetData,
        logAction
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
