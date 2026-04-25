/**
 * Credits consumption — Stage 1.14 של שדרוג ניהול
 *
 * פונקציות `consumeSms` ו-`consumeAiAnalysis` שמקטינות קרדיטים
 * בצורה אטומית וברת-race. שילוב של:
 *   - מכסה חודשית (CommunicationSetting לSMS, MonthlyUsage ל-AI)
 *   - בנק של רכישות (UserPackagePurchase) — FIFO לפי createdAt
 *
 * חוקים:
 *   1. אם `tx` סופק — רצים בתוך הטרנזקציה הקיימת ללא retry
 *      (הקורא אחראי על retry ברמה שלו, למשל withAudit).
 *   2. אם לא סופק — עוטפים ב-$transaction(Serializable) עם retry
 *      על 40001/40P01 (ראה DELAYS_MS למטה).
 *   3. SELECT FOR UPDATE בתחילת הטרנזקציה — מונע race בין שני
 *      SMSים שנשלחים במקביל שיעברו את אותה בדיקת מכסה.
 *   4. FIFO: מכסה חודשית -> הרכישה הישנה ביותר הפנויה -> next.
 *   5. כשל — זורקים `QuotaExhaustedError` או `CreditConsumptionError`
 *      + יוצרים AdminAlert מסוג CREDIT_CONSUMPTION_FAILED.
 */

import type { Prisma, PackageType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getCurrentUsageKey } from "@/lib/date-utils";

// ─── Errors ───────────────────────────────────────────────────────────────

export class QuotaExhaustedError extends Error {
  readonly code = "QUOTA_EXHAUSTED" as const;
  constructor(message: string, readonly meta?: Record<string, unknown>) {
    super(message);
    this.name = "QuotaExhaustedError";
  }
}

export class CreditConsumptionError extends Error {
  readonly code = "CREDIT_CONSUMPTION_FAILED" as const;
  constructor(message: string, readonly meta?: Record<string, unknown>) {
    super(message);
    this.name = "CreditConsumptionError";
  }
}

// ─── Retry helpers (משותף עם withAudit) ───────────────────────────────────

const RETRY_CODES = ["40001", "40P01"] as const;
const DELAYS_MS = [50, 150, 400];
const MAX_RETRIES = 3;

function jitter(ms: number): number {
  return ms + Math.random() * ms * 0.5;
}

function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && (RETRY_CODES as readonly string[]).includes(code);
}

// ─── Generic FIFO consumption logic ───────────────────────────────────────

/**
 * תוצאת consumeSms / consumeAiAnalysis.
 *
 * Stage 1.17.2: `packagesTouched` מכיל את הסכום שנמשך מכל חבילה — חיוני
 * ל-`refundSms` / `refundAiAnalysis` כדי להחזיר במדויק לחבילה הנכונה.
 * `month`/`year` נשמרים מ-consume time כדי שה-refund יחזיר ל-MonthlyUsage
 * הנכון גם אם נחצה גבול חודש בין consume ל-refund (סוכן 2 — סבב 1.17.2).
 *
 * חוזה: סכום של `fromMonthly + fromPackages` שווה ל-`consumed`.
 */
export interface ConsumeResult {
  consumed: number;
  fromMonthly: number;
  fromPackages: number;
  /** רשומות UserPackagePurchase שנגעו: id + amount. */
  packagesTouched: Array<{ id: string; amount: number }>;
  /**
   * חודש/שנה (ישראל) של ה-consume — רלוונטי רק ל-AI (MonthlyUsage).
   * ב-SMS תמיד נכתב — לא נצרך כי SMS משתמש ב-CommunicationSetting global.
   */
  month: number;
  year: number;
}

/**
 * מוציא `count` קרדיטים לסוג נתון. מעדיף "חודשי" (יד שמאל) לפני "בנק".
 * פנימית — לא לייצא. הקורא חייב להיות בתוך טרנזקציה.
 */
async function consumeInTx(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    count: number;
    packageType: PackageType;
    /** פונקציה שטופלת במכסה חודשית — אם אין (כמו sessionPrep), מחזירה {used:0, available:0}. */
    monthlyTap: () => Promise<{ used: number; available: number }>;
  }
): Promise<Omit<ConsumeResult, "month" | "year">> {
  if (params.count <= 0) {
    throw new CreditConsumptionError("count חייב להיות מספר חיובי", {
      count: params.count,
    });
  }

  // שלב 1: נסה ליטול מה-bucket החודשי.
  const monthly = await params.monthlyTap();
  const fromMonthly = Math.min(params.count, monthly.available);
  const stillNeeded = params.count - fromMonthly;

  if (stillNeeded === 0) {
    return {
      consumed: params.count,
      fromMonthly,
      fromPackages: 0,
      packagesTouched: [],
    };
  }

  // שלב 2: למלא מה-"בנק" (UserPackagePurchase) FIFO.
  // $queryRaw עם SELECT ... FOR UPDATE מבטיח נעילת שורה מפורשת.
  // findMany לא תומך ב-lock → שני consumers מקבילים היו יכולים לקרוא
  // את אותה יתרה ולעבור לעדכון, ולגרום ל-creditsUsed > credits.
  // תיקון מסוכן אחרי BLOCKER של סוכן 4 בסיבוב 1.
  const purchases = await tx.$queryRaw<
    Array<{
      id: string;
      credits: number;
      creditsUsed: number;
      createdAt: Date;
    }>
  >`
    SELECT "id", "credits", "creditsUsed", "createdAt"
    FROM "UserPackagePurchase"
    WHERE "userId" = ${params.userId}
      AND "type" = ${params.packageType}::"PackageType"
      AND "reverted" = false
      AND "credits" > "creditsUsed"
    ORDER BY "createdAt" ASC
    FOR UPDATE
  `;

  let remaining = stillNeeded;
  const touched: Array<{ id: string; amount: number }> = [];
  let drawnFromPackages = 0;

  for (const p of purchases) {
    if (remaining === 0) break;
    const available = p.credits - p.creditsUsed;
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    await tx.userPackagePurchase.update({
      where: { id: p.id },
      data: { creditsUsed: p.creditsUsed + take },
    });
    touched.push({ id: p.id, amount: take });
    drawnFromPackages += take;
    remaining -= take;
  }

  if (remaining > 0) {
    throw new QuotaExhaustedError("אין מספיק קרדיטים", {
      needed: params.count,
      fromMonthly,
      fromPackages: drawnFromPackages,
      shortfall: remaining,
      packageType: params.packageType,
    });
  }

  return {
    consumed: params.count,
    fromMonthly,
    fromPackages: drawnFromPackages,
    packagesTouched: touched,
  };
}

// ─── Wrapper עם retry + alert ─────────────────────────────────────────────

async function runWithRetryAndAlert<T>(
  userId: string,
  alertMeta: Record<string, unknown>,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { skipAlert?: boolean } = {}
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => run(tx),
        { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 }
      );
    } catch (err) {
      if (err instanceof QuotaExhaustedError) {
        if (!options.skipAlert) {
          await emitAlert("CREDIT_CONSUMPTION_FAILED", userId, {
            ...alertMeta,
            reason: "QUOTA_EXHAUSTED",
            meta: err.meta,
          });
        }
        throw err;
      }
      if (isRetryableError(err) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, jitter(DELAYS_MS[attempt])));
        continue;
      }
      // retry exhausted or non-retryable non-quota error
      if (!options.skipAlert) {
        if (isRetryableError(err)) {
          await emitAlert("SERIALIZATION_RETRY_EXHAUSTED", userId, {
            ...alertMeta,
            reason: "RETRY_EXHAUSTED",
            errorCode: (err as { code?: string }).code,
          });
        } else {
          await emitAlert("CREDIT_CONSUMPTION_FAILED", userId, {
            ...alertMeta,
            reason: "UNEXPECTED_ERROR",
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
      }
      throw err;
    }
  }
  throw new CreditConsumptionError("נגמרו ניסיונות retry ב-consumeCredits", alertMeta);
}

async function emitAlert(
  type: "CREDIT_CONSUMPTION_FAILED" | "SERIALIZATION_RETRY_EXHAUSTED",
  userId: string,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.adminAlert.create({
      data: {
        type,
        priority: "HIGH",
        title:
          type === "CREDIT_CONSUMPTION_FAILED"
            ? "כשל בצריכת קרדיטים"
            : "retry על קונקרנטיות נגמר בלי הצלחה",
        message:
          type === "CREDIT_CONSUMPTION_FAILED"
            ? `כשל בצריכת קרדיטים למשתמש ${userId}. ראה metadata לפרטים.`
            : `retry על 40001/40P01 נגמר עבור משתמש ${userId}.`,
        userId,
        metadata: meta as Prisma.InputJsonValue,
        actionRequired:
          type === "CREDIT_CONSUMPTION_FAILED"
            ? "בדוק את מצב הקרדיטים של המשתמש ושקול להוסיף מכסה או חבילה."
            : "בדוק את עומס ה-DB, ייתכן שיש חוסר סקלה ב-Serializable writes.",
      },
    });
  } catch (alertErr) {
    // אל תפיל את הזרימה הראשית בשביל alert — רק רשום לוג.
    logger.error("Failed to emit CREDIT_* alert", {
      type,
      userId,
      error: alertErr instanceof Error ? alertErr.message : String(alertErr),
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * מוציא `count` SMS מהקרדיטים של המשתמש.
 * מעדיף מכסה חודשית (CommunicationSetting) ואז "בנק" (UserPackagePurchase).
 * זורק QuotaExhaustedError אם אין מספיק.
 */
export async function consumeSms(
  userId: string,
  count = 1,
  existingTx?: Prisma.TransactionClient
): Promise<ConsumeResult> {
  const body = async (tx: Prisma.TransactionClient) => {
    // ודא ש-CommunicationSetting קיים לפני הנעילה. אחרת FOR UPDATE על 0 שורות
    // הוא no-op ושני consumers מקבילים יעברו דרך הלוק. (BLOCKER סוכן 4 סיבוב 1)
    // הערה: createIfMissing לא שם-ברירת-מחדל ל-user. משתמשים ב-upsert כדי לא
    // ליצור רשומות "ריקות" בלי צורך — אם קיים, לא נוגעים. אם לא, יוצרים עם
    // ברירות מחדל (smsMonthlyQuota=200 מהסכימה).
    await tx.communicationSetting.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    await tx.$executeRaw`SELECT 1 FROM "CommunicationSetting" WHERE "userId" = ${userId} FOR UPDATE`;
    const setting = await tx.communicationSetting.findUnique({
      where: { userId },
      select: { smsMonthlyQuota: true, smsMonthlyUsage: true },
    });
    const monthlyTap = async () => {
      if (!setting) return { used: 0, available: 0 };
      const used = setting.smsMonthlyUsage ?? 0;
      const available = Math.max(0, (setting.smsMonthlyQuota ?? 0) - used);
      return { used, available };
    };

    const result = await consumeInTx(tx, {
      userId,
      count,
      packageType: "SMS",
      monthlyTap,
    });

    // עדכון המכסה החודשית אם נגענו בה.
    if (result.fromMonthly > 0 && setting) {
      await tx.communicationSetting.update({
        where: { userId },
        data: { smsMonthlyUsage: { increment: result.fromMonthly } },
      });
    }

    // הוספת month/year ל-receipt — נדרש ל-refundAiAnalysis (לא ל-SMS, אבל
    // משאירים אחיד לפי החוזה של ConsumeResult).
    const { month, year } = getCurrentUsageKey();
    return { ...result, month, year };
  };

  if (existingTx) {
    return body(existingTx);
  }
  return runWithRetryAndAlert(userId, { kind: "sms", count }, body);
}

/**
 * מוציא `count` ניתוחי AI (AI_DETAILED_ANALYSIS) מהקרדיטים.
 * מעדיף מכסה חודשית (MonthlyUsage.detailedAnalysisCount) ואז "בנק".
 *
 * המגבלה החודשית נלקחת מ-TierLimits (או ברירת מחדל 50 ל-ENTERPRISE, 0 ל-PRO/ESSENTIAL).
 */
export async function consumeAiAnalysis(
  userId: string,
  count = 1,
  existingTx?: Prisma.TransactionClient
): Promise<ConsumeResult> {
  const body = async (tx: Prisma.TransactionClient) => {
    // השג tier + limit.
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { aiTier: true },
    });
    if (!user) {
      throw new CreditConsumptionError("משתמש לא נמצא", { userId });
    }

    const tier = user.aiTier;
    const tierLimits = await tx.tierLimits.findUnique({
      where: { tier },
      select: { detailedAnalysisLimit: true },
    });
    const monthlyLimit =
      tierLimits?.detailedAnalysisLimit ??
      (tier === "ENTERPRISE" ? 50 : 0); // ברירת מחדל לפי usage-limits.ts

    // תאריך נוכחי — מפתח חודש/שנה ישראלי. שימוש במקור-אמת יחיד מ-date-utils
    // (Cursor סיבוב 1.17 Bug 1 — מנע drift בין credits ל-routes אחרים).
    const { month, year } = getCurrentUsageKey();

    // נעילה על MonthlyUsage (יוצרים עם upsert אם לא קיים).
    await tx.monthlyUsage.upsert({
      where: { userId_month_year: { userId, month, year } },
      create: { userId, month, year },
      update: {},
    });
    await tx.$executeRaw`SELECT 1 FROM "MonthlyUsage" WHERE "userId" = ${userId} AND "month" = ${month} AND "year" = ${year} FOR UPDATE`;

    const mu = await tx.monthlyUsage.findUnique({
      where: { userId_month_year: { userId, month, year } },
      select: { detailedAnalysisCount: true },
    });
    const used = mu?.detailedAnalysisCount ?? 0;

    // -1 = ללא מגבלה. לטיפוס המרה לנתיב FIFO:
    // unlimited → available גבוה מאוד.
    const available =
      monthlyLimit === -1
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, monthlyLimit - used);

    const monthlyTap = async () => ({ used, available });

    const result = await consumeInTx(tx, {
      userId,
      count,
      packageType: "AI_DETAILED_ANALYSIS",
      monthlyTap,
    });

    if (result.fromMonthly > 0) {
      await tx.monthlyUsage.update({
        where: { userId_month_year: { userId, month, year } },
        data: { detailedAnalysisCount: { increment: result.fromMonthly } },
      });
    }

    // החזרת month/year מ-consume time — חיוני ל-refund שלא יחצה גבול חודש.
    return { ...result, month, year };
  };

  if (existingTx) {
    return body(existingTx);
  }
  return runWithRetryAndAlert(
    userId,
    { kind: "ai_detailed_analysis", count },
    body
  );
}

// ─── Refund API (Stage 1.17.2) ────────────────────────────────────────────
//
// אם consumeSms / consumeAiAnalysis הצליחו אבל ה-API החיצוני (Pulseem/Gemini)
// נכשל אחר כך, צריך להחזיר את הקרדיט בדיוק כפי שהורד:
//   1. fromMonthly → decrement של החודש (CommunicationSetting / MonthlyUsage)
//   2. כל package ב-packagesTouched → decrement של creditsUsed לפי amount.
//
// חשוב: ה-refund משחזר את המצב הקודם רק בערכים. הוא לא בודק תקינות
// (לא בודק אם creditsUsed יורד מתחת ל-0) — מנהל מערכת עלול לשנות ידנית
// בין consume ל-refund. במקרה כזה: alert + log, ה-decrement עדיין נכון.

/**
 * אימות שה-receipt תקין — מגן מפני receipts זדוניים אם המנגנון יוצא ל-API
 * חיצוני בעתיד (סוכן 5 סבב 1.17.2 — security).
 *
 * ⚠️ CALLER WARNING:
 *   `receipt` חייב להגיע מקריאה קודמת ל-consumeSms/consumeAiAnalysis.
 *   לא לקבל קלט חיצוני ולא לבנות receipt ידני — חוץ מ-test mocks.
 */
function validateReceipt(receipt: ConsumeResult): void {
  if (receipt.fromMonthly < 0) {
    throw new CreditConsumptionError("receipt.fromMonthly negative", {
      receipt: receipt as unknown as Record<string, unknown>,
    });
  }
  for (const pkg of receipt.packagesTouched) {
    if (pkg.amount < 0) {
      throw new CreditConsumptionError("package amount negative", {
        receipt: receipt as unknown as Record<string, unknown>,
      });
    }
  }
}

/**
 * Helper משותף ל-refundSms / refundAiAnalysis.
 */
async function refundInTx(
  tx: Prisma.TransactionClient,
  receipt: ConsumeResult,
  monthlyDecrement: () => Promise<void>
): Promise<void> {
  validateReceipt(receipt);
  if (receipt.fromMonthly > 0) {
    await monthlyDecrement();
  }
  for (const pkg of receipt.packagesTouched) {
    await tx.userPackagePurchase.update({
      where: { id: pkg.id },
      data: { creditsUsed: { decrement: pkg.amount } },
    });
  }
}

/**
 * מחזיר קרדיטי SMS שהוסרו ב-consumeSms. נקרא רק כאשר ה-send נכשל.
 *
 * ⚠️ `receipt` חייב להגיע מ-consumeSms קודמת — לא input חיצוני.
 * negative amounts יזרקו CreditConsumptionError לפני שינוי ה-DB.
 */
export async function refundSms(
  userId: string,
  receipt: ConsumeResult,
  existingTx?: Prisma.TransactionClient
): Promise<void> {
  if (receipt.consumed === 0) return;
  const body = async (tx: Prisma.TransactionClient) =>
    refundInTx(tx, receipt, async () => {
      await tx.communicationSetting.update({
        where: { userId },
        data: { smsMonthlyUsage: { decrement: receipt.fromMonthly } },
      });
    });

  if (existingTx) return body(existingTx);
  // skipAlert: caller-side `refundConsumedSms`/`refundConsumedAi` יצור URGENT
  // alert מפורט יותר (עם receipt). מונע double-alert flood (Cursor סבב 1.17.2).
  await runWithRetryAndAlert(
    userId,
    { kind: "sms_refund", consumed: receipt.consumed },
    async (tx) => {
      await body(tx);
      return null;
    },
    { skipAlert: true }
  );
}

/**
 * מחזיר קרדיטי AI analysis שהוסרו ב-consumeAiAnalysis.
 *
 * חשוב: משתמש ב-month/year שמ-receipt (זמן ה-consume), לא ב-getCurrentUsageKey
 * הנוכחי — אחרת חציית גבול חודש בין consume ל-refund תפגע ב-MonthlyUsage הלא נכון.
 *
 * ⚠️ `receipt` חייב להגיע מ-consumeAiAnalysis קודמת — לא input חיצוני.
 */
export async function refundAiAnalysis(
  userId: string,
  receipt: ConsumeResult,
  existingTx?: Prisma.TransactionClient
): Promise<void> {
  if (receipt.consumed === 0) return;
  const body = async (tx: Prisma.TransactionClient) =>
    refundInTx(tx, receipt, async () => {
      // משתמש ב-month/year מ-receipt — לא ב-getCurrentUsageKey() הנוכחי.
      // (סוכן 2 סבב 1.17.2 — month boundary edge case.)
      await tx.monthlyUsage.update({
        where: {
          userId_month_year: {
            userId,
            month: receipt.month,
            year: receipt.year,
          },
        },
        data: { detailedAnalysisCount: { decrement: receipt.fromMonthly } },
      });
    });

  if (existingTx) return body(existingTx);
  // skipAlert: ראה הסבר ב-refundSms — מניעת double-alert.
  await runWithRetryAndAlert(
    userId,
    { kind: "ai_refund", consumed: receipt.consumed },
    async (tx) => {
      await body(tx);
      return null;
    },
    { skipAlert: true }
  );
}
