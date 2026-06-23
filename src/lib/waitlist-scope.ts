import {
  isClinicOwner,
  isSecretary,
  type ScopeOptions,
  type ScopeUser,
} from "@/lib/scope";
import type { Prisma } from "@prisma/client";

/**
 * תיחום רשומות רשימת-ההמתנה שהמשתמש רשאי לראות/לנהל (בידוד tenant).
 *   - בעלים/מזכירה בקליניקה → כל הארגון.
 *   - מטפל רגיל בקליניקה → רשומות שהוא הבעלים שלהן או המטפל המועדף בהן.
 *   - מטפל עצמאי → רשומות שלו בלבד (ללא ארגון).
 *
 * `personalOnly=true` (תצוגת "שלי" של בעלים-שהוא-מטפל, בדיוק כמו ביומן דרך
 * `shouldScopePersonal`) → מצמצם גם בעלים לרשומות שלו בלבד (אחראי או מטפל מועדף),
 * כאילו היה מטפל רגיל. ברירת המחדל (undefined/false) = ההתנהגות ההיסטורית, ללא
 * שינוי. זהו מסנן תצוגה בלבד — לא גבול הרשאה (מחיקה/עדכון/התאמה נשארים כלל-ארגוניים).
 */
export function waitlistScope(
  scopeUser: ScopeUser,
  userId: string,
  opts?: ScopeOptions,
): Prisma.WaitlistEntryWhereInput {
  // עצמאי (ללא ארגון) — תמיד הרשומות שלו בלבד.
  if (!scopeUser.organizationId) {
    return { therapistId: userId, organizationId: null };
  }
  // בעלים/מזכירה בלי תצוגה אישית → כל הארגון.
  if (
    !opts?.personalOnly &&
    (isClinicOwner(scopeUser) || isSecretary(scopeUser))
  ) {
    return { organizationId: scopeUser.organizationId };
  }
  // מטפל רגיל בקליניקה, או בעלים בתצוגת "שלי" → הרשומות שלו (אחראי או מטפל מועדף).
  return {
    organizationId: scopeUser.organizationId,
    OR: [{ therapistId: userId }, { preferredTherapistId: userId }],
  };
}
