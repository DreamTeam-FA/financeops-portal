// Tracks Google Sheets API call counts per day, stored in localStorage.
// Each call to bumpApiCounter("read" | "write") increments the daily total.

const COUNTER_KEY = "financeops_api_counter";

interface DayCounter {
  date: string;   // "YYYY-MM-DD"
  reads: number;
  writes: number;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getApiCounter(): DayCounter {
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    if (raw) {
      const parsed: DayCounter = JSON.parse(raw);
      if (parsed.date === today()) return parsed;
    }
  } catch {}
  return { date: today(), reads: 0, writes: 0 };
}

export function bumpApiCounter(type: "read" | "write"): void {
  try {
    const c = getApiCounter();
    if (type === "read") c.reads += 1;
    else c.writes += 1;
    localStorage.setItem(COUNTER_KEY, JSON.stringify(c));
  } catch {}
}
