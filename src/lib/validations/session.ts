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

// PATCH של [id]/route.ts — רק שדה skipSummary.
export const patchSessionSchema = z.object({
  skipSummary: z.boolean().optional(),
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
// aiAnalysis ב-Prisma הוא Json field — מקבל גם string (LLM raw output) וגם
// object מובנה (NoteAnalysis interface ב-/api/analyze/note). cap נאכף ע"י
// גודל ה-JSON המסוריאליז כדי למנוע DoS דרך אובייקטים ענקיים.
const aiAnalysisField = z
  .union([
    z.string().max(20_000, "ניתוח AI ארוך מדי"),
    z.record(z.unknown()),
    z.array(z.unknown()),
  ])
  .refine(
    (v) => {
      if (typeof v === "string") return true; // כבר נאכף ב-max למעלה
      try {
        return JSON.stringify(v).length <= 50_000;
      } catch {
        return false;
      }
    },
    { message: "ניתוח AI גדול מדי" }
  )
  .optional()
  .or(z.literal(""));

export const sessionNoteSchema = z.object({
  content: z.string().max(50_000, "תוכן הסיכום ארוך מדי (מקסימום 50,000 תווים)"),
  isPrivate: z.boolean().optional(),
  aiAnalysis: aiAnalysisField,
});
export type SessionNoteInput = z.infer<typeof sessionNoteSchema>;

// PUT (partial) — content אופציונלי בעדכון.
export const sessionNoteUpdateSchema = sessionNoteSchema.partial();
export type SessionNoteUpdateInput = z.infer<typeof sessionNoteUpdateSchema>;
