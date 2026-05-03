// src/lib/cardcom/token-hash.ts
//
// SHA-256 דטרמיניסטי של Cardcom token, משמש כמפתח unique ב-SavedCardToken.
//
// **למה לא להשתמש ב-token עצמו?** מתכננים להצפין את שדה ה-`token` ב-DB
// (PR עתידי, אחרי data migration שממלא tokenHash לרשומות legacy). הצפנה
// AES-GCM לא דטרמיניסטית (random IV), כלומר אותו token → 2 ciphertexts
// שונים. unique constraint על ערך מוצפן לא יעבוד. tokenHash דטרמיניסטי
// מאפשר uniqueness + lookup גם כשה-token עצמו מוצפן.

import crypto from "crypto";

/**
 * SHA-256 hex של ה-token. החזרה דטרמיניסטית — שני קריאות עם אותו token
 * מחזירות אותו hash. אורך קבוע (64 chars) ובטוח להציב כ-DB key.
 */
export function hashCardcomToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}
