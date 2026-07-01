import crypto from "node:crypto";

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  userId?: string;
  [key: string]: unknown;
}

// H1: deny-list של שדות שעלולים להכיל PHI/סודות. כל key שתואם לרגקס
// יוחלף ב-[REDACTED] לפני כתיבה ל-stdout. מטרה: למנוע דלף של תכנים רפואיים
// (notes/transcription/content), פרטי קשר (email/phone/nationalId),
// סיסמאות/טוקנים, וחתימות לוגי Render שעלולים להישמר בשירותי לוגינג.
//
// הסניטיזציה רקורסיבית — חודרת לאובייקטים מקוננים ולמערכים. עומק מקסימלי
// כדי למנוע stack overflow במקרים של מעגלים.
//
// 2026-05-17 עדכון: הסרנו `code$` ו-`tz` מהדפוס — שתי תפיסות שגויות גרמו
// לכך ש-`errorCode`/`statusCode`/`responseCode`/`approvalCode` וגם
// `authorized`/`customizable`/`realized` נחסמו מהלוגים בטעות. PII אמיתי
// (`nationalId`, `2faCode`, `verificationCode`) עדיין נתפס דרך
// `nationalId|codeHash|verificationCode|otp`.
// vat דורש word-boundary כדי לא ללכוד "private" (priVATe), "innovate", "elevator".
// `\bvat` עם flag /i מכסה vat, VAT, vatId, vatRate, vat_id — אבל לא private/innovate.
// tax(?!onomy) חוסם tax/taxId/taxRate אבל לא taxonomy.
// 2026-06-10 עדכון: הוספת `recipient` + `toNumber` + `to` (מעוגן `(^|_)to$` כדי
// לא ללכוד total/history/token/automatic). תחת המפתחות האלה נכתבו טלפונים/אימיילים
// של מטופלים גלוי ל-Render logs (למשל sms.ts `{ to: phone }`, cron/notifications
// ו-debt-reminders `{ recipient: client.email }`). הרגקס משפיע רק על פלט ה-logger,
// לא על שדות DB (CommunicationLog) ולא על הפרמטר `to` של sendEmail.
//
// 2026-06-10 (המשך): הוספת `subject`. נושאי מייל מכילים שמות מטופלים/מטפלים
// (למשל "🔔 בקשת ביטול חדשה - <שם לקוח>", "תזכורת תשלום - חוב של ...") ונכתבו
// ל-Render logs דרך resend.ts `{ subject }` (חסימת שבת) ו-webhooks/resend
// `{ data: { subject } }` (מייל נכנס). אין מפתח לגיטימי אחר בלוגים שמכיל
// "subject" → אין over-redaction. שים לב: זה תופס מפתח בשם subject בלבד; טקסט
// "subject" בתוך מחרוזת ה-message (כמו "Mark notifications by subject error")
// אינו מושפע — הסניטיזציה פועלת על ה-context, לא על ה-message.
const SENSITIVE_KEY_REGEX =
  /password|secret|token|notes?|content|transcription|nationalId|phone|email|recipient|subject|toNumber|(^|_)to$|signature|access_token|refresh_token|id_token|otp|codeHash|verificationCode|twoFaCode|recoveryCodes|twoFactorSecret|apiKey|api_key|cardcomToken|creditCard|cvv|pan|iban|swift|authorization|cookie|sessionId|sessionToken|emotionalMarkers|keyTopics|medicalHistory|aiAnalysis|recommendations|intakeNotes|initialDiagnosis|approachNotes|culturalContext|comprehensiveAnalysis|prompt|summary|transcript|description|freeText|firstName|lastName|address|birthDate|dob|dateOfBirth|idNumber|tax(?!onomy)|\bvat|salary|income|passport/i;

// M11.M1: filename keys מקבלים hash במקום redact מלא, כדי לאפשר debug של
// "אותו קובץ עלה פעמיים" בלי לחשוף PII (שם מטופל בקובץ "שרה כהן_פגישה.pdf").
// Match: filename, fileName, originalFilename, originalFileName — לא name לבד
// (שמכיל גם actionName/templateName/tierName שאינם PII).
// L16.11 (סבב 16a): הורחב לתפוס גם attachmentName/documentName/recordingName —
// שדות עם שמות קבצי PHI שלא נתפסו ברגקס הקודם.
const FILENAME_KEY_REGEX = /^(original)?([Ff]ile|[Aa]ttachment|[Dd]ocument|[Rr]ecording)[Nn]ame$/;

function hashFilename(value: unknown): string {
  if (typeof value !== "string") return "[REDACTED]";
  const hash = crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);
  // נשמרת סיומת הקובץ — לא PII, מועיל לdebug של בעיות תאימות סוג קובץ.
  const dot = value.lastIndexOf(".");
  const ext = dot > 0 && dot < value.length - 1 && dot >= value.length - 6
    ? value.slice(dot).toLowerCase()
    : "";
  return `[FILE:${hash}${ext}]`;
}

// אורך מקסימלי של ערך טקסט בלוג. ערכים ארוכים מקוצרים — מונע flooding
// של הלוגים בתכני transcription/PHI גם אם המפתח לא נכנס לרשימה.
const MAX_VALUE_LENGTH = 500;
// M11.L3: עלה מ-4 ל-6 — webhook payloads (meshulam/sumit) מקננים עמוק יותר
// ו-[DEPTH_LIMIT] על 4 חיתך פרטי debug שימושיים. 6 עדיין מוגן מ-stack overflow.
const MAX_DEPTH = 6;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_DEPTH) return "[DEPTH_LIMIT]";

  if (typeof value === "string") {
    return value.length > MAX_VALUE_LENGTH
      ? value.slice(0, MAX_VALUE_LENGTH) + "...[TRUNCATED]"
      : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeValue(value.message, depth + 1),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => sanitizeValue(v, depth + 1));
  }

  if (typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>, depth + 1);
  }

  return String(value);
}

function sanitizeObject(obj: Record<string, unknown>, depth: number): Record<string, unknown> {
  if (depth >= MAX_DEPTH) return { _truncated: "[DEPTH_LIMIT]" };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (FILENAME_KEY_REGEX.test(key)) {
      // hash במקום redact מלא — שומר על debug context (ext, יוניקליות)
      out[key] = hashFilename(value);
    } else if (SENSITIVE_KEY_REGEX.test(key)) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = sanitizeValue(value, depth);
    }
  }
  return out;
}

function sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return context;
  return sanitizeObject(context, 0);
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const sanitized = sanitizeContext(context);
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...sanitized,
  };

  // הגנה: JSON.stringify יכול לזרוק על BigInt/Symbol/circular. אם נכשל —
  // לוג פולבק בטוח, מבלי לקרוס את ה-route.
  let output: string;
  try {
    output = JSON.stringify(entry);
  } catch {
    output = JSON.stringify({
      level,
      message,
      timestamp: entry.timestamp,
      _logError: "context could not be serialized",
    });
  }

  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => log("error", message, context),
};
