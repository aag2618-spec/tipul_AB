import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { sendSMSIfEnabled } from "@/lib/sms";
import { logger } from "@/lib/logger";
import { BOOKING_RATE_LIMIT_WINDOW_MS, BOOKING_RATE_LIMIT_MAX } from "@/lib/constants";
import { syncSessionToGoogleCalendar } from "@/lib/google-calendar-sync";
import { isShabbatOrYomTov } from "@/lib/shabbat";

function toIsraelDate(dateStr: string, timeStr: string = "00:00"): Date {
  const testDate = new Date(`${dateStr}T12:00:00Z`);
  const israelHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(testDate)
  );
  const offsetHours = israelHour - 12;
  const offsetStr = `+${String(offsetHours).padStart(2, "0")}:00`;
  return new Date(`${dateStr}T${timeStr}:00${offsetStr}`);
}

function getIsraelDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

function formatIsraelDate(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  return date.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;
// NAME_RE: מאפשר עברית + אנגלית + רווחים + נקודה + מקף + גרש (׳/') + גרשיים (״/")
// גרשיים (״) הכרחי לשמות חרדיים עם תואר: "ר"מ שניאורסון", "הגר"א", "ט"ו בשבט"
const NAME_RE = /^[\u0590-\u05FFa-zA-Z\s\.\-'"]{2,80}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_DIGITS_RE = /^(05\d{8}|9725\d{8})$/;

// דפוסי שם חשודים (בוטים/בדיקות) — שמרני ברמה שאמיתי לא ייחסם
// הסרתי דפוסים כמו \btest\b/\badmin\b/\bsystem\b כדי לא לחסום שמות משפחה
// אמיתיים ("Test", "Admin" וכד׳). אם לשפה אמיתית יש את המילה, היא תעבור.
const SUSPICIOUS_NAME_PATTERNS: RegExp[] = [
  /מדינת\s*ישראל/i,
  /\bמערכת\b/,
  /\bדוגמה\b/,
  /\bבדיקה\b/,
  /(.)\1{4,}/, // 5+ תווים זהים ברצף (aaaaa, 11111)
  /http[s]?:\/\//i, // קישורים
  /<[^>]+>/, // תגיות HTML
];

function normalizeIsraeliPhone(phone: string): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-\.\(\)]/g, "");
  if (cleaned.startsWith("+972")) cleaned = "0" + cleaned.slice(4);
  if (cleaned.startsWith("972") && cleaned.length === 12) cleaned = "0" + cleaned.slice(3);
  return PHONE_DIGITS_RE.test(cleaned) || /^05\d{8}$/.test(cleaned) ? cleaned : null;
}

// ולידציה של שם לקוח — חוסמת דפוסים חשודים
function validateClientName(name: string): { ok: true } | { ok: false; reason: string } {
  if (typeof name !== "string") return { ok: false, reason: "שם לא תקין" };
  const trimmed = name.trim();
  if (trimmed.length < 2) return { ok: false, reason: "שם קצר מדי (מינימום 2 תווים)" };
  if (trimmed.length > 80) return { ok: false, reason: "שם ארוך מדי (מקסימום 80 תווים)" };
  if (!NAME_RE.test(trimmed)) {
    return { ok: false, reason: "שם יכול להכיל רק אותיות עברית/אנגלית, רווחים ומקפים" };
  }
  for (const pattern of SUSPICIOUS_NAME_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, reason: "שם לא מתאים. נא לוודא שהזנת את שמך המלא באותיות בלבד." };
    }
  }
  return { ok: true };
}

// Rate limiter: IP-level (דקה) — קיים מההתחלה
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
// Rate limiter: IP-level (שעה) — מגביל בוטים שמחליפים אצווה
const HOURLY_RL_WINDOW_MS = 60 * 60 * 1000;
const HOURLY_RL_MAX = 20;
const hourlyRateLimitMap = new Map<string, { count: number; resetAt: number }>();
// Rate limiter: contact-level (יום) — אותו מייל/טלפון לא יכול להזמין יותר מ-3 ביום
const DAILY_CONTACT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DAILY_CONTACT_MAX = 3;
const dailyContactRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkWindowedLimit(
  map: Map<string, { count: number; resetAt: number }>,
  key: string,
  windowMs: number,
  max: number
): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

function checkRateLimit(ip: string): boolean {
  return checkWindowedLimit(rateLimitMap, ip, BOOKING_RATE_LIMIT_WINDOW_MS, BOOKING_RATE_LIMIT_MAX);
}

function checkHourlyRateLimit(ip: string): boolean {
  return checkWindowedLimit(hourlyRateLimitMap, ip, HOURLY_RL_WINDOW_MS, HOURLY_RL_MAX);
}

function checkDailyContactLimit(contact: string): boolean {
  return checkWindowedLimit(dailyContactRateLimitMap, contact.toLowerCase(), DAILY_CONTACT_WINDOW_MS, DAILY_CONTACT_MAX);
}

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");

  const settings = await prisma.bookingSettings.findUnique({
    where: { slug },
    include: {
      therapist: {
        select: {
          id: true,
          name: true,
          image: true,
          defaultSessionDuration: true,
        },
      },
    },
  });

  if (!settings || !settings.enabled) {
    return NextResponse.json(
      { message: "דף הזימון אינו פעיל" },
      { status: 404 }
    );
  }

  const therapistName = settings.therapist.name || "המטפל/ת";
  const baseResponse = {
    therapistName,
    therapistImage: settings.therapist.image,
    sessionDuration: settings.sessionDuration,
    welcomeMessage: settings.welcomeMessage,
    defaultSessionType: settings.defaultSessionType,
    maxAdvanceDays: settings.maxAdvanceDays,
  };

  // בשבת/חג — הטופס הציבורי אינו זמין כלל. מחזירים דגל כדי שה-UI יציג הודעה מתאימה.
  if (isShabbatOrYomTov()) {
    return NextResponse.json({
      ...baseResponse,
      enabledDays: [],
      workingHours: {},
      slots: [],
      shabbatBlocked: true,
      shabbatMessage: "מערכת הזימון סגורה בשבת ובחגים. ניתן להזמין במוצאי שבת/חג.",
    });
  }

  if (!dateStr) {
    const workingHours = (settings.workingHours ?? {}) as Record<string, { start: string; end: string; enabled: boolean }>;
    const enabledDays = Object.entries(workingHours)
      .filter(([, v]) => v.enabled)
      .map(([k]) => parseInt(k));

    return NextResponse.json({
      ...baseResponse,
      enabledDays,
      workingHours,
    });
  }

  if (!DATE_RE.test(dateStr) || isNaN(new Date(`${dateStr}T12:00:00Z`).getTime())) {
    return NextResponse.json({ message: "תאריך לא תקין" }, { status: 400 });
  }

  const dayOfWeek = getIsraelDayOfWeek(dateStr);
  const workingHours = (settings.workingHours ?? {}) as Record<string, { start: string; end: string; enabled: boolean }>;
  const dayConfig = workingHours[dayOfWeek.toString()];

  if (!dayConfig || !dayConfig.enabled) {
    return NextResponse.json({ ...baseResponse, slots: [] });
  }

  const shabbatLimits = applyShabbatLimits(dayOfWeek, dayConfig.start, dayConfig.end);
  const effectiveStart = shabbatLimits.start;
  const effectiveEnd = shabbatLimits.end;

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
    effectiveStart,
    effectiveEnd,
    settings.sessionDuration,
    settings.bufferBetween,
    settings.minAdvanceHours,
    existingSessions,
    breaks
  );

  return NextResponse.json({ ...baseResponse, slots });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // ⭐ חסימה מלאה של זימון עצמי בשבת/חג — אין יצירת פגישה, אין שליחה, אין outbox.
  //    הלקוח מקבל הודעה ברורה לחזור במוצאי שבת/חג.
  if (isShabbatOrYomTov()) {
    return NextResponse.json(
      {
        message: "מערכת הזימון סגורה בשבת ובחגים. נא לחזור ולהזמין במוצאי שבת/חג.",
        shabbatBlocked: true,
      },
      { status: 403 }
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { message: "יותר מדי בקשות. נסה שוב בעוד דקה." },
      { status: 429 }
    );
  }
  if (!checkHourlyRateLimit(ip)) {
    logger.warn("[Booking] Hourly rate limit exceeded", { ip });
    return NextResponse.json(
      { message: "הגעת למגבלת ההזמנות לשעה. נסה שוב מאוחר יותר." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const { date, time, clientName, clientPhone, clientEmail, notes, hp } = body;

  // Honeypot — שדה נסתר שבני אדם לא ממלאים, רק בוטים.
  // אם הוא מלא → זו בקשה אוטומטית של בוט, נדחה שקט (200 כדי לא לחשוף).
  if (typeof hp === "string" && hp.trim().length > 0) {
    logger.warn("[Booking] Honeypot triggered", { ip, hpLength: hp.length });
    return NextResponse.json(
      { success: true, message: "הבקשה התקבלה" },
      { status: 200 }
    );
  }

  if (!date || !time || !clientName) {
    return NextResponse.json(
      { message: "חסרים שדות חובה: תאריך, שעה ושם" },
      { status: 400 }
    );
  }

  // ולידציה של שם לקוח — חוסמת דפוסים חשודים (test, admin, מדינת ישראל וכו')
  const nameCheck = validateClientName(clientName);
  if (!nameCheck.ok) {
    logger.warn("[Booking] Invalid name rejected", { ip, reason: nameCheck.reason });
    return NextResponse.json({ message: nameCheck.reason }, { status: 400 });
  }

  if (!clientEmail && !clientPhone) {
    return NextResponse.json(
      { message: "חובה להזין מייל או טלפון" },
      { status: 400 }
    );
  }

  // ולידציה של מייל (אם סופק)
  if (clientEmail && !EMAIL_RE.test(String(clientEmail).trim())) {
    return NextResponse.json(
      { message: "כתובת מייל לא תקינה" },
      { status: 400 }
    );
  }

  // ולידציה של טלפון (אם סופק) + נרמול לפורמט אחיד
  let normalizedPhone: string | null = null;
  if (clientPhone) {
    normalizedPhone = normalizeIsraeliPhone(String(clientPhone));
    if (!normalizedPhone) {
      return NextResponse.json(
        { message: "מספר טלפון לא תקין — יש להזין מספר ישראלי (05XXXXXXXX)" },
        { status: 400 }
      );
    }
  }

  // Rate limit לפי איש קשר (מייל/טלפון) — אותו איש לא יכול להזמין יותר מ-3 ביום
  const contactKey = clientEmail ? `email:${String(clientEmail).trim().toLowerCase()}` : `phone:${normalizedPhone}`;
  if (!checkDailyContactLimit(contactKey)) {
    logger.warn("[Booking] Daily contact limit exceeded", { ip, contactKey: contactKey.replace(/:.*@/, ":***@") });
    return NextResponse.json(
      { message: "הגעת למגבלת ההזמנות היומית. ניתן להזמין שוב מחר." },
      { status: 429 }
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

  const settings = await prisma.bookingSettings.findUnique({
    where: { slug },
    include: {
      therapist: { select: { id: true, name: true, email: true } },
    },
  });

  if (!settings || !settings.enabled) {
    return NextResponse.json(
      { message: "דף הזימון אינו פעיל" },
      { status: 404 }
    );
  }

  const startTime = toIsraelDate(date, time);
  const endTime = new Date(startTime.getTime() + settings.sessionDuration * 60 * 1000);
  const now = new Date();

  // maxAdvanceDays validation
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
    return NextResponse.json(
      { message: "לא ניתן לקבוע תורים ביום שישי אחרי 17:30" },
      { status: 400 }
    );
  }
  if (bookingDay === 6 && bookingMinutes < 17 * 60 + 45) {
    return NextResponse.json(
      { message: "ניתן לקבוע תורים במוצ״ש רק מ-17:45" },
      { status: 400 }
    );
  }

  if (startTime <= now) {
    return NextResponse.json(
      { message: "לא ניתן לקבוע תור בעבר" },
      { status: 400 }
    );
  }

  const hoursUntilSession = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilSession < settings.minAdvanceHours) {
    return NextResponse.json(
      { message: `יש לקבוע תור לפחות ${settings.minAdvanceHours} שעות מראש` },
      { status: 400 }
    );
  }

  // Use transaction to prevent race condition (double booking)
  let therapySession;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const conflicting = await tx.therapySession.findFirst({
        where: {
          therapistId: settings.therapistId,
          status: { notIn: ["CANCELLED"] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });

      if (conflicting) {
        throw new Error("SLOT_TAKEN");
      }

      let foundClient = null;
      // מנרמלים להשוואה — email → lowercase, phone → normalized (05XXXXXXXX).
      // חשוב: לקוחות ישנים יכולים להיות שמורים ב-DB עם mixed-case או פורמט שונה של טלפון.
      const emailLower = clientEmail ? String(clientEmail).trim().toLowerCase() : null;
      const phoneNorm = normalizedPhone; // כבר מנורמל למעלה
      if (emailLower || phoneNorm) {
        const conditions = [];
        if (emailLower) conditions.push({ email: { equals: emailLower, mode: "insensitive" as const } });
        if (phoneNorm) {
          // תמיכה ב-2 פורמטים ישנים: 05XXXXXXXX ו-+972XXXXXXXXX
          const intlPhone = "+972" + phoneNorm.slice(1);
          conditions.push({ phone: phoneNorm });
          conditions.push({ phone: intlPhone });
        }

        const candidates = await tx.client.findMany({
          where: {
            therapistId: settings.therapistId,
            OR: conditions,
          },
          orderBy: { createdAt: "desc" },
        });

        const nameNorm = clientName.trim().toLowerCase();
        const byName = (c: { name: string }) => c.name.trim().toLowerCase() === nameNorm;
        const byEmail = (c: { email: string | null }) =>
          !!emailLower && !!c.email && c.email.toLowerCase() === emailLower;
        const byPhone = (c: { phone: string | null }) => {
          if (!phoneNorm || !c.phone) return false;
          const cNorm = normalizeIsraeliPhone(c.phone);
          return cNorm === phoneNorm;
        };

        // 1. Exact match: name + email + phone (נרמול בשני הצדדים)
        foundClient = candidates.find(c =>
          byName(c) && byEmail(c) && byPhone(c)
        ) || null;

        // 2. Name match among candidates (regardless of contact info)
        if (!foundClient) {
          foundClient = candidates.find(c => byName(c)) || null;
        }

        // 3. Unique email match (מטפל גם בטעויות הקלדה בשם — אימייל זהות אמינה)
        if (!foundClient && emailLower) {
          const emailMatches = candidates.filter(byEmail);
          if (emailMatches.length === 1) foundClient = emailMatches[0];
        }
      }

      if (!foundClient) {
        foundClient = await tx.client.create({
          data: {
            name: clientName.trim(),
            phone: normalizedPhone || null,
            email: clientEmail ? String(clientEmail).trim().toLowerCase() : null,
            therapistId: settings.therapistId,
            status: "WAITING",
            defaultSessionPrice: settings.defaultPrice,
          },
        });
      }

      const sessionStatus = settings.requireApproval ? "PENDING_APPROVAL" : "SCHEDULED";
      const price = settings.defaultPrice || foundClient.defaultSessionPrice || 0;

      // הערה: אם ה-request הגיע לכאן, אנחנו לא בשבת (ה-guard בראש ה-handler חסם).
      //        לכן pendingConfirmation* נשארים false (ברירת מחדל של ה-schema).
      const session = await tx.therapySession.create({
        data: {
          therapistId: settings.therapistId,
          clientId: foundClient.id,
          startTime,
          endTime,
          status: sessionStatus,
          type: settings.defaultSessionType,
          price,
          notes: notes ? String(notes).slice(0, 1000) : null,
        },
      });

      return { session, client: foundClient, sessionStatus };
    });

    therapySession = result.session;
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_TAKEN") {
      return NextResponse.json(
        { message: "השעה המבוקשת אינה פנויה יותר" },
        { status: 409 }
      );
    }
    logger.error("Booking transaction error:", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { message: "שגיאה בקביעת התור. נסה שוב." },
      { status: 500 }
    );
  }

  const sessionStatus = settings.requireApproval ? "PENDING_APPROVAL" : "SCHEDULED";

  // Google Calendar sync — only for SCHEDULED bookings (not PENDING_APPROVAL)
  if (sessionStatus === "SCHEDULED") {
    syncSessionToGoogleCalendar(settings.therapistId, {
      id: therapySession.id,
      clientName: clientName,
      type: settings.defaultSessionType,
      startTime,
      endTime,
      location: null,
      topic: null,
    }).catch((err) => logger.error("[GoogleCalendarSync] Booking sync error:", { error: err instanceof Error ? err.message : String(err) }));
  }

  const formattedDate = formatIsraelDate(date);

  await prisma.notification.create({
    data: {
      userId: settings.therapistId,
      type: "BOOKING_REQUEST",
      title: "בקשת זימון חדשה",
      content: `${escapeHtml(clientName)} ביקש/ה לקבוע פגישה ב-${formattedDate} בשעה ${time} [${date}|${time}|${therapySession.id}]`,
      status: "PENDING",
    },
  });

  const appUrl = process.env.NEXTAUTH_URL || "";
  if (!process.env.NEXTAUTH_URL) console.warn("NEXTAUTH_URL is not set – email links will be relative");
  const safeName = escapeHtml(clientName);
  const safeNotes = notes ? escapeHtml(String(notes).slice(0, 1000)) : "";
  const safePhone = clientPhone ? escapeHtml(clientPhone) : "";
  const safeEmail = clientEmail ? escapeHtml(clientEmail) : "";

  if (clientEmail) {
    const isPending = sessionStatus === "PENDING_APPROVAL";
    const clientEmailHtml = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
        <h2 style="color: #0f766e;">שלום ${safeName},</h2>
        <p>${isPending ? "בקשת הזימון שלך התקבלה וממתינה לאישור המטפל/ת." : "התור שלך אושר בהצלחה!"}</p>
        <div style="background: #f0fdfa; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #0f766e;">
          <p style="margin: 8px 0;"><strong>תאריך:</strong> ${formattedDate}</p>
          <p style="margin: 8px 0;"><strong>שעה:</strong> ${time}</p>
          <p style="margin: 8px 0;"><strong>מטפל/ת:</strong> ${escapeHtml(settings.therapist.name || "")}</p>
          <p style="margin: 8px 0;"><strong>סטטוס:</strong> ${isPending ? "ממתין לאישור" : "מאושר"}</p>
        </div>
        ${isPending ? "<p>תקבל/י עדכון ברגע שהמטפל/ת יאשר/ו את התור.</p>" : "<p>לביטול או שינוי תור, נא ליצור קשר לפחות 24 שעות מראש.</p>"}
        <p style="color: #666; font-size: 14px; margin-top: 30px;">בברכה,<br/>${escapeHtml(settings.therapist.name || "")}</p>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
      </div>`;
    try {
      await sendEmail({
        to: clientEmail,
        subject: isPending
          ? `בקשת זימון - ${settings.therapist.name}`
          : `אישור תור - ${settings.therapist.name}`,
        html: clientEmailHtml,
      });
    } catch (e) {
      logger.error("Failed to send client confirmation email:", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Send booking confirmation SMS to client — משתמשים ב-normalizedPhone (לא בטלפון הגולמי)
  if (normalizedPhone) {
    const isPendingSMS = sessionStatus === "PENDING_APPROVAL";
    const commSettings = await prisma.communicationSetting.findUnique({
      where: { userId: settings.therapist.id },
    });
    await sendSMSIfEnabled({
      userId: settings.therapist.id,
      phone: normalizedPhone,
      template: commSettings?.templateBookingConfirmSMS,
      defaultTemplate: isPendingSMS
        ? "שלום {שם}, הבקשה התקבלה וממתינה לאישור. פגישה ב-{תאריך} ב-{שעה}"
        : "שלום {שם}, התור אושר! פגישה ב-{תאריך} ב-{שעה}",
      placeholders: {
        שם: clientName,
        תאריך: formattedDate,
        שעה: time,
      },
      settingKey: "sendBookingConfirmationSMS",
      sessionId: therapySession.id,
      clientId: therapySession.clientId || undefined,
      type: "SESSION_CONFIRMATION",
    });
  }

  if (settings.therapist.email) {
    const therapistEmailHtml = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
        <h2 style="color: #0f766e;">בקשת זימון חדשה</h2>
        <p>${safeName} ביקש/ה לקבוע תור דרך דף הזימון העצמי:</p>
        <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #f59e0b;">
          <p style="margin: 8px 0;"><strong>שם:</strong> ${safeName}</p>
          <p style="margin: 8px 0;"><strong>תאריך:</strong> ${formattedDate}</p>
          <p style="margin: 8px 0;"><strong>שעה:</strong> ${time}</p>
          ${safePhone ? `<p style="margin: 8px 0;"><strong>טלפון:</strong> ${safePhone}</p>` : ""}
          ${safeEmail ? `<p style="margin: 8px 0;"><strong>מייל:</strong> ${safeEmail}</p>` : ""}
          ${safeNotes ? `<p style="margin: 8px 0;"><strong>הערות:</strong> ${safeNotes}</p>` : ""}
        </div>
        <a href="${appUrl}/dashboard/calendar?date=${date}&time=${time}&highlight=${therapySession.id}" style="display: inline-block; background: #0f766e; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 10px;">
          ${settings.requireApproval ? "כנס לאשר את התור" : "צפה ביומן"}
        </a>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
      </div>`;
    try {
      await sendEmail({
        to: settings.therapist.email,
        subject: `בקשת זימון חדשה מ-${clientName}`,
        html: therapistEmailHtml,
      });
    } catch (e) {
      logger.error("Failed to send therapist notification email:", { error: e instanceof Error ? e.message : String(e) });
    }
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

function applyShabbatLimits(dayOfWeek: number, start: string, end: string): { start: string; end: string } {
  if (dayOfWeek === 5) {
    const maxEnd = "17:30";
    return { start, end: end > maxEnd ? maxEnd : end };
  }
  if (dayOfWeek === 6) {
    const minStart = "17:45";
    return { start: start < minStart ? minStart : start, end };
  }
  return { start, end };
}

function generateTimeSlots(
  dateStr: string,
  dayStart: string,
  dayEnd: string,
  duration: number,
  buffer: number,
  minAdvanceHours: number,
  existingSessions: Array<{ startTime: Date; endTime: Date }>,
  breaks: Array<{ start: string; end: string }>
): string[] {
  const slots: string[] = [];
  const now = new Date();
  const [startH, startM] = dayStart.split(":").map(Number);
  const [endH, endM] = dayEnd.split(":").map(Number);

  const slotStep = Math.max(1, duration + buffer);
  let currentMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (currentMinutes + duration <= endMinutes) {
    const h = Math.floor(currentMinutes / 60).toString().padStart(2, "0");
    const m = (currentMinutes % 60).toString().padStart(2, "0");
    const slotStart = toIsraelDate(dateStr, `${h}:${m}`);
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

    const hoursUntil = (slotStart.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntil < minAdvanceHours) {
      currentMinutes += slotStep;
      continue;
    }

    const isInBreak = breaks.some((brk) => {
      const bs = brk.start?.split(":").map(Number);
      const be = brk.end?.split(":").map(Number);
      if (!bs || bs.length < 2 || !be || be.length < 2) return false;
      const breakStart = bs[0] * 60 + bs[1];
      const breakEnd = be[0] * 60 + be[1];
      return currentMinutes < breakEnd && currentMinutes + duration > breakStart;
    });

    if (isInBreak) {
      currentMinutes += slotStep;
      continue;
    }

    const hasConflict = existingSessions.some((s) => slotStart < s.endTime && slotEnd > s.startTime);

    if (!hasConflict) {
      slots.push(`${h}:${m}`);
    }

    currentMinutes += slotStep;
  }

  return slots;
}
