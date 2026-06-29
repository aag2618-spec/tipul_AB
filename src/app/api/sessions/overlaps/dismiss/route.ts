import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { dismissOverlapSchema } from "@/lib/validations/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/sessions/overlaps/dismiss
 *
 * מסמן זוג פגישות חופפות כ"אל תתריע שוב" (כפתור ה-X בדיאלוג "פגישות חופפות").
 * ההסתרה פרטית למשתמש/ת המחובר/ת בלבד (DismissedOverlap.userId) — בעלים, מטפל/ת
 * ומזכירה כל אחד/ת לעצמו/ה, בלי ערבוב בין תצוגה אישית לתצוגת קליניקה.
 *
 * אימות scope: מותר להסתיר זוג רק אם הוא יכול להופיע בחפיפות של המשתמש/ת —
 * שתי הפגישות שלו/ה (self-overlap) או שתיהן באותו ארגון (clinic-overlap). זה
 * תואם בדיוק את מי שרואה את ההתראה מלכתחילה ב-GET /api/sessions/overlaps.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "גוף הבקשה אינו תקין" }, { status: 400 });
    }

    const parsed = dismissOverlapSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "נתונים לא תקינים" }, { status: 400 });
    }
    const { session1Id, session2Id } = parsed.data;
    if (session1Id === session2Id) {
      return NextResponse.json({ message: "נתונים לא תקינים" }, { status: 400 });
    }

    const scopeUser = await loadScopeUserWithMode(userId);

    // שולפים רק שדות אדמיניסטרטיביים (id/therapistId/organizationId) — אין PHI.
    const sessions = await prisma.therapySession.findMany({
      where: { id: { in: [session1Id, session2Id] } },
      select: { id: true, therapistId: true, organizationId: true },
    });
    if (sessions.length !== 2) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    const bothMine = sessions.every((s) => s.therapistId === userId);
    const bothMyOrg =
      !!scopeUser.organizationId &&
      sessions.every((s) => s.organizationId === scopeUser.organizationId);
    if (!bothMine && !bothMyOrg) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    // מפתח הזוג — זהה למפתח שמחושב ב-GET /api/sessions/overlaps.
    const pairKey = [session1Id, session2Id].sort().join("|");

    // אידמפוטנטי — לחיצה כפולה לא תיצור כפילות (unique [userId, pairKey]).
    await prisma.dismissedOverlap.upsert({
      where: { userId_pairKey: { userId, pairKey } },
      create: { userId, pairKey },
      update: {},
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Dismiss overlap error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "אירעה שגיאה" }, { status: 500 });
  }
}
