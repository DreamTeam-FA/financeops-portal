/**
 * 4YR Payroll Service — TypeScript port of 4YRcode.gs
 * All operations target the Google Sheets spreadsheet:
 *   ID: 15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs
 *
 * Data is in the 'raw' sheet (consolidated). Data rows start at row 4.
 * sheetRow = rowIndex + 4 (rowIndex is 0-based index into the data array)
 */

const SPREADSHEET_ID = '1SITtQDT3iFo5yIOBgjbERbqJjYJ8rk6drXwkLm3sAGE';
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

// ── Sheets API helpers ─────────────────────────────────────────────────────────

function authHdr(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function sheetsGet(range: string, token: string, renderOption = 'FORMATTED_VALUE') {
  const url = `${BASE}/values/${encodeURIComponent(range)}?valueRenderOption=${renderOption}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Sheets GET error ${res.status}: ${txt}`);
  }
  const j = await res.json();
  return (j.values as any[][]) || [];
}

async function sheetsBatchGet(ranges: string[], token: string, renderOption = 'FORMATTED_VALUE') {
  const params = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `${BASE}/values:batchGet?${params}&valueRenderOption=${renderOption}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets batchGet error ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return (j.valueRanges as any[]) || [];
}

async function sheetsPut(range: string, values: any[][], token: string) {
  const url = `${BASE}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: authHdr(token),
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
  if (!res.ok) throw new Error(`Sheets PUT error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sheetsRawPut(range: string, values: any[][], token: string) {
  const url = `${BASE}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: authHdr(token),
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
  if (!res.ok) throw new Error(`Sheets RAW PUT error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sheetsBatchUpdate(requests: any[], token: string) {
  const url = `${BASE}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHdr(token),
    body: JSON.stringify({ requests })
  });
  if (!res.ok) throw new Error(`Sheets batchUpdate error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sheetsAppend(range: string, values: any[][], token: string) {
  const url = `${BASE}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHdr(token),
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
  if (!res.ok) throw new Error(`Sheets append error ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Gets the numeric sheetId for a named sheet tab */
async function getSheetId(sheetName: string, token: string): Promise<number> {
  const url = `${BASE}?fields=sheets.properties`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets metadata error ${res.status}`);
  const j = await res.json();
  const sheet = (j.sheets as any[]).find((s: any) => s.properties?.title === sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  return sheet.properties.sheetId;
}

// ── Date / Time helpers ───────────────────────────────────────────────────────

/**
 * Parses formatted date strings from Google Sheets (e.g. "January 15, 2025", "1/15/2025", "2025-01-15")
 * Returns YYYY-MM-DD or '' if unparseable
 */
function parseSheetDateToISO(val: string): string {
  if (!val || typeof val !== 'string') return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  if (y < 1990 || y > 2060) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoToMmDdYyyy(iso: string): string {
  if (!iso || !iso.includes('-')) return iso;
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function mmDdYyyyToIso(s: string): string {
  if (!s) return '';
  if (s.includes('-')) return s; // already ISO
  const parts = s.split('/');
  if (parts.length !== 3) return '';
  return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
}

/** Parse "HH:MM AM/PM" or "HH:MM:SS AM/PM" → fraction of day (0..1) */
function parseTimeStr(str: string): number | null {
  if (!str || !String(str).trim()) return null;
  const s = String(str).trim();
  const ampmM = s.match(/([aApP][mM])$/);
  const clean = s.replace(/\s*[aApP][mM]$/, '').trim();
  const parts = clean.split(':');
  if (parts.length < 2) return null;
  let h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const sec = parts.length >= 3 ? (parseInt(parts[2], 10) || 0) : 0;
  if (isNaN(h) || isNaN(m)) return null;
  if (ampmM) {
    const ap = ampmM[0].toLowerCase();
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
  }
  return (h * 3600 + m * 60 + sec) / 86400;
}

function fractionToTimeStr(frac: number | null): string {
  if (frac === null || frac === undefined) return '';
  // If cell has a datetime value (serial > 1), extract only the time fraction
  const timeFrac = frac > 1 ? frac % 1 : (frac < 0 ? 0 : frac);
  const totalSec = Math.round(timeFrac * 86400);
  const h = Math.floor(totalSec / 3600) % 24;
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60; // preserve seconds
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hDisp = h % 12 === 0 ? 12 : h % 12;
  const base = `${String(hDisp).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  return s ? `${base}:${String(s).padStart(2,'0')} ${ampm}` : `${base} ${ampm}`;
}

/** Sheets serial date to YYYY-MM-DD (days since Dec 30, 1899 with Lotus bug) */
function serialToISO(serial: number): string {
  if (!serial || isNaN(serial)) return '';
  // Google Sheets incorrectly treats 1900 as a leap year (Lotus bug), so serial 60 = Feb 29 1900
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  if (isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeMo(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
}

function splitName(fullName: string): { first: string; last: string } {
  if (!fullName) return { first: '', last: '' };
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, parts.length - 1).join(' '), last: parts[parts.length - 1] };
}

function fmtDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + d.getDate();
}

// ── Raw row type ──────────────────────────────────────────────────────────────

export interface RawRow {
  rowIndex: number;
  first: string;
  last: string;
  name: string;
  job: string;
  subCat: string;
  date: string;       // MM/DD/YYYY
  dateISO: string;    // YYYY-MM-DD
  started: string;    // "HH:MM AM/PM"
  finished: string;   // "HH:MM AM/PM"
  hoursRaw: number;
  hrsRed: boolean;
  rate: number;
  totalRaw: number;
  remarks: string;
  company: string;
  hours: number;
  total: number;
  variance: number;
  weekNum: string;
  mo: string;
}

export interface WeekMeta {
  weekNum: string;
  year: number;
  label: string;
  startDate: string;  // MM/DD/YYYY
  endDate: string;    // MM/DD/YYYY
  sheetName?: string;
}

// ── getRawData ────────────────────────────────────────────────────────────────

export async function getRawData(token: string): Promise<RawRow[]> {
  // Run both batchGet calls in parallel. FORMATTED_VALUE is required (throws on
  // failure); UNFORMATTED_VALUE is best-effort for seconds precision — if it
  // fails we fall back gracefully to FORMATTED_VALUE strings only.
  const [fmtResult, unfmtResult] = await Promise.allSettled([
    sheetsBatchGet(["'raw'!A4:S"], token, 'FORMATTED_VALUE'),
    sheetsBatchGet(["'raw'!A4:S"], token, 'UNFORMATTED_VALUE')
  ]);
  if (fmtResult.status === 'rejected') throw (fmtResult as PromiseRejectedResult).reason;
  const fmtRanges: any[] = (fmtResult as PromiseFulfilledResult<any>).value;
  const unfmtRanges: any[] = unfmtResult.status === 'fulfilled'
    ? (unfmtResult as PromiseFulfilledResult<any>).value
    : [];

  const fmtValues: any[][] = fmtRanges[0]?.values || [];
  const rawValues: any[][] = unfmtRanges[0]?.values || [];

  const rows: RawRow[] = [];

  for (let i = 0; i < fmtValues.length; i++) {
    const f = fmtValues[i] || [];
    const u = rawValues[i] || [];

    const name = String(f[2] || u[2] || '').trim();
    if (!name) continue;

    // Date: try unformatted (serial) first, then formatted string
    let dateISO = '';
    const uDateVal = u[5];
    if (typeof uDateVal === 'number' && uDateVal > 1) {
      dateISO = serialToISO(uDateVal);
    } else {
      dateISO = parseSheetDateToISO(String(f[5] || ''));
    }
    const date = dateISO ? isoToMmDdYyyy(dateISO) : '';

    // Columns G (index 6) = started, I (index 8) = finished.
    // Prefer UNFORMATTED_VALUE fractions for full seconds precision.
    // When UNFORMATTED_VALUE is unavailable or cell is text, fall back to
    // the FORMATTED_VALUE string (f[6]/f[8]) with AM/PM normalization.
    const startedFrac  = typeof u[6] === 'number' ? u[6] : null;
    const finishedFrac = typeof u[8] === 'number' ? u[8] : null;
    const normalizeTime = (s: string) => {
      // Accept "H:MM AM/PM" or "H:MM:SS AM/PM" → padded "HH:MM:SS AM/PM" / "HH:MM AM/PM"
      const m = s.match(/(\d+):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i);
      if (!m) return s;
      const h = parseInt(m[1], 10);
      const min = m[2];
      const sec = m[3]; // may be undefined when no seconds in string
      const ap = m[4].toUpperCase();
      const base = `${String(h).padStart(2,'0')}:${min}`;
      return sec ? `${base}:${sec} ${ap}` : `${base} ${ap}`;
    };
    const startedDisp  = String(f[6] || '').trim();
    const finishedDisp = String(f[8] || '').trim();
    const started  = startedFrac  !== null ? fractionToTimeStr(startedFrac)  : (startedDisp  ? normalizeTime(startedDisp)  : '');
    const finished = finishedFrac !== null ? fractionToTimeStr(finishedFrac) : (finishedDisp ? normalizeTime(finishedDisp) : '');

    // If both time fractions are available, compute hours from them directly —
    // this ensures the portal always reflects the actual start/end diff even
    // when Col O (index 14) was set to a stale or manually-overridden value
    // (e.g. via inline HRS cell edit or a pre-fix save).
    let computedHours: number;
    if (startedFrac !== null && finishedFrac !== null) {
      let diff = finishedFrac - startedFrac;
      if (diff < 0) diff += 1;
      // extract time-only portion in case values are datetime serials (> 1)
      const sf = startedFrac  > 1 ? startedFrac  % 1 : startedFrac;
      const ef = finishedFrac > 1 ? finishedFrac % 1 : finishedFrac;
      diff = ef - sf;
      if (diff < 0) diff += 1;
      computedHours = Math.round(diff * 24 * 10000) / 10000;
    } else {
      computedHours = typeof u[14] === 'number' ? u[14] : parseFloat(String(f[14] || '0')) || 0;
    }

    rows.push({
      rowIndex : i,
      first    : String(u[0]  || f[0]  || ''),
      last     : String(u[1]  || f[1]  || ''),
      name,
      job      : String(f[3]  || '').trim(),
      subCat   : String(f[4]  || '').trim(),
      date,
      dateISO,
      started,
      finished,
      hoursRaw : typeof u[9]  === 'number' ? u[9]  : parseFloat(String(f[9]  || '0')) || 0,
      hrsRed   : false, // font color not available via FORMATTED_VALUE easily
      rate     : typeof u[10] === 'number' ? u[10] : parseFloat(String(f[10] || '0')) || 0,
      totalRaw : typeof u[11] === 'number' ? u[11] : parseFloat(String(f[11] || '0')) || 0,
      remarks  : String(f[12] || '').trim(),
      company  : String(f[13] || '').trim(),
      hours    : computedHours,
      total    : typeof u[15] === 'number' ? u[15] : parseFloat(String(f[15] || '0')) || 0,
      variance : typeof u[16] === 'number' ? u[16] : parseFloat(String(f[16] || '0')) || 0,
      weekNum  : String(f[17] || u[17] || '').trim(),
      mo       : String(f[18] || u[18] || '').trim()
    });
  }

  return rows;
}

// ── getMasterListWeeks ────────────────────────────────────────────────────────

export async function getMasterListWeeks(token: string): Promise<WeekMeta[]> {
  const [fmtRanges, rawRanges] = await Promise.all([
    sheetsBatchGet(["'Master List'!A2:D"], token, 'FORMATTED_VALUE'),
    sheetsBatchGet(["'Master List'!A2:D"], token, 'UNFORMATTED_VALUE')
  ]);

  const fmt: any[][] = fmtRanges[0]?.values || [];
  const raw: any[][] = rawRanges[0]?.values || [];
  const weeks: WeekMeta[] = [];

  for (let i = 0; i < fmt.length; i++) {
    const f = fmt[i] || [];
    const u = raw[i] || [];
    const weekNum = String(f[0] || '').trim();
    if (!weekNum) continue;

    let startISO = '';
    let endISO = '';

    // Try unformatted serial first
    if (typeof u[1] === 'number' && u[1] > 1) startISO = serialToISO(u[1]);
    else startISO = parseSheetDateToISO(String(f[1] || ''));

    if (typeof u[2] === 'number' && u[2] > 1) endISO = serialToISO(u[2]);
    else endISO = parseSheetDateToISO(String(f[2] || ''));

    if (!startISO || !endISO) continue;

    const startDate = new Date(startISO + 'T00:00:00');
    const year = startDate.getFullYear();
    const endDate = new Date(endISO + 'T00:00:00');

    weeks.push({
      weekNum,
      year,
      label    : fmtDateShort(startISO) + ' - ' + fmtDateShort(endISO),
      startDate: isoToMmDdYyyy(startISO),
      endDate  : isoToMmDdYyyy(endISO),
      sheetName: String(f[3] || '').trim() || undefined
    });
  }

  // Sort by start date
  weeks.sort((a, b) => {
    const ad = mmDdYyyyToIso(a.startDate);
    const bd = mmDdYyyyToIso(b.startDate);
    return ad.localeCompare(bd);
  });

  return weeks;
}

// ── getMasterListEmployees ────────────────────────────────────────────────────

export async function getMasterListEmployees(token: string) {
  const values = await sheetsGet("'Master List'!J3:P", token, 'FORMATTED_VALUE');
  const employees: any[] = [];

  values.forEach((row: any[], idx: number) => {
    const name = String(row[2] || '').trim();
    if (!name || name.toLowerCase() === 'name') return;
    employees.push({
      sheetRow: idx + 3,   // 1-indexed, rows start at 3
      company : String(row[0] || '').trim(),
      ti      : String(row[1] || '').trim(),
      name,
      first   : String(row[3] || '').trim(),
      last    : String(row[4] || '').trim(),
      job     : String(row[5] || '').trim(),
      rate    : parseFloat(String(row[6] || '0')) || 0
    });
  });

  return { ok: true, employees };
}

// ── buildRateMap from Master List ─────────────────────────────────────────────

async function buildRateMap(token: string): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  const values = await sheetsGet("'Master List'!J2:P", token, 'UNFORMATTED_VALUE');
  values.forEach((row: any[]) => {
    const name = String(row[2] || '').trim();
    const job  = String(row[5] || '').trim();
    const rate = typeof row[6] === 'number' ? row[6] : parseFloat(String(row[6] || '0')) || 0;
    if (!name || !rate) return;
    if (job) map[`${name}|${job}`] = rate;
    if (!map[name]) map[name] = rate;
  });
  return map;
}

function lookupRate(rateMap: Record<string, number>, name: string, job: string): number {
  if (!name) return 0;
  const key = `${name}|${job || ''}`;
  if (rateMap[key] !== undefined) return rateMap[key];
  if (rateMap[name] !== undefined) return rateMap[name];
  return 0;
}

// ── buildWeekMap ──────────────────────────────────────────────────────────────

export function buildWeekMap(rows: RawRow[]): WeekMeta[] {
  const map: Record<string, { min: string; max: string }> = {};
  rows.forEach(r => {
    if (!r.weekNum || !r.dateISO) return;
    if (!map[r.weekNum]) {
      map[r.weekNum] = { min: r.dateISO, max: r.dateISO };
    } else {
      if (r.dateISO < map[r.weekNum].min) map[r.weekNum].min = r.dateISO;
      if (r.dateISO > map[r.weekNum].max) map[r.weekNum].max = r.dateISO;
    }
  });

  return Object.keys(map).sort().map(wk => {
    const { min, max } = map[wk];
    const d = new Date(min + 'T00:00:00');
    return {
      weekNum  : wk,
      year     : d.getFullYear(),
      label    : fmtDateShort(min) + ' - ' + fmtDateShort(max),
      startDate: isoToMmDdYyyy(min),
      endDate  : isoToMmDdYyyy(max)
    };
  });
}

// ── buildGroupedPivot ─────────────────────────────────────────────────────────

export function buildGroupedPivot(rows: RawRow[]) {
  const names = [...new Set(rows.map(r => r.name).filter(Boolean))].sort();

  function makeAcc() {
    const nameTotals: Record<string, { hrs: number; amt: number }> = {};
    names.forEach(n => { nameTotals[n] = { hrs: 0, amt: 0 }; });
    return { hours: 0, amount: 0, nameTotals };
  }

  function addRow(acc: ReturnType<typeof makeAcc>, r: RawRow) {
    acc.hours  += r.hours || 0;
    acc.amount += r.total || 0;
    if (r.name && acc.nameTotals[r.name]) {
      acc.nameTotals[r.name].hrs += r.hours || 0;
      acc.nameTotals[r.name].amt += r.total || 0;
    }
  }

  // Build tree: company → job → subCat → rows
  const tree: Record<string, Record<string, Record<string, RawRow[]>>> = {};
  rows.forEach(r => {
    const co  = r.company || '(none)';
    const job = r.job     || '(none)';
    const sc  = r.subCat  || '(none)';
    if (!tree[co])          tree[co] = {};
    if (!tree[co][job])     tree[co][job] = {};
    if (!tree[co][job][sc]) tree[co][job][sc] = [];
    tree[co][job][sc].push(r);
  });

  const grandTotal = makeAcc();
  const companies: any[] = [];

  Object.keys(tree).sort().forEach(co => {
    const coAcc = makeAcc();
    const jobs: any[] = [];

    Object.keys(tree[co]).sort().forEach(job => {
      const jobAcc  = makeAcc();
      const subCats: any[] = [];

      Object.keys(tree[co][job]).sort().forEach(sc => {
        const scAcc = makeAcc();
        tree[co][job][sc].forEach(r => {
          addRow(scAcc, r);
          addRow(jobAcc, r);
          addRow(coAcc, r);
          addRow(grandTotal, r);
        });

        const isDeduction  = scAcc.amount < 0 ||
          /deduct|loan|rent|penalty|withhold/i.test(job) ||
          /deduct|loan|rent|penalty|withhold/i.test(sc);
        const isNonPayroll = !isDeduction &&
          /reimburse|reimbursement|adjustment|allowance|bonus|incentive|extra|misc/i.test(sc);

        // Collect per-date breakdown
        const dateMap: Record<string, ReturnType<typeof makeAcc>> = {};
        tree[co][job][sc].forEach(r => {
          if (!r.date) return;
          if (!dateMap[r.date]) {
            dateMap[r.date] = makeAcc();
          }
          const dacc = dateMap[r.date];
          dacc.hours  += r.hours || 0;
          dacc.amount += r.total || 0;
          if (r.name && dacc.nameTotals[r.name]) {
            dacc.nameTotals[r.name].hrs += r.hours || 0;
            dacc.nameTotals[r.name].amt += r.total || 0;
          }
        });
        const sortedDates = Object.keys(dateMap).sort((a, b) =>
          mmDdYyyyToIso(a).localeCompare(mmDdYyyyToIso(b))
        );

        subCats.push({
          subCat      : sc,
          job,
          isDeduction,
          isNonPayroll,
          hours       : scAcc.hours,
          amount      : scAcc.amount,
          nameTotals  : scAcc.nameTotals,
          dateRows    : sortedDates.map(d => ({
            date      : d,
            hours     : dateMap[d].hours,
            amount    : dateMap[d].amount,
            nameTotals: dateMap[d].nameTotals,
            rows      : tree[co][job][sc].filter(r => r.date === d)
          }))
        });
      });

      jobs.push({ job, hours: jobAcc.hours, amount: jobAcc.amount, nameTotals: jobAcc.nameTotals, subCats });
    });

    companies.push({ company: co, hours: coAcc.hours, amount: coAcc.amount, nameTotals: coAcc.nameTotals, jobs });
  });

  return { names, companies, grandTotal };
}

// ── buildWeeklyPivot ──────────────────────────────────────────────────────────

export function buildWeeklyPivot(rows: RawRow[]) {
  const names = [...new Set(rows.map(r => r.name).filter(Boolean))].sort();
  const dates = [...new Set(rows.map(r => r.date).filter(Boolean))]
    .sort((a, b) => mmDdYyyyToIso(a).localeCompare(mmDdYyyyToIso(b)));

  const matrix: Record<string, Record<string, { hours: number; amount: number }>> = {};
  dates.forEach(d => {
    matrix[d] = {};
    names.forEach(n => { matrix[d][n] = { hours: 0, amount: 0 }; });
  });

  rows.forEach(r => {
    if (!r.date || !r.name) return;
    if (!matrix[r.date])         matrix[r.date] = {};
    if (!matrix[r.date][r.name]) matrix[r.date][r.name] = { hours: 0, amount: 0 };
    matrix[r.date][r.name].hours  += r.hours || 0;
    matrix[r.date][r.name].amount += r.total || 0;
  });

  const nameTotals: Record<string, { hours: number; amount: number }> = {};
  names.forEach(n => {
    nameTotals[n] = { hours: 0, amount: 0 };
    dates.forEach(d => {
      nameTotals[n].hours  += (matrix[d][n] || {}).hours  || 0;
      nameTotals[n].amount += (matrix[d][n] || {}).amount || 0;
    });
  });

  const grandTotal = { hours: 0, amount: 0 };
  Object.values(nameTotals).forEach(nt => {
    grandTotal.hours  += nt.hours;
    grandTotal.amount += nt.amount;
  });

  return { names, dates, matrix, nameTotals, grandTotal };
}

// ── getDropdownData ───────────────────────────────────────────────────────────

export async function getDropdownData(token: string) {
  const [raw, weeksFromML] = await Promise.all([
    getRawData(token),
    getMasterListWeeks(token).catch(() => null)
  ]);

  const names = [...new Set(raw.map(r => r.name).filter(Boolean))].sort();
  const jobs  = [...new Set(raw.map(r => r.job).filter(Boolean))].sort();

  const weeks = weeksFromML && weeksFromML.length > 0 ? weeksFromML : buildWeekMap(raw);
  const years = [...new Set(weeks.map(w => w.year).filter(Boolean))].sort().reverse();

  const weekContext: Record<string, { names: string[]; jobs: string[] }> = {};
  raw.forEach(r => {
    if (!r.weekNum) return;
    if (!weekContext[r.weekNum]) weekContext[r.weekNum] = { names: [], jobs: [] };
    if (r.name && !weekContext[r.weekNum].names.includes(r.name)) weekContext[r.weekNum].names.push(r.name);
    if (r.job  && !weekContext[r.weekNum].jobs.includes(r.job))   weekContext[r.weekNum].jobs.push(r.job);
  });
  Object.keys(weekContext).forEach(wk => {
    weekContext[wk].names.sort();
    weekContext[wk].jobs.sort();
  });

  return { names, jobs, weeks, years, weekContext };
}

// ── getDropdownDataForEntry ───────────────────────────────────────────────────

export async function getDropdownDataForEntry(token: string) {
  const [raw, weeksFromML] = await Promise.all([
    getRawData(token),
    getMasterListWeeks(token).catch(() => null)
  ]);

  const names     = [...new Set(raw.map(r => r.name).filter(Boolean))].sort();
  const jobs      = [...new Set(raw.map(r => r.job).filter(Boolean))].sort();
  const subCats   = [...new Set(raw.map(r => r.subCat).filter(Boolean))].sort();
  const companies = [...new Set(raw.map(r => r.company).filter(Boolean))].sort();
  const weeks     = weeksFromML && weeksFromML.length > 0 ? weeksFromML : buildWeekMap(raw);

  return { ok: true, names, jobs, subCats, companies, weeks };
}

// ── getFilteredData ───────────────────────────────────────────────────────────

export async function getFilteredData(filters: {
  year?: string | number;
  weekNum?: string;
  weekNums?: string[];
  name?: string;
  job?: string;
  date?: string;
}, token: string) {
  const [raw, weeksFromML] = await Promise.all([
    getRawData(token),
    getMasterListWeeks(token).catch(() => null)
  ]);

  const weeksMeta = weeksFromML && weeksFromML.length > 0 ? weeksFromML : buildWeekMap(raw);
  const weekYearMap: Record<string, string> = {};
  weeksMeta.forEach(w => { weekYearMap[w.weekNum] = String(w.year); });

  const selectedWeeks = (filters.weekNums && filters.weekNums.length > 0)
    ? filters.weekNums.map(String)
    : (filters.weekNum ? [String(filters.weekNum)] : []);

  const rows = raw.filter(r => {
    if (filters.year && weekYearMap[r.weekNum] !== String(filters.year)) return false;
    if (selectedWeeks.length > 0 && !selectedWeeks.includes(String(r.weekNum))) return false;
    if (filters.name && r.name !== filters.name) return false;
    if (filters.job  && r.job  !== filters.job)  return false;
    if (filters.date && r.date !== filters.date)  return false;
    return true;
  });

  return {
    rows,
    pivot       : buildWeeklyPivot(rows),
    groupedPivot: buildGroupedPivot(rows),
    totals: {
      hours : rows.reduce((s, r) => s + (r.hours || 0), 0),
      amount: rows.reduce((s, r) => s + (r.total || 0), 0)
    }
  };
}

// ── getEmployeeYTD ────────────────────────────────────────────────────────────

export async function getEmployeeYTD(name: string, token: string) {
  const raw = await getRawData(token);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const rows = raw.filter(r => {
    if (r.name !== name) return false;
    if (!r.dateISO) return false;
    return new Date(r.dateISO + 'T23:59:59') <= today;
  });

  if (!rows.length) {
    return { payroll: [], deductions: [], nonPayroll: [], totals: { hours: 0, amount: 0, deductionAmt: 0, nonPayrollAmt: 0 } };
  }

  const tree: Record<string, { job: string; subCat: string; hours: number; amount: number }> = {};
  rows.forEach(r => {
    const job = r.job    || '(none)';
    const sc  = r.subCat || '(none)';
    const key = `${job}|||${sc}`;
    if (!tree[key]) tree[key] = { job, subCat: sc, hours: 0, amount: 0 };
    tree[key].hours  += r.hours || 0;
    tree[key].amount += r.total || 0;
  });

  const payroll: any[]    = [];
  const deductions: any[] = [];
  const nonPayroll: any[] = [];

  Object.values(tree).forEach(entry => {
    const isDeduction  = entry.amount < 0 ||
      /deduct|loan|rent|penalty|withhold/i.test(entry.job) ||
      /deduct|loan|rent|penalty|withhold/i.test(entry.subCat);
    const isNonPayroll = !isDeduction &&
      /reimburse|reimbursement|adjustment|allowance|bonus|incentive|extra|misc/i.test(entry.subCat);

    if (isDeduction)       deductions.push(entry);
    else if (isNonPayroll) nonPayroll.push(entry);
    else                   payroll.push(entry);
  });

  const sort = (arr: any[]) => arr.sort((a, b) => (a.job + a.subCat).localeCompare(b.job + b.subCat));

  return {
    payroll    : sort(payroll),
    deductions : sort(deductions),
    nonPayroll : sort(nonPayroll),
    totals: {
      hours        : payroll.reduce((s, r) => s + r.hours, 0),
      amount       : payroll.reduce((s, r) => s + r.amount, 0),
      deductionAmt : deductions.reduce((s, r) => s + r.amount, 0),
      nonPayrollAmt: nonPayroll.reduce((s, r) => s + r.amount, 0)
    }
  };
}

// ── getProjectTotalData ───────────────────────────────────────────────────────

export async function getProjectTotalData(filters: {
  year?: string | number;
  weekNum?: string;
  weekNums?: string[];
  weekWindow?: number;
}, token: string) {
  const [raw, weeksFromML] = await Promise.all([
    getRawData(token),
    getMasterListWeeks(token).catch(() => null)
  ]);

  const weeksMeta  = weeksFromML && weeksFromML.length > 0 ? weeksFromML : buildWeekMap(raw);
  const weekInfo: Record<string, WeekMeta> = {};
  const weekOrder: string[] = [];
  weeksMeta.forEach(w => { weekInfo[w.weekNum] = w; weekOrder.push(w.weekNum); });

  const selectedWeeks = (filters.weekNums && filters.weekNums.length > 0)
    ? filters.weekNums.map(String)
    : (filters.weekNum ? [String(filters.weekNum)] : []);

  const rows = raw.filter(r => {
    if (!r.job) return false;
    if (filters.year) {
      const wi = weekInfo[r.weekNum];
      if (!wi || String(wi.year) !== String(filters.year)) return false;
    }
    if (selectedWeeks.length > 0 && !selectedWeeks.includes(String(r.weekNum))) return false;
    return true;
  });

  const byProject: Record<string, { total: number; weeks: Record<string, number> }> = {};
  rows.forEach(r => {
    const proj = r.job;
    if (!byProject[proj]) byProject[proj] = { total: 0, weeks: {} };
    byProject[proj].total += r.hours || 0;
    const wn = r.weekNum || '(none)';
    byProject[proj].weeks[wn] = (byProject[proj].weeks[wn] || 0) + (r.hours || 0);
  });

  const present: Record<string, boolean> = {};
  rows.forEach(r => { if (r.weekNum) present[r.weekNum] = true; });
  const allWeeks = weekOrder.filter(wn => present[wn]);
  Object.keys(present).forEach(wn => { if (!allWeeks.includes(wn)) allWeeks.push(wn); });

  let displayWeeks: string[];
  if (filters.weekNum) {
    displayWeeks = [filters.weekNum];
  } else {
    const win = filters.weekWindow ? parseInt(String(filters.weekWindow), 10) : NaN;
    if (!isNaN(win) && win > 0 && allWeeks.length > win) {
      displayWeeks = allWeeks.slice(allWeeks.length - win);
    } else {
      displayWeeks = allWeeks;
    }
  }

  function colName(wn: string) {
    const wi = weekInfo[wn];
    return wi ? `${wn}  (${wi.label})` : wn;
  }

  const headers = ['Project / Location', 'Total Hours', ...displayWeeks.map(colName)];
  const dataRows = Object.keys(byProject).sort().map(proj => {
    const obj: Record<string, any> = { 'Project / Location': proj, 'Total Hours': byProject[proj].total };
    displayWeeks.forEach(wn => { obj[colName(wn)] = byProject[proj].weeks[wn] || 0; });
    return obj;
  });

  const summary: Record<string, number> = {};
  headers.forEach(h => {
    if (h === 'Project / Location') return;
    summary[h] = dataRows.reduce((s, row) => s + (row[h] || 0), 0);
  });

  return {
    headers,
    rows   : dataRows,
    summary,
    meta   : {
      totalWeeks  : allWeeks.length,
      shownWeeks  : displayWeeks.length,
      hiddenWeeks : allWeeks.length - displayWeeks.length,
      projectCount: dataRows.length
    }
  };
}

// ── Write operations ──────────────────────────────────────────────────────────

export async function saveRemark(rowIndex: number, remark: string, token: string) {
  const sheetRow = rowIndex + 4;
  // Write value
  await sheetsPut(`'raw'!M${sheetRow}`, [[remark]], token);
  // Apply red foreground color to M column cell (matches GAS remark styling)
  try {
    const rawSheetId = await getSheetId('raw', token);
    await sheetsBatchUpdate([{
      repeatCell: {
        range: { sheetId: rawSheetId, startRowIndex: sheetRow - 1, endRowIndex: sheetRow, startColumnIndex: 12, endColumnIndex: 13 },
        cell: { userEnteredFormat: { textFormat: { foregroundColor: { red: 0.776, green: 0.157, blue: 0.157 } } } },
        fields: 'userEnteredFormat.textFormat.foregroundColor'
      }
    }], token);
  } catch { /* formatting is best-effort */ }
  return { ok: true, row: sheetRow };
}

export async function saveTime(rowIndex: number, startStr: string, endStr: string, token: string) {
  const sheetRow = rowIndex + 4;
  const saved: string[] = [];

  const requests: any[] = [];

  // Write G (started) and I (finished) as time fractions via RAW
  const gFrac = parseTimeStr(startStr);
  const iFrac = parseTimeStr(endStr);

  if (gFrac !== null) {
    await sheetsRawPut(`'raw'!G${sheetRow}`, [[gFrac]], token);
    saved.push('start');
  }
  if (iFrac !== null) {
    await sheetsRawPut(`'raw'!I${sheetRow}`, [[iFrac]], token);
    saved.push('end');
  }

  // Recompute col J hours from difference
  if (gFrac !== null && iFrac !== null) {
    let diff = iFrac - gFrac;
    if (diff < 0) diff += 1;
    const jHours = Math.round(diff * 24 * 100) / 100;
    await sheetsRawPut(`'raw'!J${sheetRow}`, [[jHours]], token);
  }

  // Read back cols O and P to return updated values
  let hours = 0, total = 0;
  try {
    const recalc = await sheetsGet(`'raw'!O${sheetRow}:P${sheetRow}`, token, 'UNFORMATTED_VALUE');
    hours = typeof recalc[0]?.[0] === 'number' ? recalc[0][0] : 0;
    total = typeof recalc[0]?.[1] === 'number' ? recalc[0][1] : 0;
  } catch (e) { /* ignore */ }

  return { ok: saved.length > 0, saved, row: sheetRow, hours, total };
}

export async function saveHours(rowIndex: number, hours: number, token: string) {
  const sheetRow = rowIndex + 4;
  await sheetsRawPut(`'raw'!O${sheetRow}`, [[hours]], token);
  // Read back total
  let total = 0;
  try {
    const r = await sheetsGet(`'raw'!P${sheetRow}`, token, 'UNFORMATTED_VALUE');
    total = typeof r[0]?.[0] === 'number' ? r[0][0] : 0;
  } catch (e) { /* ignore */ }
  return { ok: true, row: sheetRow, hours, total };
}

export async function saveHoursOverride(rowIndex: number, hours: number, token: string) {
  return saveHours(rowIndex, hours, token);
}

export async function saveTotal(rowIndex: number, total: number, token: string) {
  const sheetRow = rowIndex + 4;
  await sheetsRawPut(`'raw'!P${sheetRow}`, [[total]], token);
  return { ok: true, row: sheetRow, total };
}

export async function saveJob(rowIndex: number, jobValue: string, token: string) {
  const sheetRow = rowIndex + 4;
  await sheetsPut(`'raw'!D${sheetRow}`, [[jobValue]], token);
  return { ok: true, row: sheetRow, job: jobValue };
}

// ── saveRecordEdit ────────────────────────────────────────────────────────────

export async function saveRecordEdit(params: {
  rowIndex: number;
  name: string;
  job: string;
  subCat?: string;
  date?: string;
  started?: string;
  finished?: string;
  hours?: string | number;
  remarks?: string;
  amount?: number;
  company?: string;
  recordType?: string;
  hoursExplicitlyEdited?: boolean;
}, token: string) {
  const sheetRow = params.rowIndex + 4;
  const isNoTime = ['deduction', 'nonpayroll'].includes(
    String(params.recordType || 'payroll').toLowerCase()
  );

  // Build batch writes
  // Col C:E — Name, Job, SubCat
  await sheetsPut(`'raw'!C${sheetRow}:E${sheetRow}`, [[
    params.name || '',
    params.job  || '',
    params.subCat || ''
  ]], token);

  // Col F & H — Date
  if (params.date) {
    const dateVal = params.date; // "MM/DD/YYYY" or "YYYY-MM-DD"
    await sheetsPut(`'raw'!F${sheetRow}`, [[dateVal]], token);
    await sheetsPut(`'raw'!H${sheetRow}`, [[dateVal]], token);

    // R: week number — look up the date in Master List week ranges
    const iso = mmDdYyyyToIso(params.date);
    let weekNum = '';
    try {
      const weeks = await getMasterListWeeks(token);
      const d = new Date(iso + 'T00:00:00');
      const matched = weeks.find(w => {
        const start = new Date(mmDdYyyyToIso(w.startDate) + 'T00:00:00');
        const end   = new Date(mmDdYyyyToIso(w.endDate)   + 'T23:59:59');
        return d >= start && d <= end;
      });
      if (matched) weekNum = matched.weekNum;
    } catch (e) { /* ignore */ }
    await sheetsPut(`'raw'!R${sheetRow}`, [[weekNum]], token);
    // S is handled by the formula in applyFormulaColumns
  }

  if (isNoTime) {
    // Clear time fields, write zeros
    await sheetsRawPut(`'raw'!G${sheetRow}`, [['']], token);
    await sheetsRawPut(`'raw'!I${sheetRow}`, [['']], token);
    await sheetsRawPut(`'raw'!J${sheetRow}`, [[0]], token);
    await sheetsRawPut(`'raw'!K${sheetRow}:L${sheetRow}`, [[0, 0]], token);
    await sheetsRawPut(`'raw'!O${sheetRow}`, [[0]], token);
    await sheetsRawPut(`'raw'!Q${sheetRow}`, [[0]], token);
    if (params.amount !== null && params.amount !== undefined) {
      await sheetsRawPut(`'raw'!P${sheetRow}`, [[params.amount]], token);
    }
  } else {
    const gFrac = params.started  ? parseTimeStr(params.started)  : null;
    const iFrac = params.finished ? parseTimeStr(params.finished) : null;
    if (gFrac !== null) await sheetsRawPut(`'raw'!G${sheetRow}`, [[gFrac]], token);
    if (iFrac !== null) await sheetsRawPut(`'raw'!I${sheetRow}`, [[iFrac]], token);

    const hasTimesOnEdit = (params.started && String(params.started).trim()) ||
                           (params.finished && String(params.finished).trim());
    if (hasTimesOnEdit && gFrac !== null && iFrac !== null) {
      let diff = iFrac - gFrac;
      if (diff < 0) diff += 1;
      // 4-decimal precision preserves seconds (e.g. 1h 44m 15s = 1.7375)
      const jHours = Math.round(diff * 24 * 10000) / 10000;
      await sheetsRawPut(`'raw'!J${sheetRow}`, [[jHours]], token);
      // O is now a formula (=IF(G<I,...)) — no hardcoded write needed
    }

    if (params.hoursExplicitlyEdited && params.hours !== undefined) {
      // User manually overrode hours — write to J (raw hours) so L=K*J picks it up.
      // O stays as formula deriving from clock times; Q shows the variance.
      const hrsDecimal = parseHoursToDecimal(params.hours);
      const hrs = hrsDecimal !== '' ? hrsDecimal : 0;
      await sheetsRawPut(`'raw'!J${sheetRow}`, [[hrs]], token);
    }
  }

  // Col M — Remarks + apply red foreground color if non-empty
  await sheetsPut(`'raw'!M${sheetRow}`, [[params.remarks || '']], token);
  if (params.remarks && params.remarks.trim()) {
    try {
      const rawSheetId = await getSheetId('raw', token);
      await sheetsBatchUpdate([{ repeatCell: {
        range: { sheetId: rawSheetId, startRowIndex: sheetRow - 1, endRowIndex: sheetRow, startColumnIndex: 12, endColumnIndex: 13 },
        cell:  { userEnteredFormat: { textFormat: { foregroundColor: { red: 0.776, green: 0.157, blue: 0.157 } } } },
        fields: 'userEnteredFormat.textFormat.foregroundColor'
      }}], token);
    } catch { /* formatting is best-effort */ }
  }

  // Col N — Company: use formula unless explicitly overridden by the user
  if (params.company && String(params.company).trim()) {
    // Explicit override — write hardcoded value
    await sheetsPut(`'raw'!N${sheetRow}`, [[String(params.company).trim()]], token);
  } else {
    // Apply formula so it auto-derives from job name
    await applyFormulaColumns(sheetRow, isNoTime, token);
  }

  return { ok: true, row: sheetRow };
}

// ── applyFormulaColumns ───────────────────────────────────────────────────────
// Writes Google Sheets formulas to K, N, S (all records) and
// L, O, P, Q (payroll records only — noTime keeps hardcoded amount/zeros).
// A and B are left untouched (managed by sheet-level formulas).
// R is written as a hardcoded value by addRawEntry/saveRecordEdit (not a formula).
async function applyFormulaColumns(sheetRow: number, isNoTime: boolean, token: string): Promise<void> {
  const r = sheetRow;
  try {
    // K: rate — match name+job first, fall back to name-only
    await sheetsPut(`'raw'!K${r}`, [[
      `=IF(C${r}="","",IFERROR(XLOOKUP(C${r}&D${r},ARRAYFORMULA(TRIM('Master List'!$L$3:$L$15)&TRIM('Master List'!$O$3:$O$15)),'Master List'!$P$3:$P$15,XLOOKUP(C${r},ARRAYFORMULA(TRIM('Master List'!$L$3:$L$15)),'Master List'!$P$3:$P$15,"")),XLOOKUP(C${r},ARRAYFORMULA(TRIM('Master List'!$L$3:$L$15)),'Master List'!$P$3:$P$15,"")))`
    ]], token);

    // N: company — derives from job name (case-insensitive match in Sheets)
    await sheetsPut(`'raw'!N${r}`, [[
      `=IF(OR(D${r}="timm barn",D${r}="Skating Rink"),"TI","4YR")`
    ]], token);

    // S: month abbreviation derived from date in F
    await sheetsPut(`'raw'!S${r}`, [[`=IF(F${r}="","",TEXT(F${r},"mmm"))`]], token);

    if (!isNoTime) {
      // L = rate × raw hours
      await sheetsPut(`'raw'!L${r}`, [[`=K${r}*J${r}`]], token);
      // O = hours derived from clock-in (G) and clock-out (I)
      await sheetsPut(`'raw'!O${r}`, [[
        `=IF(G${r}<I${r},ROUND((I${r}-G${r})*24,2),ROUND(((I${r}-G${r})*24)+24,2))*1`
      ]], token);
      // P = displayed hours × rate
      await sheetsPut(`'raw'!P${r}`, [[`=O${r}*K${r}`]], token);
      // Q = variance (raw total − displayed total)
      await sheetsPut(`'raw'!Q${r}`, [[`=L${r}-P${r}`]], token);
    }
  } catch { /* formula writes are best-effort; record is already saved */ }
}

// ── addRawEntry ───────────────────────────────────────────────────────────────

function parseTimeToFraction(str: string): number | null {
  return parseTimeStr(str);
}

function parseHoursToDecimal(str: string | number, startFrac?: number | null, finishFrac?: number | null): number | '' {
  if (str !== null && str !== undefined && String(str).trim() !== '') {
    const s = String(str).trim();
    if (s.includes(':')) {
      // Handle HH:MM or HH:MM:SS — preserve seconds precision
      const parts = s.split(':').map(Number);
      const h = parts[0] || 0;
      const m = parts[1] || 0;
      const sec = parts[2] || 0; // seconds — was previously ignored!
      return Math.round(((h + m / 60 + sec / 3600)) * 10000) / 10000;
    }
    const n = parseFloat(s);
    if (!isNaN(n)) return Math.round(n * 100) / 100;
  }
  if (startFrac != null && finishFrac != null) {
    let diff = finishFrac - startFrac;
    if (diff < 0) diff += 1;
    return Math.round(diff * 24 * 100) / 100;
  }
  return '';
}

function findWeekForDate(iso: string, weeks: WeekMeta[]): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  const matched = weeks.find(w => {
    const start = new Date(mmDdYyyyToIso(w.startDate) + 'T00:00:00');
    const end   = new Date(mmDdYyyyToIso(w.endDate)   + 'T23:59:59');
    return d >= start && d <= end;
  });
  if (matched) return matched.weekNum;
  // Fallback: compute from ISO
  const yr = d.getFullYear();
  const jan1 = new Date(yr, 0, 1);
  const anchor = new Date(jan1);
  anchor.setDate(jan1.getDate() - (jan1.getDay() === 6 ? 0 : jan1.getDay() + 1));
  const diff = Math.floor((d.getTime() - anchor.getTime()) / 86400000);
  return `${yr}-W${String(Math.floor(diff / 7) + 1).padStart(2, '0')}`;
}

export async function addRawEntry(params: {
  name: string;
  job: string;
  subCat?: string;
  date?: string;
  started?: string;
  finished?: string;
  hours?: string | number;
  remarks?: string;
  amount?: number;
  company?: string;
  recordType?: string;
}, token: string) {
  const weeks = await getMasterListWeeks(token).catch(() => [] as WeekMeta[]);
  const rateMap = await buildRateMap(token).catch(() => ({} as Record<string, number>));

  const recordType = String(params.recordType || 'payroll').toLowerCase();
  const isNoTime   = recordType === 'deduction' || recordType === 'nonpayroll';

  const entryISO  = params.date ? mmDdYyyyToIso(params.date) : '';
  const startFrac = params.started  ? parseTimeToFraction(params.started)  : null;
  const finishFrac = params.finished ? parseTimeToFraction(params.finished) : null;

  let hoursDecJ: number | '' = '';
  if (!isNoTime) {
    if (startFrac !== null && finishFrac !== null) {
      let diff = finishFrac - startFrac;
      if (diff < 0) diff += 1;
      hoursDecJ = Math.round(diff * 24 * 10000) / 10000; // 4 decimals preserves seconds
    } else {
      hoursDecJ = parseHoursToDecimal(params.hours || '', startFrac, finishFrac);
    }
  }

  const amtVal = isNoTime && params.amount !== undefined ? Number(params.amount) : null;
  const weekNum = entryISO ? findWeekForDate(entryISO, weeks) : '';
  const mo      = entryISO ? computeMo(entryISO) : '';
  const nm      = splitName(params.name || '');

  // Compute derived values
  const rate     = lookupRate(rateMap, params.name || '', params.job || '');
  const hoursO   = isNoTime ? 0 : (typeof hoursDecJ === 'number' ? hoursDecJ : 0);
  const hoursJ   = isNoTime ? 0 : (typeof hoursDecJ === 'number' ? hoursDecJ : 0);
  const totalRaw = isNoTime ? (amtVal ?? 0) : Math.round(rate * hoursJ * 100) / 100;
  const total    = isNoTime ? (amtVal ?? 0) : Math.round(rate * hoursO * 100) / 100;
  const variance = Math.round((totalRaw - total) * 100) / 100;
  const companyOverride = params.company && String(params.company).trim();
  const company  = companyOverride
    ? String(params.company).trim()
    : (/timm barn|skating rink/i.test(params.job || '') ? 'TI' : '4YR');

  const dateStr   = params.date || '';
  const row: any[] = [
    nm.first,             // A: first
    nm.last,              // B: last
    params.name || '',    // C: name
    params.job  || '',    // D: job
    params.subCat || '',  // E: subCat
    dateStr,              // F: date
    isNoTime || startFrac === null ? '' : startFrac,  // G: started (fraction)
    dateStr,              // H: date dup
    isNoTime || finishFrac === null ? '' : finishFrac, // I: finished (fraction)
    hoursJ,               // J: hoursRaw
    isNoTime ? 0 : rate,  // K: rate
    isNoTime ? (amtVal ?? 0) : totalRaw, // L: totalRaw
    params.remarks || '',  // M: remarks
    company,              // N: company
    isNoTime ? 0 : hoursO, // O: hours
    isNoTime ? (amtVal ?? 0) : total, // P: total
    isNoTime ? 0 : variance, // Q: variance
    weekNum,              // R: weekNum
    mo                    // S: month
  ];

  const appendResult = await sheetsAppend("'raw'!A:S", [row], token);

  // Parse appended row number from updatedRange e.g. "'raw'!A102:S102" → 102
  const updatedRange0: string = appendResult?.updates?.updatedRange || '';
  const appendedRowMatch = updatedRange0.match(/(\d+)$/);
  if (appendedRowMatch) {
    const appendedRow = parseInt(appendedRowMatch[1], 10);
    await applyFormulaColumns(appendedRow, isNoTime, token);
  }

  // Apply red foreground to remarks cell (col M) if remark was provided
  if (params.remarks && params.remarks.trim()) {
    try {
      // Parse row number from updatedRange e.g. "'raw'!A102:S102" → 102
      const updatedRange: string = appendResult?.updates?.updatedRange || '';
      const rowMatch = updatedRange.match(/(\d+)$/);
      if (rowMatch) {
        const appendedRow = parseInt(rowMatch[1], 10);
        const rawSheetId = await getSheetId('raw', token);
        await sheetsBatchUpdate([{ repeatCell: {
          range: { sheetId: rawSheetId, startRowIndex: appendedRow - 1, endRowIndex: appendedRow, startColumnIndex: 12, endColumnIndex: 13 },
          cell:  { userEnteredFormat: { textFormat: { foregroundColor: { red: 0.776, green: 0.157, blue: 0.157 } } } },
          fields: 'userEnteredFormat.textFormat.foregroundColor'
        }}], token);
      }
    } catch { /* formatting is best-effort */ }
  }

  return { ok: true };
}

// ── deleteRawEntry ────────────────────────────────────────────────────────────

export async function deleteRawEntry(rowIndex: number, token: string) {
  const sheetRow = rowIndex + 4;
  // Get the sheetId for 'raw'
  const rawSheetId = await getSheetId('raw', token);

  await sheetsBatchUpdate([{
    deleteDimension: {
      range: {
        sheetId   : rawSheetId,
        dimension : 'ROWS',
        startIndex: sheetRow - 1,  // 0-indexed
        endIndex  : sheetRow       // exclusive
      }
    }
  }], token);

  return { ok: true, deletedRow: sheetRow };
}

// ── Master List employee write operations ─────────────────────────────────────

export async function saveMasterListEmployee(params: {
  sheetRow: number;
  company?: string;
  ti?: string;
  name?: string;
  first?: string;
  last?: string;
  job?: string;
  rate?: number;
}, token: string) {
  const r = params.sheetRow;
  await sheetsPut(`'Master List'!J${r}:P${r}`, [[
    params.company || '',
    params.ti      || '',
    params.name    || '',
    params.first   || '',
    params.last    || '',
    params.job     || '',
    Number(params.rate) || 0
  ]], token);
  return { ok: true };
}

export async function addMasterListEmployee(params: {
  company?: string;
  ti?: string;
  name?: string;
  first?: string;
  last?: string;
  job?: string;
  rate?: number;
}, token: string) {
  await sheetsAppend("'Master List'!J:P", [[
    params.company || '',
    params.ti      || '',
    params.name    || '',
    params.first   || '',
    params.last    || '',
    params.job     || '',
    Number(params.rate) || 0
  ]], token);
  return { ok: true };
}

export async function deleteMasterListEmployee(sheetRow: number, token: string) {
  // Only clear content (don't delete the row, avoids shifting week schedule in cols A–D)
  await sheetsPut(`'Master List'!J${sheetRow}:P${sheetRow}`, [['', '', '', '', '', '', '']], token);
  return { ok: true };
}

// =============================================================================
// START NEW WEEK  —  port of GAS startNewWeek() / startNewWeekFromMenu()
// Duplicates the TEMPLATE sheet, renames it "Week N Mon D - D", writes C2.
// =============================================================================

const WEEK_TAB_REGEX = /^Week\s+(\d+)\s+(.+?)\s*-\s*(.+)$/i;

async function sheetsMetaGet(token: string) {
  const url = `${BASE}?fields=sheets(properties(sheetId,title))`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets metadata error ${res.status}: ${await res.text()}`);
  return (await res.json()).sheets as Array<{ properties: { sheetId: number; title: string } }>;
}

export async function startNewWeek(token: string): Promise<{
  ok: boolean; newSheetName?: string; c2?: string;
  startDate?: string; endDate?: string; error?: string;
}> {
  // 1. List all sheets to find TEMPLATE and the latest Week tab
  const sheets = await sheetsMetaGet(token);

  const templateSheet = sheets.find(s => s.properties.title === 'TEMPLATE');
  if (!templateSheet) return { ok: false, error: 'No tab named "TEMPLATE" found.' };

  // 2. Find latest "Week N ..." tab by reading each one's C2 ("YY-WW")
  const weekSheets = sheets.filter(s => WEEK_TAB_REGEX.test(s.properties.title));
  if (!weekSheets.length) return { ok: false, error: 'No existing "Week N ..." tabs found.' };

  // Batch-read C2 of all week tabs
  const c2Ranges = weekSheets.map(s => `'${s.properties.title}'!C2`);
  const c2Results = await sheetsBatchGet(c2Ranges, token);

  let best: { sheetId: number; title: string; yy: number; wk: number } | null = null;
  weekSheets.forEach((sh, i) => {
    const c2Val = String(((c2Results[i]?.values || [])[0] || [])[0] || '').trim();
    const m = c2Val.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) return;
    const yy = parseInt(m[1], 10), wk = parseInt(m[2], 10);
    if (isNaN(yy) || isNaN(wk)) return;
    if (!best || yy > best.yy || (yy === best.yy && wk > best.wk)) {
      best = { sheetId: sh.properties.sheetId, title: sh.properties.title, yy, wk };
    }
  });

  if (!best) return { ok: false, error: 'Could not read a valid "YY-WW" from any Week tab.' };

  // 3. Read C3 of the latest tab to get its start date
  const c3Val = ((await sheetsGet(`'${best.title}'!C3`, token, 'FORMATTED_VALUE'))[0] || [])[0];
  if (!c3Val) return { ok: false, error: `Could not read start date from C3 of "${best.title}".` };

  // Parse MM/DD/YYYY or date string
  let startDate: Date;
  const dateParts = String(c3Val).match(/(\d+)\/(\d+)\/(\d+)/);
  if (dateParts) {
    startDate = new Date(Number(dateParts[3]), Number(dateParts[1]) - 1, Number(dateParts[2]));
  } else {
    startDate = new Date(c3Val);
  }
  if (isNaN(startDate.getTime())) return { ok: false, error: `C3 value "${c3Val}" is not a valid date.` };

  // 4. Compute next week dates (+7 days)
  const nextStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 7);
  const nextEnd   = new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() + 6);

  let nextWk = best.wk + 1;
  let nextYY = best.yy;
  if (nextWk > 52) { nextWk -= 52; nextYY += 1; }

  // 5. Build the new tab name: "Week N Mon D - D" (matching GAS buildWeekTabName)
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const startLabel = `${MONTHS[nextStart.getMonth()]} ${nextStart.getDate()}`;
  const endLabel   = nextEnd.getMonth() === nextStart.getMonth()
    ? String(nextEnd.getDate())
    : `${MONTHS[nextEnd.getMonth()]} ${nextEnd.getDate()}`;
  const newName = `Week ${nextWk} ${startLabel} - ${endLabel}`;
  const newC2   = `${nextYY}-${nextWk}`;

  // 6. Check for existing tab with that name
  if (sheets.some(s => s.properties.title === newName)) {
    return { ok: false, error: `A tab named "${newName}" already exists.` };
  }

  // 7. Duplicate TEMPLATE sheet → rename → write C2
  const dupeResp = await sheetsBatchUpdate([{
    duplicateSheet: {
      sourceSheetId: templateSheet.properties.sheetId,
      insertSheetIndex: sheets.length,
      newSheetName: newName
    }
  }], token);

  // Write C2 of the new sheet (RAW so "26-35" stays a string, not parsed as a date)
  await sheetsRawPut(`'${newName}'!C2`, [[newC2]], token);

  const fmt = (d: Date) => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
  return { ok: true, newSheetName: newName, c2: newC2, startDate: fmt(nextStart), endDate: fmt(nextEnd) };
}
