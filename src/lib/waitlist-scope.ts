import {
  isClinicOwner,
  isSecretary,
  type ScopeUser,
} from "@/lib/scope";
import type { Prisma } from "@prisma/client";

/**
 * תיחום רשומות רשימת-ההמתנה שהמשתמש רשאי לראות/לנהל (בידוד tenant).
 *   - בעלים/מזכירה בקליניקה → כל הארגון.
 *   - מטפל רגיל בקליניקה → רשומות שהוא הבעלים שלהן או המטפל המועדף בהן.
 *   - מטפל עצמאי → רשומות שלו בלבד (ללא ארגון).
 */
export function waitlistScope(
  scopeUser: ScopeUser,
  userId: string,
): Prisma.WaitlistEntryWhereInput {
  if (
    scopeUser.organizationId &&
    (isClinicOwner(scopeUser) || isSecretary(scopeUser))
  ) {
    return { organizationId: scopeUser.organizationId };
  }
  if (scopeUser.organizationId) {
    return {
      organizationId: scopeUser.organizationId,
      OR: [{ therapistId: userId }, { preferredTherapistId: userId }],
    };
  }
  return { therapistId: userId, organizationId: null };
}
