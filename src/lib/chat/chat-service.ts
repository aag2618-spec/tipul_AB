// ============================================================================
// chat-service — לוגיקת DB משותפת לצ׳אט הצוות
// ============================================================================
// כל הפונקציות כאן מסננות לפי organizationId — בידוד ארגוני מלא. ה-routes
// דקים ומאצילים לכאן את הלוגיקה (ensureTeamChannel, חברי צ׳אט, ספירת לא-נקראות).
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

// חברי הצ׳אט: בעלת קליניקה (OWNER) + מזכירות (SECRETARY) באותו ארגון, לא חסומים.
// מטפלים (THERAPIST) ומטפלים עצמאיים אינם חברי צ׳אט בשלב זה.
export function chatMemberWhere(organizationId: string): Prisma.UserWhereInput {
  return {
    organizationId,
    isBlocked: false,
    OR: [
      { clinicRole: { in: ["OWNER", "SECRETARY"] as ("OWNER" | "SECRETARY")[] } },
      {
        role: {
          in: ["CLINIC_OWNER", "CLINIC_SECRETARY"] as (
            | "CLINIC_OWNER"
            | "CLINIC_SECRETARY"
          )[],
        },
      },
    ],
  };
}

export type ChatMember = {
  id: string;
  name: string | null;
  clinicRole: "OWNER" | "THERAPIST" | "SECRETARY" | null;
  role: "USER" | "MANAGER" | "ADMIN" | "CLINIC_OWNER" | "CLINIC_SECRETARY";
};

/** כל חברי הצ׳אט בארגון (ממוין לפי שם). מינימיזציית נתונים — בלי email. */
export async function getChatMembers(organizationId: string): Promise<ChatMember[]> {
  const users = await prisma.user.findMany({
    where: chatMemberWhere(organizationId),
    select: { id: true, name: true, clinicRole: true, role: true },
    orderBy: { name: "asc" },
  });
  return users;
}

// תווית תפקיד עברית לתצוגה. בעלת קליניקה מזוהה גם דרך clinicRole וגם דרך role
// (תואם ל-chatMemberWhere ולשער ההרשאות) — אחרת מנהלת עלולה להופיע כ"מזכירה".
export function chatRoleLabel(
  clinicRole: string | null,
  role: string | null
): string {
  const isOwner = clinicRole === "OWNER" || role === "CLINIC_OWNER";
  return isOwner ? "מנהלת" : "מזכירה";
}

/** מזהה דטרמיניסטי לערוץ "כל הצוות" — מבטיח ערוץ יחיד לארגון (race-safe). */
export function teamChannelId(organizationId: string): string {
  return `team_${organizationId}`;
}

/**
 * מבטיח שערוץ "כל הצוות" קיים ושכל חברי הצוות הנוכחיים משתתפים בו.
 * idempotent — אפשר לקרוא בכל טעינה. מחזיר את מזהה הערוץ.
 *
 * אופטימיזציה: מסלול מהיר (2 קריאות בלבד, ללא כתיבה) כשהערוץ כבר קיים והמשתמש
 * כבר משתתף — זה המצב הנפוץ ב-polling. סנכרון מלא (כתיבה) רץ רק כשהערוץ נוצר
 * זה עתה או כשהמשתמש עדיין לא משתתף (חבר חדש שנכנס לראשונה).
 */
export async function ensureTeamChannel(
  organizationId: string,
  userId: string
): Promise<string> {
  const id = teamChannelId(organizationId);

  const existing = await prisma.chatConversation.findUnique({
    where: { id },
    select: { id: true },
  });

  if (existing) {
    // מסלול מהיר: הערוץ קיים — האם אני כבר משתתף? אם כן, אין מה לעשות.
    const myParticipation = await prisma.chatParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
      select: { id: true },
    });
    if (myParticipation) return id;
  } else {
    // יצירה. ב-race (שני משתמשים יוצרים בו-זמנית) — P2002 על ה-id, נבלע.
    try {
      await prisma.chatConversation.create({
        data: {
          id,
          organizationId,
          type: "GROUP",
          title: "כל הצוות",
          isTeamChannel: true,
          createdById: userId,
        },
      });
    } catch {
      // נוצר במקביל — ממשיכים לסנכרון המשתתפים.
    }
  }

  // מסלול איטי: סנכרון משתתפים — כל חברי הצוות הנוכחיים (מוסיף חסרים בלבד).
  const members = await prisma.user.findMany({
    where: chatMemberWhere(organizationId),
    select: { id: true },
  });
  if (members.length > 0) {
    await prisma.chatParticipant.createMany({
      data: members.map((m) => ({ conversationId: id, userId: m.id })),
      skipDuplicates: true,
    });
  }

  return id;
}

/**
 * ספירת הודעות שלא נקראו עבור משתתף בשיחה:
 * הודעות שאחרי lastReadAt, שלא נשלחו על ידו, ולא נמחקו.
 */
export async function countUnreadForParticipant(
  conversationId: string,
  userId: string,
  lastReadAt: Date | null
): Promise<number> {
  return prisma.chatMessage.count({
    where: {
      conversationId,
      deletedAt: null,
      senderId: { not: userId },
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });
}
