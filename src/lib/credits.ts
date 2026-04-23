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

interface ConsumeResult {
  consumed: number;
  fromMonthly: number;
  fromPackages: number;
  /** מזהי UserPackagePurchase שנגעו (לצורך audit). */
  packagesTouched: string[];
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
): Promise<ConsumeResult> {
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
  const touched: string[] = [];
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
    touched.push(p.id);
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
  run: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => run(tx),
        { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 }
      );
    } catch (err) {
      if (err instanceof QuotaExhaustedError) {
        await emitAlert("CREDIT_CONSUMPTION_FAILED", userId, {
          ...alertMeta,
          reason: "QUOTA_EXHAUSTED",
          meta: err.meta,
        });
        throw err;
      }
      if (isRetryableError(err) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, jitter(DELAYS_MS[attempt])));
        continue;
      }
      // retry exhausted or non-retryable non-quota error
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

    return result;
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

    // תאריך נוכחי — מפתח חודש/שנה ישראלי.
    const now = new Date();
    const jerusalemFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "numeric",
    });
    const parts = jerusalemFormatter.formatToParts(now);
    const month = Number(parts.find((p) => p.type === "month")?.value ?? 0);
    const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);

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

    return result;
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
