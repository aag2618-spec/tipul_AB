/**
 * Unit tests — src/lib/credits.ts (Stage 1.14)
 *
 * הטסטים האלה בודקים את הלוגיקה של consumeSms / consumeAiAnalysis
 * כאשר `existingTx` מסופק (ללא retry/wrap). בדיקות concurrency אמיתיות
 * מגיעות ב-Stage 1.16 עם Docker Postgres.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Prisma mock ─────────────────────────────────────────────────────────

const mockTx: Record<string, unknown> = {};

const executeRaw = vi.fn().mockResolvedValue(1);
const queryRaw = vi.fn();
const commSettingFindUnique = vi.fn();
const commSettingUpdate = vi.fn();
const commSettingUpsert = vi.fn();
const userFindUnique = vi.fn();
const tierLimitsFindUnique = vi.fn();
const monthlyUsageUpsert = vi.fn().mockResolvedValue({});
const monthlyUsageFindUnique = vi.fn();
const monthlyUsageUpdate = vi.fn();
const purchaseUpdate = vi.fn();
const alertCreate = vi.fn().mockResolvedValue({});

const tx = {
  $executeRaw: (...a: unknown[]) => executeRaw(...a),
  $queryRaw: (...a: unknown[]) => queryRaw(...a),
  communicationSetting: {
    findUnique: (...a: unknown[]) => commSettingFindUnique(...a),
    update: (...a: unknown[]) => commSettingUpdate(...a),
    upsert: (...a: unknown[]) => commSettingUpsert(...a),
  },
  user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  tierLimits: { findUnique: (...a: unknown[]) => tierLimitsFindUnique(...a) },
  monthlyUsage: {
    upsert: (...a: unknown[]) => monthlyUsageUpsert(...a),
    findUnique: (...a: unknown[]) => monthlyUsageFindUnique(...a),
    update: (...a: unknown[]) => monthlyUsageUpdate(...a),
  },
  userPackagePurchase: {
    update: (...a: unknown[]) => purchaseUpdate(...a),
  },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    adminAlert: { create: (...a: unknown[]) => alertCreate(...a) },
    $transaction: (fn: any) => fn(tx),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  consumeSms,
  consumeAiAnalysis,
  refundSms,
  refundAiAnalysis,
  QuotaExhaustedError,
  CreditConsumptionError,
} from "../credits";

beforeEach(() => {
  vi.resetAllMocks();
  // defaults — אחרי resetAllMocks צריך להגדיר מחדש.
  executeRaw.mockResolvedValue(1);
  queryRaw.mockResolvedValue([]);
  monthlyUsageUpsert.mockResolvedValue({});
  commSettingUpsert.mockResolvedValue({});
  alertCreate.mockResolvedValue({});
  // defaults לטסטים שלא מתעניינים בהם:
  purchaseUpdate.mockResolvedValue({});
  commSettingUpdate.mockResolvedValue({});
  monthlyUsageUpdate.mockResolvedValue({});
});

// ─── consumeSms ──────────────────────────────────────────────────────────

describe("consumeSms", () => {
  it("throws on count <= 0", async () => {
    commSettingFindUnique.mockResolvedValueOnce({
      smsMonthlyQuota: 100,
      smsMonthlyUsage: 0,
    });

    await expect(consumeSms("u1", 0, tx as any)).rejects.toBeInstanceOf(
      CreditConsumptionError
    );
  });

  it("consumes from monthly quota when available", async () => {
    commSettingFindUnique.mockResolvedValueOnce({
      smsMonthlyQuota: 100,
      smsMonthlyUsage: 40,
    });
    commSettingUpdate.mockResolvedValueOnce({});
    queryRaw.mockResolvedValueOnce([]);

    const result = await consumeSms("u1", 5, tx as any);

    expect(result.consumed).toBe(5);
    expect(result.fromMonthly).toBe(5);
    expect(result.fromPackages).toBe(0);
    expect(commSettingUpdate).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { smsMonthlyUsage: { increment: 5 } },
    });
  });

  it("falls through to package bank when monthly exhausted", async () => {
    commSettingFindUnique.mockResolvedValueOnce({
      smsMonthlyQuota: 100,
      smsMonthlyUsage: 100,
    });
    queryRaw.mockResolvedValueOnce([
      {
        id: "p1",
        credits: 50,
        creditsUsed: 10,
        createdAt: new Date("2026-01-01"),
      },
    ]);
    purchaseUpdate.mockResolvedValueOnce({});

    const result = await consumeSms("u1", 3, tx as any);

    expect(result.fromMonthly).toBe(0);
    expect(result.fromPackages).toBe(3);
    expect(result.packagesTouched).toEqual([{ id: "p1", amount: 3 }]);
    expect(purchaseUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { creditsUsed: 13 },
    });
  });

  it("FIFO splits across packages", async () => {
    commSettingFindUnique.mockResolvedValueOnce({
      smsMonthlyQuota: 10,
      smsMonthlyUsage: 10,
    });
    queryRaw.mockResolvedValueOnce([
      {
        id: "p1",
        credits: 5,
        creditsUsed: 3,
        createdAt: new Date("2026-01-01"),
      },
      {
        id: "p2",
        credits: 10,
        creditsUsed: 0,
        createdAt: new Date("2026-02-01"),
      },
    ]);
    purchaseUpdate.mockResolvedValue({});

    const result = await consumeSms("u1", 5, tx as any);

    expect(result.fromMonthly).toBe(0);
    expect(result.fromPackages).toBe(5);
    expect(result.packagesTouched).toEqual([
      { id: "p1", amount: 2 },
      { id: "p2", amount: 3 },
    ]);
    // p1 had 2 left (5-3), so 2 taken from p1, 3 from p2
    expect(purchaseUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "p1" },
      data: { creditsUsed: 5 },
    });
    expect(purchaseUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "p2" },
      data: { creditsUsed: 3 },
    });
  });

  it("throws QuotaExhaustedError when insufficient", async () => {
    commSettingFindUnique.mockResolvedValueOnce({
      smsMonthlyQuota: 0,
      smsMonthlyUsage: 0,
    });
    queryRaw.mockResolvedValueOnce([]);

    await expect(consumeSms("u1", 1, tx as any)).rejects.toBeInstanceOf(
      QuotaExhaustedError
    );
  });

  it("prefers monthly over packages", async () => {
    commSettingFindUnique.mockResolvedValueOnce({
      smsMonthlyQuota: 100,
      smsMonthlyUsage: 98,
    });
    queryRaw.mockResolvedValueOnce([
      {
        id: "p1",
        credits: 50,
        creditsUsed: 0,
        createdAt: new Date("2026-01-01"),
      },
    ]);
    commSettingUpdate.mockResolvedValueOnce({});
    purchaseUpdate.mockResolvedValueOnce({});

    const result = await consumeSms("u1", 3, tx as any);

    // מכסה: 2 זמינות (100-98) → נלקחו 2
    // מ-bank: 1 חסר (3-2) → נלקח 1 מ-p1
    expect(result.fromMonthly).toBe(2);
    expect(result.fromPackages).toBe(1);
  });

  it("skips reverted/zero-balance packages", async () => {
    commSettingFindUnique.mockResolvedValueOnce({
      smsMonthlyQuota: 0,
      smsMonthlyUsage: 0,
    });
    // reverted לא יוחזר (findMany עם where.reverted=false) — נשלח ריק.
    // אבל נבדק גם שעטיפה שלילית על package שהפך ליתרה 0 (creditsUsed == credits)
    queryRaw.mockResolvedValueOnce([
      { id: "p1", credits: 10, creditsUsed: 10, createdAt: new Date() },
      { id: "p2", credits: 5, creditsUsed: 0, createdAt: new Date() },
    ]);
    purchaseUpdate.mockResolvedValueOnce({});

    const result = await consumeSms("u1", 2, tx as any);

    expect(result.fromPackages).toBe(2);
    expect(result.packagesTouched).toEqual([{ id: "p2", amount: 2 }]);
  });
});

// ─── consumeAiAnalysis ────────────────────────────────────────────────────

describe("consumeAiAnalysis", () => {
  it("uses ENTERPRISE default of 50/month", async () => {
    userFindUnique.mockResolvedValueOnce({ aiTier: "ENTERPRISE" });
    tierLimitsFindUnique.mockResolvedValueOnce(null);
    monthlyUsageFindUnique.mockResolvedValueOnce({
      detailedAnalysisCount: 5,
    });
    monthlyUsageUpdate.mockResolvedValueOnce({});
    queryRaw.mockResolvedValueOnce([]);

    const result = await consumeAiAnalysis("u1", 2, tx as any);

    expect(result.consumed).toBe(2);
    expect(result.fromMonthly).toBe(2);
  });

  it("PRO with default (0) exhausts monthly, requires bank", async () => {
    userFindUnique.mockResolvedValueOnce({ aiTier: "PRO" });
    tierLimitsFindUnique.mockResolvedValueOnce(null);
    monthlyUsageFindUnique.mockResolvedValueOnce({
      detailedAnalysisCount: 0,
    });
    queryRaw.mockResolvedValueOnce([]);

    await expect(
      consumeAiAnalysis("u1", 1, tx as any)
    ).rejects.toBeInstanceOf(QuotaExhaustedError);
  });

  it("treats limit=-1 as unlimited", async () => {
    userFindUnique.mockResolvedValueOnce({ aiTier: "PRO" });
    tierLimitsFindUnique.mockResolvedValueOnce({ detailedAnalysisLimit: -1 });
    monthlyUsageFindUnique.mockResolvedValueOnce({
      detailedAnalysisCount: 999999,
    });
    monthlyUsageUpdate.mockResolvedValueOnce({});
    queryRaw.mockResolvedValueOnce([]);

    const result = await consumeAiAnalysis("u1", 1, tx as any);
    expect(result.fromMonthly).toBe(1);
  });

  it("throws if user not found", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    await expect(
      consumeAiAnalysis("bad-id", 1, tx as any)
    ).rejects.toBeInstanceOf(CreditConsumptionError);
  });
});

// ─── Stage 1.17.2 — Refund tests ──────────────────────────────────────────

describe("refundSms", () => {
  it("decrements monthly bucket and packages by exact amounts", async () => {
    commSettingUpdate.mockResolvedValueOnce({});
    purchaseUpdate.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    const receipt = {
      consumed: 5,
      fromMonthly: 2,
      fromPackages: 3,
      packagesTouched: [
        { id: "p1", amount: 1 },
        { id: "p2", amount: 2 },
      ],
      month: 4,
      year: 2026,
    };

    await refundSms("u1", receipt, tx as any);

    expect(commSettingUpdate).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { smsMonthlyUsage: { decrement: 2 } },
    });
    expect(purchaseUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "p1" },
      data: { creditsUsed: { decrement: 1 } },
    });
    expect(purchaseUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "p2" },
      data: { creditsUsed: { decrement: 2 } },
    });
  });

  it("no-op on consumed=0", async () => {
    const receipt = {
      consumed: 0,
      fromMonthly: 0,
      fromPackages: 0,
      packagesTouched: [],
      month: 4,
      year: 2026,
    };
    await refundSms("u1", receipt, tx as any);
    expect(commSettingUpdate).not.toHaveBeenCalled();
    expect(purchaseUpdate).not.toHaveBeenCalled();
  });

  it("only packages — no monthly decrement when fromMonthly=0", async () => {
    purchaseUpdate.mockResolvedValueOnce({});
    const receipt = {
      consumed: 3,
      fromMonthly: 0,
      fromPackages: 3,
      packagesTouched: [{ id: "p1", amount: 3 }],
      month: 4,
      year: 2026,
    };
    await refundSms("u1", receipt, tx as any);
    expect(commSettingUpdate).not.toHaveBeenCalled();
    expect(purchaseUpdate).toHaveBeenCalledTimes(1);
  });

  it("rejects negative fromMonthly (security guard)", async () => {
    const receipt = {
      consumed: 1,
      fromMonthly: -1,
      fromPackages: 0,
      packagesTouched: [],
      month: 4,
      year: 2026,
    };
    await expect(refundSms("u1", receipt, tx as any)).rejects.toBeInstanceOf(
      CreditConsumptionError
    );
    expect(commSettingUpdate).not.toHaveBeenCalled();
  });
});

describe("refundAiAnalysis", () => {
  it("decrements MonthlyUsage.detailedAnalysisCount and packages", async () => {
    monthlyUsageUpdate.mockResolvedValueOnce({});
    purchaseUpdate.mockResolvedValueOnce({});

    const receipt = {
      consumed: 2,
      fromMonthly: 1,
      fromPackages: 1,
      packagesTouched: [{ id: "p1", amount: 1 }],
      month: 4,
      year: 2026,
    };

    await refundAiAnalysis("u1", receipt, tx as any);

    expect(monthlyUsageUpdate).toHaveBeenCalled();
    const monthlyCall = monthlyUsageUpdate.mock.calls[0][0];
    // אימות: ה-where משתמש ב-month/year מהreceipt, לא getCurrentUsageKey
    expect(monthlyCall.where.userId_month_year.month).toBe(4);
    expect(monthlyCall.where.userId_month_year.year).toBe(2026);
    expect(monthlyCall.data.detailedAnalysisCount.decrement).toBe(1);
    expect(purchaseUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { creditsUsed: { decrement: 1 } },
    });
  });

  it("uses receipt.month/year not current — month boundary safety", async () => {
    monthlyUsageUpdate.mockResolvedValueOnce({});
    purchaseUpdate.mockResolvedValueOnce({});
    const receipt = {
      consumed: 1,
      fromMonthly: 1,
      fromPackages: 0,
      packagesTouched: [],
      // consume happened in March; refund runs in April — must target March.
      month: 3,
      year: 2026,
    };

    await refundAiAnalysis("u1", receipt, tx as any);

    const monthlyCall = monthlyUsageUpdate.mock.calls[0][0];
    expect(monthlyCall.where.userId_month_year.month).toBe(3);
    expect(monthlyCall.where.userId_month_year.year).toBe(2026);
  });
});

// ─── Stage 1.17.2 סבב 3 — skipAlert regression ────────────────────────────
//
// Cursor ביקש test שיתעד את ה-skipAlert behavior כך שלא ייעלם בריפקטור עתידי.
// השומרים על "1 alert לכל refund failure" (לא 2 כמו שהיה לפני).

describe("skipAlert option in runWithRetryAndAlert", () => {
  it("refundSms with skipAlert:true does NOT call adminAlert.create on DB failure", async () => {
    // הפעלה ללא existingTx → נכנס ל-runWithRetryAndAlert.
    // קוראים ל-commSettingUpdate שזורק non-retryable.
    // אם skipAlert עבד נכון: alertCreate לא ייקרא.
    const fatalErr = Object.assign(new Error("fatal db"), { code: "P9999" });
    commSettingUpdate.mockRejectedValue(fatalErr);

    const receipt = {
      consumed: 1,
      fromMonthly: 1,
      fromPackages: 0,
      packagesTouched: [],
      month: 4,
      year: 2026,
    };

    await expect(refundSms("u1", receipt)).rejects.toThrow("fatal db");
    // קריטי: alertCreate לא נקרא מתוך runWithRetryAndAlert — skipAlert: true עובד.
    // (ה-caller-side helper יוצר alert URGENT מפורט יותר, אבל זה לא בנדון פה.)
    expect(alertCreate).not.toHaveBeenCalled();
  });

  it("refundAiAnalysis with skipAlert:true does NOT call adminAlert.create on DB failure", async () => {
    // אותו דפוס — סימטריה עם refundSms (Cursor סוכן 4 סבב 3).
    const fatalErr = Object.assign(new Error("fatal ai db"), { code: "P9999" });
    monthlyUsageUpdate.mockRejectedValue(fatalErr);

    const receipt = {
      consumed: 1,
      fromMonthly: 1,
      fromPackages: 0,
      packagesTouched: [],
      month: 4,
      year: 2026,
    };

    await expect(refundAiAnalysis("u1", receipt)).rejects.toThrow("fatal ai db");
    expect(alertCreate).not.toHaveBeenCalled();
  });
});
