/**
 * Calc — number guard.
 * The AI may now reason over the data (averages, shares, shortfalls, projections), but a finance assistant must
 * never show a figure that can't be traced back to the data. Every $ amount and every percentage in the AI's
 * wording must be:
 *   • a number present in the lookup results (or shown earlier in this conversation), or
 *   • simple arithmetic on them: a sum of up to 3 numbers, a difference, a ratio (average = total ÷ count),
 *     or a number × / ÷ a small whole number (e.g. a weekly figure × 4), or
 *   • a whole-dollar rounding of one of those, or one of a few fixed thresholds Calc itself uses.
 * Percentages must equal part ÷ whole of two numbers in the data (or be a share already in the data).
 * Anything else → the caller asks the AI to fix it once, then falls back to the plain lookup text.
 */

const THRESHOLDS = [500, 1000];

function collectNumbers(v: any, out: Set<number>, depth = 0) {
  if (depth > 8 || v === null || v === undefined) return;
  if (typeof v === "number" && Number.isFinite(v)) { out.add(Math.round(Math.abs(v) * 100) / 100); return; }
  if (Array.isArray(v)) { v.slice(0, 200).forEach(x => collectNumbers(x, out, depth + 1)); return; }
  if (typeof v === "object") Object.values(v).forEach(x => collectNumbers(x, out, depth + 1));
}

export function dollarAmountsIn(text: string): number[] {
  const out: number[] = [];
  const re = /\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function percentsIn(text: string): number[] {
  const out: number[] = [];
  const re = /(\d+(?:\.\d+)?)\s?%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { const n = Number(m[1]); if (Number.isFinite(n)) out.push(n); }
  return out;
}

export function verifyAmounts(text: string, results: any, extraText: string[] = []): { ok: boolean; bad: number[] } {
  const amounts = dollarAmountsIn(text);
  const percents = percentsIn(text);
  if (amounts.length === 0 && percents.length === 0) return { ok: true, bad: [] };
  const set = new Set<number>();
  collectNumbers(results, set);
  // amounts already shown earlier in this conversation (e.g. "that's up from $X") are fine to repeat
  extraText.forEach(t => dollarAmountsIn(String(t)).forEach(n => set.add(Math.round(n * 100) / 100)));
  const base = Array.from(set).filter(n => n > 0).slice(0, 400);
  const pool = [...base].sort((a, b) => b - a).slice(0, 90); // for 3-number sums
  const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) < tol;
  const bad: number[] = [];

  for (const x of amounts) {
    if (THRESHOLDS.some(t => near(t, x))) continue;
    const tol = Number.isInteger(x) ? 0.51 : 0.011;
    let found = base.some(a => near(a, x, tol));
    // pairs: sum, difference, ratio (average), small multiples
    if (!found) {
      outer: for (let i = 0; i < base.length; i++) {
        const a = base[i];
        for (let k = 2; k <= 12; k++) if (near(a * k, x, tol) || near(a / k, x, tol)) { found = true; break outer; }
        for (let j = i; j < base.length; j++) {
          const b = base[j];
          if (near(a + b, x, tol) || near(Math.abs(a - b), x, tol) || near(a / b, x, tol) || near(b / a, x, tol)) { found = true; break outer; }
        }
      }
    }
    // sums of three
    if (!found) {
      outer3: for (let i = 0; i < pool.length; i++) for (let j = i; j < pool.length; j++) {
        const ij = pool[i] + pool[j];
        for (let k = j; k < pool.length; k++) {
          if (near(ij + pool[k], x, tol)) { found = true; break outer3; }
          if (near(Math.abs(ij - pool[k]), x, tol)) { found = true; break outer3; }
        }
      }
    }
    if (!found) bad.push(x);
  }

  // percentages: a share already in the data, or part ÷ whole of two numbers in the data
  for (const p of percents) {
    if ([0, 50, 100].includes(p)) continue;
    const tol = Number.isInteger(p) ? 0.51 : 0.051;
    let found = base.some(a => near(a, p, tol));
    if (!found) {
      outerP: for (let i = 0; i < base.length; i++) for (let j = 0; j < base.length; j++) {
        if (i !== j && near((base[i] / base[j]) * 100, p, tol)) { found = true; break outerP; }
      }
    }
    if (!found) bad.push(p);
  }
  return { ok: bad.length === 0, bad };
}
