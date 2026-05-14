import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import type { Prisma, PricingScope, AITier } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_SCOPES: readonly PricingScope[] = [
  "GLOBAL",
  "ORGANIZATION",
  "CLINIC_MEMBER",
  "USER",
];
const VALID_TIERS: readonly AITier[] = ["ESSENTIAL", "PRO", "ENTERPRISE"];

const MAX_PAGE_SIZE = 500;

function isPricingScope(v: unknown): v is PricingScope {
  return typeof v === "string" && (VALID_SCOPES as readonly string[]).includes(v);
}

function isAITier(v: unknown): v is AITier {
  return typeof v === "string" && (VALID_TIERS as readonly string[]).includes(v);
}

function isFiniteNonNegativeNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function isValidDecimal2(v: number): boolean {
  // Decimal(10,2) — מקסימום 2 ספרות אחרי הנקודה.
  return Math.round(v * 100) === v * 100;
}

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

    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get("scope");
    const organizationId = searchParams.get("organizationId");
    const userId = searchParams.get("userId");
    const planTierParam = searchParams.get("planTier");
    const activeOnly = searchParams.get("activeOnly") === "true";
    const takeParam = Number(searchParams.get("take") ?? "200");
    const take = Math.min(
      Math.max(Number.isFinite(takeParam) ? takeParam : 200, 1),
      MAX_PAGE_SIZE
    );

    const where: Prisma.PricingPolicyWhereInput = {};
    if (scopeParam !== null && isPricingScope(scopeParam)) where.scope = scopeParam;
    if (organizationId) where.organizationId = organizationId;
    if (userId) where.userId = userId;
    if (planTierParam !== null && isAITier(planTierParam)) where.planTier = planTierParam;
    if (activeOnly) {
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

    const body = (await request.json()) as Record<string, unknown>;
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
    } = body;

    if (!isPricingScope(scope)) {
      return NextResponse.json(
        { message: "ערך 'היקף' לא חוקי" },
        { status: 400 }
      );
    }
    if (!isAITier(planTier)) {
      return NextResponse.json(
        { message: "ערך 'רמת תוכנית' לא חוקי" },
        { status: 400 }
      );
    }
    if (!isFiniteNonNegativeNumber(monthlyIls)) {
      return NextResponse.json(
        { message: "מחיר חודשי חייב להיות מספר אי-שלילי" },
        { status: 400 }
      );
    }
    if (!isValidDecimal2(monthlyIls)) {
      return NextResponse.json(
        { message: "מחיר חודשי יכול להכיל עד 2 ספרות אחרי הנקודה" },
        { status: 400 }
      );
    }
    for (const [keyHe, val] of [
      ["מחיר רבעוני", quarterlyIls],
      ["מחיר חצי-שנתי", halfYearIls],
      ["מחיר שנתי", yearlyIls],
    ] as const) {
      if (val === null || val === undefined) continue;
      if (!isFiniteNonNegativeNumber(val)) {
        return NextResponse.json(
          { message: `${keyHe} חייב להיות מספר אי-שלילי או ריק` },
          { status: 400 }
        );
      }
      if (!isValidDecimal2(val)) {
        return NextResponse.json(
          { message: `${keyHe} יכול להכיל עד 2 ספרות אחרי הנקודה` },
          { status: 400 }
        );
      }
    }

    const orgIdStr = typeof organizationId === "string" ? organizationId : null;
    const userIdStr = typeof userId === "string" ? userId : null;
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

    // Validation של תאריכים — תופס Invalid Date
    const validFromDate = validFrom ? new Date(validFrom as string) : new Date();
    if (Number.isNaN(validFromDate.getTime())) {
      return NextResponse.json(
        { message: "תאריך התחלה לא חוקי" },
        { status: 400 }
      );
    }
    const validUntilDate = validUntil ? new Date(validUntil as string) : null;
    if (validUntilDate && Number.isNaN(validUntilDate.getTime())) {
      return NextResponse.json(
        { message: "תאריך סיום לא חוקי" },
        { status: 400 }
      );
    }
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
            quarterlyIls: typeof quarterlyIls === "number" ? quarterlyIls : null,
            halfYearIls: typeof halfYearIls === "number" ? halfYearIls : null,
            yearlyIls: typeof yearlyIls === "number" ? yearlyIls : null,
            validFrom: validFromDate,
            validUntil: validUntilDate,
            notes: typeof notes === "string" ? notes : null,
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
