import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser, isSecretary, secretaryCan } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/permissions — מחזיר את ההרשאות האפקטיביות של המשתמש הנוכחי.
 *
 * נדרש ל-Client Components שצריכים להחליט אם להציג כפתורי תשלום/חוב/תזכורות
 * (UI gating בלבד). השרת תמיד אוכף הרשאות בנפרד (defense-in-depth) —
 * הסתרת UI לא מחליפה את ה-gate ב-API.
 *
 * Phase 3: מוצג ל-client לפי תפקיד:
 * - non-secretary (OWNER/THERAPIST/independent): כל ה-booleans מוחזרים true
 *   (זו הסמנטיקה של secretaryCan — non-secretary אינו מוגבל ע"י המטריצה).
 * - SECRETARY: כל boolean משקף את secretaryPermissions שהוקצו לה ב-DB.
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);

    return NextResponse.json({
      isSecretary: isSecretary(scopeUser),
      clinicRole: scopeUser.clinicRole,
      permissions: {
        canViewPayments: secretaryCan(scopeUser, "canViewPayments"),
        canIssueReceipts: secretaryCan(scopeUser, "canIssueReceipts"),
        canSendReminders: secretaryCan(scopeUser, "canSendReminders"),
        canCreateClient: secretaryCan(scopeUser, "canCreateClient"),
        canViewDebts: secretaryCan(scopeUser, "canViewDebts"),
        canViewStats: secretaryCan(scopeUser, "canViewStats"),
        canViewConsentForms: secretaryCan(scopeUser, "canViewConsentForms"),
      },
    });
  } catch (error) {
    logger.error("[user/permissions] Failed to load permissions:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
