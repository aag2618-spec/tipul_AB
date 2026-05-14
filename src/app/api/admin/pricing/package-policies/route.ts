import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import type { Prisma, PricingScope, PackageType } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_SCOPES: readonly PricingScope[] = [
  "GLOBAL",
  "ORGANIZATION",
  "CLINIC_MEMBER",
  "USER",
];
const VALID_TYPES: readonly PackageType[] = ["SMS", "AI_DETAILED_ANALYSIS"];
const MAX_PAGE_SIZE = 500;

function isPricingScope(v: unknown): v is PricingScope {
  return typeof v === "string" && (VALID_SCOPES as readonly string[]).includes(v);
}

function isPackageType(v: unknown): v is PackageType {
  return typeof v === "string" && (VALID_TYPES as readonly string[]).includes(v);
}

function isFiniteNonNegativeNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function isValidDecimal2(v: number): boolean {
  return Math.round(v * 100) === v * 100;
}

function validateScopeIds(
  scope: PricingScope,
  organizationId: string | null,
  userId: string | null
): { ok: true } | { ok: false; message: string } {
  switch (scope) {
    case "GLOBAL":
      if (organizationId || userId)
        return { ok: false, message: "מדיניות כללית לא יכולה לכלול קליניקה או משתמש" };
      return { ok: true };
    case "ORGANIZATION":
      if (!organizationId)
        return { ok: false, message: "מדיניות לקליניקה דורשת בחירת קליניקה" };
      if (userId)
        return { ok: false, message: "מדיניות לקליניקה לא יכולה לכלול משתמש" };
      return { ok: true };
    case "CLINIC_MEMBER":
      if (!organizationId || !userId)
        return {
          ok: false,
          message: "מדיניות למטפלת בקליניקה דורשת גם קליניקה וגם משתמש",
        };
      return { ok: true };
    case "USER":
      if (!userId) return { ok: false, message: "מדיניות למשתמש דורשת בחירת משתמש" };
      if (organizationId)
        return { ok: false, message: "מדיניות למשתמש לא יכולה לכלול קליניקה" };
      return { ok: true };
  }
}

// ============================================================================
// GET
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get("scope");
    const organizationId = searchParams.get("organizationId");
    const userId = searchParams.get("userId");
    const packageTypeParam = searchParams.get("packageType");
    const activeOnly = searchParams.get("activeOnly") === "true";
    const takeParam = Number(searchParams.get("take") ?? "200");
    const take = Math.min(
      Math.max(Number.isFinite(takeParam) ? takeParam : 200, 1),
      MAX_PAGE_SIZE
    );

    const where: Prisma.PackagePricingPolicyWhereInput = {};
    if (scopeParam !== null && isPricingScope(scopeParam)) where.scope = scopeParam;
    if (organizationId) where.organizationId = organizationId;
    if (userId) where.userId = userId;
    if (packageTypeParam !== null && isPackageType(packageTypeParam))
      where.packageType = packageTypeParam;
    if (activeOnly) {
      const now = new Date();
      where.validFrom = { lte: now };
      where.AND = [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }];
    }

    const policies = await prisma.packagePricingPolicy.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        targetUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ scope: "asc" }, { credits: "asc" }, { validFrom: "desc" }],
      take,
    });

    const serialized = policies.map((p) => ({
      ...p,
      priceIls: Number(p.priceIls),
    }));

    return NextResponse.json(JSON.parse(JSON.stringify(serialized)));
  } catch (error) {
    logger.error("[admin/pricing/package-policies] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת מדיניות התמחור" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session, userId: adminId } = auth;

    if (session.user.actingAs) {
      return NextResponse.json(
        { message: "אסור לשנות תמחור במצב התחזות" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const {
      scope,
      organizationId,
      userId,
      packageType,
      credits,
      priceIls,
      validFrom,
      validUntil,
      notes,
    } = body;

    if (!isPricingScope(scope)) {
      return NextResponse.json({ message: "ערך 'היקף' לא חוקי" }, { status: 400 });
    }
    if (!isPackageType(packageType)) {
      return NextResponse.json(
        { message: "ערך 'סוג חבילה' לא חוקי" },
        { status: 400 }
      );
    }
    if (!isPositiveInt(credits)) {
      return NextResponse.json(
        { message: "מספר היחידות חייב להיות שלם וחיובי" },
        { status: 400 }
      );
    }
    if (!isFiniteNonNegativeNumber(priceIls)) {
      return NextResponse.json(
        { message: "מחיר חייב להיות מספר אי-שלילי" },
        { status: 400 }
      );
    }
    if (!isValidDecimal2(priceIls)) {
      return NextResponse.json(
        { message: "מחיר יכול להכיל עד 2 ספרות אחרי הנקודה" },
        { status: 400 }
      );
    }

    const orgIdStr = typeof organizationId === "string" ? organizationId : null;
    const userIdStr = typeof userId === "string" ? userId : null;
    const scopeCheck = validateScopeIds(scope, orgIdStr, userIdStr);
    if (!scopeCheck.ok) {
      return NextResponse.json({ message: scopeCheck.message }, { status: 400 });
    }

    // Self-grant protection — אסור לאדמין ליצור policy לעצמו.
    if (userIdStr === adminId) {
      return NextResponse.json(
        {
          message:
            "אסור לאדמין ליצור מדיניות תמחור לעצמו. שינוי כזה דורש אישור אדמין אחר.",
        },
        { status: 403 }
      );
    }

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
        action: "create_package_pricing_policy",
        targetType: "PackagePricingPolicy",
        details: {
          scope,
          packageType,
          credits,
          priceIls,
          organizationId: orgIdStr,
          userId: userIdStr,
        },
      },
      (tx) =>
        tx.packagePricingPolicy.create({
          data: {
            scope,
            organizationId: orgIdStr,
            userId: userIdStr,
            packageType,
            credits,
            priceIls,
            validFrom: validFromDate,
            validUntil: validUntilDate,
            notes: typeof notes === "string" ? notes : null,
            createdById: adminId,
          },
        })
    );

    const serialized = { ...policy, priceIls: Number(policy.priceIls) };
    return NextResponse.json(JSON.parse(JSON.stringify(serialized)));
  } catch (error) {
    logger.error("[admin/pricing/package-policies] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת מדיניות התמחור" },
      { status: 500 }
    );
  }
}
