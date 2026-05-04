import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import {
  loadScopeUser,
  buildClientWhere,
  isSecretary,
  secretaryCan,
  type ScopeUser,
} from "@/lib/scope";

export const dynamic = "force-dynamic";

// משותף לכל ה-handlers — אותו דפוס scope/בעלות כמו ב-`consent-forms/route.ts`.
// טפסים עם clientId מסוננים דרך ה-Client (יורש את ה-scope של המטופל), טפסים
// בלי clientId (templates / general) מסוננים לפי בעלות (organizationId או
// therapistId למטפל עצמאי).
async function findScopedForm(formId: string, scopeUser: ScopeUser) {
  const clientWhere = buildClientWhere(scopeUser);
  const ownershipFilter = scopeUser.organizationId
    ? { organizationId: scopeUser.organizationId }
    : { therapistId: scopeUser.id };

  return prisma.consentForm.findFirst({
    where: {
      AND: [
        { id: formId },
        {
          OR: [
            { client: clientWhere },
            { AND: [{ clientId: null }, ownershipFilter] },
          ],
        },
      ],
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

    const scopeUser = await loadScopeUser(userId);
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;
    const body = await request.json();
    const { signatureData } = body;

    const scopeUser = await loadScopeUser(userId);
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

    const scopeUser = await loadScopeUser(userId);
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
