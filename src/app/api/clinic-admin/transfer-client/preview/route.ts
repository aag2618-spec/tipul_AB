import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET — מחזיר את כל הפגישות העתידיות הפעילות של המטופל מול המטפל הנוכחי,
// עם סימון אם יש התנגשות שעות עם המטפל היעד.
//
// query: ?clientId=X&toTherapistId=Y
//
// משמש ע"י דיאלוג "העברת פגישות עתידיות" — ה-OWNER רואה לכל פגישה
// אם היא תיכנס נקייה למטפל היעד או דורשת אישור התנגשות.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const toTherapistId = searchParams.get("toTherapistId");

    if (!clientId || !toTherapistId) {
      return NextResponse.json(
        { message: "חסרים פרמטרים: clientId, toTherapistId" },
        { status: 400 }
      );
    }

    // אותן ולידציות כמו ב-transfer-client/route.ts
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, clinicRole: true, organizationId: true },
    });
    if (!me) {
      return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 });
    }

    const isOwner = me.role === "CLINIC_OWNER" || me.clinicRole === "OWNER";
    if (!isOwner && me.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }
    if (!me.organizationId) {
      return NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 400 }
      );
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, organizationId: true, therapistId: true },
    });
    if (!client || client.organizationId !== me.organizationId) {
      return NextResponse.json(
        { message: "המטופל לא נמצא בקליניקה" },
        { status: 404 }
      );
    }

    // ולידציה: toTherapist בקליניקה (מונע IDOR — בלי זה אפשר היה לקבל
    // התנגשויות של מטפל מקליניקה אחרת).
    const toTherapist = await prisma.user.findUnique({
      where: { id: toTherapistId },
      select: { id: true, organizationId: true },
    });
    if (!toTherapist || toTherapist.organizationId !== me.organizationId) {
      return NextResponse.json(
        { message: "מטפל יעד לא נמצא בקליניקה" },
        { status: 404 }
      );
    }

    // שליפת פגישות עתידיות פעילות
    const now = new Date();
    const futureSessions = await prisma.therapySession.findMany({
      where: {
        clientId,
        startTime: { gt: now },
        status: { in: ["SCHEDULED", "PENDING_APPROVAL", "PENDING_CANCELLATION"] },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        type: true,
      },
      orderBy: { startTime: "asc" },
    });

    if (futureSessions.length === 0) {
      return NextResponse.json({ items: [], count: 0 });
    }

    // ביצועים: שולפים את כל הפגישות הפעילות של toTherapist בטווח הרלוונטי
    // בquery יחיד (במקום findFirst per session — N+1). אז התאמה ב-memory.
    // טווח: [min(startTime), max(endTime)] של פגישות המקור.
    let minStart: Date = futureSessions[0].startTime;
    let maxEnd: Date = futureSessions[0].endTime;
    for (const s of futureSessions) {
      if (s.startTime < minStart) minStart = s.startTime;
      if (s.endTime > maxEnd) maxEnd = s.endTime;
    }
    const candidates = await prisma.therapySession.findMany({
      where: {
        therapistId: toTherapistId,
        status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
        // טווח רחב: כל פגישה שמתחילה לפני maxEnd ומסתיימת אחרי minStart
        // עשויה להתנגש עם אחת מפגישות המקור.
        startTime: { lt: maxEnd },
        endTime: { gt: minStart },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        client: { select: { name: true } },
      },
    });

    // תאמה ב-memory: שני טווחים [a.start, a.end) ו-[b.start, b.end) חופפים
    // אם a.start < b.end && a.end > b.start (לוגיקה זהה ל-Prisma OR-block).
    function overlaps(
      a: { startTime: Date; endTime: Date },
      b: { startTime: Date; endTime: Date }
    ): boolean {
      return a.startTime < b.endTime && a.endTime > b.startTime;
    }

    const items = futureSessions.map((s) => {
      const conflict = candidates.find((c) => overlaps(c, s)) ?? null;
      return {
        id: s.id,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
        status: s.status,
        type: s.type,
        conflict: conflict
          ? {
              sessionId: conflict.id,
              clientName: conflict.client?.name ?? null,
              startTime: conflict.startTime.toISOString(),
              endTime: conflict.endTime.toISOString(),
              status: conflict.status,
            }
          : null,
      };
    });

    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    logger.error("[transfer-client/preview] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת תצוגת הפגישות" },
      { status: 500 }
    );
  }
}
