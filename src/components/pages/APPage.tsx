import React, { useState, useMemo } from "react";
import { useFinance } from "../../context/FinanceContext";
import { PageHeader } from "../PageHeader";
import { APBill, EntityName } from "../../types";
import { normalizeEntityName } from "../../services/googleSheetsService";
import { formatCurrency } from "../../utils/formatters";
import { Search, ChevronDown, ChevronRight, PauseCircle, Eye } from "lucide-react";
import { AddBillModal } from "../modals/AddBillModal";
import { EditBillModal } from "../modals/EditBillModal";
import { BillDetailsModal } from "../modals/BillDetailsModal";

export const APPage: React.FC<{ filterEntityOverride?: EntityName }> = ({ filterEntityOverride }) => {
  const {
    apBills,
    selectedEntities,
    paymentMethodFilter,
    theme
  } = useFinance();

  const isLight = theme === "light";

  const [activeTab, setActiveTab] = useState<"due" | "paid" | "summary">("due");
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [vendorFilter, setVendorFilter] = useState("ALL");
  const [monthFilter, setMonthFilter] = useState("ALL");
  const [yearFilter, setYearFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "Auto" | "Manual">("ALL");
  const [qboFilter, setQboFilter] = useState<"ALL" | "In QBO" | "Not in QBO">("ALL");

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<APBill | null>(null);
  // Store IDs at click time (preserves bucket filter); derive from live apBills (handles deletes)
  const [viewingVendorBillIds, setViewingVendorBillIds] = useState<string[]>([]);
  const viewingVendorBills = apBills.filter((b) => viewingVendorBillIds.includes(b.id));

  // Collapsed state for sub-entity banners
  const [collapsedSections, setCollapsedSections] = useState<{ [key: string]: boolean }>({});
  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const ENTITY_CONFIG_FALLBACK = {
    bg: "bg-[#546e7a]",
    light: isLight ? "bg-slate-50/80" : "bg-slate-700/10",
    textClass: "text-[#546e7a]",
    badgeClass: "bg-[#546e7a]/20 text-[#546e7a]",
    fillClass: isLight ? "bg-slate-50/90 border-slate-200/80 hover:bg-slate-100/90" : "bg-slate-900/25 border-slate-700/40 hover:bg-slate-700/40"
  };
  // Entity config (used for individual bill row styling)
  const ENTITY_CONFIG_MAP: Record<string, { bg: string; light: string; textClass: string; badgeClass: string; fillClass: string }> = {
    "Ruby's": {
      bg: "bg-[#d81b60]",
      light: isLight ? "bg-pink-50/80" : "bg-[#d81b60]/10",
      textClass: "text-[#e91e63]",
      badgeClass: "bg-[#d81b60]/20 text-[#e91e63]",
      fillClass: isLight ? "bg-pink-50/90 border-pink-200/80 hover:bg-pink-100/90" : "bg-pink-950/25 border-pink-900/40 hover:bg-pink-900/40"
    },
    TI: {
      bg: "bg-[#1a73e8]",
      light: isLight ? "bg-blue-50/80" : "bg-[#1a73e8]/10",
      textClass: "text-[#1a73e8]",
      badgeClass: "bg-[#1a73e8]/20 text-[#1a73e8]",
      fillClass: isLight ? "bg-blue-50/90 border-blue-200/80 hover:bg-blue-100/90" : "bg-blue-950/25 border-blue-900/40 hover:bg-blue-900/40"
    },
    MSDx: {
      bg: "bg-[#00897b]",
      light: isLight ? "bg-teal-50/80" : "bg-[#00897b]/10",
      textClass: "text-[#00897b]",
      badgeClass: "bg-[#00897b]/20 text-[#00897b]",
      fillClass: isLight ? "bg-teal-50/90 border-teal-200/80 hover:bg-teal-100/90" : "bg-teal-950/25 border-teal-900/40 hover:bg-teal-900/40"
    },
    CurcuminPro: {
      bg: "bg-[#6d4c41]",
      light: isLight ? "bg-amber-50/80" : "bg-[#6d4c41]/10",
      textClass: "text-[#6d4c41]",
      badgeClass: "bg-[#6d4c41]/20 text-[#6d4c41]",
      fillClass: isLight ? "bg-amber-50/90 border-amber-200/80 hover:bg-amber-100/90" : "bg-amber-950/25 border-amber-900/40 hover:bg-amber-900/40"
    },
    Ziglar: {
      bg: "bg-[#059669]",
      light: isLight ? "bg-emerald-50/80" : "bg-[#059669]/10",
      textClass: "text-[#059669]",
      badgeClass: "bg-[#059669]/20 text-[#059669]",
      fillClass: isLight ? "bg-emerald-50/90 border-emerald-200/80 hover:bg-emerald-100/90" : "bg-emerald-950/25 border-emerald-900/40 hover:bg-emerald-900/40"
    }
  };
  const ENTITY_CONFIG = new Proxy(ENTITY_CONFIG_MAP, {
    get: (target, key: string) => target[key] ?? ENTITY_CONFIG_FALLBACK
  });

  // Sub-entity banner configs
  const SUBENTITY_BANNER_CONFIGS: Record<string, { label: string; bg: string }> = {
    "rubys":    { label: "Ruby's Bills",         bg: "bg-[#d81b60] text-white" },
    "4g":       { label: "4G",                   bg: "bg-[#1a73e8] text-white" },
    "4yr":      { label: "4YR",                  bg: "bg-[#1565c0] text-white" },
    "corner":   { label: "Corner Property Group", bg: "bg-[#1976d2] text-white" },
    "e1":       { label: "E1",                   bg: "bg-[#0288d1] text-white" },
    "ti":       { label: "TI",                   bg: "bg-[#1a73e8] text-white" },
    "ti-bills": { label: "TI Bills",             bg: "bg-[#3949ab] text-white" },
    "msdx":     { label: "MSDx Bills",           bg: "bg-[#00897b] text-white" },
    "curcumin": { label: "CurcuminPro",          bg: "bg-[#6d4c41] text-white" },
    "ziglar":   { label: "Ziglar",               bg: "bg-[#059669] text-white" },
  };

  const SUBENTITY_ORDER = ["rubys", "4g", "4yr", "corner", "e1", "ti", "ti-bills", "msdx", "curcumin", "ziglar"];

  // Resolve sub-entity key for a bill
  const getSubEntityKey = (b: APBill): string => {
    const normE = normalizeEntityName(b.entity);
    if (normE === "Ruby's") return "rubys";
    if (normE === "MSDx") return "msdx";
    if (normE === "CurcuminPro") return "curcumin";
    if (normE === "Ziglar") return "ziglar";
    if (b.amount < 0) return "ti-bills";
    if (normE === "TI") {
      const comp = (b.company || "").trim();
      const cl = comp.toLowerCase();
      if (cl === "4g") return "4g";
      if (cl === "4yr" || cl === "4 yr") return "4yr";
      if (cl.includes("corner")) return "corner";
      if (cl === "e1" || cl === "e-1") return "e1";
      if (!comp || cl === "ti") return "ti";
      // Any other TI sub-company (e.g. "TI - 7796", "Co-Alliance") gets its own banner
      return `ti-sub:${comp}`;
    }
    // Unknown entity: use a slug of the entity name
    return normE.toLowerCase().replace(/[^a-z0-9]/g, "");
  };

  // Unique vendors for dropdown
  const uniqueVendors = useMemo(() => {
    const setV = new Set<string>();
    apBills.forEach((b) => {
      if (b.vendor && b.vendor.trim()) setV.add(b.vendor.trim());
    });
    return Array.from(setV).sort((a, b) => a.localeCompare(b));
  }, [apBills]);

  const effectiveSelectedEntities = filterEntityOverride
    ? new Set([filterEntityOverride])
    : selectedEntities;

  const singleActiveEntity = effectiveSelectedEntities.has("ALL") || effectiveSelectedEntities.size !== 1
    ? null
    : Array.from(effectiveSelectedEntities)[0];
  const activeEntityName = filterEntityOverride || singleActiveEntity;
  const pageTitle = activeEntityName ? `${activeEntityName} — Accounts Payables` : "Accounts Payables";
  const headerBg = activeEntityName === "Ruby's" ? "bg-[#d81b60]"
    : activeEntityName === "MSDx" ? "bg-[#00897b]"
    : activeEntityName === "CurcuminPro" ? "bg-[#6d4c41]"
    : activeEntityName === "Ziglar" ? "bg-[#059669]"
    : "bg-[#1a73e8]";

  // Filtered bills
  const filteredBills = useMemo(() => {
    return apBills.filter((b) => {
      // Entity filter
      if (filterEntityOverride) {
        if (normalizeEntityName(b.entity) !== filterEntityOverride) return false;
      } else if (selectedEntities && !selectedEntities.has("ALL")) {
        const normE = normalizeEntityName(b.entity);
        if (!Array.from(selectedEntities).some((se) => normalizeEntityName(String(se)) === normE)) return false;
      }

      // Company / sub-entity filter
      if (companyFilter !== "ALL") {
        if (getSubEntityKey(b) !== companyFilter) return false;
      }

      // Vendor filter
      if (vendorFilter !== "ALL" && b.vendor.trim() !== vendorFilter) return false;

      // Month filter
      if (monthFilter !== "ALL" && b.dueDate) {
        const d = new Date(b.dueDate + "T00:00:00");
        if (!isNaN(d.getTime()) && String(d.getMonth() + 1) !== monthFilter) return false;
      }

      // Year filter
      if (yearFilter !== "ALL" && b.dueDate) {
        const d = new Date(b.dueDate + "T00:00:00");
        if (!isNaN(d.getTime()) && String(d.getFullYear()) !== yearFilter) return false;
      }

      // Type filter
      if (typeFilter === "Auto" && b.method !== "Autodebit") return false;
      if (typeFilter === "Manual" && b.method === "Autodebit") return false;

      // QBO filter
      if (qboFilter === "In QBO" && !b.inQBO) return false;
      if (qboFilter === "Not in QBO" && b.inQBO) return false;

      // Global payment method filter
      if (paymentMethodFilter !== "All" && b.method !== paymentMethodFilter) return false;

      // Search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        if (
          !b.vendor.toLowerCase().includes(q) &&
          !(b.invoiceNo && b.invoiceNo.toLowerCase().includes(q)) &&
          !(b.dueDate && b.dueDate.toLowerCase().includes(q)) &&
          !b.amount.toString().includes(q) &&
          !(b.remarks && b.remarks.toLowerCase().includes(q))
        ) return false;
      }

      return true;
    });
  }, [apBills, selectedEntities, filterEntityOverride, companyFilter, vendorFilter, monthFilter, yearFilter, typeFilter, qboFilter, paymentMethodFilter, searchTerm]);

  const unpaidBills = filteredBills.filter((b) => b.status !== "paid" && b.status !== "hold" && b.bucket !== "on-hold");
  const onHoldBills = filteredBills.filter((b) => b.status === "hold" || b.bucket === "on-hold");
  const paidBills = filteredBills.filter((b) => b.status === "paid");

  const pastDueBills     = unpaidBills.filter((b) => b.bucket === "past-due");
  const thisWeekBills    = unpaidBills.filter((b) => b.bucket === "this-week");
  const nextWeekBills    = unpaidBills.filter((b) => b.bucket === "next-week");
  const restOfMonthBills = unpaidBills.filter((b) => b.bucket === "rest-of-month");
  const restOfYearBills  = unpaidBills.filter((b) => b.bucket === "rest-of-year" || b.bucket === "remaining");

  const ENTITY_ORDER: EntityName[] = ["Ruby's", "TI", "MSDx", "CurcuminPro", "Ziglar"];

  // Format date as "Jul 23, 2026"
  const formatDateStr = (dateStr?: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Render sub-entity-grouped vendor table (GAS table format: VENDOR | DUE | BILLS | AMOUNT)
  const renderBucketSubentityTable = (bills: APBill[], bucketId: string) => {
    const isPaidTab = bucketId === "paid-tab";
    const groupsMap: Record<string, APBill[]> = {};
    bills.forEach((b) => {
      const k = getSubEntityKey(b);
      if (!groupsMap[k]) groupsMap[k] = [];
      groupsMap[k].push(b);
    });

    const staticKeys = SUBENTITY_ORDER.filter((k) => groupsMap[k] && groupsMap[k].length > 0);
    const dynamicKeys = Object.keys(groupsMap)
      .filter((k) => !SUBENTITY_ORDER.includes(k) && groupsMap[k]?.length > 0)
      .sort();
    const activeKeys = [...staticKeys, ...dynamicKeys];

    if (activeKeys.length === 0) {
      return (
        <div className={`py-6 text-center text-xs ${isLight ? "text-slate-400" : "text-[#555]"}`}>
          No bills in this period
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {activeKeys.map((subKey) => {
          const subBills = groupsMap[subKey];
          const subTotal = subBills.reduce((s, b) => s + b.amount, 0);
          const bannerCfg = SUBENTITY_BANNER_CONFIGS[subKey] || {
            label: subBills[0]?.company || subKey.replace(/^ti-sub:/, ""),
            bg: "bg-[#1565c0] text-white"
          };
          const subSecKey = `${bucketId}-${subKey}`;
          // rest-of-year sub-entities default collapsed; others default open
          const isSubCollapsed = bucketId === "rest-of-year"
            ? collapsedSections[subSecKey] !== false
            : !!collapsedSections[subSecKey];

          // Group by vendor
          const vendorMap: Record<string, APBill[]> = {};
          subBills.forEach((b) => {
            const vName = b.vendor || "Unknown Vendor";
            if (!vendorMap[vName]) vendorMap[vName] = [];
            vendorMap[vName].push(b);
          });

          // Sort vendors by most recent due/paid date first (descending)
          const vendorNames = Object.keys(vendorMap).sort((a, bk) => {
            const pickDate = (bill: APBill) => (isPaidTab ? bill.paidDate || bill.dueDate : bill.dueDate) || "";
            const maxA = vendorMap[a].reduce((mx, bill) => { const d = pickDate(bill); return d > mx ? d : mx; }, "0000-00-00");
            const maxB = vendorMap[bk].reduce((mx, bill) => { const d = pickDate(bill); return d > mx ? d : mx; }, "0000-00-00");
            return maxB.localeCompare(maxA);
          });

          return (
            <div key={subKey} className={`rounded-md overflow-hidden border ${isLight ? "border-slate-200 bg-white" : "border-[#262626] bg-[#141414]"}`}>
              {/* Sub-entity banner */}
              <div
                onClick={() => toggleSection(subSecKey)}
                className={`${bannerCfg.bg} px-2.5 py-1.5 flex items-center justify-between text-xs font-bold cursor-pointer select-none hover:opacity-90 transition-opacity`}
              >
                <span className="flex items-center gap-1.5">
                  {isSubCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {bannerCfg.label}
                  <span className="text-[10px] font-normal opacity-85">({subBills.length} bill{subBills.length !== 1 ? "s" : ""})</span>
                </span>
                <span className="font-extrabold">{formatCurrency(subTotal)}</span>
              </div>

              {!isSubCollapsed && (
                <>
                  {/* Column headers */}
                  <div className={`grid grid-cols-12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border-b ${
                    isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-[#1c1c1c] border-[#262626] text-gray-400"
                  }`}>
                    <div className="col-span-5">VENDOR</div>
                    <div className="col-span-3 text-center">{isPaidTab ? "PAID DATE" : "DUE"}</div>
                    <div className="col-span-2 text-center">BILLS</div>
                    <div className="col-span-2 text-right">AMOUNT</div>
                  </div>

                  {/* Vendor rows */}
                  <div className={`divide-y ${isLight ? "divide-slate-100" : "divide-[#222]"}`}>
                    {vendorNames.map((vName) => {
                      const vBills = [...vendorMap[vName]].sort((a, b) => {
                        const dA = (isPaidTab ? a.paidDate || a.dueDate : a.dueDate) || "";
                        const dB = (isPaidTab ? b.paidDate || b.dueDate : b.dueDate) || "";
                        return dA.localeCompare(dB);
                      });
                      const vTotal = vBills.reduce((s, b) => s + b.amount, 0);

                      // Most recent due/paid date for this vendor
                      const pickDate = (bill: APBill) => (isPaidTab ? bill.paidDate || bill.dueDate : bill.dueDate) || "";
                      const latestDate = vBills.reduce((mx, bill) => { const d = pickDate(bill); return d > mx ? d : mx; }, "");

                      const vEntity = normalizeEntityName(vBills[0]?.entity);
                      const vCfg = ENTITY_CONFIG[vEntity] || ENTITY_CONFIG["TI"];

                      return (
                        <div key={vName}>
                          {/* Vendor summary row — clicking always opens vendor modal */}
                          <div
                            onClick={() => setViewingVendorBillIds(vBills.map((b) => b.id))}
                            className={`grid grid-cols-12 items-center px-2.5 py-1.5 text-[11px] cursor-pointer select-none transition-colors ${
                              isLight ? "hover:bg-slate-50 text-slate-800" : "hover:bg-white/5 text-white"
                            }`}
                          >
                            {/* Vendor name */}
                            <div className="col-span-5 flex items-center gap-1 min-w-0">
                              <Eye className={`w-3 h-3 shrink-0 ${isLight ? "text-slate-300" : "text-gray-600"}`} />
                              <span className="truncate font-semibold">{vName}</span>
                            </div>
                            {/* Due date */}
                            <div className={`col-span-3 text-center text-[11px] ${isLight ? "text-slate-500" : "text-gray-400"}`}>
                              {formatDateStr(latestDate)}
                            </div>
                            {/* Bill count */}
                            <div className="col-span-2 text-center">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLight ? "bg-slate-100 text-slate-600" : "bg-white/10 text-gray-300"}`}>
                                {vBills.length}
                              </span>
                            </div>
                            {/* Amount — orange for on-hold, otherwise entity color */}
                            <div className={`col-span-2 text-right font-bold ${bucketId === "on-hold-sec" ? "text-orange-500" : vCfg.textClass}`}>
                              {formatCurrency(vTotal)}
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const bucketsConfig = [
    { key: "past-due",      label: "Past Due",       bg: "bg-[#dc2626]", bills: pastDueBills },
    { key: "this-week",     label: "This Week",      bg: "bg-[#1a73e8]", bills: thisWeekBills },
    { key: "next-week",     label: "Next Week",      bg: "bg-[#00897b]", bills: nextWeekBills },
    { key: "rest-of-month", label: "Rest of Month",  bg: "bg-[#7c3aed]", bills: restOfMonthBills },
  ];

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden ${isLight ? "bg-slate-100 text-slate-800" : "bg-[#0a0a0a] text-[#e8e8e8]"}`}>
      <PageHeader
        title={pageTitle}
        bgClass={headerBg}
        moduleId="ap"
        showEntityPills={true}
        showPayToggle={false}
        tabs={[
          { id: "due", label: "Due Bills" },
          { id: "paid", label: "Paid Bills" },
          { id: "summary", label: "Summary KPI" }
        ]}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as any)}
        onAddClick={() => setIsAddModalOpen(true)}
      />

      {/* Filter Bar */}
      <div className={`flex flex-wrap items-center gap-2 px-4 py-2 ${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border-b shrink-0`}>
        {/* Search */}
        <div className="relative min-w-[160px] max-w-[260px]">
          <Search className={`w-3.5 h-3.5 absolute left-2.5 top-2 ${isLight ? "text-slate-400" : "text-[#666]"}`} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search vendor, invoice #, amount..."
            className={`w-full ${isLight ? "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400" : "bg-[#181818] border-[#262626] text-white placeholder-[#666]"} border rounded-md pl-8 pr-3 py-1 text-xs focus:outline-none focus:border-[#1a73e8]`}
          />
        </div>

        {/* Company / Sub-entity */}
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className={`${isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#181818] border-[#262626] text-white"} border rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-[#1a73e8]`}
        >
          <option value="ALL">All Companies</option>
          <option value="rubys">Ruby's</option>
          <option value="4g">4G</option>
          <option value="4yr">4YR</option>
          <option value="corner">Corner Property</option>
          <option value="e1">E1</option>
          <option value="ti">TI</option>
          <option value="ti-bills">TI Bills</option>
          <option value="msdx">MSDx</option>
          <option value="curcumin">CurcuminPro</option>
          <option value="ziglar">Ziglar</option>
        </select>

        {/* Vendor */}
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className={`${isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#181818] border-[#262626] text-white"} border rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-[#1a73e8] max-w-[180px]`}
        >
          <option value="ALL">All Vendors</option>
          {uniqueVendors.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        {/* Month */}
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className={`${isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#181818] border-[#262626] text-white"} border rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-[#1a73e8]`}
        >
          <option value="ALL">All Months</option>
          {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
            <option key={i} value={String(i + 1)}>{m}</option>
          ))}
        </select>

        {/* Year */}
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className={`${isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#181818] border-[#262626] text-white"} border rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-[#1a73e8]`}
        >
          <option value="ALL">All Years</option>
          <option value="2024">2024</option>
          <option value="2025">2025</option>
          <option value="2026">2026</option>
          <option value="2027">2027</option>
        </select>

        {/* Type */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
          className={`${isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#181818] border-[#262626] text-white"} border rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-[#1a73e8]`}
        >
          <option value="ALL">All Types</option>
          <option value="Auto">Auto-Debit</option>
          <option value="Manual">Manual</option>
        </select>

        {/* QBO */}
        <select
          value={qboFilter}
          onChange={(e) => setQboFilter(e.target.value as any)}
          className={`${isLight ? "bg-slate-50 border-slate-300 text-slate-800" : "bg-[#181818] border-[#262626] text-white"} border rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-[#1a73e8]`}
        >
          <option value="ALL">All QBO</option>
          <option value="In QBO">In QBO</option>
          <option value="Not in QBO">Not in QBO</option>
        </select>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* DUE TAB */}
        {activeTab === "due" && (
          <>
            {/* Top KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl p-4 flex flex-col justify-between border-l-4 border-l-blue-500 shadow-xs`}>
                <div className="text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">OUTSTANDING BILLS</div>
                <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">{unpaidBills.length + onHoldBills.length}</div>
              </div>
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl p-4 flex flex-col justify-between border-l-4 border-l-red-500 shadow-xs`}>
                <div className="text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">UNPAID TOTAL</div>
                <div className="text-3xl font-extrabold text-red-600 dark:text-red-400 mt-1">{formatCurrency(unpaidBills.reduce((s, b) => s + b.amount, 0))}</div>
              </div>
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl p-4 flex flex-col justify-between border-l-4 border-l-amber-500 shadow-xs`}>
                <div className="text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">ON HOLD TOTAL</div>
                <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">{formatCurrency(onHoldBills.reduce((s, b) => s + b.amount, 0))}</div>
              </div>
            </div>

            {/* 4-column bucket grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {bucketsConfig.map((bk) => {
                const bTotal = bk.bills.reduce((s, b) => s + b.amount, 0);
                return (
                  <div key={bk.key} className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl overflow-hidden flex flex-col shadow-xs`}>
                    <div className={`${bk.bg} px-3 py-2 flex items-center justify-between text-white font-bold`}>
                      <span className="text-xs uppercase tracking-wider">{bk.label}</span>
                      <span className="text-sm">{formatCurrency(bTotal)}</span>
                    </div>
                    <div className="p-2 flex-1">
                      {renderBucketSubentityTable(bk.bills, bk.key)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rest of Year — full-width, sub-entities collapsed by default */}
            {restOfYearBills.length > 0 && (
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl overflow-hidden shadow-xs`}>
                <div className="bg-[#5c6bc0] px-3 py-2 flex items-center justify-between text-white font-bold">
                  <span className="text-xs uppercase tracking-wider">Rest of Year</span>
                  <span className="text-sm">{formatCurrency(restOfYearBills.reduce((s, b) => s + b.amount, 0))}</span>
                </div>
                <div className="p-2">
                  {renderBucketSubentityTable(restOfYearBills, "rest-of-year")}
                </div>
              </div>
            )}

            {/* On Hold */}
            <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl overflow-hidden shadow-xs`}>
              <div className="bg-[#e65100] px-4 py-2 flex items-center justify-between text-white">
                <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <PauseCircle className="w-4 h-4" /> Bills On Hold ({onHoldBills.length})
                </span>
                <span className="text-sm font-extrabold">{formatCurrency(onHoldBills.reduce((s, b) => s + b.amount, 0))}</span>
              </div>
              <div className="p-3">
                {renderBucketSubentityTable(onHoldBills, "on-hold-sec")}
              </div>
            </div>
          </>
        )}

        {/* PAID TAB */}
        {activeTab === "paid" && (
          <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl p-4 shadow-xs`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#262626] mb-3">
              <h3 className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>
                Paid Bills — Grouped by Company & Vendor
              </h3>
              <span className={`text-xs font-bold ${isLight ? "text-slate-600" : "text-gray-300"}`}>
                Total Paid: {formatCurrency(paidBills.reduce((s, b) => s + b.amount, 0))}
              </span>
            </div>
            {renderBucketSubentityTable(paidBills, "paid-tab")}
          </div>
        )}

        {/* SUMMARY KPI TAB */}
        {activeTab === "summary" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl p-4`}>
                <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>Total Outstanding</div>
                <div className={`text-2xl font-bold ${isLight ? "text-slate-900" : "text-white"} mt-1`}>
                  {formatCurrency(unpaidBills.reduce((s, b) => s + b.amount, 0))}
                </div>
                <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"} mt-1`}>Across filtered entities</div>
              </div>
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl p-4`}>
                <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>Past Due</div>
                <div className="text-2xl font-bold text-[#f87171] mt-1">
                  {formatCurrency(pastDueBills.reduce((s, b) => s + b.amount, 0))}
                </div>
                <div className="text-[11px] text-[#f87171] mt-1">Urgent action required</div>
              </div>
              <div className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl p-4`}>
                <div className={`text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase`}>On Hold</div>
                <div className="text-2xl font-bold text-[#fb923c] mt-1">
                  {formatCurrency(onHoldBills.reduce((s, b) => s + b.amount, 0))}
                </div>
                <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-[#888]"} mt-1`}>Pending approval or dispute</div>
              </div>
            </div>

            {/* Sub-entity breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {SUBENTITY_ORDER.map((subKey) => {
                const keyBills = filteredBills.filter((b) => getSubEntityKey(b) === subKey && b.status !== "paid");
                if (keyBills.length === 0) return null;
                const total = keyBills.reduce((s, b) => s + b.amount, 0);
                const bannerCfg = SUBENTITY_BANNER_CONFIGS[subKey];

                return (
                  <div key={subKey} className={`${isLight ? "bg-white border-slate-200" : "bg-[#111] border-[#262626]"} border rounded-xl overflow-hidden`}>
                    <div className={`${bannerCfg.bg} px-3 py-2 flex items-center justify-between text-xs font-bold`}>
                      <span>{bannerCfg.label}</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                    <div className="p-3 space-y-1.5 text-xs">
                      {[
                        { label: "Past Due", bills: keyBills.filter((b) => b.bucket === "past-due"), color: "text-[#f87171]" },
                        { label: "This Week", bills: keyBills.filter((b) => b.bucket === "this-week"), color: isLight ? "text-slate-900" : "text-white" },
                        { label: "Next Week", bills: keyBills.filter((b) => b.bucket === "next-week"), color: isLight ? "text-slate-900" : "text-white" },
                        { label: "Rest of Month", bills: keyBills.filter((b) => b.bucket === "rest-of-month"), color: isLight ? "text-slate-700" : "text-gray-300" },
                        { label: "Rest of Year", bills: keyBills.filter((b) => b.bucket === "rest-of-year" || b.bucket === "remaining"), color: isLight ? "text-slate-500" : "text-[#888]" },
                      ].map(({ label, bills: bk, color }) => bk.length > 0 && (
                        <div key={label} className="flex justify-between">
                          <span className={isLight ? "text-slate-500" : "text-[#888]"}>{label}:</span>
                          <span className={`font-semibold ${color}`}>{formatCurrency(bk.reduce((s, b) => s + b.amount, 0))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <AddBillModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        defaultEntity={filterEntityOverride || "Ruby's"}
      />

      <EditBillModal
        bill={editingBill}
        isOpen={!!editingBill}
        onClose={() => setEditingBill(null)}
      />

      <BillDetailsModal
        vendorBills={viewingVendorBills}
        isOpen={viewingVendorBillIds.length > 0}
        onClose={() => setViewingVendorBillIds([])}
        onEdit={(b) => setEditingBill(b)}
      />
    </div>
  );
};
