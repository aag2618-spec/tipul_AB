// ============================================================================
// GET + PUT /api/clinic-admin/therapist-payments
// ============================================================================
// מאפשר לבעל/ת קליניקה לקרוא ולעדכן את הסדרי סליקת המטופלים:
// - `User.clinicBillingMode` — לכל מטפל/ת: CLINIC (דרך מסוף הבעלים) או OWN
//   (דרך המסוף הפרטי של המטפל/ת — כסף לחשבונו/ה, קבלה על שמו/ה).
// - `Organization.therapistDebtTracking` — האם המערכת מציגה כמה כל מטפל/ת ב-OWN
//   צריך/ה להעביר לקליניקה (אוטומטי) או שזה מנוהל ידנית.
//
// ⚠ נוגע אך ורק לסליקת המטופלים (CardcomTenant=USER) — לא למנוי התוכנה
//   (billingPaidByClinic / CardcomTenant=ADMIN), שהוא צינור נפרד לחלוטין.
//
// אבטחה / multi-tenancy (זהה ל-/api/clinic-admin/revenue-settings):
// - אימות דרך `requireClinicOwner` (OWNER בלבד; אין ADMIN bypass).
// - בכל update: כל therapistId מאומת ש-(א) שייך לארגון של ה-OWNER ו-(ב) הוא
//   `clinicRole === "THERAPIST"`. אם לא — נדחה ולא משתנה דבר.
// - PUT הוא transactional — אם validation נכשל, אף שדה לא מתעדכן.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";
import { effectiveBillingMode } from "@/lib/clinic/billing-mode";

export const dynamic = "force-dynamic";

const putBodySchema = z.object({
  therapistDebtTracking: z.boolean(),
  therapists: z
    .array(
      z.object({
        id: z.string().min(1),
        clinicBillingMode: z.enum(["CLINIC", "OWN"]),
      })
    )
    .max(500, { message: "יותר מ-500 מטפלים בבקשה — לא צפוי" }),
});

export async function GET() {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const [org, therapists] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { therapistDebtTracking: true, defaultRevenueSharePct: true },
      }),
      prisma.user.findMany({
        where: {
          organizationId,
          clinicRole: "THERAPIST",
          isBlocked: false,
        },
        select: {
          id: true,
          name: true,
          email: true,
          clinicBillingMode: true,
          revenueSharePct: true,
          businessType: true,
        },
        orderBy: [{ name: "asc" }],
      }),
    ]);

    // סטטוס מסוף Cardcom פעיל לכל מטפל/ת (מחובר? sandbox/production?). שאילתה
    // אחת ל-BillingProvider במקום N+1.
    const therapistIds = therapists.map((t) => t.id);
    const cardcomRows = therapistIds.length
      ? await prisma.billingProvider.findMany({
          where: {
            userId: { in: therapistIds },
            provider: "CARDCOM",
            isActive: true,
          },
          select: { userId: true, settings: true },
        })
      : [];
    const cardcomByUser = new Map<
      string,
      { connected: boolean; mode: "sandbox" | "production" | null }
    >();
    for (const row of cardcomRows) {
      const settings = (row.settings ?? {}) as { mode?: string };
      const mode =
        settings.mode === "production"
          ? "production"
          : settings.mode === "sandbox"
          ? "sandbox"
          : null;
      cardcomByUser.set(row.userId, { connected: true, mode });
    }

    return NextResponse.json(
      JSON.parse(
        JSON.stringify({
          therapistDebtTracking: org?.therapistDebtTracking ?? false,
          orgDefaultPct:
            org?.defaultRevenueSharePct === null ||
            org?.defaultRevenueSharePct === undefined
              ? null
              : Number(org.defaultRevenueSharePct),
          therapists: therapists.map((t) => {
            const cc = cardcomByUser.get(t.id) ?? {
              connected: false,
              mode: null,
            };
            return {
              id: t.id,
              name: t.name,
              email: t.email ?? "",
              // מצב אפקטיבי: null (legacy) נגזר לפי קיום מסוף פרטי פעיל, כך
              // שהתצוגה תואמת את הניתוב בפועל של resolveCardcomBilling.
              clinicBillingMode: effectiveBillingMode(
                t.clinicBillingMode,
                cc.connected
              ),
              // סוג העסק — כדי שהמסך יבחין בין עוסק פטור (קבלה פנימית, לא צריך
              // מסוף) למטפל/ת שצריך/ה לחבר מסוף לאשראי. תצוגה בלבד.
              businessType: t.businessType,
              revenueSharePct:
                t.revenueSharePct === null || t.revenueSharePct === undefined
                  ? null
                  : Number(t.revenueSharePct),
              cardcom: cc,
            };
          }),
        })
      )
    );
  } catch (error) {
    logger.error("[clinic-admin/therapist-payments] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת הסדרי הסליקה" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId, userId } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: "גוף הבקשה אינו JSON תקין" },
        { status: 400 }
      );
    }

    const parsed = putBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "נתונים לא תקינים",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }
    const { therapistDebtTracking, therapists } = parsed.data;

    // ⚠ אימות tenant: כל therapistId בבקשה חייב להיות THERAPIST באותו ארגון.
    // אם נשלח id ממקום אחר — נדחה את כל הבקשה בלי לעדכן דבר.
    const therapistIds = therapists.map((t) => t.id);
    if (therapistIds.length > 0) {
      const validRows = await prisma.user.findMany({
        where: {
          id: { in: therapistIds },
          organizationId,
          clinicRole: "THERAPIST",
        },
        select: { id: true, isBlocked: true },
      });
      const validSet = new Set(validRows.map((r) => r.id));
      const invalidIds = therapistIds.filter((id) => !validSet.has(id));
      if (invalidIds.length > 0) {
        return NextResponse.json(
          {
            message: "אחד או יותר מהמטפלים אינם שייכים לקליניקה",
            invalidIds,
          },
          { status: 400 }
        );
      }

      // לא מעדכנים מצב למטפל/ת חסום/ה (ה-GET כבר מסנן חסומים מה-UI).
      const blockedIds = validRows
        .filter((r) => r.isBlocked)
        .map((r) => r.id);
      if (blockedIds.length > 0) {
        return NextResponse.json(
          {
            message: "לא ניתן לעדכן מצב סליקה למטפל/ת חסום/ה",
            blockedIds,
          },
          { status: 400 }
        );
      }
    }

    // עדכון אטומי — מתג הארגון + מצב כל מטפל/ת בטרנזקציה אחת.
    // defense-in-depth: ה-where כולל organizationId + clinicRole + isBlocked
    // כדי למנוע TOCTOU אם שיוך מטפל/ת השתנה בין הוולידציה לעדכון.
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: organizationId },
        data: { therapistDebtTracking },
      }),
      ...therapists.map((t) =>
        prisma.user.updateMany({
          where: {
            id: t.id,
            organizationId,
            clinicRole: "THERAPIST",
            isBlocked: false,
          },
          data: { clinicBillingMode: t.clinicBillingMode },
        })
      ),
    ]);

    logger.info("[clinic-admin/therapist-payments] updated", {
      organizationId,
      ownerUserId: userId,
      therapistCount: therapists.length,
      therapistDebtTracking,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[clinic-admin/therapist-payments] PUT error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בשמירת הסדרי הסליקה" },
      { status: 500 }
    );
  }
}
