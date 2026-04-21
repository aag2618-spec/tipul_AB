const IL_TZ = "Asia/Jerusalem";

/**
 * Parse a date or datetime-local string as Israel time (Asia/Jerusalem).
 *
 * Uses Intl.DateTimeFormat with the IANA "Asia/Jerusalem" timezone,
 * which automatically handles Israel's DST transitions (currently
 * last Sunday in March → last Sunday in October). If Israel changes
 * its DST rules in the future, the IANA tzdata will be updated and
 * this function will remain correct after a Node.js / OS update.
 *
 * Accepts:
 *  - Date-only:      "2026-03-09"         → midnight Israel time
 *  - Datetime-local:  "2026-03-09T14:30"  → 14:30 Israel time
 *  - ISO string:      "2026-03-09T14:30:00Z" or with offset → passed through
 */
export function parseIsraelTime(input: string): Date {
  if (input.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(input)) {
    return new Date(input);
  }

  const [datePart, timePart] = input.split("T");
  const time = timePart || "00:00";
  const timeWithSeconds = time.split(":").length >= 3 ? time : `${time}:00`;
  const [targetHours, targetMinutes] = time.split(":").map(Number);
  const targetDay = parseInt(datePart.split("-")[2]);

  // Try both Israel offsets: +02:00 (winter/IST) and +03:00 (summer/IDT)
  // This correctly handles DST transition days where offset at midnight
  // differs from offset at noon
  for (const offsetHours of [2, 3]) {
    const offsetStr = `+${String(offsetHours).padStart(2, "0")}:00`;
    const candidate = new Date(`${datePart}T${timeWithSeconds}${offsetStr}`);

    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      minute: "numeric",
      day: "numeric",
      hour12: false,
    }).formatToParts(candidate);

    const h = parseInt(parts.find(p => p.type === "hour")?.value || "-1");
    const m = parseInt(parts.find(p => p.type === "minute")?.value || "-1");
    const d = parseInt(parts.find(p => p.type === "day")?.value || "-1");

    if (h === targetHours && m === targetMinutes && d === targetDay) {
      return candidate;
    }
  }

  // Fallback: use +02:00 (standard Israel time)
  return new Date(`${datePart}T${timeWithSeconds}+02:00`);
}

/**
 * ========================================================================
 * Israel-aware date helpers — added in Stage 1.0 of admin UI redesign
 * ========================================================================
 *
 * Why? The server runs on UTC (Render), but quota resets, receipt years,
 * and MonthlyUsage buckets MUST align to Asia/Jerusalem calendar month.
 *
 * All functions below extract date parts in Israel timezone via
 * Intl.DateTimeFormat, which correctly handles IST/IDT transitions.
 */

/**
 * Returns the month (1-12) in Israel timezone.
 * Example: `new Date("2025-12-31T23:30:00Z")` → 1 (January in Israel at 02:30)
 */
export function getIsraelMonth(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IL_TZ,
    month: "numeric",
  }).formatToParts(date);
  const monthPart = parts.find((p) => p.type === "month");
  if (!monthPart) throw new Error("getIsraelMonth: failed to extract month");
  return parseInt(monthPart.value, 10);
}

/**
 * Returns the year in Israel timezone.
 * Example: `new Date("2025-12-31T23:30:00Z")` → 2026
 */
export function getIsraelYear(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IL_TZ,
    year: "numeric",
  }).formatToParts(date);
  const yearPart = parts.find((p) => p.type === "year");
  if (!yearPart) throw new Error("getIsraelYear: failed to extract year");
  return parseInt(yearPart.value, 10);
}

/**
 * Returns true if both dates fall within the same (month, year) in Israel timezone.
 * Used for SMS quota monthly reset detection.
 */
export function isSameIsraelMonth(a: Date, b: Date): boolean {
  return (
    getIsraelMonth(a) === getIsraelMonth(b) && getIsraelYear(a) === getIsraelYear(b)
  );
}

/**
 * Returns true if the current time (default) is in a different Israel calendar
 * month than `prevDate`. Convenience helper for "did a new month start?".
 */
export function isNewIsraelMonthSince(prevDate: Date, now: Date = new Date()): boolean {
  return !isSameIsraelMonth(prevDate, now);
}

/**
 * Returns the quarter (1-4) in Israel timezone.
 * Example: January-March → 1, April-June → 2, etc.
 */
export function getIsraelQuarter(date: Date = new Date()): number {
  return Math.floor((getIsraelMonth(date) - 1) / 3) + 1;
}

/**
 * Returns a Date object representing 00:00 (midnight) of the given date's
 * calendar day in Israel timezone. DST-safe — uses `parseIsraelTime` which
 * correctly picks between +02:00 (IST) and +03:00 (IDT).
 *
 * Useful for comparing days without letting the wall clock hour interfere.
 * Example: `new Date("2026-04-21T12:00:00Z")` → midnight of 2026-04-21 Israel.
 */
export function getIsraelMidnight(date: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("getIsraelMidnight: failed to extract date parts");
  }

  // parseIsraelTime handles DST correctly (tries +02:00 and +03:00)
  return parseIsraelTime(`${year}-${month}-${day}`);
}

/**
 * Returns { month, year } in Israel timezone — the canonical key for
 * `MonthlyUsage` records. MUST be used by all code that reads/writes
 * MonthlyUsage, otherwise two buckets will be created during the 2-3 hour
 * transition window at end of each month.
 */
export function getCurrentUsageKey(date: Date = new Date()): {
  month: number;
  year: number;
} {
  return { month: getIsraelMonth(date), year: getIsraelYear(date) };
}

/**
 * Format a number using Hebrew locale (he-IL) with thousands separators.
 * Example: `formatHebrewNumber(1234)` → "1,234"
 */
export function formatHebrewNumber(n: number): string {
  return n.toLocaleString("he-IL");
}

/**
 * Returns true if `d` is not a valid Date (null, undefined, or Invalid Date).
 * Guards against silently processing NaN-based dates from broken records.
 */
export function isInvalidDate(d: unknown): boolean {
  if (!(d instanceof Date)) return true;
  return Number.isNaN(d.getTime());
}
