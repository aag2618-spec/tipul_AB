/**
 * Idempotency wrapper — Stage 1.11 של שדרוג ניהול; hardened ב-Stage 1.17 pre-work
 *
 * מטרה: אותה בקשת POST (או webhook) שמגיעה פעמיים עם אותו idempotency-key
 * תחזיר את אותה תוצאה — לא תיצור עסקה/חיוב כפול.
 *
 * תשתית: מודל `IdempotencyKey` (prisma/schema.prisma:1864) נוצר ב-Stage 1.7.
 *
 * ⚠️  T JSON-serializable REQUIREMENT:
 *   התוצאה של `fn` נשמרת ב-`Prisma.InputJsonValue`. זה אומר: רק primitives,
 *   arrays, ו-plain objects. אסור Date (משמש ISO string), BigInt, Map, Set,
 *   class instances, או פונקציות. סריאליזציה כושלת → Prisma error ב-update.
 *   (Cursor L-R2-3 — סיבוב 2.)
 *
 * שימוש טיפוסי (UI-facing POST, "conflict" = לא להמתין):
 *   const result = await withIdempotency(
 *     { key: `${session.user.id}:${clientKey}`, method: "POST", path: "/api/x",
 *       inFlight: "conflict" },  // 409 מיידי אם בקשה זהה בתהליך
 *     async () => ({ ok: true, orderId: "..." })
 *   );
 *   if (result.replay === "in_flight") return new Response(..., { status: 409 });
 *   if (result.replay === true) return Response.json(result.data);
 *   return Response.json(result.data);
 *
 * שימוש webhook (Cardcom — "wait" = להמתין עד 15s):
 *   const result = await withIdempotency(
 *     { key: `cardcom:${txId}`, method: "POST", path: "/api/webhooks/cardcom",
 *       inFlight: "wait" },  // ברירת מחדל — פולר עד 15s
 *     async () => processCardcomTransaction(payload)
 *   );
 *
 * Alert: אם בקשה חוזרת תואמת ל-failure (statusCode >= 500) שנשמר,
 * נכתב AdminAlert מסוג IDEMPOTENCY_REPLAY_OF_FAILURE.
 *
 * ⚠️ לפני wire-up לראוט webhook/POST:
 *   חובה להוסיף rate-limit לפני withIdempotency כדי למנוע DoS amplification
 *   (אחרת 100 בקשות מקבילות עם אותו key יחזיקו 100 × 15s של polling).
 *   ראה `src/lib/rate-limit.ts` — נעבור לזה ב-Stage 1.17.
 */

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

// TTL של 24 שעות — מספיק ל-retries רגילים של Cardcom/אחרים.
// cron ניקוי קיים (schedulerToken... כל יום) — לא חוסם.
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// עומק רקורסיה מקסימלי ל-withIdempotency — מגן מפני infinite loop תיאורטי
// אם winner מת ומחדש את ההזמנה שוב ושוב. בפרקטיקה 1-2 מספיקים.
const MAX_RECURSION_DEPTH = 3;

export interface IdempotencyContext {
  /**
   * מפתח ייחודי בסקופ של המשתמש/ספק.
   *
   * 🚨 חובת namespacing — אחרת cross-tenant leak:
   *   ✅ `${session.user.id}:${clientKey}` — user scoping
   *   ✅ `cardcom:${transactionId}` — provider scoping
   *   ✅ `webhook:meshulam:${eventId}` — provider+type scoping
   *   ❌ `${body.orderId}` — אסור! משתמש B ישלח אותו orderId ויקבל את התגובה של A.
   *
   * כלל: המפתח חייב לכלול prefix של המשתמש או הספק המוסמך, לא רק
   * identifier חיצוני שגורם נוסף שולט בו.
   */
  key: string;
  method: string;
  path: string;
  /** TTL בסקונדות; ברירת מחדל 24 שעות. */
  ttlMs?: number;
  /**
   * התנהגות כאשר אותו key נמצא כרגע בתהליך (statusCode=0, in-flight):
   *  - "wait" (default): פולר עד 15s למלא את התוצאה. מתאים ל-webhooks.
   *  - "conflict": מחזיר מיידית {replay: "in_flight"} כדי שה-caller יחזיר 409.
   *    מתאים ל-POSTים של UI שלא רוצים לחסום את המשתמש.
   */
  inFlight?: "wait" | "conflict";
  /** כמה זמן לפולר ב-"wait" mode. ברירת מחדל 15 שניות. */
  waitTimeoutMs?: number;
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

/**
 * בקשה עם idempotency-key שכרגע בתהליך אצל caller אחר.
 * Caller אמור להמיר זאת ל-HTTP 409 Conflict.
 */
export interface IdempotencyInFlight {
  replay: "in_flight";
}

export type IdempotencyResult<T> =
  | IdempotencySuccess<T>
  | IdempotencyReplay<T>
  | IdempotencyInFlight;

/**
 * מריץ `fn` פעם אחת בלבד לכל `key`. ריצה נוספת עם אותו key תחזיר replay.
 *
 * סדר הפעולות (מונע race condition של "שני POSTים מקבילים"):
 *   1. RESERVE — מנסה ליצור רשומה עם statusCode=0 ("in-flight") כטוקן.
 *      אם נתפס P2002, הקוד ממתין עד שהרשומה הקודמת תהפוך לסופית ומחזיר replay.
 *   2. EXECUTE — רק המפעיל המנצח (זה שהצליח ליצור) מריץ את fn.
 *   3. PERSIST — עדכון הרשומה ל-statusCode=200 עם התוצאה.
 *
 * אם fn זורק — הרשומה נמחקת כדי שקורא אחר יוכל לנסות שוב. פולרים פעילים
 * שממתינים על הרשומה יבצעו retry רקורסיבי (עם MAX_RECURSION_DEPTH=3).
 *
 * שימוש: webhooks של Cardcom, POST ליצירת תשלום ידני, וכל route עם side-effect
 * יקר (אימייל, סליקה).
 */
export async function withIdempotency<T>(
  ctx: IdempotencyContext,
  fn: () => Promise<T>
): Promise<IdempotencyResult<T>> {
  return withIdempotencyImpl(ctx, fn, 0);
}

/**
 * Impl פנימי עם depth counter. לא חשוף לקוראים (LOW #2 סבב 3).
 * Callers תמיד יקראו ל-withIdempotency בלי depth.
 */
async function withIdempotencyImpl<T>(
  ctx: IdempotencyContext,
  fn: () => Promise<T>,
  depth: number
): Promise<IdempotencyResult<T>> {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error(
      `withIdempotency: exceeded max recursion depth (${MAX_RECURSION_DEPTH}) for key ${ctx.key}`
    );
  }

  const ttl = ctx.ttlMs ?? DEFAULT_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  const inFlightMode = ctx.inFlight ?? "wait";

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
    // השגת הרשומה: בהתאם ל-mode. "conflict" = findUnique חד-פעמי, "wait" = פולר.
    const existing =
      inFlightMode === "conflict"
        ? await prisma.idempotencyKey.findUnique({ where: { key: ctx.key } })
        : await waitForIdempotencyResolution(ctx.key, ctx.waitTimeoutMs ?? 15_000);

    // Cursor M-R2-2 (סיבוב 2): winner מחק את ההזמנה (למשל fn זרקה).
    // ננסה שוב — ה-depth counter מגן מפני לולאה אינסופית.
    if (!existing) {
      return withIdempotencyImpl(ctx, fn, depth + 1);
    }

    // רשומה שפגה — מחק וננסה להיות ה-winner החדש.
    // (מטפל בשתי מצבים: in-flight שתקוע כבר 24h+ או completed שעבר TTL.)
    // Cursor M-R2 סיבוב 3: בדיקה אחידה ב-"conflict" וב-"wait".
    if (existing.expiresAt < new Date()) {
      await prisma.idempotencyKey.delete({ where: { key: ctx.key } }).catch(() => undefined);
      return withIdempotencyImpl(ctx, fn, depth + 1);
    }

    // עדיין in-flight אחרי timeout (wait) או לפני שהמפתח הושלם (conflict):
    // מדווח ל-caller שיש בקשה פעילה — caller אמור להחזיר 409.
    if (existing.statusCode === 0) {
      return { replay: "in_flight" };
    }

    // תוצאה סופית — replay.
    return handleExistingRow<T>(ctx, existing);
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
 * עוטף רשומה קיימת (statusCode != 0) לתוצאת replay. מעלה alert על 5xx.
 */
async function handleExistingRow<T>(
  ctx: IdempotencyContext,
  existing: {
    key: string;
    method: string;
    path: string;
    statusCode: number;
    response: unknown;
  }
): Promise<IdempotencyReplay<T>> {
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
  // timeout — מחזירים מה שיש (ייתכן עדיין statusCode=0). הקורא ב-withIdempotency
  // ממיר את זה ל-{replay: "in_flight"} כדי ש-caller יכול להחזיר 409.
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
