import { prisma } from "./prisma";

// ─── Pulseem API Configuration (Campaign API) ───────────────────
const PULSEEM_CREATE_URL = "https://ui-api.pulseem.com/api/v1/SmsCampaignApi/CreateSmsCampaign";
const PULSEEM_SEND_URL = "https://ui-api.pulseem.com/api/v1/SmsCampaignApi/SendSmsCampaign";

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

  // Monthly reset check
  const now = new Date();
  const resetDate = settings.smsQuotaResetDate;
  if (!resetDate || now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
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
    const headers = {
      "Content-Type": "application/json",
      "APIKey": apiKey,
    };

    // Step 1: Create campaign
    const createRes = await fetch(PULSEEM_CREATE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: `SMS-${Date.now()}`,
        fromNumber: getSender(),
        text: truncatedMessage,
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text().catch(() => "Unknown error");
      console.error("[SMS] Pulseem create campaign error:", createRes.status, errorText);

      await logSMS({
        phone: normalizedPhone,
        message: truncatedMessage,
        status: "FAILED",
        error: `Create campaign: HTTP ${createRes.status}: ${errorText}`,
        userId,
        sessionId: options?.sessionId,
        clientId: options?.clientId,
        type: options?.type,
      });

      return { success: false, error: `API error: ${createRes.status}` };
    }

    const createData = await createRes.json().catch(() => null);
    const campaignId = createData?.data?.smsCampaignId;

    if (!campaignId) {
      const errMsg = createData?.message || "No campaign ID returned";
      console.error("[SMS] Pulseem create failed:", errMsg);

      await logSMS({
        phone: normalizedPhone,
        message: truncatedMessage,
        status: "FAILED",
        error: `Create campaign: ${errMsg}`,
        userId,
        sessionId: options?.sessionId,
        clientId: options?.clientId,
        type: options?.type,
      });

      return { success: false, error: errMsg };
    }

    // Step 2: Send campaign to specific phone
    const sendRes = await fetch(PULSEEM_SEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        smsCampaignID: campaignId,
        isTest: false,
        sendingDetails: [{
          cellphone: normalizedPhone,
        }],
      }),
    });

    const sendData = await sendRes.json().catch(() => null);

    if (!sendRes.ok || sendData?.status !== "Success") {
      const errMsg = sendData?.message || sendData?.error || `HTTP ${sendRes.status}`;
      console.error("[SMS] Pulseem send error:", errMsg);

      await logSMS({
        phone: normalizedPhone,
        message: truncatedMessage,
        status: "FAILED",
        error: `Send campaign: ${errMsg}`,
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
      messageId: sendData?.sessionId || undefined,
    });

    return {
      success: true,
      messageId: sendData?.sessionId || undefined,
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
