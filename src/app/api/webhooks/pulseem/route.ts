import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * בדיקת חתימת HMAC-SHA256 בצורה timing-safe.
 * מקבל את ה-body הגולמי, את הערך שהגיע בכותרת, ואת הסוד.
 */
function verifyHmacSignature(rawBody: string, provided: string, secret: string): boolean {
  try {
    // מסירים קידומת אופציונלית "sha256="
    const cleanProvided = provided.replace(/^sha256=/i, "").trim();
    if (!cleanProvided) return false;

    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    const providedBuf = Buffer.from(cleanProvided, "hex");
    const expectedBuf = Buffer.from(expected, "hex");

    if (providedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(providedBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Pulseem Incoming SMS Webhook
 *
 * Pulseem שולח POST כשמטופל מחזיר SMS.
 * הפורמט המצופה (לפי Pulseem API docs):
 *   { "from": "05XXXXXXXX", "to": "05XXXXXXXX", "text": "...", "messageId": "..." }
 *
 * אם Pulseem שולח בפורמט אחר — נתמוך גם בשדות חלופיים:
 *   sender/originator, recipient/destination, body/content/message
 */

// Normalize Israeli phone: strip +972/972, dashes, spaces → 05XXXXXXXX
function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-\.\(\)]/g, "");
  if (cleaned.startsWith("+972")) cleaned = "0" + cleaned.slice(4);
  if (cleaned.startsWith("972") && cleaned.length > 9) cleaned = "0" + cleaned.slice(3);
  if (/^05\d{8}$/.test(cleaned)) return cleaned;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // --- קריאת ה-body כטקסט גולמי (נחוץ לאימות HMAC) ---
    const rawBody = await request.text();

    // --- אימות — בסדר עדיפות: HMAC > Bearer token ---
    const hmacSecret = process.env.PULSEEM_HMAC_SECRET;
    const bearerSecret = process.env.PULSEEM_WEBHOOK_SECRET;

    if (hmacSecret) {
      // HMAC מוגדר — חייב להיות תקין (הגנה חזקה)
      const providedSig =
        request.headers.get("x-pulseem-signature") ||
        request.headers.get("x-signature") ||
        request.headers.get("x-hub-signature-256") ||
        "";
      if (!providedSig) {
        logger.error("[Pulseem Webhook] Missing HMAC signature header");
        return NextResponse.json({ error: "Missing signature" }, { status: 401 });
      }
      if (!verifyHmacSignature(rawBody, providedSig, hmacSecret)) {
        logger.error("[Pulseem Webhook] Invalid HMAC signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else if (bearerSecret) {
      // HMAC לא מוגדר — נופלים חזרה ל-Bearer token (תאימות לאחור)
      const authHeader = request.headers.get("authorization") || "";
      const queryToken = new URL(request.url).searchParams.get("token");
      const provided = authHeader.replace("Bearer ", "") || queryToken || "";
      if (provided !== bearerSecret) {
        logger.error("[Pulseem Webhook] Invalid auth token");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      logger.error("[Pulseem Webhook] Invalid JSON body");
      return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
    }
    logger.info("[Pulseem Webhook] Received:", { data: body });

    // --- חילוץ שדות (תמיכה במספר פורמטים) ---
    const senderPhone = normalizePhone(
      body.from || body.sender || body.originator || ""
    );
    const recipientPhone = normalizePhone(
      body.to || body.recipient || body.destination || ""
    );
    const messageText =
      body.text || body.body || body.content || body.message || "";
    const externalMessageId =
      body.messageId || body.message_id || body.id || "";

    if (!senderPhone || !messageText) {
      logger.error("[Pulseem Webhook] Missing sender or text", {
        senderPhone,
        messageText: messageText ? "(has text)" : "(empty)",
      });
      // מחזירים 200 כדי שPulseem לא ינסה שוב
      return NextResponse.json({ message: "Missing required fields" });
    }

    // --- בדיקת כפילויות ---
    if (externalMessageId) {
      const existing = await prisma.communicationLog.findFirst({
        where: { messageId: externalMessageId },
      });
      if (existing) {
        logger.info("[Pulseem Webhook] Duplicate, skipping:", {
          data: externalMessageId,
        });
        return NextResponse.json({ message: "Duplicate, already processed" });
      }
    }

    // --- זיהוי מטופל לפי מספר טלפון ---
    // אסטרטגיה 1: חיפוש ישיר בטלפון של המטופל
    let client = await prisma.client.findFirst({
      where: {
        phone: senderPhone,
      },
    });

    // אסטרטגיה 2: חיפוש עם +972 (אם שמור בפורמט בינלאומי)
    if (!client && senderPhone.startsWith("0")) {
      const intlPhone = "+972" + senderPhone.slice(1);
      client = await prisma.client.findFirst({
        where: { phone: intlPhone },
      });
    }

    // אסטרטגיה 3: חיפוש ב-SMS יוצא אחרון לאותו מספר
    let therapistId: string | null = null;

    if (client) {
      therapistId = client.therapistId;
    } else {
      // אם לא מצאנו מטופל — חיפוש ב-CommunicationLog ל-SMS שנשלח לאותו מספר
      const lastSentSms = await prisma.communicationLog.findFirst({
        where: {
          channel: "SMS",
          recipient: senderPhone,
          status: "SENT",
          userId: { not: null },
        },
        orderBy: { sentAt: "desc" },
        include: { client: true },
      });

      if (lastSentSms) {
        client = lastSentSms.client;
        therapistId = lastSentSms.userId;
      }
    }

    if (!therapistId) {
      logger.warn("[Pulseem Webhook] Could not find therapist for phone:", {
        senderPhone,
      });
      return NextResponse.json({
        message: "Client/therapist not found for sender phone",
      });
    }

    // --- שמירה ב-CommunicationLog ---
    const incomingLog = await prisma.communicationLog.create({
      data: {
        type: "INCOMING_SMS",
        channel: "SMS",
        recipient: recipientPhone || process.env.PULSEEM_SENDER || "",
        subject: "SMS",
        content: messageText,
        status: "RECEIVED",
        sentAt: new Date(),
        messageId: externalMessageId || `pulseem-in-${Date.now()}`,
        isRead: false,
        clientId: client?.id || null,
        userId: therapistId,
      },
    });

    logger.info("[Pulseem Webhook] Saved incoming SMS:", {
      data: incomingLog.id,
    });

    // --- יצירת התראה למטפל ---
    await prisma.notification.create({
      data: {
        userId: therapistId,
        type: "CUSTOM",
        title: `הודעת SMS חדשה מ-${client?.name || senderPhone}`,
        content: messageText.length > 100
          ? messageText.slice(0, 100) + "..."
          : messageText,
        status: "PENDING",
        sentAt: new Date(),
      },
    });

    logger.info("[Pulseem Webhook] Created notification for therapist:", {
      data: therapistId,
    });

    return NextResponse.json({
      message: "Incoming SMS processed successfully",
      logId: incomingLog.id,
    });
  } catch (error) {
    logger.error("[Pulseem Webhook] Error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    // מחזירים 200 כדי שPulseem לא ינסה שוב
    return NextResponse.json(
      { message: "Error processing webhook", error: String(error) },
      { status: 200 }
    );
  }
}
