/**
 * Calc access (who sees Calc) — browser side.
 *
 * The server decides: POST /api/calc/access verifies the caller's Google token and returns whether Calc is
 * enabled for that account. The allow-list itself lives in the shared settings sheet (_config → "calcAccess"),
 * edited by the admin in the portal (gear → Calc access). Everything fails CLOSED: any error ⇒ Calc stays hidden.
 *
 * A second, personal switch (gear → Calc assistant) lets an allowed person hide Calc on this browser.
 */
import { useSyncExternalStore } from "react";
import { getAccessToken } from "../../services/googleAuth";
import { writeConfigKey } from "../../services/configSheetService";

export interface CalcAccessUser { email: string; enabled: boolean; name?: string; addedBy?: string; addedAt?: string }
export interface CalcAccessState {
  loaded: boolean;
  allowed: boolean;
  admin: boolean;
  email: string;
  users: CalcAccessUser[];
  admins: string[];
  listReadable: boolean;
  local: boolean;
}

/** Local testing only (npm run dev on this computer): the server grants a loopback test identity and no sheet is touched. */
const _search = typeof location !== "undefined" ? location.search : "";
const _onLocalhost = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
// ?calcreal=1 on localhost = use the real sign-in + real settings sheet (read-only testing); ?calcdeny=1 = pretend not allowed.
// Both are read ONCE at load, because the portal rewrites the address bar right after it starts.
export const CALC_IS_LOCAL = _onLocalhost && !/[?&]calcreal=1/.test(_search);
const CALC_FORCE_DENY = _onLocalhost && /[?&]calcdeny=1/.test(_search);
const LOCAL_USERS_KEY = "calc_access_local_users";
const PERSONAL_PREFIX = "calc_enabled:";

const EMPTY: CalcAccessState = { loaded: false, allowed: false, admin: false, email: "", users: [], admins: [], listReadable: false, local: false };
let state: CalcAccessState = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const set = (next: CalcAccessState) => { state = next; emit(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const useCalcAccess = (): CalcAccessState => useSyncExternalStore(subscribe, () => state, () => EMPTY);

const readLocalUsers = (): CalcAccessUser[] => { try { return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || "[]"); } catch { return []; } };

/** Ask the server whether Calc is enabled for the signed-in account. Never throws; failure ⇒ hidden. */
export async function refreshCalcAccess(refresh = false): Promise<void> {
  try {
    // test hook: ?calcdeny=1 on localhost pretends this account is not on the list
    if (CALC_FORCE_DENY) { set({ ...EMPTY, loaded: true }); return; }
    const token = getAccessToken();
    if (!token && !CALC_IS_LOCAL) { set({ ...EMPTY, loaded: true }); return; }
    const r = await fetch("/api/calc/access", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: CALC_IS_LOCAL ? "" : token, refresh }),
      signal: AbortSignal.timeout(12000),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { set({ ...EMPTY, loaded: true }); return; }
    set({
      loaded: true, allowed: !!j.allowed, admin: !!j.admin, email: String(j.email || ""),
      users: j.local ? readLocalUsers() : (Array.isArray(j.users) ? j.users : []),
      admins: Array.isArray(j.admins) ? j.admins : [], listReadable: j.listReadable !== false, local: !!j.local,
    });
  } catch {
    set({ ...EMPTY, loaded: true });
  }
}

export const isPersonallyEnabled = (email: string): boolean => {
  try { return localStorage.getItem(PERSONAL_PREFIX + (email || "").toLowerCase()) !== "0"; } catch { return true; }
};
export function setPersonallyEnabled(email: string, on: boolean) {
  try { localStorage.setItem(PERSONAL_PREFIX + (email || "").toLowerCase(), on ? "1" : "0"); } catch { /* ignore */ }
  emit();
}
/** Re-render subscribers of the personal switch (it lives in localStorage). */
export const usePersonalVersion = () => useSyncExternalStore(subscribe, () => `${state.email}|${isPersonallyEnabled(state.email)}`, () => "");

/** Admin: save the whole allow-list. Writes the shared settings sheet (or this computer only, in local test mode). */
export async function saveCalcUsers(users: CalcAccessUser[]): Promise<{ ok: boolean; error?: string }> {
  const clean = users.map(u => ({ ...u, email: u.email.trim().toLowerCase() }));
  try {
    if (CALC_IS_LOCAL) {
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(clean));
      set({ ...state, users: clean });
      return { ok: true };
    }
    const token = getAccessToken();
    if (!token) return { ok: false, error: "Not signed in with Google." };
    if (!state.admin) return { ok: false, error: "Only an admin can change who has Calc." };
    await writeConfigKey(token, "calcAccess", { users: clean }, state.email);
    await refreshCalcAccess(true); // makes the server re-read the sheet right away
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Couldn't save to the settings sheet." };
  }
}
