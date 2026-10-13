/**
 * Calc — number guard.
 * The AI is told to use only the lookup results, but a finance assistant must never show a dollar figure
 * that can't be traced back to the data. Every $ amount in the AI's wording must be:
 *   • a number present in the lookup results, or
 *   • the sum / difference of two numbers present in the results (e.g. "a $213,279.84 shortfall"), or
 *   • a whole-dollar rounding of one of those, or one of a few fixed thresholds Calc itself uses.
 * Anything else → the caller falls back to the plain lookup text.
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

export function verifyAmounts(text: string, results: any, extraText: string[] = []): { ok: boolean; bad: number[] } {
  const amounts = dollarAmountsIn(text);
  if (amounts.length === 0) return { ok: true, bad: [] };
  const set = new Set<number>();
  collectNumbers(results, set);
  // amounts already shown earlier in this conversation (e.g. "that's up from $X") are fine to repeat
  extraText.forEach(t => dollarAmountsIn(String(t)).forEach(n => set.add(Math.round(n * 100) / 100)));
  const base = Array.from(set).slice(0, 400);
  const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) < tol;
  const bad: number[] = [];
  for (const x of amounts) {
    if (THRESHOLDS.some(t => near(t, x))) continue;
    const whole = Number.isInteger(x);
    const tol = whole ? 0.51 : 0.011;
    let found = base.some(a => near(a, x, tol));
    if (!found) {
      outer: for (let i = 0; i < base.length; i++) {
        for (let j = i; j < base.length; j++) {
          if (near(base[i] + base[j], x, tol) || near(Math.abs(base[i] - base[j]), x, tol)) { found = true; break outer; }
        }
      }
    }
    if (!found) bad.push(x);
  }
  return { ok: bad.length === 0, bad };
}
