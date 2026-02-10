// src/lib/billing-logger.ts
// לוג מרכזי לכל קריאות API לספקי חיוב

import prisma from "@/lib/prisma";

export interface BillingLogEntry {
  userId?: string;
  provider: "MESHULAM" | "SUMIT" | "ICOUNT" | "GREEN_INVOICE";
  action: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  success: boolean;
  error?: string;
  durationMs?: number;
}

/**
 * שמירת לוג של קריאת API לספק חיוב
 * משתמש בטבלת ApiUsageLog הקיימת
 */
export async function logBillingApiCall(entry: BillingLogEntry): Promise<void> {
  try {
    await prisma.apiUsageLog.create({
      data: {
        userId: entry.userId || "system",
        endpoint: `billing/${entry.provider.toLowerCase()}/${entry.action}`,
        model: entry.provider,
        tokensUsed: 0,
        cost: 0,
        responseTimeMs: entry.durationMs || 0,
        success: entry.success,
        errorMessage: entry.error || null,
      },
    });
  } catch (err) {
    // לא נכשיל את הקריאה הראשית אם הלוג נכשל
    console.error("Failed to log billing API call:", err);
  }
}

/**
 * Wrapper שמודד זמן ושומר לוג אוטומטית
 */
export async function withBillingLog<T>(
  entry: Omit<BillingLogEntry, "success" | "error" | "durationMs" | "response">,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    
    await logBillingApiCall({
      ...entry,
      success: true,
      durationMs,
      response: typeof result === "object" ? (result as Record<string, unknown>) : undefined,
    });
    
    return result;
  } catch (error) {
    const durationMs = Date.now() - start;
    
    await logBillingApiCall({
      ...entry,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs,
    });
    
    throw error;
  }
}
