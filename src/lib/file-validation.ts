/* eslint-disable security/detect-bidi-characters */
// H5 — Server-side validation לקבצים שמועלים ל-API.
//
// הבעיה: 3 endpoints (documents/recordings/communications) קיבלו קבצים
// ללא בדיקת MIME/size/magic-bytes. וקטור התקפה:
//   • DoS דרך base64 ענק (recordings) שצורך זיכרון לפני שגודל נבדק
//   • טעינת קובץ exe/zip עם סיומת PDF (התוקף יכול לעקוף MIME מהדפדפן)
//   • magic-bytes mismatch — קובץ נחזה ל-PDF אבל מכיל script
//
// הפתרון: בדיקה ב-3 שכבות:
//   1. size בגבולות הסבירים לכל קטגוריה
//   2. MIME type מ-allowlist (ה-Content-Type שהדפדפן הצהיר)
//   3. magic-bytes ב-buffer (ה-bytes הראשונים) שתואמים ל-MIME
//
// אנחנו לא מתקינים file-type package — magic-bytes ידני מספיק לסוגי
// קבצים שאנחנו תומכים בהם, ופחות תלות = פחות attack surface.

export type FileCategory = "document" | "recording" | "attachment";

interface CategoryConfig {
  maxSizeBytes: number;
  allowedMimes: readonly string[];
  // magic-bytes signatures: prefix של buffer לכל MIME מותר.
  magicBytes: ReadonlyArray<{ mime: string; prefix: number[]; offset?: number }>;
}

const CONFIG: Record<FileCategory, CategoryConfig> = {
  document: {
    maxSizeBytes: 25 * 1024 * 1024, // 25MB — מסמכי הסכמה/אבחון
    allowedMimes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
    ],
    magicBytes: [
      { mime: "application/pdf", prefix: [0x25, 0x50, 0x44, 0x46] }, // %PDF
      { mime: "application/msword", prefix: [0xd0, 0xcf, 0x11, 0xe0] }, // OLE
      { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", prefix: [0x50, 0x4b, 0x03, 0x04] }, // PK (zip)
      { mime: "image/jpeg", prefix: [0xff, 0xd8, 0xff] },
      { mime: "image/png", prefix: [0x89, 0x50, 0x4e, 0x47] },
    ],
  },
  recording: {
    maxSizeBytes: 50 * 1024 * 1024, // 50MB — הקלטות פגישה
    allowedMimes: [
      "audio/webm",
      "audio/ogg",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
    ],
    magicBytes: [
      { mime: "audio/webm", prefix: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML (גם ל-ogg-webm)
      { mime: "audio/ogg", prefix: [0x4f, 0x67, 0x67, 0x53] }, // OggS
      // MP3 frame-sync: 0xFFFB / 0xFFFA / 0xFFF3 / 0xFFF2 / 0xFFE3 וכו'
      // הבייט הראשון 0xFF, השני נע — בודקים רק 0xFF + ID3 בנפרד.
      { mime: "audio/mpeg", prefix: [0xff, 0xfb] },
      { mime: "audio/mpeg", prefix: [0xff, 0xfa] },
      { mime: "audio/mpeg", prefix: [0xff, 0xf3] },
      { mime: "audio/mpeg", prefix: [0xff, 0xf2] },
      { mime: "audio/mpeg", prefix: [0x49, 0x44, 0x33] }, // ID3v2 tag
      { mime: "audio/mp3", prefix: [0xff, 0xfb] },
      { mime: "audio/mp3", prefix: [0xff, 0xfa] },
      { mime: "audio/mp3", prefix: [0xff, 0xf3] },
      { mime: "audio/mp3", prefix: [0xff, 0xf2] },
      { mime: "audio/mp3", prefix: [0x49, 0x44, 0x33] },
      // WAV: בודקים "WAVE" ב-offset 8 (RIFF בלבד לא מספיק — גם WEBP/AVI מתחילים בכך)
      { mime: "audio/wav", prefix: [0x57, 0x41, 0x56, 0x45], offset: 8 },
      { mime: "audio/x-wav", prefix: [0x57, 0x41, 0x56, 0x45], offset: 8 },
    ],
  },
  attachment: {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB — נספחי מייל
    allowedMimes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
    magicBytes: [
      { mime: "image/jpeg", prefix: [0xff, 0xd8, 0xff] },
      { mime: "image/png", prefix: [0x89, 0x50, 0x4e, 0x47] },
      { mime: "image/gif", prefix: [0x47, 0x49, 0x46, 0x38] },
      // WEBP: בודקים "WEBP" ב-offset 8 (RIFF בלבד לא מבדיל מ-WAV)
      { mime: "image/webp", prefix: [0x57, 0x45, 0x42, 0x50], offset: 8 },
      { mime: "application/pdf", prefix: [0x25, 0x50, 0x44, 0x46] },
      { mime: "application/msword", prefix: [0xd0, 0xcf, 0x11, 0xe0] },
      { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", prefix: [0x50, 0x4b, 0x03, 0x04] },
    ],
  },
};

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * בודק buffer של קובץ — גודל, MIME, magic-bytes.
 * משמש את documents/communications שמקבלים FormData (File).
 */
export function validateFileBuffer(
  buffer: Buffer,
  declaredMime: string,
  category: FileCategory
): ValidationResult {
  const cfg = CONFIG[category];

  if (buffer.length === 0) {
    return { ok: false, error: "קובץ ריק" };
  }
  if (buffer.length > cfg.maxSizeBytes) {
    const mb = (cfg.maxSizeBytes / (1024 * 1024)).toFixed(0);
    return { ok: false, error: `קובץ גדול מדי (מקסימום ${mb}MB)` };
  }

  if (!cfg.allowedMimes.includes(declaredMime)) {
    return { ok: false, error: `סוג קובץ לא מורשה: ${declaredMime}` };
  }

  // text/plain אין לו magic-bytes ייחודי — מדלגים על הבדיקה.
  if (declaredMime === "text/plain") {
    return { ok: true };
  }

  // לפחות אחד מה-signatures של ה-MIME המוצהר חייב להתאים.
  const matchingSignatures = cfg.magicBytes.filter((s) => s.mime === declaredMime);
  if (matchingSignatures.length === 0) {
    // אין signature ל-MIME — שולחים אזהרה אבל לא חוסמים (WAV variants וכו').
    return { ok: true };
  }

  const matches = matchingSignatures.some((sig) => {
    const offset = sig.offset || 0;
    if (buffer.length < offset + sig.prefix.length) return false;
    for (let i = 0; i < sig.prefix.length; i++) {
      if (buffer[offset + i] !== sig.prefix[i]) return false;
    }
    return true;
  });

  if (!matches) {
    return { ok: false, error: "תוכן הקובץ לא תואם לסוג המוצהר" };
  }
  return { ok: true };
}

/**
 * בודק base64 string לפני המרה ל-Buffer (חוסך זיכרון ב-DoS).
 * base64 גדל ב-~33% משקיל הקובץ הבינארי, אז מעריכים גודל מהאורך.
 */
export function validateBase64Size(
  base64: string,
  category: FileCategory
): ValidationResult {
  const cfg = CONFIG[category];
  // ~אורך בינארי = (length * 3) / 4 — מינוס padding.
  const estimatedBytes = Math.ceil((base64.length * 3) / 4);
  if (estimatedBytes > cfg.maxSizeBytes) {
    const mb = (cfg.maxSizeBytes / (1024 * 1024)).toFixed(0);
    return { ok: false, error: `קובץ גדול מדי (מקסימום ${mb}MB)` };
  }
  if (estimatedBytes === 0) {
    return { ok: false, error: "קובץ ריק" };
  }
  return { ok: true };
}

export function getCategoryMaxSize(category: FileCategory): number {
  return CONFIG[category].maxSizeBytes;
}

export function getCategoryAllowedMimes(category: FileCategory): readonly string[] {
  return CONFIG[category].allowedMimes;
}

/**
 * H10: ממיר MIME מאומת ל-extension בטוח לשמירה לדיסק.
 * מונע התקפת "trap.html עם תוכן PDF" — תוקף שולח file.name="trap.html"
 * + file.type="application/pdf" + תוכן PDF → magic-bytes validation עוברת,
 * אבל אם נשתמש בקובץ שם של המשתמש, נשמור כ-.html ונגיש כ-text/html.
 *
 * השתמש רק אחרי validateFileBuffer() שהוודא ש-MIME תואם ל-magic bytes.
 */
const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "text/plain": "txt",
};

export function safeExtensionForMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? "bin";
}

/**
 * H5 (2026-05-17): מסיר EXIF/metadata מתמונות לפני אחסון.
 *
 * הבעיה: JPG/PNG שמועלה מתוך טלפון מכיל GPS coordinates, סוג מצלמה,
 * תאריך/שעה מדויקים, ולעיתים thumbnail. במערכת PHI אסור לאפשר דליפת
 * מיקום של מטופל דרך תיעוד תמונות. EXIF נשמר בתמונה גם אם המשתמש לא
 * מתכוון לחשוף.
 *
 * הפתרון: sharp().rotate() קורא את ה-orientation EXIF flag ומסובב
 * פיזית את התמונה — מאפשר להסיר את כל ה-EXIF אחר כך מבלי לפגוע
 * בכיוון. ב-output: JPG/PNG/WebP ללא שום metadata.
 *
 * שימוש:
 *   if (mime.startsWith("image/")) buffer = await stripImageMetadata(buffer, mime);
 *
 * בכשל (sharp נופל על SVG/HEIC לא צפויים): מחזיר את ה-buffer המקורי
 * + לוג warning. עדיף לאחסן את התמונה עם EXIF מאשר לחסום העלאה לגיטימית.
 */
const IMAGE_MIMES_FOR_STRIPPING = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function stripImageMetadata(
  buffer: Buffer,
  mime: string
): Promise<Buffer> {
  if (!IMAGE_MIMES_FOR_STRIPPING.has(mime)) {
    return buffer; // לא תמונה תומכת (PDF/audio/HEIC) — לא נוגעים
  }

  try {
    // dynamic import — sharp הוא native module, לא נטעון אותו ב-edge runtime.
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;

    // limitInputPixels: PNG/WebP bomb mitigation — חוסם דקודינג של תמונה
    // שאחרי decompress תפיץ זיכרון. 50M pixels ≈ 5MB RGB raw, מספיק לסריקה
    // 8K אבל לא יכפיל buffer 1KB→1GB.
    // rotate() ללא ארגומנט = "auto-rotate" לפי EXIF orientation, ואז מסירים
    // את כל ה-EXIF. ללא rotate() — תמונת iPhone שצולמה אופקית תיראה הפוכה
    // אחרי הסרת ה-orientation flag.
    const pipeline = sharp(buffer, {
      failOn: "none",
      limitInputPixels: 50_000_000,
    }).rotate();

    // quality 95 (לא 90) — סריקות מסמכים כבר דחוסות פעם, דחיסה שנייה ב-90
    // הורידה איכות גלויה לטקסט קטן. 95 שומר על קריאות עם תוספת ~10% בגודל.
    // Buffer.from עוטף את התוצאה של sharp ב-Buffer<ArrayBuffer> אחיד —
    // sharp.toBuffer() מחזיר Buffer<ArrayBufferLike> שיוצר אי-תאימות בקריאה.
    //
    // M16.7 (סבב 16b): post-processing size check. sharp עם quality 95 +
    // mozjpeg יכול תיאורטית להגדיל buffer (תמונה דחוסה מאוד במקור → re-encode
    // איכותי → גדל). חוסם disk fill דרך upload אגרסיבי.
    // הגבול הוא 25MB (max document size) — אם sharp חרג, מחזירים את המקור
    // (עדיף EXIF מאשר חריגה).
    const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;
    const checkSize = (out: Buffer): Buffer => {
      if (out.length > MAX_OUTPUT_BYTES) {
        return buffer;
      }
      return Buffer.from(out);
    };
    if (mime === "image/jpeg") {
      const out = await pipeline.jpeg({ quality: 95, mozjpeg: true }).toBuffer();
      return checkSize(out);
    }
    if (mime === "image/png") {
      const out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      return checkSize(out);
    }
    if (mime === "image/webp") {
      const out = await pipeline.webp({ quality: 95 }).toBuffer();
      return checkSize(out);
    }
    return buffer;
  } catch (err) {
    // sharp נכשל (תמונה פגומה, תקלת native binary, PNG bomb מעל הגבול) —
    // מחזירים את המקורי. PNG bomb כבר נחסם ב-limitInputPixels; כאן זה fallback.
    const { logger } = await import("./logger");
    logger.warn("file-validation.stripImageMetadata sharp failed", {
      mime,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return buffer;
  }
}

/**
 * round15 (L5): מנקה filename מתווי Unicode bidi-override (U+200E/F,
 * U+202A-E, U+2066-9) שמשתמשים בהם להפיכת ההצגה של שם הקובץ — תוקף
 * יכול לקרוא לקובץ "evil[U+202E]gpj.exe" שיוצג כ-"evilexe.jpg" בדפדפן
 * ולגרום למשתמש להוריד executable במחשבה שזה תמונה.
 *
 * מחזיר אובייקט עם שתי גרסאות:
 *   asciiSafe — לשימוש ב-Content-Disposition `filename=` (RFC 6266 ASCII)
 *   utf8Encoded — URL-encoded UTF-8 לשימוש ב-`filename*=UTF-8''...`
 *
 * דפוס שימוש:
 *   const { asciiSafe, utf8Encoded } = sanitizeDownloadFilename(rawName);
 *   headers.set(
 *     "Content-Disposition",
 *     `attachment; filename="${asciiSafe}"; filename*=UTF-8''${utf8Encoded}`
 *   );
 *
 * אותו pattern כבר בשימוש ב-src/app/api/uploads/[...path]/route.ts:250-258
 * (round 10) — כאן הוצא לפונקציה משותפת כדי שכל route שמחזיר filename
 * מ-input של משתמש יוכל להשתמש בלי כפילות.
 */
export function sanitizeDownloadFilename(rawName: string | null | undefined): {
  asciiSafe: string;
  utf8Encoded: string;
} {
  const base = (rawName ?? "file").slice(0, 255);
  // U+200E, U+200F (LRM/RLM), U+202A-U+202E (embedding/override), U+2066-U+2069 (isolate)
  const stripped = base.replace(/[‎‏‪-‮⁦-⁩]/g, "");
  // לכל הפחות שם ברירת מחדל אם הסינון השאיר ריק.
  const safe = stripped.trim() || "file";
  // ASCII בלבד ב-filename=; שאר ב-filename*=UTF-8''<encoded>.
  // גם מסיר תווים שיכולים לשבור את ה-header (`"`, `\r`, `\n`).
  const asciiSafe = safe
    .replace(/[\x00-\x1F\x7F"\\]/g, "_")
    .replace(/[^\x20-\x7E]/g, "_");
  const utf8Encoded = encodeURIComponent(safe);
  return { asciiSafe, utf8Encoded };
}
