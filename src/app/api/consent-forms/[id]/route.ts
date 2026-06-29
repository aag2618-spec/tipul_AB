import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import {
  loadScopeUser,
  buildConsentFormWhere,
  isSecretary,
  secretaryCan,
  type ScopeUser,
} from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { parseBody } from "@/lib/validations/helpers";
import { signConsentFormSchema } from "@/lib/validations/consent-form";

export const dynamic = "force-dynamic";

// B5: השליפה משותפת ל-GET/PATCH/DELETE — לא כופלים את ה-where logic.
// buildConsentFormWhere מבטיח ש-THERAPIST בקליניקה לא יראה טמפלייטים
// של קולגות (clientId=null + therapistId אחר).
async function findScopedForm(formId: string, scopeUser: ScopeUser) {
  return prisma.consentForm.findFirst({
    where: { AND: [{ id: formId }, buildConsentFormWhere(scopeUser)] },
    include: {
      client: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const scopeUser = await loadScopeUserWithMode(userId);
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewConsentForms")) {
      return NextResponse.json(
        { message: "אין הרשאה לצפייה בטפסי הסכמה" },
        { status: 403 }
      );
    }

    const form = await findScopedForm(id, scopeUser);
    if (!form) {
      return NextResponse.json({ message: "לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(form);
  } catch (error) {
    logger.error("Get consent form error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת הטופס" },
      { status: 500 }
    );
  }
}

// M16: signatureData validation דרך zod — מונע XSS דרך SVG (נחסם בכוונה),
// DoS דרך data URI ענק, ו-type confusion. ראה signConsentFormSchema.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    // M16: ולידציה לפני כל גישה ל-DB.
    const parsed = await parseBody(request, signConsentFormSchema);
    if ("error" in parsed) return parsed.error;
    const { signatureData } = parsed.data;

    const scopeUser = await loadScopeUserWithMode(userId);
    // POST/יצירה דורש canViewConsentForms — חתימה/עדכון אדמיניסטרטיבי גם.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewConsentForms")) {
      return NextResponse.json(
        { message: "אין הרשאה לעדכון טפסי הסכמה" },
        { status: 403 }
      );
    }

    const form = await findScopedForm(id, scopeUser);
    if (!form) {
      return NextResponse.json({ message: "לא נמצא" }, { status: 404 });
    }

    if (form.signedAt) {
      return NextResponse.json(
        { message: "הטופס כבר נחתם" },
        { status: 400 }
      );
    }

    const updated = await prisma.consentForm.update({
      where: { id },
      data: {
        signatureData,
        signedAt: new Date(),
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

    return NextResponse.json(updated);
  } catch (error) {
    logger.error("Sign consent form error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בחתימת הטופס" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const scopeUser = await loadScopeUserWithMode(userId);
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewConsentForms")) {
      return NextResponse.json(
        { message: "אין הרשאה למחיקת טפסי הסכמה" },
        { status: 403 }
      );
    }

    const form = await findScopedForm(id, scopeUser);
    if (!form) {
      return NextResponse.json({ message: "לא נמצא" }, { status: 404 });
    }

    if (form.signedAt) {
      return NextResponse.json(
        { message: "לא ניתן למחוק טופס שנחתם" },
        { status: 400 }
      );
    }

    await prisma.consentForm.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Delete consent form error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה במחיקת הטופס" },
      { status: 500 }
    );
  }
}
