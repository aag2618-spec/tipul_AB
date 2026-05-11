import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import {
  loadScopeUser,
  buildClientWhere,
  buildSessionWhere,
  canSecretaryAccessModel,
} from "@/lib/scope";
import { sanitizeUserHtml } from "@/lib/sanitize-html";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // C4: SECRETARY חסומה מתמלולים (תוכן קליני).
    const scopeUser = await loadScopeUser(userId);
    if (!canSecretaryAccessModel(scopeUser, "Transcription")) {
      return NextResponse.json(
        { message: "פעולה זו אינה זמינה למזכירה" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { content } = await request.json();

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { message: "תוכן התמלול חסר" },
        { status: 400 }
      );
    }

    // קלט המשתמש מסונן לפני שמירה — תוכן התמלול עלול לעלות ל-DOM
    // ב-UI שמציג תמלול עם html (כפי שעושים session-note + summary).
    const safeContent = sanitizeUserHtml(content);

    // C4: scope-based ownership. updateMany עם תנאי scope ב-where —
    // אטומי. אם התמלול לא בסקופ → count=0 → 404. ה-CLINIC_OWNER יכול לערוך
    // תמלולים של מטפלים בצוות שלו דרך scope; cross-clinic חסום.
    const updated = await prisma.transcription.updateMany({
      where: {
        AND: [
          { id },
          {
            recording: {
              OR: [
                { client: buildClientWhere(scopeUser) },
                { session: buildSessionWhere(scopeUser) },
              ],
            },
          },
        ],
      },
      data: { content: safeContent },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { message: "תמלול לא נמצא" },
        { status: 404 }
      );
    }

    const fresh = await prisma.transcription.findUnique({ where: { id } });
    return NextResponse.json(fresh);
  } catch (error) {
    logger.error("Update transcription error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון התמלול" },
      { status: 500 }
    );
  }
}
