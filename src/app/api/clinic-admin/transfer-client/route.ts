import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { cancelOrDeleteFutureSessions } from "@/lib/transfer-cancel-or-delete";
import { parseBody } from "@/lib/validations/helpers";
import { transferClientSchema } from "@/lib/validations/clinic-admin";

export const dynamic = "force-dynamic";

// POST — העברת מטופל בין מטפלים באותה קליניקה.
// body: {
//   clientId, toTherapistId, reason?,
//   transferFutureSessions?: boolean (default false),
//   sessionsToTransfer?: string[] (sessionIds עם בדיקת חפיפה),
//   sessionsToTransferWithOverride?: string[] (sessionIds עם override של חפיפה),
//   sessionsToCancel?: string[] (sessionIds לביטול),
// }
//
// transferFutureSessions=false (ברירת מחדל): פגישות עתידיות מבוטלות/נמחקות.
// transferFutureSessions=true: פגישות עתידיות מועברות לפי הרשימות. B1 (M11.B1):
// כל פגישה שלא הוזכרה באחת משלוש הרשימות (transfer/override/cancel) — תבוטל
// אוטומטית כ"יתום" כדי שלא תישאר אצל המטפל/ת היוצא/ת אחרי שה-client.therapistId
// עבר. בעבר נשארה אצלו/ה והייתה דליפת גישה + UX מבולבל; עכשיו ניקוי אטומי.
//
// תמיד: היסטוריה (פגישות בעבר + COMPLETED/CANCELLED) נשארת משויכת למטפל המקורי.
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
        secretaryPermissions: true,
      },
    });
    if (!me) {
      return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 });
    }
    // M10.5: ADMIN גלובלי משתמש ב-/api/admin/* בלבד; אסור bypass כאן.
    // Phase 4 follow-up: גם מזכיר/ה עם canTransferClient מורשית להעביר.
    // ההעברה עצמה זהה לחלוטין — אותו ClientTransferLog, אותו cancel-or-delete,
    // אותו withAudit. ה-performedById יהיה ה-userId של המזכירה.
    const isOwner = me.role === "CLINIC_OWNER" || me.clinicRole === "OWNER";
    const isSecretary =
      me.clinicRole === "SECRETARY" || me.role === "CLINIC_SECRETARY";
    const secretaryPerms =
      (me.secretaryPermissions as { canTransferClient?: boolean } | null) ?? null;
    const isSecretaryWithTransferAccess =
      isSecretary && Boolean(secretaryPerms?.canTransferClient);
    if (!isOwner && !isSecretaryWithTransferAccess) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }
    if (!me.organizationId) {
      return NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 400 }
      );
    }

    const parsed = await parseBody(request, transferClientSchema);
    if ("error" in parsed) return parsed.error;
    const {
      clientId,
      toTherapistId,
      reason,
      transferFutureSessions = false,
      sessionsToTransfer = [],
      sessionsToTransferWithOverride = [],
      sessionsToCancel = [],
    } = parsed.data;

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
          transferFutureSessions,
          requestedTransferIds: sessionsToTransfer,
          requestedOverrideIds: sessionsToTransferWithOverride,
          requestedCancelIds: sessionsToCancel,
        },
      },
      async (tx) => {
        // Race guard: קוראים את הclient שוב בתוך ה-tx ומוודאים ש-therapistId
        // לא השתנה בזמן הבדיקות. ככה שני OWNERs (או 2 tabs) שמבצעים העברה
        // בו-זמנית — אחד מצליח, השני מקבל שגיאה ידידותית במקום סטיית נתונים.
        const currentClient = await tx.client.findUnique({
          where: { id: clientId },
          select: { therapistId: true, organizationId: true },
        });
        if (!currentClient || currentClient.organizationId !== me.organizationId) {
          throw new Error("המטופל לא נמצא בקליניקה (ייתכן שהוסר)");
        }
        if (currentClient.therapistId !== client.therapistId) {
          throw new Error(
            "המטופל הועבר למטפל אחר בין-זמן. רענני את הדף ובדקי שוב."
          );
        }

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

        // 2.5. ביטול קישורי הזימון העצמי הפעילים של המטופל.
        // ה-BookingLink הוא snapshot של הקשר עם המטפל/ת היוצא/ת: therapistId,
        // גוף ההודעה שכבר נשלחה ("X מזמין/ה אותך"), ופרטי היעד. אחרי ההעברה הוא
        // לא תואם עוד. בלי הביטול, מטופל שייכנס לקישור הישן יקבע תור אצל המטפל/ת
        // הקודמ/ת — booking/t/[token] (handleCreate) יוצר את ה-TherapySession לפי
        // link.therapistId (וטוען bookingSettings לפיו), בסתירה לכוונת ההעברה.
        //
        // בוחרים ביטול (ולא יישור ל-toTherapistId) כדי להישאר עקביים עם ברירת
        // המחדל של ההעברה — ניתוק נקי. שליחה הבאה דרך send-link לא תמצא קישור
        // ACTIVE ותיצור קישור חדש ונכון בשם המטפל/ת החדש/ה (therapistId, org,
        // פרטי יעד וגוף הודעה מעודכנים). evaluateBookingLinkAccess כבר מחזיר 410
        // לקישור REVOKED, כך שמטופל עם הקישור הישן יקבל הודעה תקנית.
        //
        // הסינון לפי clientId בלבד (שכבר אומת לארגון של המבצע/ת דרך client +
        // race-guard) — לא לפי organizationId, כי הוא nullable ב-BookingLink
        // ועלול להחמיץ קישורים ישנים עם org=null ולהשאירם פעילים אצל המטפל/ת הישן/ה.
        const revokedLinks = await tx.bookingLink.updateMany({
          where: { clientId, status: "ACTIVE" },
          data: { status: "REVOKED" },
        });

        // 3. טיפול בפגישות עתידיות
        const now = new Date();
        let transferredSessionIds: string[] = [];
        let overriddenSessionIds: string[] = [];
        let deletedSessionIds: string[] = [];
        let cancelledSessionIds: string[] = [];

        if (transferFutureSessions) {
          // מצב מתקדם: ה-OWNER בחר ב-dialog פר פגישה
          if (sessionsToTransfer.length > 0) {
            // SELECT-then-update: מסננים תחילה את ה-IDs התקפים בלבד
            // (לקוח נכון, מטפל נכון, עתידי). updateMany מחזיר רק count, אבל
            // אנחנו צריכים את ה-IDs האמיתיים לאודיט. ה-loop גם בודק חפיפה.
            const validForTransfer: string[] = [];
            for (const sid of sessionsToTransfer) {
              const s = await tx.therapySession.findUnique({
                where: { id: sid },
                select: {
                  startTime: true,
                  endTime: true,
                  clientId: true,
                  therapistId: true,
                  status: true,
                },
              });
              if (
                !s ||
                s.clientId !== clientId ||
                s.therapistId !== client.therapistId ||
                s.startTime <= now
              ) {
                continue;
              }
              const conflict = await tx.therapySession.findFirst({
                where: {
                  therapistId: toTherapistId,
                  status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
                  OR: [
                    {
                      AND: [
                        { startTime: { lte: s.startTime } },
                        { endTime: { gt: s.startTime } },
                      ],
                    },
                    {
                      AND: [
                        { startTime: { lt: s.endTime } },
                        { endTime: { gte: s.endTime } },
                      ],
                    },
                    {
                      AND: [
                        { startTime: { gte: s.startTime } },
                        { endTime: { lte: s.endTime } },
                      ],
                    },
                  ],
                },
                select: { id: true },
              });
              if (conflict) {
                throw new Error(
                  "התגלתה התנגשות חדשה בפגישה. רענני את הדף ובחרי שוב."
                );
              }
              validForTransfer.push(sid);
            }
            if (validForTransfer.length > 0) {
              await tx.therapySession.updateMany({
                where: { id: { in: validForTransfer } },
                data: { therapistId: toTherapistId },
              });
            }
            transferredSessionIds = validForTransfer;
          }

          // העברה עם override של חפיפה — בכוונה ללא בדיקת חפיפה
          if (sessionsToTransferWithOverride.length > 0) {
            const validForOverride = await tx.therapySession.findMany({
              where: {
                id: { in: sessionsToTransferWithOverride },
                clientId,
                therapistId: client.therapistId,
                startTime: { gt: now },
              },
              select: { id: true },
            });
            const validIds = validForOverride.map((s) => s.id);
            if (validIds.length > 0) {
              await tx.therapySession.updateMany({
                where: { id: { in: validIds } },
                data: { therapistId: toTherapistId },
              });
            }
            overriddenSessionIds = validIds;
          }

          if (sessionsToCancel.length > 0) {
            // הגנת tenant: ולידציה ש-IDs ב-sessionsToCancel באמת שייכים למטופל
            // הזה, למטפל המקור, בארגון הזה, ובעתיד. בלי זה — מזכיר/ה/בעלים
            // יכולים להעביר IDs של פגישות מקליניקה אחרת ולגרום ל-CANCEL/DELETE
            // שלהן (IDOR cross-tenant; cancelOrDeleteFutureSessions עצמו לא
            // מסנן לפי tenant — רק לפי ID).
            const validToCancel = await tx.therapySession.findMany({
              where: {
                id: { in: sessionsToCancel },
                clientId,
                therapistId: client.therapistId,
                organizationId: me.organizationId,
                startTime: { gt: now },
                status: {
                  in: ["SCHEDULED", "PENDING_APPROVAL", "PENDING_CANCELLATION"],
                },
              },
              select: { id: true },
            });
            const validToCancelIds = validToCancel.map((s) => s.id);
            // helper מחזיר את ה-IDs האמיתיים שטופלו (deleted/cancelled)
            const { deleted, cancelled } = await cancelOrDeleteFutureSessions(
              tx,
              validToCancelIds,
              { transferLogId: log.id }
            );
            deletedSessionIds = deleted;
            cancelledSessionIds = cancelled;
          }

          // B1: ניקוי "פגישות יתומות" — פגישות עתידיות פעילות של המטופל אצל
          // המטפל/ת המקורי/ת שה-OWNER לא הזכיר באף אחת משלוש הרשימות.
          // בלי הניקוי הזה: ה-client.therapistId הועבר, אבל session.therapistId
          // נשאר על המטפל/ת היוצא/ת → ה-יוצא/ת רואה עדיין פגישות עתידיות של
          // מטופל שלא שייך לה/ו יותר (דליפת גישה + UX מבולבל). ה-default-mode
          // (transferFutureSessions=false) עושה את זה אוטומטית; advanced mode
          // צריך לכבד אינטנט OWNER על מה שהוזכר ולנקות את השאר באותה צורה.
          const explicitlyHandled = new Set<string>([
            ...sessionsToTransfer,
            ...sessionsToTransferWithOverride,
            ...sessionsToCancel,
          ]);
          const orphans = await tx.therapySession.findMany({
            where: {
              clientId,
              therapistId: client.therapistId,
              // defense-in-depth: גם clientId כבר org-validated, אבל פילטר נוסף
              // על organizationId מאפס כל סיכוי לסיכון cross-tenant מהשהיה במידע.
              organizationId: me.organizationId,
              startTime: { gt: now },
              status: {
                in: ["SCHEDULED", "PENDING_APPROVAL", "PENDING_CANCELLATION"],
              },
            },
            select: { id: true },
          });
          const orphanIds = orphans
            .map((s) => s.id)
            .filter((id) => !explicitlyHandled.has(id));
          if (orphanIds.length > 0) {
            const { deleted, cancelled } = await cancelOrDeleteFutureSessions(
              tx,
              orphanIds,
              { transferLogId: log.id }
            );
            deletedSessionIds = [...deletedSessionIds, ...deleted];
            cancelledSessionIds = [...cancelledSessionIds, ...cancelled];
          }
        } else {
          // ברירת מחדל: כל הפגישות העתידיות הפעילות מבוטלות/נמחקות
          const allFuture = await tx.therapySession.findMany({
            where: {
              clientId,
              therapistId: client.therapistId,
              startTime: { gt: now },
              status: {
                in: ["SCHEDULED", "PENDING_APPROVAL", "PENDING_CANCELLATION"],
              },
            },
            select: { id: true },
          });
          const { deleted, cancelled } = await cancelOrDeleteFutureSessions(
            tx,
            allFuture.map((s) => s.id),
            { transferLogId: log.id }
          );
          deletedSessionIds = deleted;
          cancelledSessionIds = cancelled;
        }

        // עדכון ה-log עם summary של מה שקרה (כדי שיהיה visible באודיט)
        const summaryParts: string[] = [];
        if (transferredSessionIds.length)
          summaryParts.push(`הועברו ${transferredSessionIds.length}`);
        if (overriddenSessionIds.length)
          summaryParts.push(`הועברו עם התנגשות ${overriddenSessionIds.length}`);
        if (deletedSessionIds.length)
          summaryParts.push(`נמחקו ${deletedSessionIds.length}`);
        if (cancelledSessionIds.length)
          summaryParts.push(`בוטלו ${cancelledSessionIds.length}`);
        if (revokedLinks.count > 0) summaryParts.push("בוטל קישור זימון");

        if (summaryParts.length > 0) {
          const baseReason = reason?.trim() || "";
          const postfix = summaryParts.join(", ");
          const updatedReason = baseReason
            ? `${baseReason}; ${postfix}`
            : postfix;
          await tx.clientTransferLog.update({
            where: { id: log.id },
            data: { reason: updatedReason },
          });
        }

        return {
          ...log,
          transferredSessionIds,
          overriddenSessionIds,
          deletedSessionIds,
          cancelledSessionIds,
          revokedBookingLinkCount: revokedLinks.count,
        };
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
