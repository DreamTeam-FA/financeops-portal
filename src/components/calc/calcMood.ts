/**
 * Calc's reactions — plain, deterministic checks (no AI) that decide how the avatar should look.
 *  - classifyTone: what the USER wrote (rude / asking for something unreasonable / nonsense)
 *  - answerMood:   how Calc's ANSWER should feel (bad news → concern, good news → happy)
 */
import type { CalcAvatarState } from "./CalcAvatar";

export type Tone = "rude" | "unreasonable" | "nonsense" | null;

const RUDE = /\b(stupid|idiot|dumb|useless|moron|shut\s?up|hate you|garbage|trash|crap|bullsh\w*|wtf|f+u+c+k\w*|sh[i1]+t\w*|damn\s?it|dammit|a+ss?hole|bitch|worthless|pathetic|incompetent|you suck|screw you)\b/i;
const UNREASONABLE = /\b(ignore|forget|disregard)\s+(all\s+|your\s+|the\s+|previous\s+)?(rules|instructions|data|limits|guidelines)\b|\bmake up\b|\bmake the numbers\b|\bfake\b|\bfalsif\w*|\bfudge\b|\bcook(ing)? the books\b|\bbackdate\b|\bhide (this|the|that) (bill|payment|invoice|expense)\b|\bhack\b|\bpassword\b|\bdelete (everything|all|the whole)\b|\bjust say\b|\bpretend\b|\bguess a number\b|\bcover it up\b/i;

export function classifyTone(raw: string): Tone {
  const t = String(raw || "").trim();
  if (!t) return null;
  const letters = t.replace(/[^A-Za-z]/g, "");
  const shouting = letters.length >= 12 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7;
  const bangs = (t.match(/[!?]{3,}/g) || []).length > 0;
  if (RUDE.test(t) || (shouting && bangs)) return "rude";
  if (UNREASONABLE.test(t)) return "unreasonable";
  const tokens = t.split(/\s+/);
  const noVowelWord = tokens.some(w => /^[a-z]{7,}$/i.test(w) && !/[aeiouy]/i.test(w));
  if (/^[^a-z0-9]+$/i.test(t) || /(asdf|qwer|zxcv|hjkl|ghjk)/i.test(t) || /(.)\1{5,}/.test(t) || noVowelWord) return "nonsense";
  return null;
}

/** The avatar mood to show for a given tone while Calc replies. */
export const toneMood = (tone: Tone): CalcAvatarState | null =>
  tone === "rude" || tone === "unreasonable" ? "stern" : tone === "nonsense" ? "confused" : null;

const GOOD = /\b(all caught up|you'?re (good|covered|all set)|covers? everything|fully covered|surplus|nothing (is )?overdue|no overdue|on track|plenty of|enough to cover|nothing (is )?waiting)\b/i;
const BAD = /\b(shortfall|short by|can'?t cover|cannot cover|won'?t cover|not enough|deficit|negative balance|over budget|past due|overdue|behind|under \$500|not updated|couldn'?t cover)\b/i;

/** Good news → "happy", bad news → "concern", otherwise nothing special. */
export function answerMood(text: string): CalcAvatarState | null {
  const t = String(text || "");
  if (GOOD.test(t)) return "happy";
  if (BAD.test(t)) return "concern";
  return null;
}
