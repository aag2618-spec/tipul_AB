// src/lib/trial-limits.ts
// בדיקת מגבלות AI למשתמשי ניסיון
// תקרה: ₪5 (ברירת מחדל) - מוצג למשתמש כ"שימוש מוגבל"

import prisma from "@/lib/prisma";

interface TrialCheckResult {
  allowed: boolean;
  isTrial: boolean;
  message?: string;
  remainingBudget?: number;
}

/**
 * בודק אם משתמש ניסיון יכול לבצע קריאת AI
 * @param userId - מזהה המשתמש
 * @param estimatedCost - עלות משוערת של הקריאה (₪)
 * @returns { allowed, isTrial, message? }
 */
export async function checkTrialAiLimit(
  userId: string,
  estimatedCost: number = 0.01
): Promise<TrialCheckResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionStatus: true,
      trialEndsAt: true,
      trialAiCostLimit: true,
      trialAiUsedCost: true,
    },
  });

  if (!user) {
    return { allowed: false, isTrial: false, message: "משתמש לא נמצא" };
  }

  // Not a trial user - no restriction
  if (user.subscriptionStatus !== "TRIALING") {
    return { allowed: true, isTrial: false };
  }

  // Trial expired
  if (user.trialEndsAt && new Date(user.trialEndsAt) < new Date()) {
    return {
      allowed: false,
      isTrial: true,
      message: "תקופת הניסיון הסתיימה. בחר מסלול כדי להמשיך להשתמש ב-AI.",
    };
  }

  const limit = parseFloat(String(user.trialAiCostLimit || "5"));
  const used = parseFloat(String(user.trialAiUsedCost || "0"));
  const remaining = limit - used;

  if (remaining < estimatedCost) {
    return {
      allowed: false,
      isTrial: true,
      remainingBudget: remaining,
      message: "הגעת למגבלת השימוש ב-AI בתקופת הניסיון. שדרג למנוי מלא כדי להמשיך.",
    };
  }

  return {
    allowed: true,
    isTrial: true,
    remainingBudget: remaining,
  };
}

/**
 * מעדכן את עלות ה-AI שנצברה למשתמש ניסיון
 * @param userId - מזהה המשתמש
 * @param cost - עלות הקריאה (₪)
 */
export async function updateTrialAiCost(userId: string, cost: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true },
  });

  if (user?.subscriptionStatus === "TRIALING") {
    await prisma.user.update({
      where: { id: userId },
      data: {
        trialAiUsedCost: { increment: cost },
      },
    });
  }
}
