// Google Calendar Integration Service

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
  };
  htmlLink?: string;
}

/**
 * Fetch primary Google Calendar events for a given month/date range
 */
export async function fetchGoogleCalendarEvents(
  token: string,
  timeMinISO: string,
  timeMaxISO: string
): Promise<GoogleCalendarEvent[]> {
  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
      timeMinISO
    )}&timeMax=${encodeURIComponent(timeMaxISO)}&singleEvents=true&orderBy=startTime`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        const err = new Error("Google token expired");
        (err as any).status = 401;
        throw err;
      }
      console.warn("Google Calendar API fetch error status:", response.status);
      return [];
    }

    const data = await response.json();
    return data.items || [];
  } catch (err: any) {
    if (err?.status === 401) throw err;
    console.warn("Failed to fetch Google Calendar events:", err);
    return [];
  }
}

/**
 * Create a new event on user's primary Google Calendar
 */
export async function createGoogleCalendarEvent(
  token: string,
  event: {
    summary: string;
    description?: string;
    date: string; // YYYY-MM-DD
    time?: string; // HH:MM
  }
): Promise<GoogleCalendarEvent | null> {
  try {
    const startDateTime = event.time
      ? `${event.date}T${event.time}:00`
      : `${event.date}T09:00:00`;
    
    // Default 1 hour duration
    const endDateObj = new Date(startDateTime);
    endDateObj.setHours(endDateObj.getHours() + 1);
    const endDateTime = endDateObj.toISOString().split(".")[0];

    const body = {
      summary: event.summary,
      description: event.description || "Created from FinanceOps Portal",
      start: event.time ? { dateTime: `${startDateTime}Z` } : { date: event.date },
      end: event.time ? { dateTime: `${endDateTime}Z` } : { date: event.date }
    };

    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Google Calendar event creation failed:", errText);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error("Error creating Google Calendar event:", err);
    return null;
  }
}

export const CALENDAR_SHEET_IDS = [
  "1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo",
  "15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs"
];

// ─── Bidirectional Calendar Sheet Sync ───────────────────────────────────────
// Primary spreadsheet for read+write calendar sync
export const CALENDAR_SPREADSHEET_ID = "1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo";
const SHEET_TAB_CANDIDATES = ["Calendar", "Events", "Schedule", "Tasks", "Sheet1"];

export interface CalSheetRow {
  id: string;
  date: string;
  time?: string;
  title: string;
  notes: string;
  entity: string;
  type: string;
  assignee: string;
  urgency: string;
  done: boolean;
  sheetRow: number; // 1-indexed row number in the spreadsheet
}

interface ColMap {
  date: number; title: number; notes: number; entity: number;
  type: number; assignee: number; urgency: number; done: number; id: number;
}

// Column map based on actual calendar sheet structure:
// A(0)=id, B(1)=source, C(2)=title, D(3)=description, E(4)=start_ms, F(5)=end_ms,
// G(6)=allDay, H(7)=calName, I(8)=urgency, J(9)=category, K(10)=assigneeId,
// L(11)=assigneeName, M(12)=assigneeColor, N(13)=assigneeIds, O(14)=seriesId, P(15)=done
const DEFAULT_COL_MAP: ColMap = {
  id: 0, title: 2, notes: 3, date: 4, done: 15,
  entity: 7, urgency: 8, type: 9, assignee: 11
};

function parseMsOrDateString(raw: string): string {
  if (!raw) return "";
  if (/^\d{12,13}$/.test(raw.trim())) {
    const d = new Date(parseInt(raw, 10));
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return "";
}

function parseMsToTime(raw: string): string | undefined {
  if (!raw) return undefined;
  if (/^\d{12,13}$/.test(raw.trim())) {
    const d = new Date(parseInt(raw, 10));
    if (!isNaN(d.getTime())) {
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      return h === "00" && m === "00" ? undefined : `${h}:${m}`;
    }
  }
  return undefined;
}

function detectColMap(header: string[]): ColMap {
  const map = { ...DEFAULT_COL_MAP };
  header.forEach((h, i) => {
    const s = h.toLowerCase().trim();
    if (/^date|^day|^when|^start/.test(s)) map.date = i;
    else if (/^title|^event|^task|^vendor|^summary/.test(s)) map.title = i;
    else if (/^note|^detail|^remark|^description/.test(s)) map.notes = i;
    else if (/^entity|^company|^calname/.test(s)) map.entity = i;
    else if (/^type|^category/.test(s)) map.type = i;
    else if (/^assigneename|^person|^who/.test(s)) map.assignee = i;
    else if (/^urgen|^priority/.test(s)) map.urgency = i;
    else if (/^done|^complet|^status/.test(s)) map.done = i;
    else if (/^id$|^row_id/.test(s)) map.id = i;
  });
  return map;
}

// Load all rows from the calendar sheet, auto-detecting the tab and column layout
export async function loadCalendarSheet(token: string): Promise<{
  events: CalSheetRow[];
  tab: string;
  colMap: ColMap;
}> {
  let rows: string[][] = [];
  let tab = "Calendar";

  for (const candidate of SHEET_TAB_CANDIDATES) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${CALENDAR_SPREADSHEET_ID}/values/${encodeURIComponent(candidate)}!A1:Z500`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        const err = new Error("Google token expired");
        (err as any).status = 401;
        throw err;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.values?.length > 0) {
          tab = candidate;
          rows = data.values.map((r: any[]) => r.map((c: any) => String(c ?? "")));
          break;
        }
      }
    } catch (e: any) {
      if (e?.status === 401) throw e;
      /* try next tab */
    }
  }

  if (rows.length === 0) return { events: [], tab, colMap: DEFAULT_COL_MAP };

  const firstRow = rows[0];
  const hasHeader = firstRow.some(c => /^(date|title|event|done|status|task)/i.test(c.trim()));
  const colMap = hasHeader ? detectColMap(firstRow) : DEFAULT_COL_MAP;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const rowOffset = hasHeader ? 2 : 1; // 1-indexed row of first data row

  const events: CalSheetRow[] = [];
  dataRows.forEach((row, i) => {
    const title = row[colMap.title]?.trim() || "";
    if (!title) return; // skip blank rows

    const dateRaw = row[colMap.date]?.trim() || ""; // col E (start_ms)
    const date = parseMsOrDateString(dateRaw);
    // Try start_ms (col E) first; if midnight, fall back to end_ms (col F)
    const time = parseMsToTime(dateRaw) || parseMsToTime((row[5] || "").trim());

    const doneRaw = (row[colMap.done] || "").toLowerCase().trim();
    const done = doneRaw === "true" || doneRaw === "yes" || doneRaw === "1" || doneRaw === "done" || doneRaw === "✓";

    events.push({
      id: row[colMap.id]?.trim() || `calsheet-${rowOffset + i}`,
      date: date || new Date().toISOString().split("T")[0],
      time,
      title,
      notes: row[colMap.notes] || "",
      entity: row[colMap.entity] || "Ruby's",
      type: row[colMap.type] || "task",
      assignee: row[colMap.assignee] || "",
      urgency: row[colMap.urgency] || "normal",
      done,
      sheetRow: rowOffset + i,
    });
  });

  return { events, tab, colMap };
}

// Append a new row to the calendar sheet
export async function appendCalendarRow(
  token: string,
  tab: string,
  event: { date: string; title: string; notes?: string; entity?: string; type?: string; assignee?: string; urgency?: string; id: string }
): Promise<void> {
  const values = [[
    event.date, event.title, event.notes || "", event.entity || "Ruby's",
    event.type || "task", event.assignee || "", event.urgency || "normal",
    "FALSE", event.id
  ]];
  const range = `${tab}!A:I`;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CALENDAR_SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ majorDimension: "ROWS", values })
    }
  );
}

// Update the Done cell for a specific row
export async function updateCalendarDone(
  token: string,
  tab: string,
  sheetRow: number,
  doneColIndex: number,
  done: boolean
): Promise<void> {
  const col = String.fromCharCode(65 + doneColIndex);
  const range = `${tab}!${col}${sheetRow}`;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CALENDAR_SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ range, majorDimension: "ROWS", values: [[done ? "TRUE" : "FALSE"]] })
    }
  );
}

// Clear a row in the calendar sheet (soft-delete)
export async function clearCalendarRow(
  token: string,
  tab: string,
  sheetRow: number
): Promise<void> {
  const range = `${tab}!A${sheetRow}:Z${sheetRow}`;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CALENDAR_SPREADSHEET_ID}/values/${encodeURIComponent(range)}:clear`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({})
    }
  );
}

/**
 * Fetch calendar events directly from Google Sheets ("Events", "Meeting Notes", "Calendar", "Schedule", etc.)
 */
export async function fetchCalendarSheetEvents(token?: string): Promise<GoogleCalendarEvent[]> {
  try {
    // 1. Try server backend endpoint first (bypasses CORS completely)
    try {
      const apiRes = await fetch("/api/calendar-sheet-events");
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        if (apiData.success && Array.isArray(apiData.events) && apiData.events.length > 0) {
          return apiData.events;
        }
      }
    } catch (e) {
      // fallback to client direct fetch
    }

    let rows: { rowData: any[]; sheetId: string }[] = [];
    const tabsToTry = ["Calendar Dashboard", "Local Events", "Calendar", "Schedule", "Events"];

    for (const sheetId of CALENDAR_SHEET_IDS) {
      if (token) {
        for (const tab of tabsToTry) {
          try {
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}!A1:Z500`;
            const response = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
              const data = await response.json();
              if (data.values && data.values.length > 0) {
                data.values.forEach((r: any) => rows.push({ rowData: r, sheetId }));
              }
            }
          } catch (err) {
            // continue
          }
        }
      }

      // Fallback: Fetch public gviz json endpoints for each sheet & tab
      for (const tab of tabsToTry) {
        try {
          const tabParam = `&sheet=${encodeURIComponent(tab)}`;
          const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json${tabParam}`;
          const res = await fetch(url);
          if (res.ok) {
            const text = await res.text();
            if (text.includes("{") && text.includes("}")) {
              const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
              const parsed = JSON.parse(jsonStr);
              const tableRows = parsed.table ? parsed.table.rows : [];
              const extracted = tableRows.map((r: any) =>
                (r.c || []).map((cell: any) => (cell ? cell.v ?? cell.f ?? "" : ""))
              );
              extracted.forEach((r: any) => rows.push({ rowData: r, sheetId }));
            }
          }
        } catch (gvizErr) {
          // continue
        }
      }
    }

    if (rows.length === 0) return [];

    const sheetEvents: GoogleCalendarEvent[] = [];

    rows.forEach((item, idx) => {
      const row = item.rowData;
      if (!row || row.length === 0) return;
      
      // Check if header row
      const firstCell = String(row[0] || "").toLowerCase();
      if (firstCell.includes("title") && firstCell.includes("date")) return;

      let dateStr = "";
      let titleStr = "";
      let descStr = "";

      // Scan cells for date & title
      row.forEach((cell) => {
        const val = String(cell || "").trim();
        if (!val) return;

        // Check if cell matches a date format
        if (
          /^\d{4}-\d{2}-\d{2}$/.test(val) ||
          /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(val) ||
          val.startsWith("Date(")
        ) {
          if (!dateStr) dateStr = val;
        } else if (!titleStr && !val.toLowerCase().includes("date") && !val.toLowerCase().includes("header") && val.length > 2) {
          titleStr = val;
        } else if (!descStr && val !== titleStr) {
          descStr = val;
        }
      });

      if (!titleStr && row[0]) titleStr = String(row[0]);
      if (!dateStr && row[1]) dateStr = String(row[1]);

      const lowerTitle = titleStr.toLowerCase().trim();
      // Filter out invalid/junk titles like n178..., note-, id-, remarks, vendor headers, etc.
      if (
        !lowerTitle ||
        lowerTitle.length < 3 ||
        lowerTitle.includes("bills]") ||
        lowerTitle.includes("[ruby's bills]") ||
        lowerTitle.includes("[msdx bills]") ||
        lowerTitle.includes("cheque") ||
        lowerTitle.includes("prepare $") ||
        /^n\d+/i.test(titleStr) ||
        /^note[-_:\s]/i.test(titleStr) ||
        /^id[-_:\s]/i.test(titleStr) ||
        /^memo[-_:\s]/i.test(titleStr) ||
        /^task[-_:\s]/i.test(titleStr) ||
        /^map[-_]/i.test(titleStr) ||
        ["title", "vendor", "event title", "date", "id", "remarks", "amount", "status", "company"].includes(lowerTitle)
      ) {
        return;
      }

      // Parse dateStr to YYYY-MM-DD
      let yyyyMmDd = "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        yyyyMmDd = dateStr;
      } else if (typeof dateStr === "string" && dateStr.startsWith("Date(")) {
        const parts = dateStr.replace("Date(", "").replace(")", "").split(",").map((n) => parseInt(n.trim()));
        if (parts.length >= 3) {
          yyyyMmDd = `${parts[0]}-${String(parts[1] + 1).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`;
        }
      } else if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          yyyyMmDd = d.toISOString().split("T")[0];
        }
      }

      if (yyyyMmDd && titleStr) {
        sheetEvents.push({
          id: `cal-sheet-${idx + 1}`,
          summary: titleStr,
          description: descStr,
          start: { date: yyyyMmDd },
          end: { date: yyyyMmDd }
        });
      }
    });

    return sheetEvents;
  } catch (err) {
    console.warn("Failed to fetch calendar sheet events:", err);
    return [];
  }
}
