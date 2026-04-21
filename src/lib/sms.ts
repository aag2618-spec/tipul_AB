import { prisma } from "./prisma";
import { isShabbatOrYomTov } from "./shabbat";
import { logger } from "./logger";
import { isSameIsraelMonth } from "./date-utils";

// ─── Pulseem API Configuration ───────────────────────────────────
const PULSEEM_API_URL = "https://api.pulseem.com/api/v1/SmsApi/SendSms";

function getApiKey(): string | null {
  return process.env.PULSEEM_API_KEY || null;
}

function getSender(): string {
  return process.env.PULSEEM_SENDER || "0508085762";
}

// ─── Types ────────────────────────────────────────────────────────

export interface SMSResult {
  success: boolean;
  error?: string;
  shabbatBlocked?: boolean;
  messageId?: string;
}

export interface SMSPlaceholders {
  שם?: string;
  תאריך?: string;
  שעה?: string;
  יום?: string;
  סכום?: string;
  טלפון?: string;
  שעות?: string;
}

// ─── Phone Validation ─────────────────────────────────────────────

/**
 * Normalize Israeli phone number to format: 05XXXXXXXX
 */
function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  // Remove spaces, dashes, dots
  let cleaned = phone.replace(/[\s\-\.\(\)]/g, "");
  // Handle +972 prefix
  if (cleaned.startsWith("+972")) {
    cleaned = "0" + cleaned.slice(4);
  }
  // Handle 972 prefix (no +)
  if (cleaned.startsWith("972") && cleaned.length > 9) {
    cleaned = "0" + cleaned.slice(3);
  }
  // Validate: must be 10 digits starting with 05
  if (/^05\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

// ─── Template Placeholders ────────────────────────────────────────

/**
 * Replace {שם}, {תאריך}, etc. in SMS template
 */
export function replacePlaceholders(
  template: string,
  data: SMSPlaceholders
): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    }
  }
  return result;
}

// ─── Quota Management ─────────────────────────────────────────────

/**
 * Check if user has SMS quota remaining. Returns true if can send.
 * Also handles monthly reset.
 */
async function checkAndUpdateQuota(userId: string): Promise<{
  allowed: boolean;
  usage: number;
  quota: number;
}> {
  const settings = await prisma.communicationSetting.findUnique({
    where: { userId },
    select: {
      smsMonthlyQuota: true,
      smsMonthlyUsage: true,
      smsQuotaResetDate: true,
      smsAlertAtPercent: true,
    },
  });

  if (!settings) {
    return { allowed: false, usage: 0, quota: 0 };
  }

  const quota = settings.smsMonthlyQuota ?? 200;
  let usage = settings.smsMonthlyUsage ?? 0;
  const alertPercent = settings.smsAlertAtPercent ?? 80;

  // Monthly reset check — uses Israel calendar month (quota resets at midnight Israel time)
  const now = new Date();
  const resetDate = settings.smsQuotaResetDate;
  if (!resetDate || !isSameIsraelMonth(now, resetDate)) {
    // New month — reset counter
    usage = 0;
    await prisma.communicationSetting.update({
      where: { userId },
      data: {
        smsMonthlyUsage: 0,
        smsQuotaResetDate: now,
      },
    });
  }

  // Check quota
  if (usage >= quota) {
    // Send notification that quota is exhausted
    try {
      await prisma.notification.create({
        data: {
          type: "CUSTOM",
          title: "מכסת SMS נוצלה",
          content: `מכסת ה-SMS החודשית (${quota} הודעות) נוצלה. הודעות ימשיכו להישלח במייל בלבד.`,
          status: "PENDING",
          userId,
        },
      });
    } catch {
      // Don't fail SMS flow if notification fails
    }
    return { allowed: false, usage, quota };
  }

  // Alert at threshold
  const percentUsed = Math.round((usage / quota) * 100);
  if (percentUsed >= alertPercent && percentUsed < alertPercent + 5) {
    try {
      const remaining = quota - usage;
      await prisma.notification.create({
        data: {
          type: "CUSTOM",
          title: `נשארו ${remaining} הודעות SMS`,
          content: `ניצלת ${percentUsed}% ממכסת ה-SMS החודשית (${usage}/${quota}).`,
          status: "PENDING",
          userId,
        },
      });
    } catch {
      // Don't fail SMS flow
    }
  }

  return { allowed: true, usage, quota };
}

/**
 * Increment SMS usage counter after successful send
 */
async function incrementUsage(userId: string): Promise<void> {
  try {
    await prisma.communicationSetting.update({
      where: { userId },
      data: {
        smsMonthlyUsage: { increment: 1 },
      },
    });
  } catch {
    console.error("[SMS] Failed to increment usage counter for user:", userId);
  }
}

// ─── Core Send Function ───────────────────────────────────────────

/**
 * Send a single SMS via Pulseem API.
 * This is the ONLY function that talks to Pulseem —
 * to switch providers, only change this function.
 */
export async function sendSMS(
  phone: string,
  message: string,
  userId: string,
  options?: {
    skipQuotaCheck?: boolean;
    sessionId?: string;
    clientId?: string;
    type?: string;
  }
): Promise<SMSResult> {
  // שבת/יו״ט — חסום מיידי, לפני כל בדיקה או קריאה חיצונית.
  // רושמים log עם status=FAILED + errorMessage=SHABBAT_BLOCKED כדי לשמור רקורד
  //   (מקביל להתנהגות של sendEmail שגם יוצר log FAILED דרך ה-caller).
  if (isShabbatOrYomTov()) {
    logger.info("[sms] חסום בשבת/חג", { to: phone, type: options?.type });
    const normalizedForLog = normalizePhone(phone) ?? phone;
    // Fire-and-forget — אם logSMS נכשל, הזרימה ממשיכה
    void logSMS({
      phone: normalizedForLog,
      message: message.slice(0, 201),
      status: "FAILED",
      error: "SHABBAT_BLOCKED",
      userId,
      sessionId: options?.sessionId,
      clientId: options?.clientId,
      type: options?.type,
    });
    return {
      success: false,
      error: "SHABBAT_BLOCKED",
      shabbatBlocked: true,
    };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[SMS] PULSEEM_API_KEY not set, skipping SMS");
    return { success: false, error: "API key not configured" };
  }

  // Validate phone
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    console.warn("[SMS] Invalid phone number format");
    return { success: false, error: "Invalid phone number" };
  }

  // Check quota
  if (!options?.skipQuotaCheck) {
    const { allowed } = await checkAndUpdateQuota(userId);
    if (!allowed) {
      console.warn("[SMS] Quota exceeded for user:", userId);
      return { success: false, error: "SMS quota exceeded" };
    }
  }

  // Truncate to 201 chars (Pulseem limit for Hebrew)
  const truncatedMessage = message.slice(0, 201);

  try {
    const response = await fetch(PULSEEM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "APIKey": apiKey,
      },
      body: JSON.stringify({
        sendId: `sms-${Date.now()}`,
        smsSendData: {
          fromNumber: getSender(),
          toNumberList: [normalizedPhone],
          referenceList: [options?.sessionId || `ref-${Date.now()}`],
          textList: [truncatedMessage],
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("[SMS] Pulseem API error:", response.status, errorText);

      await logSMS({
        phone: normalizedPhone,
        message: truncatedMessage,
        status: "FAILED",
        error: `HTTP ${response.status}: ${errorText}`,
        userId,
        sessionId: options?.sessionId,
        clientId: options?.clientId,
        type: options?.type,
      });

      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json().catch(() => null);

    if (data?.status !== "Success" || data?.success === 0) {
      const errMsg = data?.error || data?.items?.[0]?.message || "Send failed";
      console.error("[SMS] Pulseem send failed:", errMsg);

      await logSMS({
        phone: normalizedPhone,
        message: truncatedMessage,
        status: "FAILED",
        error: errMsg,
        userId,
        sessionId: options?.sessionId,
        clientId: options?.clientId,
        type: options?.type,
      });

      return { success: false, error: errMsg };
    }

    // Increment usage counter
    await incrementUsage(userId);

    // Log successful send
    await logSMS({
      phone: normalizedPhone,
      message: truncatedMessage,
      status: "SENT",
      userId,
      sessionId: options?.sessionId,
      clientId: options?.clientId,
      type: options?.type,
      messageId: data?.sessionId || undefined,
    });

    return {
      success: true,
      messageId: data?.sessionId || undefined,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[SMS] Send error:", errMsg);

    await logSMS({
      phone: normalizedPhone,
      message: truncatedMessage,
      status: "FAILED",
      error: errMsg,
      userId,
      sessionId: options?.sessionId,
      clientId: options?.clientId,
      type: options?.type,
    });

    return { success: false, error: errMsg };
  }
}

// ─── Bulk Send ────────────────────────────────────────────────────

/**
 * Send SMS to multiple recipients (up to 2500 per Pulseem limit)
 */
export async function sendBulkSMS(
  messages: Array<{ phone: string; message: string }>,
  userId: string
): Promise<{ success: number; failed: number; errors: string[] }> {
  const results = { success: 0, failed: 0, errors: [] as string[] };

  for (const msg of messages) {
    const result = await sendSMS(msg.phone, msg.message, userId);
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      if (result.error) results.errors.push(result.error);
    }
  }

  return results;
}

// ─── Communication Log ────────────────────────────────────────────

async function logSMS(params: {
  phone: string;
  message: string;
  status: "SENT" | "FAILED";
  error?: string;
  userId: string;
  sessionId?: string;
  clientId?: string;
  type?: string;
  messageId?: string;
}): Promise<void> {
  try {
    await prisma.communicationLog.create({
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: (params.type || "CUSTOM") as any,
        channel: "SMS",
        recipient: params.phone,
        subject: "SMS",
        content: params.message,
        status: params.status,
        errorMessage: params.error || null,
        sentAt: params.status === "SENT" ? new Date() : null,
        messageId: params.messageId || null,
        isRead: false,
        sessionId: params.sessionId || null,
        clientId: params.clientId || null,
        userId: params.userId,
      },
    });
  } catch (error) {
    console.error("[SMS] Failed to log SMS:", error);
  }
}

// ─── Helper: Send SMS if enabled ──────────────────────────────────

/**
 * High-level helper used by cron jobs and API routes.
 * Checks if SMS is enabled for this type, sends if yes.
 * Never throws — returns result silently.
 */
export async function sendSMSIfEnabled(params: {
  userId: string;
  phone: string | null | undefined;
  template: string | null | undefined;
  defaultTemplate: string;
  placeholders: SMSPlaceholders;
  settingKey: string;
  sessionId?: string;
  clientId?: string;
  type?: string;
}): Promise<SMSResult> {
  // No phone? Skip silently
  if (!params.phone) {
    return { success: false, error: "No phone number" };
  }

  // Shabbat/Yom Tov — fast-path מוקדם כדי לחסוך 2 שאילתות DB (communicationSetting + sMSSettings).
  // רושמים log עם status=FAILED + SHABBAT_BLOCKED — עקביות מול sendSMS הישיר שכן רושם log.
  if (isShabbatOrYomTov()) {
    logger.info("[sms] חסום בשבת/חג (sendSMSIfEnabled early-gate)", {
      to: params.phone,
      type: params.type,
    });
    const normalizedForLog = normalizePhone(params.phone) ?? params.phone;
    void logSMS({
      phone: normalizedForLog,
      // נבנה הודעה מהתבנית כדי שיהיה רקורד שימושי (מקוצץ ל-201 תווים כמו שליחה רגילה)
      message: replacePlaceholders(
        params.template || params.defaultTemplate,
        params.placeholders,
      ).slice(0, 201),
      status: "FAILED",
      error: "SHABBAT_BLOCKED",
      userId: params.userId,
      sessionId: params.sessionId,
      clientId: params.clientId,
      type: params.type,
    });
    return { success: false, error: "SHABBAT_BLOCKED", shabbatBlocked: true };
  }

  // Check if this SMS type is enabled
  const settings = await prisma.communicationSetting.findUnique({
    where: { userId: params.userId },
  });

  if (!settings) {
    return { success: false, error: "No settings found" };
  }

  // Check SMS master switch (from SMSSettings)
  const smsSettings = await prisma.sMSSettings.findUnique({
    where: { therapistId: params.userId },
  });

  if (!smsSettings?.enabled) {
    return { success: false, error: "SMS disabled" };
  }

  // Check specific type toggle
  const isEnabled = (settings as Record<string, unknown>)[params.settingKey];
  if (!isEnabled) {
    return { success: false, error: `${params.settingKey} is disabled` };
  }

  // Build message from template
  const template = params.template || params.defaultTemplate;
  const message = replacePlaceholders(template, params.placeholders);

  // Send
  return sendSMS(params.phone, message, params.userId, {
    sessionId: params.sessionId,
    clientId: params.clientId,
    type: params.type,
  });
}
