// src/lib/webhook-retry.ts
// מנגנון ניסיון חוזר לwebhooks שנכשלו

import prisma from "@/lib/prisma";

export interface FailedWebhook {
  provider: string;
  eventType: string;
  payload: string;
  error: string;
  headers?: Record<string, string>;
}

/**
 * שמירת webhook שנכשל לניסיון חוזר
 * משתמש בטבלת AdminAlert עם סוג SYSTEM
 */
export async function saveFailedWebhook(webhook: FailedWebhook): Promise<void> {
  try {
    await prisma.adminAlert.create({
      data: {
        type: "SYSTEM",
        title: `Webhook נכשל - ${webhook.provider}`,
        message: `Event: ${webhook.eventType}\nError: ${webhook.error}\nPayload: ${webhook.payload.substring(0, 500)}`,
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
