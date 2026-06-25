import { z } from "zod";
import { SessionType } from "@prisma/client";

// H12: caps על free-text fields. ה-route משתמש ב-parseIsraelTime ו-conflict
// detection אחרי validation — Zod רק מבטיח טיפוסים וגדלים סבירים.

const MAX_LOCATION = 500;
const MAX_NOTES = 50_000;
const MAX_TOPIC = 500;

export const createSessionSchema = z.object({
  clientId: z.string().max(64).optional(),
  startTime: z.string().min(1, "שעת התחלה היא שדה חובה").max(64),
  endTime: z.string().min(1, "שעת סיום היא שדה חובה").max(64),
  type: z.nativeEnum(SessionType).optional(),
  price: z.union([z.number().min(0).max(100_000), z.string().max(20)]).optional(),
  location: z.string().max(MAX_LOCATION, "מיקום ארוך מדי").optional(),
  notes: z.string().max(MAX_NOTES, "הערות ארוכות מדי").optional(),
  topic: z.string().max(MAX_TOPIC, "נושא ארוך מדי").optional(),
  isRecurring: z.boolean().optional(),
  allowOverlap: z.boolean().optional(),
  // קליניקה רב-מטפלית: בעלים/מזכירה יכולים לציין מטפל יעד.
  // ברירת מחדל ב-route: עצמאי → self; מזכירה ללא בחירה → יורשת מהלקוח.
  // trim() כדי שמחרוזת רווחים תיכשל ב-min(1) ולא תיפול בשקט ל-fallback.
  // הוולידציה הסמנטית (אותה קליניקה, role-gate, ownership) ב-route.
  therapistId: z.string().trim().min(1).max(64).optional(),
  // שלב 2 (חדרים): חדר טיפול נבחר. הוולידציה הסמנטית (החדר שייך לקליניקה)
  // ב-route. ריק/undefined → אין חדר (location טקסט חופשי כמו קודם).
  roomId: z.string().trim().min(1).max(64).optional(),
}).refine(
  (data) => {
    if (data.type !== "BREAK" && !data.clientId) {
      return false;
    }
    return true;
  },
  { message: "נא לבחור מטופל", path: ["clientId"] }
);

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

// PATCH של [id]/route.ts — עדכונים נקודתיים קלים: skipSummary (אדמיניסטרטיבי)
// + topic (נושא הפגישה, תוכן קליני). topic נשמר כאן ולא ב-PUT הכבד כי PUT
// דורס price ב-default של הלקוח כשהוא נשלח בלי price. חסימת המזכירה מ-topic
// נאכפת ב-handler (parity עם PUT).
export const patchSessionSchema = z.object({
  skipSummary: z.boolean().optional(),
  topic: z.string().max(MAX_TOPIC, "נושא ארוך מדי").optional().nullable(),
});
export type PatchSessionInput = z.infer<typeof patchSessionSchema>;

// PUT של [id]/route.ts — עדכון פגישה. ולידציה רכה: שומרת על type-safety
// ומונעת body מעוות (NoSQL operator injection, NaN במחיר). ההיגיון העסקי
// (שעות, חפיפות, סטטוסים) נשאר במקום ב-handler.
// .passthrough() כדי שבדיקת ALLOWED_FOR_SECRETARY תוכל לקרוא את ה-body המקורי.
export const updateSessionSchema = z
  .object({
    startTime: z.string().max(64).optional(),
    endTime: z.string().max(64).optional(),
    type: z.nativeEnum(SessionType).optional(),
    price: z.number().min(0).max(100_000).optional(),
    location: z.string().max(MAX_LOCATION).optional().nullable(),
    notes: z.string().max(MAX_NOTES).optional().nullable(),
    topic: z.string().max(MAX_TOPIC).optional().nullable(),
    status: z
      .enum([
        "SCHEDULED",
        "COMPLETED",
        "CANCELLED",
        "PENDING_CANCELLATION",
        "PENDING_APPROVAL",
        "NO_SHOW",
      ])
      .optional(),
    createPayment: z.boolean().optional(),
    markAsPaid: z.boolean().optional(),
    cancellationReason: z.string().max(500).optional().nullable(),
    allowOverlap: z.boolean().optional(),
    // שלב 2 (חדרים): שינוי/הסרת חדר לפגישה קיימת. מחרוזת ריקה או null → הסרת
    // החדר. הוולידציה הסמנטית (החדר שייך לקליניקה) + גזירת location=שם החדר
    // ב-handler. ללא min(1) — בניגוד ל-createSessionSchema — כדי לאפשר "הסרת חדר".
    roomId: z.string().trim().max(64).optional().nullable(),
  })
  .passthrough();
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

// PATCH של [id]/status/route.ts — שינוי סטטוס + reason.
export const sessionStatusSchema = z.object({
  status: z.enum([
    "SCHEDULED",
    "PENDING_APPROVAL",
    "COMPLETED",
    "CANCELLED",
    "PENDING_CANCELLATION",
    "NO_SHOW",
  ], { errorMap: () => ({ message: "סטטוס לא תקין" }) }),
  cancellationReason: z
    .string()
    .max(500, "סיבת ביטול ארוכה מדי (מקסימום 500 תווים)")
    .optional()
    .or(z.literal("")),
});
export type SessionStatusInput = z.infer<typeof sessionStatusSchema>;

// POST/PUT של [id]/note/route.ts — sessionNote (תוכן קליני).
// content הוא HTML מ-TipTap. cap גדול (50K) כי סיכומים יכולים להיות ארוכים,
// אבל לא בלתי מוגבל.
export const sessionNoteSchema = z.object({
  content: z.string().max(50_000, "תוכן הסיכום ארוך מדי (מקסימום 50,000 תווים)"),
  isPrivate: z.boolean().optional(),
});
export type SessionNoteInput = z.infer<typeof sessionNoteSchema>;

// PUT (partial) — content אופציונלי בעדכון.
export const sessionNoteUpdateSchema = sessionNoteSchema.partial();
export type SessionNoteUpdateInput = z.infer<typeof sessionNoteUpdateSchema>;

// POST /api/sessions/send-reminders — שליחת תזכורת ידנית לפגישות נבחרות
// (פעולה מהירה בדשבורד המזכירה: מחר / בעוד יומיים, בחירה פרטנית).
// ה-route אוכף scope (buildSessionWhere), dedup מול CommunicationLog והרשאות.
const MAX_REMINDER_BATCH = 50;
export const sendRemindersSchema = z.object({
  sessionIds: z
    .array(z.string().max(64))
    .min(1, "יש לבחור לפחות פגישה אחת")
    .max(
      MAX_REMINDER_BATCH,
      `ניתן לשלוח עד ${MAX_REMINDER_BATCH} תזכורות בפעם אחת`
    ),
});
export type SendRemindersInput = z.infer<typeof sendRemindersSchema>;

// POST /api/sessions/overlaps/dismiss — הסתרת התראת חפיפה ("אל תתריע שוב").
// שני מזהי הפגישות בזוג החופף. ה-route מאמת scope (שתי הפגישות שלי, או שתיהן
// באותו ארגון) — הוולידציה כאן רק מבטיחה טיפוסים וגדלים סבירים.
export const dismissOverlapSchema = z.object({
  session1Id: z.string().min(1).max(64),
  session2Id: z.string().min(1).max(64),
});
export type DismissOverlapInput = z.infer<typeof dismissOverlapSchema>;
