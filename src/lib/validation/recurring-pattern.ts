// M-validation: ולידציה משותפת ל-POST/PUT של recurring-patterns.
// מאמת dayOfWeek/time/duration/clientId + בודק ש-clientId שייך ל-scope.
//
// נמצא ב-/lib/validation במקום ב-route.ts כי route.ts ב-Next.js מותרים רק
// HTTP method exports (GET/POST/PUT וכו'). exports נוספים שובר את ה-routing.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { buildClientWhere, type ScopeUser } from "@/lib/scope";

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export async function validateRecurringPatternInput(params: {
  body: Record<string, unknown>;
  scopeUser: ScopeUser;
  requireClient?: boolean;
}): Promise<NextResponse | null> {
  const { body, scopeUser, requireClient = false } = params;
  const { dayOfWeek, time, duration, clientId } = body;

  if (
    typeof dayOfWeek !== "number" ||
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 0 ||
    dayOfWeek > 6
  ) {
    return NextResponse.json(
      { message: "dayOfWeek חייב להיות מספר 0-6 (0=ראשון)" },
      { status: 400 }
    );
  }
  if (typeof time !== "string" || !TIME_RE.test(time)) {
    return NextResponse.json(
      { message: "time חייב להיות בפורמט HH:MM (00:00-23:59)" },
      { status: 400 }
    );
  }
  if (duration !== undefined && duration !== null) {
    if (
      typeof duration !== "number" ||
      !Number.isInteger(duration) ||
      duration < 5 ||
      duration > 720
    ) {
      return NextResponse.json(
        { message: "duration חייב להיות בין 5 ל-720 דקות" },
        { status: 400 }
      );
    }
  }
  if (clientId !== undefined && clientId !== null) {
    if (typeof clientId !== "string" || clientId.length === 0) {
      return NextResponse.json(
        { message: "clientId לא תקין" },
        { status: 400 }
      );
    }
    // M-IDOR: ה-Client חייב להיות ב-scope של המשתמש. בלי הבדיקה הזו,
    // מטפל יכול לקשר pattern למטופל של מטפל אחר ולגלות שהמטופל קיים.
    const clientWhere = buildClientWhere(scopeUser);
    const exists = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, clientWhere] },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }
  } else if (requireClient) {
    return NextResponse.json({ message: "clientId חובה" }, { status: 400 });
  }
  return null;
}
