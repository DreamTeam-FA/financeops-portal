import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { User, LogOut, Check, Plus, Shield, UserCheck } from "lucide-react";

interface UserSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_USERS = [
  { name: "Accounting Team", email: "accounting@marktimm.com", role: "Finance Admin" },
  { name: "Mark Timm", email: "mark@marktimm.com", role: "Executive Owner" },
  { name: "Finance Manager", email: "finance@marktimm.com", role: "Manager" },
  { name: "AP Specialist", email: "ap@marktimm.com", role: "Accounts Payable" },
  { name: "System Admin", email: "admin@marktimm.com", role: "Administrator" }
];

export const UserSwitchModal: React.FC<UserSwitchModalProps> = ({ isOpen, onClose }) => {
  const { userEmail, switchUser, signOutUser, theme } = useFinance();
  const isLight = theme === "light";

  const [customName, setCustomName] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [customRole, setCustomRole] = useState("Finance Team");
  const [showCustomForm, setShowCustomForm] = useState(false);

  if (!isOpen) return null;

  const handleSelectPreset = (email: string, name: string) => {
    switchUser(email, name);
    onClose();
  };

  const handleAddCustomUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail.trim()) return;
    const name = customName.trim() || customEmail.split("@")[0];
    switchUser(customEmail.trim(), name);
    setShowCustomForm(false);
    setCustomName("");
    setCustomEmail("");
    onClose();
  };

  const handleSignOut = async () => {
    await signOutUser();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn">
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
          isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#141414] border-[#2a2a2a] text-white"
        }`}
      >
        {/* Header */}
        <div className={`p-5 border-b ${isLight ? "border-slate-100 bg-slate-50/50" : "border-[#222] bg-[#1a1a1a]/60"} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-tight">Switch Active User</h3>
              <p className={`text-xs ${isLight ? "text-slate-500" : "text-gray-400"}`}>
                Logged in as <span className="font-bold text-purple-600 dark:text-purple-400">{userEmail}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg ${isLight ? "hover:bg-slate-200 text-slate-500" : "hover:bg-[#2a2a2a] text-gray-400"} text-xs font-bold transition-colors`}
          >
            ✕
          </button>
        </div>

        {/* User Options */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select User Profile</div>

          <div className="space-y-2">
            {PRESET_USERS.map((u) => {
              const isActive = userEmail.toLowerCase() === u.email.toLowerCase();
              return (
                <div
                  key={u.email}
                  onClick={() => handleSelectPreset(u.email, u.name)}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    isActive
                      ? isLight
                        ? "bg-purple-50 border-purple-300 ring-2 ring-purple-500/20"
                        : "bg-purple-950/30 border-purple-800 ring-2 ring-purple-500/30"
                      : isLight
                      ? "border-slate-200 bg-slate-50/50 hover:bg-slate-100/80"
                      : "border-[#262626] bg-[#1a1a1a] hover:bg-[#222]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                        isActive
                          ? "bg-purple-600 text-white"
                          : isLight
                          ? "bg-slate-200 text-slate-700"
                          : "bg-[#2a2a2a] text-slate-300"
                      }`}
                    >
                      {u.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate flex items-center gap-2">
                        {u.name}
                        {isActive && (
                          <span className="text-[10px] px-2 py-0.2 rounded-full bg-purple-600/20 text-purple-600 dark:text-purple-300 font-extrabold">
                            Active
                          </span>
                        )}
                      </div>
                      <div className={`text-[11px] truncate ${isLight ? "text-slate-500" : "text-gray-400"}`}>{u.email}</div>
                    </div>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />}
                </div>
              );
            })}
          </div>

          {!showCustomForm ? (
            <button
              onClick={() => setShowCustomForm(true)}
              className={`w-full py-2.5 px-3 rounded-xl border border-dashed flex items-center justify-center gap-2 text-xs font-bold transition-colors ${
                isLight
                  ? "border-slate-300 hover:border-purple-500 text-slate-600 hover:text-purple-600 hover:bg-purple-50/50"
                  : "border-[#333] hover:border-purple-500 text-gray-300 hover:text-purple-400 hover:bg-purple-950/20"
              }`}
            >
              <Plus className="w-4 h-4" />
              Enter Custom User Credentials
            </button>
          ) : (
            <form onSubmit={handleAddCustomUser} className={`p-4 rounded-xl border space-y-3 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#1a1a1a] border-[#262626]"}`}>
              <div className="text-xs font-bold text-purple-600 dark:text-purple-400">Add Custom Profile</div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Full Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Sarah Connor"
                  className={`w-full px-3 py-1.5 rounded-lg border text-xs ${isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#121212] border-[#333] text-white"}`}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="e.g. sarah@marktimm.com"
                  className={`w-full px-3 py-1.5 rounded-lg border text-xs ${isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#121212] border-[#333] text-white"}`}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCustomForm(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
                >
                  Switch Profile
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer with Sign Out */}
        <div className={`p-4 border-t ${isLight ? "border-slate-100 bg-slate-50" : "border-[#222] bg-[#1a1a1a]"} flex items-center justify-between`}>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-xs font-bold text-red-500 hover:text-red-600 transition-colors py-1.5 px-3 rounded-lg hover:bg-red-500/10"
          >
            <LogOut className="w-4 h-4" />
            Sign Out Completely
          </button>
          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold ${isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-800" : "bg-[#262626] hover:bg-[#333] text-white"}`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
