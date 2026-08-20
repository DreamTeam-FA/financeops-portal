import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { EntityName } from "../../types";
import { X } from "lucide-react";

export const AddBankModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { addBankAccount } = useFinance();
  const [bank, setBank] = useState("");
  const [entity, setEntity] = useState<EntityName>("TI");
  const [type, setType] = useState("Checking");
  const [acct, setAcct] = useState("...0000");
  const [balance, setBalance] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bank || !balance) return;
    addBankAccount({
      bank,
      entity,
      type,
      acct,
      balance: parseFloat(balance),
      asOf: new Date().toISOString().split("T")[0],
      status: "Active",
      trend: "up"
    });
    onClose();
    setBank("");
    setBalance("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#0d111a] border border-[#1a2235] rounded-xl w-full max-w-md p-5 text-white">
        <div className="flex items-center justify-between pb-3 border-b border-[#1a2235]">
          <h3 className="text-base font-bold">Add Bank Account</h3>
          <button onClick={onClose} className="p-1 text-[#888] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Bank Name</label>
            <input type="text" required value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. Chase Commercial" className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Entity</label>
              <select value={entity} onChange={(e) => setEntity(e.target.value as EntityName)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white">
                <option value="Ruby's">Ruby's</option>
                <option value="TI">TI</option>
                <option value="MSDx">MSDx</option>
                <option value="CurcuminPro">CurcuminPro</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Account Type</label>
              <input type="text" value={type} onChange={(e) => setType(e.target.value)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Account # (Masked)</label>
              <input type="text" value={acct} onChange={(e) => setAcct(e.target.value)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Current Balance ($)</label>
              <input type="number" step="0.01" required value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#1a2235]">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded bg-[#0d111a] text-xs text-[#888]">Cancel</button>
            <button type="submit" className="px-4 py-1.5 rounded bg-[#0891b2] text-xs font-semibold text-white">Add Account</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AddLoanModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { addLoan } = useFinance();
  const [lender, setLender] = useState("");
  const [entity, setEntity] = useState<EntityName>("Ruby's");
  const [purpose, setPurpose] = useState("Equipment Financing");
  const [principal, setPrincipal] = useState("");
  const [monthly, setMonthly] = useState("");
  const [nextPay, setNextPay] = useState(new Date().toISOString().split("T")[0]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lender || !principal) return;
    const p = parseFloat(principal);
    addLoan({
      lender,
      entity,
      purpose,
      principal: p,
      outstanding: p,
      monthly: parseFloat(monthly || "0"),
      nextPay,
      maturity: "2029-12",
      status: "Active"
    });
    onClose();
    setLender("");
    setPrincipal("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#0d111a] border border-[#1a2235] rounded-xl w-full max-w-md p-5 text-white">
        <div className="flex items-center justify-between pb-3 border-b border-[#1a2235]">
          <h3 className="text-base font-bold">Add Loan</h3>
          <button onClick={onClose} className="p-1 text-[#888] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Lender Name</label>
            <input type="text" required value={lender} onChange={(e) => setLender(e.target.value)} placeholder="e.g. SBA Commercial Loan" className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Entity</label>
              <select value={entity} onChange={(e) => setEntity(e.target.value as EntityName)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white">
                <option value="Ruby's">Ruby's</option>
                <option value="TI">TI</option>
                <option value="MSDx">MSDx</option>
                <option value="CurcuminPro">CurcuminPro</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Purpose</label>
              <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Principal Amount ($)</label>
              <input type="number" required value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="0" className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Monthly Payment ($)</label>
              <input type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="0" className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Next Due Date</label>
            <input type="date" value={nextPay} onChange={(e) => setNextPay(e.target.value)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white color-scheme-dark" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#1a2235]">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded bg-[#0d111a] text-xs text-[#888]">Cancel</button>
            <button type="submit" className="px-4 py-1.5 rounded bg-[#dc2626] text-xs font-semibold text-white">Save Loan</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const EditLoanModal: React.FC<{ loan: import("../../types").Loan | null; isOpen: boolean; onClose: () => void }> = ({ loan, isOpen, onClose }) => {
  const { updateLoan } = useFinance();
  const [lender, setLender] = useState(loan?.lender || "");
  const [entity, setEntity] = useState<EntityName>(loan?.entity || "Ruby's");
  const [purpose, setPurpose] = useState(loan?.purpose || "");
  const [monthly, setMonthly] = useState(String(loan?.monthly || ""));
  const [nextPay, setNextPay] = useState(loan?.nextPay || "");
  const [maturity, setMaturity] = useState(loan?.maturity || "");

  React.useEffect(() => {
    if (loan) {
      setLender(loan.lender);
      setEntity(loan.entity);
      setPurpose(loan.purpose);
      setMonthly(String(loan.monthly));
      setNextPay(loan.nextPay);
      setMaturity(loan.maturity || "");
    }
  }, [loan]);

  if (!isOpen || !loan) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateLoan({
      ...loan,
      lender: lender.trim(),
      entity,
      purpose: purpose.trim(),
      monthly: parseFloat(monthly || "0"),
      nextPay,
      maturity
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#0d111a] border border-[#1a2235] rounded-xl w-full max-w-md p-5 text-white">
        <div className="flex items-center justify-between pb-3 border-b border-[#1a2235]">
          <h3 className="text-base font-bold">Edit Loan</h3>
          <button onClick={onClose} className="p-1 text-[#888] hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Lender Name</label>
            <input type="text" required value={lender} onChange={(e) => setLender(e.target.value)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Entity</label>
              <select value={entity} onChange={(e) => setEntity(e.target.value as EntityName)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white">
                <option value="Ruby's">Ruby's</option>
                <option value="TI">TI</option>
                <option value="MSDx">MSDx</option>
                <option value="CurcuminPro">CurcuminPro</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Purpose</label>
              <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Monthly Payment ($)</label>
              <input type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Next Due Date</label>
              <input type="date" value={nextPay} onChange={(e) => setNextPay(e.target.value)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Maturity Date</label>
            <input type="text" value={maturity} onChange={(e) => setMaturity(e.target.value)} placeholder="e.g. 2029-12" className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#1a2235]">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded bg-[#0d111a] text-xs text-[#888]">Cancel</button>
            <button type="submit" className="px-4 py-1.5 rounded bg-[#dc2626] text-xs font-semibold text-white">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AddStatementModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { addBankStatement } = useFinance();
  const [bankName, setBankName] = useState("");
  const [entity, setEntity] = useState<EntityName>("TI");
  const [occurrence, setOccurrence] = useState("Monthly");
  const [statementDate, setStatementDate] = useState(new Date().toISOString().split("T")[0]);
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [remarks, setRemarks] = useState("Standard monthly statement");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName) return;
    addBankStatement({
      entity,
      bankName,
      occurrence,
      statementDate,
      requestDate,
      period: statementDate.slice(0, 7),
      downloaded: false,
      remarks
    });
    onClose();
    setBankName("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#0d111a] border border-[#1a2235] rounded-xl w-full max-w-md p-5 text-white">
        <div className="flex items-center justify-between pb-3 border-b border-[#1a2235]">
          <h3 className="text-base font-bold">Add Statement Entry</h3>
          <button onClick={onClose} className="p-1 text-[#888] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Bank Name</label>
            <input type="text" required value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Chase Commercial" className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Entity</label>
              <select value={entity} onChange={(e) => setEntity(e.target.value as EntityName)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white">
                <option value="Ruby's">Ruby's</option>
                <option value="TI">TI</option>
                <option value="MSDx">MSDx</option>
                <option value="CurcuminPro">CurcuminPro</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Cycle Frequency</label>
              <input type="text" value={occurrence} onChange={(e) => setOccurrence(e.target.value)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Statement Date</label>
              <input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Request Date</label>
              <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#888] uppercase mb-1">Remarks / Details</label>
            <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full bg-[#0d111a] border border-[#1a2235] rounded px-3 py-1.5 text-xs text-white" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#1a2235]">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded bg-[#0d111a] text-xs text-[#888]">Cancel</button>
            <button type="submit" className="px-4 py-1.5 rounded bg-[#374151] text-xs font-semibold text-white">Add Statement</button>
          </div>
        </form>
      </div>
    </div>
  );
};
