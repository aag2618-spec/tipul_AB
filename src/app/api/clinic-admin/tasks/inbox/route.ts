import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { canManageStaffTasks, loadScopeUser } from "@/lib/scope";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import { extractTaskRef, stripTaskRef } from "@/lib/notification-utils";

export const dynamic = "force-dynamic";

// סוגי ההתראות שמרכיבים את "תיבת מטלות הצוות" של המקצה (מנהלת/מזכירה) — מקור
// אמת יחיד גם ל-badge בטאב הניווט וגם למלבן "מה דורש את תשומת ליבך" בדשבורד.
const INBOX_TYPES = ["STAFF_TASK_COMMENT", "STAFF_TASK_DONE"] as const;

// GET /api/clinic-admin/tasks/inbox — חיוויי מטלות-צוות לא-נקראו של המקצה.
// PHI: מחזיר אך ורק התראות של המשתמש המחובר (userId=auth); הנמען הוא תמיד צד
// מורשה ב-thread (כך נוצרה ההתראה). content מוחזר נקי מתבנית [task:id].
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    if (!scopeUser.organizationId || !canManageStaffTasks(scopeUser)) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    // בשבת/חג — ריק (עקבי עם /api/notifications). החיוויים יופיעו במוצ"ש.
    if (isShabbatOrYomTov()) {
      return NextResponse.json({ items: [], unreadCount: 0, isShabbat: true });
    }

    const where = {
      userId,
      type: { in: [...INBOX_TYPES] },
      status: { in: ["PENDING", "SENT"] as ("PENDING" | "SENT")[] },
    };

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.notification.count({ where }),
    ]);

    const items = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      content: stripTaskRef(n.content),
      taskRef: extractTaskRef(n.content),
      createdAt: n.createdAt.toISOString(),
    }));

    return NextResponse.json({ items, unreadCount });
  } catch (error) {
    logger.error("[clinic-admin/tasks/inbox] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    // לא חוסם UI — מחזיר ריק בשגיאה.
    return NextResponse.json({ items: [], unreadCount: 0 });
  }
}

// POST /api/clinic-admin/tasks/inbox — סימון נקרא. body {notificationId} = אחת;
// גוף ריק = כל חיוויי מטלות-הצוות של המשתמש (לכניסה לדף). updateMany עם userId
// ב-WHERE = הגנת IDOR (כמו PUT /api/notifications). אין צורך ב-scope gate נוסף:
// ה-userId חוסם לחלוטין לעדכן התראות של אחר.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    let notificationId: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.notificationId === "string") {
        notificationId = body.notificationId;
      }
    } catch {
      // גוף ריק / לא-JSON → סימון הכל.
    }

    await prisma.notification.updateMany({
      where: {
        userId,
        type: { in: [...INBOX_TYPES] },
        status: { in: ["PENDING", "SENT"] },
        ...(notificationId ? { id: notificationId } : {}),
      },
      data: { status: "READ", readAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[clinic-admin/tasks/inbox] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "אירעה שגיאה בעדכון" }, { status: 500 });
  }
}
