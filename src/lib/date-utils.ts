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

  const testDate = new Date(`${datePart}T12:00:00Z`);
  const israelHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(testDate)
  );
  const offsetHours = israelHour - 12;
  const offsetStr = `+${String(offsetHours).padStart(2, "0")}:00`;

  return new Date(`${datePart}T${time}:00${offsetStr}`);
}
