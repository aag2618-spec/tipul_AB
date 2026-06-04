// ============================================================================
// chat-service — לוגיקת DB משותפת לצ׳אט הצוות
// ============================================================================
// כל הפונקציות כאן מסננות לפי organizationId — בידוד ארגוני מלא. ה-routes
// דקים ומאצילים לכאן את הלוגיקה (ensureTeamChannel, חברי צ׳אט, ספירת לא-נקראות).
//
// מודל ההרשאות (מי-עם-מי): כל אנשי הצוות (מנהלת / מזכירה / מטפל) הם חברי צ׳אט
// ויכולים להיכנס למסך. עם זאת, מי רשאי לפתוח שיחה עם מי נקבע ב-canPairChat:
//   • ניהול (מנהלת/מזכירה) ↔ כל אחד — תמיד מותר.
//   • מטפל ↔ מטפל — רק אם הארגון הפעיל allowTherapistChat (אישור המנהלת).
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

// חברי הצ׳אט: כל אנשי הצוות בארגון (OWNER + SECRETARY + THERAPIST), לא חסומים.
// מטפל עצמאי (organizationId=null) אינו חבר צ׳אט. מי-רשאי-להתכתב-עם-מי נקבע
// בנפרד ב-canPairChat — חברוּת בצ׳אט לבדה אינה מתירה שיחה מטפל↔מטפל.
export function chatMemberWhere(organizationId: string): Prisma.UserWhereInput {
  return {
    organizationId,
    isBlocked: false,
    OR: [
      {
        clinicRole: {
          in: ["OWNER", "SECRETARY", "THERAPIST"] as (
            | "OWNER"
            | "SECRETARY"
            | "THERAPIST"
          )[],
        },
      },
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

// חברי ההנהלה בלבד (מנהלת + מזכירות) — זהה ל-chatMemberWhere ההיסטורי. משמש
// לסנכרון ערוץ "כל הצוות" (שנשאר ערוץ הנהלה; מטפלים אינם משתתפים בו אוטומטית).
export function managementMemberWhere(
  organizationId: string
): Prisma.UserWhereInput {
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

// סיווג חבר צוות: "ניהול" (מנהלת/מזכירה) או "מטפל". הבסיס ל-canPairChat ולסינון
// אנשי הקשר. זהה בלוגיקה ל-isClinicOwner/isSecretary שבשרת (scope.ts).
export type MemberKind = "MANAGEMENT" | "THERAPIST";

export function memberKind(
  clinicRole: string | null,
  role: string | null
): MemberKind {
  const isOwner = clinicRole === "OWNER" || role === "CLINIC_OWNER";
  const isSecretary = clinicRole === "SECRETARY" || role === "CLINIC_SECRETARY";
  return isOwner || isSecretary ? "MANAGEMENT" : "THERAPIST";
}

/**
 * האם שני חברי צוות רשאים להתכתב ישירות?
 * ניהול מעורב (לפחות צד אחד מנהלת/מזכירה) — תמיד מותר.
 * מטפל↔מטפל — רק אם המנהלת הפעילה allowTherapistChat בארגון.
 */
export function canPairChat(
  a: MemberKind,
  b: MemberKind,
  allowTherapistChat: boolean
): boolean {
  if (a === "MANAGEMENT" || b === "MANAGEMENT") return true;
  return allowTherapistChat;
}

/**
 * האם שיחה היא "בין מטפלים בלבד" — כלומר לכל המשתתפים memberKind === "THERAPIST"
 * (אף צד אינו מנהלת/מזכירה). זה הבסיס גם להודעת השקיפות (הצ׳אט גלוי למנהלת) וגם
 * למסך המעקב של המנהלת. הגנה: length>0 כדי ש-every לא יחזיר true על מערך ריק.
 * הערוץ "כל הצוות" (GROUP עם משתתפי הנהלה) אינו "בין מטפלים בלבד".
 */
export function isTherapistOnly(
  participants: { clinicRole: string | null; role: string | null }[]
): boolean {
  return (
    participants.length > 0 &&
    participants.every(
      (p) => memberKind(p.clinicRole, p.role) === "THERAPIST"
    )
  );
}

/** הגדרות צ׳אט ברמת הארגון. allowTherapistChat=false כברירת מחדל (deny). */
export async function getOrgChatSettings(
  organizationId: string
): Promise<{ allowTherapistChat: boolean }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { allowTherapistChat: true },
  });
  return { allowTherapistChat: org?.allowTherapistChat ?? false };
}

/**
 * אכיפת מדיניות "צ׳אט בין מטפלים" על שיחות קיימות, בעת שינוי הדגל. מופעל בתוך
 * הטרנזקציה שמעדכנת את הדגל (אטומי).
 *
 * חל על שיחות "בין מטפלים בלבד" — גם פרטיות (DIRECT) וגם קבוצות (GROUP) — למעט
 * ערוץ "כל הצוות" (isTeamChannel), שהוא ערוץ הנהלה ואינו מושפע לעולם.
 *
 * - כיבוי (enabled=false): סוגר (leftAt=now) את כל השיחות שבהן כל המשתתפים מטפלים
 *   — כך שהן נעלמות מהרשימה ואי אפשר עוד לקרוא/לכתוב בהן (כל ה-routes מסננים
 *   leftAt:null). זו אכיפת הביטול: כיבוי הכפתור עוצר גם שיחות וקבוצות שכבר נפתחו,
 *   לא רק חדשות. שיחות שיש בהן צד ניהולי (מנהלת/מזכירה) לא נסגרות לעולם.
 * - הפעלה (enabled=true): משחזר (leftAt=null) את כל השיחות (שאינן ערוץ הצוות) שנסגרו.
 *   leftAt נכתב אך ורק על-ידי הפונקציה הזו (אין פיצ׳ר "עזיבה" ידני), ולכן כל leftAt
 *   על שיחה שאינה ערוץ הצוות הוא תוצר המדיניות — בטוח לשחזר באופן עיוור. שחזור עיוור
 *   (ולא לפי הסיווג הנוכחי) חיוני: אם צד שינה תפקיד או הוסר מהקליניקה בין הכיבוי
 *   להדלקה, סיווג-מחדש היה משאיר את השיחה סגורה לנצח.
 *
 * ⚠️ אם יתווסף בעתיד פיצ׳ר "עזיבת קבוצה" ידני (שכותב leftAt) — יש לעדכן את השחזור
 *   העיוור, אחרת חבר שעזב ייאלץ לחזור בהדלקה הבאה.
 */
export async function applyTherapistChatPolicy(
  tx: Prisma.TransactionClient,
  organizationId: string,
  enabled: boolean
): Promise<void> {
  if (enabled) {
    // שחזור עיוור: כל משתתף שסומן leftAt בשיחה שאינה ערוץ הצוות — נפתח מחדש.
    await tx.chatParticipant.updateMany({
      where: {
        leftAt: { not: null },
        conversation: { organizationId, isTeamChannel: false },
      },
      data: { leftAt: null },
    });
    return;
  }

  // כיבוי: איתור שיחות "בין מטפלים בלבד" (DIRECT או קבוצה, למעט ערוץ הצוות) וסגירתן.
  const convos = await tx.chatConversation.findMany({
    where: { organizationId, isTeamChannel: false },
    select: {
      id: true,
      // בכוונה ללא סינון leftAt — הסיווג חייב לשקף את ההרכב האמיתי של השיחה.
      participants: {
        select: { user: { select: { clinicRole: true, role: true } } },
      },
    },
  });

  const therapistOnlyIds = convos
    .filter((c) =>
      isTherapistOnly(
        c.participants.map((p) => ({
          clinicRole: p.user.clinicRole,
          role: p.user.role,
        }))
      )
    )
    .map((c) => c.id);

  if (therapistOnlyIds.length === 0) return;

  await tx.chatParticipant.updateMany({
    where: { conversationId: { in: therapistOnlyIds }, leftAt: null },
    data: { leftAt: new Date() },
  });
}

// תווית תפקיד עברית לתצוגה. בעלת קליניקה מזוהה גם דרך clinicRole וגם דרך role
// (תואם ל-chatMemberWhere ולשער ההרשאות) — אחרת מנהלת עלולה להופיע כ"מזכירה".
export function chatRoleLabel(
  clinicRole: string | null,
  role: string | null
): string {
  if (clinicRole === "OWNER" || role === "CLINIC_OWNER") return "מנהלת";
  if (clinicRole === "SECRETARY" || role === "CLINIC_SECRETARY") return "מזכירה";
  return "מטפל/ת";
}

/** מזהה דטרמיניסטי לערוץ "כל הצוות" — מבטיח ערוץ יחיד לארגון (race-safe). */
export function teamChannelId(organizationId: string): string {
  return `team_${organizationId}`;
}

/**
 * מבטיח שערוץ "כל הצוות" קיים ושכל חברי ההנהלה הנוכחיים משתתפים בו.
 * idempotent — אפשר לקרוא בכל טעינה. מחזיר את מזהה הערוץ.
 *
 * שים/י לב: הערוץ הקבוע הוא ערוץ הנהלה (מנהלת + מזכירות בלבד) — מטפלים אינם
 * מסונכרנים אליו. תקשורת חוצת-צוות נעשית דרך שיחות פרטיות/קבוצות והודעת-לכולם.
 *
 * אופטימיזציה: מסלול מהיר (2 קריאות בלבד, ללא כתיבה) כשהערוץ כבר קיים והמשתמש
 * כבר משתתף — זה המצב הנפוץ ב-polling. סנכרון מלא (כתיבה) רץ רק כשהערוץ נוצר
 * זה עתה או כשהמשתמש עדיין לא משתתף (חבר הנהלה חדש שנכנס לראשונה).
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

  // מסלול איטי: סנכרון משתתפים — חברי ההנהלה הנוכחיים בלבד (מוסיף חסרים בלבד).
  const members = await prisma.user.findMany({
    where: managementMemberWhere(organizationId),
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
