/** Admin panel: choose who can use Calc. Opens from the sidebar gear → "Calc access". */
import React, { useState } from "react";
import { X, Trash2, UserPlus, ShieldCheck } from "lucide-react";
import { CalcAccessUser, saveCalcUsers, useCalcAccess } from "./calcAccess";

export const CalcAccessModal: React.FC<{ isLight: boolean; onClose: () => void }> = ({ isLight, onClose }) => {
  const access = useCalcAccess();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const card = isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#141414] border-[#2a2a2a] text-slate-100";
  const sub = isLight ? "text-slate-500" : "text-slate-400";
  const line = isLight ? "border-slate-200" : "border-[#2a2a2a]";
  const inp = `rounded-lg border px-3 py-2 text-[13px] outline-none focus:border-[#2f6fc9] ${isLight ? "bg-white border-slate-300" : "bg-[#0d0d0d] border-[#333]"}`;

  const persist = async (next: CalcAccessUser[], okText: string) => {
    setBusy(true); setMsg(null);
    const r = await saveCalcUsers(next);
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error || "Couldn't save." });
  };

  const add = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setMsg({ ok: false, text: "Enter a valid email address." }); return; }
    if (access.admins.includes(e)) { setMsg({ ok: false, text: "That person is an admin, who always has Calc." }); return; }
    if (access.users.some(u => u.email === e)) { setMsg({ ok: false, text: "That email is already on the list." }); return; }
    await persist([...access.users, { email: e, enabled: true, name: name.trim() || undefined, addedBy: access.email, addedAt: new Date().toISOString() }], `Added ${e}. They'll see Calc the next time they load the portal.`);
    setEmail(""); setName("");
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60" role="dialog" aria-label="Calc access" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`w-full max-w-md rounded-2xl border shadow-2xl ${card}`}>
        <div className={`flex items-center gap-2 px-4 py-3 border-b ${line}`}>
          <ShieldCheck className="w-4 h-4 text-[#2f6fc9]" />
          <div className="flex-1">
            <div className="text-sm font-bold">Calc access</div>
            <div className={`text-[11px] ${sub}`}>Choose who can see and use the Calc assistant.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className={`p-1.5 rounded-lg hover:bg-black/5 ${sub}`}><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {access.local && <div className="text-[11px] rounded-lg bg-amber-500/10 text-amber-600 px-3 py-2">Local test mode: changes are saved on this computer only, not in the shared settings sheet.</div>}
          {!access.listReadable && !access.local && <div className="text-[11px] rounded-lg bg-red-500/10 text-red-500 px-3 py-2">The shared settings sheet couldn't be read, so only admins have Calc right now. Reload and try again.</div>}

          <div>
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${sub}`}>Admins (always on)</div>
            {(access.admins.length ? access.admins : [access.email]).map(a => (
              <div key={a} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${line}`}><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />{a}</div>
            ))}
          </div>

          <div>
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${sub}`}>People with access</div>
            {access.users.length === 0 && <div className={`text-[12px] ${sub} py-1`}>Nobody else yet. Add someone below.</div>}
            <div className="space-y-1.5">
              {access.users.map(u => (
                <div key={u.email} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${line}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] truncate">{u.name || u.email}</div>
                    {u.name && <div className={`text-[11px] truncate ${sub}`}>{u.email}</div>}
                  </div>
                  <button role="switch" aria-checked={u.enabled} aria-label={`Calc for ${u.email}`} disabled={busy}
                    onClick={() => persist(access.users.map(x => x.email === u.email ? { ...x, enabled: !x.enabled } : x), u.enabled ? `Calc turned off for ${u.email}.` : `Calc turned on for ${u.email}.`)}
                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${u.enabled ? "bg-emerald-500" : isLight ? "bg-slate-300" : "bg-[#444]"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${u.enabled ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                  <button disabled={busy} aria-label={`Remove ${u.email}`} title="Remove" onClick={() => persist(access.users.filter(x => x.email !== u.email), `Removed ${u.email}.`)}
                    className="p-1 rounded text-red-500 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className={`pt-2 border-t ${line}`}>
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${sub}`}>Add a person</div>
            <div className="flex flex-col gap-2">
              <input className={inp} placeholder="Google email, e.g. name@marktimm.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} />
              <input className={inp} placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} />
              <button onClick={add} disabled={busy || !email.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2f6fc9] text-white text-[13px] font-semibold px-3 py-2 disabled:opacity-40">
                <UserPlus className="w-4 h-4" />{busy ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
          {msg && <div className={`text-[12px] ${msg.ok ? "text-emerald-500" : "text-red-500"}`} aria-live="polite">{msg.text}</div>}
        </div>
      </div>
    </div>
  );
};

export default CalcAccessModal;
