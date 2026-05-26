import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { parseBody } from "@/lib/validations/helpers";
import { createClientSchema, createQuickClientSchema } from "@/lib/validations/client";
import { logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { buildClientWhere, isClinicOwner, isSecretary, loadScopeUser, secretaryCan } from "@/lib/scope";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const includeQuick = searchParams.get("includeQuick") === "true";

    const scopeUser = await loadScopeUser(userId);
    const scopeWhere = buildClientWhere(scopeUser);

    const extraConditions: Prisma.ClientWhereInput = {};
    if (status) {
      extraConditions.status = status as Prisma.ClientWhereInput["status"];
    }
    if (!includeQuick) {
      extraConditions.isQuickClient = false;
    }

    const where: Prisma.ClientWhereInput = { AND: [scopeWhere, extraConditions] };

    const clients = await prisma.client.findMany({
      where,
      orderBy: { lastName: "asc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        isQuickClient: true,
        defaultSessionPrice: true,
        createdAt: true,
        _count: {
          select: {
            therapySessions: true,
          },
        },
      },
    });

    // Convert Decimal to number for JSON serialization
    const clientsWithPriceAsNumber = clients.map(client => ({
      ...client,
      defaultSessionPrice: client.defaultSessionPrice ? Number(client.defaultSessionPrice) : null,
    }));

    return NextResponse.json(clientsWithPriceAsNumber);
  } catch (error) {
    logger.error("Get clients error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המטופלים" },
      { status: 500 }
    );
  }
}

// Phase 1 (סבב 21): פונקציית עזר לבחירת ה-therapistId הסופי שייכתב לרשומת
// המטופל. עיקרון (backward-compat מלא):
//   • מטפל עצמאי (organizationId=null): תמיד self; ניסיון לבחור אחר → 400.
//   • בעלת קליניקה / מטפל בקליניקה / מזכירה: יכולים לציין יעד; אם לא ציינו —
//     ברירת מחדל self (זה הזרם ההיסטורי, נשמר כדי לא לשבור UI קיים).
//   • אם **כן** נשלח therapistId, חובה לוודא שהוא משתמש קיים, לא חסום,
//     וב-organizationId זהה (מניעת cross-tenant write) ולא SECRETARY.
//
// טיפול במזכירה ללא therapistId: עד שלב 4 ב-UI לא יישלח therapistId;
// אנחנו לוגים warn כדי שיהיה visible במוניטורינג, אבל עדיין מאפשרים את
// היצירה (אחרת כל UI הקיים של מזכירה נשבר).
async function resolveTherapistIdForClient(params: {
  scopeUser: Awaited<ReturnType<typeof loadScopeUser>>;
  requestedTherapistId?: string | null;
}): Promise<{ ok: true; therapistId: string } | { ok: false; status: number; message: string }> {
  const { scopeUser, requestedTherapistId } = params;
  const trimmed = requestedTherapistId?.trim() || "";

  // מטפל עצמאי: לא ניתן ליצור על שם מישהו אחר.
  if (!scopeUser.organizationId) {
    if (trimmed && trimmed !== scopeUser.id) {
      return { ok: false, status: 400, message: "לא ניתן לבחור מטפל אחר במצב עצמאי" };
    }
    return { ok: true, therapistId: scopeUser.id };
  }

  // אם לא נשלח therapistId — self (תאימות לאחור). אם המבצע מזכירה → warn
  // כדי שיהיה visible (המטופל יישמר על שם המזכירה כמו עד היום, עד שה-UI
  // ישלח therapistId בשלב 4).
  if (!trimmed) {
    if (isSecretary(scopeUser)) {
      logger.warn("[clients/POST] Secretary created client without therapistId (legacy flow)", {
        userId: scopeUser.id,
        organizationId: scopeUser.organizationId,
      });
    }
    return { ok: true, therapistId: scopeUser.id };
  }

  // נשלח therapistId שונה מ-self → H1 role gate: רק OWNER ו-SECRETARY מורשים.
  // THERAPIST רגיל בקליניקה לא יכול לשייך מטופל לקולגה.
  if (trimmed !== scopeUser.id) {
    if (!isClinicOwner(scopeUser) && !isSecretary(scopeUser)) {
      return {
        ok: false,
        status: 403,
        message: "אין הרשאה לשייך מטופל למטפל אחר",
      };
    }
  }

  // קיים therapistId מבוקש — לוודא tenant + לא חסום + clinicRole רלוונטי.
  const target = await prisma.user.findFirst({
    where: {
      id: trimmed,
      organizationId: scopeUser.organizationId,
      isBlocked: false,
    },
    select: { id: true, clinicRole: true },
  });
  if (!target) {
    return { ok: false, status: 400, message: "המטפל הנבחר לא נמצא בקליניקה" };
  }
  // SECRETARY לא יכול להיות מטפל אחראי על מטופל. OWNER ו-THERAPIST כן.
  if (target.clinicRole === "SECRETARY") {
    return { ok: false, status: 400, message: "לא ניתן לשייך מטופל למזכירה" };
  }
  return { ok: true, therapistId: target.id };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canCreateClient")) {
      return NextResponse.json(
        { message: "אין הרשאה ליצירת מטופל" },
        { status: 403 }
      );
    }

    // בדיקה אם זו יצירת פונה מהיר (פגישת ייעוץ)
    const rawBody = await request.clone().json();
    const isQuickClient = rawBody.isQuickClient === true;

    if (isQuickClient) {
      // --- פונה מהיר: שם + טלפון/מייל בלבד ---
      const parsed = await parseBody(request, createQuickClientSchema);
      if ("error" in parsed) return parsed.error;
      const { name, phone, email, defaultSessionPrice, therapistId: requestedTherapistId } = parsed.data;

      const resolved = await resolveTherapistIdForClient({
        scopeUser,
        requestedTherapistId,
      });
      if (!resolved.ok) {
        return NextResponse.json({ message: resolved.message }, { status: resolved.status });
      }
      const finalTherapistId = resolved.therapistId;

      let finalPrice = defaultSessionPrice ? parseFloat(String(defaultSessionPrice)) : null;
      if (finalPrice === null) {
        const therapist = await prisma.user.findUnique({
          where: { id: finalTherapistId },
          select: { defaultSessionPrice: true },
        });
        if (therapist?.defaultSessionPrice) {
          finalPrice = Number(therapist.defaultSessionPrice);
        }
      }

      // פיצול שם לשם פרטי ומשפחה (אם יש רווח)
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      const client = await prisma.client.create({
        data: {
          therapistId: finalTherapistId,
          organizationId: scopeUser.organizationId,
          firstName,
          lastName: lastName || null,
          name: name.trim(),
          phone: phone || null,
          email: email || null,
          status: "ACTIVE",
          isQuickClient: true,
          defaultSessionPrice: finalPrice,
        },
      });

      return NextResponse.json(serializePrisma(client), { status: 201 });
    }

    // --- מטופל רגיל: זרימה קיימת ללא שינוי ---
    const parsed = await parseBody(request, createClientSchema);
    if ("error" in parsed) return parsed.error;
    const { firstName, lastName, phone, email, birthDate, address, notes, status, defaultSessionPrice, consentToAI, healthFund, therapistId: requestedTherapistId } = parsed.data;

    const resolved = await resolveTherapistIdForClient({
      scopeUser,
      requestedTherapistId,
    });
    if (!resolved.ok) {
      return NextResponse.json({ message: resolved.message }, { status: resolved.status });
    }
    const finalTherapistId = resolved.therapistId;

    // אם לא הוגדר מחיר למטופל, להשתמש במחיר ברירת המחדל של המטפל היעד
    // (לא של המבצע — כדי שמזכירה שיוצרת מטופל למטפל אחר תקבל את המחיר שלו).
    let finalPrice = defaultSessionPrice ? parseFloat(String(defaultSessionPrice)) : null;
    if (finalPrice === null) {
      const therapist = await prisma.user.findUnique({
        where: { id: finalTherapistId },
        select: { defaultSessionPrice: true },
      });
      if (therapist?.defaultSessionPrice) {
        finalPrice = Number(therapist.defaultSessionPrice);
      }
    }

    const client = await prisma.client.create({
      data: {
        therapistId: finalTherapistId,
        organizationId: scopeUser.organizationId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`,
        phone: phone || null,
        email: email || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        address: address || null,
        notes: notes || null,
        status: status || "ACTIVE",
        defaultSessionPrice: finalPrice,
        // M1 — אם המטפל סימן ידנית בטופס היצירה, שומרים גם תאריך החלטה.
        // אם לא נשלח, ה-default ב-DB הוא true (תאימות לאחור) ואין consentToAIAt.
        ...(consentToAI !== undefined
          ? { consentToAI, consentToAIAt: new Date() }
          : {}),
        healthFund: healthFund || null,
      },
    });

    return NextResponse.json(serializePrisma(client), { status: 201 });
  } catch (error) {
    logger.error("Create client error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת המטופל" },
      { status: 500 }
    );
  }
}
