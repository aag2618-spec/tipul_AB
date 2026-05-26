// H17: יצירת signed URL להאזנה להקלטה.
//
// flow:
//   1. UI מבקש POST /api/recordings/[id]/signed-url
//   2. server בודק:
//      • requireAuth — משתמש מחובר
//      • scope check — למשתמש יש גישה להקלטה (אותו check כמו ב-GET)
//      • canSecretaryAccessModel — מזכירה חסומה מהקלטות (תוכן קליני)
//   3. מחזיר URL חתום + expiresAt
//   4. UI משתמש ב-URL חתום ב-<audio src=...>
//
// היתרון על cookie-only: גם אם cookie דולף, ה-URL פג תוקף תוך 15 דקות.
// הוא לא מטמין את הסיכון של דליפת cookie — אבל מצמצם משמעותית את החלון.

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
import { signRecordingUrl } from "@/lib/recording-signed-url";
import { logDataAccess } from "@/lib/audit-logger";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, originalUserId, isImpersonating } = auth;

    const scopeUser = await loadScopeUser(userId);
    if (!canSecretaryAccessModel(scopeUser, "Recording")) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const clientWhere = buildClientWhere(scopeUser);
    const sessionWhere = buildSessionWhere(scopeUser);

    const { id } = await params;

    // ownership check — חייב לעבור את אותו פילטר כמו GET /api/recordings/[id]
    const recording = await prisma.recording.findFirst({
      where: {
        id,
        OR: [{ client: clientWhere }, { session: sessionWhere }],
      },
      select: { id: true, clientId: true },
    });

    if (!recording) {
      return NextResponse.json({ message: "הקלטה לא נמצאה" }, { status: 404 });
    }

    const signed = signRecordingUrl(id, userId);

    // Audit — הוצאת signed URL מתועדת כ-READ (פוטנציאל להאזנה).
    // ההגשה עצמה (GET /audio) לא יוצרת audit log נוסף כדי לא ליצור רעש —
    // signed URL הוצא = "ניתנה הרשאת האזנה למשך 15 דקות".
    logDataAccess({
      userId,
      recordType: "RECORDING",
      recordId: id,
      action: "READ",
      clientId: recording.clientId,
      request,
      meta: { signedUrl: true, expiresAt: signed.expiresAt },
      ...(isImpersonating ? { impersonatedBy: originalUserId } : {}),
    });

    return NextResponse.json(signed);
  } catch (error) {
    logger.error("[recordings/signed-url] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה ביצירת קישור" },
      { status: 500 }
    );
  }
}
