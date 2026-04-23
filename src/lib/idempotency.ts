/**
 * Idempotency wrapper — Stage 1.11 של שדרוג ניהול
 *
 * מטרה: אותה בקשת POST (או webhook) שמגיעה פעמיים עם אותו idempotency-key
 * תחזיר את אותה תוצאה — לא תיצור עסקה/חיוב כפול.
 *
 * תשתית: מודל `IdempotencyKey` (prisma/schema.prisma:1864) נוצר ב-Stage 1.7.
 *
 * שימוש טיפוסי:
 *   const result = await withIdempotency(
 *     { key: `${session.user.id}:${clientKey}`, method: "POST", path: "/api/x" },
 *     async () => {
 *       // הלוגיקה שחייבת להיות idempotent
 *       return { ok: true, orderId: "..." };
 *     }
 *   );
 *   // result.replay = true → הריצה הנוכחית קיבלה תשובה שמורה
 *   // result.replay = false → הפעלה ראשונה, נשמר ל-24 שעות
 *
 * Alert: אם בקשה חוזרת תואמת ל-failure (statusCode >= 500) שנשמר,
 * נכתב AdminAlert מסוג IDEMPOTENCY_REPLAY_OF_FAILURE.
 * זאת התנהגות מודעת — לא אוטומטית-מוצלחת.
 */

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

// TTL של 24 שעות — מספיק ל-retries רגילים של Cardcom/אחרים.
// cron ניקוי קיים (schedulerToken... כל יום) — לא חוסם.
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyContext {
  /** מפתח ייחודי בסקופ של המשתמש/ספק. צורה מומלצת: `${userId}:${clientKey}` או `cardcom:${transactionId}`. */
  key: string;
  method: string;
  path: string;
  /** TTL בסקונדות; ברירת מחדל 24 שעות. */
  ttlMs?: number;
}

export interface IdempotencySuccess<T> {
  replay: false;
  data: T;
}

export interface IdempotencyReplay<T> {
  replay: true;
  storedStatusCode: number;
  /** התגובה המקורית שהוחזרה ב-call הראשון. */
  data: T;
}

export type IdempotencyResult<T> = IdempotencySuccess<T> | IdempotencyReplay<T>;

/**
 * מריץ `fn` פעם אחת בלבד לכל `key`. ריצה נוספת עם אותו key תחזיר replay.
 *
 * סדר הפעולות (מונע race condition של "שני POSTים מקבילים"):
 *   1. RESERVE — מנסה ליצור רשומה עם statusCode=0 ("in-flight") כטוקן.
 *      אם נתפס P2002, הקוד ממתין עד שהרשומה הקודמת תהפוך לסופית ומחזיר replay.
 *   2. EXECUTE — רק המפעיל המנצח (זה שהצליח ליצור) מריץ את fn.
 *   3. PERSIST — עדכון הרשומה ל-statusCode=200 עם התוצאה.
 *
 * אם fn זורק — הרשומה נשארת עם statusCode=0 עד שתפוג. התמודדות: replay יתבצע
 * כ-"לא יודע" ויגרום שגיאה לקורא הבא, במקום להכפיל side-effect.
 *
 * שימוש: webhooks של Cardcom, POST ליצירת תשלום ידני, וכל route עם side-effect
 * יקר (אימייל, סליקה).
 */
export async function withIdempotency<T>(
  ctx: IdempotencyContext,
  fn: () => Promise<T>
): Promise<IdempotencyResult<T>> {
  const ttl = ctx.ttlMs ?? DEFAULT_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);

  // ─ שלב 1: נסה להזמין את המפתח. statusCode=0 = "in-flight" (סנטינל). ─
  let reserved = false;
  try {
    await prisma.idempotencyKey.create({
      data: {
        key: ctx.key,
        method: ctx.method,
        path: ctx.path,
        statusCode: 0,
        response: {} as Prisma.InputJsonValue,
        expiresAt,
      },
    });
    reserved = true;
  } catch (err) {
    const code = (err as { code?: unknown })?.code;
    if (code !== "P2002") {
      throw err;
    }
    // P2002 = מישהו אחר כבר הזמין את המפתח. בדוק את הרשומה הקיימת.
  }

  // ─ שלב 2: אם לא הצלחנו להזמין, ייתכן שיש רשומה קיימת. ─
  if (!reserved) {
    const existing = await waitForIdempotencyResolution(ctx.key);

    // רשומה שפגה — מחק וקרא לעצמנו פעם נוספת (רקורסיה עם היקף קבוע).
    if (existing && existing.expiresAt < new Date()) {
      await prisma.idempotencyKey.delete({ where: { key: ctx.key } }).catch(() => undefined);
      return withIdempotency(ctx, fn);
    }

    if (existing) {
      if (existing.statusCode >= 500) {
        await createReplayOfFailureAlert({
          key: ctx.key,
          method: existing.method,
          path: existing.path,
          storedStatusCode: existing.statusCode,
        }).catch((alertErr) => {
          logger.error("Failed to create IDEMPOTENCY_REPLAY_OF_FAILURE alert", {
            error: alertErr instanceof Error ? alertErr.message : String(alertErr),
          });
        });
      }
      return {
        replay: true,
        storedStatusCode: existing.statusCode,
        data: existing.response as T,
      };
    }

    // לא מצאנו רשומה בכלל אחרי ההמתנה (edge case — רשומה נמחקה בדיוק בתזמון).
    // מחזירים שגיאה ברורה כדי שהקורא יוכל לנסות שוב עם מפתח חדש.
    throw new Error("withIdempotency: key reservation failed and no stored result found");
  }

  // ─ שלב 3: אנחנו המנצחים — מריצים את fn. ─
  let result: T;
  try {
    result = await fn();
  } catch (err) {
    // fn נכשלה — מחק את ההזמנה כדי שקורא אחר יוכל לנסות שוב.
    // אם המחיקה נכשלה, הרשומה תפוג ב-TTL.
    await prisma.idempotencyKey
      .delete({ where: { key: ctx.key } })
      .catch(() => undefined);
    throw err;
  }

  // ─ שלב 4: עדכן את הרשומה לסטטוס סופי. ─
  try {
    await prisma.idempotencyKey.update({
      where: { key: ctx.key },
      data: {
        statusCode: 200,
        response: result as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // המקרה היחיד שיגיע הנה הוא שהרשומה נמחקה (למשל cron ניקוי רץ במרוצת ההרצה).
    // לא נכשיל את המשתמש — רק נרשום.
    logger.error("Failed to finalize idempotency key", {
      key: ctx.key,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { replay: false, data: result };
}

/**
 * ממתין עד שרשומת idempotency תהפוך לסופית (statusCode != 0) או עד timeout.
 *
 * בזמן המתנה, ייתכן שהפעולה תיכשל (רשומה נמחקה) — במקרה כזה נחזיר null.
 */
async function waitForIdempotencyResolution(
  key: string,
  timeoutMs = 15_000,
  pollIntervalMs = 250
): Promise<{
  key: string;
  method: string;
  path: string;
  statusCode: number;
  response: unknown;
  expiresAt: Date;
} | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (!row) return null;
    if (row.statusCode !== 0) return row;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  // timeout — מחזירים מה שיש. אם עדיין in-flight, הקורא יקבל replay של "0"
  // שמשמעותו "in-progress" (הקורא מטפל ב-409).
  return prisma.idempotencyKey.findUnique({ where: { key } });
}

/**
 * שמירת failure ידני עבור מקרה שבו רוצים שה-replay הבא יקבל אותו סטטוס שגיאה
 * (למשל 402 מקארדקום — ללא אישור). בדרך כלל רק webhooks/cron משתמשים בזה.
 */
export async function persistIdempotencyFailure(
  ctx: IdempotencyContext,
  statusCode: number,
  response: unknown
): Promise<void> {
  const ttl = ctx.ttlMs ?? DEFAULT_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);

  try {
    await prisma.idempotencyKey.upsert({
      where: { key: ctx.key },
      create: {
        key: ctx.key,
        method: ctx.method,
        path: ctx.path,
        statusCode,
        response: response as Prisma.InputJsonValue,
        expiresAt,
      },
      update: {
        statusCode,
        response: response as Prisma.InputJsonValue,
        expiresAt,
      },
    });
  } catch (err) {
    logger.error("Failed to persist idempotency failure", {
      key: ctx.key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * מנקה רשומות שפגו. cron יומי יקרא לזה.
 * החזרה: מספר רשומות שנמחקו.
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<number> {
  const result = await prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

async function createReplayOfFailureAlert(params: {
  key: string;
  method: string;
  path: string;
  storedStatusCode: number;
}): Promise<void> {
  await prisma.adminAlert.create({
    data: {
      type: "IDEMPOTENCY_REPLAY_OF_FAILURE",
      priority: "HIGH",
      title: "בקשה חוזרת על כשל שמור (idempotency)",
      message: `בקשה חוזרת עם idempotency-key שכבר רשום ככשל (${params.storedStatusCode}).\nKey: ${params.key}\nMethod: ${params.method}\nPath: ${params.path}`,
      metadata: {
        key: params.key,
        method: params.method,
        path: params.path,
        storedStatusCode: params.storedStatusCode,
      } as Prisma.InputJsonValue,
      actionRequired: "בדוק את הלקוח/ספק ששלח בקשה חוזרת — האם צריך לבטל את המפתח או לתקן את ההפעלה המקורית?",
    },
  });
}
