// ============================================================================
// G5 — Caseload computation helper (pure, testable)
// ============================================================================
// קלט: רשימת מטפלים, פגישות בחלון של 4 שבועות אחורה + שבוע קדימה,
// וספירות מטופלים פעילים פר-מטפל. הפונקציה כולה דטרמיניסטית — מקבלת
// `now` אופציונלי לבדיקות. אין כאן שום קריאה ל-Prisma או ל-DB.
//
// שני קונספטים מרכזיים:
// 1. "השבוע" — מ-Sunday 00:00 IL עד Sunday 00:00 IL הבא (הגדרה ישראלית).
//    סטטוסים הנספרים כתופסים מקום ביומן: SCHEDULED + COMPLETED +
//    PENDING_CANCELLATION + PENDING_APPROVAL. CANCELLED/NO_SHOW לא נספרים.
// 2. "ממוצע 4 שבועות" — רק פגישות COMPLETED בארבעת השבועות שלפני השבוע
//    הנוכחי (חלון אחיד שמייצג עבודה ש"בוצעה בפועל").
//
// סיווג עומס: high אם שעות-שבוע או ממוצע 4-שבועות >= 30; low אם שתיהן
// <= 5 וגם מטופלים פעילים <= 3; אחרת normal.
// ============================================================================

import { getIsraelMidnight } from "@/lib/date-utils";

export type CaseloadSessionStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED"
  | "PENDING_CANCELLATION"
  | "PENDING_APPROVAL"
  | "NO_SHOW";

export interface CaseloadSessionInput {
  therapistId: string;
  startTime: Date | string;
  endTime: Date | string;
  status: CaseloadSessionStatus;
}

export interface CaseloadTherapistInput {
  id: string;
  name: string | null;
  email: string;
}

export interface CaseloadClientCount {
  therapistId: string;
  activeClients: number;
}

export type OverloadLevel = "low" | "normal" | "high";

export interface CaseloadComputeInput {
  therapists: CaseloadTherapistInput[];
  sessions: CaseloadSessionInput[];
  clientCounts: CaseloadClientCount[];
  now?: Date;
}

export interface TherapistCaseload {
  therapistId: string;
  name: string | null;
  email: string;
  activeClients: number;
  sessionsThisWeek: number;
  hoursThisWeek: number;
  completedLast4Weeks: number;
  avgWeeklyHours: number;
  overloadLevel: OverloadLevel;
}

export const HIGH_LOAD_WEEKLY_HOURS = 30;
export const LOW_LOAD_WEEKLY_HOURS = 5;
export const LOW_LOAD_MAX_ACTIVE_CLIENTS = 3;

const BOOKING_STATUSES: ReadonlySet<CaseloadSessionStatus> = new Set([
  "SCHEDULED",
  "COMPLETED",
  "PENDING_CANCELLATION",
  "PENDING_APPROVAL",
]);

const IL_TZ = "Asia/Jerusalem";

// Sunday=0, Monday=1, ..., Saturday=6 — לפי שעון ישראל.
function israelWeekday(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: IL_TZ,
    weekday: "long",
  }).format(d);
  const map: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  return map[name] ?? 0;
}

// תחילת השבוע הישראלי: יום ראשון 00:00 IL של השבוע בו נמצא `now`.
function startOfIsraelWeek(now: Date): Date {
  const midnight = getIsraelMidnight(now);
  const weekday = israelWeekday(midnight);
  return new Date(midnight.getTime() - weekday * 24 * 60 * 60 * 1000);
}

function durationHours(start: Date | string, end: Date | string): number {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  const diffMs = e.getTime() - s.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return diffMs / (1000 * 60 * 60);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function classifyOverload(args: {
  hoursThisWeek: number;
  avgWeeklyHours: number;
  activeClients: number;
}): OverloadLevel {
  const { hoursThisWeek, avgWeeklyHours, activeClients } = args;
  if (
    hoursThisWeek >= HIGH_LOAD_WEEKLY_HOURS ||
    avgWeeklyHours >= HIGH_LOAD_WEEKLY_HOURS
  ) {
    return "high";
  }
  if (
    hoursThisWeek <= LOW_LOAD_WEEKLY_HOURS &&
    avgWeeklyHours <= LOW_LOAD_WEEKLY_HOURS &&
    activeClients <= LOW_LOAD_MAX_ACTIVE_CLIENTS
  ) {
    return "low";
  }
  return "normal";
}

export function computeCaseload(input: CaseloadComputeInput): TherapistCaseload[] {
  const now = input.now ?? new Date();
  const weekStart = startOfIsraelWeek(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fourWeeksAgo = new Date(weekStart.getTime() - 4 * 7 * 24 * 60 * 60 * 1000);

  const clientCountByTherapist = new Map<string, number>();
  for (const c of input.clientCounts) {
    clientCountByTherapist.set(c.therapistId, c.activeClients);
  }

  return input.therapists.map((t) => {
    let sessionsThisWeek = 0;
    let hoursThisWeek = 0;
    let completedLast4Weeks = 0;
    let completedHoursLast4Weeks = 0;

    for (const s of input.sessions) {
      if (s.therapistId !== t.id) continue;

      const start =
        s.startTime instanceof Date ? s.startTime : new Date(s.startTime);
      if (Number.isNaN(start.getTime())) continue;

      const isInThisWeek = start >= weekStart && start < weekEnd;
      const isInLast4Weeks = start >= fourWeeksAgo && start < weekStart;
      if (!isInThisWeek && !isInLast4Weeks) continue;

      const duration = durationHours(s.startTime, s.endTime);

      if (isInThisWeek && BOOKING_STATUSES.has(s.status)) {
        sessionsThisWeek += 1;
        hoursThisWeek += duration;
      }

      if (isInLast4Weeks && s.status === "COMPLETED") {
        completedLast4Weeks += 1;
        completedHoursLast4Weeks += duration;
      }
    }

    const avgWeeklyHours = completedHoursLast4Weeks / 4;
    const activeClients = clientCountByTherapist.get(t.id) ?? 0;
    const overloadLevel = classifyOverload({
      hoursThisWeek,
      avgWeeklyHours,
      activeClients,
    });

    return {
      therapistId: t.id,
      name: t.name,
      email: t.email,
      activeClients,
      sessionsThisWeek,
      hoursThisWeek: round2(hoursThisWeek),
      completedLast4Weeks,
      avgWeeklyHours: round2(avgWeeklyHours),
      overloadLevel,
    };
  });
}

const OVERLOAD_RANK: Record<OverloadLevel, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

// מיון: עומס גבוה ראשון, אח"כ שעות-שבוע יורדות, אח"כ שם אלפבית עברי.
export function sortByOverload(
  items: TherapistCaseload[]
): TherapistCaseload[] {
  return [...items].sort((a, b) => {
    if (OVERLOAD_RANK[a.overloadLevel] !== OVERLOAD_RANK[b.overloadLevel]) {
      return OVERLOAD_RANK[b.overloadLevel] - OVERLOAD_RANK[a.overloadLevel];
    }
    if (b.hoursThisWeek !== a.hoursThisWeek) {
      return b.hoursThisWeek - a.hoursThisWeek;
    }
    const aKey = a.name ?? a.email;
    const bKey = b.name ?? b.email;
    return aKey.localeCompare(bKey, "he");
  });
}
