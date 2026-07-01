import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { sendSMS } from "@/lib/sms";
import { logger } from "@/lib/logger";
import { escapeHtml, sanitizeEmailSubject } from "@/lib/email-utils";
import { getClientIp } from "@/lib/get-client-ip";
import {
  checkRateLimit,
  rateLimitResponse,
  BOOKING_GET_RATE_LIMIT,
  BOOKING_TOKEN_POST_RATE_LIMIT,
} from "@/lib/rate-limit";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import { generateOtp, hashOtp, verifyOtp, maskEmail } from "@/lib/clinic-invitations";
import {
  BOOKING_TOKEN_REGEX,
  evaluateBookingLinkAccess,
  evaluateOtpSend,
  evaluateOtpAttempt,
  applyFailedOtpAttempt,
  isOtpSessionVerified,
  computeOtpExpiresAt,
  maskPhone,
} from "@/lib/booking-links";
import { verifyOtpSchema } from "@/lib/validations/booking";
import {
  createCancellationRequestToClientEmail,
  createCancellationRequestToTherapistEmail,
  formatSessionDateTime,
} from "@/lib/email-templates";

// עמוד "הפגישות שלי" — קישור ציבורי לניהול/ביטול פגישות ע"י המטופל, בלי התחברות.
// אימות דרך OTP (מייל/SMS) על אותו BookingLink של המטופל. הביטול יוצר
// CancellationRequest קיימת → המטפל מאשר/דוחה בדף הניהול.
export const dynamic = "force-dynamic";

const SHABBAT_MESSAGE =
  "המערכת סגורה בשבת ובחגים. ניתן לנסות שוב במוצאי שבת/חג.";

// ─── טעינת הקישור + פרטי המטופל ─────────────────────────────────────────────
async function loadLink(token: string) {
  return prisma.bookingLink.findUnique({
    where: { token },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      therapistId: true,
      clientId: true,
      destinationEmail: true,
      destinationPhone: true,
      otpHash: true,
      otpExpiresAt: true,
      otpAttempts: true,
      otpSendCount: true,
      otpSendWindowAt: true,
      lastOtpSentAt: true,
      otpVerifiedAt: true,
      client: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
}

type LoadedLink = NonNullable<Awaited<ReturnType<typeof loadLink>>>;

function destinationMaskOf(link: {
  destinationEmail: string | null;
  destinationPhone: string | null;
}): { channel: "email" | "sms" | null; masked: string | null } {
  if (link.destinationEmail) return { channel: "email", masked: maskEmail(link.destinationEmail) };
  if (link.destinationPhone) return { channel: "sms", masked: maskPhone(link.destinationPhone) };
  return { channel: null, masked: null };
}

// האם ביטול-ע"י-מטופל מופעל אצל המטפל/ת. שער-על לכל הפעולות בעמוד.
async function isCancellationEnabled(therapistId: string): Promise<{
  enabled: boolean;
  minHours: number;
  therapistName: string | null;
}> {
  const [settings, therapist] = await Promise.all([
    prisma.communicationSetting.findUnique({ where: { userId: therapistId } }),
    prisma.user.findUnique({ where: { id: therapistId }, select: { name: true } }),
  ]);
  return {
    enabled: settings ? settings.allowClientCancellation : true,
    minHours: settings?.minCancellationHours ?? 24,
    therapistName: therapist?.name ?? null,
  };
}

// ─── GET — מטא + (אם מאומת) רשימת הפגישות הקרובות ────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`appt-manage-get:${ip}`, BOOKING_GET_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  const { token } = await params;
  if (!BOOKING_TOKEN_REGEX.test(token ?? "")) {
    return NextResponse.json({ message: "קישור לא תקין" }, { status: 400 });
  }

  const link = await loadLink(token);
  if (!link) {
    return NextResponse.json({ message: "הקישור לא נמצא" }, { status: 404 });
  }

  const gate = await isCancellationEnabled(link.therapistId);
  const base = { therapistName: gate.therapistName || "המטפל/ת" };

  if (!gate.enabled) {
    return NextResponse.json(
      { ...base, message: "ביטול תור אונליין אינו זמין. נא ליצור קשר ישירות." },
      { status: 404 }
    );
  }

  const access = evaluateBookingLinkAccess(link);
  if (!access.ok) {
    return NextResponse.json(
      { ...base, message: access.message, accessError: access.reason },
      { status: 410 }
    );
  }

  if (isShabbatOrYomTov()) {
    return NextResponse.json({ ...base, shabbatBlocked: true, shabbatMessage: SHABBAT_MESSAGE });
  }

  if (!isOtpSessionVerified(link)) {
    const dest = destinationMaskOf(link);
    return NextResponse.json({
      ...base,
      verified: false,
      requiresVerification: true,
      otpChannel: dest.channel,
      destinationMasked: dest.masked,
    });
  }

  // מאומת — מחזירים את הפגישות הקרובות (SCHEDULED / PENDING_CANCELLATION) של
  // המטופל בלבד. שדות אדמיניסטרטיביים בלבד (מינימום PHI: מטפל + מועד).
  const appointments = await getUpcomingAppointments(link.clientId, gate.minHours);
  return NextResponse.json({ ...base, verified: true, appointments });
}

// שולף פגישות עתידיות של המטופל + מחשב אם ניתנות לביטול לפי חלון המטפל.
async function getUpcomingAppointments(clientId: string, minHours: number) {
  const now = new Date();
  const rows = await prisma.therapySession.findMany({
    where: {
      clientId,
      startTime: { gt: now },
      status: { in: ["SCHEDULED", "PENDING_CANCELLATION"] },
      type: { not: "BREAK" },
    },
    select: {
      id: true,
      startTime: true,
      status: true,
      therapist: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
    take: 50,
  });

  return rows.map((s) => {
    const hoursUntil = (s.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    const pending = s.status === "PENDING_CANCELLATION";
    const cancellable = !pending && hoursUntil >= minHours;
    return {
      id: s.id,
      startTime: s.startTime.toISOString(),
      therapistName: s.therapist?.name || "המטפל/ת",
      pending,
      cancellable,
      // סיבה כשלא ניתן לבטל — לתצוגה בלבד.
      blockedReason: pending
        ? "בקשת ביטול כבר ממתינה"
        : !cancellable
          ? `לא ניתן לבטל פחות מ-${minHours} שעות לפני התור`
          : null,
    };
  });
}

// ─── POST — send-otp / verify-otp / cancel ──────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`appt-manage-post:${ip}`, BOOKING_TOKEN_POST_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  const { token } = await params;
  if (!BOOKING_TOKEN_REGEX.test(token ?? "")) {
    return NextResponse.json({ message: "קישור לא תקין" }, { status: 400 });
  }

  const action = new URL(request.url).searchParams.get("action");

  const link = await loadLink(token);
  if (!link) {
    return NextResponse.json({ message: "הקישור לא נמצא" }, { status: 404 });
  }

  const gate = await isCancellationEnabled(link.therapistId);
  if (!gate.enabled) {
    return NextResponse.json(
      { message: "ביטול תור אונליין אינו זמין. נא ליצור קשר ישירות." },
      { status: 404 }
    );
  }

  const access = evaluateBookingLinkAccess(link);
  if (!access.ok) {
    return NextResponse.json({ message: access.message, accessError: access.reason }, { status: 410 });
  }

  if (action === "send-otp") return handleSendOtp(link, gate.therapistName);
  if (action === "verify-otp") return handleVerifyOtp(request, link);
  if (action === "cancel") return handleCancel(request, link, gate.minHours);

  return NextResponse.json({ message: "פעולה לא תקינה" }, { status: 400 });
}

// ─── שליחת קוד אימות ─────────────────────────────────────────────────────────
async function handleSendOtp(link: LoadedLink, therapistNameArg: string | null) {
  if (isShabbatOrYomTov()) {
    return NextResponse.json({ message: SHABBAT_MESSAGE, shabbatBlocked: true }, { status: 403 });
  }

  const dest = destinationMaskOf(link);
  if (!dest.channel) {
    return NextResponse.json(
      { message: "לא נמצאו פרטי קשר לשליחת הקוד. נא לפנות למטפל/ת." },
      { status: 400 }
    );
  }

  const decision = evaluateOtpSend(link);
  if (!decision.allowed) {
    return NextResponse.json({ message: decision.message }, { status: 429 });
  }

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const therapistName = therapistNameArg || "המטפל/ת";

  let sendOk = false;
  if (link.destinationEmail) {
    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
        <h2 style="color: #0f766e;">קוד אימות לצפייה בפגישות</h2>
        <p>קוד האימות שלך לניהול הפגישות אצל ${escapeHtml(therapistName)}:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0f766e; text-align: center; margin: 24px 0;">${otp}</div>
        <p style="color: #666; font-size: 14px;">הקוד תקף ל-10 דקות. אם לא ביקשת קוד זה, ניתן להתעלם מהודעה זו.</p>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
      </div>`;
    const result = await sendEmail({
      to: link.destinationEmail,
      subject: sanitizeEmailSubject(`קוד אימות לניהול פגישות - ${therapistName}`),
      html,
    });
    if (result.shabbatBlocked) {
      return NextResponse.json({ message: SHABBAT_MESSAGE, shabbatBlocked: true }, { status: 403 });
    }
    sendOk = result.success;
  } else if (link.destinationPhone) {
    const result = await sendSMS(
      link.destinationPhone,
      `קוד האימות שלך לניהול פגישות אצל ${therapistName}: ${otp} (תקף ל-10 דקות)`,
      link.therapistId,
      { skipQuotaCheck: true, clientId: link.clientId, type: "BOOKING_OTP" }
    );
    if (result.shabbatBlocked) {
      return NextResponse.json({ message: SHABBAT_MESSAGE, shabbatBlocked: true }, { status: 403 });
    }
    sendOk = result.success;
  }

  if (!sendOk) {
    logger.error("[ApptManage] OTP send failed", { linkId: link.id, channel: dest.channel });
    return NextResponse.json({ message: "שליחת הקוד נכשלה. נא לנסות שוב בעוד רגע." }, { status: 502 });
  }

  const now = new Date();
  await prisma.bookingLink.update({
    where: { id: link.id },
    data: {
      otpHash,
      otpExpiresAt: computeOtpExpiresAt(now),
      otpAttempts: 0,
      lastOtpSentAt: now,
      otpSendCount: decision.otpSendCount,
      otpSendWindowAt: decision.otpSendWindowAt,
    },
  });

  return NextResponse.json({ sent: true, channel: dest.channel, destinationMasked: dest.masked });
}

// ─── אימות קוד ───────────────────────────────────────────────────────────────
async function handleVerifyOtp(request: NextRequest, link: LoadedLink) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
  }
  const parsed = verifyOtpSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "קוד אימות חייב להיות 6 ספרות" }, { status: 400 });
  }

  const state = evaluateOtpAttempt(link);
  if (!state.canAttempt) {
    const status = state.reason === "locked" ? 423 : 400;
    return NextResponse.json({ message: state.message, reason: state.reason }, { status });
  }

  const match = await verifyOtp(parsed.data.otp, link.otpHash as string);
  if (!match) {
    const { otpAttempts, nowBlocked } = applyFailedOtpAttempt(link.otpAttempts);
    if (nowBlocked) {
      await prisma.bookingLink.update({
        where: { id: link.id },
        data: { otpAttempts: 0, otpHash: null, otpExpiresAt: null },
      });
      return NextResponse.json(
        { message: "יותר מדי ניסיונות שגויים. נא לבקש קוד אימות חדש.", reason: "retry_new_code" },
        { status: 429 }
      );
    }
    await prisma.bookingLink.update({ where: { id: link.id }, data: { otpAttempts } });
    const remaining = Math.max(0, 5 - otpAttempts);
    return NextResponse.json({ message: `קוד שגוי. נותרו ${remaining} ניסיונות.`, remaining }, { status: 400 });
  }

  const now = new Date();
  await prisma.bookingLink.update({
    where: { id: link.id },
    data: { otpVerifiedAt: now, otpHash: null, otpExpiresAt: null, otpAttempts: 0 },
  });

  return NextResponse.json({ verified: true });
}

// ─── ביטול פגישה בודדת ──────────────────────────────────────────────────────
const cancelSchema = z.object({
  sessionId: z.string().min(1).max(64),
  reason: z.string().max(500, "סיבת ביטול ארוכה מדי").optional().or(z.literal("")),
});

async function handleCancel(request: NextRequest, link: LoadedLink, minHours: number) {
  if (!isOtpSessionVerified(link)) {
    return NextResponse.json(
      { message: "נא לאמת את הקוד לפני ביטול תור.", reason: "not_verified" },
      { status: 403 }
    );
  }

  if (isShabbatOrYomTov()) {
    return NextResponse.json({ message: SHABBAT_MESSAGE, shabbatBlocked: true }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
  }
  const parsed = cancelSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "בקשה לא תקינה" }, { status: 400 });
  }
  const { sessionId, reason } = parsed.data;

  // ⭐ בעלות: הפגישה חייבת להיות של המטופל שמזוהה עם ה-token (clientId מה-link).
  // גוף הבקשה לא נסמך לזהות — clientId נלקח מה-token בלבד (מונע IDOR).
  const therapySession = await prisma.therapySession.findFirst({
    where: { id: sessionId, clientId: link.clientId },
    include: { client: true, therapist: true },
  });

  if (!therapySession || !therapySession.client) {
    return NextResponse.json({ message: "הפגישה לא נמצאה" }, { status: 404 });
  }

  if (therapySession.status === "CANCELLED") {
    return NextResponse.json({ message: "הפגישה כבר מבוטלת" }, { status: 400 });
  }
  if (therapySession.status === "PENDING_CANCELLATION") {
    return NextResponse.json({ message: "כבר קיימת בקשת ביטול ממתינה לפגישה זו" }, { status: 400 });
  }
  if (therapySession.status !== "SCHEDULED") {
    return NextResponse.json({ message: "לא ניתן לבטל פגישה זו" }, { status: 400 });
  }

  const hoursUntilSession =
    (therapySession.startTime.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntilSession < minHours) {
    return NextResponse.json(
      { message: `לא ניתן לבטל פחות מ-${minHours} שעות לפני הפגישה. נא ליצור קשר ישירות.` },
      { status: 400 }
    );
  }

  // יצירת בקשת הביטול + עדכון סטטוס — זהה לזרימת request-cancellation הפנימית.
  await prisma.cancellationRequest.create({
    data: { sessionId, clientId: link.clientId, reason: reason || null, status: "PENDING" },
  });
  await prisma.therapySession.update({
    where: { id: sessionId },
    data: {
      status: "PENDING_CANCELLATION",
      cancellationReason: reason || null,
      cancellationRequestedAt: new Date(),
    },
  });

  // התראה למטפל.
  await prisma.notification.create({
    data: {
      userId: therapySession.therapistId,
      type: "CANCELLATION_REQUEST",
      title: `בקשת ביטול מ${therapySession.client.name}`,
      content: reason ? `סיבה: ${reason}` : "לא צוינה סיבה",
      status: "PENDING",
    },
  });

  const { date, time } = formatSessionDateTime(therapySession.startTime);
  const therapistName = therapySession.therapist?.name || "המטפל/ת שלך";

  // מייל אישור למטופל.
  if (therapySession.client.email) {
    const clientEmail = createCancellationRequestToClientEmail({
      clientName: therapySession.client.name,
      therapistName,
      date,
      time,
    });
    const r = await sendEmail({
      to: therapySession.client.email,
      subject: clientEmail.subject,
      html: clientEmail.html,
    });
    try {
      await prisma.communicationLog.create({
        data: {
          type: "CANCELLATION_REQUEST_TO_CLIENT",
          channel: "EMAIL",
          recipient: therapySession.client.email,
          subject: clientEmail.subject,
          content: clientEmail.html,
          status: r.success ? "SENT" : "FAILED",
          errorMessage: r.success ? null : String(r.error),
          sentAt: r.success ? new Date() : null,
          messageId: r.messageId || null,
          sessionId,
          clientId: link.clientId,
          userId: therapySession.therapistId,
        },
      });
    } catch { /* לוג בלבד */ }
  }

  // מייל התראה למטפל.
  if (therapySession.therapist?.email) {
    const dashboardLink = `${process.env.NEXTAUTH_URL || ""}/dashboard/cancellation-requests`;
    const therapistEmail = createCancellationRequestToTherapistEmail({
      clientName: therapySession.client.name,
      therapistName,
      date,
      time,
      reason: reason || undefined,
      dashboardLink,
    });
    const r = await sendEmail({
      to: therapySession.therapist.email,
      subject: therapistEmail.subject,
      html: therapistEmail.html,
    });
    try {
      await prisma.communicationLog.create({
        data: {
          type: "CANCELLATION_REQUEST_TO_THERAPIST",
          channel: "EMAIL",
          recipient: therapySession.therapist.email,
          subject: therapistEmail.subject,
          content: therapistEmail.html,
          status: r.success ? "SENT" : "FAILED",
          errorMessage: r.success ? null : String(r.error),
          sentAt: r.success ? new Date() : null,
          messageId: r.messageId || null,
          sessionId,
          clientId: link.clientId,
          userId: therapySession.therapistId,
        },
      });
    } catch { /* לוג בלבד */ }
  }

  return NextResponse.json({
    success: true,
    message: "בקשת הביטול נשלחה. המטפל/ת יבדוק/תבדוק ותעדכן אותך.",
  });
}
