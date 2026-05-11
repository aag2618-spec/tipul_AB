// src/app/api/cron/audit-log-retention/route.ts
//
// Stage 2.0 — מחיקת רשומות audit ישנות (#13 בתוכנית האבטחה).
//
// מוטיבציה: AdminAuditLog צובר רשומות לכל פעולה אדמיניסטרטיבית. אחרי שנים
// של שימוש הטבלה גדלה לעשרות מיליוני שורות, queries של דשבורד אדמין מאטים
// (גם עם indexes), ו-backups גדלים בלתי-נחוצים. השמירה הרלוונטית רגולטורית
// היא 12 חודשים (חוק הגנת הפרטיות + תקנות אבטחת מידע) — מה שחורג מזה הוא
// noise תפעולי.
//
// פעולה: מוחק רשומות שגיל ה-`createdAt` שלהן > AUDIT_RETENTION_MONTHS חודשים,
// **חוץ מ**רשומות עם undoable=true שעדיין בתקופת undoExpiresAt תקפה (גארד
// פיזי — הסבירות שזה יקרה אחרי 12 חודש = 0, אבל defense-in-depth).
//
// קצב: רץ פעם בשבוע (יום ראשון 03:00 ישראל) במקום יומי, כי המחיקה היא
// massive ו-disk reclamation של Postgres VACUUM קורה רק אחרי. רץ בdelete-batches
// של 10K כדי לא לתפוס lock על הטבלה לזמן ארוך.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const AUDIT_RETENTION_MONTHS = 12;
const DELETE_BATCH_SIZE = 10_000;
const MAX_BATCHES_PER_RUN = 50;

export async function GET(req: NextRequest) {
  try {
    const guard = await checkCronAuth(req);
    if (guard) return guard;

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - AUDIT_RETENTION_MONTHS);

    let totalDeleted = 0;
    let batches = 0;

    // Loop with limit — אם יש backlog ענק (ראשונה), מסיים את הריצה אחרי
    // MAX_BATCHES_PER_RUN ומשאיר את השאר לריצה הבאה. עדיף הרבה קטן מאחת
    // ענקית שתחזיק lock דקות ארוכות.
    while (batches < MAX_BATCHES_PER_RUN) {
      // findMany + deleteMany — Prisma לא תומך ב-DELETE...LIMIT ישיר ב-PostgreSQL
      // דרך deleteMany. לכן מאתרים batch של IDs ומוחקים לפי id.
      const batch = await prisma.adminAuditLog.findMany({
        where: {
          createdAt: { lt: cutoff },
          // לא למחוק רשומות שיש להן חלון undo פעיל (גם אם זה נדיר)
          OR: [
            { undoable: false },
            { undoExpiresAt: { lt: new Date() } },
            { undoExpiresAt: null },
          ],
        },
        select: { id: true },
        take: DELETE_BATCH_SIZE,
      });
      if (batch.length === 0) break;

      const result = await prisma.adminAuditLog.deleteMany({
        where: { id: { in: batch.map((b) => b.id) } },
      });
      totalDeleted += result.count;
      batches += 1;

      if (result.count < DELETE_BATCH_SIZE) break;
    }

    // רישום ב-audit log עצמו — ironic but important. הריצה רושמת מטה-מידע
    // על המחיקה כך שאדמין יוכל לראות בdebut history "ב-2026-05-11 נמחקו 47K
    // רשומות מ-2025-05-11 ומלפני".
    await withAudit(
      { kind: "system", source: "CRON", externalRef: "audit-log-retention" },
      {
        action: "cron_audit_log_retention",
        targetType: "admin_audit_log",
        details: {
          cutoff: cutoff.toISOString(),
          retentionMonths: AUDIT_RETENTION_MONTHS,
          deletedCount: totalDeleted,
          batches,
          batchSize: DELETE_BATCH_SIZE,
          truncated: batches >= MAX_BATCHES_PER_RUN,
        },
      },
      async () => totalDeleted
    );

    logger.info("[cron audit-log-retention] completed", {
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
      message: `נמחקו ${totalDeleted} רשומות audit ישנות מ-${AUDIT_RETENTION_MONTHS} חודש`,
    });
  } catch (error) {
    logger.error("[cron audit-log-retention] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה במחיקת רשומות audit ישנות" },
      { status: 500 }
    );
  }
}
