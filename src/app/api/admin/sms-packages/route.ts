import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { parseBody } from "@/lib/validations/helpers";
import { createSmsPackageSchema } from "@/lib/validations/billing";

export const dynamic = "force-dynamic";

// GET — רשימת חבילות SMS (Package.type=SMS).
export async function GET() {
  try {
    const auth = await requirePermission("packages.catalog_manage");
    if ("error" in auth) return auth.error;

    const packages = await prisma.package.findMany({
      where: { type: "SMS" },
      include: {
        _count: { select: { purchases: true } },
      },
      orderBy: [{ isActive: "desc" }, { credits: "asc" }],
    });

    return NextResponse.json(JSON.parse(JSON.stringify(packages)));
  } catch (error) {
    logger.error("[admin/sms-packages] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת חבילות ה-SMS" },
      { status: 500 }
    );
  }
}

// POST — יצירת חבילת SMS חדשה.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("packages.catalog_manage");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const parsed = await parseBody(request, createSmsPackageSchema);
    if ("error" in parsed) return parsed.error;
    const { name, credits, priceIls, isActive } = parsed.data;

    const pkg = await withAudit(
      { kind: "user", session },
      {
        action: "create_sms_package",
        targetType: "Package",
        details: { name, credits, priceIls },
      },
      async (tx) => {
        return tx.package.create({
          data: {
            type: "SMS",
            name,
            credits,
            priceIls,
            isActive: isActive !== false,
          },
        });
      }
    );

    return NextResponse.json(JSON.parse(JSON.stringify(pkg)));
  } catch (error) {
    logger.error("[admin/sms-packages] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת חבילת ה-SMS" },
      { status: 500 }
    );
  }
}
