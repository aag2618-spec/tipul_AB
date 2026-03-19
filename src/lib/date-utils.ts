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
