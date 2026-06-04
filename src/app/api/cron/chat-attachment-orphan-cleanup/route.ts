// src/app/api/cron/chat-attachment-orphan-cleanup/route.ts
//
// ניקוי צרופות צ'אט יתומות (orphans) באחסון (Cloudflare R2 / דיסק).
//
// בעיה: צרופת צ'אט נשמרת באחסון תחת `chat/${conversationId}/${filename}`,
// והנתיב נשמר ב-ChatMessage.attachmentPath. כש-ChatMessage / ChatConversation /
// User / Organization נמחקים, Prisma מבצע cascade על שורות ה-DB — אבל קובץ
// האובייקט באחסון *לעולם לא נמחק*. הוא הופך ליתום ומצטבר לנצח. בנוסף, מחיקה
// רכה (ChatMessage.deletedAt) משאירה גם את השורה וגם את הקובץ. עבור אפליקציית
// PHI זה נוגד את עקרון צמצום המידע (חוק הגנת הפרטיות + תקנות 2017) וגם עולה כסף.
//
// פתרון (גישת "סריקת ענן"): cron יומי שמפרט את כל האובייקטים תחת `chat/`,
// ולכל אובייקט בודק מול ה-DB האם קיימת ChatMessage *חיה* (deletedAt=null)
// שה-attachmentPath שלה זהה ל-key. אם אין — הקובץ יתום ונמחק. גישה זו תופסת
// גם יתומים *ישנים* שכבר נוצרו (cascade delete מחק את השורה כך שאין יותר על
// מה לעבור ב-DB) — בדיוק כמו recording-orphan-cleanup.
//
// בטיחות — קובץ נמחק רק אם מתקיים אחד מהשניים:
//   • אין שום ChatMessage שמצביעה ל-key הזה (יתום אמיתי), והקובץ ישן מ-
//     RETENTION_DAYS לפי גיל הקובץ עצמו (lastModified). חלון הגיל מונע מחיקה
//     של קובץ שזה עתה הועלה אך שורת ההודעה שלו עוד לא נכתבה (upload race),
//     שכן ב-route ההעלאה הקובץ נכתב *לפני* יצירת ה-ChatMessage.
//   • קיימת ChatMessage שמחוקה-רכה (deletedAt) ל-key הזה, וה-deletedAt ישן
//     מ-RETENTION_DAYS — חלון שמירה ל-audit/שחזור לפני מחיקת הקובץ.
// קובץ עם ChatMessage חיה אחת לפחות — לעולם לא נמחק.
//
// הערה: לצרופות, attachmentPath נשמר בדיוק כ-relativePath שנכתב לאחסון
// (`chat/...`, ללא prefix של `uploads/` וללא "/" מוביל), כך שההשוואה key↔
// attachmentPath היא שוויון ישיר — שונה מ-recordings ששומרות audioUrl עם prefix.
//
// אם בעתיד יתווסף feature של מחיקת הודעה (hard/soft delete) — כדאי למחוק את
// הקובץ גם שם מיידית דרך storage.delete(); ה-cron הזה נשאר רשת ביטחון שתופסת
// כל מה שנשמט (cascade, כשלים, יתומים היסטוריים).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import storage from "@/lib/storage";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

// prefix של כל צרופות הצ'אט באחסון (ראה route ההעלאה: `chat/${id}/${name}`).
const CHAT_PREFIX = "chat/";

// תקופת השמירה לפני מחיקה. זהה ל-recording-orphan-cleanup לעקביות:
//   • חלון התאוששות אם המחיקה/ניתוק היו בטעות (כולל שחזור DB).
//   • חלון ה-audit למחיקה רכה.
//   • לקבצים יתומים-לגמרי (בלי שורה) — מונע upload race.
const RETENTION_DAYS = 90;

// Pagination — עד PAGE_SIZE keys לכל list (=מגבלת S3/R2 ל-ListObjectsV2),
// ולכל עמוד query אחד ל-DB (attachmentPath IN keys). תיקרה ריצה כדי לא
// להיתקע: עד MAX_PAGES_PER_RUN עמודים = 20K קבצים/ריצה. idempotent —
// אם נחתך, ממשיך מחר (S3 delete הוא idempotent; local unlink מטופל ENOENT).
const PAGE_SIZE = 1000;
const MAX_PAGES_PER_RUN = 20;

export async function GET(req: NextRequest) {
  try {
    const guard = await checkCronAuth(req);
    if (guard) return guard;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    let totalScanned = 0;
    let totalDeletedFiles = 0;
    let totalFileErrors = 0;
    let pages = 0;
    let token: string | undefined = undefined;

    do {
      const page = await storage.list(CHAT_PREFIX, token, PAGE_SIZE);
      token = page.nextToken;
      pages += 1;

      // עמוד ריק לא בהכרח אומר "סיימנו": ב-S3/R2 ListObjectsV2 יכול להחזיר
      // Contents ריק *עם* nextToken תקף (IsTruncated=true). לכן continue (לא
      // break) — תנאי ה-while (token) הוא שמסיים, לא ספירת הפריטים בעמוד.
      if (page.items.length === 0) continue;
      totalScanned += page.items.length;

      // query יחיד לעמוד: אילו מה-keys מוצבעים ע"י ChatMessage (חיה או מחוקה-רכה).
      const keys = page.items.map((it) => it.path);
      const rows = await prisma.chatMessage.findMany({
        where: { attachmentPath: { in: keys } },
        select: { attachmentPath: true, deletedAt: true },
      });

      // key → האם יש הודעה חיה; ול-key שכולו מחוק-רך — ה-deletedAt העדכני ביותר.
      const liveKeys = new Set<string>();
      const softDeletedAt = new Map<string, Date>();
      for (const r of rows) {
        if (!r.attachmentPath) continue;
        if (r.deletedAt === null) {
          liveKeys.add(r.attachmentPath);
        } else {
          const prev = softDeletedAt.get(r.attachmentPath);
          if (!prev || r.deletedAt > prev) {
            softDeletedAt.set(r.attachmentPath, r.deletedAt);
          }
        }
      }

      for (const item of page.items) {
        const key = item.path;

        // יש הודעה חיה שמצביעה לקובץ — לא נוגעים.
        if (liveKeys.has(key)) continue;

        const softAt = softDeletedAt.get(key);
        if (softAt) {
          // הודעה מחוקה-רכה: שומרים את הקובץ עד deletedAt + RETENTION_DAYS.
          // (הקובץ בהכרח ישן לפחות כמו ה-deletedAt, לכן אין צורך בבדיקת גיל קובץ.)
          if (softAt >= cutoff) continue;
          // עברנו את חלון השמירה → מוחקים את הקובץ. השורה נשארת ל-audit.
        } else {
          // אין *שום* שורה שמצביעה ל-key — יתום אמיתי (cascade delete / כשל
          // ביצירת הודעה / יתום היסטורי). מוחקים רק אם הקובץ עצמו ישן
          // מ-RETENTION_DAYS, כדי לא לפגוע בקובץ שזה עתה הועלה (upload race).
          if (item.lastModified >= cutoff) continue;
        }

        try {
          await storage.delete(key);
          totalDeletedFiles += 1;
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException)?.code;
          if (code === "ENOENT") {
            // הקובץ כבר נעלם (אחסון מקומי) — idempotent, לא שגיאה.
            logger.info("[cron chat-attachment-orphan-cleanup] file already missing", {
              key,
            });
          } else {
            logger.warn("[cron chat-attachment-orphan-cleanup] file delete error", {
              key,
              errorMessage: err instanceof Error ? err.message : String(err),
            });
            totalFileErrors += 1;
          }
        }
      }
    } while (token && pages < MAX_PAGES_PER_RUN);

    const truncated = Boolean(token) && pages >= MAX_PAGES_PER_RUN;

    // Audit log לפעולה ההרסנית. אין מחיקת DB rows — fn רק מחזיר את הספירה,
    // ו-withAudit כותב את שורת ה-audit בטרנזקציה.
    await withAudit(
      { kind: "system", source: "CRON", externalRef: "chat-attachment-orphan-cleanup" },
      {
        action: "cron_chat_attachment_orphan_cleanup",
        targetType: "chat_attachment",
        details: {
          cutoff: cutoff.toISOString(),
          retentionDays: RETENTION_DAYS,
          scanned: totalScanned,
          deletedFiles: totalDeletedFiles,
          fileErrors: totalFileErrors,
          pages,
          truncated,
        },
      },
      async () => totalDeletedFiles
    );

    logger.info("[cron chat-attachment-orphan-cleanup] completed", {
      scanned: totalScanned,
      deletedFiles: totalDeletedFiles,
      fileErrors: totalFileErrors,
      pages,
      cutoff: cutoff.toISOString(),
      truncated,
    });

    return NextResponse.json({
      success: true,
      scanned: totalScanned,
      deletedFiles: totalDeletedFiles,
      fileErrors: totalFileErrors,
      pages,
      cutoff: cutoff.toISOString(),
      truncated,
      message: `נסרקו ${totalScanned} קבצים, נמחקו ${totalDeletedFiles} צרופות צ'אט יתומות (>${RETENTION_DAYS} ימים)`,
    });
  } catch (error) {
    logger.error("[cron chat-attachment-orphan-cleanup] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בניקוי צרופות צ'אט יתומות" },
      { status: 500 }
    );
  }
}
