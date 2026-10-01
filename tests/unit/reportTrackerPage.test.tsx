/**
 * Report Tracker — page render smoke test (server-side render, mocked context).
 * Confirms the page renders signed-out and signed-in, in light and dark, with the portal's
 * header/button/badge classes, the "Open Source Sheet" button, and no crash.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

let signedIn = true;
let theme: "light" | "dark" = "dark";

vi.mock("../../src/services/googleAuth", () => ({ getAccessToken: () => (signedIn ? "tok" : null) }));
vi.mock("../../src/context/FinanceContext", () => ({
  useFinance: () => ({
    theme, showToast: () => {}, googleUser: signedIn ? { email: "finances@marktimm.com" } : null, userEmail: "finances@marktimm.com",
    localCalendarEvents: [], addCalendarEvent: () => {}, needsAuth: false, handleGoogleSignIn: async () => {},
    selectedEntities: new Set(["ALL"]), toggleEntityFilter: () => {}, paymentMethodFilter: "All", setPaymentMethodFilter: () => {},
    isSyncing: false, syncAllFromGoogleSheets: () => {}, toggleTheme: () => {},
  }),
}));

import { ReportTrackerPage } from "../../src/components/pages/ReportTrackerPage";
import { TRACKER_SHEET_URL } from "../../src/services/reportTrackerService";

describe("ReportTrackerPage render", () => {
  it("renders all four reports, KPI cards, tasks and the source-sheet links (dark, signed in)", () => {
    signedIn = true; theme = "dark";
    const html = renderToString(<ReportTrackerPage />);
    for (const name of ["FTA Weekly", "CPRO Weekly", "CPRO Monthly", "Toast Recon", "Coming Up", "Tasks &amp; Reminders", "Overdue", "Due Now", "In Progress"])
      expect(html).toContain(name);
    expect(html).toContain("Open Source Sheet");
    expect(html).toContain(TRACKER_SHEET_URL);
    expect(html).toContain("bg-[#0f766e]");               // header colour
    expect(html).toContain("bg-[#070b12]");               // portal dark page shell
    expect(html).toContain("btn-3d btn-3d-blue");         // portal button style
    expect(html).toContain("AUTO");
    expect(html).toContain("Philippine Time");
  });
  it("renders signed-out with the connect banner and disabled actions (light)", () => {
    signedIn = false; theme = "light";
    const html = renderToString(<ReportTrackerPage />);
    expect(html).toContain("bg-slate-100");               // portal light page shell
    expect(html).toContain("Connect Google Sheets");
    expect(html).toContain("nothing can be checked off while signed out");
    expect(html).toContain("disabled");
  });
});
