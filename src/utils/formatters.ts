/**
 * Global Formatters & Utilities for FinanceOps
 */

/**
 * Format currency strictly to 2 decimal places with commas (e.g., $945.38, $1,132,575.38)
 * Never rounds off cents!
 */
export const formatCurrency = (val?: number | string | null): string => {
  if (val === null || val === undefined || val === "") return "$0.00";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, "")) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

/**
 * Format timestamp / ISO string to user's local date and time
 */
export const formatDateTimeLocal = (dateInput?: string | Date | number | null): string => {
  if (!dateInput) return "N/A";
  try {
    let d: Date;
    if (typeof dateInput === "number") {
      d = new Date(dateInput);
    } else if (dateInput instanceof Date) {
      d = dateInput;
    } else {
      d = new Date(String(dateInput));
    }

    if (isNaN(d.getTime())) return String(dateInput);

    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return String(dateInput);
  }
};

export const formatTimestampLocal = formatDateTimeLocal;

/**
 * Format possessive name without double apostrophes (e.g. Norlan -> Norlan's, Norlan's -> Norlan's)
 */
export const formatPossessiveName = (rawName?: string | null): string => {
  if (!rawName) return "Member's";
  const clean = rawName.trim().replace(/['’]s(['’]s)?$/i, "");
  if (clean.endsWith("s") || clean.endsWith("S")) {
    return `${clean}'`;
  }
  return `${clean}'s`;
};

/**
 * Format clean member base name (e.g. Norlan's -> Norlan)
 */
export const formatCleanName = (rawName?: string | null): string => {
  if (!rawName) return "";
  return rawName.trim().replace(/['’]s(['’]s)?$/i, "");
};

/**
 * Format date to user's local date string (e.g. Jul 25, 2026)
 */
export const formatDateLocal = (dateInput?: string | Date | number | null): string => {
  if (!dateInput) return "N/A";
  try {
    let d: Date;
    if (typeof dateInput === "number") {
      d = new Date(dateInput);
    } else if (dateInput instanceof Date) {
      d = dateInput;
    } else {
      // If YYYY-MM-DD format, parse as local time
      const parts = String(dateInput).split("-");
      if (parts.length === 3 && parts[0].length === 4) {
        d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      } else {
        d = new Date(String(dateInput));
      }
    }

    if (isNaN(d.getTime())) return String(dateInput);

    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return String(dateInput);
  }
};

/**
 * Robustly parse due date string (YYYY-MM-DD, MM/DD/YYYY, or day ordinal like "1st", "15th", "25") into a Date object
 */
export const parseDueDateToDate = (dueDateStr?: string): Date | null => {
  if (!dueDateStr) return null;
  const str = String(dueDateStr).trim();
  if (!str) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // YYYY-MM-DD
  const ymdParts = str.split("-");
  if (ymdParts.length === 3 && ymdParts[0].length === 4) {
    const d = new Date(parseInt(ymdParts[0]), parseInt(ymdParts[1]) - 1, parseInt(ymdParts[2]));
    if (!isNaN(d.getTime())) return d;
  }

  // MM/DD/YYYY or MM/DD
  const slashParts = str.split("/");
  if (slashParts.length >= 2) {
    const m = parseInt(slashParts[0]) - 1;
    const d = parseInt(slashParts[1]);
    let y = slashParts.length === 3 ? parseInt(slashParts[2]) : today.getFullYear();
    if (y < 100) y += 2000;
    const dateObj = new Date(y, m, d);
    if (!isNaN(dateObj.getTime())) return dateObj;
  }

  // Ordinals or Day Numbers e.g. "1st", "15th", "25", "25th", "10"
  const dayMatch = str.match(/\d+/);
  if (dayMatch) {
    const dayNum = parseInt(dayMatch[0]);
    if (dayNum >= 1 && dayNum <= 31) {
      let targetYear = today.getFullYear();
      let targetMonth = today.getMonth();

      let targetDate = new Date(targetYear, targetMonth, dayNum);
      targetDate.setHours(0, 0, 0, 0);

      // If the day in current month has already passed, next payment due is next month
      if (targetDate < today) {
        targetMonth += 1;
        if (targetMonth > 11) {
          targetMonth = 0;
          targetYear += 1;
        }
        targetDate = new Date(targetYear, targetMonth, dayNum);
        targetDate.setHours(0, 0, 0, 0);
      }
      return targetDate;
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  return null;
};

/**
 * Calculate days remaining until a target date
 */
export const getDaysRemaining = (dueDateStr?: string): { days: number; text: string; isPastDue: boolean; isToday: boolean } => {
  if (!dueDateStr) return { days: 0, text: "No due date", isPastDue: false, isToday: false };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = parseDueDateToDate(dueDateStr);

  if (!target || isNaN(target.getTime())) {
    return { days: 0, text: dueDateStr, isPastDue: false, isToday: false };
  }

  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { days: 0, text: "Due today", isPastDue: false, isToday: true };
  } else if (diffDays < 0) {
    const pastDays = Math.abs(diffDays);
    return { days: diffDays, text: `${pastDays} day${pastDays > 1 ? "s" : ""} past due`, isPastDue: true, isToday: false };
  } else {
    return { days: diffDays, text: `${diffDays} day${diffDays > 1 ? "s" : ""} left`, isPastDue: false, isToday: false };
  }
};
