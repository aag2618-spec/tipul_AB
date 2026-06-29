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
import {
  ENCRYPTED_FIELDS,
  ENCRYPTED_JSON_FIELDS,
  JSON_ENC_MARKER,
} from "@/lib/encrypted-fields-map";

// מקור-אמת אחד למפות מוגדר ב-`encrypted-fields-map.ts` (נתונים טהורים, ללא
// imports), כך שגם ה-extension כאן וגם סקריפט ה-rotation (`scripts/
// rotate-encryption.ts`, רץ תחת tsx שלא פותר alias `@/`) משתמשים באותה רשימה
// בלי drift. re-export כדי לשמור על המייבאים הקיימים (`prisma.ts`).
export { ENCRYPTED_FIELDS, ENCRYPTED_JSON_FIELDS };

/**
 * Markers שמוחזרים כש**פענוח** נכשל (key mismatch / נתון פגום). הם מוצגים
 * למשתמש *במקום* ה-PHI. מיוצאים כמקור-אמת אחד כדי ש:
 *   1. הproducer (maybeDecrypt/maybeDecryptJson) וה-guard בכתיבה
 *      (maybeEncrypt/maybeEncryptJson) יתייחסו לאותה מחרוזת בדיוק — אם הטקסט
 *      ישתנה אי-פעם, שני הצדדים נשארים מסונכרנים ולא נפער חור.
 *   2. הבדיקות יוכלו להשוות מול אותו ערך בלי לשכפל את הליטרל.
 */
export const DECRYPT_ERROR_MARKER = "[שגיאת פענוח — צור קשר עם תמיכה]";
export const DECRYPT_JSON_ERROR_MARKER = "[שגיאת פענוח JSON — צור קשר עם תמיכה]";

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
  // GUARD (חלק א', סבב אבטחה 2026-06-29): סירוב להצפין את ה-marker של שגיאת
  // פענוח. בלעדיו, אם פענוח נכשל פעם אחת (key mismatch / נתון פגום),
  // maybeDecrypt מחזיר את ה-marker, המשתמש רואה אותו בטופס ושומר — ואז היינו
  // מצפינים את ה-marker וכותבים אותו ל-DB, מוחקים לצמיתות את ה-PHI המקורי.
  // עדיף להיכשל רועש (הכתיבה כולה נדחית) מאשר לאבד מידע קליני בשקט.
  if (value === DECRYPT_ERROR_MARKER) {
    logger.error(
      "[Encryption] Refusing to encrypt decryption-error marker — would overwrite PHI",
    );
    throw new Error(
      "Refusing to persist decryption-error marker — original PHI would be overwritten",
    );
  }
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
    return DECRYPT_ERROR_MARKER;
  }
}

/**
 * Helper: מצפין JSON value (אובייקט/מערך/primitive) → object marker עם
 * encrypted string. אם ה-value כבר marker (idempotency) — מחזיר as-is.
 */
function maybeEncryptJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  // GUARD (חלק א', סבב אבטחה 2026-06-29): סירוב להצפין את צורת כשל הפענוח של
  // JSON. כשפענוח JSON נכשל, maybeDecryptJson מחזיר `{ error: <marker> }`.
  // אם המשתמש שומר אז — בלי הguard היינו עוטפים ומצפינים את אובייקט השגיאה
  // ודורסים לצמיתות את ה-PHI ה-JSON המקורי. כמו בטקסט — נכשל רועש, לא דורס.
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).error === DECRYPT_JSON_ERROR_MARKER
  ) {
    logger.error(
      "[Encryption] Refusing to encrypt JSON decryption-error marker — would overwrite PHI",
    );
    throw new Error(
      "Refusing to persist JSON decryption-error marker — original PHI would be overwritten",
    );
  }
  // כבר marker — לא להצפין שוב
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON_ENC_MARKER in (value as object)
  ) {
    return value;
  }
  try {
    const stringified = JSON.stringify(value);
    if (stringified === undefined) return value;
    const encrypted = encrypt(stringified);
    return { [JSON_ENC_MARKER]: encrypted };
  } catch (err) {
    logger.error("[Encryption] Failed to encrypt JSON field", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error("JSON encryption failed — refusing to write plaintext");
  }
}

/**
 * Helper: מפענח JSON value אם הוא marker עם encrypted string.
 * מחזיר את הoriginal value אם:
 * - null / undefined
 * - לא marker (legacy plaintext JSON)
 */
function maybeDecryptJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    !(JSON_ENC_MARKER in (value as object))
  ) {
    return value; // legacy plaintext JSON — pass-through
  }
  const encStr = (value as Record<string, unknown>)[JSON_ENC_MARKER];
  if (typeof encStr !== "string") return value;
  try {
    const plaintext = decrypt(encStr);
    return JSON.parse(plaintext);
  } catch (err) {
    logger.error("[Encryption] Failed to decrypt JSON field", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: DECRYPT_JSON_ERROR_MARKER };
  }
}

/**
 * מצפין שדות רגישים ב-data לפני create/update.
 * משנה את ה-data in place וגם מחזיר אותו.
 */
export function encryptFields(model: string, data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const obj = data as Record<string, unknown>;

  // 1. String fields
  const fields = ENCRYPTED_FIELDS[model];
  if (fields) {
    for (const field of fields) {
      if (field in obj) {
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
  }

  // 2. JSON fields
  const jsonFields = ENCRYPTED_JSON_FIELDS[model];
  if (jsonFields) {
    for (const field of jsonFields) {
      if (field in obj) {
        const v = obj[field];
        // Prisma JSON operators: { set: ... } — handle
        if (
          v &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          "set" in v &&
          !(JSON_ENC_MARKER in v)
        ) {
          const op = v as { set?: unknown };
          op.set = maybeEncryptJson(op.set);
        } else {
          obj[field] = maybeEncryptJson(v);
        }
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

  // 1a. Decrypt string fields של ה-model הנוכחי
  const fields = ENCRYPTED_FIELDS[model];
  if (fields) {
    for (const field of fields) {
      if (field in record) {
        record[field] = maybeDecrypt(record[field]);
      }
    }
  }

  // 1b. Decrypt JSON fields של ה-model הנוכחי
  const jsonFields = ENCRYPTED_JSON_FIELDS[model];
  if (jsonFields) {
    for (const field of jsonFields) {
      if (field in record) {
        record[field] = maybeDecryptJson(record[field]);
      }
    }
  }

  // 2. Recurse על relations מוכרים. שם ה-relation ב-Prisma matches שם המודל
  // (camelCase, singular relation = object, plural = array).
  // אנחנו מנחשים את ה-model לפי שם השדה.
  //
  // round 17a (2026-05-20): התיקון `|| key in ENCRYPTED_JSON_FIELDS` הוסף
  // עבור DSAR — לפני כן, recursion דילגה על מודלים שמוצפנים JSON-בלבד
  // (intakeResponse עם `responses` JSON, analysis עם keyTopics/emotionalMarkers/
  // recommendations) ולכן ייצוא דרך `decryptDeep` החזיר marker objects
  // `{__enc__: ...}` במקום plaintext. עכשיו ה-recursion יורד לכל relation
  // שמוצפן (string OR json) → תיקון defensive שלא משפיע על routes שכבר
  // עובדים נכון (הוא רק *מוסיף* decryption לrelations שעד עכשיו לא קיבלו).
  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== "object") continue;
    if (key in ENCRYPTED_FIELDS || key in ENCRYPTED_JSON_FIELDS) {
      // Singular relation
      decryptDeepOne(key, value);
      continue;
    }
    // Plural — נסה strip של 's' להגיע ל-singular
    const singular = pluralToSingular(key);
    if (
      singular &&
      (singular in ENCRYPTED_FIELDS || singular in ENCRYPTED_JSON_FIELDS)
    ) {
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
  // -yses → -ysis (e.g. sessionAnalyses → sessionAnalysis)
  if (name.endsWith("yses")) return name.slice(0, -3) + "is";
  if (name.endsWith("ses") || name.endsWith("xes") || name.endsWith("zes")) {
    return name.slice(0, -2);
  }
  if (name.endsWith("s") && !name.endsWith("ss")) return name.slice(0, -1);
  return null;
}
