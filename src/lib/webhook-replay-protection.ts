// src/lib/webhook-replay-protection.ts
//
// תשתית משותפת ל-replay-protection של webhooks (Meshulam, Sumit, Cardcom).
//
// שתי הגנות עיקריות:
//   1. timestamp window (±5 דקות) — מונע מתוקף ששוקל webhook ישן ושולח אותו
//      שוב מאוחר יותר.
//   2. idempotency claim — שמירת externalId ב-WebhookEvent עם lease,
//      כך שאם Meshulam/Sumit שולחים את אותו payload פעמיים (retry, network
//      duplication), נעבד אותו פעם אחת בלבד.
//
// התשתית הקיימת ב-`src/lib/cardcom/webhook-claim.ts` נבנתה ל-Cardcom
// אבל כל הלוגיקה generic — ה-`provider` הוא string חופשי. במקום
// ליצור כפילות, אנחנו re-export-ים את הפונקציות במיקום generic.

import {
  claimWebhook as claimCardcomWebhook,
  finalizeWebhook,
  releaseWebhookClaim,
  type ClaimResult,
} from "@/lib/cardcom/webhook-claim";
import { sanitizeChargebackPayload } from "@/lib/cardcom/sanitize";
import { logger } from "@/lib/logger";

export { finalizeWebhook, releaseWebhookClaim, type ClaimResult };

/**
 * עטיפה ל-claimWebhook — מסנן את ה-payload **גם מ-PII** לפני שמירה.
 *
 * sanitizeCardcomPayload (שמשתמש ב-claimWebhook ה-Cardcom-i) מסיר רק secrets
 * (password/cvv/cardnumber). הוא לא מסיר email/phone/name של לקוחות —
 * Cardcom לא שומר אותם בpayload, אבל Meshulam ו-Sumit כן (customerEmail,
 * Customer.Email, customerName וכו'). אם נשתמש ב-sanitizeCardcomPayload —
 * נשמור email + שם לקוח של כל תשלום ב-WebhookEvent.rawPayload לתמיד.
 *
 * הפתרון: לסנן עם sanitizeChargebackPayload לפני העברה ל-claimWebhook.
 * sanitizeChargebackPayload מסיר את אותם secrets + PII (email/phone/name/token).
 */
export async function claimWebhook(
  provider: string,
  externalId: string,
  rawPayload: object
): Promise<ClaimResult> {
  const piiScrubbed = sanitizeChargebackPayload(rawPayload);
  return claimCardcomWebhook(provider, externalId, piiScrubbed);
}

/** חלון anti-replay של 5 דקות. */
const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000;

/**
 * מאמת timestamp של webhook (±5 דקות מעכשיו).
 *
 * תומך ב-3 פורמטים — ISO string ("2026-05-03T11:30:00Z"), epoch seconds
 * ("1714823400"), ו-epoch milliseconds ("1714823400000"). הבחירה אוטומטית
 * לפי גודל המספר: < 10^11 → seconds, אחרת milliseconds.
 *
 * Behavior on missing/invalid timestamp: **fail-open עם warn**.
 * חוזרים true, אבל רושמים אזהרה כדי לזהות ספקים שלא שולחים timestamp.
 *
 * **למה fail-open:** Meshulam ו-Sumit לא מתחייבים בdocs ששדה timestamp/Timestamp
 * תמיד נשלח. fail-closed היה חוסם תשלומים אמיתיים בייצור (מטפל משלם, webhook
 * מגיע בלי timestamp, השרת מחזיר 400 → המנוי לא מופעל). ההגנה האמיתית מ-replay
 * היא ה-idempotency claim על externalId — שם תוקף שמשחזר payload יקבל
 * already_processed. ה-timestamp הוא layer שני בלבד.
 *
 * אופציה לחזור ל-strict mode: ENV var `WEBHOOK_REQUIRE_TIMESTAMP=true` (לדוגמה
 * אם בעתיד ידוע ש-provider שולח timestamp תמיד, אפשר לחזק).
 *
 * @param timestamp מ-payload (אופציונלי כי הspecs של ספקים לא תמיד מבטיחים אותו).
 * @param provider שם לוג (MESHULAM/SUMIT/CARDCOM).
 */
export function verifyWebhookTimestamp(
  timestamp: string | number | undefined | null,
  provider: string = "webhook"
): boolean {
  if (timestamp === undefined || timestamp === null || timestamp === "") {
    const strict = process.env.WEBHOOK_REQUIRE_TIMESTAMP === "true";
    if (strict) {
      logger.warn(`[${provider}] missing webhook timestamp (strict mode — rejected)`);
      return false;
    }
    // fail-open: רישום בלוג כדי שנדע שזה קורה, אבל ממשיכים. ה-idempotency claim
    // עדיין יעצור replay של אותו externalId.
    logger.warn(`[${provider}] webhook missing timestamp — accepting (idempotency claim still protects)`);
    return true;
  }

  // נסה לפרסר כמספר (epoch seconds/ms) או כ-ISO string.
  let ms: number;
  if (typeof timestamp === "number") {
    ms = timestamp < 1e11 ? timestamp * 1000 : timestamp;
  } else {
    const trimmed = String(timestamp).trim();
    // בדיקה: האם זה כולו ספרות (epoch)?
    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      ms = num < 1e11 ? num * 1000 : num;
    } else {
      ms = Date.parse(trimmed);
    }
  }

  if (!Number.isFinite(ms)) {
    logger.warn(`[${provider}] unparseable webhook timestamp`, {
      timestamp: String(timestamp).slice(0, 50),
    });
    return false;
  }

  const age = Date.now() - ms;
  return age >= -MAX_WEBHOOK_AGE_MS && age <= MAX_WEBHOOK_AGE_MS;
}
