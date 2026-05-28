import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HealthInsurer } from "@prisma/client";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { logDataAccess } from "@/lib/audit-logger";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildClientWhere,
  getClientSafeSelectForSecretary,
  isClinicOwner,
  isSecretary,
  loadScopeUser,
  secretaryCan,
} from "@/lib/scope";

export const dynamic = "force-dynamic";

// Stage 2.0 — Zod schema לעדכון מטופל. כל השדות אופציונליים (PATCH semantics).
// .passthrough() נשמר במכוון כדי שבדיקת השדות הקליניים החסומים למזכירה
// (CLINICAL_KEYS_BLOCKED) תוכל לקרוא את ה-body המקורי. השדות הקליניים האלה
// **אינם** ב-schema, אז גם אם הם passthrough — ה-destructuring למטה לא קולט
// אותם, והם לא מגיעים ל-Prisma update.data. אם תוסיפו שדות חדשים ל-Zod,
// כיסו גם אותם ב-CLINICAL_KEYS_BLOCKED אם רגישים קלינית.
// המגבלות:
//   - אורך מקסימום על שדות טקסט (DoS guard)
//   - email תקין (אם נשלח)
//   - phone — תווי טלפון בלבד
//   - birthDate — ISO date string (refine בודק תקינות) או null
//   - status — enum מותר (תואם Prisma ClientStatus)
//   - defaultSessionPrice — מספר חיובי או null
const UpdateClientSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  // phone — מקבל ספרות + תווי הפרדה רגילים + נקודה + פסיק + סלאש (ext, country
  // codes נוסחה בינלאומית). הרגישות העיקרית היא DoS דרך אורך — לא הצמדה לפורמט.
  phone: z.string().max(50).optional().nullable(),
  email: z.string().max(254).email("מייל לא תקין").optional().nullable().or(z.literal("")),
  birthDate: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "תאריך לא תקין")
    .optional()
    .nullable()
    .or(z.literal("")),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(20_000).optional().nullable(),
  status: z.enum(["ACTIVE", "WAITING", "INACTIVE", "ARCHIVED"]).optional(),
  initialDiagnosis: z.string().max(20_000).optional().nullable(),
  intakeNotes: z.string().max(20_000).optional().nullable(),
  defaultSessionPrice: z.union([z.number().min(0).max(100_000), z.null()]).optional(),
  isQuickClient: z.boolean().optional(),
  // M1 — הסכמת המטופל לעיבוד נתוניו ב-AI (חוק הגנת הפרטיות §13).
  // true = הסכים, false = סירב במפורש (חוסם AI), null = ביטול בחירה (חוזר ל-default).
  // השדה לא חסום למזכירה כי זו החלטה משפטית של המטופל מטופס שהוא חתם — לא קביעה קלינית.
  consentToAI: z.boolean().nullable().optional(),
  healthFund: z.nativeEnum(HealthInsurer).optional().nullable(),
  // Phase 3: העברת לקוח בין מטפלים בקליניקה. OWNER/SECRETARY (עם canCreateClient)
  // בלבד. ה-cuid באורך 25 — שמרני יותר עם cap 64. trim() כדי שמחרוזת רווחים
  // תיכשל ב-min(1) ולא תיפול בשקט. הוולידציה הסמנטית (אותו org, לא חסום,
  // לא SECRETARY) ב-route עצמו.
  therapistId: z.string().trim().min(1).max(64).optional(),
}).passthrough();

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
    const scopeWhere = buildClientWhere(scopeUser);
    const fields = request.nextUrl.searchParams.get("fields");

    // fields=basic — רק פרטי לקוח בסיסיים, בלי sessions/payments/recordings/documents.
    // מונע over-fetching של PHI בדפי עריכה/intake/email שצריכים רק שם+טלפון.
    const whereClause = { AND: [{ id }, scopeWhere] };

    let client;
    if (fields === "basic") {
      client = await prisma.client.findFirst({ where: whereClause });
    } else if (isSecretary(scopeUser)) {
      // הגנה על תוכן קליני: מזכירה מקבלת select מצומצם בלבד (ללא sessionNote/recordings/transcription/analysis).
      // Phase 1 (סבב 21): payments נחשפו תמיד למזכירה גם בלי canViewPayments —
      // מקור פערים מול buildPaymentWhere ב-/api/payments. עכשיו: כוללים
      // payments ב-select רק אם canViewPayments=true. אותו דין ל-canViewDebts
      // (אם בעתיד נחלק את הצגת התשלומים להיסטוריה נטו vs יתרת חוב).
      const canSeePayments = secretaryCan(scopeUser, "canViewPayments");
      client = await prisma.client.findFirst({
          where: whereClause,
          select: {
            ...getClientSafeSelectForSecretary(),
            therapySessions: {
              orderBy: { startTime: "desc" },
              take: 10,
              select: {
                id: true,
                startTime: true,
                endTime: true,
                status: true,
                type: true,
                price: true,
                location: true,
                clientId: true,
                therapistId: true,
                organizationId: true,
                // payment per-session: נדרש לקליינט שמראה לכל פגישה אם
                // היא שולמה (client-sessions-tab וכד'). ללא זה, מזכירה
                // עם canViewPayments תראה payments[] ברמת הלקוח, אבל
                // לכל פגישה נפרדת payment=undefined → "אין תשלום" שגוי.
                // childPayments נדרש ל-calculatePaidAmount.
                ...(canSeePayments
                  ? {
                      payment: {
                        include: {
                          childPayments: {
                            where: { status: "PAID" as const },
                            select: { id: true, amount: true, status: true },
                          },
                        },
                      },
                    }
                  : {}),
              },
            },
            ...(canSeePayments
              ? {
                  payments: {
                    orderBy: { createdAt: "desc" as const },
                    take: 10,
                  },
                }
              : {}),
            documents: {
              orderBy: { createdAt: "desc" },
            },
          },
        });

      // עקביות ב-shape ל-frontend: אם payments הוסרו, נחזיר מערך ריק
      // במקום undefined. הקליינטים בודקים `client.payments?.length`,
      // אבל יותר בטוח להחזיר מערך ריק עקבי.
      if (client && !canSeePayments) {
        (client as Record<string, unknown>).payments = [];
      }
    } else {
      client = await prisma.client.findFirst({
          where: whereClause,
          include: {
            therapySessions: {
              orderBy: { startTime: "desc" },
              take: 10,
              include: { sessionNote: true },
            },
            payments: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
            recordings: {
              orderBy: { createdAt: "desc" },
              take: 5,
              include: { transcription: { include: { analysis: true } } },
            },
            documents: {
              orderBy: { createdAt: "desc" },
            },
          },
        });
    }

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // Audit log — קריאה לפרופיל מטופל כוללת notes/initialDiagnosis/intakeNotes
    logDataAccess({
      userId,
      recordType: "CLIENT_PROFILE",
      recordId: id,
      action: "READ",
      clientId: id,
      request,
      ...(isImpersonating ? { impersonatedBy: originalUserId } : {}),
    });

    return NextResponse.json(serializePrisma(client));
  } catch (error) {
    logger.error("Get client error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המטופל" },
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

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "גוף הבקשה לא תקין" }, { status: 400 });
    }

    // Stage 2.0 — Zod input validation. דוחה body עם שדות לא-תקינים (סוגים, אורכים, פורמט).
    const parsed = UpdateClientSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          message: firstIssue?.message ?? "נתונים לא תקינים",
          field: firstIssue?.path.join(".") ?? null,
        },
        { status: 400 }
      );
    }

    const { firstName, lastName, phone, email, birthDate, address, notes, status, initialDiagnosis, intakeNotes, defaultSessionPrice, isQuickClient, consentToAI, healthFund, therapistId } = parsed.data;

    const scopeUser = await loadScopeUser(userId);
    const scopeWhere = buildClientWhere(scopeUser);

    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canCreateClient")) {
      return NextResponse.json(
        { message: "אין הרשאה לעדכון מטופל" },
        { status: 403 }
      );
    }

    // חסימת מזכירה מעדכון שדות קליניים (חוק זכויות החולה / חוק הפסיכולוגים).
    if (isSecretary(scopeUser)) {
      const CLINICAL_KEYS_BLOCKED = [
        "notes",
        "intakeNotes",
        "initialDiagnosis",
        "medicalHistory",
        "therapeuticApproaches",
        "approachNotes",
        "culturalContext",
        "comprehensiveAnalysis",
        "comprehensiveAnalysisAt",
      ];
      const sentClinicalKeys = CLINICAL_KEYS_BLOCKED.filter(
        (k) => k in body && body[k] !== undefined
      );
      if (sentClinicalKeys.length > 0) {
        logger.warn("[clients/PUT] Secretary attempted to update clinical fields", {
          userId,
          clientId: id,
          sentClinicalKeys,
        });
        return NextResponse.json(
          { message: "אין הרשאה לעדכון שדות קליניים" },
          { status: 403 }
        );
      }
    }

    // Verify ownership / scope
    const existingClient = await prisma.client.findFirst({
      where: { AND: [{ id }, scopeWhere] },
    });

    if (!existingClient) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // Phase 3: אימות `therapistId` (העברת לקוח בין מטפלים). הוולידציה הסמנטית
    // נעשית כאן (לא ב-zod) כי דרושה גישה ל-`scopeUser` ולקריאת DB. הסדר:
    //   • מטפל עצמאי (organizationId=null): אין מי להעביר אליו → מתעלמים.
    //   • THERAPIST רגיל בקליניקה: אסור (RBAC) → 403.
    //   • OWNER + SECRETARY (עם canCreateClient שנבדק לעיל): מותר, עם ולידציה
    //     שהמטפל החדש קיים, באותו org, לא חסום, ולא SECRETARY.
    // חשוב: אם השדה לא נשלח כלל (`therapistId === undefined`) — אין שינוי.
    let resolvedTherapistId: string | undefined;
    if (therapistId !== undefined) {
      if (!scopeUser.organizationId) {
        // עצמאי: מתעלמים בשקט (אין מי להעביר אליו). אם הערך זהה ל-self,
        // אין כאן בעיה. אם שונה — לא מבצעים reassignment.
      } else if (!isClinicOwner(scopeUser) && !isSecretary(scopeUser)) {
        return NextResponse.json(
          { message: "אין הרשאה לשייך מטופל למטפל אחר" },
          { status: 403 }
        );
      } else {
        const target = await prisma.user.findFirst({
          where: {
            id: therapistId,
            organizationId: scopeUser.organizationId,
            isBlocked: false,
          },
          select: { id: true, clinicRole: true },
        });
        if (!target) {
          return NextResponse.json(
            { message: "המטפל הנבחר לא נמצא בקליניקה" },
            { status: 400 }
          );
        }
        if (target.clinicRole === "SECRETARY") {
          return NextResponse.json(
            { message: "לא ניתן לשייך מטופל למזכירה" },
            { status: 400 }
          );
        }
        resolvedTherapistId = target.id;
      }
    }

    // M1 — consentToAI: עדכון consentToAIAt רק כשהערך באמת משתנה, כדי לתעד מתי
    // המטופל חתם על הסכמה/סירוב. נחשב כשינוי גם המעבר null → true/false (החלטה ראשונית).
    const consentChanged =
      consentToAI !== undefined && consentToAI !== existingClient.consentToAI;

    const client = await prisma.client.update({
      where: { id },
      data: {
        firstName: firstName?.trim() || existingClient.firstName || "",
        lastName: lastName?.trim() || existingClient.lastName || "",
        name: (firstName && lastName) ? `${firstName.trim()} ${lastName.trim()}` : existingClient.name,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        address: address?.trim() || null,
        notes: notes !== undefined ? (notes?.trim() || null) : existingClient.notes,
        status: status || existingClient.status,
        defaultSessionPrice: defaultSessionPrice !== undefined ? defaultSessionPrice : existingClient.defaultSessionPrice,
        initialDiagnosis: initialDiagnosis !== undefined ? (initialDiagnosis?.trim() || null) : existingClient.initialDiagnosis,
        intakeNotes: intakeNotes !== undefined ? (intakeNotes?.trim() || null) : existingClient.intakeNotes,
        // שדרוג פונה למטופל קבוע — אוטומטי אם יש firstName+lastName, או ידני
        ...(isQuickClient !== undefined
          ? { isQuickClient }
          : existingClient.isQuickClient && firstName?.trim() && lastName?.trim()
            ? { isQuickClient: false }
            : {}),
        ...(consentChanged
          ? { consentToAI, consentToAIAt: new Date() }
          : {}),
        ...(healthFund !== undefined
          ? { healthFund: healthFund || null }
          : {}),
        ...(resolvedTherapistId !== undefined
          ? { therapistId: resolvedTherapistId }
          : {}),
      },
    });

    if (consentChanged) {
      logger.info("[clients/PUT] consentToAI updated", {
        userId,
        clientId: id,
        previousValue: existingClient.consentToAI,
        newValue: consentToAI,
      });
    }

    return NextResponse.json(serializePrisma(client));
  } catch (error) {
    logger.error("Update client error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון המטופל" },
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
    const { userId, originalUserId, isImpersonating } = auth;

    const { id } = await params;

    // Rate limit — מחיקת מטופל היא פעולה הרסנית בלתי-הפיכה. מקסימום 5/שעה
    // למשתמש מונע שגיאות UI (לחיצה כפולה), טעות אנוש המונית ו-abuse של חשבון
    // נפרץ. גם מטפל פעיל לא צריך למחוק יותר מ-5 מטופלים בשעה בנסיבות נורמליות.
    const rateLimitResult = checkRateLimit(`delete-client:${userId}`, {
      maxRequests: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { message: "ביצעת מחיקות רבות לאחרונה. אפשר לנסות שוב בעוד שעה." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(1, Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000))
            ),
          },
        }
      );
    }

    const scopeUser = await loadScopeUser(userId);
    const scopeWhere = buildClientWhere(scopeUser);

    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canCreateClient")) {
      return NextResponse.json(
        { message: "אין הרשאה למחיקת מטופל" },
        { status: 403 }
      );
    }

    // Verify ownership / scope
    const existingClient = await prisma.client.findFirst({
      where: { AND: [{ id }, scopeWhere] },
    });

    if (!existingClient) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    await prisma.client.delete({ where: { id } });

    // Audit log — מחיקה היא פעולה הרסנית. רושמים מי מחק, את מי, ומתי.
    // שומרים גם את שם המטופל ב-meta כי הרשומה כבר לא קיימת ב-DB אחרי המחיקה.
    // firstName/lastName הם nullable ב-schema; ה-name (חובה) משמש כ-fallback בטוח.
    const auditDeletedName =
      [existingClient.firstName, existingClient.lastName]
        .filter((s): s is string => Boolean(s))
        .join(" ")
        .trim() || existingClient.name;
    logDataAccess({
      userId,
      recordType: "CLIENT_PROFILE",
      recordId: id,
      action: "DELETE",
      clientId: id,
      request,
      meta: {
        deletedClientName: auditDeletedName,
      },
      ...(isImpersonating ? { impersonatedBy: originalUserId } : {}),
    });

    return NextResponse.json({ message: "המטופל נמחק בהצלחה" });
  } catch (error) {
    logger.error("Delete client error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת המטופל" },
      { status: 500 }
    );
  }
}
