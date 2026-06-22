import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { buildSessionWhere, loadScopeUser } from "@/lib/scope";
import { waitlistScope } from "@/lib/waitlist-scope";
import {
  rankWaitlistMatches,
  israelDayAndMinutes,
  type WaitlistCandidate,
} from "@/lib/waitlist-match";

export const dynamic = "force-dynamic";

const MAX_MATCHES = 10;

// GET /api/waitlist/match?sessionId=...
//
// בהינתן פגישה שהתפנתה (בוטלה) — מחזיר את רשומות ההמתנה התואמות, מדורגות,
// כדי שהמזכירה תוכל למלא את החור. מידע אדמיניסטרטיבי בלבד (שם + טלפון של
// המטופל הממתין) — אין תוכן קליני. בידוד: רק בתוך ה-scope של המשתמש.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json(
        { message: "חסר מזהה פגישה" },
        { status: 400 },
      );
    }

    const scopeUser = await loadScopeUser(userId);

    // הפגישה חייבת להיות ב-scope (בידוד tenant).
    const session = await prisma.therapySession.findFirst({
      where: { AND: [{ id: sessionId }, buildSessionWhere(scopeUser)] },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        therapistId: true,
        clientId: true,
        type: true,
      },
    });
    if (!session) {
      return NextResponse.json({ message: "הפגישה לא נמצאה" }, { status: 404 });
    }
    // פגישת הפסקה (BREAK) — אין מה למלא.
    if (session.type === "BREAK") {
      return NextResponse.json({ matches: [] });
    }

    const durationMinutes = Math.max(
      1,
      Math.round(
        (session.endTime.getTime() - session.startTime.getTime()) / 60000,
      ),
    );
    const { dayOfWeek, startMinutes } = israelDayAndMinutes(session.startTime);

    // רשומות פעילות ב-scope, למעט המטופל של הפגישה שהתבטלה (אין טעם להציע לו
    // את המשבצת שהוא עצמו פינה).
    const entries = await prisma.waitlistEntry.findMany({
      where: {
        AND: [
          { status: "ACTIVE" },
          waitlistScope(scopeUser, userId),
          session.clientId ? { NOT: { clientId: session.clientId } } : {},
        ],
      },
      include: {
        client: { select: { id: true, name: true, phone: true, email: true } },
      },
    });

    const candidates: (WaitlistCandidate & {
      clientName: string | null;
      clientPhone: string | null;
      clientEmail: string | null;
    })[] = entries.map((e) => ({
      id: e.id,
      clientId: e.clientId,
      preferredTherapistId: e.preferredTherapistId,
      durationMinutes: e.durationMinutes,
      preferredDays: Array.isArray(e.preferredDays)
        ? (e.preferredDays as number[])
        : null,
      preferredTimeFrom: e.preferredTimeFrom,
      preferredTimeTo: e.preferredTimeTo,
      priority: e.priority,
      createdAt: e.createdAt,
      clientName: e.client?.name ?? null,
      clientPhone: e.client?.phone ?? null,
      clientEmail: e.client?.email ?? null,
    }));

    const ranked = rankWaitlistMatches(candidates, {
      therapistId: session.therapistId,
      dayOfWeek,
      startMinutes,
      durationMinutes,
    }).slice(0, MAX_MATCHES);

    return NextResponse.json({
      matches: ranked.map((m) => ({
        id: m.id,
        clientId: m.clientId,
        clientName: m.clientName,
        clientPhone: m.clientPhone,
        clientEmail: m.clientEmail,
        preferredTherapistId: m.preferredTherapistId,
        durationMinutes: m.durationMinutes,
        priority: m.priority,
      })),
      slot: {
        therapistId: session.therapistId,
        startTime: session.startTime.toISOString(),
        endTime: session.endTime.toISOString(),
        durationMinutes,
      },
    });
  } catch (error) {
    logger.error("waitlist match error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בחיפוש התאמות" },
      { status: 500 },
    );
  }
}
