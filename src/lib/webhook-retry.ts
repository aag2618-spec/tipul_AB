// src/lib/webhook-retry.ts
// מנגנון ניסיון חוזר לwebhooks שנכשלו

import prisma from "@/lib/prisma";
import { sanitizeChargebackPayload } from "@/lib/cardcom/sanitize";

export interface FailedWebhook {
  provider: string;
  eventType: string;
  payload: string;
  error: string;
  headers?: Record<string, string>;
}

/**
 * Strip PII from a webhook payload before storing in AdminAlert.message.
 * AdminAlert נשמר long-term ונצפה ע"י אדמין ב-UI — אסור שיכלול email/phone/name
 * של לקוחות (חוק הגנת הפרטיות / GDPR).
 *
 * הניסיון לפרסר JSON בטוח: אם הוא לא JSON תקין (לדוגמה Cardcom URL-encoded
 * form), נשתמש ב-fallback של replace ידני על דפוסי email/phone, כדי שלא
 * נחשוף PII גם בפורמט לא-JSON.
 */
function scrubPayloadForAlert(payload: string): string {
  try {
    const parsed = JSON.parse(payload);
    const scrubbed = sanitizeChargebackPayload(parsed);
    return JSON.stringify(scrubbed).slice(0, 500);
  } catch {
    // לא JSON — fallback regex scrub. עדיף over-redact.
    return payload
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email-redacted]")
      .replace(/(?:\+?972|0)[2-9]\d{7,8}/g, "[phone-redacted]")
      .slice(0, 500);
  }
}

/**
 * שמירת webhook שנכשל לניסיון חוזר
 * משתמש בטבלת AdminAlert עם סוג SYSTEM. ה-payload עובר scrub של PII לפני
 * אחסון — האדמין רואה את שמות השדות הטכניים אבל לא את ה-email/שם של הלקוח.
 */
export async function saveFailedWebhook(webhook: FailedWebhook): Promise<void> {
  try {
    const scrubbedPayload = scrubPayloadForAlert(webhook.payload);
    await prisma.adminAlert.create({
      data: {
        type: "SYSTEM",
        title: `Webhook נכשל - ${webhook.provider}`,
        message: `Event: ${webhook.eventType}\nError: ${webhook.error}\nPayload: ${scrubbedPayload}`,
        priority: "HIGH",
      },
    });
  } catch (err) {
    console.error("Failed to save webhook for retry:", err);
  }
}

/**
 * Wrapper ל-webhook handler שתופס שגיאות ושומר לניסיון חוזר
 */
export async function withWebhookRetry(
  provider: string,
  eventType: string,
  payload: string,
  handler: () => Promise<void>
): Promise<{ success: boolean; error?: string }> {
  try {
    await handler();
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Webhook handler failed [${provider}/${eventType}]:`, errorMessage);
    
    // שמירה לניסיון חוזר
    await saveFailedWebhook({
      provider,
      eventType,
      payload,
      error: errorMessage,
    });
    
    return { success: false, error: errorMessage };
  }
}
