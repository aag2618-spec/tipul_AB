import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { parseBody } from "@/lib/validations/helpers";
import { createClientSchema, createQuickClientSchema } from "@/lib/validations/client";
import { logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { logDelegatedCreate } from "@/lib/audit";
import {
  buildClientWhere,
  isSecretary,
  loadScopeUser,
  resolveTherapistIdForClient,
  secretaryCan,
} from "@/lib/scope";
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

// Phase 2 (2026-05-26): `resolveTherapistIdForClient` חולץ ל-`@/lib/scope`
// כדי שאותה לוגיקה תשמש בכל ה-routes שיוצרים רשומות (Client/Session/sub-records).

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, originalUserId, isImpersonating } = auth;

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

    // Phase 3: הקשחת תאימות לאחור (באישור מפורש של המשתמש) — מזכירה חייבת
    // לציין therapistId. ה-UI כבר אוכף את זה ב-/clients/new וב-NewSessionDialog
    // (commit-ים 9ca9a798 + c8e7d9ba), אבל בקשה ישירה (Postman/script/UI ישן)
    // עקפה את resolveTherapistIdForClient (שנפל ל-default self = המזכירה).
    // עכשיו 400 לפני שנוגעים בשרת. שובר תאימות במכוון: כל זרימה שיוצרת
    // לקוח כמזכירה חייבת UI מעודכן.
    const rawTherapistId = typeof rawBody.therapistId === "string"
      ? rawBody.therapistId.trim()
      : "";
    if (isSecretary(scopeUser) && !rawTherapistId) {
      return NextResponse.json(
        { message: "חובה לבחור מטפל אחראי" },
        { status: 400 }
      );
    }

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

      // Phase 2: audit ליצירה שמבוצעת בשם מטפל אחר (best-effort, לא חוסם).
      await logDelegatedCreate({
        operatorId: userId,
        targetTherapistId: finalTherapistId,
        recordType: "CLIENT",
        recordId: client.id,
        organizationId: scopeUser.organizationId,
        ...(isImpersonating ? { impersonatedBy: originalUserId } : {}),
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

    // Phase 2: audit ליצירה שמבוצעת בשם מטפל אחר (best-effort, לא חוסם).
    await logDelegatedCreate({
      operatorId: userId,
      targetTherapistId: finalTherapistId,
      recordType: "CLIENT",
      recordId: client.id,
      organizationId: scopeUser.organizationId,
      ...(isImpersonating ? { impersonatedBy: originalUserId } : {}),
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
