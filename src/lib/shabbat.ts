import "server-only";
import {
  HebrewCalendar,
  Location,
  CandleLightingEvent,
  HavdalahEvent,
  flags,
  type Event,
} from "@hebcal/core";
import { logger } from "./logger";

/**
 * חסימת שליחות בשבת ויום טוב.
 *
 * אסטרטגיה:
 *   - חלון החסימה = MIN(אילת, נהריה) לכניסה + MAX(אילת, נהריה) ליציאה.
 *     מכסה את כל תושבי ישראל בכל עונה (בחורף נהריה נכנסת ראשונה, בקיץ אילת).
 *   - חוסמים: שבת + יו״ט עצמו (flags.CHAG).
 *   - לא חוסמים: חוה״מ, יום העצמאות, פורים, חנוכה, תשעה באב, ל״ג בעומר, ט״ו בשבט.
 *   - Fail-closed: אם hebcal נופל → חוסמים הכל + התראה לאדמין.
 */

const EILAT = new Location(29.5577, 34.9519, true, "Asia/Jerusalem", "Eilat", "IL", 5);
const NAHARIYA = new Location(33.0059, 35.0949, true, "Asia/Jerusalem", "Nahariya", "IL", 5);

const HAVDALAH_MIN = parseInt(process.env.SHABBAT_HAVDALAH_MINUTES ?? "50", 10);

const FAIL_LOG_INTERVAL_MS = parseInt(
  process.env.SHABBAT_FAIL_LOG_INTERVAL_MS ?? "300000",
  10,
); // 5 דק׳
const ADMIN_NOTIFY_INTERVAL_MS = parseInt(
  process.env.SHABBAT_ADMIN_NOTIFY_INTERVAL_MS ?? "3600000",
  10,
); // 1 שעה

export type ShabbatReason = "SHABBAT" | "YOM_TOV";

export type BlockWindow = {
  start: Date;
  end: Date;
  reason: ShabbatReason;
  name: string;
};

// עטוף אירועים שיש להם eventTime (Candle/Havdalah) — עמיד לשדרוגי API של hebcal.
type TimedLike = Event & { eventTime: Date };

function isTimed(e: Event): e is TimedLike {
  if (e instanceof CandleLightingEvent || e instanceof HavdalahEvent) {
    return true;
  }
  // duck-typing fallback
  const maybe = (e as unknown as { eventTime?: unknown }).eventTime;
  return maybe instanceof Date;
}

function getEventsFor(location: Location, start: Date, end: Date): Event[] {
  return HebrewCalendar.calendar({
    start,
    end,
    location,
    candlelighting: true,
    havdalahMins: HAVDALAH_MIN,
    il: true,
    locale: "he",
  });
}

/** dayOfWeek (0=Sun..6=Sat) לפי timezone של ישראל — נכון גם סביב חצות UTC. */
function israelWeekday(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
  }).formatToParts(d);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const result = map[weekday];
  if (result === undefined) {
    // fail-loud: אם ה-ICU מחזיר משהו לא צפוי, נדע מיד ולא נפספס שישי בשקט.
    throw new Error(`[shabbat] unexpected weekday from Intl: "${weekday}"`);
  }
  return result;
}

/** תאריך יומי ב-Israel timezone (YYYY-MM-DD) — משמש ל-cache key וה-pairing בין ערים. */
function israelDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
}

type Pair = {
  candle: TimedLike;
  havdalah: TimedLike;
  reason: ShabbatReason;
  name: string;
};

/**
 * מזווג כל Candle lighting ל-Havdalah הבא.
 * מקדם cursor אחרי כל Havdalah כדי לא ליצור זוגות כפולים
 * (חשוב ל-יו״ט של יומיים עם 2 candle-ים ו-1 havdalah, כמו ר״ה).
 *
 * מחזיר זוג רק אם בין ה-candle ל-havdalah יש CHAG, או שה-candle חל בליל שישי.
 */
function pairCandleToHavdalah(events: Event[]): Pair[] {
  const pairs: Pair[] = [];
  let cursor = 0;

  while (cursor < events.length) {
    const candleIdx = events.findIndex(
      (x, j) => j >= cursor && x.getDesc() === "Candle lighting" && isTimed(x),
    );
    if (candleIdx < 0) break;

    const havIdx = events.findIndex(
      (x, j) => j > candleIdx && x.getDesc() === "Havdalah" && isTimed(x),
    );
    if (havIdx < 0) break;

    const candle = events[candleIdx] as TimedLike;
    const havdalah = events[havIdx] as TimedLike;
    const between = events.slice(candleIdx + 1, havIdx);

    const chagEvent = between.find((x) => (x.getFlags() & flags.CHAG) !== 0);
    const isFridayEve = israelWeekday(candle.eventTime) === 5;

    if (chagEvent || isFridayEve) {
      pairs.push({
        candle,
        havdalah,
        reason: chagEvent ? "YOM_TOV" : "SHABBAT",
        name: chagEvent ? (chagEvent.render("he") || "חג") : "שבת",
      });
    }

    cursor = havIdx + 1;
  }

  return pairs;
}

function computeWindows(now: Date): BlockWindow[] {
  // חלון 3 ימים אחורה + 21 קדימה — מבטיח שה-Havdalah של השבת/חג הבאים נכלל
  // (גם בתרחיש של ר"ה צמוד לשבת עם בלוק של 73 שעות).
  const start = new Date(now.getTime() - 3 * 86400_000);
  const end = new Date(now.getTime() + 21 * 86400_000);

  const eilatEvents = getEventsFor(EILAT, start, end);
  const nahariyaEvents = getEventsFor(NAHARIYA, start, end);

  const eilatPairs = pairCandleToHavdalah(eilatEvents);
  const nahariyaPairs = pairCandleToHavdalah(nahariyaEvents);

  const windows: BlockWindow[] = [];
  for (const ep of eilatPairs) {
    const eilatDayKey = israelDateKey(ep.candle.eventTime);
    const np = nahariyaPairs.find(
      (n) => israelDateKey(n.candle.eventTime) === eilatDayKey,
    );
    if (!np) continue;

    const startMs = Math.min(ep.candle.eventTime.getTime(), np.candle.eventTime.getTime());
    const endMs = Math.max(ep.havdalah.eventTime.getTime(), np.havdalah.eventTime.getTime());

    windows.push({
      start: new Date(startMs),
      end: new Date(endMs),
      reason: ep.reason,
      name: ep.name,
    });
  }

  return windows.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Sentinel window שחוסם הכל במקרה של כשל ב-hebcal (fail-closed). */
const FAIL_CLOSED_WINDOW: BlockWindow = {
  start: new Date(0),
  end: new Date(8640000000000000), // Date.max ב-ECMAScript
  reason: "SHABBAT",
  name: "FAIL_CLOSED",
};

// Module-level state — per-instance בסרברלס, מספיק ל-Render single-instance
let cachedWindows: { dateKey: string; windows: BlockWindow[] } | null = null;
let lastFailLogAt = 0;
let lastAdminNotifyAt = 0;

async function notifyAdminHebcalFailure(err: unknown): Promise<void> {
  if (!process.env.ADMIN_EMAIL) return;
  const now = Date.now();
  if (now - lastAdminNotifyAt < ADMIN_NOTIFY_INTERVAL_MS) return;
  lastAdminNotifyAt = now;

  try {
    // dynamic import כדי למנוע circular dependency עם resend.ts
    const { sendEmailRaw } = await import("./resend");
    const errMsg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? (err.stack ?? "") : "";
    await sendEmailRaw({
      to: process.env.ADMIN_EMAIL,
      subject: "שגיאה בחישוב זמני שבת — המערכת במצב fail-closed",
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #dc2626;">⚠️ שגיאה בחישוב זמני שבת</h2>
          <p>המערכת לא הצליחה לחשב את זמני השבת/יום טוב. המערכת עברה למצב
          <strong>fail-closed</strong> — שום הודעת מייל/SMS לא תישלח עד שהבעיה תיפתר.</p>
          <p><strong>שגיאה:</strong> <code>${errMsg}</code></p>
          <details><summary>Stack trace</summary><pre>${stack}</pre></details>
          <p>יש לבדוק את Render logs ולוודא שספריית <code>@hebcal/core</code> תקינה.</p>
        </div>
      `,
    });
  } catch {
    // אם גם ה-notify נכשל — שותק. אסור לשבור את ה-caller.
  }
}

function getWindows(now: Date): BlockWindow[] {
  const dateKey = israelDateKey(now);
  if (cachedWindows?.dateKey === dateKey) return cachedWindows.windows;

  try {
    const windows = computeWindows(now);
    logger.info("[shabbat] computed windows", {
      dateKey,
      count: windows.length,
      windows: windows.map((w) => ({
        start: w.start.toISOString(),
        end: w.end.toISOString(),
        reason: w.reason,
        name: w.name,
      })),
    });
    cachedWindows = { dateKey, windows };
    return windows;
  } catch (err) {
    const n = Date.now();
    if (n - lastFailLogAt > FAIL_LOG_INTERVAL_MS) {
      lastFailLogAt = n;
      logger.error("[shabbat] computeWindows FAILED — failing closed", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      notifyAdminHebcalFailure(err).catch(() => { /* silent */ });
    }
    return [FAIL_CLOSED_WINDOW];
  }
}

// ─── Public API ────────────────────────────────────────────────────

/** האם התאריך הנתון (ברירת מחדל: עכשיו) נמצא בשבת או יום טוב? */
export function isShabbatOrYomTov(date: Date = new Date()): boolean {
  return getWindows(date).some((w) => date >= w.start && date < w.end);
}

/**
 * מידע מלא על מצב שבת/חג — ל-UI.
 *
 * ב-FAIL_CLOSED: `isShabbat=true`, `isDegraded=true`, והשאר null.
 * ה-UI יכול להבחין לפי `isDegraded` ולהציג "המערכת בתחזוקה" במקום "שבת שלום".
 */
export function getShabbatStatus(date: Date = new Date()): {
  isShabbat: boolean;
  reason: ShabbatReason | null;
  endsAt: Date | null;
  name: string | null;
  isDegraded: boolean;
} {
  const current = getWindows(date).find((w) => date >= w.start && date < w.end);
  const isFailClosed = current?.name === "FAIL_CLOSED";
  return {
    isShabbat: !!current,
    reason: isFailClosed ? null : (current?.reason ?? null),
    endsAt: isFailClosed ? null : (current?.end ?? null),
    name: isFailClosed ? null : (current?.name ?? null),
    isDegraded: isFailClosed,
  };
}

/**
 * האם הייתה שבת/חג שהסתיימה בחלון ה-N שעות האחרונות? (ל-catch-up אחרי מוצ״ש).
 *
 * ב-FAIL_CLOSED: מחזיר `true` אוטומטית — כי אנחנו לא יודעים אם הייתה שבת,
 * וכדאי לקרון להפעיל catch-up רחב "ליתר ביטחון" (idempotent דרך SENT-log dedup).
 */
export function wasShabbatInLastHours(date: Date, hours: number = 72): boolean {
  const windows = getWindows(date);
  // fail-closed → כל חלון הוא FAIL_CLOSED_WINDOW — נחזיר true לטובת catch-up
  if (windows.length === 1 && windows[0].name === "FAIL_CLOSED") {
    return true;
  }
  const cutoff = new Date(date.getTime() - hours * 3600_000);
  return windows.some((w) => w.end > cutoff && w.end <= date);
}
