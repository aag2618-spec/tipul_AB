import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import {
  isClinicOwner,
  isSecretary,
  loadScopeUser,
} from "@/lib/scope";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import {
  toIsraelDate,
  getIsraelDayOfWeek,
  applyShabbatLimits,
  generateTimeSlots,
  DATE_RE,
  TIME_RE,
} from "@/lib/booking-core";

export const dynamic = "force-dynamic";

// GET /api/sessions/available-slots
//
// "מצא משבצת פנויה" — כלי פנימי לזימון מהיר (למשל כשמטופל מתקשר). מחזיר את
// המשבצות הפנויות הקרובות עבור מטפל אחד או כל מטפלי הקליניקה, בהתחשב ב:
//   - שעות העבודה (BookingSettings.workingHours לפי יום, אם מוגדרות) או חלון
//     ברירת-מחדל שנשלח מהדיאלוג (dayStart/dayEnd).
//   - הפגישות הקיימות של המטפל (לא CANCELLED).
//   - חדר (אופציונלי): פוסל משבצות שבהן החדר תפוס ע"י *כל* מטפל בארגון.
//   - שבת/חג: applyShabbatLimits (שישי/מוצ"ש) + isShabbatOrYomTov (יו"ט מלא).
//
// קריאה-בלבד (אין יצירת פגישה כאן) — היצירה עוברת ב-POST /api/sessions שכבר
// אוכף canCreateClient. לכן כאן מספיק auth + scope: מטפל רגיל/עצמאי רואה רק
// את עצמו; בעלים/מזכירה רואים את כל מטפלי הארגון.

const querySchema = z.object({
  duration: z.coerce.number().int().min(5).max(480).default(50),
  // טווח תאריכים לחיפוש. ברירת מחדל: היום → +7 ימים. מקס' 30 יום (תקרת ביצועים).
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
  // חלון השעות לחיפוש (fallback למטפל בלי שעות-עבודה מוגדרות). ברירת מחדל 08:00–21:00.
  dayStart: z.string().regex(TIME_RE).default("08:00"),
  dayEnd: z.string().regex(TIME_RE).default("21:00"),
  therapistId: z.string().min(1).optional(),
  roomId: z.string().min(1).optional(),
});

// מקס' תוצאות שמוחזרות (כדי לא להחזיר מאות משבצות). אם נחתך — truncated=true.
const MAX_RESULTS = 30;
// מקס' ימים בטווח החיפוש (תקרת ביצועים: מטפלים × ימים).
const MAX_RANGE_DAYS = 30;

/** מוסיף N ימים ל-YYYY-MM-DD ומחזיר YYYY-MM-DD (ב-UTC — בטוח לאריתמטיקה של ימים). */
function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD של היום ב-timezone של ישראל. */
function todayIsraelStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(
    new Date(),
  );
}

type DayConfig = { start: string; end: string; enabled: boolean };

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { message: "פרמטרים לא תקינים", errors: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { duration, dayStart, dayEnd, therapistId, roomId } = parsed.data;

    const from = parsed.data.from ?? todayIsraelStr();
    const to = parsed.data.to ?? addDaysStr(from, 7);
    if (to < from) {
      return NextResponse.json(
        { message: "טווח התאריכים אינו תקין" },
        { status: 400 },
      );
    }

    const scopeUser = await loadScopeUser(userId);

    // ── פתרון רשימת המטפלים לבדיקה (scope) ──────────────────────────────
    // בעלים/מזכירה בארגון → כל המטפלים (OWNER+THERAPIST) בארגון.
    // מטפל רגיל בארגון / מטפל עצמאי → רק עצמו.
    const canSeeWholeClinic =
      !!scopeUser.organizationId &&
      (isClinicOwner(scopeUser) || isSecretary(scopeUser));

    let therapistFilter: { id: string; name: string | null }[];
    if (canSeeWholeClinic) {
      therapistFilter = await prisma.user.findMany({
        where: {
          organizationId: scopeUser.organizationId,
          isBlocked: false,
          clinicRole: { in: ["THERAPIST", "OWNER"] },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    } else {
      const self = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true },
      });
      therapistFilter = [{ id: userId, name: self?.name ?? null }];
    }

    // אם נבחר מטפל ספציפי — חייב להיות בתוך ה-scope (בידוד רב-ארגוני).
    if (therapistId) {
      therapistFilter = therapistFilter.filter((t) => t.id === therapistId);
      if (therapistFilter.length === 0) {
        return NextResponse.json(
          { message: "אין הרשאה לחפש משבצות עבור מטפל זה" },
          { status: 403 },
        );
      }
    }

    // אם נבחר חדר — חייב להיות שייך לאותו ארגון (בידוד).
    if (roomId) {
      if (!scopeUser.organizationId) {
        return NextResponse.json(
          { message: "חדרים זמינים רק בקליניקה" },
          { status: 400 },
        );
      }
      const room = await prisma.clinicRoom.findFirst({
        where: { id: roomId, organizationId: scopeUser.organizationId },
        select: { id: true },
      });
      if (!room) {
        return NextResponse.json(
          { message: "החדר לא נמצא" },
          { status: 404 },
        );
      }
    }

    // הגדרות זימון לכל המטפלים הרלוונטיים (שעות/הפסקות/חיץ). יכול להיעדר.
    const therapistIds = therapistFilter.map((t) => t.id);
    const settingsRows = await prisma.bookingSettings.findMany({
      where: { therapistId: { in: therapistIds } },
      select: {
        therapistId: true,
        workingHours: true,
        breaks: true,
        bufferBetween: true,
      },
    });
    const settingsByTherapist = new Map(
      settingsRows.map((s) => [s.therapistId, s]),
    );

    // פגישות תפוסות לפי חדר (אם נבחר) — פעם אחת לכל הטווח, על פני כל הארגון.
    // מתווסף ל-existingSessions של *כל* מטפל כדי לפסול משבצות שבהן החדר תפוס.
    const rangeStart = toIsraelDate(from, "00:00");
    const rangeEnd = new Date(toIsraelDate(to, "23:59").getTime() + 59999);
    let roomBusy: Array<{ startTime: Date; endTime: Date }> = [];
    if (roomId) {
      roomBusy = await prisma.therapySession.findMany({
        where: {
          roomId,
          // חצי-פתוח (כמו ב-calendar route) — תופס גם פגישה שחוצה את גבול הטווח.
          startTime: { lt: rangeEnd },
          endTime: { gt: rangeStart },
          status: { notIn: ["CANCELLED"] },
        },
        select: { startTime: true, endTime: true },
      });
    }

    // פגישות תפוסות לכל מטפל בטווח (שאילתה אחת, ואז קיבוץ בזיכרון).
    const busyRows = await prisma.therapySession.findMany({
      where: {
        therapistId: { in: therapistIds },
        // חצי-פתוח — תופס גם פגישה שמתחילה לפני הטווח ונמשכת לתוכו.
        startTime: { lt: rangeEnd },
        endTime: { gt: rangeStart },
        status: { notIn: ["CANCELLED"] },
      },
      select: { therapistId: true, startTime: true, endTime: true },
    });
    const busyByTherapist = new Map<
      string,
      Array<{ startTime: Date; endTime: Date }>
    >();
    for (const r of busyRows) {
      const list = busyByTherapist.get(r.therapistId) ?? [];
      list.push({ startTime: r.startTime, endTime: r.endTime });
      busyByTherapist.set(r.therapistId, list);
    }

    // ── יצירת המשבצות ───────────────────────────────────────────────────
    const results: Array<{
      therapistId: string;
      therapistName: string | null;
      date: string;
      time: string;
      startISO: string;
      endISO: string;
    }> = [];

    // מספר הימים בטווח (כולל קצוות), מוגבל לתקרה.
    const totalDays =
      Math.round(
        (toIsraelDate(to, "00:00").getTime() -
          toIsraelDate(from, "00:00").getTime()) /
          86400_000,
      ) + 1;
    const daysToScan = Math.min(totalDays, MAX_RANGE_DAYS);

    for (const therapist of therapistFilter) {
      const settings = settingsByTherapist.get(therapist.id);
      const workingHours = (settings?.workingHours ?? {}) as Record<
        string,
        DayConfig
      >;
      const hasConfiguredHours = Object.values(workingHours).some(
        (d) => d && d.enabled,
      );
      const buffer = settings?.bufferBetween ?? 0;
      const breaks =
        (settings?.breaks as Array<{ start: string; end: string }>) || [];
      const therapistBusy = busyByTherapist.get(therapist.id) ?? [];
      // existingSessions = הפגישות של המטפל + (אם נבחר חדר) הפגישות שתופסות אותו.
      const existingSessions = roomId
        ? [...therapistBusy, ...roomBusy]
        : therapistBusy;

      for (let i = 0; i < daysToScan; i++) {
        const dateStr = addDaysStr(from, i);
        const dayOfWeek = getIsraelDayOfWeek(dateStr);

        // קביעת חלון השעות ליום זה:
        //   - אם למטפל מוגדרות שעות-עבודה: להשתמש ביום הספציפי (אם enabled),
        //     אחרת לדלג על היום (יום חופש של המטפל).
        //   - אם אין שעות מוגדרות כלל: חלון ברירת-המחדל מהדיאלוג (ימים א'-ו').
        let start: string;
        let end: string;
        if (hasConfiguredHours) {
          const dayConfig = workingHours[dayOfWeek.toString()];
          if (!dayConfig || !dayConfig.enabled) continue;
          start = dayConfig.start;
          end = dayConfig.end;
        } else {
          if (dayOfWeek === 6) continue; // שבת — מדולגת בברירת המחדל.
          start = dayStart;
          end = dayEnd;
        }

        const limits = applyShabbatLimits(dayOfWeek, start, end);
        if (limits.start >= limits.end) continue;

        const daySlots = generateTimeSlots(
          dateStr,
          limits.start,
          limits.end,
          duration,
          buffer,
          0, // minAdvanceHours=0 — כלי פנימי: מציג גם משבצות להיום/מחר.
          existingSessions,
          breaks,
        );

        for (const time of daySlots) {
          const slotStart = toIsraelDate(dateStr, time);
          // סינון יום-טוב מלא (יו"ט שחל באמצע השבוע) ומוצ"ש לפני צאת השבת —
          // applyShabbatLimits מטפל רק בשישי/מוצ"ש לפי שעון קבוע; כאן הבדיקה
          // המדויקת לפי זמני הדלקת נרות/הבדלה.
          if (isShabbatOrYomTov(slotStart)) continue;
          const slotEnd = new Date(slotStart.getTime() + duration * 60_000);
          results.push({
            therapistId: therapist.id,
            therapistName: therapist.name,
            date: dateStr,
            time,
            startISO: slotStart.toISOString(),
            endISO: slotEnd.toISOString(),
          });
        }
      }
    }

    // מיון לפי זמן (ואז שם מטפל ליציבות) + חיתוך לתקרה.
    results.sort((a, b) => {
      if (a.startISO !== b.startISO) return a.startISO < b.startISO ? -1 : 1;
      return (a.therapistName ?? "").localeCompare(b.therapistName ?? "", "he");
    });
    const truncated = results.length > MAX_RESULTS;
    const slots = results.slice(0, MAX_RESULTS);

    return NextResponse.json({
      slots,
      truncated,
      multiTherapist: therapistFilter.length > 1,
    });
  } catch (error) {
    logger.error("available-slots error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בחיפוש משבצות פנויות" },
      { status: 500 },
    );
  }
}
