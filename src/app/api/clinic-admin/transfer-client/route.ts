import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST — העברת מטופל בין מטפלים באותה קליניקה.
// body: { clientId, toTherapistId, reason? }
//
// תיעוד: יוצר ClientTransferLog עם snapshot של שמות (לעמידות ל-deletes
// עתידיים), מעדכן Client.therapistId, ואת TherapySession הקשורות
// (organizationId נשמר; therapistId לא מוחלף — שומרים את ההיסטוריה).
//
// במכוון: לא מעבירים TherapySession הקיימים — הסטוריה משוייכת למטפל המקורי.
// רק מטופל עתידי + פגישות חדשות יזרמו למטפל היעד.
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
        role: true,
        clinicRole: true,
        organizationId: true,
      },
    });
    if (!me) {
      return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 });
    }
    const isOwner = me.role === "CLINIC_OWNER" || me.clinicRole === "OWNER";
    if (!isOwner && me.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }
    if (!me.organizationId) {
      return NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { clientId, toTherapistId, reason } = body;

    if (!clientId || !toTherapistId) {
      return NextResponse.json(
        { message: "נדרש לבחור מטופל ויעד" },
        { status: 400 }
      );
    }

    // ולידציות
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        therapistId: true,
        organizationId: true,
        therapist: { select: { id: true, name: true } },
      },
    });
    if (!client) {
      return NextResponse.json({ message: "המטופל לא נמצא" }, { status: 400 });
    }
    if (client.organizationId !== me.organizationId) {
      return NextResponse.json(
        { message: "המטופל לא שייך לקליניקה שלך" },
        { status: 403 }
      );
    }

    if (client.therapistId === toTherapistId) {
      return NextResponse.json(
        { message: "המטופל כבר מטופל ע״י המטפל/ת היעד" },
        { status: 400 }
      );
    }

    const toTherapist = await prisma.user.findUnique({
      where: { id: toTherapistId },
      select: {
        id: true,
        name: true,
        organizationId: true,
        clinicRole: true,
        isBlocked: true,
      },
    });
    if (!toTherapist) {
      return NextResponse.json({ message: "המטפל/ת היעד לא נמצא/ה" }, { status: 400 });
    }
    if (toTherapist.organizationId !== me.organizationId) {
      return NextResponse.json(
        { message: "המטפל/ת היעד לא שייכ/ת לקליניקה שלך" },
        { status: 400 }
      );
    }
    if (toTherapist.isBlocked) {
      return NextResponse.json(
        { message: "לא ניתן להעביר למטפל/ת חסומ/ה" },
        { status: 400 }
      );
    }
    if (toTherapist.clinicRole !== "THERAPIST" && toTherapist.clinicRole !== "OWNER") {
      return NextResponse.json(
        { message: "ניתן להעביר רק למטפלים או לבעלים (לא למזכירות)" },
        { status: 400 }
      );
    }

    const result = await withAudit(
      { kind: "user", session },
      {
        action: "transfer_client",
        targetType: "Client",
        targetId: clientId,
        details: {
          organizationId: me.organizationId,
          fromTherapistId: client.therapistId,
          toTherapistId,
          clientName: `${client.firstName} ${client.lastName}`.trim(),
        },
      },
      async (tx) => {
        // 1. יצירת לוג עם snapshot של השמות
        const log = await tx.clientTransferLog.create({
          data: {
            organizationId: me.organizationId!,
            clientId,
            fromTherapistId: client.therapistId,
            toTherapistId,
            performedById: userId,
            reason: reason?.trim() || null,
            fromTherapistNameSnapshot: client.therapist?.name || "—",
            toTherapistNameSnapshot: toTherapist.name || "—",
            performedByNameSnapshot: me.name || "—",
          },
        });

        // 2. עדכון Client.therapistId
        await tx.client.update({
          where: { id: clientId },
          data: { therapistId: toTherapistId },
        });

        return log;
      }
    );

    return NextResponse.json(JSON.parse(JSON.stringify(result)));
  } catch (error) {
    logger.error("[clinic-admin/transfer-client] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בהעברת המטופל" },
      { status: 500 }
    );
  }
}
