/**
 * configSheetService.ts
 *
 * Manages a "_config" tab in the shared FinanceOps logs Google Sheet.
 * Stores portal-wide config that must survive Render deploys and be
 * visible to ALL users (cross-device, cross-user).
 *
 * Tab structure (columns A–D):
 *   A: key        – e.g. "sheetMappings", "gasUrls"
 *   B: value_json – JSON-stringified value
 *   C: updated_at – ISO timestamp
 *   D: updated_by – user email
 *
 * Each key occupies exactly one row. writeConfigKey upserts:
 *   - finds existing row → updates B:D in place
 *   - not found → appends a new row
 */

import { SHARED_LOGS_SHEET_ID } from "./logsSheetService";

export { SHARED_LOGS_SHEET_ID };

const CONFIG_TAB = "_config";

// ── Internal Sheets API helper ───────────────────────────────────────────────

const sheetsApi = (token: string, path: string, opts?: RequestInit) =>
  fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts?.headers || {}),
    },
  });

// ── Ensure the _config tab exists (idempotent) ───────────────────────────────

export async function ensureConfigTab(token: string, sheetId: string): Promise<void> {
  // List existing sheets
  const meta = await sheetsApi(token, `/${sheetId}?fields=sheets.properties.title`).then(r => r.json());
  const titles: string[] = (meta.sheets || []).map((s: any) => s.properties?.title || "");
  if (titles.includes(CONFIG_TAB)) return; // already exists

  // Create the tab with a header row
  await sheetsApi(token, `/${sheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{
        addSheet: {
          properties: {
            title: CONFIG_TAB,
            gridProperties: { rowCount: 200, columnCount: 4 },
          },
        },
      }],
    }),
  });

  // Write header row
  await sheetsApi(token, `/${sheetId}/values/${encodeURIComponent(CONFIG_TAB + "!A1:D1")}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [["key", "value_json", "updated_at", "updated_by"]] }),
  });
}

// ── Read all config keys → plain object ─────────────────────────────────────

export async function readAllConfig(
  token: string,
  sheetId: string = SHARED_LOGS_SHEET_ID
): Promise<Record<string, any>> {
  try {
    await ensureConfigTab(token, sheetId);
    const res = await sheetsApi(
      token,
      `/${sheetId}/values/${encodeURIComponent(CONFIG_TAB + "!A:D")}`
    ).then(r => r.json());

    const rows: string[][] = res.values || [];
    const result: Record<string, any> = {};
    const newest: Record<string, number> = {};

    // Skip header row (row 0). A key can end up on SEVERAL rows (two browsers appending the
    // same key at once). The row with the latest updated_at wins (a later row wins a tie), so
    // an old leftover copy can never override a newer save — e.g. a deleted team member
    // coming back from a stale duplicate row.
    for (let i = 1; i < rows.length; i++) {
      const [key, valueJson, updatedAt] = rows[i];
      if (!key || !valueJson) continue;
      const stamp = Date.parse(updatedAt || "") || 0;
      if (key in newest && stamp < newest[key]) continue;
      newest[key] = stamp;
      try {
        result[key] = JSON.parse(valueJson);
      } catch {
        result[key] = valueJson; // fallback: store raw string
      }
    }
    return result;
  } catch (err) {
    console.warn("[configSheetService] readAllConfig failed:", err);
    return {};
  }
}

// ── Write / upsert a single config key ──────────────────────────────────────

export async function writeConfigKey(
  token: string,
  key: string,
  value: any,
  updatedBy = "",
  sheetId: string = SHARED_LOGS_SHEET_ID
): Promise<void> {
  await ensureConfigTab(token, sheetId);

  // Read current rows to find the existing row index for this key
  const res = await sheetsApi(
    token,
    `/${sheetId}/values/${encodeURIComponent(CONFIG_TAB + "!A:A")}`
  ).then(r => r.json());

  const rows: string[][] = res.values || [];
  // EVERY row holding this key (duplicates exist in the live sheet). Updating only the first
  // one left newer/older copies disagreeing, so reads returned the stale copy and deletes
  // "didn't stick". Update them all so every copy always matches.
  const keyRows: number[] = [];
  rows.forEach((r, i) => { if (i > 0 && r[0] === key) keyRows.push(i + 1); }); // 1-based sheet rows

  const valueJson = JSON.stringify(value);
  const updatedAt = new Date().toISOString();
  const rowData   = [[key, valueJson, updatedAt, updatedBy]];

  if (keyRows.length > 0) {
    const resp = await sheetsApi(token, `/${sheetId}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: keyRows.map(sheetRow => ({ range: `${CONFIG_TAB}!A${sheetRow}:D${sheetRow}`, values: rowData })),
      }),
    });
    if (!resp.ok) throw new Error(`Config write failed (HTTP ${resp.status})`);
  } else {
    // Append new row
    await sheetsApi(
      token,
      `/${sheetId}/values/${encodeURIComponent(CONFIG_TAB + "!A:D")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: rowData }) }
    );
  }
}
