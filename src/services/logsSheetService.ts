/**
 * logsSheetService.ts
 *
 * Manages a dedicated Google Sheet that acts as the permanent log store for:
 *   - Login History  (tab 1)
 *   - Activity Log   (tab 2)
 *
 * The sheet is created on first sign-in and its ID is persisted on the server.
 * All subsequent appends go directly to the sheet via Sheets API v4.
 */

export const LOGS_SHEET_TITLE = "⛔ DO NOT DELETE — FinanceOps Portal Logs";

const api = (token: string, path: string, opts?: RequestInit) =>
  fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts?.headers || {})
    }
  });

/* ── Find existing logs sheet by title in Drive ── */
async function findExistingLogsSheet(accessToken: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${LOGS_SHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

/* ── Get or create the logs sheet (finds existing before creating) ── */
export async function createLogsSheet(accessToken: string): Promise<string> {
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

/* ── Append a single row to a named tab ── */
export async function appendLogRow(
  accessToken: string,
  sheetId: string,
  tab: "Login History" | "Activity Log",
  row: string[]
): Promise<void> {
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
