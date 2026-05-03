import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET — רשימת חוזים מותאמים. תומך בסינון ?status=active|expiring|expired|all.
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const now = new Date();
    const expiringIn30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const where: Prisma.CustomContractWhereInput = {};
    if (status === "active") {
      where.startDate = { lte: now };
      where.endDate = { gt: now };
    } else if (status === "expiring") {
      where.startDate = { lte: now };
      where.endDate = { gt: now, lte: expiringIn30Days };
    } else if (status === "expired") {
      where.endDate = { lte: now };
    } else if (status === "future") {
      where.startDate = { gt: now };
    }

    const contracts = await prisma.customContract.findMany({
      where,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            owner: { select: { id: true, name: true, email: true } },
            pricingPlan: { select: { name: true, internalCode: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ endDate: "asc" }],
    });

    return NextResponse.json(JSON.parse(JSON.stringify(contracts)));
  } catch (error) {
    logger.error("[admin/custom-contracts] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת החוזים" },
      { status: 500 }
    );
  }
}

// POST — יצירת חוזה מותאם חדש לקליניקה. 1-1 לארגון — נכשל אם כבר קיים חוזה.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session, userId } = auth;

    const body = await request.json();
    const {
      organizationId,
      monthlyEquivPriceIls,
      billingCycleMonths,
      customSmsQuota,
      customAiTier,
      startDate,
      endDate,
      autoRenew,
      renewalMonths,
      annualIncreasePct,
      signedDocumentUrl,
      notes,
    } = body;

    if (!organizationId) {
      return NextResponse.json({ message: "נדרש לבחור קליניקה" }, { status: 400 });
    }
    if (typeof monthlyEquivPriceIls !== "number" || monthlyEquivPriceIls < 0) {
      return NextResponse.json(
        { message: "מחיר חודשי חייב להיות מספר אי-שלילי" },
        { status: 400 }
      );
    }
    if (!startDate || !endDate) {
      return NextResponse.json(
        { message: "נדרש תאריך תחילה וסיום" },
        { status: 400 }
      );
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ message: "תאריך לא תקין" }, { status: 400 });
    }
    if (end <= start) {
      return NextResponse.json(
        { message: "תאריך סיום חייב להיות אחרי תאריך תחילה" },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, customContract: { select: { id: true } } },
    });
    if (!org) {
      return NextResponse.json({ message: "הקליניקה לא נמצאה" }, { status: 400 });
    }
    if (org.customContract) {
      return NextResponse.json(
        { message: "כבר קיים חוזה מותאם לקליניקה זו — ערוך/י אותו במקום ליצור חדש" },
        { status: 400 }
      );
    }

    const contract = await withAudit(
      { kind: "user", session },
      {
        action: "create_custom_contract",
        targetType: "CustomContract",
        details: {
          organizationId,
          orgName: org.name,
          monthlyEquivPriceIls,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        },
      },
      async (tx) => {
        return tx.customContract.create({
          data: {
            organizationId,
            monthlyEquivPriceIls,
            billingCycleMonths: billingCycleMonths ?? 1,
            customSmsQuota: customSmsQuota ?? null,
            customAiTier: customAiTier ?? null,
            startDate: start,
            endDate: end,
            autoRenew: Boolean(autoRenew),
            renewalMonths: renewalMonths ?? 12,
            annualIncreasePct: annualIncreasePct ?? null,
            signedDocumentUrl: signedDocumentUrl?.trim() || null,
            notes: notes?.trim() || null,
            createdById: userId,
          },
        });
      }
    );

    return NextResponse.json(JSON.parse(JSON.stringify(contract)));
  } catch (error) {
    logger.error("[admin/custom-contracts] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת החוזה" },
      { status: 500 }
    );
  }
}
