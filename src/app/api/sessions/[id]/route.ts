import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { parseIsraelTime } from "@/lib/date-utils";
import { createPaymentForSession } from "@/lib/payment-service";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-utils";
import { sendSMSIfEnabled } from "@/lib/sms";
import { logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { syncSessionUpdateToGoogleCalendar, syncSessionDeletionToGoogleCalendar } from "@/lib/google-calendar-sync";
import { logDataAccess } from "@/lib/audit-logger";
import { buildSessionWhere, isSecretary, loadScopeUser, secretaryCan } from "@/lib/scope";
import { calculatePaidAmount } from "@/lib/payment-utils";
import { copayApplies } from "@/lib/commitments";
import { parseBody } from "@/lib/validations/helpers";
import { patchSessionSchema, updateSessionSchema } from "@/lib/validations/session";
import {
  findClinicLocationConflict,
  buildClinicConflictMessage,
} from "@/lib/session-overlap";

export const dynamic = "force-dynamic";

// payment include משותף ל-GET ו-PUT — childPayments חיוני ל-calculatePaidAmount
// (mismatch בין GET ל-PUT היה גורם לתשלום חלקי+CC להיראות שונה אחרי refresh).
const PAYMENT_INCLUDE = {
  childPayments: {
    where: { status: "PAID" as const },
    select: { id: true, amount: true, status: true },
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, originalUserId, isImpersonating } = auth;

    const { id } = await params;

    const scopeUser = await loadScopeUser(userId);
    const sessionScopeWhere = buildSessionWhere(scopeUser);
    // Phase 3: gate ל-payment ב-GET — מזכירה ללא canViewPayments לא צריכה
    // לקבל את ה-payment בתשובה. תאם ל-GET /api/clients/[id] ול-Server Component
    // של clients/[id] שכבר אוכפים את אותו gate. בלי זה, מזכירה יכולה לחלץ
    // amount/expectedAmount/method של כל פגישה דרך קריאה ישירה לאנדפוינט הזה,
    // גם כשהבעלים לא נתנה לה הרשאה.
    const includeSessionPayment = !isSecretary(scopeUser) || secretaryCan(scopeUser, "canViewPayments");

    // Privacy: secretary must NOT receive clinical content
    // (sessionNote, sessionAnalysis, recordings/transcription).
    const includeForRole = isSecretary(scopeUser)
      ? {
          client: {
            select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true },
          },
          ...(includeSessionPayment ? { payment: { include: PAYMENT_INCLUDE } } : {}),
        }
      : {
          client: true,
          sessionNote: true,
          payment: { include: PAYMENT_INCLUDE },
        };

    const therapySession = await prisma.therapySession.findFirst({
      where: { AND: [{ id }, sessionScopeWhere] },
      include: includeForRole,
    });

    if (!therapySession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    // Audit log — קריאה לפגישה כוללת sessionNote.content + transcription.content
    // For secretary the include omits these so the meta flags are simply false.
    // The dual-shape result confuses TS narrowing, so cast through `unknown` to
    // a structural type just for meta extraction.
    const sessionForMeta = therapySession as unknown as {
      sessionNote?: unknown;
    };
    logDataAccess({
      userId,
      recordType: "SESSION_DETAIL",
      recordId: id,
      action: "READ",
      clientId: therapySession.clientId,
      request,
      meta: {
        hasNote: !!sessionForMeta.sessionNote,
      },
      ...(isImpersonating ? { impersonatedBy: originalUserId } : {}),
    });

    // העשרה ב-paidAmount — אותו source-of-truth של /api/sessions ו-
    // /api/sessions/calendar. בלי זה, צרכנים שמערבבים תגובות (לדוגמה
    // עדכון state יומן אחרי PUT) יראו remainder לא נכון בתשלום חלקי+CC.
    const enriched = therapySession.payment
      ? {
          ...therapySession,
          payment: {
            ...therapySession.payment,
            paidAmount: calculatePaidAmount({
              amount: therapySession.payment.amount,
              status: therapySession.payment.status,
              method: therapySession.payment.method,
              hasReceipt: therapySession.payment.hasReceipt,
              childPayments: (therapySession.payment as { childPayments?: Array<{ amount: unknown; status: string }> }).childPayments,
            }),
          },
        }
      : therapySession;

    // Privacy (חוק זכויות החולה): topic/notes הם scalars קליניים
    // (CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.session ב-scope.ts) ש-Prisma
    // `include` מחזיר אוטומטית. הם לא מוצגים ב-UI אך נשלחים ב-JSON וניתנים
    // לחילוץ דרך DevTools — לכן מסננים מהתגובה למזכירה. parity עם
    // /api/sessions/calendar. roomId/location נשמרים (אדמיניסטרטיביים —
    // נדרשים לבורר החדר ולזיהוי חפיפת חדר).
    if (isSecretary(scopeUser)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { topic, notes, ...rest } = enriched as unknown as Record<string, unknown>;
      return NextResponse.json(serializePrisma(rest));
    }
    return NextResponse.json(serializePrisma(enriched));
  } catch (error) {
    logger.error("Get session error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הפגישה" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const parsed = await parseBody(request, updateSessionSchema);
    if ("error" in parsed) return parsed.error;
    // ALLOWED_FOR_SECRETARY בודק אילו שדות הועברו ב-body — ה-passthrough של
    // ה-schema שומר אותם ב-parsed.data. מכאן לוקחים גם את ה-keys לבדיקה.
    const body = parsed.data as Record<string, unknown>;
    const { startTime, endTime, type, price, location, notes, topic, status, createPayment, markAsPaid, cancellationReason, allowOverlap, roomId } = parsed.data;

    const scopeUser = await loadScopeUser(userId);
    const sessionScopeWhere = buildSessionWhere(scopeUser);

    // Privacy: a secretary may update only administrative fields.
    // Clinical fields (notes/topic) are blocked at the route layer.
    if (isSecretary(scopeUser)) {
      const ALLOWED_FOR_SECRETARY: string[] = [
        "startTime",
        "endTime",
        "type",
        "status",
        "price",
        "location",
        // שלב 2 (חדרים): מזכירה/מנהלת היא המשתמשת העיקרית של שיוך חדרים
        // (front-desk) — מותר לה לשנות חדר לפגישה. שיוך חדר אינו תוכן קליני.
        "roomId",
        "cancellationReason",
        "createPayment",
        "markAsPaid",
        "allowOverlap",
      ];
      const disallowed = Object.keys(body).filter((k) => !ALLOWED_FOR_SECRETARY.includes(k));
      if (disallowed.length > 0) {
        return NextResponse.json(
          { message: `מזכירה לא יכולה לעדכן שדות אלו: ${disallowed.join(", ")}` },
          { status: 403 }
        );
      }

      // Phase 3: gate על mutation של תשלום — createPayment=true / markAsPaid=true
      // אסורים למזכירה ללא canViewPayments. בלי זה, ChargeConfirmationDialog
      // (handleRecordDebt/handleCharge) יכול לקרוא PUT עם createPayment=true
      // ולעקוף את ה-UI gates שב-SessionDetailDialog. גם race window דרך
      // QuickMarkPaid שנפתח לפני שה-permissions נטענו ייחסם כאן.
      // הערה: אנחנו לא חוסמים את האוטו-create של payment כש-status=COMPLETED
      // (שורה ~377 — shouldCreatePayment) — זה תהליך חשבונאי בסיסי שמייצר
      // PENDING amount=0 (חוב), והמזכירה צריכה לסמן פגישות כהושלמו כפעולה
      // אדמיניסטרטיבית. רק החלטות-חיוב מפורשות חסומות.
      if (!secretaryCan(scopeUser, "canViewPayments")) {
        if (createPayment === true || markAsPaid === true) {
          return NextResponse.json(
            { message: "אין הרשאה לפעולות תשלום" },
            { status: 403 }
          );
        }
      }
    }

    const existingSession = await prisma.therapySession.findFirst({
      where: { AND: [{ id }, sessionScopeWhere] },
      include: {
        client: {
          select: {
            defaultSessionPrice: true,
          },
        },
      },
    });

    if (!existingSession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    // If no price provided, use client's default price
    const finalPrice = price !== undefined
      ? price
      : (existingSession.client?.defaultSessionPrice
          ? Number(existingSession.client.defaultSessionPrice)
          : undefined);

    // שלב 2 (חדרים): שינוי/הסרת חדר לפגישה קיימת. כשנשלח roomId — מאמתים שייכות
    // לקליניקה וגוזרים location=שם החדר (snapshot עקבי עם POST). roomId ריק/null
    // → הסרת חדר (location מתאפס). roomData נשאר {} כשלא נשלח roomId — לא נוגעים.
    let roomData: { roomId?: string | null; location?: string | null } = {};
    let roomChanging = false;
    if (roomId !== undefined) {
      const trimmedRoomId = (roomId ?? "").trim();
      if (trimmedRoomId === "") {
        roomData = { roomId: null, location: null };
        roomChanging = (existingSession.roomId ?? null) !== null;
      } else {
        if (!existingSession.organizationId) {
          return NextResponse.json(
            { message: "בחירת חדר זמינה רק בקליניקה" },
            { status: 400 }
          );
        }
        const room = await prisma.clinicRoom.findFirst({
          where: { id: trimmedRoomId, organizationId: existingSession.organizationId },
          select: { id: true, name: true },
        });
        if (!room) {
          return NextResponse.json(
            { message: "החדר הנבחר לא נמצא בקליניקה" },
            { status: 400 }
          );
        }
        roomData = { roomId: room.id, location: room.name };
        roomChanging = existingSession.roomId !== room.id;
      }
    }

    // newStart/newEnd נגזרים תמיד — נחוצים גם לבדיקת חפיפת חדר בשינוי חדר בלבד
    // (ללא שינוי זמן). כשהזמן לא משתנה הם פשוט שווים לערכים הקיימים.
    const newStart = startTime ? parseIsraelTime(startTime) : existingSession.startTime;
    const newEnd = endTime ? parseIsraelTime(endTime) : existingSession.endTime;

    // Check for overlaps when changing time
    if (startTime || endTime) {
      // Same sanity guard as POST — see /api/sessions/route.ts.
      if (newEnd.getTime() <= newStart.getTime()) {
        return NextResponse.json(
          { message: "שעת הסיום חייבת להיות אחרי שעת ההתחלה" },
          { status: 400 }
        );
      }
      const durationMs = newEnd.getTime() - newStart.getTime();
      if (durationMs > 12 * 60 * 60 * 1000) {
        return NextResponse.json(
          { message: "משך פגישה לא יכול לעלות על 12 שעות" },
          { status: 400 }
        );
      }

      // Phase 2: בדיקת חפיפה ב-PUT חייבת להתבצע על יומן ה-**מטפל היעד** (existingSession.therapistId)
      // ולא של המבצע (userId). אחרת מזכירה/בעלים שמעדכנים פגישה של מטפל אחר
      // יקבלו "אין התנגשות" כי היומן שלהם ריק — ויכתבו double-booking ביומן המטפל.
      // רץ רק כשהזמן משתנה — שינוי חדר בלבד לא נוגע ביומן המטפל.
      const conflict = await prisma.therapySession.findFirst({
        where: {
          therapistId: existingSession.therapistId,
          id: { not: id }, // exclude this session
          status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
          OR: [
            {
              AND: [
                { startTime: { lte: newStart } },
                { endTime: { gt: newStart } },
              ],
            },
            {
              AND: [
                { startTime: { lt: newEnd } },
                { endTime: { gte: newEnd } },
              ],
            },
            {
              AND: [
                { startTime: { gte: newStart } },
                { endTime: { lte: newEnd } },
              ],
            },
          ],
        },
        include: {
          client: { select: { name: true } },
        },
      });

      if (conflict && !allowOverlap) {
        const conflictName = conflict.client?.name || (conflict.type === "BREAK" ? "הפסקה" : "פגישה");
        const conflictStart = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(conflict.startTime);
        const conflictEnd = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(conflict.endTime);
        return NextResponse.json(
          { message: `יש התנגשות עם ${conflictName} בשעה ${conflictStart}-${conflictEnd}` },
          { status: 409 }
        );
      }
    }

    // M5/M11 + שלב 2 (חדרים): cross-therapist conflict ברמת הארגון על אותו חדר.
    // רץ כששינוי הזמן **או** שינוי החדר — שינוי חדר בלבד (בלי זמן) עלול ליצור
    // double-booking על חדר תפוס ולכן חייב להיבדק. משתמשים בחדר/location ה**חדשים**
    // אם נשלחו, אחרת בקיימים. excludeSessionId — לא להחזיר את הפגישה עצמה.
    if (!allowOverlap && (startTime || endTime || roomChanging)) {
      const effectiveRoomId =
        roomData.roomId !== undefined ? roomData.roomId : existingSession.roomId;
      const effectiveLocation =
        roomData.location !== undefined
          ? roomData.location
          : location !== undefined
          ? location
          : existingSession.location;
      const clinicConflict = await findClinicLocationConflict({
        organizationId: existingSession.organizationId,
        location: effectiveLocation,
        roomId: effectiveRoomId,
        startTime: newStart,
        endTime: newEnd,
        excludeSessionId: id,
      });
      if (clinicConflict) {
        return NextResponse.json(
          { message: buildClinicConflictMessage(clinicConflict) },
          { status: 409 }
        );
      }
    }

    const updateIncludeForRole = isSecretary(scopeUser)
      ? {
          client: {
            select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true },
          },
        }
      : {
          client: true,
          sessionNote: true,
        };

    const therapySession = await prisma.therapySession.update({
      where: { id },
      data: {
        startTime: startTime ? parseIsraelTime(startTime) : undefined,
        endTime: endTime ? parseIsraelTime(endTime) : undefined,
        type: type || undefined,
        price: finalPrice,
        topic: topic !== undefined ? topic : undefined,
        // שלב 2 (חדרים): כשנשלח roomId — location נגזר משם החדר (או null בהסרה),
        // וגובר על location שנשלח ב-body. אחרת — location מה-body (טקסט חופשי) כקודם.
        location:
          roomData.location !== undefined
            ? roomData.location
            : location !== undefined
            ? location
            : undefined,
        ...(roomData.roomId !== undefined ? { roomId: roomData.roomId } : {}),
        notes: notes !== undefined ? notes : undefined,
        status: status || undefined,
        // שמירת פרטי ביטול/אי הופעה
        ...(cancellationReason ? { cancellationReason } : {}),
        ...((status === "CANCELLED" || status === "NO_SHOW") ? {
          cancelledAt: new Date(),
          cancelledBy: "THERAPIST",
        } : {}),
      },
      include: updateIncludeForRole,
    });

    // ── Sync expectedAmount on PENDING payment when price changes ────
    // אם המחיר שונה לפגישה שיש לה תשלום PENDING (לא PAID/REFUNDED), חייבים
    // לעדכן את `expectedAmount` כדי ש-`calculateSessionDebt` ויתר ה-flows
    // יראו את החוב המעודכן. לא נוגעים ב-amount (שמייצג את מה ששולם בפועל),
    // וגם לא בתשלומים PAID או REFUNDED. גם לא יורדים מתחת ל-amount הקיים.
    //
    // Phase 3 (M2): מזכירה ללא canViewPayments — דילוג על הסנכרון.
    // הסיבה: היא רשאית לעדכן `price` (ב-ALLOWED_FOR_SECRETARY) אבל לא לבצע
    // מוטציות תשלום. שריון: secretaryCan מחזיר true לכל non-secretary
    // ולמזכירה עם הרשאה — ולכן רק במצב המוגבל הסנכרון מדלג. במקרה הקצה
    // הזה ייתכן stale `expectedAmount` עד שמי שיש לו הרשאה יערוך שוב —
    // עדיף מ-mutation שקטה דרך מזכירה ללא הרשאה.
    if (
      secretaryCan(scopeUser, "canViewPayments") &&
      price !== undefined &&
      finalPrice !== undefined &&
      existingSession.price !== null &&
      Number(existingSession.price) !== Number(finalPrice)
    ) {
      try {
        const pendingPayment = await prisma.payment.findFirst({
          where: { sessionId: therapySession.id, status: "PENDING" },
          select: { id: true, amount: true },
        });
        if (pendingPayment) {
          const safeExpected = Math.max(
            Number(finalPrice),
            Number(pendingPayment.amount),
          );
          await prisma.payment.update({
            where: { id: pendingPayment.id },
            data: { expectedAmount: safeExpected },
          });
          logger.info("[sessions PUT] synced expectedAmount on price change", {
            sessionId: therapySession.id,
            paymentId: pendingPayment.id,
            oldPrice: Number(existingSession.price),
            newPrice: Number(finalPrice),
            newExpected: safeExpected,
          });
        }
      } catch (syncErr) {
        logger.error("[sessions PUT] expectedAmount sync failed", {
          sessionId: therapySession.id,
          error: syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
      }
    }

    // Google Calendar sync (non-blocking)
    if (existingSession.googleEventId) {
      if (status === "CANCELLED" || status === "NO_SHOW") {
        syncSessionDeletionToGoogleCalendar(userId, therapySession.id, existingSession.googleEventId)
          .catch((err) => logger.error("[GoogleCalendarSync] Delete error:", { error: err instanceof Error ? err.message : String(err) }));
      } else if (startTime || endTime || location || roomChanging) {
        // roomChanging — שינוי חדר משנה את location, ולכן צריך לדחוף עדכון ליומן.
        syncSessionUpdateToGoogleCalendar(userId, {
          clientName: therapySession.client?.name || null,
          startTime: therapySession.startTime,
          endTime: therapySession.endTime,
          location: therapySession.location,
        }, existingSession.googleEventId)
          .catch((err) => logger.error("[GoogleCalendarSync] Update error:", { error: err instanceof Error ? err.message : String(err) }));
      }
    }

    // יצירת תשלום אם צריך (הושלם, או ביטול/אי הופעה עם בקשה לחיוב)
    const shouldCreatePayment =
      (status === "COMPLETED" || therapySession.status === "COMPLETED") ||
      (createPayment && (status === "CANCELLED" || status === "NO_SHOW"));

    if (shouldCreatePayment && therapySession.price && therapySession.clientId) {
      // בדוק אם כבר קיים תשלום ממתין או שולם לפגישה זו
      const existingPayment = await prisma.payment.findFirst({
        where: {
          sessionId: therapySession.id,
          status: { in: ["PENDING", "PAID"] },
        },
      });
      if (!existingPayment) {
        // אם קיימת התחייבות קופ"ח פעילה עם השתתפות עצמית — הסכום הצפוי
        // מהמטופל הוא הסכום הזה (לא המחיר המלא של הפגישה). שאר הסכום
        // מכוסה ע"י הקופה ולא נרשם כחוב במערכת.
        // try/catch כדי שכשל DB רגעי לא יפיל את יצירת התשלום — נופלים
        // חזרה למחיר המלא כברירת מחדל בטוחה.
        let effectiveExpected = Number(therapySession.price);
        try {
          const activeCommitment = await prisma.clientCommitment.findFirst({
            where: {
              clientId: therapySession.clientId,
              status: "ACTIVE",
            },
            select: { copaymentAmount: true, approvedSessions: true, usedSessions: true },
            orderBy: { createdAt: "desc" },
          });
          // ההשתתפות העצמית חלה רק כל עוד נותרו טיפולים מאושרים בהתחייבות.
          // מוצתה המכסה (usedSessions >= approvedSessions) → חיוב מלא רגיל.
          if (
            activeCommitment &&
            copayApplies({
              copaymentAmount:
                activeCommitment.copaymentAmount != null
                  ? Number(activeCommitment.copaymentAmount)
                  : null,
              approvedSessions: activeCommitment.approvedSessions,
              usedSessions: activeCommitment.usedSessions,
            })
          ) {
            effectiveExpected = Number(activeCommitment.copaymentAmount);
          }
        } catch (commitLookupErr) {
          logger.error("[sessions PUT] commitment lookup failed — falling back to session.price", {
            sessionId: therapySession.id,
            clientId: therapySession.clientId,
            error: commitLookupErr instanceof Error ? commitLookupErr.message : String(commitLookupErr),
          });
        }

        const paymentResult = await createPaymentForSession({
          userId,
          clientId: therapySession.clientId,
          sessionId: therapySession.id,
          amount: markAsPaid ? effectiveExpected : 0,
          expectedAmount: effectiveExpected,
          method: "CASH",
          paymentType: "FULL",
          scopeUser,
        });

        // אם יצירת התשלום נכשלה - מחזירים את הפגישה למצב הקודם
        if (!paymentResult.success) {
          await prisma.therapySession.update({
            where: { id },
            data: {
              status: existingSession.status,
            },
          });
          return NextResponse.json(
            { message: paymentResult.error || "שגיאה ביצירת התשלום, הפגישה לא עודכנה" },
            { status: 500 }
          );
        }
      }
    }

    // ── ספירת טיפולים אוטומטית — עדכון התחייבות פעילה ──
    // סופרים +1 רק כל עוד לא מוצתה המכסה, כך שהמונה לא חורג מ-approvedSessions
    // (לא עוד "6/4"). התחייבות ללא מכסה (approvedSessions = null) נספרת תמיד.
    // עדכון אטומי בודד — התנאי usedSessions < approvedSessions מתבצע על העמודה
    // עצמה בתוך ה-UPDATE, כך ששתי פגישות שמסתיימות בו-זמנית לא יכולות לחרוג
    // מהמכסה (ה-DB מעריך את התקרה מחדש בזמן הכתיבה; אין מצב מרוץ קרא-ואז-כתוב).
    if (status === "COMPLETED" && existingSession.status !== "COMPLETED" && therapySession.clientId) {
      try {
        await prisma.clientCommitment.updateMany({
          where: {
            clientId: therapySession.clientId,
            status: "ACTIVE",
            OR: [
              { approvedSessions: null },
              { usedSessions: { lt: prisma.clientCommitment.fields.approvedSessions } },
            ],
          },
          data: { usedSessions: { increment: 1 } },
        });
      } catch (commitErr) {
        logger.error("[sessions PUT] usedSessions increment failed", {
          sessionId: therapySession.id,
          clientId: therapySession.clientId,
          error: commitErr instanceof Error ? commitErr.message : String(commitErr),
        });
      }
    }

    // ── Send session change notification (email + SMS) when time/date changed ──
    const timeChanged = startTime && existingSession.startTime.getTime() !== therapySession.startTime.getTime();
    if (timeChanged && existingSession.status === "SCHEDULED" && therapySession.client) {
      const commSettings = await prisma.communicationSetting.findUnique({
        where: { userId },
      });
      const therapist = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      const therapistName = therapist?.name || "המטפל/ת";

      const newDateStr = therapySession.startTime.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", year: "numeric", month: "long", day: "numeric" });
      const newTimeStr = therapySession.startTime.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
      const clientName = therapySession.client.name;

      // Send change email if enabled
      if (commSettings?.sendSessionChangeEmail !== false && therapySession.client.email) {
        try {
          const changeSubject = `שינוי מועד פגישה - ${escapeHtml(therapistName)}`;
          const changeHtml = `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
              <h2 style="color: #f59e0b;">שינוי מועד פגישה</h2>
              <p>${commSettings?.customGreeting ? escapeHtml(commSettings.customGreeting.replace(/{שם}/g, clientName)) : `שלום ${escapeHtml(clientName)}`},</p>
              <p>הפגישה שלך הועברה למועד חדש:</p>
              <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #f59e0b;">
                <p style="margin: 8px 0;"><strong>תאריך חדש:</strong> ${newDateStr}</p>
                <p style="margin: 8px 0;"><strong>שעה חדשה:</strong> ${newTimeStr}</p>
                <p style="margin: 8px 0;"><strong>מטפל/ת:</strong> ${escapeHtml(therapistName)}</p>
              </div>
              <p>אם המועד לא מתאים, נא ליצור קשר בהקדם.</p>
              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                ${escapeHtml(commSettings?.customClosing || "בברכה")},<br/>
                ${escapeHtml(commSettings?.emailSignature || therapistName)}
              </p>
            </div>`;

          const result = await sendEmail({ to: therapySession.client.email, subject: changeSubject, html: changeHtml });
          await prisma.communicationLog.create({
            data: {
              type: "SESSION_CHANGED",
              channel: "EMAIL",
              recipient: therapySession.client.email,
              subject: changeSubject,
              content: changeHtml,
              status: result.success ? "SENT" : "FAILED",
              errorMessage: result.success ? null : String(result.error),
              sentAt: result.success ? new Date() : null,
              messageId: result.messageId || null,
              sessionId: therapySession.id,
              clientId: therapySession.clientId,
              userId,
            },
          });
        } catch (e) {
          logger.error("Failed to send session change email:", { error: e instanceof Error ? e.message : String(e) });
        }
      }

      // Send change SMS
      await sendSMSIfEnabled({
        userId,
        phone: therapySession.client.phone,
        template: commSettings?.templateSessionChangeSMS,
        defaultTemplate: "שלום {שם}, הפגישה הועברה ל-{תאריך} ב-{שעה}",
        placeholders: {
          שם: clientName,
          תאריך: newDateStr,
          שעה: newTimeStr,
        },
        settingKey: "sendSessionChangeSMS",
        sessionId: therapySession.id,
        clientId: therapySession.clientId || undefined,
        type: "SESSION_CHANGED",
      });
    }

    // Fetch updated session with payment info.
    // Role-aware: secretary doesn't get full Client (clinical fields stripped).
    // payment.childPayments — נדרש ל-paidAmount enrichment (parity עם GET).
    // Phase 3: gate ל-payment למזכירה ללא canViewPayments — parity עם GET כדי
    // שלא תהיה דרך עקיפה דרך PUT שמחזיר payment שמוסתר ב-GET.
    const includeFinalPayment =
      !isSecretary(scopeUser) || secretaryCan(scopeUser, "canViewPayments");
    const finalIncludeForRole = isSecretary(scopeUser)
      ? {
          client: {
            select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true },
          },
          ...(includeFinalPayment ? { payment: { include: PAYMENT_INCLUDE } } : {}),
        }
      : {
          client: true,
          payment: { include: PAYMENT_INCLUDE },
        };

    const updatedSession = await prisma.therapySession.findUnique({
      where: { id: therapySession.id },
      include: finalIncludeForRole,
    });

    // העשרה ב-paidAmount: parity עם GET ו-/api/sessions. בלי זה,
    // page.tsx של היומן או של ה-session detail יקבלו ערך לא נכון
    // אם הם משתמשים בתגובת PUT לעדכן state.
    const enrichedUpdated = updatedSession?.payment
      ? {
          ...updatedSession,
          payment: {
            ...updatedSession.payment,
            paidAmount: calculatePaidAmount({
              amount: updatedSession.payment.amount,
              status: updatedSession.payment.status,
              method: updatedSession.payment.method,
              hasReceipt: updatedSession.payment.hasReceipt,
              childPayments: (updatedSession.payment as { childPayments?: Array<{ amount: unknown; status: string }> }).childPayments,
            }),
          },
        }
      : updatedSession;

    // Privacy (חוק זכויות החולה): כמו ב-GET — ה-include הדו-צורתי מחזיר את כל
    // ה-scalars כולל topic/notes (תוכן קליני). מסננים מהתגובה למזכירה.
    // roomId/location נשמרים (נדרשים לבורר החדר/חפיפת חדר). parity עם calendar.
    // rename ל-_topic/_notes כי topic/notes כבר ב-scope (parsed.data למעלה).
    if (enrichedUpdated && isSecretary(scopeUser)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { topic: _topic, notes: _notes, ...rest } = enrichedUpdated as unknown as Record<string, unknown>;
      return NextResponse.json(serializePrisma(rest));
    }
    return NextResponse.json(serializePrisma(enrichedUpdated));
  } catch (error) {
    logger.error("Update session error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הפגישה" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;
    // H12: zod אוכף שה-skipSummary הוא boolean (לא truthy של כל ערך).
    const parsed = await parseBody(request, patchSessionSchema);
    if ("error" in parsed) return parsed.error;
    const { skipSummary, topic } = parsed.data;

    const scopeUser = await loadScopeUser(userId);

    // Privacy: topic הוא תוכן קליני (נושא הפגישה). מזכירה חסומה — parity עם
    // ALLOWED_FOR_SECRETARY ב-PUT, ששם notes/topic נחסמים. skipSummary נשאר
    // מותר למזכירה (פעולה אדמיניסטרטיבית).
    if (topic !== undefined && isSecretary(scopeUser)) {
      return NextResponse.json(
        { message: "מזכירה לא יכולה לעדכן נושא פגישה" },
        { status: 403 }
      );
    }

    const sessionScopeWhere = buildSessionWhere(scopeUser);

    const existingSession = await prisma.therapySession.findFirst({
      where: { AND: [{ id }, sessionScopeWhere] },
    });

    if (!existingSession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    const updatedSession = await prisma.therapySession.update({
      where: { id },
      data: {
        skipSummary: skipSummary !== undefined ? skipSummary : undefined,
        topic: topic !== undefined ? topic : undefined,
      },
    });

    // WRITE_SUMMARY tasks no longer used - skipSummary flag on session is the source of truth

    // Privacy (חוק זכויות החולה): prisma.update מחזיר את כל ה-scalars, כולל
    // topic/notes הקיימים. מזכירה (שמותר לה skipSummary בלבד — topic בקלט
    // כבר חסום ב-403 למעלה) לא תקבל תוכן קליני בתגובה. parity עם GET/PUT.
    if (isSecretary(scopeUser)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { topic: _topic, notes: _notes, ...rest } = updatedSession as unknown as Record<string, unknown>;
      return NextResponse.json(serializePrisma(rest));
    }
    return NextResponse.json(serializePrisma(updatedSession));
  } catch (error) {
    logger.error("Patch session error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הפגישה" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const scopeUser = await loadScopeUser(userId);
    const sessionScopeWhere = buildSessionWhere(scopeUser);

    const existingSession = await prisma.therapySession.findFirst({
      where: { AND: [{ id }, sessionScopeWhere] },
    });

    if (!existingSession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    // Soft delete: cancel instead of hard delete, preserving history
    const now = new Date();
    const sessionStart = new Date(existingSession.startTime);
    const isPast = sessionStart < now;

    // Get therapist's cancellation policy
    const commSettings = await prisma.communicationSetting.findUnique({
      where: { userId },
      select: { minCancellationHours: true },
    });
    const minHours = commSettings?.minCancellationHours ?? 24;
    const hoursUntilSession = (sessionStart.getTime() - now.getTime()) / (1000 * 60 * 60);
    const withinChargeWindow = !isPast && hoursUntilSession < minHours;

    await prisma.therapySession.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledBy: "THERAPIST",
      },
    });

    // Google Calendar sync — delete event (non-blocking)
    if (existingSession.googleEventId) {
      syncSessionDeletionToGoogleCalendar(userId, id, existingSession.googleEventId)
        .catch((err) => logger.error("[GoogleCalendarSync] Delete error:", { error: err instanceof Error ? err.message : String(err) }));
    }

    // Dismiss related notifications
    try {
      await prisma.notification.updateMany({
        where: {
          userId,
          type: { in: ["BOOKING_REQUEST", "CANCELLATION_REQUEST", "SESSION_REMINDER"] },
          status: { in: ["PENDING", "SENT"] },
          content: { contains: id },
        },
        data: { status: "DISMISSED" },
      });
    } catch (e) {
      logger.error("Failed to clean up notifications:", { error: e instanceof Error ? e.message : String(e) });
    }

    // ── Send cancellation notification (email + SMS) ──
    if (existingSession.status === "SCHEDULED" && existingSession.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: existingSession.clientId },
        select: { name: true, firstName: true, email: true, phone: true },
      });
      const fullCommSettings = await prisma.communicationSetting.findUnique({ where: { userId } });
      const therapist = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      const therapistName = therapist?.name || "המטפל/ת";

      if (client) {
        const dateStr = existingSession.startTime.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", year: "numeric", month: "long", day: "numeric" });
        const timeStr = existingSession.startTime.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });

        // Send cancellation email if enabled
        if (fullCommSettings?.sendCancellationEmail !== false && client.email) {
          try {
            const cancelSubject = `הפגישה בוטלה - ${escapeHtml(therapistName)}`;
            const cancelHtml = `
              <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
                <h2 style="color: #dc2626;">הפגישה בוטלה</h2>
                <p>${fullCommSettings?.customGreeting ? escapeHtml(fullCommSettings.customGreeting.replace(/{שם}/g, client.name)) : `שלום ${escapeHtml(client.name)}`},</p>
                <p>הפגישה הבאה בוטלה:</p>
                <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #dc2626;">
                  <p style="margin: 8px 0;"><strong>תאריך:</strong> ${dateStr}</p>
                  <p style="margin: 8px 0;"><strong>שעה:</strong> ${timeStr}</p>
                </div>
                <p>ליצירת קשר לקביעת מועד חדש, אנא פנה/י ישירות.</p>
                <p style="color: #666; font-size: 14px; margin-top: 30px;">
                  ${escapeHtml(fullCommSettings?.customClosing || "בברכה")},<br/>
                  ${escapeHtml(fullCommSettings?.emailSignature || therapistName)}
                </p>
              </div>`;
            const result = await sendEmail({ to: client.email, subject: cancelSubject, html: cancelHtml });
            await prisma.communicationLog.create({
              data: {
                type: "CANCELLATION_BY_THERAPIST",
                channel: "EMAIL",
                recipient: client.email,
                subject: cancelSubject,
                content: cancelHtml,
                status: result.success ? "SENT" : "FAILED",
                errorMessage: result.success ? null : String(result.error),
                sentAt: result.success ? new Date() : null,
                messageId: result.messageId || null,
                sessionId: id,
                clientId: existingSession.clientId,
                userId,
              },
            });
          } catch (e) {
            logger.error("Failed to send cancellation email (DELETE):", { error: e instanceof Error ? e.message : String(e) });
          }
        }

        // Send cancellation SMS
        await sendSMSIfEnabled({
          userId,
          phone: client.phone,
          template: fullCommSettings?.templateCancellationSMS,
          defaultTemplate: "שלום {שם}, הפגישה ב-{תאריך} ב-{שעה} בוטלה",
          placeholders: { שם: client.name, תאריך: dateStr, שעה: timeStr },
          settingKey: "sendCancellationSMS",
          sessionId: id,
          clientId: existingSession.clientId || undefined,
          type: "CANCELLATION_BY_THERAPIST",
        });
      }
    }

    return NextResponse.json({
      message: "הפגישה בוטלה בהצלחה",
      cancelled: true,
      withinChargeWindow,
      isPast,
    });
  } catch (error) {
    logger.error("Cancel session error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בביטול הפגישה" },
      { status: 500 }
    );
  }
}
