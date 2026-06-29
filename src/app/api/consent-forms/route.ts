import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logDelegatedCreate } from "@/lib/audit";

import { requireAuth } from "@/lib/api-auth";
import {
  buildClientWhere,
  buildConsentFormWhere,
  isSecretary,
  loadScopeUser,
  resolveTherapistIdForClientChild,
  secretaryCan,
} from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { sanitizeUserHtml } from "@/lib/sanitize-html";
import { parseBody } from "@/lib/validations/helpers";
import { createConsentFormSchema } from "@/lib/validations/consent-form";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const isTemplate = searchParams.get("isTemplate") === "true";

    const scopeUser = await loadScopeUserWithMode(userId);
    // גייט מזכירה — בעלת הקליניקה מגדירה ב-/clinic-admin/members אם
    // המזכירה רואה טפסי הסכמה. ברירת מחדל בטוחה: false.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewConsentForms")) {
      return NextResponse.json(
        { message: "אין הרשאה לצפייה בטפסי הסכמה" },
        { status: 403 }
      );
    }
    // B5: buildConsentFormWhere מרכז את הלוגיקה. THERAPIST בקליניקה רואה
    // רק טמפלייטים של עצמו (clientId=null + therapistId=user.id) במקום
    // את כל הטמפלייטים של הארגון.
    const baseWhere = buildConsentFormWhere(scopeUser);
    const andFilters: Prisma.ConsentFormWhereInput[] = [baseWhere];
    if (clientId) andFilters.push({ clientId });
    if (isTemplate !== undefined) andFilters.push({ isTemplate });

    const forms = await prisma.consentForm.findMany({
      where: { AND: andFilters },
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

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, originalUserId, isImpersonating } = auth;

    const scopeUser = await loadScopeUserWithMode(userId);
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewConsentForms")) {
      return NextResponse.json(
        { message: "אין הרשאה ליצירת טפסי הסכמה" },
        { status: 403 }
      );
    }
    const clientWhere = buildClientWhere(scopeUser);

    // H12: validation דרך zod (M14/M15 — caps + enum + טיפוסים).
    const parsed = await parseBody(request, createConsentFormSchema);
    if ("error" in parsed) return parsed.error;
    const { type, title, content, isTemplate, clientId } = parsed.data;

    // הגנה-לעומק (XSS): content הוא HTML עשיר מ-TipTap. zod אוכף אורך/טיפוס
    // בלבד — לכן מנקים את ה-HTML בכתיבה (כמו ב-sessions/[id]/note) כדי שלא יישב
    // payload זדוני ב-DB. התצוגה עדיין עוטפת ב-DOMPurify (הגנה כפולה).
    const safeContent = sanitizeUserHtml(content);

    // אם נשלח clientId — וודא שהוא בתוך ה-scope של המשתמש + טען therapistId.
    let clientForOwnership: { id: string; therapistId: string } | null = null;
    if (clientId) {
      const exists = await prisma.client.findFirst({
        where: { AND: [{ id: clientId }, clientWhere] },
        select: { id: true, therapistId: true },
      });
      if (!exists) {
        return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
      }
      clientForOwnership = exists;
    }

    // Phase 2: טופס הסכמה מצורף ללקוח יישמר תחת המטפל של הלקוח (לא המבצע) —
    // כך שמזכירה שמכינה טופס לא "תיקח" את הבעלות. טמפלייט (ללא לקוח) נשאר תחת המבצע.
    const finalTherapistId = resolveTherapistIdForClientChild({
      scopeUser,
      client: clientForOwnership,
    });

    const form = await prisma.consentForm.create({
      data: {
        type,
        title,
        content: safeContent,
        isTemplate,
        clientId: clientId || null,
        therapistId: finalTherapistId,
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

    // Phase 2: audit ליצירה בשם מטפל אחר.
    await logDelegatedCreate({
      operatorId: userId,
      targetTherapistId: finalTherapistId,
      recordType: "CONSENT_FORM",
      recordId: form.id,
      organizationId: scopeUser.organizationId,
      clientId: clientId || null,
      ...(isImpersonating ? { impersonatedBy: originalUserId } : {}),
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
