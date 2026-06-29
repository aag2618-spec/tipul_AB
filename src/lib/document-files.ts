import storage from "@/lib/storage";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// מחיקת קבצי האחסון של רשומות Document.
//
// מסמכי מטופל (טפסי אינטייק סרוקים עם ת.ז., היסטוריה רפואית, דוחות) נשמרים
// כקבצים באחסון (S3/R2/דיסק) ב-`documents/<uuid>.<ext>`, וה-fileUrl שנשמר ב-DB
// הוא `/api/uploads/documents/<uuid>.<ext>`. מחיקת שורת ה-DB לבדה (delete /
// cascade) **אינה** מוחקת את הקובץ הפיזי — הוא נשאר נגיש לנצח באחסון. עבור
// אפליקציית PHI זו הפרה של זכות להישכח / צמצום מידע. המודול הזה מרכז את
// ההמרה הבטוחה fileUrl→key ואת מחיקת הקבצים, כדי שמחיקת מטופל ומחיקת משתמש
// יוכלו לנקות גם את הקבצים — לא רק את השורות.
// ---------------------------------------------------------------------------

/**
 * ממיר fileUrl שמור ב-DB ל-relative path (key) בתוך האחסון.
 * פורמטים מותרים: "/api/uploads/<rel>" או "/uploads/<rel>". כל אחר → null
 * כדי למנוע path-traversal דרך רשומת DB מזויפת/legacy. storage.delete מאמת
 * בנוסף שה-resolve מסתיים בתוך baseDir (defense-in-depth).
 */
export function fileUrlToRelative(fileUrl: string | null | undefined): string | null {
  if (!fileUrl || typeof fileUrl !== "string") return null;
  const prefixes = ["/api/uploads/", "/uploads/"];
  for (const p of prefixes) {
    if (fileUrl.startsWith(p)) {
      const rel = fileUrl.slice(p.length);
      // חסימת תווי traversal בסיסיים (defense-in-depth מעבר ל-storage)
      if (rel.includes("..") || rel.startsWith("/") || rel.startsWith("\\")) {
        return null;
      }
      return rel;
    }
  }
  return null;
}

export interface DeleteDocumentFilesResult {
  /** קבצים שנמחקו בהצלחה. */
  deleted: number;
  /** קבצים שמחיקתם נכשלה (נרשם warning; לא חוסם). */
  failed: number;
  /** רשומות שה-fileUrl שלהן לא בפורמט מצופה — לא ננסה למחוק (legacy/manual edit). */
  skipped: number;
}

/**
 * מוחק (best-effort) את קבצי האחסון של רשומות Document נתונות.
 *
 * נקרא כשמוחקים מטופל/משתמש: יש לשלוף את ה-documents (id+fileUrl) **לפני**
 * מחיקת השורות (אחרי cascade/delete אין יותר רשומה שמצביעה לקובץ), ואז לקרוא
 * לפונקציה זו **אחרי** שמחיקת ה-DB הצליחה. כל כשל מחיקת קובץ נרשם ולא חוסם
 * את המחיקה הלוגית — קבצים ששרדו ייתפסו ע"י cron ה-orphan-cleanup כרשת ביטחון.
 *
 * @param documents רשומות עם id ו-fileUrl (השדות שנדרשים לזיהוי ומחיקה).
 * @param context שדות נוספים ל-log (reason + מזהים) לצורך מעקב forensics.
 */
export async function deleteDocumentFiles(
  documents: Array<{ id: string; fileUrl: string | null }>,
  context: Record<string, unknown>
): Promise<DeleteDocumentFilesResult> {
  let deleted = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of documents) {
    const relPath = fileUrlToRelative(doc.fileUrl);
    if (!relPath) {
      skipped += 1;
      logger.warn("[document-files] unexpected fileUrl format, skipping file delete", {
        documentId: doc.id,
        ...context,
      });
      continue;
    }
    try {
      await storage.delete(relPath);
      deleted += 1;
    } catch (err) {
      // הקובץ אולי כבר לא קיים באחסון — לא חוסם את המחיקה הלוגית.
      failed += 1;
      logger.warn("[document-files] file delete failed", {
        documentId: doc.id,
        relPath,
        error: err instanceof Error ? err.message : String(err),
        ...context,
      });
    }
  }

  return { deleted, failed, skipped };
}

/**
 * חולץ את קבצי הצרופות מתוך שורות CommunicationLog (שדה attachments מסוג JSON).
 *
 * רקע: כשמטפל משיב למייל של מטופל עם צרופה, הקובץ נשמר באחסון תחת
 * `sent/<clientId>/...` והמטא-דאטה (כולל fileUrl) נשמר ב-CommunicationLog.attachments
 * — **לא** כרשומת Document. הרלציה CommunicationLog→Client היא SetNull, כך
 * שמחיקת מטופל משאירה גם את השורה וגם את הקובץ. הפונקציה ממירה את ה-JSON
 * לרשימת {id,fileUrl} שאפשר להעביר ל-deleteDocumentFiles.
 *
 * עמיד לקלט לא צפוי: צרופות נכנסות (incoming) שומרות רק resendEmailId בלי
 * fileUrl (הקובץ נמשך on-demand מ-Resend) — אלה מדולגות. כל ערך שאינו מערך
 * או אובייקט עם fileUrl תקין — מדולג בשקט.
 */
export function collectCommunicationAttachmentFiles(
  rows: Array<{ id: string; attachments: unknown }>
): Array<{ id: string; fileUrl: string }> {
  const out: Array<{ id: string; fileUrl: string }> = [];
  for (const row of rows) {
    if (!Array.isArray(row.attachments)) continue;
    for (const att of row.attachments) {
      if (
        att &&
        typeof att === "object" &&
        "fileUrl" in att &&
        typeof (att as { fileUrl: unknown }).fileUrl === "string"
      ) {
        out.push({ id: row.id, fileUrl: (att as { fileUrl: string }).fileUrl });
      }
    }
  }
  return out;
}
