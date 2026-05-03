import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

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

    const body = await request.json();
    const { name, credits, priceIls, isActive } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ message: "נדרש שם חבילה" }, { status: 400 });
    }
    if (typeof credits !== "number" || credits <= 0 || !Number.isInteger(credits)) {
      return NextResponse.json(
        { message: "כמות יחידות חייבת להיות מספר שלם חיובי" },
        { status: 400 }
      );
    }
    if (typeof priceIls !== "number" || priceIls < 0) {
      return NextResponse.json(
        { message: "מחיר חייב להיות מספר אי-שלילי" },
        { status: 400 }
      );
    }

    const pkg = await withAudit(
      { kind: "user", session },
      {
        action: "create_sms_package",
        targetType: "Package",
        details: { name: String(name).trim(), credits, priceIls },
      },
      async (tx) => {
        return tx.package.create({
          data: {
            type: "SMS",
            name: String(name).trim(),
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
