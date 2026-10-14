// Calc's Help & Reference search — pure functions (no React) so they can be tested on their own.
// Two fixes over the first version:
//  1. words are matched by STEM + a few synonyms ("generated" also finds "creates", "when" finds "days before"),
//     so a question doesn't need to use the exact words the help text uses;
//  2. Calc is given the sentences that MATCH the question, not just the first N characters of the entry —
//     long entries (the Bank Statements FAQ) hid the answer past the cut, so Calc said it couldn't find it.

const STOP = new Set(["how", "the", "and", "for", "can", "does", "what", "where", "with", "this", "that", "are", "you", "into", "from", "when", "who", "why", "which", "did", "was", "will", "get", "got", "its", "our", "your", "have", "has", "there", "about", "tell", "show", "know", "need"]);

export const stem = (w: string): string => {
  const x = w.toLowerCase();
  if (x.length <= 4) return x;
  return x.replace(/(ations?|ation|ments?|ing|ed|es|s)$/, (m) => (x.length - m.length >= 4 ? "" : m));
};

// Groups of words that mean the same thing in this portal's help text
const SYNONYMS: string[][] = [
  ["generat", "creat", "automatic", "auto"],
  ["delet", "remov", "hidden", "hide"],
  ["due", "cut-off", "cutoff", "deadline"],
  ["download", "pull"],
  ["sign", "login", "log in", "connect", "reconnect"],
  ["remind", "pop-up", "popup", "alert"],
];

/** Query → the stems to look for (each with its synonyms). The question word "when" adds timing words. */
export function queryTerms(query: string): string[] {
  const raw = String(query || "").toLowerCase();
  const words = raw.replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const terms = new Set<string>();
  words.forEach((w) => {
    const s = stem(w);
    terms.add(s);
    SYNONYMS.forEach((g) => { if (g.some((x) => s.startsWith(x) || x.startsWith(s))) g.forEach((x) => terms.add(x)); });
  });
  if (/\bwhen\b/.test(raw)) ["days before", "every", "after", "on the", "schedul"].forEach((t) => terms.add(t));
  return [...terms];
}

export interface HelpDoc { kind: string; title: string; body: string }

/** Score docs: a term in the title is worth 3, in the body 1. Needs at least 3 to count. */
export function rankHelpDocs(docs: HelpDoc[], query: string, max = 3) {
  const terms = queryTerms(query);
  const core = terms.filter((t) => t.length >= 4); // ignore tiny stems for scoring
  return docs.map((d) => {
    const ht = d.title.toLowerCase(), hb = d.body.toLowerCase();
    let score = 0;
    core.forEach((w) => { if (ht.includes(w)) score += 3; if (hb.includes(w)) score += 1; });
    return { d, score };
  }).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, max);
}

/** The sentences of `body` that contain the most query terms, in their original order, up to `maxChars`. */
export function bestExcerpt(body: string, query: string, maxChars: number): string {
  if (body.length <= maxChars) return body;
  const terms = queryTerms(query).filter((t) => t.length >= 3);
  const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z0-9'"(])/);
  const scored = sentences.map((s, i) => {
    const l = s.toLowerCase();
    return { s, i, score: terms.reduce((n, t) => n + (l.includes(t) ? 1 : 0), 0) };
  });
  const picked: typeof scored = [];
  let used = 0;
  [...scored].sort((a, b) => b.score - a.score || a.i - b.i).forEach((x) => {
    if (x.score === 0 && picked.length > 0) return;
    if (used + x.s.length + 1 > maxChars && picked.length > 0) return;
    picked.push(x); used += x.s.length + 1;
  });
  const out = picked.sort((a, b) => a.i - b.i).map((x) => x.s).join(" ");
  return out.length > maxChars ? out.slice(0, maxChars) + "…" : out;
}
