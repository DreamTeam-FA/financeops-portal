// Duplicate guard for the Headley's import: a statement line is "already in the sheet"
// when a row with the same invoice date, ref and amount exists anywhere in the raw table
// (whatever its due date), so re-importing a statement cannot add the same lines twice.

const num = (v: unknown): number =>
  typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]+/g, "")) || 0;

// "9/ 2/26", "09/02/2026", "9/2/26" → "9/2/26"
const normDate = (d: unknown): string => {
  const parts = String(d ?? "").replace(/\s+/g, "").split("/");
  if (parts.length !== 3) return String(d ?? "").trim();
  const [m, day, y] = parts.map(p => p.replace(/^0+(?=\d)/, ""));
  return `${m}/${day}/${y.length === 4 ? y.slice(2) : y}`;
};

export const headleysKey = (date: unknown, ref: unknown, amount: number): string =>
  `${normDate(date)}|${String(ref ?? "").trim().toUpperCase()}|${amount.toFixed(2)}`;

/** Keys of every data row already in the raw table (offsets: BU, Date, Ref, ST, Type, Desc, Debit, Credit, Amount, Due). */
export function existingHeadleysKeys(allRows: string[][], headerIdx: number, startCol: number): Set<string> {
  const keys = new Set<string>();
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const r = allRows[i];
    const date = r[startCol + 1], ref = r[startCol + 2];
    if (!date && !ref) continue;
    const debit = num(r[startCol + 6]), credit = num(r[startCol + 7]);
    const amount = num(r[startCol + 8]) || debit || -credit;
    keys.add(headleysKey(date, ref, amount));
  }
  return keys;
}

/** Splits parsed statement lines into new ones and ones already in the sheet. */
export function splitHeadleysDuplicates<T extends { date: string; ref: string; amount: number; debit: number; credit: number }>(
  rows: T[], allRows: string[][], headerIdx: number, startCol: number,
): { fresh: T[]; duplicates: T[] } {
  const have = existingHeadleysKeys(allRows, headerIdx, startCol);
  const fresh: T[] = [], duplicates: T[] = [];
  for (const r of rows) {
    const amount = r.amount || r.debit || -r.credit;
    (have.has(headleysKey(r.date, r.ref, amount)) ? duplicates : fresh).push(r);
  }
  return { fresh, duplicates };
}
