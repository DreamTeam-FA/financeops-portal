/**
 * CalcGate — the ONLY thing the portal mounts for Calc.
 * For anyone not enabled it renders nothing, downloads none of Calc's code, and makes just one tiny access check.
 */
import React, { Suspense, lazy, useEffect } from "react";
import { useFinance } from "../../context/FinanceContext";
import { getAccessToken } from "../../services/googleAuth";
import { refreshCalcAccess, useCalcAccess, usePersonalVersion, isPersonallyEnabled } from "./calcAccess";

const CalcWidget = lazy(() => import("./CalcWidget").then(m => ({ default: m.CalcWidget })));

export const CalcGate: React.FC = () => {
  const { googleUser, needsAuth } = useFinance() as any;
  const access = useCalcAccess();
  usePersonalVersion();

  // Check once after load, and again whenever the Google sign-in changes.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) refreshCalcAccess(); }, 800); // let the sign-in token settle first
    return () => { cancelled = true; clearTimeout(t); };
  }, [googleUser?.uid, googleUser?.email, needsAuth]);

  // Signed out → hide immediately.
  useEffect(() => { if (!getAccessToken() && !googleUser) refreshCalcAccess(); }, [googleUser]);

  if (!access.loaded || !access.allowed) return null;
  if (!isPersonallyEnabled(access.email)) return null;
  return <Suspense fallback={null}><CalcWidget /></Suspense>;
};

export default CalcGate;
