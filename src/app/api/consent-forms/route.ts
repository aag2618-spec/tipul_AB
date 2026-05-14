import { NextResponse } from "next/server";
import { ConsentType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser, buildClientWhere, isSecretary, secretaryCan } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const isTemplate = searchParams.get("isTemplate") === "true";

    const scopeUser = await loadScopeUser(userId);
    // גייט מזכירה — בעלת הקליניקה מגדירה ב-/clinic-admin/members אם
    // המזכירה רואה טפסי הסכמה. ברירת מחדל בטוחה: false.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewConsentForms")) {
      return NextResponse.json(
        { message: "אין הרשאה לצפייה בטפסי הסכמה" },
        { status: 403 }
      );
    }
    const clientWhere = buildClientWhere(scopeUser);
    const ownershipFilter = scopeUser.organizationId
      ? { organizationId: scopeUser.organizationId }
      : { therapistId: userId };

    const where: Record<string, unknown> = {
      OR: [
        { client: clientWhere },
        { AND: [{ clientId: null }, ownershipFilter] },
      ],
    };
    if (clientId) {
      where.clientId = clientId;
    }
    if (isTemplate !== undefined) {
      where.isTemplate = isTemplate;
    }

    const forms = await prisma.consentForm.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(forms);
  } catch (error) {
    logger.error("Get consent forms error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת הטפסים" },
      { status: 500 }
    );
  }
}

// M14/M15: input validation למניעת stored XSS וDoS.
// content יכול להכיל HTML formatted (rich text editor) — לא נחסום HTML
// אבל נגביל גודל. ה-rendering בצד client חייב להשתמש ב-sanitizer נפרד
// (DOMPurify / sanitize-html) — אכיפה דו-שכבתית.
const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 50_000; // ~10 דפי A4
const ALLOWED_FORM_TYPES = [
  "TREATMENT_AGREEMENT",
  "INFORMED_CONSENT",
  "CONFIDENTIALITY",
  "RECORDING_CONSENT",
  "TELEHEALTH_CONSENT",
  "PARENTAL_CONSENT",
  "CUSTOM",
] as const satisfies readonly ConsentType[];

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewConsentForms")) {
      return NextResponse.json(
        { message: "אין הרשאה ליצירת טפסי הסכמה" },
        { status: 403 }
      );
    }
    const clientWhere = buildClientWhere(scopeUser);

    const body = (await request.json()) as Record<string, unknown>;
    const { type, title, content, isTemplate, clientId } = body;

    // M14/M15: validation מקיף לפני יצירת רשומה.
    if (typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ message: "כותרת חובה" }, { status: 400 });
    }
    if (title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { message: `כותרת ארוכה מדי (מקסימום ${MAX_TITLE_LENGTH} תווים)` },
        { status: 400 }
      );
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ message: "תוכן חובה" }, { status: 400 });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { message: `תוכן ארוך מדי (מקסימום ${MAX_CONTENT_LENGTH} תווים)` },
        { status: 400 }
      );
    }
    if (typeof type !== "string" || !ALLOWED_FORM_TYPES.includes(type as (typeof ALLOWED_FORM_TYPES)[number])) {
      return NextResponse.json(
        { message: "סוג טופס לא תקין" },
        { status: 400 }
      );
    }
    const validatedType = type as (typeof ALLOWED_FORM_TYPES)[number];
    if (typeof isTemplate !== "boolean") {
      return NextResponse.json(
        { message: "isTemplate חייב להיות boolean" },
        { status: 400 }
      );
    }
    if (clientId !== undefined && clientId !== null && typeof clientId !== "string") {
      return NextResponse.json(
        { message: "clientId לא תקין" },
        { status: 400 }
      );
    }

    // אם נשלח clientId — וודא שהוא בתוך ה-scope של המשתמש.
    if (clientId) {
      const exists = await prisma.client.findFirst({
        where: { AND: [{ id: clientId }, clientWhere] },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
      }
    }

    const form = await prisma.consentForm.create({
      data: {
        type: validatedType,
        title: title.trim(),
        content,
        isTemplate,
        clientId: clientId || null,
        therapistId: userId,
        organizationId: scopeUser.organizationId,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(form);
  } catch (error) {
    logger.error("Create consent form error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת הטופס" },
      { status: 500 }
    );
  }
}
