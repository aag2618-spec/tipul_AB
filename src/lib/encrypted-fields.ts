// src/lib/encrypted-fields.ts
//
// מערכת הצפנה אוטומטית של שדות רגישים ב-DB.
//
// המטרה: שכל הנתונים הרפואיים-טיפוליים (סיכומי פגישה, תמלולים, ניתוחים,
// אבחנות) יישמרו ב-DB מוצפנים. גם אם DB ידלוף — התוקף לא יוכל לקרוא
// את התוכן בלי ENCRYPTION_KEY.
//
// אלגוריתם: AES-256-GCM (מ-`encryption.ts`).
//
// השדות כאן הם רק שדות *טקסט פשוט*. לא כוללים:
// - JSON fields (כמו `aiAnalysis`, `comprehensiveAnalysis` אם הוא JSON) —
//   הצפנת JSON דורשת stringify/parse סביב ההצפנה. בעתיד.
// - שדות שמשתמשים בהם ב-WHERE contains (`Payment.notes`) — אם נצפין אותם
//   חיפוש PaymentID ב-webhook יישבר.
// - `BillingProvider.apiKey/apiSecret` — מוצפנים ידנית בקוד הקיים, לא נתערב.

import { encrypt, decrypt, isEncrypted } from "@/lib/encryption";
import { logger } from "@/lib/logger";

/**
 * מפת המודלים והשדות שאנחנו מצפינים.
 *
 * המפתחות הם **lowercase** של שמות המודלים (כמו ש-Prisma חושף ב-client).
 * השדות הם רשימת string field names ב-model.
 */
export const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  client: ["notes", "initialDiagnosis", "intakeNotes", "approachNotes", "culturalContext", "comprehensiveAnalysis"],
  sessionNote: ["content"],
  transcription: ["content"],
  analysis: ["summary", "nextSessionNotes"],
  therapySession: ["topic", "notes"],
} as const;

export type EncryptedModel = keyof typeof ENCRYPTED_FIELDS;

/**
 * Helper: מצפין שדה אם הוא string לא-ריק ולא כבר מוצפן.
 * מחזיר את ה-value כמו שהוא אם:
 * - undefined / null
 * - לא string
 * - empty string
 * - already encrypted (idempotency — מונע double-encryption)
 */
function maybeEncrypt(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) return value;
  if (isEncrypted(value)) return value;
  try {
    return encrypt(value);
  } catch (err) {
    logger.error("[Encryption] Failed to encrypt field", {
      error: err instanceof Error ? err.message : String(err),
    });
    // FAIL-SAFE: אם הצפנה נכשלת — לא לשמור plaintext בDB!
    throw new Error("Encryption failed — refusing to write plaintext");
  }
}

/**
 * Helper: מפענח שדה אם הוא string מוצפן.
 * מחזיר את ה-value כמו שהוא אם:
 * - undefined / null
 * - לא string
 * - לא מוצפן (לדוגמה, legacy plaintext data שטרם עבר migration)
 */
function maybeDecrypt(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) return value;
  if (!isEncrypted(value)) return value; // legacy plaintext — pass-through
  try {
    return decrypt(value);
  } catch (err) {
    logger.error("[Encryption] Failed to decrypt field — possible key mismatch", {
      error: err instanceof Error ? err.message : String(err),
      preview: value.substring(0, 60),
    });
    // FAIL-SOFT: בקריאה — לא לזרוק. נחזיר marker שיציג למשתמש שיש בעיה.
    return "[שגיאת פענוח — צור קשר עם תמיכה]";
  }
}

/**
 * מצפין שדות רגישים ב-data לפני create/update.
 * משנה את ה-data in place וגם מחזיר אותו.
 */
export function encryptFields(model: string, data: unknown): unknown {
  const fields = ENCRYPTED_FIELDS[model];
  if (!fields || !data || typeof data !== "object") return data;

  const obj = data as Record<string, unknown>;
  for (const field of fields) {
    if (field in obj) {
      // Prisma operators: { set: "..." } | { unset: true } — handle נכון
      const v = obj[field];
      if (v && typeof v === "object" && "set" in v) {
        const op = v as { set?: unknown };
        if (typeof op.set === "string") {
          op.set = maybeEncrypt(op.set);
        }
      } else {
        obj[field] = maybeEncrypt(v);
      }
    }
  }
  return data;
}

/**
 * מפענח שדות רגישים ב-result אחרי read.
 * משנה את ה-result in place וגם מחזיר אותו.
 *
 * תומך גם ב-result יחיד וגם ב-array.
 */
export function decryptFields<T>(model: string, result: T): T {
  if (!result) return result;

  const fields = ENCRYPTED_FIELDS[model];
  if (!fields) return result;

  if (Array.isArray(result)) {
    for (const item of result) {
      decryptOne(fields, item);
    }
    return result;
  }

  decryptOne(fields, result);
  return result;
}

function decryptOne(fields: readonly string[], obj: unknown): void {
  if (!obj || typeof obj !== "object") return;
  const record = obj as Record<string, unknown>;
  for (const field of fields) {
    if (field in record) {
      record[field] = maybeDecrypt(record[field]);
    }
  }
}

/**
 * Recursive decrypt — משמש ל-results עם includes/relations.
 * לדוגמה: GET /api/clients/[id] עם include sessionNote — צריך לפענח גם
 * את ה-client.notes וגם את ה-sessionNote.content בכל פגישה.
 */
export function decryptDeep<T>(rootModel: string, result: T): T {
  if (!result) return result;

  if (Array.isArray(result)) {
    for (const item of result) {
      decryptDeepOne(rootModel, item);
    }
    return result;
  }

  decryptDeepOne(rootModel, result);
  return result;
}

function decryptDeepOne(model: string, obj: unknown): void {
  if (!obj || typeof obj !== "object") return;
  const record = obj as Record<string, unknown>;

  // 1. Decrypt fields של ה-model הנוכחי
  const fields = ENCRYPTED_FIELDS[model];
  if (fields) {
    for (const field of fields) {
      if (field in record) {
        record[field] = maybeDecrypt(record[field]);
      }
    }
  }

  // 2. Recurse על relations מוכרים. שם ה-relation ב-Prisma matches שם המודל
  // (camelCase, singular relation = object, plural = array).
  // אנחנו מנחשים את ה-model לפי שם השדה.
  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== "object") continue;
    if (key in ENCRYPTED_FIELDS) {
      // Singular relation
      decryptDeepOne(key, value);
      continue;
    }
    // Plural — נסה strip של 's' להגיע ל-singular
    const singular = pluralToSingular(key);
    if (singular && singular in ENCRYPTED_FIELDS) {
      if (Array.isArray(value)) {
        for (const item of value) decryptDeepOne(singular, item);
      } else {
        decryptDeepOne(singular, value);
      }
    }
  }
}

function pluralToSingular(name: string): string | null {
  // therapySessions → therapySession; analyses → analysis; etc.
  if (name.endsWith("ies")) return name.slice(0, -3) + "y";
  if (name.endsWith("ses") || name.endsWith("xes") || name.endsWith("zes")) {
    return name.slice(0, -2);
  }
  if (name.endsWith("s") && !name.endsWith("ss")) return name.slice(0, -1);
  return null;
}
