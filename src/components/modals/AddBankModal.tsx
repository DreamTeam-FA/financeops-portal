import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { EntityName } from "../../types";
import { X } from "lucide-react";

/* ── Shared themed input/select/label helpers ── */
function inputCls(isLight: boolean) {
  return isLight
    ? "w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#0891b2]"
    : "w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#0891b2]";
}
function labelCls(isLight: boolean) {
  return `block text-[11px] font-semibold ${isLight ? "text-slate-500" : "text-[#888]"} uppercase mb-1`;
}

/** Shared modal shell with a colored accent bar at the top */
const ModalShell: React.FC<{
  isLight: boolean;
  accentColor: string;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ isLight, accentColor, maxWidth = "max-w-md", children }) => (
  <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div className={`border rounded-2xl w-full ${maxWidth} overflow-hidden shadow-2xl ${
      isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#0d111a] border-[#1a2235] text-white"
    }`}>
      {/* ── Colored accent bar ── */}
      <div className="h-1.5 w-full" style={{ backgroundColor: accentColor }} />
      <div className="p-5">{children}</div>
    </div>
  </div>
);

function ModalHeader({ title, isLight, onClose, divider }: {
  title: string; isLight: boolean; onClose: () => void; divider: string;
}) {
  return (
    <div className={`flex items-center justify-between pb-3 border-b ${divider}`}>
      <h3 className="text-base font-bold">{title}</h3>
      <button onClick={onClose} className={`p-1 ${isLight ? "text-slate-400 hover:text-slate-700" : "text-[#888] hover:text-white"}`}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Add Bank Account — accent: Cyan #0891b2
═══════════════════════════════════════════════════ */
export const AddBankModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { addBankAccount, theme } = useFinance() as any;
  const isLight = theme === "light";
  const [bank, setBank] = useState("");
  const [entity, setEntity] = useState<EntityName>("TI");
  const [type, setType] = useState("Checking");
  const [acct, setAcct] = useState("...0000");
  const [balance, setBalance] = useState("");

  if (!isOpen) return null;

  const divider = isLight ? "border-slate-200" : "border-[#1a2235]";
  const cancelBtn = isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#0d111a] text-[#888] hover:bg-[#1a2235]";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bank || !balance) return;
    addBankAccount({ bank, entity, type, acct, balance: parseFloat(balance), asOf: new Date().toISOString().split("T")[0], status: "Active", trend: "up" });
    onClose();
    setBank(""); setBalance("");
  };

  return (
    <ModalShell isLight={isLight} accentColor="#0891b2">
      <ModalHeader title="Add Bank Account" isLight={isLight} onClose={onClose} divider={divider} />
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className={labelCls(isLight)}>Bank Name</label>
          <input type="text" required value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. Chase Commercial" className={inputCls(isLight)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls(isLight)}>Entity</label>
            <select value={entity} onChange={(e) => setEntity(e.target.value as EntityName)} className={inputCls(isLight)}>
              <option value="Ruby's">Ruby's</option>
              <option value="TI">TI</option>
              <option value="MSDx">MSDx</option>
              <option value="CurcuminPro">CurcuminPro</option>
            </select>
          </div>
          <div>
            <label className={labelCls(isLight)}>Account Type</label>
            <input type="text" value={type} onChange={(e) => setType(e.target.value)} className={inputCls(isLight)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls(isLight)}>Account # (Masked)</label>
            <input type="text" value={acct} onChange={(e) => setAcct(e.target.value)} className={inputCls(isLight)} />
          </div>
          <div>
            <label className={labelCls(isLight)}>Current Balance ($)</label>
            <input type="number" step="0.01" required value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" className={inputCls(isLight)} />
          </div>
        </div>
        <div className={`flex justify-end gap-2 pt-3 border-t ${divider}`}>
          <button type="button" onClick={onClose} className={`px-3 py-1.5 rounded text-xs ${cancelBtn}`}>Cancel</button>
          <button type="submit" className="px-4 py-1.5 rounded bg-[#0891b2] text-xs font-semibold text-white hover:bg-[#0e7490]">Add Account</button>
        </div>
      </form>
    </ModalShell>
  );
};

/* ══════════════════════════════════════════════════
   Add Loan — accent: Red #dc2626
═══════════════════════════════════════════════════ */
export const AddLoanModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { addLoan, theme } = useFinance() as any;
  const isLight = theme === "light";
  const [lender, setLender] = useState("");
  const [entity, setEntity] = useState<EntityName>("Ruby's");
  const [purpose, setPurpose] = useState("Equipment Financing");
  const [principal, setPrincipal] = useState("");
  const [monthly, setMonthly] = useState("");
  const [nextPay, setNextPay] = useState(new Date().toISOString().split("T")[0]);

  if (!isOpen) return null;

  const divider = isLight ? "border-slate-200" : "border-[#1a2235]";
  const cancelBtn = isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#0d111a] text-[#888] hover:bg-[#1a2235]";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lender || !principal) return;
    const p = parseFloat(principal);
    addLoan({ lender, entity, purpose, principal: p, outstanding: p, monthly: parseFloat(monthly || "0"), nextPay, maturity: "2029-12", status: "Active" });
    onClose();
    setLender(""); setPrincipal("");
  };

  return (
    <ModalShell isLight={isLight} accentColor="#dc2626">
      <ModalHeader title="Add Loan" isLight={isLight} onClose={onClose} divider={divider} />
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className={labelCls(isLight)}>Lender Name</label>
          <input type="text" required value={lender} onChange={(e) => setLender(e.target.value)} placeholder="e.g. SBA Commercial Loan" className={inputCls(isLight)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls(isLight)}>Entity</label>
            <select value={entity} onChange={(e) => setEntity(e.target.value as EntityName)} className={inputCls(isLight)}>
              <option value="Ruby's">Ruby's</option>
              <option value="TI">TI</option>
              <option value="MSDx">MSDx</option>
              <option value="CurcuminPro">CurcuminPro</option>
            </select>
          </div>
          <div>
            <label className={labelCls(isLight)}>Purpose</label>
            <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputCls(isLight)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls(isLight)}>Principal Amount ($)</label>
            <input type="number" required value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="0" className={inputCls(isLight)} />
          </div>
          <div>
            <label className={labelCls(isLight)}>Monthly Payment ($)</label>
            <input type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="0" className={inputCls(isLight)} />
          </div>
        </div>
        <div>
          <label className={labelCls(isLight)}>Next Due Date</label>
          <input type="date" value={nextPay} onChange={(e) => setNextPay(e.target.value)} className={inputCls(isLight)} />
        </div>
        <div className={`flex justify-end gap-2 pt-3 border-t ${divider}`}>
          <button type="button" onClick={onClose} className={`px-3 py-1.5 rounded text-xs ${cancelBtn}`}>Cancel</button>
          <button type="submit" className="px-4 py-1.5 rounded bg-[#dc2626] text-xs font-semibold text-white hover:bg-[#b91c1c]">Save Loan</button>
        </div>
      </form>
    </ModalShell>
  );
};

/* ══════════════════════════════════════════════════
   Edit Loan — accent: Red #dc2626
═══════════════════════════════════════════════════ */
export const EditLoanModal: React.FC<{ loan: import("../../types").Loan | null; isOpen: boolean; onClose: () => void }> = ({ loan, isOpen, onClose }) => {
  const { updateLoan, theme } = useFinance() as any;
  const isLight = theme === "light";
  const [lender, setLender] = useState(loan?.lender || "");
  const [entity, setEntity] = useState<EntityName>(loan?.entity || "Ruby's");
  const [purpose, setPurpose] = useState(loan?.purpose || "");
  const [monthly, setMonthly] = useState(String(loan?.monthly || ""));
  const [nextPay, setNextPay] = useState(loan?.nextPay || "");
  const [maturity, setMaturity] = useState(loan?.maturity || "");

  React.useEffect(() => {
    if (loan) {
      setLender(loan.lender); setEntity(loan.entity); setPurpose(loan.purpose);
      setMonthly(String(loan.monthly)); setNextPay(loan.nextPay); setMaturity(loan.maturity || "");
    }
  }, [loan]);

  if (!isOpen || !loan) return null;

  const divider = isLight ? "border-slate-200" : "border-[#1a2235]";
  const cancelBtn = isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#0d111a] text-[#888] hover:bg-[#1a2235]";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateLoan({ ...loan, lender: lender.trim(), entity, purpose: purpose.trim(), monthly: parseFloat(monthly || "0"), nextPay, maturity });
    onClose();
  };

  return (
    <ModalShell isLight={isLight} accentColor="#dc2626">
      <ModalHeader title="Edit Loan" isLight={isLight} onClose={onClose} divider={divider} />
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className={labelCls(isLight)}>Lender Name</label>
          <input type="text" required value={lender} onChange={(e) => setLender(e.target.value)} className={inputCls(isLight)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls(isLight)}>Entity</label>
            <select value={entity} onChange={(e) => setEntity(e.target.value as EntityName)} className={inputCls(isLight)}>
              <option value="Ruby's">Ruby's</option>
              <option value="TI">TI</option>
              <option value="MSDx">MSDx</option>
              <option value="CurcuminPro">CurcuminPro</option>
            </select>
          </div>
          <div>
            <label className={labelCls(isLight)}>Purpose</label>
            <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputCls(isLight)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls(isLight)}>Monthly Payment ($)</label>
            <input type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} className={inputCls(isLight)} />
          </div>
          <div>
            <label className={labelCls(isLight)}>Next Due Date</label>
            <input type="date" value={nextPay} onChange={(e) => setNextPay(e.target.value)} className={inputCls(isLight)} />
          </div>
        </div>
        <div>
          <label className={labelCls(isLight)}>Maturity Date</label>
          <input type="text" value={maturity} onChange={(e) => setMaturity(e.target.value)} placeholder="e.g. 2029-12" className={inputCls(isLight)} />
        </div>
        <div className={`flex justify-end gap-2 pt-3 border-t ${divider}`}>
          <button type="button" onClick={onClose} className={`px-3 py-1.5 rounded text-xs ${cancelBtn}`}>Cancel</button>
          <button type="submit" className="px-4 py-1.5 rounded bg-[#dc2626] text-xs font-semibold text-white hover:bg-[#b91c1c]">Save Changes</button>
        </div>
      </form>
    </ModalShell>
  );
};

/* ══════════════════════════════════════════════════
   Add Statement — accent: Slate #475569
═══════════════════════════════════════════════════ */
export const AddStatementModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { addBankStatement, theme } = useFinance() as any;
  const isLight = theme === "light";
  const [bankName, setBankName] = useState("");
  const [entity, setEntity] = useState<EntityName>("TI");
  const [occurrence, setOccurrence] = useState("Monthly");
  // Statement date stored as YYYY-MM-DD|YYYY-MM-DD; expose as separate start/end pickers
  const defaultStart = (() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; })();
  const defaultEnd   = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return d.toISOString().split("T")[0]; })();
  const [stmtStart, setStmtStart] = useState(defaultStart);
  const [stmtEnd,   setStmtEnd]   = useState(defaultEnd);
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [remarks, setRemarks] = useState("Standard monthly statement");

  if (!isOpen) return null;

  const divider = isLight ? "border-slate-200" : "border-[#1a2235]";
  const cancelBtn = isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#0d111a] text-[#888] hover:bg-[#1a2235]";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName) return;
    const statementDate = stmtStart && stmtEnd ? `${stmtStart}|${stmtEnd}` : stmtStart;
    addBankStatement({ entity, bankName, occurrence, statementDate, requestDate, period: stmtStart.slice(0, 7), downloaded: false, remarks });
    onClose();
    setBankName("");
  };

  return (
    <ModalShell isLight={isLight} accentColor="#475569">
      <ModalHeader title="Add Statement Entry" isLight={isLight} onClose={onClose} divider={divider} />
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className={labelCls(isLight)}>Bank Name</label>
          <input type="text" required value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Chase Commercial" className={inputCls(isLight)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls(isLight)}>Entity</label>
            <select value={entity} onChange={(e) => setEntity(e.target.value as EntityName)} className={inputCls(isLight)}>
              <option value="Ruby's">Ruby's</option>
              <option value="TI">TI</option>
              <option value="MSDx">MSDx</option>
              <option value="CurcuminPro">CurcuminPro</option>
            </select>
          </div>
          <div>
            <label className={labelCls(isLight)}>Cycle Frequency</label>
            <input type="text" value={occurrence} onChange={(e) => setOccurrence(e.target.value)} className={inputCls(isLight)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls(isLight)}>Statement Start</label>
            <input type="date" value={stmtStart} onChange={(e) => setStmtStart(e.target.value)} className={inputCls(isLight)} />
          </div>
          <div>
            <label className={labelCls(isLight)}>Statement End</label>
            <input type="date" value={stmtEnd} onChange={(e) => setStmtEnd(e.target.value)} className={inputCls(isLight)} />
          </div>
        </div>
        <div>
          <label className={labelCls(isLight)}>Request Date</label>
          <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className={inputCls(isLight)} />
        </div>
        <div>
          <label className={labelCls(isLight)}>Remarks / Details</label>
          <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputCls(isLight)} />
        </div>
        <div className={`flex justify-end gap-2 pt-3 border-t ${divider}`}>
          <button type="button" onClick={onClose} className={`px-3 py-1.5 rounded text-xs ${cancelBtn}`}>Cancel</button>
          <button type="submit" className="px-4 py-1.5 rounded bg-[#475569] text-xs font-semibold text-white hover:bg-[#334155]">Add Statement</button>
        </div>
      </form>
    </ModalShell>
  );
};

/* ══════════════════════════════════════════════════
   Edit Statement — accent: Slate #475569
═══════════════════════════════════════════════════ */
export const EditStatementModal: React.FC<{
  statement: any | null;
  isOpen: boolean;
  onClose: () => void;
}> = ({ statement, isOpen, onClose }) => {
  const { updateBankStatement, theme } = useFinance() as any;
  const isLight = theme === "light";
  const [bankName, setBankName] = useState(statement?.bankName || "");
  const [entity, setEntity] = useState<EntityName>(statement?.entity || "TI");
  const [occurrence, setOccurrence] = useState(statement?.occurrence || "Monthly");
  // Parse existing YYYY-MM-DD|YYYY-MM-DD into separate start/end fields
  const parseStmtParts = (raw: string) => {
    if (raw && raw.includes("|")) {
      const [s, e] = raw.split("|");
      return { start: s.trim(), end: e.trim() };
    }
    return { start: raw || "", end: "" };
  };
  const [stmtStart, setStmtStart] = useState(() => parseStmtParts(statement?.statementDate || "").start);
  const [stmtEnd,   setStmtEnd]   = useState(() => parseStmtParts(statement?.statementDate || "").end);
  const [requestDate, setRequestDate] = useState(statement?.requestDate || "");
  const [remarks, setRemarks] = useState(statement?.remarks || "");

  React.useEffect(() => {
    if (statement) {
      setBankName(statement.bankName || ""); setEntity(statement.entity || "TI");
      setOccurrence(statement.occurrence || "Monthly");
      const parts = parseStmtParts(statement.statementDate || "");
      setStmtStart(parts.start); setStmtEnd(parts.end);
      setRequestDate(statement.requestDate || ""); setRemarks(statement.remarks || "");
    }
  }, [statement]);

  if (!isOpen || !statement) return null;

  const divider = isLight ? "border-slate-200" : "border-[#1a2235]";
  const cancelBtn = isLight ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-[#0d111a] text-[#888] hover:bg-[#1a2235]";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName) return;
    const statementDate = stmtStart && stmtEnd ? `${stmtStart}|${stmtEnd}` : stmtStart;
    updateBankStatement({ ...statement, bankName: bankName.trim(), entity, occurrence: occurrence.trim(), statementDate, requestDate, period: stmtStart.slice(0, 7), remarks: remarks.trim() });
    onClose();
  };

  return (
    <ModalShell isLight={isLight} accentColor="#475569">
      <ModalHeader title="Edit Statement Entry" isLight={isLight} onClose={onClose} divider={divider} />
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className={labelCls(isLight)}>Bank Name</label>
          <input type="text" required value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Chase Commercial" className={inputCls(isLight)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls(isLight)}>Entity</label>
            <select value={entity} onChange={(e) => setEntity(e.target.value as EntityName)} className={inputCls(isLight)}>
              <option value="Ruby's">Ruby's</option>
              <option value="TI">TI</option>
              <option value="MSDx">MSDx</option>
              <option value="CurcuminPro">CurcuminPro</option>
            </select>
          </div>
          <div>
            <label className={labelCls(isLight)}>Cycle Frequency</label>
            <input type="text" value={occurrence} onChange={(e) => setOccurrence(e.target.value)} className={inputCls(isLight)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls(isLight)}>Statement Start</label>
            <input type="date" value={stmtStart} onChange={(e) => setStmtStart(e.target.value)} className={inputCls(isLight)} />
          </div>
          <div>
            <label className={labelCls(isLight)}>Statement End</label>
            <input type="date" value={stmtEnd} onChange={(e) => setStmtEnd(e.target.value)} className={inputCls(isLight)} />
          </div>
        </div>
        <div>
          <label className={labelCls(isLight)}>Request Date</label>
          <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className={inputCls(isLight)} />
        </div>
        <div>
          <label className={labelCls(isLight)}>Remarks / Details</label>
          <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputCls(isLight)} />
        </div>
        <div className={`flex justify-end gap-2 pt-3 border-t ${divider}`}>
          <button type="button" onClick={onClose} className={`px-3 py-1.5 rounded text-xs ${cancelBtn}`}>Cancel</button>
          <button type="submit" className="px-4 py-1.5 rounded bg-[#475569] text-xs font-semibold text-white hover:bg-[#334155]">Save Changes</button>
        </div>
      </form>
    </ModalShell>
  );
};
