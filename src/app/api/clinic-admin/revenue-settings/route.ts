// ============================================================================
// M11.G3 (קומיט B) — GET + PUT /api/clinic-admin/revenue-settings
// ============================================================================
// מאפשר לבעל/ת קליניקה לקרוא ולעדכן את אחוזי פיצול ההכנסות:
// - `Organization.defaultRevenueSharePct` — ברירת מחדל לקליניקה (0-100 או null).
// - `User.revenueSharePct` — override פר-מטפל/ת (0-100 או null = יורש מהארגון).
//
// אבטחה / multi-tenancy:
// - אימות דרך `requireClinicOwner` (OWNER בלבד; אין ADMIN bypass).
// - בכל update: כל therapistId מאומת ש-(א) שייך לארגון של ה-OWNER ו-(ב) הוא
//   `clinicRole === "THERAPIST"`. אם לא — נדחה ולא משתנה דבר.
// - שדות `revenueSharePct` של מטפלים מארגונים אחרים לא נחשפים בשום מצב.
// - PUT הוא transactional — אם validation נכשל, אף שדה לא מתעדכן.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";

export const dynamic = "force-dynamic";

const pctSchema = z
  .number()
  .min(0, { message: "האחוז חייב להיות 0 ומעלה" })
  .max(100, { message: "האחוז חייב להיות 100 או פחות" })
  .nullable();

const putBodySchema = z.object({
  orgDefaultPct: pctSchema,
  therapists: z
    .array(
      z.object({
        id: z.string().min(1),
        revenueSharePct: pctSchema,
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
        select: { defaultRevenueSharePct: true },
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
          revenueSharePct: true,
        },
        orderBy: [{ name: "asc" }],
      }),
    ]);

    return NextResponse.json(
      JSON.parse(
        JSON.stringify({
          orgDefaultPct:
            org?.defaultRevenueSharePct === null ||
            org?.defaultRevenueSharePct === undefined
              ? null
              : Number(org.defaultRevenueSharePct),
          therapists: therapists.map((t) => ({
            id: t.id,
            name: t.name,
            email: t.email ?? "",
            revenueSharePct:
              t.revenueSharePct === null || t.revenueSharePct === undefined
                ? null
                : Number(t.revenueSharePct),
          })),
        })
      )
    );
  } catch (error) {
    logger.error("[clinic-admin/revenue-settings] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת הגדרות פיצול הכנסות" },
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
    const { orgDefaultPct, therapists } = parsed.data;

    // ⚠ אימות tenant: כל therapistId בבקשה חייב להיות THERAPIST באותו ארגון.
    // אם נשלח id ממקום אחר, נדחה את כל הבקשה בלי לעדכן דבר.
    const therapistIds = therapists.map((t) => t.id);
    if (therapistIds.length > 0) {
      const validRows = await prisma.user.findMany({
        where: {
          id: { in: therapistIds },
          organizationId,
          clinicRole: "THERAPIST",
        },
        select: { id: true },
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
    }

    // עדכון אטומי — ארגון + כל המטפלים בטרנזקציה אחת. אם ה-DB נופל באמצע,
    // אף שדה לא מתעדכן.
    // ⚠ defense-in-depth: `user.updateMany` עם `organizationId` ב-where
    // (לא רק `id`) — מונע TOCTOU במקרה הנדיר שבו `organizationId` של מטפל
    // השתנה בין הוולידציה לעדכון. אם השתנה — ה-updateMany מעדכן 0 שורות
    // בשקט; הוולידציה כבר חסמה את המקרה ה"גלובלי" של id מארגון אחר.
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: organizationId },
        data: { defaultRevenueSharePct: orgDefaultPct },
      }),
      ...therapists.map((t) =>
        prisma.user.updateMany({
          where: { id: t.id, organizationId, clinicRole: "THERAPIST" },
          data: { revenueSharePct: t.revenueSharePct },
        })
      ),
    ]);

    logger.info("[clinic-admin/revenue-settings] updated", {
      organizationId,
      ownerUserId: userId,
      therapistCount: therapists.length,
      orgDefaultPctChanged: orgDefaultPct !== null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[clinic-admin/revenue-settings] PUT error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בשמירת הגדרות פיצול הכנסות" },
      { status: 500 }
    );
  }
}
