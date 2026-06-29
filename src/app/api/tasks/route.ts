import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { parseIsraelTime } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import {
  loadScopeUser,
  buildClientWhere,
  buildSessionWhere,
  buildPaymentWhere,
  buildDocumentWhere,
} from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const withReminders = searchParams.get("withReminders");
    const history = searchParams.get("history");

    const where: Record<string, unknown> = { userId };

    if (history === "true") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      where.type = "CUSTOM";
      where.status = { in: ["COMPLETED", "DISMISSED"] };
      where.updatedAt = { gte: thirtyDaysAgo };

      const tasks = await prisma.task.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
      });
      return NextResponse.json(tasks);
    }

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    if (withReminders === "true") {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      where.reminderAt = {
        gte: now,
        lte: tomorrow,
      };
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "desc" },
        { createdAt: "desc" },
      ],
      // assignedBy — שם המקצה, להצגת תג "מהמנהלת" בווידג'ט (מטלות STAFF_TASK).
      include: { assignedBy: { select: { id: true, name: true } } },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    logger.error("Get tasks error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המשימות" },
      { status: 500 }
    );
  }
}

// M-validation: enum whitelists תואמים לסכמת Prisma (prisma/schema.prisma:813,831).
const ALLOWED_TASK_TYPES = [
  "WRITE_SUMMARY",
  "COLLECT_PAYMENT",
  "SIGN_DOCUMENT",
  "SCHEDULE_SESSION",
  "REVIEW_TRANSCRIPTION",
  "FOLLOW_UP",
  "CUSTOM",
] as const;
const ALLOWED_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
// relatedEntity values שהקוד הקיים כבר משתמש בהם (לפי תיעוד internal).
const ALLOWED_RELATED_ENTITIES = ["CLIENT", "SESSION", "PAYMENT", "DOCUMENT"] as const;
const MAX_TASK_TITLE = 200;
const MAX_TASK_DESCRIPTION = 5000;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    let body: Record<string, unknown>;
    try {
      const raw = await request.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
      }
      body = raw as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "גוף בקשה לא תקין (JSON)" }, { status: 400 });
    }

    const { type, title, description, priority, dueDate, reminderAt, relatedEntityId, relatedEntity } = body;

    // M-validation: title חובה ובאורך תקין.
    if (typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { message: "כותרת המשימה היא שדה חובה" },
        { status: 400 }
      );
    }
    if (title.length > MAX_TASK_TITLE) {
      return NextResponse.json(
        { message: `כותרת ארוכה מדי (מקסימום ${MAX_TASK_TITLE} תווים)` },
        { status: 400 }
      );
    }
    if (description !== undefined && description !== null) {
      if (typeof description !== "string") {
        return NextResponse.json({ message: "תיאור חייב להיות טקסט" }, { status: 400 });
      }
      if (description.length > MAX_TASK_DESCRIPTION) {
        return NextResponse.json(
          { message: `תיאור ארוך מדי (מקסימום ${MAX_TASK_DESCRIPTION} תווים)` },
          { status: 400 }
        );
      }
    }
    const safeType = type || "CUSTOM";
    if (typeof safeType !== "string" || !ALLOWED_TASK_TYPES.includes(safeType as (typeof ALLOWED_TASK_TYPES)[number])) {
      return NextResponse.json({ message: "סוג משימה לא תקין" }, { status: 400 });
    }
    const safePriority = priority || "MEDIUM";
    if (typeof safePriority !== "string" || !ALLOWED_PRIORITIES.includes(safePriority as (typeof ALLOWED_PRIORITIES)[number])) {
      return NextResponse.json({ message: "עדיפות לא תקינה" }, { status: 400 });
    }

    // M-IDOR: relatedEntityId חייב להיות שייך ל-scope של המשתמש. בלי הבדיקה,
    // משתמש יכול ליצור משימה שמצביעה על משאב של מטפל אחר.
    //
    // משתמשים ב-buildClientWhere/buildSessionWhere/buildPaymentWhere/buildDocumentWhere
    // כדי לתמוך גם ב-CLINIC_OWNER/CLINIC_SECRETARY שגישתם דרך organizationId,
    // לא ישירות דרך therapistId.
    if (relatedEntity !== undefined && relatedEntity !== null) {
      if (typeof relatedEntity !== "string" || !ALLOWED_RELATED_ENTITIES.includes(relatedEntity as (typeof ALLOWED_RELATED_ENTITIES)[number])) {
        return NextResponse.json({ message: "סוג ישות מקושרת לא תקין" }, { status: 400 });
      }
      if (typeof relatedEntityId !== "string" || relatedEntityId.length === 0) {
        return NextResponse.json({ message: "מזהה ישות מקושרת חסר" }, { status: 400 });
      }
      const scopeUser = await loadScopeUserWithMode(userId);
      let exists = false;
      if (relatedEntity === "CLIENT") {
        const where = buildClientWhere(scopeUser);
        const r = await prisma.client.findFirst({ where: { AND: [{ id: relatedEntityId }, where] }, select: { id: true } });
        exists = !!r;
      } else if (relatedEntity === "SESSION") {
        const where = buildSessionWhere(scopeUser);
        const r = await prisma.therapySession.findFirst({ where: { AND: [{ id: relatedEntityId }, where] }, select: { id: true } });
        exists = !!r;
      } else if (relatedEntity === "PAYMENT") {
        const where = buildPaymentWhere(scopeUser);
        // buildPaymentWhere יכול להחזיר { id: "__deny__" } למזכירות בלי הרשאה.
        if ("id" in where && where.id === "__deny__") {
          return NextResponse.json({ message: "אין הרשאה לקשר משימה לתשלום" }, { status: 403 });
        }
        const r = await prisma.payment.findFirst({ where: { AND: [{ id: relatedEntityId }, where] }, select: { id: true } });
        exists = !!r;
      } else if (relatedEntity === "DOCUMENT") {
        const where = buildDocumentWhere(scopeUser);
        const r = await prisma.document.findFirst({ where: { AND: [{ id: relatedEntityId }, where] }, select: { id: true } });
        exists = !!r;
      }
      if (!exists) {
        return NextResponse.json({ message: "ישות מקושרת לא נמצאה" }, { status: 404 });
      }
    }

    const trimmedTitle = title.trim();
    const task = await prisma.task.create({
      data: {
        userId,
        type: safeType as (typeof ALLOWED_TASK_TYPES)[number],
        title: trimmedTitle,
        description: typeof description === "string" ? description : null,
        priority: safePriority as (typeof ALLOWED_PRIORITIES)[number],
        dueDate: typeof dueDate === "string" ? parseIsraelTime(dueDate) : null,
        reminderAt: typeof reminderAt === "string" ? parseIsraelTime(reminderAt) : null,
        relatedEntityId: typeof relatedEntityId === "string" ? relatedEntityId : null,
        relatedEntity: typeof relatedEntity === "string" ? relatedEntity : null,
        status: "PENDING",
      },
    });

    // Create a bell notification so it shows up immediately.
    // משתמשים ב-trimmedTitle (כבר עבר validation) כדי לא לבזבז את title הגולמי.
    await prisma.notification.create({
      data: {
        userId,
        type: "PENDING_TASKS",
        title: `מטלה חדשה: ${trimmedTitle}`,
        content: typeof reminderAt === "string"
          ? `תזכורת מתוזמנת ל-${new Date(parseIsraelTime(reminderAt)).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}`
          : (typeof description === "string" && description) || trimmedTitle,
        status: "PENDING",
        sentAt: new Date(),
      },
    }).catch((err) => logger.error("Failed to create task notification:", { error: err instanceof Error ? err.message : String(err) }));

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    logger.error("Create task error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת המשימה" },
      { status: 500 }
    );
  }
}
