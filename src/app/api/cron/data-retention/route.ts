// R6 (סבב 17f, 2026-05-20) — Cron data-retention לטבלאות קליניות לא-רגולטוריות.
//
// המוטיבציה: חוק זכויות החולה דורש שמירת רשומה רפואית 25 שנה. **אבל** —
// CommunicationLog INCOMING (מיילים שמטופלים שולחים) ו-Notification (התראות
// UI) אינם נופלים תחת הגדרת "רשומה רפואית". שמירתם 7+ שנים = noise תפעולי
// + risk surface מיותר ל-PHI leak.
//
// קצב: רץ פעם בשבוע (יום שני 04:00 ישראל) — אחרי שאר ה-retention crons.
// Batched delete (10K/batch, מקסימום 50 batches/run) כדי לא להחזיק lock.
//
// מטרות שונות מ-audit-log-retention:
//   • audit-log-retention: AdminAuditLog בלבד, 12 חודשים
//   • data-access-audit-retention: DataAccessAuditLog, 24 חודשים
//   • data-retention (זה): CommunicationLog INCOMING + Notification, מדיניות
//     לפי טבלה
//
// **לא נוגע** ב-TherapySession/SessionNote/Recording/Transcription/Analysis/
// Payment/QuestionnaireResponse/IntakeResponse/ConsentForm/CommunicationLog
// OUTGOING — אלה רשומה רפואית רגולטורית, 25 שנים.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

// CommunicationLog INCOMING — 7 שנים. מיילים נכנסים שלא נקראו ולא שויכו
// לפגישה (סטטוס RECEIVED בלבד). 7 שנים גדול מהפרקטיקה הסבירה (1-2 שנים),
// מרווח בטיחות לתקרית משפטית.
const COMM_INCOMING_RETENTION_YEARS = 7;

// Notification — 90 יום. אלה התראות UI ("הוכן סיכום ל-X", "תזכורת לפגישה"),
// לא חוק. 90 יום מספיק למחפש היסטוריה רצנטית.
const NOTIFICATION_RETENTION_DAYS = 90;

const DELETE_BATCH_SIZE = 10_000;
const MAX_BATCHES_PER_RUN = 50;

export async function GET(req: NextRequest) {
  try {
    const guard = await checkCronAuth(req);
    if (guard) return guard;

    const now = new Date();

    // 1. CommunicationLog INCOMING מעל 7 שנים.
    const commCutoff = new Date(now);
    commCutoff.setFullYear(commCutoff.getFullYear() - COMM_INCOMING_RETENTION_YEARS);
    const commDeleted = await batchedDelete(
      "CommunicationLog INCOMING",
      async (take) =>
        prisma.communicationLog.findMany({
          where: {
            createdAt: { lt: commCutoff },
            type: { in: ["INCOMING_EMAIL", "INCOMING_SMS"] },
          },
          select: { id: true },
          take,
        }),
      async (ids) =>
        prisma.communicationLog.deleteMany({ where: { id: { in: ids } } })
    );

    // 2. Notification מעל 90 יום.
    const notifCutoff = new Date(now);
    notifCutoff.setDate(notifCutoff.getDate() - NOTIFICATION_RETENTION_DAYS);
    const notifDeleted = await batchedDelete(
      "Notification",
      async (take) =>
        prisma.notification.findMany({
          where: { createdAt: { lt: notifCutoff } },
          select: { id: true },
          take,
        }),
      async (ids) =>
        prisma.notification.deleteMany({ where: { id: { in: ids } } })
    );

    // ה-audit log לעקיבה. ironic: cron שמוחק רשומות → מוסיף רשומה ב-AdminAuditLog.
    await withAudit(
      { kind: "system", source: "CRON", externalRef: "data-retention" },
      {
        action: "cron_data_retention",
        targetType: "communication_log_and_notification",
        details: {
          commIncomingDeleted: commDeleted.totalDeleted,
          commIncomingBatches: commDeleted.batches,
          commCutoff: commCutoff.toISOString(),
          notificationDeleted: notifDeleted.totalDeleted,
          notificationBatches: notifDeleted.batches,
          notifCutoff: notifCutoff.toISOString(),
        },
      },
      async () => commDeleted.totalDeleted + notifDeleted.totalDeleted
    );

    logger.info("[cron data-retention] completed", {
      commIncomingDeleted: commDeleted.totalDeleted,
      notificationDeleted: notifDeleted.totalDeleted,
    });

    return NextResponse.json({
      success: true,
      communicationIncoming: {
        deletedCount: commDeleted.totalDeleted,
        batches: commDeleted.batches,
        cutoff: commCutoff.toISOString(),
        truncated: commDeleted.batches >= MAX_BATCHES_PER_RUN,
      },
      notifications: {
        deletedCount: notifDeleted.totalDeleted,
        batches: notifDeleted.batches,
        cutoff: notifCutoff.toISOString(),
        truncated: notifDeleted.batches >= MAX_BATCHES_PER_RUN,
      },
    });
  } catch (err) {
    logger.error("[cron data-retention] error", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה במחיקת נתונים ישנים" },
      { status: 500 }
    );
  }
}

/**
 * batched delete בטוח — מאתר IDs ב-findMany ואז מוחק לפי ID. עוצר אחרי
 * MAX_BATCHES_PER_RUN כדי לא להחזיק lock לזמן ארוך. אם batch אחרון <
 * DELETE_BATCH_SIZE — סיים (אין יותר רשומות).
 */
async function batchedDelete(
  label: string,
  findBatch: (take: number) => Promise<{ id: string }[]>,
  deleteBatch: (ids: string[]) => Promise<{ count: number }>
): Promise<{ totalDeleted: number; batches: number }> {
  let totalDeleted = 0;
  let batches = 0;

  while (batches < MAX_BATCHES_PER_RUN) {
    const batch = await findBatch(DELETE_BATCH_SIZE);
    if (batch.length === 0) break;
    const result = await deleteBatch(batch.map((b) => b.id));
    totalDeleted += result.count;
    batches += 1;
    if (result.count < DELETE_BATCH_SIZE) break;
  }

  logger.info(`[cron data-retention] ${label}`, { totalDeleted, batches });
  return { totalDeleted, batches };
}
