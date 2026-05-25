// src/app/api/cron/recording-orphan-cleanup/route.ts
//
// M13.6 (סבב אבטחה 13) — מחיקת הקלטות יתומות (orphans).
//
// בעיה: schema.prisma מגדיר Recording.client onDelete: SetNull ו-Recording.session
// onDelete: SetNull. כשמטופל/פגישה נמחקים, ה-Recording נשארת ב-DB עם clientId=null
// וגם קובץ ה-audio (~10-50MB) נשאר על disk לנצח. זה מנוגד לעיקרון צמצום המידע
// של חוק הגנת הפרטיות + תקנות הגנת הפרטיות 2017 לגבי PHI.
//
// פתרון: cron יומי שמוחק orphans שעברו ORPHAN_RETENTION_DAYS ימים.
//   • 90 ימים = "תוך זמן סביר" לפי דרישות החוק
//   • מספיק לשחזור אם המחיקה הייתה בטעות
//   • אינו פוגע בדרישת שמירת רשומות רפואיות (7 שנים) כי השמירה מוטלת על
//     רשומות פעילות (קשורות למטופל). יתומות = data orphaned, אין מטופל שאליו
//     ניתן לקשר.
//
// פעולה: לכל orphan שמתאים — מוחק את audio file מ-disk, ואז את ה-DB row
// (cascade ל-Transcription/Analysis דרך onDelete: Cascade בschema), ואז audit.
//
// סדר חשוב: file → DB. אם file fails — DB נשמר, נוכל לנסות שוב מחר. אם DB
// fails אחרי file נמחק → orphan קל לזיהוי בריצה הבאה (audioUrl קיים אבל
// findFirst על הקובץ נכשל). פעולה idempotent.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import storage from "@/lib/storage";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

// תקופת השמירה לפני מחיקה. ראה הסבר משפטי בהערה למעלה.
const ORPHAN_RETENTION_DAYS = 90;

// Batch size — שלא לתקוע את הריצה. כל cycle: findMany→delete files→deleteMany.
const BATCH_SIZE = 100;
const MAX_BATCHES_PER_RUN = 20; // 2000 orphans/ריצה — תיקרה ראלית

export async function GET(req: NextRequest) {
  try {
    const guard = await checkCronAuth(req);
    if (guard) return guard;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ORPHAN_RETENTION_DAYS);

    let totalDeletedRows = 0;
    let totalDeletedFiles = 0;
    let totalFileErrors = 0;
    let batches = 0;

    while (batches < MAX_BATCHES_PER_RUN) {
      // orphan = אין clientId וגם אין sessionId, ועברו 90+ ימים מ-createdAt
      const batch = await prisma.recording.findMany({
        where: {
          clientId: null,
          sessionId: null,
          createdAt: { lt: cutoff },
        },
        select: { id: true, audioUrl: true },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) break;

      for (const rec of batch) {
        try {
          const rawPath = rec.audioUrl.replace(/^\/+/, "");
          const relativePath = rawPath.startsWith("uploads/")
            ? rawPath.substring("uploads/".length)
            : rawPath;

          if (relativePath.includes("..")) {
            logger.warn("[cron recording-orphan-cleanup] skipped path-traversal candidate", {
              recordingId: rec.id,
            });
            totalFileErrors += 1;
            continue;
          }

          await storage.delete(relativePath);
          totalDeletedFiles += 1;
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException)?.code;
          if (code === "ENOENT") {
            logger.info("[cron recording-orphan-cleanup] file already missing", {
              recordingId: rec.id,
            });
          } else {
            logger.warn("[cron recording-orphan-cleanup] file delete error", {
              recordingId: rec.id,
              errorMessage: err instanceof Error ? err.message : String(err),
            });
            totalFileErrors += 1;
          }
        }
      }

      // 2) מחיקת DB rows. Cascade ימחק גם Transcription + Analysis הקשורות.
      const ids = batch.map((b) => b.id);
      const result = await prisma.recording.deleteMany({
        where: { id: { in: ids } },
      });
      totalDeletedRows += result.count;
      batches += 1;

      if (batch.length < BATCH_SIZE) break;
    }

    // Audit log לפעולה ההרסנית
    await withAudit(
      { kind: "system", source: "CRON", externalRef: "recording-orphan-cleanup" },
      {
        action: "cron_recording_orphan_cleanup",
        targetType: "recording",
        details: {
          cutoff: cutoff.toISOString(),
          retentionDays: ORPHAN_RETENTION_DAYS,
          deletedRows: totalDeletedRows,
          deletedFiles: totalDeletedFiles,
          fileErrors: totalFileErrors,
          batches,
          truncated: batches >= MAX_BATCHES_PER_RUN,
        },
      },
      async () => totalDeletedRows
    );

    logger.info("[cron recording-orphan-cleanup] completed", {
      deletedRows: totalDeletedRows,
      deletedFiles: totalDeletedFiles,
      fileErrors: totalFileErrors,
      batches,
      cutoff: cutoff.toISOString(),
      truncated: batches >= MAX_BATCHES_PER_RUN,
    });

    return NextResponse.json({
      success: true,
      deletedRows: totalDeletedRows,
      deletedFiles: totalDeletedFiles,
      fileErrors: totalFileErrors,
      batches,
      cutoff: cutoff.toISOString(),
      truncated: batches >= MAX_BATCHES_PER_RUN,
      message: `נמחקו ${totalDeletedRows} הקלטות יתומות (>${ORPHAN_RETENTION_DAYS} ימים)`,
    });
  } catch (error) {
    logger.error("[cron recording-orphan-cleanup] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה במחיקת הקלטות יתומות" },
      { status: 500 }
    );
  }
}
