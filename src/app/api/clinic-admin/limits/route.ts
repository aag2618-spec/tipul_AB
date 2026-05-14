// ============================================================================
// GET /api/clinic-admin/limits
// ============================================================================
// מחזיר ל-UI את הניצולת הנוכחית של מקומות מטפלים+מזכירות + התקרה.
// משמש את דף הצוות (clinic-admin/members + invitations) להצגת
// "נוצלו 3 מתוך 5 מקומות למטפלים".
// ============================================================================

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { fetchAndCheckLimit } from "@/lib/clinic/limits";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const [therapists, secretaries] = await Promise.all([
      fetchAndCheckLimit(organizationId, "THERAPIST"),
      fetchAndCheckLimit(organizationId, "SECRETARY"),
    ]);

    return NextResponse.json({
      therapists: {
        current: therapists.current,
        max: therapists.max,
        remaining: therapists.remaining,
        atLimit: !therapists.allowed,
      },
      secretaries: {
        current: secretaries.current,
        max: secretaries.max,
        remaining: secretaries.remaining,
        atLimit: !secretaries.allowed,
      },
    });
  } catch (error) {
    logger.error("[clinic-admin/limits] GET error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת תקרות התוכנית" },
      { status: 500 }
    );
  }
}
