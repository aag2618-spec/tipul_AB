import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { createTaskCommentSchema } from "@/lib/validations/task";
import { loadScopeUser, canAccessTaskThread } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import {
  checkRateLimit,
  rateLimitResponse,
  TASK_COMMENT_RATE_LIMIT,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// select מינימלי ל-gate ההרשאות — בלי סינון userId, כדי שגם המקצה/הבעלים יגיעו
// (לא רק העובד המחזיק). canAccessTaskThread הוא ה-gate היחיד מעל ה-task הזה.
const TASK_GATE_SELECT = {
  id: true,
  userId: true,
  assignedById: true,
  organizationId: true,
  type: true,
  title: true,
} as const;

// ההערות מוחזרות בלי PHI נוסף — רק תוכן ההערה ושם המחבר.
type CommentWithAuthor = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string;
  author: { id: string; name: string | null } | null;
};
function serializeComment(c: CommentWithAuthor, currentUserId: string) {
  return {
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    authorId: c.authorId,
    authorName: c.author?.name ?? null,
    // isMine מחושב בשרת — חוסך מהלקוח לשלוף session להשוואת מחבר.
    isMine: c.authorId === currentUserId,
  };
}

// GET /api/tasks/[id]/comments — שרשור ההערות של המטלה (דו-שיח עובד↔מקצה).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      select: TASK_GATE_SELECT,
    });
    if (!task) {
      return NextResponse.json({ message: "המטלה לא נמצאה" }, { status: 404 });
    }

    const scopeUser = await loadScopeUserWithMode(userId);
    if (!canAccessTaskThread(scopeUser, task)) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const comments = await prisma.taskComment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, name: true } } },
    });

    return NextResponse.json(comments.map((c) => serializeComment(c, userId)));
  } catch (error) {
    // ⛔ לא ללוגג את תוכן ההערות (PHI אפשרי) — רק הודעת השגיאה.
    logger.error("Get task comments error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההערות" },
      { status: 500 }
    );
  }
}

// POST /api/tasks/[id]/comments — הוספת הערה לשרשור + התראה לצד השני.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // Rate limit לפני עבודה — מונע הצפת התראות / spam בדו-שיח.
    const rl = checkRateLimit(
      `task-comment:post:${userId}`,
      TASK_COMMENT_RATE_LIMIT
    );
    if (!rl.allowed) return rateLimitResponse(rl);

    const { id } = await params;

    const parsed = await parseBody(request, createTaskCommentSchema);
    if ("error" in parsed) return parsed.error;
    const { body } = parsed.data;

    const task = await prisma.task.findUnique({
      where: { id },
      select: TASK_GATE_SELECT,
    });
    if (!task) {
      return NextResponse.json({ message: "המטלה לא נמצאה" }, { status: 404 });
    }

    const scopeUser = await loadScopeUserWithMode(userId);
    if (!canAccessTaskThread(scopeUser, task)) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    // הערות הן פיצ'ר של מטלות צוות בלבד (דו-שיח עובד↔מקצה). למשימה אישית אין יעד.
    if (task.type !== "STAFF_TASK") {
      return NextResponse.json(
        { message: "ניתן להגיב רק על מטלות צוות" },
        { status: 400 }
      );
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId: id,
        authorId: userId,
        organizationId: task.organizationId,
        body,
      },
      include: { author: { select: { id: true, name: true } } },
    });

    // התראה לצד השני (שקיפות דו-כיוונית): אם הכותב הוא העובד המחזיק → היעד הוא
    // המקצה; אחרת (המקצה/בעלים הגיב) → היעד הוא העובד. best-effort — אם ההתראה
    // נכשלת, ההערה עצמה כבר נשמרה ומופיעה בשרשור.
    // ⚠️ PHI: title+content של ההתראה עלולים להכיל מידע מטופל, ו-Notification
    // אינו עובר שכבת scope/מיסוך. הבטיחות נשענת על כך שהנמען כאן הוא תמיד צד
    // מורשה ב-thread (העובד או המקצה). שינוי לוגיקת הנמען = סיכון דליפת PHI.
    // isFromAssignee = הכותב הוא העובד המחזיק (userId === task.userId) → היעד
    // הוא המקצה (מנהלת/מזכירה). אחרת המקצה/בעלים הגיב → היעד הוא העובד.
    const isFromAssignee = userId === task.userId;
    const recipientId = isFromAssignee ? task.assignedById : task.userId;
    if (recipientId && recipientId !== userId) {
      try {
        await prisma.notification.create({
          data: {
            userId: recipientId,
            // הערת עובד→מקצה: סוג ייעודי שמנותב ל-/clinic-admin/tasks ומקודד
            // [task:id] לניווט ממוקד. תגובת מקצה→עובד: PENDING_TASKS כקודם
            // (מנותב ל-/dashboard של העובד), content נקי.
            type: isFromAssignee ? "STAFF_TASK_COMMENT" : "PENDING_TASKS",
            title: `הערה חדשה על מטלה: ${task.title}`,
            // לכיוון המקצה: "שם העובד: <הערה> [task:id]" — כך המלבן בדשבורד מציג
            // מי הגיב + תצוגה מקדימה + ניווט ממוקד. שם צוות אינו PHI של מטופל.
            content: isFromAssignee
              ? `${comment.author?.name ? comment.author.name + ": " : ""}${body.slice(0, 160)} [task:${id}]`
              : body.slice(0, 200),
            status: "PENDING",
            sentAt: new Date(),
          },
        });
      } catch (notifyError) {
        logger.error("Task comment notification failed:", {
          error:
            notifyError instanceof Error
              ? notifyError.message
              : String(notifyError),
        });
      }
    }

    return NextResponse.json(serializeComment(comment, userId), { status: 201 });
  } catch (error) {
    // ⛔ לא ללוגג את גוף ההערה (PHI אפשרי).
    logger.error("Create task comment error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בשמירת ההערה" },
      { status: 500 }
    );
  }
}
