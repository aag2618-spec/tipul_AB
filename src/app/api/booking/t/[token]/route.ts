import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { sendSMS, sendSMSIfEnabled } from "@/lib/sms";
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
import { syncSessionToGoogleCalendar } from "@/lib/google-calendar-sync";
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
import {
  DATE_RE,
  TIME_RE,
  toIsraelDate,
  getIsraelDayOfWeek,
  formatIsraelDate,
  applyShabbatLimits,
  generateTimeSlots,
} from "@/lib/booking-core";
import { verifyOtpSchema, tokenBookingSchema } from "@/lib/validations/booking";

export const dynamic = "force-dynamic";

const SHABBAT_MESSAGE =
  "מערכת הזימון סגורה בשבת ובחגים. ניתן להזמין במוצאי שבת/חג.";

// טוען את הקישור האישי עם פרטי המטופל. select מצומצם — לא חושפים שדות רגישים מיותרים.
async function loadLink(token: string) {
  return prisma.bookingLink.findUnique({
    where: { token },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      therapistId: true,
      organizationId: true,
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
      client: {
        select: { id: true, name: true, email: true, phone: true, defaultSessionPrice: true },
      },
    },
  });
}

function destinationMaskOf(link: { destinationEmail: string | null; destinationPhone: string | null }): {
  channel: "email" | "sms" | null;
  masked: string | null;
} {
  if (link.destinationEmail) return { channel: "email", masked: maskEmail(link.destinationEmail) };
  if (link.destinationPhone) return { channel: "sms", masked: maskPhone(link.destinationPhone) };
  return { channel: null, masked: null };
}

// ─── GET — מידע לקישור + שעות פנויות. לא חושף שם/מייל מלא לפני אימות. ─────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`booking-token-get:${ip}`, BOOKING_GET_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  const { token } = await params;
  if (!BOOKING_TOKEN_REGEX.test(token ?? "")) {
    return NextResponse.json({ message: "קישור לא תקין" }, { status: 400 });
  }

  const link = await loadLink(token);
  if (!link) {
    return NextResponse.json({ message: "הקישור לא נמצא" }, { status: 404 });
  }

  const settings = await prisma.bookingSettings.findUnique({
    where: { therapistId: link.therapistId },
    include: { therapist: { select: { name: true, image: true } } },
  });

  if (!settings || !settings.enabled) {
    return NextResponse.json(
      { message: "הזימון העצמי של המטפל/ת אינו פעיל כרגע" },
      { status: 404 }
    );
  }

  const therapistName = settings.therapist.name || "המטפל/ת";
  const baseResponse = {
    therapistName,
    therapistImage: settings.therapist.image,
    sessionDuration: settings.sessionDuration,
    welcomeMessage: settings.welcomeMessage,
    maxAdvanceDays: settings.maxAdvanceDays,
  };

  const access = evaluateBookingLinkAccess(link);
  if (!access.ok) {
    return NextResponse.json(
      { ...baseResponse, message: access.message, accessError: access.reason },
      { status: 410 }
    );
  }

  // שבת/חג — הטופס אינו זמין כלל.
  if (isShabbatOrYomTov()) {
    return NextResponse.json({
      ...baseResponse,
      shabbatBlocked: true,
      shabbatMessage: SHABBAT_MESSAGE,
    });
  }

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");

  // האם כבר אומת (רענון דף בתוך חלון 30 דק') — אם כן, מחזירים שם+מייל לנעילה בטופס.
  const verified = isOtpSessionVerified(link);
  const identity = verified
    ? { clientName: link.client.name, clientEmail: link.client.email }
    : {};

  // בקשת שעות פנויות לתאריך — זמינות אינה מידע רפואי, מותרת עם token תקין.
  if (dateStr) {
    if (!DATE_RE.test(dateStr) || isNaN(new Date(`${dateStr}T12:00:00Z`).getTime())) {
      return NextResponse.json({ message: "תאריך לא תקין" }, { status: 400 });
    }
    const dayOfWeek = getIsraelDayOfWeek(dateStr);
    const workingHours = (settings.workingHours ?? {}) as Record<
      string,
      { start: string; end: string; enabled: boolean }
    >;
    const dayConfig = workingHours[dayOfWeek.toString()];
    if (!dayConfig || !dayConfig.enabled) {
      return NextResponse.json({ ...baseResponse, ...identity, verified, slots: [] });
    }
    const limits = applyShabbatLimits(dayOfWeek, dayConfig.start, dayConfig.end);
    const startOfDay = toIsraelDate(dateStr, "00:00");
    const endOfDay = new Date(toIsraelDate(dateStr, "23:59").getTime() + 59999);
    const existingSessions = await prisma.therapySession.findMany({
      where: {
        therapistId: settings.therapistId,
        startTime: { gte: startOfDay },
        endTime: { lte: endOfDay },
        status: { notIn: ["CANCELLED"] },
      },
      select: { startTime: true, endTime: true },
    });
    const breaks = (settings.breaks as Array<{ start: string; end: string }>) || [];
    const slots = generateTimeSlots(
      dateStr,
      limits.start,
      limits.end,
      settings.sessionDuration,
      settings.bufferBetween,
      settings.minAdvanceHours,
      existingSessions,
      breaks
    );
    return NextResponse.json({ ...baseResponse, ...identity, verified, slots });
  }

  // מידע ראשוני — ללא שעות.
  const workingHours = (settings.workingHours ?? {}) as Record<
    string,
    { start: string; end: string; enabled: boolean }
  >;
  const enabledDays = Object.entries(workingHours)
    .filter(([, v]) => v.enabled)
    .map(([k]) => parseInt(k));
  const dest = destinationMaskOf(link);

  return NextResponse.json({
    ...baseResponse,
    ...identity,
    verified,
    enabledDays,
    requiresVerification: true,
    otpChannel: dest.channel, // "email" | "sms" | null — איזה ערוץ ישמש לקוד
  });
}

// ─── POST — מנתב לפי action: send-otp / verify-otp / create ──────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`booking-token-post:${ip}`, BOOKING_TOKEN_POST_RATE_LIMIT);
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

  // gate ראשון — מצב הקישור (לפני כל פעולה).
  const access = evaluateBookingLinkAccess(link);
  if (!access.ok) {
    return NextResponse.json({ message: access.message, accessError: access.reason }, { status: 410 });
  }

  if (action === "send-otp") return handleSendOtp(link);
  if (action === "verify-otp") return handleVerifyOtp(request, link);
  if (action === "create") return handleCreate(request, link);

  return NextResponse.json({ message: "פעולה לא תקינה" }, { status: 400 });
}

type LoadedLink = NonNullable<Awaited<ReturnType<typeof loadLink>>>;

// ─── שליחת קוד אימות ─────────────────────────────────────────────────────────
async function handleSendOtp(link: LoadedLink) {
  // מתג ראשי — אם הזימון העצמי כבוי, אין שליחה.
  const settings = await prisma.bookingSettings.findUnique({
    where: { therapistId: link.therapistId },
    include: { therapist: { select: { name: true } } },
  });
  if (!settings || !settings.enabled) {
    return NextResponse.json(
      { message: "הזימון העצמי של המטפל/ת אינו פעיל כרגע" },
      { status: 404 }
    );
  }

  // שבת/חג — אי אפשר לשלוח קוד (גם sendEmail/sendSMS חוסמים). מסר ברור.
  if (isShabbatOrYomTov()) {
    return NextResponse.json(
      { message: SHABBAT_MESSAGE, shabbatBlocked: true },
      { status: 403 }
    );
  }

  const dest = destinationMaskOf(link);
  if (!dest.channel) {
    return NextResponse.json(
      { message: "לא נמצאו פרטי קשר לשליחת הקוד. נא לפנות למטפל/ת." },
      { status: 400 }
    );
  }

  // cap + cooldown מבוססי-DB.
  const decision = evaluateOtpSend(link);
  if (!decision.allowed) {
    return NextResponse.json({ message: decision.message }, { status: 429 });
  }

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const therapistName = settings.therapist.name || "המטפל/ת";

  // שליחה — מייל מועדף (חינם). SMS עם skipQuotaCheck (לא שוחק את מכסת המטפל).
  let sendOk = false;
  if (link.destinationEmail) {
    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
        <h2 style="color: #0f766e;">קוד אימות לקביעת תור</h2>
        <p>קוד האימות שלך לקביעת תור אצל ${escapeHtml(therapistName)}:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0f766e; text-align: center; margin: 24px 0;">${otp}</div>
        <p style="color: #666; font-size: 14px;">הקוד תקף ל-10 דקות. אם לא ביקשת קוד זה, ניתן להתעלם מהודעה זו.</p>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
      </div>`;
    const result = await sendEmail({
      to: link.destinationEmail,
      subject: sanitizeEmailSubject(`קוד אימות לקביעת תור - ${therapistName}`),
      html,
    });
    if (result.shabbatBlocked) {
      return NextResponse.json({ message: SHABBAT_MESSAGE, shabbatBlocked: true }, { status: 403 });
    }
    sendOk = result.success;
  } else if (link.destinationPhone) {
    const result = await sendSMS(
      link.destinationPhone,
      `קוד האימות שלך לקביעת תור אצל ${therapistName}: ${otp} (תקף ל-10 דקות)`,
      link.therapistId,
      { skipQuotaCheck: true, clientId: link.clientId, type: "BOOKING_OTP" }
    );
    if (result.shabbatBlocked) {
      return NextResponse.json({ message: SHABBAT_MESSAGE, shabbatBlocked: true }, { status: 403 });
    }
    sendOk = result.success;
  }

  if (!sendOk) {
    logger.error("[BookingLink] OTP send failed", { linkId: link.id, channel: dest.channel });
    return NextResponse.json(
      { message: "שליחת הקוד נכשלה. נא לנסות שוב בעוד רגע." },
      { status: 502 }
    );
  }

  const now = new Date();
  await prisma.bookingLink.update({
    where: { id: link.id },
    data: {
      otpHash,
      otpExpiresAt: computeOtpExpiresAt(now),
      otpAttempts: 0, // קוד חדש → 5 ניסיונות חדשים (ה-cap על מספר השליחות מגן מ-brute-force)
      lastOtpSentAt: now,
      otpSendCount: decision.otpSendCount,
      otpSendWindowAt: decision.otpSendWindowAt,
    },
  });

  // CommunicationLog — בלי לרשום את הקוד עצמו (PHI/secret).
  try {
    await prisma.communicationLog.create({
      data: {
        type: "CUSTOM",
        channel: dest.channel === "email" ? "EMAIL" : "SMS",
        recipient: dest.masked || "",
        subject: "קוד אימות לקביעת תור",
        content: "נשלח קוד אימות חד-פעמי לקביעת תור (הקוד אינו נשמר).",
        status: "SENT",
        sentAt: now,
        clientId: link.clientId,
        userId: link.therapistId,
        organizationId: link.organizationId,
      },
    });
  } catch (e) {
    logger.error("[BookingLink] CommunicationLog (otp) failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

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
      // יותר מדי ניסיונות שגויים על הקוד הנוכחי — מבטלים אותו ומבקשים קוד חדש.
      // לא נועלים את הקישור לצמיתות (טעות הקלדה לא צריכה לחסום מטופל לגיטימי);
      // ה-cap על מספר השליחות (8 ל-24ש) הוא מה שמגביל ניסיונות brute-force.
      await prisma.bookingLink.update({
        where: { id: link.id },
        data: { otpAttempts: 0, otpHash: null, otpExpiresAt: null },
      });
      return NextResponse.json(
        { message: "יותר מדי ניסיונות שגויים. נא לבקש קוד אימות חדש.", reason: "retry_new_code" },
        { status: 429 }
      );
    }
    await prisma.bookingLink.update({
      where: { id: link.id },
      data: { otpAttempts },
    });
    const remaining = Math.max(0, 5 - otpAttempts);
    return NextResponse.json(
      { message: `קוד שגוי. נותרו ${remaining} ניסיונות.`, remaining },
      { status: 400 }
    );
  }

  // הצלחה — מסמנים אומת, מנקים את הקוד.
  const now = new Date();
  await prisma.bookingLink.update({
    where: { id: link.id },
    data: { otpVerifiedAt: now, otpHash: null, otpExpiresAt: null, otpAttempts: 0 },
  });

  // עכשיו מותר לחשוף שם+מייל מלאים (המשתמש הוכיח שליטה בפרטי הקשר).
  return NextResponse.json({
    verified: true,
    clientName: link.client.name,
    clientEmail: link.client.email,
  });
}

// ─── קביעת תור — נקשרת ל-clientId מה-token. מתעלמת מכל שדה זהות בגוף. ──────────
async function handleCreate(request: NextRequest, link: LoadedLink) {
  if (!isOtpSessionVerified(link)) {
    return NextResponse.json(
      { message: "נא לאמת את הקוד לפני קביעת תור.", reason: "not_verified" },
      { status: 403 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
  }
  const parsed = tokenBookingSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError =
      Object.values(parsed.error.flatten().fieldErrors).flat()[0] || "פורמט שדות לא תקין";
    return NextResponse.json({ message: firstError }, { status: 400 });
  }
  const { date, time, notes } = parsed.data;

  const settings = await prisma.bookingSettings.findUnique({
    where: { therapistId: link.therapistId },
    include: {
      therapist: { select: { id: true, name: true, email: true, organizationId: true } },
    },
  });
  if (!settings || !settings.enabled) {
    return NextResponse.json({ message: "הזימון העצמי אינו פעיל" }, { status: 404 });
  }

  // שבת/חג — אין יצירת פגישה.
  if (isShabbatOrYomTov()) {
    return NextResponse.json(
      { message: "מערכת הזימון סגורה בשבת ובחגים. נא לחזור במוצאי שבת/חג.", shabbatBlocked: true },
      { status: 403 }
    );
  }

  if (!DATE_RE.test(date) || isNaN(new Date(`${date}T12:00:00Z`).getTime())) {
    return NextResponse.json({ message: "תאריך לא תקין" }, { status: 400 });
  }
  if (!TIME_RE.test(time)) {
    return NextResponse.json({ message: "שעה לא תקינה" }, { status: 400 });
  }
  const [tH, tM] = time.split(":").map(Number);
  if (tH < 0 || tH > 23 || tM < 0 || tM > 59) {
    return NextResponse.json({ message: "שעה לא תקינה" }, { status: 400 });
  }

  const startTime = toIsraelDate(date, time);
  const endTime = new Date(startTime.getTime() + settings.sessionDuration * 60 * 1000);
  const now = new Date();

  const maxDate = new Date(now.getTime() + settings.maxAdvanceDays * 24 * 60 * 60 * 1000);
  if (startTime > maxDate) {
    return NextResponse.json(
      { message: `ניתן לקבוע תור עד ${settings.maxAdvanceDays} ימים מראש` },
      { status: 400 }
    );
  }

  const bookingDay = getIsraelDayOfWeek(date);
  const bookingMinutes = tH * 60 + tM;
  if (bookingDay === 5 && bookingMinutes >= 17 * 60 + 30) {
    return NextResponse.json({ message: "לא ניתן לקבוע תורים ביום שישי אחרי 17:30" }, { status: 400 });
  }
  if (bookingDay === 6 && bookingMinutes < 17 * 60 + 45) {
    return NextResponse.json({ message: "ניתן לקבוע תורים במוצ״ש רק מ-17:45" }, { status: 400 });
  }
  if (startTime <= now) {
    return NextResponse.json({ message: "לא ניתן לקבוע תור בעבר" }, { status: 400 });
  }
  const hoursUntilSession = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilSession < settings.minAdvanceHours) {
    return NextResponse.json(
      { message: `יש לקבוע תור לפחות ${settings.minAdvanceHours} שעות מראש` },
      { status: 400 }
    );
  }

  const sessionStatus = settings.requireApproval ? "PENDING_APPROVAL" : "SCHEDULED";
  const price = Number(settings.defaultPrice) || Number(link.client.defaultSessionPrice) || 0;
  // organizationId — נלקח מהמטפל החי (לא מ-snapshot ב-link), כדי שהפגישה תופיע
  // ב-scope הנכון של הקליניקה גם אם המטפל עבר ארגון. עקבי עם הזרימה הישנה.
  const organizationId = settings.therapist.organizationId;

  let therapySession;
  try {
    therapySession = await prisma.$transaction(async (tx) => {
      const conflicting = await tx.therapySession.findFirst({
        where: {
          therapistId: settings.therapistId,
          status: { notIn: ["CANCELLED"] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });
      if (conflicting) throw new Error("SLOT_TAKEN");

      const session = await tx.therapySession.create({
        data: {
          therapistId: settings.therapistId,
          organizationId,
          clientId: link.clientId, // ⭐ קשירה ישירה — בלי matching, בלי יצירת מטופל חדש
          startTime,
          endTime,
          status: sessionStatus,
          type: settings.defaultSessionType,
          price,
          notes: notes ? String(notes).slice(0, 1000) : null,
        },
      });

      await tx.bookingLink.update({
        where: { id: link.id },
        data: { usageCount: { increment: 1 }, lastUsedAt: now },
      });

      return session;
    }, {
      // Serializable + טיפול ב-P2034 — מונע הזמנה כפולה אם שתי בקשות מנסות את
      // אותו slot בו-זמנית (כמו במסלול accept של הזמנת צוות).
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_TAKEN") {
      return NextResponse.json({ message: "השעה המבוקשת אינה פנויה יותר" }, { status: 409 });
    }
    // P2034 — התנגשות כתיבה/deadlock תחת Serializable (שתי הזמנות בו-זמנית).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      return NextResponse.json({ message: "השעה המבוקשת אינה פנויה יותר" }, { status: 409 });
    }
    logger.error("[BookingLink] create transaction error", {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ message: "שגיאה בקביעת התור. נסה שוב." }, { status: 500 });
  }

  const clientName = link.client.name;
  const formattedDate = formatIsraelDate(date);

  // Google Calendar sync — רק ל-SCHEDULED.
  if (sessionStatus === "SCHEDULED") {
    syncSessionToGoogleCalendar(settings.therapistId, {
      id: therapySession.id,
      clientName,
      type: settings.defaultSessionType,
      startTime,
      endTime,
      location: null,
      topic: null,
    }).catch((err) =>
      logger.error("[BookingLink] GoogleCalendarSync error", {
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }

  // התראה למטפל.
  await prisma.notification.create({
    data: {
      userId: settings.therapistId,
      type: "BOOKING_REQUEST",
      title: "בקשת זימון חדשה",
      content: `${escapeHtml(clientName)} ביקש/ה לקבוע פגישה ב-${formattedDate} בשעה ${time} [${date}|${time}|${therapySession.id}]`,
      status: "PENDING",
    },
  });

  // אישור למטופל — לפרטי הקשר שב-DB (לא מהטופס).
  if (link.client.email) {
    const isPending = sessionStatus === "PENDING_APPROVAL";
    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
        <h2 style="color: #0f766e;">שלום ${escapeHtml(clientName)},</h2>
        <p>${isPending ? "בקשת הזימון שלך התקבלה וממתינה לאישור המטפל/ת." : "התור שלך אושר בהצלחה!"}</p>
        <div style="background: #f0fdfa; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #0f766e;">
          <p style="margin: 8px 0;"><strong>תאריך:</strong> ${formattedDate}</p>
          <p style="margin: 8px 0;"><strong>שעה:</strong> ${time}</p>
          <p style="margin: 8px 0;"><strong>מטפל/ת:</strong> ${escapeHtml(settings.therapist.name || "")}</p>
          <p style="margin: 8px 0;"><strong>סטטוס:</strong> ${isPending ? "ממתין לאישור" : "מאושר"}</p>
        </div>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
      </div>`;
    try {
      await sendEmail({
        to: link.client.email,
        subject: sanitizeEmailSubject(
          isPending
            ? `בקשת זימון - ${settings.therapist.name}`
            : `אישור תור - ${settings.therapist.name}`
        ),
        html,
      });
    } catch (e) {
      logger.error("[BookingLink] client confirmation email failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (link.client.phone) {
    const isPendingSMS = sessionStatus === "PENDING_APPROVAL";
    const commSettings = await prisma.communicationSetting.findUnique({
      where: { userId: settings.therapist.id },
    });
    await sendSMSIfEnabled({
      userId: settings.therapist.id,
      phone: link.client.phone,
      template: commSettings?.templateBookingConfirmSMS,
      defaultTemplate: isPendingSMS
        ? "שלום {שם}, הבקשה התקבלה וממתינה לאישור. פגישה ב-{תאריך} ב-{שעה}"
        : "שלום {שם}, התור אושר! פגישה ב-{תאריך} ב-{שעה}",
      placeholders: { שם: clientName, תאריך: formattedDate, שעה: time },
      settingKey: "sendBookingConfirmationSMS",
      sessionId: therapySession.id,
      clientId: link.clientId,
      type: "SESSION_CONFIRMATION",
    });
  }

  return NextResponse.json(
    {
      success: true,
      sessionId: therapySession.id,
      status: sessionStatus,
      message: settings.requireApproval
        ? settings.confirmationMessage || "הבקשה התקבלה! המטפל/ת יאשר/ו את התור בהקדם."
        : settings.confirmationMessage || "התור נקבע בהצלחה!",
      date: formattedDate,
      time,
      therapistName: settings.therapist.name,
    },
    { status: 201 }
  );
}
