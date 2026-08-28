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

    // Skip header row (row 0)
    for (let i = 1; i < rows.length; i++) {
      const [key, valueJson] = rows[i];
      if (!key || !valueJson) continue;
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
  const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === key); // 0-based; skip header

  const valueJson = JSON.stringify(value);
  const updatedAt = new Date().toISOString();
  const rowData   = [[key, valueJson, updatedAt, updatedBy]];

  if (rowIndex >= 0) {
    // Update existing row (sheet rows are 1-based, +1 for header)
    const sheetRow = rowIndex + 1;
    await sheetsApi(
      token,
      `/${sheetId}/values/${encodeURIComponent(`${CONFIG_TAB}!A${sheetRow}:D${sheetRow}`)}?valueInputOption=RAW`,
      { method: "PUT", body: JSON.stringify({ values: rowData }) }
    );
  } else {
    // Append new row
    await sheetsApi(
      token,
      `/${sheetId}/values/${encodeURIComponent(CONFIG_TAB + "!A:D")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: rowData }) }
    );
  }
}
