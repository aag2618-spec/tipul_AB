// ============================================================================
// M11.G3 — Revenue share computation helper (pure, testable)
// ============================================================================
// קלט: רשימת מטפלים בקליניקה (כל אחד עם `revenueSharePct` אפשרי), ברירת
// מחדל ארגונית (`orgDefaultPct`), ורשימת תשלומים PAID של החודש המבוקש
// (כל תשלום כולל `therapistId` מתוך ה-session המקושר). הפונקציה כולה
// דטרמיניסטית — אין כאן שום קריאה ל-Prisma או ל-DB. אין תלות בזמן הנוכחי;
// גבולות החודש מועברים מבחוץ.
//
// שלוש שכבות fallback לאחוז שמטפל/ת מקבל/ת:
//   1. `User.revenueSharePct` (אם מוגדר במפורש)
//   2. `Organization.defaultRevenueSharePct` (אם מוגדר בארגון)
//   3. 100% — ברירת מחדל אחרונה (אין פיצול; שומר תאימות לאחור)
//
// סינון בטוח: אחוז שלילי או > 100 נחתך ל-[0, 100] כדי שלא יוצא חישוב
// בו clinicRevenue שלילי או therapistRevenue גבוה מ-totalPaid. ערכים NaN
// (יכולים להגיע מ-Prisma.Decimal פגום) נחשבים null.
// ============================================================================

export interface RevenueShareTherapistInput {
  id: string;
  name: string | null;
  email: string;
  revenueSharePct: number | null;
}

export interface RevenueSharePaymentInput {
  amount: number;
  paidAt: Date | string;
  therapistId: string;
}

export interface RevenueShareComputeInput {
  therapists: RevenueShareTherapistInput[];
  orgDefaultPct: number | null;
  payments: RevenueSharePaymentInput[];
  monthStartUtc: Date;
  monthEndUtc: Date;
}

export interface TherapistRevenueRow {
  therapistId: string;
  name: string | null;
  email: string;
  sharePct: number;
  paidSessions: number;
  totalPaidIls: number;
  therapistRevenueIls: number;
  clinicRevenueIls: number;
}

export interface RevenueReportSummary {
  therapists: TherapistRevenueRow[];
  totals: {
    paidSessions: number;
    totalPaidIls: number;
    therapistRevenueIls: number;
    clinicRevenueIls: number;
  };
}

const DEFAULT_SHARE_PCT = 100;

function sanitizePct(input: number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (!Number.isFinite(input)) return null;
  if (input < 0) return 0;
  if (input > 100) return 100;
  return input;
}

/**
 * מחזיר את האחוז שיש להחיל על מטפל/ת לפי שרשרת fallback:
 * user → org → 100. הקלט עשוי לכלול ערכי Prisma.Decimal שכבר הומרו
 * ל-number ע"י הקורא (חובה — `Number(value) || null` לפני הקריאה כאן).
 */
export function resolveRevenueSharePct(args: {
  userPct: number | null | undefined;
  orgDefaultPct: number | null | undefined;
}): number {
  const user = sanitizePct(args.userPct);
  if (user !== null) return user;
  const org = sanitizePct(args.orgDefaultPct);
  if (org !== null) return org;
  return DEFAULT_SHARE_PCT;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * מחשב דוח חודשי לפיצול הכנסות. מקבל רשימת מטפלים ותשלומים שכבר סוננו
 * ע"י הקורא (status=PAID, parentPaymentId נכון, EXCLUDE_BULK_UMBRELLA,
 * session.isNot null). הפונקציה רק מאגדת לפי מטפל ומחשבת אחוזים.
 *
 * תשלומים שמופנים ל-therapistId שלא קיים ברשימת המטפלים מסוננים החוצה
 * (מקרה edge של מטפל שעזב — לא אמור לקרות בפרקטיקה כי הקורא מסנן ל-org
 * המחובר, אבל defense-in-depth). תשלום עם paidAt מחוץ לחלון [monthStart,
 * monthEnd) גם הוא מסונן (אותו רציונל; הקורא כבר אמור לסנן).
 */
export function computeMonthlyRevenueReport(
  input: RevenueShareComputeInput
): RevenueReportSummary {
  const { therapists, orgDefaultPct, payments, monthStartUtc, monthEndUtc } =
    input;

  const therapistIds = new Set(therapists.map((t) => t.id));
  const aggByTherapist = new Map<
    string,
    { totalPaidIls: number; paidSessions: number }
  >();

  for (const p of payments) {
    if (!therapistIds.has(p.therapistId)) continue;
    const paidAt = p.paidAt instanceof Date ? p.paidAt : new Date(p.paidAt);
    if (!Number.isFinite(paidAt.getTime())) continue;
    if (paidAt < monthStartUtc || paidAt >= monthEndUtc) continue;
    const amount = Number.isFinite(p.amount) ? p.amount : 0;

    const prev = aggByTherapist.get(p.therapistId) ?? {
      totalPaidIls: 0,
      paidSessions: 0,
    };
    prev.totalPaidIls += amount;
    prev.paidSessions += 1;
    aggByTherapist.set(p.therapistId, prev);
  }

  const rows: TherapistRevenueRow[] = therapists.map((t) => {
    const agg = aggByTherapist.get(t.id) ?? {
      totalPaidIls: 0,
      paidSessions: 0,
    };
    const sharePct = resolveRevenueSharePct({
      userPct: t.revenueSharePct,
      orgDefaultPct,
    });
    const therapistRevenueIls = (agg.totalPaidIls * sharePct) / 100;
    const clinicRevenueIls = agg.totalPaidIls - therapistRevenueIls;
    return {
      therapistId: t.id,
      name: t.name,
      email: t.email,
      sharePct: round2(sharePct),
      paidSessions: agg.paidSessions,
      totalPaidIls: round2(agg.totalPaidIls),
      therapistRevenueIls: round2(therapistRevenueIls),
      clinicRevenueIls: round2(clinicRevenueIls),
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.paidSessions += r.paidSessions;
      acc.totalPaidIls += r.totalPaidIls;
      acc.therapistRevenueIls += r.therapistRevenueIls;
      acc.clinicRevenueIls += r.clinicRevenueIls;
      return acc;
    },
    {
      paidSessions: 0,
      totalPaidIls: 0,
      therapistRevenueIls: 0,
      clinicRevenueIls: 0,
    }
  );

  return {
    therapists: rows,
    totals: {
      paidSessions: totals.paidSessions,
      totalPaidIls: round2(totals.totalPaidIls),
      therapistRevenueIls: round2(totals.therapistRevenueIls),
      clinicRevenueIls: round2(totals.clinicRevenueIls),
    },
  };
}

/**
 * מיון השורות: סה"כ ששולם יורד (קל לזיהוי המטפלים בעלי ההכנסה הגבוהה),
 * אח"כ שם אלפבית עברי. לא מעוות את המערך המקורי.
 */
export function sortByRevenue(
  rows: TherapistRevenueRow[]
): TherapistRevenueRow[] {
  return [...rows].sort((a, b) => {
    if (b.totalPaidIls !== a.totalPaidIls) {
      return b.totalPaidIls - a.totalPaidIls;
    }
    const aKey = a.name ?? a.email;
    const bKey = b.name ?? b.email;
    return aKey.localeCompare(bKey, "he");
  });
}

/**
 * בונה את גבולות החודש (start inclusive, end exclusive) ב-UTC עבור חודש
 * המוגדר ב-Asia/Jerusalem. הקלט: שנה ארבע-ספרתית וחודש 1-12. נסמך על
 * `parseIsraelTime` של `@/lib/date-utils` שמטפל ב-DST. ההמשך נמצא ב-API
 * route; הוצא לכאן כדי לבדוק בנפרד בלי תלות ב-DOM/Prisma.
 *
 * דוגמה: monthRangeIsraelToUtc(2026, 5) →
 *   start = 2026-04-30T21:00Z (00:00 IL ב-1 במאי)
 *   end   = 2026-05-31T21:00Z (00:00 IL ב-1 ביוני)
 */
export function monthRangeIsraelToUtc(
  year: number,
  monthOneIndexed: number,
  parseIsraelTime: (input: string) => Date
): { monthStartUtc: Date; monthEndUtc: Date } {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthOneIndexed) ||
    monthOneIndexed < 1 ||
    monthOneIndexed > 12
  ) {
    throw new Error("monthRangeIsraelToUtc: invalid year/month");
  }
  const startStr = `${year}-${String(monthOneIndexed).padStart(2, "0")}-01T00:00`;
  const nextMonth = monthOneIndexed === 12 ? 1 : monthOneIndexed + 1;
  const nextYear = monthOneIndexed === 12 ? year + 1 : year;
  const endStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00`;
  return {
    monthStartUtc: parseIsraelTime(startStr),
    monthEndUtc: parseIsraelTime(endStr),
  };
}
