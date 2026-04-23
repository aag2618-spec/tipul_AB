/**
 * Constants לשירות פניות תמיכה — מופרדים מהלוגיקה בצד השרת
 * כדי שה-client components יוכלו לייבא אותם בלי לגרור server-only code.
 */

export const MAX_ATTACHMENTS = 3;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const ALLOWED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "pdf",
  "doc",
  "docx",
] as const;
