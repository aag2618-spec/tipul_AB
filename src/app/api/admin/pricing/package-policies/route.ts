import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import type { Prisma, PricingScope } from "@prisma/client";
import { parseBody, parseSearchParams } from "@/lib/validations/helpers";
import {
  packagePoliciesQuerySchema,
  createPackagePolicySchema,
} from "@/lib/validations/billing";

export const dynamic = "force-dynamic";

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

    const parsed = parseSearchParams(request.url, packagePoliciesQuerySchema);
    if ("error" in parsed) return parsed.error;
    const { scope, organizationId, userId, packageType, activeOnly, take } =
      parsed.data;

    const where: Prisma.PackagePricingPolicyWhereInput = {};
    if (scope) where.scope = scope;
    if (organizationId) where.organizationId = organizationId;
    if (userId) where.userId = userId;
    if (packageType) where.packageType = packageType;
    if (activeOnly === "true") {
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

    const parsed = await parseBody(request, createPackagePolicySchema);
    if ("error" in parsed) return parsed.error;
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
    } = parsed.data;

    const orgIdStr = organizationId ?? null;
    const userIdStr = userId ?? null;
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

    const validFromDate = validFrom ? new Date(validFrom) : new Date();
    const validUntilDate = validUntil ? new Date(validUntil) : null;
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
            notes: notes ?? null,
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
