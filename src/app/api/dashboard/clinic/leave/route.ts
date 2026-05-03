import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// 32 תווי URL-safe, ~190 ביטים של אנטרופיה — מספיק חזק לטוקן חד-פעמי.
function generateDecisionToken(): string {
  return nanoid(32);
}

// GET — מחזיר preview לפני יצירה: כמה מטופלים יקבלו הודעה,
// וכן departure פעיל קיים אם קיים (כדי לא לאפשר כפילות).
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        organizationId: true,
        clinicRole: true,
        organization: { select: { id: true, name: true } },
      },
    });

    if (!me || !me.organizationId) {
      return NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 400 }
      );
    }
    if (me.clinicRole !== "THERAPIST" && me.clinicRole !== "OWNER") {
      return NextResponse.json(
        { message: "רק מטפלים בקליניקה יכולים ליזום עזיבה" },
        { status: 403 }
      );
    }
    if (me.clinicRole === "OWNER") {
      return NextResponse.json(
        {
          message:
            "בעלים לא יכול/ה לעזוב באמצעות תהליך זה — נדרשת העברת בעלות תחילה דרך אדמין",
        },
        { status: 400 }
      );
    }

    const [activeClients, existingDeparture] = await Promise.all([
      prisma.client.count({
        where: { therapistId: userId, organizationId: me.organizationId },
      }),
      prisma.therapistDeparture.findFirst({
        where: { departingTherapistId: userId, status: "PENDING" },
        select: { id: true, decisionDeadline: true, initiatedAt: true },
      }),
    ]);

    return NextResponse.json({
      organization: me.organization,
      therapistName: me.name,
      activeClients,
      existingDeparture: existingDeparture
        ? JSON.parse(JSON.stringify(existingDeparture))
        : null,
    });
  } catch (error) {
    logger.error("[dashboard/clinic/leave] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת המידע" },
      { status: 500 }
    );
  }
}

// POST — יצירת תהליך עזיבה. body: { reason?, decisionDeadlineDays }
// יוצר TherapistDeparture + ClientDepartureChoice עם token לכל מטופל.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        organizationId: true,
        clinicRole: true,
      },
    });

    if (!me || !me.organizationId) {
      return NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 400 }
      );
    }
    if (me.clinicRole !== "THERAPIST") {
      return NextResponse.json(
        { message: "תהליך עזיבה זמין רק למטפלים (לא לבעלים/מזכירות)" },
        { status: 403 }
      );
    }

    const existing = await prisma.therapistDeparture.findFirst({
      where: { departingTherapistId: userId, status: "PENDING" },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { message: "כבר קיים תהליך עזיבה פעיל. ניתן לבטל אותו לפני יצירה חדשה." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { reason, decisionDeadlineDays } = body;

    const days = Number(decisionDeadlineDays);
    if (!Number.isInteger(days) || days < 7 || days > 90) {
      return NextResponse.json(
        { message: "תקופת ההחלטה חייבת להיות בין 7 ל-90 ימים" },
        { status: 400 }
      );
    }

    const decisionDeadline = new Date();
    decisionDeadline.setDate(decisionDeadline.getDate() + days);

    const clients = await prisma.client.findMany({
      where: { therapistId: userId, organizationId: me.organizationId },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });

    if (clients.length === 0) {
      return NextResponse.json(
        {
          message:
            "אין לך מטופלים פעילים בקליניקה. אם את/ה רוצה לעזוב — פנה/י לבעל/ת הקליניקה ישירות.",
        },
        { status: 400 }
      );
    }

    // יצירת departure + choices בטרנזקציה.
    // decisionToken מיוצר ידנית עם nanoid(32) — אין @default בסכמה.
    const departure = await withAudit(
      { kind: "user", session },
      {
        action: "initiate_therapist_departure",
        targetType: "TherapistDeparture",
        details: {
          organizationId: me.organizationId,
          clientCount: clients.length,
          decisionDeadline: decisionDeadline.toISOString(),
        },
      },
      async (tx) => {
        // re-check בתוך הטרנזקציה למניעת מרוץ של 2 בקשות מקבילות.
        const dupe = await tx.therapistDeparture.findFirst({
          where: { departingTherapistId: userId, status: "PENDING" },
          select: { id: true },
        });
        if (dupe) {
          throw new Error("DUPLICATE_PENDING_DEPARTURE");
        }
        const dep = await tx.therapistDeparture.create({
          data: {
            organizationId: me.organizationId!,
            departingTherapistId: userId,
            status: "PENDING",
            decisionDeadline,
            reason: reason?.trim() || null,
          },
        });

        // יצירת choice לכל מטופל עם decisionToken חד-פעמי (nanoid 32).
        const tokens: { clientId: string; token: string }[] = [];
        for (const c of clients) {
          const token = generateDecisionToken();
          await tx.clientDepartureChoice.create({
            data: {
              departureId: dep.id,
              clientId: c.id,
              choice: "UNDECIDED",
              decisionToken: token,
            },
          });
          tokens.push({ clientId: c.id, token });
        }

        return { dep, tokens };
      }
    );

    // TODO: שליחת email/SMS למטופלים תוטמע ב-cron נפרד או בהשלמה ידנית
    // של בעל הקליניקה. כרגע אנו רק יוצרים את הרשומות + מחזירים רשימת טוקנים
    // לשימוש ה-frontend (לא מציגים — למיטב סודיות).
    logger.info("[dashboard/clinic/leave] departure created", {
      userId,
      departureId: departure.dep.id,
      clientCount: clients.length,
    });

    return NextResponse.json({
      success: true,
      departureId: departure.dep.id,
      clientCount: clients.length,
      decisionDeadline: decisionDeadline.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_PENDING_DEPARTURE") {
      return NextResponse.json(
        { message: "כבר קיים תהליך עזיבה פעיל. ניתן לבטל אותו לפני יצירה חדשה." },
        { status: 409 }
      );
    }
    logger.error("[dashboard/clinic/leave] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה ביצירת תהליך העזיבה" },
      { status: 500 }
    );
  }
}

// DELETE — ביטול תהליך עזיבה פעיל (לפני המועד).
// רק המטפל/ת היוזמ/ת יכול/ה לבטל. ביטול ע"י אדמין נעשה דרך /admin/clinics.
export async function DELETE() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const departure = await prisma.therapistDeparture.findFirst({
      where: { departingTherapistId: userId, status: "PENDING" },
      select: { id: true, organizationId: true },
    });

    if (!departure) {
      return NextResponse.json(
        { message: "לא קיים תהליך עזיבה פעיל" },
        { status: 404 }
      );
    }

    await withAudit(
      { kind: "user", session },
      {
        action: "cancel_therapist_departure",
        targetType: "TherapistDeparture",
        targetId: departure.id,
        details: { organizationId: departure.organizationId },
      },
      async (tx) => {
        return tx.therapistDeparture.update({
          where: { id: departure.id },
          data: { status: "CANCELLED", completedAt: new Date() },
        });
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[dashboard/clinic/leave] DELETE error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בביטול תהליך העזיבה" },
      { status: 500 }
    );
  }
}
