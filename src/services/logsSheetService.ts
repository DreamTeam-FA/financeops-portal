/**
 * logsSheetService.ts
 *
 * Manages a single dedicated Google Sheet that acts as the permanent, shared
 * log store for ALL portal users:
 *   - "Login History"  tab — Timestamp, User, Device, City, Region, Country, IP
 *   - "Activity Log"   tab — Timestamp, User, Action, Details
 *
 * The sheet is created once by the first user who signs in.
 * Its ID is persisted on the server so every subsequent user appends to the
 * SAME sheet — no per-user sheets.
 */

export const LOGS_SHEET_TITLE = "⛔ DO NOT DELETE — FinanceOps Portal Logs";

/** Hardcoded shared logs sheet — one sheet, all users.
 *  https://docs.google.com/spreadsheets/d/19ColN3UOnuGbk1CkHtZswxPZf7oj7Zs2pKaqmGlN4m8
 */
export const SHARED_LOGS_SHEET_ID = "19ColN3UOnuGbk1CkHtZswxPZf7oj7Zs2pKaqmGlN4m8";

const api = (token: string, path: string, opts?: RequestInit) =>
  fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts?.headers || {})
    }
  });

/* ── Find existing logs sheet (searches ALL accessible files, including shared) ── */
async function findExistingLogsSheet(accessToken: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${LOGS_SHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  );
  // Drive v3 files.list searches personal + shared-with-me by default
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1&includeItemsFromAllDrives=true&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

/* ── Get or create the shared logs sheet ── */
export async function createLogsSheet(accessToken: string): Promise<string> {
  // Always check the full Drive (including shared files) before creating a new one
  const existing = await findExistingLogsSheet(accessToken);
  if (existing) return existing;

  const headerStyle = {
    backgroundColor: { red: 0.067, green: 0.278, blue: 0.553 },
    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
  };
  const makeHeader = (cols: string[]) => ({
    rowData: [{
      values: cols.map(v => ({
        userEnteredValue: { stringValue: v },
        userEnteredFormat: headerStyle
      }))
    }]
  });

  const res = await api(accessToken, "", {
    method: "POST",
    body: JSON.stringify({
      properties: { title: LOGS_SHEET_TITLE },
      sheets: [
        {
          properties: { title: "Login History", index: 0 },
          data: [makeHeader(["Timestamp", "User / Email", "Device (OS / Browser)", "City", "Region", "Country", "IP Address"])]
        },
        {
          properties: { title: "Activity Log", index: 1 },
          data: [makeHeader(["Timestamp", "User / Email", "Action", "Details"])]
        }
      ]
    })
  });

  const data = await res.json();
  if (!data.spreadsheetId) throw new Error(`Failed to create logs sheet: ${JSON.stringify(data)}`);
  return data.spreadsheetId as string;
}

/* ── Ensure a tab exists; create it with a header row if missing ── */
async function ensureTab(
  accessToken: string,
  sheetId: string,
  tabTitle: string,
  headers: string[]
): Promise<void> {
  // Check if tab exists
  const meta = await api(accessToken, `/${sheetId}?fields=sheets.properties.title`).then(r => r.json()).catch(() => null);
  const exists = (meta?.sheets || []).some((s: any) => s.properties?.title === tabTitle);
  if (exists) return;

  // Add the sheet tab
  await api(accessToken, `/${sheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabTitle } } }] }),
  });

  // Write header row
  await api(
    accessToken,
    `/${sheetId}/values/${encodeURIComponent(tabTitle + "!A1")}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: [headers] }) }
  );
}

/* ── Append a single row to a named tab (auto-creates Sync Log if missing) ── */
export async function appendLogRow(
  accessToken: string,
  sheetId: string,
  tab: "Login History" | "Activity Log" | "Sync Log",
  row: string[]
): Promise<void> {
  if (tab === "Sync Log") {
    await ensureTab(accessToken, sheetId, "Sync Log",
      ["Timestamp", "Direction", "Module", "Status", "Details", "Row Count"]);
  }
  await api(
    accessToken,
    `/${sheetId}/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) }
  );
}

/* ── Read all rows from both tabs (skipping header row) ── */
export interface LogsSheetData {
  loginRows: string[][];   // each: [timestamp, user, device, city, region, country, ip]
  activityRows: string[][]; // each: [timestamp, user, action, details]
  sheetUrl: string;
}

export async function readLogsSheet(accessToken: string, sheetId: string): Promise<LogsSheetData> {
  const [loginRes, activityRes] = await Promise.all([
    api(accessToken, `/${sheetId}/values/${encodeURIComponent("Login History")}!A:G`).then(r => r.json()),
    api(accessToken, `/${sheetId}/values/${encodeURIComponent("Activity Log")}!A:D`).then(r => r.json())
  ]);
  return {
    loginRows:    ((loginRes.values    || []) as string[][]).slice(1),
    activityRows: ((activityRes.values || []) as string[][]).slice(1),
    sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
  };
}
