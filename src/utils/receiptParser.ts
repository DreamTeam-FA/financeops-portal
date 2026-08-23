/**
 * receiptParser.ts
 * Full receipt/invoice parsing engine — vendor detection, date extraction,
 * amount extraction, document type classification.
 * Ported & improved from the Python receipt_renamer.py logic.
 */

export type DocType = "invoice" | "receipt" | "other";

/* ── Custom vendor store (localStorage) ────────────────────────────── */

const CUSTOM_VENDOR_KEY = "receipt_renamer_custom_vendors";

export interface CustomVendorEntry {
  pattern: string;
  name: string;
  learnedAt: string;
}

export function loadCustomVendors(): CustomVendorEntry[] {
  try {
    const raw = localStorage.getItem(CUSTOM_VENDOR_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomVendor(pattern: string, name: string): void {
  const existing = loadCustomVendors();
  const key = pattern.toLowerCase().trim();
  if (existing.some(e => e.pattern.toLowerCase().trim() === key)) return;
  existing.push({ pattern, name, learnedAt: new Date().toISOString() });
  localStorage.setItem(CUSTOM_VENDOR_KEY, JSON.stringify(existing));
}

export function deleteCustomVendor(pattern: string): void {
  const existing = loadCustomVendors().filter(e => e.pattern !== pattern);
  localStorage.setItem(CUSTOM_VENDOR_KEY, JSON.stringify(existing));
}

/* ── Built-in vendor patterns ─────────────────────────────────────── */

const BUILTIN_VENDORS: Array<[RegExp, string]> = [
  [/costco\s*wholesale/i, "Costco"],
  [/costco/i, "Costco"],
  [/sam'?s\s*club/i, "SamsClub"],
  [/walmart/i, "Walmart"],
  [/target/i, "Target"],
  [/home\s*depot/i, "HomeDepot"],
  [/lowe'?s/i, "Lowes"],
  [/kroger/i, "Kroger"],
  [/trader\s*joe'?s/i, "TraderJoes"],
  [/whole\s*foods/i, "WholeFoods"],
  [/aldi/i, "Aldi"],
  [/publix/i, "Publix"],
  [/safeway/i, "Safeway"],
  [/\bcvs\b/i, "CVS"],
  [/walgreens/i, "Walgreens"],
  [/rite\s*aid/i, "RiteAid"],
  [/starbucks/i, "Starbucks"],
  [/mcdonald'?s/i, "McDonalds"],
  [/chick[-\s]*fil[-\s]*a/i, "ChickFilA"],
  [/chipotle/i, "Chipotle"],
  [/panera/i, "Panera"],
  [/dunkin/i, "Dunkin"],
  [/taco\s*bell/i, "TacoBell"],
  [/pizza\s*hut/i, "PizzaHut"],
  [/domino'?s/i, "Dominos"],
  [/subway\b/i, "Subway"],
  [/wendy'?s/i, "Wendys"],
  [/burger\s*king/i, "BurgerKing"],
  [/\bshell\b/i, "Shell"],
  [/exxon/i, "Exxon"],
  [/chevron/i, "Chevron"],
  [/\bbp\b/i, "BP"],
  [/speedway/i, "Speedway"],
  [/circle\s*k/i, "CircleK"],
  [/race\s*trac/i, "RaceTrac"],
  [/\b7-?\s*eleven\b/i, "7Eleven"],
  [/wawa/i, "Wawa"],
  [/casey'?s/i, "CaseyS"],
  [/sunoco/i, "Sunoco"],
  [/buc-?ee'?s/i, "BuceeS"],
  [/amazon\.com|amazon\s+marketplace|amzn/i, "Amazon"],
  [/best\s*buy/i, "BestBuy"],
  [/office\s*depot/i, "OfficeDepot"],
  [/staples/i, "Staples"],
  [/fedex/i, "FedEx"],
  [/\bups\b/i, "UPS"],
  [/usps|postal\s*service/i, "USPS"],
  [/uber\s*eats/i, "UberEats"],
  [/\buber\b/i, "Uber"],
  [/lyft/i, "Lyft"],
  [/doordash/i, "DoorDash"],
  [/grubhub/i, "Grubhub"],
  [/instacart/i, "Instacart"],
  [/netflix/i, "Netflix"],
  [/spotify/i, "Spotify"],
  [/hulu/i, "Hulu"],
  [/verizon/i, "Verizon"],
  [/at&t|at\s*and\s*t/i, "ATT"],
  [/t-?mobile/i, "TMobile"],
  [/comcast|xfinity/i, "Comcast"],
  [/dollar\s*general/i, "DollarGeneral"],
  [/dollar\s*tree/i, "DollarTree"],
  [/five\s*below/i, "FiveBelow"],
  [/ross\s*dress/i, "Ross"],
  [/tj\s*maxx|t\.j\.?\s*maxx/i, "TJMaxx"],
  [/marshalls/i, "Marshalls"],
  [/hobby\s*lobby/i, "HobbyLobby"],
  [/michaels\s*store/i, "Michaels"],
  [/petco/i, "Petco"],
  [/petsmart/i, "PetSmart"],
  [/autozone/i, "AutoZone"],
  [/o'reilly\s*auto/i, "OReilly"],
  [/advance\s*auto/i, "AdvanceAuto"],
  [/dollar\s*general/i, "DollarGeneral"],
  [/fresh\s*market/i, "TheFreshMarket"],
  [/aldi/i, "Aldi"],
  [/sams\s*club/i, "SamsClub"],
  [/chick\s*fil/i, "ChickFilA"],
  [/tractor\s*supply/i, "TractorSupply"],
  [/republic\s*services/i, "RepublicServices"],
  [/headley\s*hardware/i, "HeadleyHardware"],
  [/butlers?\s*lp/i, "ButlerLP"],
  [/humphreys?\s*outdoor/i, "Humphreys"],
  [/old\s*national\s*bank/i, "OldNationalBank"],
  [/universal\s*studios/i, "UniversalStudios"],
  [/us\s*foods/i, "USFoods"],
  [/sysco/i, "Sysco"],
  [/gordon\s*food/i, "GordonFood"],
  [/uline/i, "Uline"],
  [/cintas/i, "Cintas"],
  [/grainger/i, "Grainger"],
  [/fastenal/i, "Fastenal"],
  [/costco\s*business/i, "CostcoBusiness"],
  [/sam'?s\s*wholesale/i, "SamsClub"],
  [/quickbooks/i, "QuickBooks"],
  [/intuit/i, "Intuit"],
  [/paychex/i, "Paychex"],
  [/adp\b/i, "ADP"],
];

/* ── Noise-word set (lines that look like vendor names but aren't) ── */

const HEADER_NOISE: Set<string> = new Set([
  "welcome", "welcometo", "hello", "greetings",
  "sale", "saletransaction", "transaction",
  "store", "shop", "register", "till",
  "receipt", "invoice", "statement", "summary",
  "thank", "thankyou", "thanks",
  "please", "visit", "call", "see", "note",
  "pump", "gallons", "price", "product", "amount",
  "subtotal", "total", "tax", "change", "cash",
  "approved", "auth", "visa", "mastercard", "amex",
  "service", "level", "self", "credit", "debit",
  "survey", "entertowin", "win",
]);

/* ── Vendor scorer ──────────────────────────────────────────────────── */

function cleanVendorCandidate(line: string): string {
  line = line.replace(/([A-Za-z])[''’]\s*s\b/g, "$1s");
  line = line.replace(/^[^A-Za-z]+/, "");
  line = line.replace(/\b(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|plc\.?)\b/gi, "");
  line = line.replace(/[_|}{\[\]@#%^&*~`]/g, " ");
  line = line.replace(/\s{2,}/g, " ").trim();
  const words = (line.match(/[A-Za-z][A-Za-z0-9&'.,-]*/g) || []).filter(w => w.length >= 2);
  if (!words.length) return "";
  const name = words.slice(0, 4).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
}

function scoreVendorLine(line: string, lineIndex: number): number {
  const s = line.trim();
  if (!s || s.length < 2) return -99;

  // Hard disqualifiers
  if (/\b(street|st\.\s|avenue|ave\.|blvd|boulevard|road|rd\.|drive|dr\.|lane|ln\.|way\b|pkwy|highway|hwy|p\.?o\.?\s*box|suite|ste\.?|floor)\b/i.test(s)) return -99;
  if (/,\s*[A-Z]{2}\s+\d{5}/.test(s)) return -99;
  if (/\b[A-Z]{2}\s+\d{5}\b/.test(s)) return -99;
  if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(s)) return -99;
  if (/(https?:\/\/|www\.|@)/.test(s)) return -99;
  if (/\b(date|time|dated?)\b[^A-Za-z]/i.test(s)) return -99;
  if (/\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b/.test(s)) return -99;
  if (/^[\d\s\-.,#*]+$/.test(s)) return -99;
  if (/(\*{4,}|#{4,}|x{4,})/i.test(s)) return -99;
  if (/\b(trans(action)?|tran\s*#|till|register|auth|approval|pump\s*#|gallons|invoice\s*#|entry:)\b/i.test(s)) return -99;
  if (/^(sale\s*transaction|total\s*sale|welcome\s*to|thank\s*you|please\s*come|visit\s*us)\b/i.test(s)) return -99;
  if (/^store\s*(#|no\.?|number)?\s*\d/i.test(s)) return -99;

  let score = 0;
  const digitCount = (s.match(/\d/g) || []).length;
  if (digitCount > 0) score -= Math.min(digitCount * 2, 8);
  if (s.length > 40) score -= 3;

  const words = s.split(/\s+/);
  const wordCount = words.length;
  const alphaRatio = (s.match(/[A-Za-z]/g) || []).length / Math.max(s.length, 1);

  if (s === s.toUpperCase() && /[A-Z]/.test(s) && wordCount >= 1 && wordCount <= 4 && alphaRatio > 0.5) {
    score += 6;
  } else if (s === s.replace(/\b\w/g, c => c.toUpperCase()) && wordCount >= 1 && wordCount <= 4) {
    score += 4;
  } else if (wordCount >= 1 && wordCount <= 4) {
    score += 2;
  }

  if (lineIndex < 5) score += 3;
  else if (lineIndex < 10) score += 1;

  if (alphaRatio > 0.8) score += 2;
  else if (alphaRatio > 0.6) score += 1;

  if (/\b(mart|market|store|shop|cafe|bakery|pharmacy|hardware|restaurant|grill|bar|clinic|dental|auto|motors|realty|services?|solutions?|systems?|group|associates?|partners?)\b/i.test(s)) {
    score += 2;
  }

  const cleaned = cleanVendorCandidate(s).toLowerCase();
  if (HEADER_NOISE.has(cleaned)) return -99;

  return score;
}

/* ── Vendor detection ───────────────────────────────────────────────── */

export function findVendor(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Custom vendors first (highest priority)
  for (const entry of loadCustomVendors()) {
    try {
      const re = new RegExp(entry.pattern, "i");
      if (re.test(lower)) return entry.name;
    } catch { /* skip malformed patterns */ }
  }

  // Built-in vendor list
  for (const [pattern, name] of BUILTIN_VENDORS) {
    if (pattern.test(lower)) return name;
  }

  const lines = text.split("\n");

  // Intro-phrase context ("WELCOME TO\nFOOD MART")
  const INTRO = /^(welcome\s*to|greetings?\s*from|thank\s*you\s*for\s*visiting|hello\s*from)\s*$/i;
  for (let i = 0; i < lines.length - 1; i++) {
    if (INTRO.test(lines[i].trim())) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const candidate = cleanVendorCandidate(lines[j].trim());
        if (candidate.length >= 3 && !HEADER_NOISE.has(candidate.toLowerCase())) return candidate;
      }
    }
  }

  // Scored scan of first 60 lines
  let bestScore = -99;
  let bestName: string | null = null;
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const sc = scoreVendorLine(lines[i], i);
    if (sc <= 0) continue;
    const candidate = cleanVendorCandidate(lines[i]);
    if (candidate.length < 2) continue;
    if (HEADER_NOISE.has(candidate.toLowerCase())) continue;
    if (sc > bestScore) { bestScore = sc; bestName = candidate; }
  }
  if (bestName) return bestName;

  // Fuzzy fallback: first 20 lines with high alpha ratio
  for (const line of lines.slice(0, 20)) {
    const s = line.trim();
    const alphaWords = (s.match(/[A-Za-z]{3,}/g) || []);
    if (!alphaWords.length) continue;
    if (/\b(date|total|amount|tax|page|receipt|invoice|thank|welcome|pump|gallons)\b/i.test(s)) continue;
    const alphaRatio = (s.match(/[A-Za-z]/g) || []).length / Math.max(s.length, 1);
    if (alphaRatio < 0.4) continue;
    const candidate = cleanVendorCandidate(s);
    if (candidate.length >= 3 && !HEADER_NOISE.has(candidate.toLowerCase())) return candidate;
  }

  return null;
}

/* ── Document type detection ────────────────────────────────────────── */

const DOC_SUBTYPES: Array<[RegExp, string]> = [
  [/statement\s*of\s*account/i, "StatementOfAccount"],
  [/account\s*statement/i, "AccountStatement"],
  [/credit\s*note/i, "CreditNote"],
  [/packing\s*slip/i, "PackingSlip"],
  [/delivery\s*note/i, "DeliveryNote"],
  [/quotation|\bquote\b/i, "Quote"],
  [/\bproposal\b/i, "Proposal"],
  [/purchase\s*order|\bp\.?o\b/i, "PurchaseOrder"],
];

export function detectDocType(text: string): DocType {
  const lower = text.toLowerCase();

  const STRONG_OTHER = [
    /\bstatement\s*of\s*account\b/i,
    /\baccount\s*statement\b/i,
    /\bstatement\s*date\b/i,
    /\bamount\s*owed\b/i,
    /\bcurrent\s*charges\b/i,
    /\bprevious\s*balance\b/i,
    /\bpayment\s*received\b/i,
    /\bnew\s*balance\b/i,
    /\bminimum\s*payment\b/i,
    /\bremittance\b/i,
    /\bquotation\b/i,
    /\bproposal\b/i,
    /\bpacking\s*slip\b/i,
    /\bdelivery\s*note\b/i,
    /\bcredit\s*note\b/i,
  ];
  if (STRONG_OTHER.some(r => r.test(lower))) return "other";

  const invScore = [
    /\binvoice\b/i, /\binv\s*#/i, /\bdue\s*date\b/i, /\bpayment\s*due\b/i,
    /\bamount\s*due\b/i, /\bbalance\s*due\b/i, /\bbill\s*to\b/i,
    /\bremit\s*to\b/i, /\bnet\s*\d+\b/i, /\bpurchase\s*order\b/i, /\bp\.?o\.?\s*#/i,
  ].filter(r => r.test(lower)).length;

  const recScore = [
    /\breceipt\b/i, /\bthank\s*you\s*for\s*(your\s*)?purchase\b/i,
    /\btransaction\s*(id|#|date)\b/i, /\bpayment\s*method\b/i,
    /\bcard\s*(type|ending|number)\b/i, /\bchange\s*due\b/i,
    /\bcash\b.*\bchange\b/i, /\bsubtotal\b.*\btax\b/i,
    /\bfuel\s*sale\b/i, /\bpump\s*#\b/i, /\bgallons\b/i,
    /\btotal\s*(sale|purchase)\b/i, /\bsale\s*transaction\b/i,
    /\bbalance\s*to\s*pay\b/i,
  ].filter(r => r.test(lower)).length;

  const othScore = [/\bstatement\b/i].filter(r => r.test(lower)).length;

  const best = Math.max(invScore, recScore, othScore);
  if (best === 0) return "receipt";
  if (othScore === best) return "other";
  if (invScore >= 2 && invScore >= recScore) return "invoice";
  return "receipt";
}

function detectDocSubtype(text: string): string {
  for (const [pattern, label] of DOC_SUBTYPES) {
    if (pattern.test(text)) return label;
  }
  return "";
}

/* ── Date extraction ────────────────────────────────────────────────── */

interface DatePattern { regex: RegExp; formats: string[] }

const DATE_PATTERNS: DatePattern[] = [
  { regex: /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,         formats: ["M/d/yy", "M/d/yyyy"] },
  { regex: /\b(\d{1,2}-\d{1,2}-\d{2,4})\b/g,            formats: ["M-d-yy", "M-d-yyyy"] },
  { regex: /\b(\d{4}-\d{1,2}-\d{1,2})\b/g,              formats: ["yyyy-M-d"] },
  { regex: /\b([A-Za-z]+ \d{1,2},? \d{4})\b/g,          formats: ["MMMM d yyyy", "MMM d yyyy"] },
  { regex: /\b(\d{1,2} [A-Za-z]+ \d{4})\b/g,            formats: ["d MMMM yyyy", "d MMM yyyy"] },
];

const MONTHS: Record<string, number> = {
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,
  jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
  january:1,february:2,march:3,april:4,june:6,
  july:7,august:8,september:9,october:10,november:11,december:12,
};

function parseDateStr(raw: string): Date | null {
  raw = raw.trim().replace(",", "");

  // yyyy-mm-dd
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(+m[1], +m[2]-1, +m[3]);
    if (d.getFullYear() >= 2000 && d.getFullYear() <= new Date().getFullYear() + 1) return d;
  }

  // mm/dd/yy or mm/dd/yyyy or mm-dd-yyyy
  m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let yr = +m[3];
    if (yr < 100) yr += yr < 50 ? 2000 : 1900;
    const d = new Date(yr, +m[1]-1, +m[2]);
    if (d.getFullYear() >= 2000 && d.getFullYear() <= new Date().getFullYear() + 1) return d;
  }

  // Month name variants: "January 15 2024", "15 January 2024"
  const monthWordM = raw.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (monthWordM) {
    const mo = MONTHS[monthWordM[1].toLowerCase()];
    if (mo) {
      const d = new Date(+monthWordM[3], mo-1, +monthWordM[2]);
      if (d.getFullYear() >= 2000) return d;
    }
  }
  const dayFirstM = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dayFirstM) {
    const mo = MONTHS[dayFirstM[2].toLowerCase()];
    if (mo) {
      const d = new Date(+dayFirstM[3], mo-1, +dayFirstM[1]);
      if (d.getFullYear() >= 2000) return d;
    }
  }

  return null;
}

function findLabeledDate(text: string, labels: string[]): Date | null {
  const DATE_CAPTURE = String.raw`(?<![A-Za-z])([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2} [A-Za-z]+ \d{4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-\d{1,2}-\d{2,4})`;
  for (const label of labels) {
    const re = new RegExp(`${label}[^\\n]{0,80}${DATE_CAPTURE}`, "im");
    const re2 = new RegExp(`${label}[^\\n]*\\n\\s*${DATE_CAPTURE}`, "im");
    for (const regex of [re, re2]) {
      const m = regex.exec(text);
      if (m) {
        const d = parseDateStr(m[1]);
        if (d) return d;
      }
    }
  }
  return null;
}

function findAnyDate(text: string): Date | null {
  for (const { regex } of DATE_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const d = parseDateStr(m[1]);
      if (d) return d;
    }
  }
  return null;
}

export function findDate(text: string, docType: DocType): Date | null {
  if (!text) return null;
  if (docType === "invoice") {
    return (
      findLabeledDate(text, [String.raw`due\s*date`, String.raw`payment\s*due`, String.raw`pay\s*by`, String.raw`due\s*on`]) ||
      findLabeledDate(text, [String.raw`payment\s*date`, String.raw`date\s*paid`]) ||
      findLabeledDate(text, [String.raw`invoice\s*date`, String.raw`issue\s*date`, String.raw`date\s*issued`, String.raw`bill\s*date`, String.raw`\bdate\b`]) ||
      findAnyDate(text)
    );
  }
  if (docType === "receipt") {
    return (
      findLabeledDate(text, [String.raw`transaction\s*date`, String.raw`date\s*of\s*transaction`, String.raw`purchase\s*date`]) ||
      findLabeledDate(text, [String.raw`\bdate\b`, String.raw`sale\s*date`, String.raw`order\s*date`]) ||
      findAnyDate(text)
    );
  }
  // other
  const labeled = findLabeledDate(text, [
    String.raw`^date\b`, String.raw`\bstatement\s*date\b`, String.raw`\bissue\s*date\b`,
    String.raw`\bdate\s*issued\b`, String.raw`\bsent\s*date\b`, String.raw`\bdate\b`,
  ]);
  if (labeled) return labeled;

  // Last plausible date (statements often list transactions early)
  let allDates: { pos: number; date: Date }[] = [];
  for (const { regex } of DATE_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const d = parseDateStr(m[1]);
      if (d) allDates.push({ pos: m.index, date: d });
    }
  }
  if (!allDates.length) return null;
  return allDates.reduce((best, cur) => cur.date > best.date ? cur : best).date;
}

/* ── Amount extraction ──────────────────────────────────────────────── */

function parseAmount(s: string): number | null {
  try {
    const cleaned = s.replace(/[^\d.,]/g, "");
    if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(cleaned)) return parseFloat(cleaned.replace(/,/g, ""));
    if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(cleaned)) return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    return parseFloat(cleaned.replace(",", "."));
  } catch { return null; }
}

function findLabeledAmount(text: string, labels: string[]): number | null {
  const AMT = String.raw`\$?\s*(\d{1,6}(?:[,.]\d{3})*(?:[,.]\d{2}))`;
  for (const label of labels) {
    const re  = new RegExp(`${label}[:\\s]{0,20}${AMT}`, "i");
    const re2 = new RegExp(`${label}[^\\n]*\\n\\s*${AMT}`, "i");
    for (const regex of [re, re2]) {
      const m = regex.exec(text);
      if (m) {
        const v = parseAmount(m[1]);
        if (v && v > 0) return v;
      }
    }
  }
  return null;
}

export function findTotal(text: string, docType: DocType): number | null {
  if (!text) return null;
  if (docType === "other") {
    return findLabeledAmount(text, [
      String.raw`amount\s*owed`, String.raw`total\s*amount\s*due`,
      String.raw`balance\s*owing`, String.raw`total\s*owing`,
      String.raw`please\s*pay`, String.raw`total\s*due`,
    ]);
  }
  if (docType === "invoice") {
    return (
      findLabeledAmount(text, [String.raw`amount\s*due`, String.raw`balance\s*due`, String.raw`total\s*due`, String.raw`payment\s*due`, String.raw`please\s*pay`]) ||
      findLabeledAmount(text, [String.raw`grand\s*total`, String.raw`total\s*amount`, String.raw`invoice\s*total`]) ||
      findLabeledAmount(text, [String.raw`\btotal\b`])
    );
  }

  // receipt
  const fuel = findLabeledAmount(text, [
    String.raw`fuel\s*sale`, String.raw`total\s*sale`,
    String.raw`total\s*purchase`, String.raw`balance\s*to\s*pay`,
  ]);
  if (fuel) return fuel;

  const subMatch = /subtotal[:\s]*\$?\s*([\d,]+\.\d{2})/i.exec(text);
  const taxMatch = /\btax\b[:\s]*\$?\s*([\d,]+\.\d{2})/i.exec(text);
  if (subMatch && taxMatch) {
    const searchFrom = Math.max(subMatch.index + subMatch[0].length, taxMatch.index + taxMatch[0].length);
    const after = text.slice(searchFrom);
    const totalM = /(?:grand\s*)?total[:\s]*\$?\s*([\d,]+\.\d{2})/i.exec(after);
    if (totalM) { const v = parseAmount(totalM[1]); if (v) return v; }
  }

  return (
    findLabeledAmount(text, [
      String.raw`grand\s*total`, String.raw`total\s*sale`, String.raw`total\s*amount`,
      String.raw`amount\s*charged`, String.raw`total\s*charge`,
    ]) ||
    findLabeledAmount(text, [String.raw`\btotal\b`]) ||
    (() => {
      const amounts = (text.match(/\$\s*([\d,]+\.\d{2})/g) || [])
        .map(s => parseAmount(s))
        .filter((v): v is number => v !== null);
      return amounts.length ? Math.max(...amounts) : null;
    })()
  );
}

/* ── Filename builder ───────────────────────────────────────────────── */

function padDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function buildFilename(
  vendor: string | null,
  date: Date | null,
  total: number | null,
  ext: string,
  docType: DocType,
  rawText: string,
): string {
  const v = vendor || "Unknown";
  const d = date ? padDate(date) : "Unknown-Date";
  if (docType === "other") {
    const sub = detectDocSubtype(rawText);
    const label = sub ? (vendor ? `${v}${sub}` : sub) : v;
    return total != null ? `${label}_${d}_$${total.toFixed(2)}${ext}` : `${label}_${d}${ext}`;
  }
  const t = total != null ? `$${total.toFixed(2)}` : "Unknown-Total";
  return `${v}_${d}_${t}${ext}`;
}

/* ── Text extraction helpers (called from page component) ──────────── */
export const SUPPORTED_EXTS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".heic", ".heif"]);

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}
