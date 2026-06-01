// עזרי אזור-זמן ישראל — חישובים שמרניים שמטפלים ב-DST (שעון קיץ/חורף)
// בלי תלות בספריות חיצוניות. משמש בחישובי "היום/החודש" בצד השרת.

/**
 * היסט השעות של ישראל (Asia/Jerusalem) מ-UTC עבור תאריך נתון — 2 (חורף)
 * או 3 (קיץ). נקבע לפי Intl, כך שמעברי DST מטופלים אוטומטית.
 */
export function getIsraelOffsetHours(date: Date): number {
  const dateStr = date.toISOString().split("T")[0];
  const testDate = new Date(`${dateStr}T12:00:00Z`);
  const israelHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(testDate)
  );
  return israelHour - 12;
}

/**
 * גבולות "היום בישראל" כ-UTC instants: [start, end). שימושי לספירת פגישות
 * היום בשאילתת Prisma בלי לסנן post-query. מתעלם ממקרה-קצה נדיר של מעבר DST
 * בדיוק בחצות.
 */
export function getIsraelDayBoundsUtc(now: Date): { start: Date; end: Date } {
  const offsetH = getIsraelOffsetHours(now);
  const israelNow = new Date(now.getTime() + offsetH * 3600 * 1000);
  const y = israelNow.getUTCFullYear();
  const m = israelNow.getUTCMonth();
  const d = israelNow.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0) - offsetH * 3600 * 1000);
  const end = new Date(Date.UTC(y, m, d + 1, 0, 0, 0) - offsetH * 3600 * 1000);
  return { start, end };
}

/**
 * גבולות "החודש בישראל" כ-UTC instants: [start, end).
 */
export function getIsraelMonthBoundsUtc(now: Date): { start: Date; end: Date } {
  const offsetH = getIsraelOffsetHours(now);
  const israelNow = new Date(now.getTime() + offsetH * 3600 * 1000);
  const y = israelNow.getUTCFullYear();
  const m = israelNow.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0) - offsetH * 3600 * 1000);
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0) - offsetH * 3600 * 1000);
  return { start, end };
}
