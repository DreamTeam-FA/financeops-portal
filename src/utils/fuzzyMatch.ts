/**
 * fuzzyMatch.ts — Lightweight Levenshtein-based fuzzy string matching.
 * Used by the AP bill scanner and email invoice scanner to match scanned
 * vendor names to known vendors in the portal's bill history.
 */

/** Levenshtein edit distance (case-insensitive) */
export function levenshtein(a: string, b: string): number {
  const aa = a.toLowerCase(), bb = b.toLowerCase();
  const m = aa.length, n = bb.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = aa[i - 1] === bb[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/**
 * Returns the closest candidate from the list.
 * Falls back to `query` if no candidate is within the similarity threshold.
 * @param query  The raw/scanned string (e.g. OCR output)
 * @param candidates  Known strings to match against
 * @param threshold  Max edit distance as a fraction of the longer string (default 0.45)
 */
export function fuzzyBest(
  query: string,
  candidates: string[],
  threshold = 0.45
): string {
  if (!query || candidates.length === 0) return query;
  let best = "", bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(query, c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  const maxLen = Math.max(query.length, best.length);
  return bestDist <= Math.ceil(maxLen * threshold) ? best : query;
}
