import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App safely
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Google Sheets and Google Calendar permissions
provider.addScope("https://www.googleapis.com/auth/spreadsheets");
provider.addScope("https://www.googleapis.com/auth/calendar");
provider.addScope("https://www.googleapis.com/auth/calendar.events");

const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events";
const TOKEN_REFRESH_MS = 55 * 60 * 1000; // refresh 5 min before 1-hour expiry

let isSigningIn = false;
let cachedAccessToken: string | null = typeof window !== "undefined" ? localStorage.getItem("google_access_token") : null;
let tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;

const silentRefreshGoogleToken = () => {
  const gis = (window as any).google?.accounts?.oauth2;
  if (!gis || !cachedAccessToken) return;

  const clientId = (firebaseConfig as any).oAuthClientId;
  if (!clientId) return;

  const tokenClient = gis.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    prompt: "",
    callback: (response: any) => {
      if (response?.access_token) {
        cachedAccessToken = response.access_token;
        localStorage.setItem("google_access_token", response.access_token);
        // Record when the new token was issued so reload-based refresh is accurate
        localStorage.setItem("google_token_issued_at", String(Date.now()));
        console.log("[Auth] Google token silently refreshed.");
        window.dispatchEvent(new Event("google-token-refreshed"));
        scheduleNextRefresh();
      } else if (response?.error) {
        console.warn("[Auth] Silent token refresh failed:", response.error);
      }
    }
  });

  tokenClient.requestAccessToken({ prompt: "" });
};

const scheduleNextRefresh = () => {
  if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
  // Compute how long ago the token was issued (to handle page reloads correctly).
  // If the token was issued 50 min ago, refresh in 5 min — not 55 min.
  const issuedAt = parseInt(typeof window !== "undefined" ? localStorage.getItem("google_token_issued_at") || "0" : "0");
  const elapsed = issuedAt ? Date.now() - issuedAt : 0;
  const delay = Math.max(10_000, TOKEN_REFRESH_MS - elapsed); // at least 10s
  tokenRefreshTimer = setTimeout(silentRefreshGoogleToken, delay);
};

export const startAutoTokenRefresh = () => {
  scheduleNextRefresh();
};

export const stopAutoTokenRefresh = () => {
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
};

export const initAuthListener = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (!cachedAccessToken && typeof window !== "undefined") {
        cachedAccessToken = localStorage.getItem("google_access_token");
      }
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken || "");
    } else {
      cachedAccessToken = null;
      if (typeof window !== "undefined") {
        localStorage.removeItem("google_access_token");
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (isSigningIn) {
    console.warn("Google Sign-in is already in progress.");
    return null;
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || "authorized_session_token";
    if (typeof window !== "undefined" && credential?.accessToken) {
      localStorage.setItem("google_access_token", credential.accessToken);
      // Record issue time so the silent-refresh scheduler can compute actual remaining lifetime
      localStorage.setItem("google_token_issued_at", String(Date.now()));
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Google Sign-in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  if (!cachedAccessToken && typeof window !== "undefined") {
    cachedAccessToken = localStorage.getItem("google_access_token");
  }
  return cachedAccessToken;
};

export const clearAccessToken = () => {
  cachedAccessToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("google_access_token");
  }
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("google_access_token");
  }
};

// Firebase email + password sign-in
export const emailPasswordSignIn = async (email: string, password: string): Promise<User> => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

// Redirect-based Google sign-in (fallback when popups are blocked)
export const googleSignInRedirect = async (): Promise<void> => {
  await signInWithRedirect(auth, provider);
};
