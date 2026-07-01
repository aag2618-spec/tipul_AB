import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { parseIsraelTime } from "@/lib/date-utils";
import { parseBody } from "@/lib/validations/helpers";
import { createSessionSchema } from "@/lib/validations/session";
import { logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { syncSessionToGoogleCalendar } from "@/lib/google-calendar-sync";
import { logDelegatedCreate } from "@/lib/audit";
import {
  buildClientWhere,
  buildSessionWhere,
  isClinicOwner,
  isSecretary,
  resolveTherapistIdForSession,
  secretaryCan,
} from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { calculatePaidAmount } from "@/lib/payment-utils";
import {
  findClinicLocationConflict,
  buildClinicConflictMessage,
} from "@/lib/session-overlap";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    // includePolicy: לצרף לכל פגישה את מדיניות הביטול של המטפל
    // (minCancellationHours). additive בלבד — בלי הפרמטר התגובה זהה byte-for-byte
    // לכל הקוראים הקיימים (יומן, פגישות קודמות וכו'). משמש את דיאלוג "כל הפגישות".
    const includePolicy = searchParams.get("includePolicy") === "true";

    const scopeUser = await loadScopeUserWithMode(userId);
    const scopeWhere = buildSessionWhere(scopeUser);

    const extraConditions: Prisma.TherapySessionWhereInput = {};
    if (clientId) {
      extraConditions.clientId = clientId;
    }

    // Overlap with [startDate, endDate]: include any session that isn't entirely before/after the window.
    // (Filtering only by startTime in range misses sessions that start before the window but overlap it.)
    if (startDate && endDate) {
      const rangeStart = parseIsraelTime(startDate);
      const rangeEnd = parseIsraelTime(endDate);
      extraConditions.AND = [
        { startTime: { lt: rangeEnd } },
        { endTime: { gt: rangeStart } },
      ];
    }

    const where: Prisma.TherapySessionWhereInput = {
      AND: [scopeWhere, extraConditions],
    };

    // Privacy: secretary users must NOT receive clinical content (sessionNote).
    // חוק זכויות החולה — מזכירה לא רואה תוכן קליני.
    //
    // ⚠️ payment.childPayments — נדרש לחישוב paidAmount הנכון בכל זרם:
    // אחרי השלמה חלקית באשראי דרך Cardcom, ה-parent.amount כבר משקף את הסכום
    // שסולק (bumpParentOnChildApproval), אבל ה-status נשאר PENDING (כי
    // amount<expectedAmount), ה-method=CREDIT_CARD. ה-frontend לא יכול
    // להבדיל בין:
    //   (א) parent placeholder לסליקה (amount=expectedAmount, אף אגורה לא שולמה)
    //   (ב) parent עם תשלום חלקי שכבר סוכם (amount<expectedAmount, child PAID)
    // לכן השרת מחשב paidAmount = sum(children PAID).amount, וה-frontend
    // משתמש בערך הזה ישירות.
    const paymentInclude = {
      childPayments: {
        where: { status: "PAID" as const },
        select: { id: true, amount: true, status: true },
      },
    };
    // policyInclude: רק כש-includePolicy=true מצרפים את הגדרת הביטול של המטפל.
    // מומר לשדה scalar `minCancellationHours` ב-enrich למטה, וה-therapist מוסר
    // מהתגובה (לא מחזירים פרטי מטפל).
    const policyInclude = includePolicy
      ? { therapist: { select: { communicationSetting: { select: { minCancellationHours: true } } } } }
      : {};

    const includeForRole = isSecretary(scopeUser)
      ? {
          client: {
            select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true },
          },
          payment: { include: paymentInclude },
          ...policyInclude,
        }
      : {
          client: {
            select: { id: true, name: true, email: true, phone: true, creditBalance: true, defaultSessionPrice: true, isQuickClient: true },
          },
          sessionNote: true,
          payment: { include: paymentInclude },
          ...policyInclude,
        };

    const sessions = await prisma.therapySession.findMany({
      where,
      orderBy: { startTime: "asc" },
      include: includeForRole,
    });

    // Enrich payment עם paidAmount מחושב — מקור-אמת אחד ב-`calculatePaidAmount`
    // (src/lib/payment-utils.ts) שמטפל בכל הזרמים (PAID / children PAID /
    // PENDING+CC עם/בלי קבלה / PENDING+CASH).
    const enriched = sessions.map((s) => {
      if (!s.payment) return s;
      const p = s.payment;
      const paidAmount = calculatePaidAmount({
        amount: p.amount,
        status: p.status,
        method: p.method,
        hasReceipt: p.hasReceipt,
        childPayments: p.childPayments,
      });
      return { ...s, payment: { ...p, paidAmount } };
    });

    // includePolicy: גוזרים את minCancellationHours לשדה scalar בכל פגישה, ומסירים
    // את אובייקט ה-therapist מהתגובה (נכלל רק לצורך שליפת המדיניות — לא מחזירים
    // פרטי מטפל ל-client). ברירת מחדל 24 כש-communicationSetting חסר.
    const withPolicy = includePolicy
      ? enriched.map((s) => {
          const therapist = (s as unknown as {
            therapist?: { communicationSetting?: { minCancellationHours?: number } | null };
          }).therapist;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { therapist: _omitTherapist, ...rest } = s as Record<string, unknown> & {
            therapist?: unknown;
          };
          return {
            ...rest,
            minCancellationHours:
              therapist?.communicationSetting?.minCancellationHours ?? 24,
          };
        })
      : enriched;

    // Privacy (חוק זכויות החולה): topic/notes הם scalars קליניים
    // (CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.session) ש-Prisma `include` מחזיר
    // אוטומטית. מסננים מהתגובה למזכירה — parity עם /api/sessions/calendar
    // ו-/api/sessions/[id]. roomId/location/payment נשמרים (אדמיניסטרטיביים).
    const finalSessions = isSecretary(scopeUser)
      ? withPolicy.map((s) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { topic, notes, ...rest } = s as unknown as Record<string, unknown>;
          return rest;
        })
      : withPolicy;

    return NextResponse.json(serializePrisma(finalSessions));
  } catch (error) {
    logger.error("Get sessions error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הפגישות" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, originalUserId, isImpersonating } = auth;

    const parsed = await parseBody(request, createSessionSchema);
    if ("error" in parsed) return parsed.error;
    const { clientId, startTime, endTime, type, price, location, notes, topic, isRecurring, allowOverlap, therapistId: requestedTherapistId, roomId } = parsed.data;

    const scopeUser = await loadScopeUserWithMode(userId);
    const clientScopeWhere = buildClientWhere(scopeUser);

    // Phase 1 (סבב 21): מזכירה אסור לה ליצור פגישה ללא secretaryPermissions —
    // אכיפה שהיתה חסרה לחלוטין מ-POST. ב-PUT/PATCH יש בדיקות כאלה כבר. גם אם
    // ה-UI יחסום לחיצה, אסור להסתמך על client-side בלבד.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canCreateClient")) {
      // canCreateClient משמש כ-"הרשאה תפעולית בסיסית" — מי שמורשה לפתוח תיק
      // מורשה גם לקבוע פגישות. אם זה לא יספיק בעתיד, יש להוסיף canCreateSession
      // למטריצה ולעדכן את UI/typings.
      return NextResponse.json(
        { message: "אין הרשאה ליצירת פגישה" },
        { status: 403 }
      );
    }

    // Phase 2 (2026-05-26): פתרון המטפל היעד דרך `resolveTherapistIdForSession`
    // ב-`@/lib/scope`. הסדר הסמנטי שמור:
    //   1. שולפים את הלקוח (כי המזכירה יורשת ממנו therapistId).
    //   2. פותרים את finalTherapistId (כולל role-gate ו-tenant validation).
    //   3. ולידציה של ownership (לקוח X משויך למטפל היעד).

    // Step 1: Verify client belongs to scope (skip for BREAK).
    let client: Awaited<ReturnType<typeof prisma.client.findFirst>> | null = null;
    if (type !== "BREAK") {
      client = await prisma.client.findFirst({
        where: { AND: [{ id: clientId }, clientScopeWhere] },
      });
      if (!client) {
        return NextResponse.json(
          { message: "מטופל לא נמצא" },
          { status: 404 }
        );
      }
    }

    // Step 2-3: Resolve finalTherapistId via shared helper.
    const resolved = await resolveTherapistIdForSession({
      scopeUser,
      requestedTherapistId,
      client: client ? { id: client.id, therapistId: client.therapistId } : null,
    });
    if (!resolved.ok) {
      return NextResponse.json({ message: resolved.message }, { status: resolved.status });
    }
    const finalTherapistId = resolved.therapistId;

    // Step 4: Ownership of client vs target therapist.
    // שיוך חופשי בקליניקה (2026-06-15): בעלים *ומזכירה* רשאים לקבוע פגישה
    // למטופל אצל מטפל/ת אחר/ת בקליניקה (ממלא מקום / מטפל/ת פנוי/ה), גם אם
    // המטופל משויך בקביעות למטפל/ת אחר/ת. המטפל היעד כבר אומת ב-
    // resolveTherapistIdForSession: אותו organizationId, לא חסום, ולא מזכירה —
    // כך שאין דליפה חוצה-ארגון. מטפל/ת רגיל/ה בקליניקה עדיין חסום/ה מלשייך
    // מטופל של מטפל/ת אחר/ת. השיוך הקבוע של המטופל אינו משתנה — רק הפגישה
    // הבודדת נרשמת אצל המטפל/ת שנבחר/ה. (גודר תחת secretaryCan(canCreateClient)
    // שנבדק בראש ה-POST.)
    let clientDefaultPrice = 0;
    if (type !== "BREAK" && client) {
      if (
        scopeUser.organizationId &&
        client.therapistId !== finalTherapistId &&
        !isClinicOwner(scopeUser) &&
        !isSecretary(scopeUser)
      ) {
        return NextResponse.json(
          { message: "המטופל אינו משויך למטפל הנבחר" },
          { status: 400 }
        );
      }

      // Default session price מהלקוח, ואם 0 — מהמטפל היעד (לא מהמבצע).
      clientDefaultPrice = Number(client.defaultSessionPrice || 0);
      if (clientDefaultPrice === 0) {
        const therapist = await prisma.user.findUnique({
          where: { id: finalTherapistId },
          select: { defaultSessionPrice: true },
        });
        if (therapist?.defaultSessionPrice) {
          clientDefaultPrice = Number(therapist.defaultSessionPrice);
        }
      }
    }

    // Parse times using Israel timezone
    const parsedStartTime = parseIsraelTime(startTime);
    const parsedEndTime = parseIsraelTime(endTime);

    // Sanity guard against malformed input that would silently corrupt the
    // calendar — e.g. swapped start/end (a 20-hour ghost session that blocks
    // every slot), or absurd durations from a buggy client.
    if (parsedEndTime.getTime() <= parsedStartTime.getTime()) {
      return NextResponse.json(
        { message: "שעת הסיום חייבת להיות אחרי שעת ההתחלה" },
        { status: 400 }
      );
    }
    const durationMs = parsedEndTime.getTime() - parsedStartTime.getTime();
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    if (durationMs > TWELVE_HOURS_MS) {
      return NextResponse.json(
        { message: "משך פגישה לא יכול לעלות על 12 שעות" },
        { status: 400 }
      );
    }

    // שלב 2 (חדרים): אם נבחר חדר — לוודא שהוא שייך לקליניקה של המבצע (ולא
    // חדר מארגון אחר או מזהה מזויף). מטפל עצמאי (ללא org) אינו אמור לשלוח
    // roomId כלל — אם שלח, נדחה. החדר נשמר גם כ-roomId (FK) וגם דרך location
    // (שם החדר) לתאימות עם תצוגות/סנכרון יומן שמסתמכים על location.
    let finalRoomId: string | null = null;
    if (roomId) {
      if (!scopeUser.organizationId) {
        return NextResponse.json(
          { message: "בחירת חדר זמינה רק בקליניקה" },
          { status: 400 }
        );
      }
      const room = await prisma.clinicRoom.findFirst({
        where: { id: roomId, organizationId: scopeUser.organizationId },
        select: { id: true },
      });
      if (!room) {
        return NextResponse.json(
          { message: "החדר הנבחר לא נמצא בקליניקה" },
          { status: 400 }
        );
      }
      finalRoomId = room.id;
    }

    // Check for conflicts on the **target therapist's** calendar — not the
    // operator's. לפני התיקון, מזכירה שקבעה למטפל X לא היתה מקבלת אזהרת
    // double-booking (כי היומן שלה ריק); עכשיו הבדיקה רצה על המטפל היעד.
    const conflict = await prisma.therapySession.findFirst({
      where: {
        therapistId: finalTherapistId,
        status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
        OR: [
          {
            AND: [
              { startTime: { lte: parsedStartTime } },
              { endTime: { gt: parsedStartTime } },
            ],
          },
          {
            AND: [
              { startTime: { lt: parsedEndTime } },
              { endTime: { gte: parsedEndTime } },
            ],
          },
          {
            AND: [
              { startTime: { gte: parsedStartTime } },
              { endTime: { lte: parsedEndTime } },
            ],
          },
        ],
      },
      include: {
        client: { select: { name: true } },
      },
    });

    if (conflict && !allowOverlap) {
      const statusLabels: Record<string, string> = {
        SCHEDULED: "מתוכננת",
        PENDING_APPROVAL: "ממתינה לאישור",
        COMPLETED: "הושלמה",
        CANCELLED: "בוטלה",
        NO_SHOW: "אי הופעה",
      };
      const conflictName = conflict.client?.name || (conflict.type === "BREAK" ? "הפסקה" : "פגישה");
      const conflictStart = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(conflict.startTime);
      const conflictEnd = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(conflict.endTime);
      const statusHeb = statusLabels[conflict.status] || conflict.status;
      return NextResponse.json(
        { message: `יש התנגשות עם פגישה קיימת: ${conflictName} (${conflictStart}-${conflictEnd}), סטטוס: ${statusHeb}` },
        { status: 400 }
      );
    }

    // M5/M11: בקליניקה רב-מטפלית — בדיקת חפיפה ברמת הארגון על אותו location.
    // ה-check הקודם תפס רק התנגשות אצל אותו therapistId; מטפל אחר יכול לקבוע
    // פגישה באותו חדר ובאותה שעה. עוטף את הבדיקה רק אם sit ב-clinic + location.
    if (!allowOverlap) {
      const clinicConflict = await findClinicLocationConflict({
        organizationId: scopeUser.organizationId,
        location: location || null,
        roomId: finalRoomId,
        startTime: parsedStartTime,
        endTime: parsedEndTime,
      });
      if (clinicConflict) {
        return NextResponse.json(
          { message: buildClinicConflictMessage(clinicConflict) },
          { status: 400 }
        );
      }
    }

    const therapySession = await prisma.therapySession.create({
      data: {
        therapistId: finalTherapistId,
        organizationId: scopeUser.organizationId,
        clientId: type === "BREAK" ? null : clientId,
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        type: type ?? "IN_PERSON",
        price: type === "BREAK" ? 0 : (price || clientDefaultPrice),
        topic: topic || null,
        location: location || null,
        roomId: finalRoomId,
        notes: notes || null,
        isRecurring: isRecurring || false,
      },
      include: {
        client: {
          select: { id: true, name: true, email: true },
        },
        therapist: {
          include: {
            communicationSetting: true,
          },
        },
      },
    });

    // Phase 2: audit ליצירת פגישה בשם מטפל אחר (best-effort, לא חוסם).
    await logDelegatedCreate({
      operatorId: userId,
      targetTherapistId: finalTherapistId,
      recordType: "SESSION",
      recordId: therapySession.id,
      organizationId: scopeUser.organizationId,
      clientId: therapySession.clientId,
      ...(isImpersonating ? { impersonatedBy: originalUserId } : {}),
    });

    // Sync to Google Calendar — סנכרון תמיד מבוצע ב-Calendar של המטפל היעד
    // (Calendar שייך למטפל ולא למזכירה שיצרה את הפגישה). ככה הפגישה תופיע
    // ב-Google Calendar של המטפל הנכון.
    syncSessionToGoogleCalendar(finalTherapistId, {
      id: therapySession.id,
      clientName: therapySession.client?.name || null,
      type: therapySession.type,
      startTime: therapySession.startTime,
      endTime: therapySession.endTime,
      location: therapySession.location,
      topic: therapySession.topic,
    }).catch((err) => logger.error("[GoogleCalendarSync] Error:", { error: err instanceof Error ? err.message : String(err) }));

    // Send confirmation email (skip for BREAK and if client has no email)
    if (type !== "BREAK" && therapySession.client?.email) {
      // Check if therapist has confirmation emails enabled
      const settings = therapySession.therapist.communicationSetting;
      if (!settings || settings.sendConfirmationEmail) {
        // Send email directly without HTTP request
        const { sendEmail } = await import("@/lib/resend");
        const { createSessionConfirmationEmail, formatSessionDateTime } = await import("@/lib/email-templates");

        // Format session date/time for confirmation email
        const { date, time } = formatSessionDateTime(therapySession.startTime);
        // Store email in variable for type safety
        const clientEmail = therapySession.client.email;
        // קישור "הפגישות שלי" לביטול ע"י המטופל — רק אם המטפל/ת מאפשר/ת ביטול-מטופל.
        let manageUrl: string | undefined;
        const allowCancel = settings ? settings.allowClientCancellation : true;
        if (allowCancel && therapySession.clientId) {
          const { ensureManageLinkToken, buildManageUrl } = await import("@/lib/appointment-manage-link");
          const mtoken = await ensureManageLinkToken({
            id: therapySession.clientId,
            email: therapySession.client.email,
            phone: null,
            therapistId: therapySession.therapistId,
            organizationId: therapySession.organizationId ?? null,
          });
          if (mtoken) manageUrl = buildManageUrl(mtoken);
        }
        const { subject, html } = createSessionConfirmationEmail({
          clientName: therapySession.client.name,
          therapistName: therapySession.therapist.name || "המטפל/ת שלך",
          date,
          time,
          address: therapySession.location || undefined,
          manageUrl,
          customization: settings ? {
            customGreeting: settings.customGreeting,
            customClosing: settings.customClosing,
            emailSignature: settings.emailSignature,
            businessHours: settings.businessHours,
          } : null,
        });

        // Send email asynchronously
        sendEmail({
          to: clientEmail,
          subject,
          html,
        })
          .then(async (result) => {
            // Log communication
            await prisma.communicationLog.create({
              data: {
                type: "SESSION_CONFIRMATION",
                channel: "EMAIL",
                recipient: clientEmail,
                subject,
                content: html,
                status: result.success ? "SENT" : "FAILED",
                errorMessage: result.success ? null : String(result.error),
                sentAt: result.success ? new Date() : null,
                sessionId: therapySession.id,
                clientId: therapySession.clientId,
                userId: therapySession.therapistId,
                messageId: result.messageId,
              },
            });

            // Log result
            if (result.success) {
              logger.info("Confirmation email sent", { clientId: therapySession.clientId });
            } else {
              logger.error("Failed to send confirmation", { clientId: therapySession.clientId, error: result.error });
            }
          })
          .catch((err) => logger.error("Failed to send confirmation:", { error: err instanceof Error ? err.message : String(err) }));
      }
    }

    // WRITE_SUMMARY tasks removed - summary tracking is done via sessionNote IS NULL
    // on TherapySession directly (single source of truth)

    // Return session without therapist data (clean response)
    return NextResponse.json(serializePrisma({
      ...therapySession,
      therapist: undefined,
    }), { status: 201 });
  } catch (error) {
    logger.error("Create session error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הפגישה" },
      { status: 500 }
    );
  }
}
