/**
 * Utility לניהול קבצים שמצורפים לפניות תמיכה.
 * מבוסס על דפוס ה-storage הקיים ב-src/lib/storage.ts ועל דפוס ה-attachments
 * שקיים ב-src/app/api/communications/reply/route.ts.
 */

import { randomUUID } from "crypto";
import storage from "@/lib/storage";
import { stripImageMetadata } from "@/lib/file-validation";
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENTS,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/support-attachments-config";

export {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENTS,
  MAX_FILE_SIZE_BYTES,
};

export interface SupportAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  fileUrl: string;
  uploadedAt: string;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * ולידציה של מערך קבצים — בודק כמות, גודל וסוג MIME.
 * מחזיר הודעת שגיאה בעברית לתצוגה למשתמש.
 */
export function validateAttachments(files: File[]): ValidationResult {
  if (files.length > MAX_ATTACHMENTS) {
    return {
      ok: false,
      error: `ניתן לצרף עד ${MAX_ATTACHMENTS} קבצים בלבד`,
    };
  }

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        ok: false,
        error: `הקובץ "${file.name}" גדול מדי — מקסימום ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
      };
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
      return {
        ok: false,
        error: `סוג הקובץ "${file.name}" לא נתמך. ניתן לצרף תמונות, PDF, או מסמכי Word`,
      };
    }
  }

  return { ok: true };
}

/**
 * חילוץ קבצים מ-FormData תחת המפתח "attachments".
 */
export function parseAttachmentsFromFormData(formData: FormData): File[] {
  const raw = formData.getAll("attachments");
  return raw.filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

/**
 * שמירת קבצים לתיקיית support/<ticketId>/.
 * מחזיר מערך metadata מוכן לשמירה בשדה JSON של הפנייה/תגובה.
 * שם הקובץ בעברית נשמר ב-filename, וה-fileUrl מבוצע encodeURI כדי שיתאים ל-URL.
 */
export async function saveAttachments(
  files: File[],
  ticketId: string
): Promise<SupportAttachment[]> {
  const saved: SupportAttachment[] = [];

  for (const file of files) {
    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    // H5 (2026-05-17): EXIF stripping \u2014 \u05DE\u05E1\u05D9\u05E8 GPS/\u05DE\u05D8\u05D0-\u05D3\u05D0\u05D8\u05D4 \u05DE\u05EA\u05DE\u05D5\u05E0\u05D5\u05EA.
    buffer = await stripImageMetadata(buffer, file.type);

    // \u05E1\u05D1\u05D1 8 (2026-05-18): re-check size \u05D0\u05D7\u05E8\u05D9 sharp. \u05D4-output \u05D9\u05DB\u05D5\u05DC \u05EA\u05D9\u05D0\u05D5\u05E8\u05D8\u05D9\u05EA
    // \u05DC\u05D4\u05D9\u05D5\u05EA \u05D2\u05D3\u05D5\u05DC \u05DE-input (PNG/JPEG quality 95 \u05E2\u05DC \u05E7\u05D5\u05D1\u05E5 \u05DC\u05D0 \u05D3\u05D7\u05D5\u05E1). \u05D6\u05D5\u05E8\u05E7\u05D9\u05DD \u2014 \u05D4-caller
    // (route handler \u05E9\u05DC support) \u05D9\u05D9\u05EA\u05E4\u05D5\u05E1 \u05D1-outer try/catch \u05D5\u05D9\u05D7\u05D6\u05D9\u05E8 500/400.
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `\u05D4\u05E7\u05D5\u05D1\u05E5 "${file.name}" \u05D2\u05D3\u05DC \u05DE\u05E2\u05D1\u05E8 \u05DC\u05D2\u05D1\u05D5\u05DC (${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB) \u05D0\u05D7\u05E8\u05D9 \u05E0\u05D9\u05E7\u05D5\u05D9 metadata`
      );
    }

    const safeFilename = file.name.replace(/[^a-zA-Z0-9._\u0590-\u05FF -]/g, "_");
    const uniqueFilename = `${Date.now()}_${randomUUID().slice(0, 8)}_${safeFilename}`;
    const relativePath = `support/${ticketId}/${uniqueFilename}`;

    await storage.write(relativePath, buffer);

    // encodeURI בשלושת החלקים (support, ticketId, filename) — ticketId הוא cuid בטוח,
    // אבל filename יכול להכיל תווי עברית שצריכים URL-encoding לצורך HTTP request.
    const encodedFileUrl = `/api/uploads/support/${ticketId}/${encodeURIComponent(uniqueFilename)}`;

    saved.push({
      id: randomUUID(),
      filename: file.name,
      contentType: file.type,
      size: file.size,
      fileUrl: encodedFileUrl,
      uploadedAt: new Date().toISOString(),
    });
  }

  return saved;
}
