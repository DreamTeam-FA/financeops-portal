# FinanceOps Portal — Google Sheets Structure

> **Last updated:** 2026-08-22
> This document is the authoritative reference for every Google Spreadsheet the portal reads from or writes to.
> If you change a tab name, add/remove columns, or move row offsets in any of these sheets, update this file AND update the corresponding parser in `src/services/googleSheetsService.ts`.

---

## Spreadsheets at a glance

| Name | Spreadsheet ID | Purpose |
|---|---|---|
| **Main F&A Sheet** | `15uYsYttv4xSYVszpiQh0mtRy7pvoMOxHLMO5KMEmpSs` | AP, AR, Banks, Loans, Statements, Notes, Metadata, Headley's |
| **4YR Payroll** | `1SITtQDT3iFo5yIOBgjbERbqJjYJ8rk6drXwkLm3sAGE` | 4You Pros raw payroll data |
| **Calendar** | `1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo` | Finance & schedule events |

Open any sheet: `https://docs.google.com/spreadsheets/d/<ID>/edit`

---

## Main F&A Sheet

### Tabs

| Tab name (exact) | `#gid` | What the portal reads/writes |
|---|---|---|
| `Ruby's Bills` | `1244424272` | AP bills for Ruby's Pizzeria & Grill |
| `TI Bills` | `1881273371` | AP bills for Timm Investments LLC |
| `MSDx Bills` | `626198915` | AP bills for Mobile Swallowing Diagnostics |
| `AR Dashboard Data` | `1095820813` | Accounts Receivable items |
| `Bank Balances` | `573058575` | Bank account balances |
| `Loans` | `860453470` | Loans & credit card dues |
| `Bank Statements Data` | `350904169` | Bank statement download tracker |
| `Meeting Notes` | `320158278` | Quick Notes from the portal |
| `Metadata` | *(dynamic)* | Vendor metadata (due dates, recurring, payment type) — used by the MetaData editor in the gear menu |
| `Headley's` | *(dynamic)* | Headley's invoice import raw data — used by the Headley's Invoice tool in the gear menu |
| `Activity Log` | *(dynamic)* | Portal audit log (auto-appended on every action) |

> **"dynamic"** means the portal navigates to that tab by name, not by gid. Renaming these tabs will break the feature that uses them.

---

### AP Bills — Column Maps (0-indexed from col A)

The AP parser uses **hardcoded column positions**, not header detection. If you add or shift columns in the sheet, the column map in `src/services/googleSheetsService.ts → AP_COL_MAPS` must be updated to match.

#### Ruby's Bills (`A5:S1504` — data starts row 5)

| Col (0-idx) | Letter | Field |
|---|---|---|
| 0 | A | Year (from due date) |
| 1 | B | Month (from due date) |
| 2 | C | Wk# — **formula in sheet, never written by portal** |
| 3 | D | Vendor name |
| 4 | E | Description |
| 5 | F | Category |
| 6 | G | Invoice # |
| 7 | H | Invoice date |
| 8 | I | Due date |
| 9 | J | Amount |
| 10 | K | Remarks / Payment Instructions |
| 11 | L | Paid date |
| 12 | M | Status (`Paid` / blank) |
| 13 | N | In QBO |
| 14 | O | Payment Instructions (alt remarks) |
| 15 | P | Status 1 (custom status text) |
| 17 | R | Pay type — **formula, never written** |
| 18 | S | On Hold flag |

#### TI Bills (`A7:W1506` — data starts row 7)

| Col (0-idx) | Letter | Field |
|---|---|---|
| 4 | E | Company / sub-entity |
| 5 | F | Vendor name |
| 6 | G | Invoice # |
| 7 | H | Invoice date |
| 8 | I | Due date |
| 9 | J | Amount |
| 10 | K | Paid date |
| 12 | M | Payment method |
| 13 | N | Status |
| 14 | O | Remarks |
| 15 | P | In QBO |
| 16 | Q | Payment Instructions |
| 17 | R | Status 1 |
| 19 | T | Pay type — **formula, never written** |
| 22 | W | On Hold flag |

#### MSDx Bills (`A6:S1505` — data starts row 6)

Same column layout as Ruby's Bills (Layout A). See Ruby's table above.

---

### AR Dashboard Data (`AR Dashboard Data` tab)

**Header-based detection** — the parser (`parseARSheetRows`) reads row 1 as headers and finds columns by regex matching. Column order does not matter as long as header names are recognisable.

Supports two layouts:

1. **Horizontal months** — columns like `Mar-Amount`, `Apr-Amount`, `Mar-Due Date`, etc. Each customer is one row; months fan out across columns.
2. **Vertical** — one row per invoice (entity, customer, description, amount, due date, status, paid date, remarks).

The parser auto-detects which layout is in use.

---

### Bank Balances (`Bank Balances` tab)

**Header-based detection** — `parseBankSheetRows` matches column names by regex.

| Header pattern | Field |
|---|---|
| `entity`, `company`, `business` | Entity name |
| `bank`, `institution`, `lender`, `name` | Bank name |
| `type`, `account_type`, `category` | Account type |
| `acct`, `account`, `number`, `#`, `last4` | Account number / last 4 |
| `bal`, `balance`, `amount`, `current_balance` | Current balance |
| `as_of`, `updated`, `date` | As-of date |

---

### Loans & CC Dues (`Loans` tab)

**Header-based detection** — `parseLoanSheetRows` matches column names by regex.

| Header pattern | Field |
|---|---|
| `entity`, `company` | Entity name |
| `lender`, `bank`, `institution`, `creditor`, `card`, `name` | Lender / card name |
| `purpose`, `facility`, `description`, `note` | Loan purpose / facility |
| `principal`, `original`, `initial`, `limit` | Credit limit / principal |
| `outstanding`, `balance`, `remaining` | Outstanding balance |
| `monthly`, `payment`, `installment`, `min_payment` | Monthly payment |
| `next`, `due`, `due_date` | Next payment date |
| `maturity`, `term`, `end_date` | Maturity date |

> **Note:** The sheet currently provides the monthly payment amount in the outstanding/balance column. The portal reads `monthly` from whichever of `mVal || outVal || prinVal` is non-zero first.

---

### Bank Statements Data (`Bank Statements Data` tab)

**Header-based detection** — `parseStatementSheetRows` scans the first 5 rows for a header row, then matches columns by regex.

| Header pattern | Field |
|---|---|
| `bank`, `institution`, `account_name` | Bank name |
| `entity`, `company`, `business` | Entity |
| `period`, `month`, `cycle` | Statement period |
| `occurrence`, `frequency` | How often (Monthly, etc.) |
| `statement_date`, `as_of`, `date` | Statement date |
| `request`, `requested` | Request date |
| `downloaded`, `status`, `done` | Download status (boolean) |
| `downloaded_at`, `time` | Timestamp of download |
| `remarks`, `notes`, `comments` | Notes |

---

### Meeting Notes (`Meeting Notes` tab)

The portal **reads and writes** notes here. Format is one note per row:

| Col | Field |
|---|---|
| A | Note ID (e.g. `note-1690000000000`) |
| B | Content / text |
| C | Status (`done` or blank) |
| D | Completed timestamp |
| E | Created timestamp |
| F | Author (user email) |
| G | Color label |
| H | Priority flag |

Code: `src/services/googleSheetsService.ts → appendNoteToSheet`, `writeSingleNote`, `clearNoteRow`
Tab name is hardcoded: `"Meeting Notes"` — renaming this tab breaks note sync.

---

### Metadata (`Metadata` tab)

The **MetaData** tool (gear icon → MetaData) reads and writes this tab.
Data starts at row 4. Three entity sections share the same rows — columns are partitioned:

| Section | Company col | Vendor col | Due Date col | Recurring col | Fixed/Est col | Debit/Manual col |
|---|---|---|---|---|---|---|
| **Ruby's** | B (2) | C (3) | E (5) | F (6) | G (7) | H (8) |
| **TI** | M (13) | N (14) | O (15) | P (16) | Q (17) | R (18) |
| **MSDx** | T (20) | U (21) | V (22) | W (23) | X (24) | Y (25) |

> Col D is blank for Ruby's (gap between vendor and due date). TI and MSDx are contiguous.

---

### Headley's (`Headley's` tab)

Raw data from Headley's invoices imported via the **Headley's Invoice** tool (gear icon).
The parser finds the header row dynamically by looking for a row that contains both `"charging bu"` and `"debit"` and `"credit"`.

| Col offset from header start | Field |
|---|---|
| 0 | Charging BU (TI, 4YR, etc.) |
| 1 | Date |
| 2 | Ref # |
| 3 | ST |
| 4 | Type (I = invoice, C = credit, P = payment) |
| 5 | Description |
| 6 | Debit |
| 7 | Credit |
| 8 | Amount |
| 9 | Billing date (cycle) |

---

## 4YR Payroll Sheet

**Spreadsheet ID:** `1SITtQDT3iFo5yIOBgjbERbqJjYJ8rk6drXwkLm3sAGE`

| Tab name | `#gid` | What the portal reads/writes |
|---|---|---|
| *(raw data tab)* | `1484569924` | Payroll raw entry data — read by `src/services/fourYrPayrollService.ts → getRawData` |

The payroll service uses extensive column maps defined in `fourYrPayrollService.ts`. Key points:
- Data starts at row 2 (row 1 = headers)
- Edits use row-index-based writes (no ID column — row position IS the key)
- **Do not insert or delete rows** without also updating the portal's cached row indices

The "Open Source Sheet" button for 4YR Payroll links directly to gid `1484569924`.

---

## Calendar Sheet

**Spreadsheet ID:** `1ChoHr7dsfai0Unl-Gk-HyPmgrpWOYu07gllY9PA8epo`

| Tab name | `#gid` | What the portal reads/writes |
|---|---|---|
| `Events` | `0` | Primary calendar events — read by `loadCalendarSheet`, written by `appendCalendarRow`, `updateCalendarRow`, `clearCalendarRow` |
| `Notes` | `1248704539` | Calendar notes (currently read-only from portal) |

The portal picks the first tab that has data from this candidate list:
```
["Events", "Sheet1", "Calendar", "Tasks", "Schedule"]
```
`Events` (gid 0) is the first hit and the one actually used.

### Events tab columns

| Col | Field |
|---|---|
| A | Title |
| B | Date (`YYYY-MM-DD`) |
| C | Start time |
| D | End time |
| E | Type / category |
| F | Description / notes |
| G | Done (`TRUE`/blank) |
| H | Linked entity |

Code: `src/services/googleCalendarService.ts`

---

## Data Flow Summary

```
User action in portal
       │
       ▼
FinanceContext (src/context/FinanceContext.tsx)
  • Updates React state immediately
  • Writes to localStorage for offline access
  • Calls googleSheetsService.ts functions for live sync
       │
       ▼
googleSheetsService.ts
  • fetchSheetValues()   → GET  /v4/spreadsheets/{id}/values/{range}
  • updateSheetValues()  → PUT  /v4/spreadsheets/{id}/values/{range}
  • appendSheetValues()  → POST /v4/spreadsheets/{id}/values/{range}:append
  • All three increment the daily API call counter (src/utils/apiCounter.ts)
       │
       ▼
Google Sheets API v4 (free tier, 60 req/min per user)
```

---

## Key Service Files

| File | Responsibility |
|---|---|
| `src/services/googleSheetsService.ts` | All Sheets API calls, all parsers, all column maps |
| `src/services/liveSheetsFetcher.ts` | Full dataset fetch used by the sync button |
| `src/services/googleCalendarService.ts` | Calendar sheet reads/writes + Google Calendar API |
| `src/services/fourYrPayrollService.ts` | 4YR Payroll-specific reads/writes |
| `src/services/googleAuth.ts` | Firebase Auth, Google OAuth, token refresh |
| `src/services/logsSheetService.ts` | Activity log sheet appends |
| `src/context/FinanceContext.tsx` | All state, all mutations, sync orchestration |
| `src/utils/apiCounter.ts` | Lightweight daily read/write call counter |

---

## Common Breakage Scenarios & Fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| AP bills load empty | Tab renamed from `Ruby's Bills` / `TI Bills` / `MSDx Bills` | Restore exact tab name OR update `AP_COL_MAPS.dataRange` in `googleSheetsService.ts` |
| AP amounts show wrong | Column added/removed in AP tab | Update the relevant entry in `AP_COL_MAPS` (0-indexed) |
| Notes don't sync | `Meeting Notes` tab renamed | Restore tab name OR update `tabName` default in `appendNoteToSheet`, `writeSingleNote`, `clearNoteRow` |
| Calendar empty | `Events` tab renamed or moved | Restore OR update `CAL_TAB_CANDIDATES` in `liveSheetsFetcher.ts` |
| Banks/Loans/AR wrong data | Column headers changed in sheet | Update to match the regex patterns in `parseBankSheetRows` / `parseLoanSheetRows` / `parseARSheetRows` |
| MetaData tool breaks | Columns shifted in `Metadata` tab | Update `META_READ` / `META_WRITE` objects in `src/components/modals/GearDropdown.tsx` |
| Headley's import fails | Header row moved or text changed | The parser looks for a row containing `"charging bu"`, `"debit"`, and `"credit"` — restore those strings |
| Portal takes 30-60 s to load | Render free tier woke from sleep | Normal behaviour — upgrade to Render Starter ($7/mo) to eliminate |

---

## Environment Variables (Render)

| Variable | Where used |
|---|---|
| `GEMINI_API_KEY` | AI features (if enabled) — set in Render dashboard, never hardcode |
| *(Firebase config)* | Hardcoded in `src/services/googleAuth.ts` — acceptable for public Firebase config |

---

*This document was generated from the live codebase on 2026-08-22. Keep it in sync whenever sheet structure changes.*
