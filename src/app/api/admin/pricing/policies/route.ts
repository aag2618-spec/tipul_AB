import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import type { Prisma, PricingScope } from "@prisma/client";
import { parseBody, parseSearchParams } from "@/lib/validations/helpers";
import {
  pricingPoliciesQuerySchema,
  createPricingPolicySchema,
} from "@/lib/validations/billing";

export const dynamic = "force-dynamic";

/**
 * Validation לפי scope (תואם ל-CHECK constraint ב-DB):
 *   - GLOBAL: organizationId=null, userId=null
 *   - ORGANIZATION: organizationId נדרש, userId=null
 *   - CLINIC_MEMBER: organizationId נדרש, userId נדרש
 *   - USER: organizationId=null, userId נדרש
 */
function validateScopeIds(
  scope: PricingScope,
  organizationId: string | null,
  userId: string | null
): { ok: true } | { ok: false; message: string } {
  switch (scope) {
    case "GLOBAL":
      if (organizationId || userId) {
        return { ok: false, message: "מדיניות כללית לא יכולה לכלול קליניקה או משתמש" };
      }
      return { ok: true };
    case "ORGANIZATION":
      if (!organizationId) {
        return { ok: false, message: "מדיניות לקליניקה דורשת בחירת קליניקה" };
      }
      if (userId) {
        return { ok: false, message: "מדיניות לקליניקה לא יכולה לכלול משתמש" };
      }
      return { ok: true };
    case "CLINIC_MEMBER":
      if (!organizationId || !userId) {
        return {
          ok: false,
          message: "מדיניות למטפלת בקליניקה דורשת גם קליניקה וגם משתמש",
        };
      }
      return { ok: true };
    case "USER":
      if (!userId) {
        return { ok: false, message: "מדיניות למשתמש דורשת בחירת משתמש" };
      }
      if (organizationId) {
        return { ok: false, message: "מדיניות למשתמש לא יכולה לכלול קליניקה" };
      }
      return { ok: true };
  }
}

// ============================================================================
// GET — רשימת PricingPolicy עם סינון אופציונלי + pagination
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    const parsed = parseSearchParams(request.url, pricingPoliciesQuerySchema);
    if ("error" in parsed) return parsed.error;
    const { scope, organizationId, userId, planTier, activeOnly, take } =
      parsed.data;

    const where: Prisma.PricingPolicyWhereInput = {};
    if (scope) where.scope = scope;
    if (organizationId) where.organizationId = organizationId;
    if (userId) where.userId = userId;
    if (planTier) where.planTier = planTier;
    if (activeOnly === "true") {
      const now = new Date();
      where.validFrom = { lte: now };
      where.AND = [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }];
    }

    const policies = await prisma.pricingPolicy.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        targetUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ scope: "asc" }, { validFrom: "desc" }],
      take,
    });

    // המרת Decimal ל-number מפורש למניעת אובדן דיוק ב-JSON
    const serialized = policies.map((p) => ({
      ...p,
      monthlyIls: Number(p.monthlyIls),
      quarterlyIls: p.quarterlyIls === null ? null : Number(p.quarterlyIls),
      halfYearIls: p.halfYearIls === null ? null : Number(p.halfYearIls),
      yearlyIls: p.yearlyIls === null ? null : Number(p.yearlyIls),
    }));

    return NextResponse.json(JSON.parse(JSON.stringify(serialized)));
  } catch (error) {
    logger.error("[admin/pricing/policies] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת מדיניות התמחור" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST — יצירת PricingPolicy חדשה
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session, userId: adminId } = auth;

    // התחזות חוסמת פעולות כספיות — האדמין שיוצר policy חייב להיות הוא עצמו.
    if (session.user.actingAs) {
      return NextResponse.json(
        {
          message:
            "אסור לשנות תמחור במצב התחזות. צא/י ממצב ההתחזות ונסה/י שוב.",
        },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, createPricingPolicySchema);
    if ("error" in parsed) return parsed.error;
    const {
      scope,
      organizationId,
      userId,
      planTier,
      monthlyIls,
      quarterlyIls,
      halfYearIls,
      yearlyIls,
      validFrom,
      validUntil,
      notes,
    } = parsed.data;

    const orgIdStr = organizationId ?? null;
    const userIdStr = userId ?? null;
    const scopeCheck = validateScopeIds(scope, orgIdStr, userIdStr);
    if (!scopeCheck.ok) {
      return NextResponse.json({ message: scopeCheck.message }, { status: 400 });
    }

    // Self-grant protection — אסור לאדמין ליצור policy שמטרגטת אותו עצמו,
    // ללא קשר למחיר. אדמין צריך לעבור דרך admin אחר (4-eyes principle) או
    // דרך פעולה ייעודית לפטור.
    if (userIdStr === adminId) {
      return NextResponse.json(
        {
          message:
            "אסור לאדמין ליצור מדיניות תמחור לעצמו. שינוי כזה דורש אישור אדמין אחר.",
        },
        { status: 403 }
      );
    }

    const validFromDate = validFrom ? new Date(validFrom) : new Date();
    const validUntilDate = validUntil ? new Date(validUntil) : null;
    if (validUntilDate && validUntilDate.getTime() <= validFromDate.getTime()) {
      return NextResponse.json(
        { message: "תאריך סיום חייב להיות אחרי תאריך התחלה" },
        { status: 400 }
      );
    }

    // אימות שה-organization/user קיימים — בודקים בתוך ה-transaction ל-TOCTOU safety,
    // אך מתבססים על FK constraint כ-safety net אם נמחקו בין הבדיקה ל-create.
    if (orgIdStr) {
      const org = await prisma.organization.findUnique({
        where: { id: orgIdStr },
        select: { id: true },
      });
      if (!org) return NextResponse.json({ message: "קליניקה לא נמצאה" }, { status: 404 });
    }
    if (userIdStr) {
      const u = await prisma.user.findUnique({
        where: { id: userIdStr },
        select: { id: true },
      });
      if (!u) return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });

      // CLINIC_MEMBER — לוודא שהמשתמש אכן חבר בקליניקה
      if (scope === "CLINIC_MEMBER" && orgIdStr) {
        const member = await prisma.user.findFirst({
          where: { id: userIdStr, organizationId: orgIdStr },
          select: { id: true },
        });
        if (!member) {
          return NextResponse.json(
            { message: "המשתמש אינו חבר בקליניקה שצוינה" },
            { status: 400 }
          );
        }
      }
    }

    const policy = await withAudit(
      { kind: "user", session },
      {
        action: "create_pricing_policy",
        targetType: "PricingPolicy",
        details: {
          scope,
          planTier,
          monthlyIls,
          organizationId: orgIdStr,
          userId: userIdStr,
        },
      },
      (tx) =>
        tx.pricingPolicy.create({
          data: {
            scope,
            organizationId: orgIdStr,
            userId: userIdStr,
            planTier,
            monthlyIls,
            quarterlyIls: quarterlyIls ?? null,
            halfYearIls: halfYearIls ?? null,
            yearlyIls: yearlyIls ?? null,
            validFrom: validFromDate,
            validUntil: validUntilDate,
            notes: notes ?? null,
            createdById: adminId,
          },
        })
    );

    // המרה ל-number לפני החזרה ל-client
    const serialized = {
      ...policy,
      monthlyIls: Number(policy.monthlyIls),
      quarterlyIls: policy.quarterlyIls === null ? null : Number(policy.quarterlyIls),
      halfYearIls: policy.halfYearIls === null ? null : Number(policy.halfYearIls),
      yearlyIls: policy.yearlyIls === null ? null : Number(policy.yearlyIls),
    };

    return NextResponse.json(JSON.parse(JSON.stringify(serialized)));
  } catch (error) {
    logger.error("[admin/pricing/policies] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת מדיניות התמחור" },
      { status: 500 }
    );
  }
}
