import prisma from "@/lib/prisma";

// payload של "OWNER מתחזה ל-target" — נשמר ב-JWT וב-Session.
// המבנה צריך להיות serializable (Object only, no Dates/Maps) כדי לעבור ב-JWT.
export interface JwtActingAs {
  userId: string;
  name: string;
  role: "USER" | "MANAGER" | "ADMIN" | "CLINIC_OWNER" | "CLINIC_SECRETARY";
  clinicRole: "OWNER" | "THERAPIST" | "SECRETARY" | null;
  organizationId: string | null;
  sessionId: string; // ImpersonationSession.id ב-DB
  startedAt: number; // epoch ms
}

/**
 * טוען impersonation session מ-DB ומאמת שהוא שייך ל-impersonatorId הנכון
 * וטרם נסגר. מחזיר null אם המידע לא תקין — ה-JWT callback מסיר אז את actingAs.
 *
 * זוהי הגנת ה-server הקריטית: ה-client לא יכול לזייף actingAs (לדוגמה role=ADMIN)
 * כי הפונקציה הזו טוענת את כל השדות מה-DB מה-source of truth.
 *
 * Validation chain:
 *   1. Session exists (id קיים ב-DB)
 *   2. Session active (endedAt IS NULL)
 *   3. Session belongs to expected impersonator (אסור לcross-OWNER)
 *   4. Target user not blocked (אם נחסם בזמן sessionים — ניתוק מיידי)
 *   5. Target's organization matches impersonator's organization (חוצה-קליניקה)
 *
 * fail-secure: כל error מ-DB → null. עדיף להחזיר null ולנתק impersonation
 * מאשר לאפשר actingAs לא מאומת.
 */
export async function loadVerifiedImpersonation(
  sessionId: string,
  expectedImpersonatorId: string
): Promise<JwtActingAs | null> {
  try {
    const dbSession = await prisma.impersonationSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        impersonatorId: true,
        targetUserId: true,
        targetNameSnapshot: true,
        organizationId: true,
        startedAt: true,
        endedAt: true,
        targetUser: {
          select: { role: true, clinicRole: true, isBlocked: true, organizationId: true },
        },
        impersonator: {
          select: { organizationId: true, isBlocked: true, role: true, clinicRole: true },
        },
      },
    });
    if (!dbSession) return null;
    if (dbSession.endedAt !== null) return null;
    if (dbSession.impersonatorId !== expectedImpersonatorId) return null;
    if (dbSession.targetUser.isBlocked) return null;
    if (dbSession.impersonator.isBlocked) return null;
    // H16: אם ה-impersonator איבד את תפקיד OWNER (שונה ע"י ADMIN לזמן
    // ההתחזות), חייבים לסיים את הסשן. רק בעלי קליניקה (role=CLINIC_OWNER
    // או clinicRole=OWNER) מותרים להתחזות.
    if (
      dbSession.impersonator.role !== "CLINIC_OWNER" &&
      dbSession.impersonator.role !== "ADMIN" &&
      dbSession.impersonator.clinicRole !== "OWNER"
    ) {
      return null;
    }
    // הגנה חוצה-קליניקה: אם ה-target הועבר לקליניקה אחרת אחרי שההתחזות
    // התחילה — ניתוק מיידי. impersonator.organizationId הוא ה-truth החי,
    // dbSession.organizationId הוא snapshot מזמן ה-start.
    if (
      dbSession.targetUser.organizationId !== dbSession.impersonator.organizationId
    ) {
      return null;
    }
    return {
      userId: dbSession.targetUserId,
      name: dbSession.targetNameSnapshot,
      role: dbSession.targetUser.role,
      clinicRole: dbSession.targetUser.clinicRole,
      organizationId: dbSession.organizationId,
      sessionId: dbSession.id,
      startedAt: dbSession.startedAt.getTime(),
    };
  } catch {
    // אם DB לא זמין — מתנהגים כמו אם הסשן לא תקף. fail-secure.
    return null;
  }
}
