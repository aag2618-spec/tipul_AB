// src/app/api/subscription/toggle-auto-renew/route.ts
// Stage 4 — דף ניהול מנוי. הפעלה/ביטול של חידוש אוטומטי על המנוי הפעיל.
//
// זה לא ביטול המנוי עצמו (לזה יש /api/subscription/cancel) — רק עצירת cron
// החיוב החוזר. המנוי נשאר ACTIVE עד subscriptionEndsAt; אחרי זה ייסגר.
//
// זרימה:
//   1. requireAuth + rate-limit
//   2. parseBody (zod) — { enabled: boolean }
//   3. enabled=false: validateCanDisableAutoRenew → updateMany על כל ה-SP
//      הפעילים של המשתמש → autoChargeEnabled=false, nextChargeAt=null
//   4. enabled=true: validateCanEnableAutoRenew (דורש savedCardTokenId קיים +
//      SP פעיל) → updateMany → autoChargeEnabled=true, nextChargeAt=periodEnd
//   5. withAudit (פעולה משמעותית — חייב audit trail)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { parseBody } from "@/lib/validations/helpers";
import {
  checkRateLimit,
  SUBSCRIPTION_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";
import {
  validateCanDisableAutoRenew,
  validateCanEnableAutoRenew,
} from "@/lib/payments/subscription-settings";

export const dynamic = "force-dynamic";

// H3: strict — חוסם שדות נוספים (אין מאיפה להעביר mass-assignment).
const toggleSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    // disallowImpersonation — שינוי החיוב של המשתמש; OWNER במצב impersonation
    // לא יעשה את זה בשם target.
    const auth = await requireAuth({ disallowImpersonation: true });
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const rateCheck = checkRateLimit(
      `sub_toggle_renew:${userId}`,
      SUBSCRIPTION_RATE_LIMIT
    );
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck);

    const parsed = await parseBody(request, toggleSchema);
    if ("error" in parsed) return parsed.error;
    const { enabled } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        subscriptionStatus: true,
        billingPaidByClinic: true,
        isBlocked: true,
      },
    });
    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    // SubscriptionPayment "פעיל" = יש לו periodEnd עתידי או status PAID/PENDING
    // המשמש לחיוב הבא. סוכן 1 #4 — disable מפעיל updateMany על הכל;
    // enable היה מוגבל ל-top 5 ויוצר אסימטריה. עכשיו שניהם סורקים את אותה
    // קבוצה (PAID/PENDING) ללא take.
    const now = new Date();
    const activeSubscriptionPayments = await prisma.subscriptionPayment.findMany({
      where: {
        userId,
        status: { in: ["PAID", "PENDING"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        autoChargeEnabled: true,
        savedCardTokenId: true,
        nextChargeAt: true,
        periodEnd: true,
      },
    });

    const hasActiveSP = activeSubscriptionPayments.some(
      (sp) =>
        // SP "פעיל" לחיוב הבא = periodEnd עתידי או status PENDING
        sp.periodEnd === null || sp.periodEnd.getTime() > now.getTime()
    );
    const anyAutoEnabled = activeSubscriptionPayments.some(
      (sp) => sp.autoChargeEnabled
    );
    // סוכן 1 #5: בודקים את SavedCardToken עצמו (לא רק דרך SP.savedCardTokenId)
    // כדי לתפוס מצב של "המשתמש עדכן כרטיס אבל ה-SPs טרם חוברו" (תיאורטי כי
    // ה-webhook מחבר אוטומטית, אבל לבדוק לכל הצדדים).
    const activeSavedTokenCount = await prisma.savedCardToken.count({
      where: {
        tenant: "ADMIN",
        subscriberId: userId,
        isActive: true,
        deletedAt: null,
      },
    });
    const hasActiveSavedToken = activeSavedTokenCount > 0;

    if (enabled) {
      // ── הפעלת חידוש מחדש ──
      const validation = validateCanEnableAutoRenew({
        subscriptionStatus: user.subscriptionStatus,
        billingPaidByClinic: user.billingPaidByClinic,
        isBlocked: user.isBlocked,
        hasActiveSavedCardToken: hasActiveSavedToken,
        hasActiveSubscriptionPayment: hasActiveSP,
      });
      if (!validation.allowed) {
        return NextResponse.json(
          { message: validation.reason },
          { status: 400 }
        );
      }

      // סוכן 1 #3 + סוכן 5 #4: nextChargeAt לעולם לא בעבר.
      // מסננים SPs ל-periodEnd עתידי (לא ניתן להפעיל חידוש על תקופה שפגה).
      const eligibleSps = activeSubscriptionPayments.filter(
        (sp) =>
          sp.savedCardTokenId !== null &&
          sp.periodEnd !== null &&
          sp.periodEnd.getTime() > now.getTime()
      );
      if (eligibleSps.length === 0) {
        return NextResponse.json(
          {
            message:
              "אין תקופה פעילה לחדש. יש לרכוש מנוי חדש בדף החיוב.",
          },
          { status: 400 }
        );
      }

      const updateResult = await withAudit(
        { kind: "user", session },
        {
          action: "subscription_auto_renew_enabled",
          targetType: "user",
          targetId: userId,
          details: {
            affectedSubscriptionPayments: eligibleSps.map((sp) => sp.id),
          },
        },
        async (tx) => {
          // 2 updateMany ב-2 קבוצות (סוכן 5 #2):
          // (א) SPs עם nextChargeAt קיים → רק autoChargeEnabled
          // (ב) SPs בלי nextChargeAt → autoChargeEnabled + nextChargeAt=periodEnd
          const idsWithNext = eligibleSps
            .filter((sp) => sp.nextChargeAt !== null)
            .map((sp) => sp.id);
          const idsWithoutNext = eligibleSps
            .filter((sp) => sp.nextChargeAt === null)
            .map((sp) => sp.id);

          let updated = 0;
          if (idsWithNext.length > 0) {
            const r = await tx.subscriptionPayment.updateMany({
              where: { id: { in: idsWithNext } },
              data: { autoChargeEnabled: true },
            });
            updated += r.count;
          }
          // SPs ללא nextChargeAt — להגדיר ל-periodEnd. updateMany לא תומך
          // בערך-לפי-שורה, אז עוברים בלולאה אבל רק על תת-קבוצה מצומצמת.
          for (const sp of eligibleSps.filter(
            (s) => s.nextChargeAt === null
          )) {
            await tx.subscriptionPayment.update({
              where: { id: sp.id },
              data: {
                autoChargeEnabled: true,
                nextChargeAt: sp.periodEnd,
              },
            });
            updated++;
          }
          return { updated, idsWithoutNext: idsWithoutNext.length };
        }
      );

      logger.info("[subscription/toggle-auto-renew] enabled", {
        userId,
        affected: updateResult.updated,
      });

      return NextResponse.json({
        success: true,
        enabled: true,
        affected: updateResult.updated,
        message: "החידוש האוטומטי הופעל בהצלחה.",
      });
    }

    // ── ביטול חידוש ──
    const validation = validateCanDisableAutoRenew({
      subscriptionStatus: user.subscriptionStatus,
      billingPaidByClinic: user.billingPaidByClinic,
      hasActiveSubscriptionPayment: hasActiveSP,
      anyAutoChargeEnabled: anyAutoEnabled,
    });
    if (!validation.allowed) {
      return NextResponse.json({ message: validation.reason }, { status: 400 });
    }

    const updateResult = await withAudit(
      { kind: "user", session },
      {
        action: "subscription_auto_renew_disabled",
        targetType: "user",
        targetId: userId,
        details: {
          affectedSubscriptionPayments: activeSubscriptionPayments
            .filter((sp) => sp.autoChargeEnabled)
            .map((sp) => sp.id),
        },
      },
      async (tx) => {
        const upd = await tx.subscriptionPayment.updateMany({
          where: {
            userId,
            autoChargeEnabled: true,
          },
          data: {
            autoChargeEnabled: false,
            nextChargeAt: null,
          },
        });
        return { updated: upd.count };
      }
    );

    logger.info("[subscription/toggle-auto-renew] disabled", {
      userId,
      affected: updateResult.updated,
    });

    return NextResponse.json({
      success: true,
      enabled: false,
      affected: updateResult.updated,
      message:
        "החידוש האוטומטי בוטל. המנוי יישאר פעיל עד סוף התקופה הנוכחית.",
    });
  } catch (error) {
    logger.error("[subscription/toggle-auto-renew] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בעדכון החידוש האוטומטי" },
      { status: 500 }
    );
  }
}
