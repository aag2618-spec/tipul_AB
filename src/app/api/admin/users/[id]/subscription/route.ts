// src/app/api/admin/users/[id]/subscription/route.ts
// Stage 6 — POST actions של אדמין על מנוי משתמש:
//   - extend_trial — הארכת תקופת ניסיון
//   - grant_package — מתן חבילת SMS/AI חינם
//   - change_tier — שינוי תוכנית ידני
//   - set_free — הפעלה/ביטול של מנוי חינם
//   - override_price — דריסת מחיר מנוי (יוצר PricingPolicy scope=USER)
//
// refund_payment ממומש בנפרד ב-/api/admin/users/[id]/refund-payment (כבר קיים).
//
// כל פעולה מתועדת ב-AdminAuditLog דרך withAudit + SELECT FOR UPDATE על User.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { hasPermission, type Permission } from "@/lib/permissions";
import { withAudit } from "@/lib/audit";
import { invalidateJwtCache } from "@/lib/auth";
import { parseBody } from "@/lib/validations/helpers";
import { fetchAndResolveSubscriptionPrice, getPriceForPeriod } from "@/lib/pricing/resolve";
import {
  validateExtendTrial,
  validateExtendSubscription,
  validateGrantPackage,
  validateChangeTier,
  validateOverridePrice,
  validateSetFree,
  calculateNewTrialEndsAt,
  calculateNewSubscriptionEndsAt,
} from "@/lib/payments/admin-subscription-actions";
import type { Session } from "next-auth";

type AdminSession = Session;

// Per-action permissions — סוכן 2 ממצא #6. MANAGER יוכל לבצע רק actions עם
// rank נמוך; ADMIN לבצע את כולם.
const ACTION_PERMISSIONS: Record<string, Permission> = {
  extend_trial: "users.extend_trial_14d",
  extend_subscription: "users.extend_subscription", // ADMIN בלבד
  grant_package: "packages.grant_manual",
  change_tier: "users.change_tier",
  override_price: "settings.pricing", // ADMIN בלבד
  set_free: "users.grant_free_unlimited", // ADMIN בלבד
};

export const dynamic = "force-dynamic";

// ============================================================================
// Schemas — discriminated union לפי action
// ============================================================================

const extendTrialSchema = z.object({
  action: z.literal("extend_trial"),
  days: z.number().int().positive(),
});

const extendSubscriptionSchema = z.object({
  action: z.literal("extend_subscription"),
  days: z.number().int().positive(),
  note: z.string().min(3).max(500),
});

const grantPackageSchema = z.object({
  action: z.literal("grant_package"),
  packageType: z.enum(["SMS", "AI_DETAILED_ANALYSIS"]),
  credits: z.number().int().positive(),
  note: z.string().min(1).max(500),
});

const changeTierSchema = z.object({
  action: z.literal("change_tier"),
  toTier: z.enum(["ESSENTIAL", "PRO", "ENTERPRISE"]),
  note: z.string().max(500).optional(),
});

const overridePriceSchema = z.object({
  action: z.literal("override_price"),
  planTier: z.enum(["ESSENTIAL", "PRO", "ENTERPRISE"]),
  monthlyIls: z.number().positive(),
  quarterlyIls: z.number().positive().nullable().optional(),
  halfYearIls: z.number().positive().nullable().optional(),
  yearlyIls: z.number().positive().nullable().optional(),
  note: z.string().max(500).optional(),
});

const setFreeSchema = z.object({
  action: z.literal("set_free"),
  isFree: z.boolean(),
  note: z.string().max(500).nullable().optional(),
});

const actionSchema = z.discriminatedUnion("action", [
  extendTrialSchema,
  extendSubscriptionSchema,
  grantPackageSchema,
  changeTierSchema,
  overridePriceSchema,
  setFreeSchema,
]);

// ============================================================================
// POST handler
// ============================================================================

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // baseline — users.view (MANAGER+). per-action permission נבדק אחרי
    // ה-parsing של ה-body כדי לדעת מאיזו action מדובר.
    const auth = await requirePermission("users.view");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    // סוכן 2 ממצא #7: חוסם impersonation מפורש — פעולות כספיות לא יבוצעו
    // ע"י OWNER בשם target.
    if (session.user.actingAs) {
      return NextResponse.json(
        {
          message:
            "פעולה זו אינה זמינה במצב התחזות. צא/י ממצב ההתחזות ונסה/י שוב.",
        },
        { status: 403 }
      );
    }

    const { id: targetUserId } = await context.params;

    const parsed = await parseBody(request, actionSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;

    // per-action permission check — סוכן 2 ממצא #6
    const requiredPerm = ACTION_PERMISSIONS[body.action];
    if (!requiredPerm || !hasPermission(session.user.role, requiredPerm)) {
      return NextResponse.json(
        { message: "אין הרשאה לפעולה זו." },
        { status: 403 }
      );
    }

    // וידוא שהמשתמש קיים לפני כניסה ל-tx
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        aiTier: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
      },
    });
    if (!targetUser) {
      return NextResponse.json(
        { message: "משתמש לא נמצא" },
        { status: 404 }
      );
    }

    // ── דיספטץ' לפי action ──
    switch (body.action) {
      case "extend_trial":
        return await handleExtendTrial(
          session,
          targetUserId,
          targetUser.trialEndsAt,
          body.days
        );
      case "extend_subscription":
        return await handleExtendSubscription(
          session,
          targetUserId,
          targetUser.subscriptionEndsAt,
          body.days,
          body.note
        );
      case "grant_package":
        return await handleGrantPackage(
          session,
          targetUserId,
          body.packageType,
          body.credits,
          body.note
        );
      case "change_tier":
        return await handleChangeTier(
          session,
          targetUserId,
          targetUser.aiTier,
          body.toTier,
          body.note
        );
      case "override_price":
        return await handleOverridePrice(session, targetUserId, body);
      case "set_free":
        return await handleSetFree(
          session,
          targetUserId,
          body.isFree,
          body.note ?? null
        );
    }
  } catch (error) {
    logger.error("[admin/users/[id]/subscription] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בביצוע הפעולה" },
      { status: 500 }
    );
  }
}

// ============================================================================
// handlers
// ============================================================================

async function handleExtendTrial(
  session: AdminSession,
  targetUserId: string,
  currentTrialEndsAt: Date | null,
  days: number
) {
  const v = validateExtendTrial({ days });
  if (!v.allowed) {
    return NextResponse.json({ message: v.reason }, { status: 400 });
  }
  const now = new Date();
  const newTrialEndsAt = calculateNewTrialEndsAt({
    currentTrialEndsAt,
    daysToAdd: days,
    now,
  });

  const result = await withAudit(
    { kind: "user", session },
    {
      action: "extend_trial",
      targetType: "user",
      targetId: targetUserId,
      details: {
        days,
        oldTrialEndsAt: currentTrialEndsAt?.toISOString() ?? null,
        newTrialEndsAt: newTrialEndsAt.toISOString(),
      },
    },
    async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${targetUserId} FOR UPDATE`;
      return tx.user.update({
        where: { id: targetUserId },
        data: { trialEndsAt: newTrialEndsAt },
        select: { id: true, trialEndsAt: true },
      });
    }
  );

  // M10.2: trialEndsAt נמצא ב-JWT cache. סוגרים חלון של 30s.
  invalidateJwtCache(targetUserId);

  logger.info("[admin] extend_trial", {
    targetUserId,
    days,
    newTrialEndsAt: result.trialEndsAt?.toISOString(),
  });
  return NextResponse.json({
    success: true,
    message: `הניסיון הוארך ב-${days} ימים.`,
    trialEndsAt: result.trialEndsAt,
  });
}

// ============================================================================
// handleExtendSubscription — הוספת ימים למנוי פעיל (לא ניסיון)
// ============================================================================
// מוסיף ימים ל-subscriptionEndsAt של המשתמש. בנוסף, מעדכן את nextChargeAt
// של ה-SP הפעיל (אם יש) — דוחה את החיוב החוזר ב-X ימים. **לא נוגעים ב-periodEnd**
// כי ה-cron מסיק ממנו את אורך התקופה (chargeNextSubscription) — שינוי שלו
// יגרום ל-cron לחשב periodMonths שגוי וליצור SP חדש בתקופה לא נכונה.
async function handleExtendSubscription(
  session: AdminSession,
  targetUserId: string,
  currentSubscriptionEndsAt: Date | null,
  days: number,
  note: string
) {
  const v = validateExtendSubscription({ days, note });
  if (!v.allowed) {
    return NextResponse.json({ message: v.reason }, { status: 400 });
  }
  const now = new Date();
  const newSubscriptionEndsAt = calculateNewSubscriptionEndsAt({
    currentEndsAt: currentSubscriptionEndsAt,
    daysToAdd: days,
    now,
  });
  const daysInMs = days * 24 * 60 * 60 * 1000;

  const result = await withAudit(
    { kind: "user", session },
    {
      action: "extend_subscription",
      targetType: "user",
      targetId: targetUserId,
      details: {
        days,
        note,
        oldSubscriptionEndsAt:
          currentSubscriptionEndsAt?.toISOString() ?? null,
        newSubscriptionEndsAt: newSubscriptionEndsAt.toISOString(),
      },
    },
    async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${targetUserId} FOR UPDATE`;
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: { subscriptionEndsAt: newSubscriptionEndsAt },
        select: { id: true, subscriptionEndsAt: true },
      });

      // עדכון ה-SP הפעיל: דוחה nextChargeAt בלבד. periodEnd נשאר כפי שהיה
      // כדי שה-cron יוכל לחשב periodMonths נכון בעת חיוב חוזר.
      const activeSp = await tx.subscriptionPayment.findFirst({
        where: {
          userId: targetUserId,
          status: { in: ["PAID", "PENDING"] },
          nextChargeAt: { not: null, gt: now },
          autoChargeEnabled: true,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, nextChargeAt: true },
      });
      if (activeSp) {
        // SELECT FOR UPDATE על ה-SP — חוסם race עם cron חיוב חוזר שמנסה
        // לתפוס lease על אותה שורה.
        await tx.$executeRaw`SELECT 1 FROM "SubscriptionPayment" WHERE "id" = ${activeSp.id} FOR UPDATE`;
        await tx.subscriptionPayment.update({
          where: { id: activeSp.id },
          data: {
            nextChargeAt: activeSp.nextChargeAt
              ? new Date(activeSp.nextChargeAt.getTime() + daysInMs)
              : newSubscriptionEndsAt,
          },
        });
      }
      return updated;
    }
  );

  // M10.2: subscriptionEndsAt נמצא ב-JWT cache. סוגרים חלון של 30s.
  invalidateJwtCache(targetUserId);

  logger.info("[admin] extend_subscription", {
    targetUserId,
    days,
    newSubscriptionEndsAt: result.subscriptionEndsAt?.toISOString(),
  });
  return NextResponse.json({
    success: true,
    message: `המנוי הוארך ב-${days} ימים. סיום חדש: ${result.subscriptionEndsAt?.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}.`,
    subscriptionEndsAt: result.subscriptionEndsAt,
  });
}

async function handleGrantPackage(
  session: AdminSession,
  targetUserId: string,
  packageType: "SMS" | "AI_DETAILED_ANALYSIS",
  credits: number,
  note: string
) {
  const v = validateGrantPackage({ packageType, credits });
  if (!v.allowed) {
    return NextResponse.json({ message: v.reason }, { status: 400 });
  }
  const adminId = session.user.id;
  const created = await withAudit(
    { kind: "user", session },
    {
      action: "grant_package",
      targetType: "user",
      targetId: targetUserId,
      details: { packageType, credits, note },
    },
    async (tx) => {
      // SELECT FOR UPDATE — סוכן 1 ממצא #1
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${targetUserId} FOR UPDATE`;
      return tx.userPackagePurchase.create({
        data: {
          userId: targetUserId,
          packageId: null, // חבילה חינמית — לא מקושר ל-Package בקטלוג
          type: packageType,
          credits,
          creditsUsed: 0,
          // PackageSource enum: MANUAL = ידני ע"י מנהל. ADMIN לא קיים ב-enum.
          source: "MANUAL",
          grantedBy: adminId,
          note,
        },
        select: { id: true, credits: true, type: true },
      });
    }
  );
  logger.info("[admin] grant_package", {
    targetUserId,
    purchaseId: created.id,
    packageType,
    credits,
  });
  return NextResponse.json({
    success: true,
    message: `הוענקו ${credits} יחידות מסוג ${packageType}.`,
    purchaseId: created.id,
  });
}

async function handleChangeTier(
  session: AdminSession,
  targetUserId: string,
  fromTier: "ESSENTIAL" | "PRO" | "ENTERPRISE",
  toTier: "ESSENTIAL" | "PRO" | "ENTERPRISE",
  note: string | undefined
) {
  const v = validateChangeTier({ fromTier, toTier });
  if (!v.allowed) {
    return NextResponse.json({ message: v.reason }, { status: 400 });
  }

  // סוכן 2 ממצא #1: change_tier חייב לעדכן SP הפעיל כדי שcron יחייב נכון.
  // ה-cron קורא לפי sp.amount + sp.planTier, לא לפי User.aiTier.
  // שולפים את ה-organizationId + pendingTier/pendingTierEffectiveAt לפני ה-tx
  // (resolve משתמש ב-organizationId, ו-audit צריך לתעד מה נמחק).
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      organizationId: true,
      pendingTier: true,
      pendingTierEffectiveAt: true,
    },
  });
  if (!targetUser) {
    return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
  }

  const now = new Date();
  const resolved = await fetchAndResolveSubscriptionPrice({
    userId: targetUserId,
    organizationId: targetUser.organizationId,
    planTier: toTier,
    now,
  });

  await withAudit(
    { kind: "user", session },
    {
      action: "change_tier",
      targetType: "user",
      targetId: targetUserId,
      details: {
        fromTier,
        toTier,
        note: note ?? null,
        newMonthlyPrice: resolved.monthlyIls,
        priceSource: resolved.source,
        // סוכן 1 סבב 1: לתעד pendingTier שנמחק (אחרת אובד מידע)
        oldPendingTier: targetUser.pendingTier ?? null,
        oldPendingTierEffectiveAt:
          targetUser.pendingTierEffectiveAt?.toISOString() ?? null,
      },
    },
    async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${targetUserId} FOR UPDATE`;
      // קודם: עדכון aiTier + ניקוי pendingTier
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          aiTier: toTier,
          pendingTier: null,
          pendingTierEffectiveAt: null,
        },
      });

      // לאחר מכן: עדכון ה-SP הפעיל (PAID עם nextChargeAt עתידי) — כך cron
      // הבא יחייב לפי tier+מחיר חדשים. SP בעבר נשאר כפי שהיה (היסטוריה אמיתית).
      const activeSp = await tx.subscriptionPayment.findFirst({
        where: {
          userId: targetUserId,
          status: { in: ["PAID", "PENDING"] },
          nextChargeAt: { not: null, gt: now },
          autoChargeEnabled: true,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, periodStart: true, periodEnd: true },
      });
      if (activeSp) {
        // ניסיון לחשב מחיר לפי תקופת ה-SP הקיים (מספר חודשים בערך).
        // אם periodStart/periodEnd חסרים, fallback למחיר חודשי.
        const months = activeSp.periodStart && activeSp.periodEnd
          ? estimateMonthsBetween(activeSp.periodStart, activeSp.periodEnd)
          : 1;
        const newAmount = getPriceForPeriod(resolved, months);
        await tx.subscriptionPayment.update({
          where: { id: activeSp.id },
          data: {
            planTier: toTier,
            amount: newAmount,
          },
        });
      }
    }
  );
  logger.info("[admin] change_tier", { targetUserId, fromTier, toTier });
  return NextResponse.json({
    success: true,
    message: `התוכנית שונתה מ-${fromTier} ל-${toTier}. החיוב הבא יבוצע לפי התוכנית החדשה.`,
  });
}

// estimateMonthsBetween — מחזיר את 1/3/6/12 הקרוב ביותר לפער ימים בין periodStart ל-periodEnd
function estimateMonthsBetween(start: Date, end: Date): 1 | 3 | 6 | 12 {
  const days = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 45) return 1;
  if (days <= 135) return 3;
  if (days <= 270) return 6;
  return 12;
}

async function handleOverridePrice(
  session: AdminSession,
  targetUserId: string,
  body: {
    planTier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
    monthlyIls: number;
    quarterlyIls?: number | null;
    halfYearIls?: number | null;
    yearlyIls?: number | null;
    note?: string;
  }
) {
  const v = validateOverridePrice({ amountIls: body.monthlyIls });
  if (!v.allowed) {
    return NextResponse.json({ message: v.reason }, { status: 400 });
  }
  // יוצרים PricingPolicy scope=USER. ה-resolver יבחר אותה בעדיפות עליונה.
  const adminId = session.user.id;
  const now = new Date();
  const policy = await withAudit(
    { kind: "user", session },
    {
      action: "override_price",
      targetType: "user",
      targetId: targetUserId,
      details: {
        planTier: body.planTier,
        monthlyIls: body.monthlyIls,
        quarterlyIls: body.quarterlyIls,
        halfYearIls: body.halfYearIls,
        yearlyIls: body.yearlyIls,
        note: body.note ?? null,
      },
    },
    async (tx) => {
      // SELECT FOR UPDATE על User — סוכן 1 ממצא #1
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${targetUserId} FOR UPDATE`;

      // סגירת policies ישנים של אותו (userId, planTier) — סוכן 1 ממצא #6.
      // המדיניות החדשה תהיה המקור היחיד.
      await tx.pricingPolicy.updateMany({
        where: {
          scope: "USER",
          userId: targetUserId,
          planTier: body.planTier,
          OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        },
        data: {
          validUntil: now,
        },
      });

      const created = await tx.pricingPolicy.create({
        data: {
          scope: "USER",
          userId: targetUserId,
          organizationId: null,
          planTier: body.planTier,
          monthlyIls: body.monthlyIls,
          quarterlyIls: body.quarterlyIls ?? null,
          halfYearIls: body.halfYearIls ?? null,
          yearlyIls: body.yearlyIls ?? null,
          notes: body.note ?? null,
          createdById: adminId,
        },
        select: { id: true },
      });

      // עדכון SP הפעיל (אם planTier תואם) — סוכן 2 ממצא #2.
      // ה-cron הבא יחייב לפי amount החדש.
      const activeSp = await tx.subscriptionPayment.findFirst({
        where: {
          userId: targetUserId,
          status: { in: ["PAID", "PENDING"] },
          planTier: body.planTier,
          nextChargeAt: { not: null, gt: now },
          autoChargeEnabled: true,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, periodStart: true, periodEnd: true },
      });
      if (activeSp) {
        const months =
          activeSp.periodStart && activeSp.periodEnd
            ? estimateMonthsBetween(activeSp.periodStart, activeSp.periodEnd)
            : 1;
        // מחיר חדש לפי תקופה — quarterly/halfYear/yearly fallback ל-monthly*N
        const newAmount =
          months === 1
            ? body.monthlyIls
            : months === 3
              ? body.quarterlyIls ?? body.monthlyIls * 3
              : months === 6
                ? body.halfYearIls ?? body.monthlyIls * 6
                : body.yearlyIls ?? body.monthlyIls * 12;
        await tx.subscriptionPayment.update({
          where: { id: activeSp.id },
          data: { amount: newAmount },
        });
      }

      return created;
    }
  );
  logger.info("[admin] override_price", {
    targetUserId,
    policyId: policy.id,
    planTier: body.planTier,
  });
  return NextResponse.json({
    success: true,
    message: `מחיר מותאם נוצר עבור המשתמש. החיוב הבא יבוצע במחיר החדש.`,
    policyId: policy.id,
  });
}

async function handleSetFree(
  session: AdminSession,
  targetUserId: string,
  isFree: boolean,
  note: string | null
) {
  const v = validateSetFree({ isFree, note });
  if (!v.allowed) {
    return NextResponse.json({ message: v.reason }, { status: 400 });
  }
  await withAudit(
    { kind: "user", session },
    {
      action: isFree ? "set_free" : "unset_free",
      targetType: "user",
      targetId: targetUserId,
      details: { isFree, note },
    },
    async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${targetUserId} FOR UPDATE`;
      // סוכן 1 ממצא #2: אם המשתמש CANCELLED/PAST_DUE/BLOCKED בעת set_free=true,
      // להחזיר ל-ACTIVE כדי שיוכל להשתמש במערכת. unset_free לא נוגע ב-status —
      // חוזר לתשלום רגיל אבל לא משנה אם המנוי פעיל.
      const userBefore = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { subscriptionStatus: true, isBlocked: true, blockReason: true },
      });
      const updates: {
        isFreeSubscription: boolean;
        freeSubscriptionNote: string | null;
        subscriptionStatus?: "ACTIVE";
        isBlocked?: false;
        blockReason?: null;
      } = {
        isFreeSubscription: isFree,
        freeSubscriptionNote: isFree ? note : null,
      };
      if (isFree && userBefore) {
        // מנוי חינם → ACTIVE; ביטול חסימה אם הסיבה DEBT
        if (
          userBefore.subscriptionStatus === "CANCELLED" ||
          userBefore.subscriptionStatus === "PAST_DUE"
        ) {
          updates.subscriptionStatus = "ACTIVE";
        }
        if (
          userBefore.isBlocked &&
          (userBefore.blockReason === "DEBT" || userBefore.blockReason === null)
        ) {
          updates.isBlocked = false;
          updates.blockReason = null;
        }
      }
      return tx.user.update({
        where: { id: targetUserId },
        data: updates,
      });
    }
  );
  // M10.2: סוגרים חלון של 30s ב-JWT cache —
  // subscriptionStatus/isBlocked עלולים להשתנות ב-set_free.
  invalidateJwtCache(targetUserId);
  logger.info("[admin] set_free", { targetUserId, isFree });
  return NextResponse.json({
    success: true,
    message: isFree
      ? "המנוי הוגדר כחינם והופעל."
      : "ביטול המנוי החינמי בוצע — המשתמש חוזר לתשלום רגיל.",
  });
}
