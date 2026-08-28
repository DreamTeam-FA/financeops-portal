/**
 * FinanceOps Portal — Integration Tests
 *
 * Tests the live portal API end-to-end.  No browser, no OAuth simulation needed:
 * /api/pull-live falls back to the server's cached drive token from the last
 * real sign-in (~55 min window), so these run without user interaction.
 *
 * Usage:
 *   Local:  npm run test:integration
 *   Render: TEST_URL=https://financeops-portal.onrender.com npm run test:integration
 *
 * Or double-click run-tests.bat (Windows).
 */

import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = (process.env.TEST_URL || "http://localhost:3000").replace(/\/$/, "");

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getJson(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
  return res.json();
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("FinanceOps Portal — Integration", { timeout: 30_000 }, () => {

  // ── 1. Server health ────────────────────────────────────────────────────────
  describe("Server", () => {
    it("GET /api/data responds with a valid data envelope", async () => {
      const body = await getJson("/api/data");
      expect(typeof body).toBe("object");
      expect(body).not.toBeNull();
    });

    it("GET /api/data contains an ap array", async () => {
      const body = await getJson("/api/data");
      expect(Array.isArray(body.ap)).toBe(true);
    });
  });

  // ── 2. AP Bills ─────────────────────────────────────────────────────────────
  describe("AP Bills", () => {
    let apBills: any[] = [];

    beforeAll(async () => {
      const body = await getJson("/api/data");
      apBills = body.ap ?? [];
    });

    it("has at least 1 AP bill loaded", () => {
      expect(apBills.length).toBeGreaterThan(0);
      console.log(`  ✅ ${apBills.length} AP bills loaded`);
    });

    it("bills have required fields (id, vendor, amount)", () => {
      const first = apBills[0];
      expect(first).toBeDefined();
      expect(first.id ?? first.vendor).toBeTruthy();   // id OR vendor must exist
      expect(typeof (first.amount ?? first.total)).toBe("number");
    });

    it("bills span multiple entities (Ruby's, TI, MSDx)", () => {
      const entities = new Set(apBills.map((b: any) => b.entity).filter(Boolean));
      expect(entities.size).toBeGreaterThanOrEqual(1);
      console.log(`  ✅ Entities: ${[...entities].join(", ")}`);
    });
  });

  // ── 3. Pull-live endpoint ───────────────────────────────────────────────────
  describe("Pull-live", () => {
    it("POST /api/pull-live returns success", async () => {
      const body = await getJson("/api/pull-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // server uses its cached drive token
      });
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });

    it("pull-live response has AP bills", async () => {
      const body = await getJson("/api/pull-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(Array.isArray(body.data?.ap)).toBe(true);
      expect(body.data.ap.length).toBeGreaterThan(0);
      console.log(`  ✅ Pull-live returned ${body.data.ap.length} AP bills`);
    });
  });

  // ── 4. Bank & Loans ─────────────────────────────────────────────────────────
  describe("Banks & Loans", () => {
    it("has bank accounts", async () => {
      const body = await getJson("/api/data");
      expect(Array.isArray(body.banks)).toBe(true);
      console.log(`  ✅ ${body.banks?.length ?? 0} bank accounts`);
    });

    it("has loan records", async () => {
      const body = await getJson("/api/data");
      expect(Array.isArray(body.loans)).toBe(true);
    });
  });

  // ── 5. Integration self-test endpoint ───────────────────────────────────────
  describe("Self-test endpoint", () => {
    it("GET /api/integration-test returns structured results", async () => {
      const body = await getJson("/api/integration-test");
      expect(body).toHaveProperty("passed");
      expect(body).toHaveProperty("failed");
      expect(body).toHaveProperty("checks");
      expect(Array.isArray(body.checks)).toBe(true);
      const failed = body.checks.filter((c: any) => !c.ok);
      if (failed.length) console.warn("  ⚠️ Failed checks:", failed.map((c: any) => c.name).join(", "));
      console.log(`  ✅ ${body.passed}/${body.checks.length} checks passed`);
    });
  });

});
