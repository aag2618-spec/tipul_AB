// src/app/api/cron/data-access-audit-retention/route.ts
//
// M2 — מחיקת רשומות DataAccessAuditLog ישנות מ-24 חודש.
//
// מוטיבציה: DataAccessAuditLog צובר רשומה לכל קריאת תוכן רגיש (תמלולים,
// סיכומים, הקלטות, וכו'). אצל מטפל פעיל זה יכול להיות 50-200 רשומות/יום.
// אחרי שנים — מיליוני שורות, queries מאטים, backups גדלים.
//
// **24 חודש** (לא 12 כמו AdminAuditLog) — תקנות אבטחת מידע 2017 מחייבות
// שמירת logs של "פעולות על נתוני בריאות" לפחות 24 חודש. כיוון שטבלה זו
// מתעדת ספציפית גישה לתוכן קליני (תמלולים/סיכומים/הקלטות), היא חוסה תחת
// תקנת בריאות הנפש החמורה יותר. AdminAuditLog (פעולות ניהוליות בלבד) —
// 12 חודש מספיק.
//
// קצב: פעם בשבוע (יום ראשון 03:30 ישראל). המחיקה batched ב-10K כדי
// לא לתפוס lock ארוך על הטבלה.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const RETENTION_MONTHS = 24;
const DELETE_BATCH_SIZE = 10_000;
const MAX_BATCHES_PER_RUN = 50;

export async function GET(req: NextRequest) {
  try {
    const guard = await checkCronAuth(req);
    if (guard) return guard;

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);

    let totalDeleted = 0;
    let batches = 0;

    while (batches < MAX_BATCHES_PER_RUN) {
      const batch = await prisma.dataAccessAuditLog.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        take: DELETE_BATCH_SIZE,
      });
      if (batch.length === 0) break;

      const result = await prisma.dataAccessAuditLog.deleteMany({
        where: { id: { in: batch.map((b) => b.id) } },
      });
      totalDeleted += result.count;
      batches += 1;

      if (result.count < DELETE_BATCH_SIZE) break;
    }

    // רישום ב-AdminAuditLog (לא בtable שאנחנו מוחקים ממנו — circular)
    await withAudit(
      {
        kind: "system",
        source: "CRON",
        externalRef: "data-access-audit-retention",
      },
      {
        action: "cron_data_access_audit_retention",
        targetType: "data_access_audit_log",
        details: {
          cutoff: cutoff.toISOString(),
          retentionMonths: RETENTION_MONTHS,
          deletedCount: totalDeleted,
          batches,
          batchSize: DELETE_BATCH_SIZE,
          truncated: batches >= MAX_BATCHES_PER_RUN,
        },
      },
      async () => totalDeleted
    );

    logger.info("[cron data-access-audit-retention] completed", {
      deletedCount: totalDeleted,
      batches,
      cutoff: cutoff.toISOString(),
      truncated: batches >= MAX_BATCHES_PER_RUN,
    });

    return NextResponse.json({
      success: true,
      deletedCount: totalDeleted,
      batches,
      cutoff: cutoff.toISOString(),
      truncated: batches >= MAX_BATCHES_PER_RUN,
      message: `נמחקו ${totalDeleted} רשומות data-access audit ישנות מ-${RETENTION_MONTHS} חודש`,
    });
  } catch (error) {
    logger.error("[cron data-access-audit-retention] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה במחיקת רשומות data-access audit ישנות" },
      { status: 500 }
    );
  }
}
