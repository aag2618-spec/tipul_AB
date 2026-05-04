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
