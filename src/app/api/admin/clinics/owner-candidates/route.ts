import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET — חיפוש משתמשים מועמדים לבעלות על קליניקה.
// קריטריונים: לא חסום, לא משויך לארגון אחר. ?q=email_or_name לחיפוש,
// ?excludeOrgId=id להחרגה (בעת העברת בעלות בתוך אותה קליניקה — מאפשר members הקיימים).
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const excludeOrgId = searchParams.get("excludeOrgId") || undefined;
    const limit = Math.min(Number(searchParams.get("limit") || "20"), 50);

    if (q.length < 2) {
      return NextResponse.json([]);
    }

    const where: Prisma.UserWhereInput = {
      isBlocked: false,
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    };

    // אם excludeOrgId הועבר — מאפשרים members של אותה קליניקה (לצורך העברת בעלות פנימית)
    if (excludeOrgId) {
      where.AND = [
        {
          OR: [
            { organizationId: null },
            { organizationId: excludeOrgId },
          ],
        },
      ];
    } else {
      where.organizationId = null;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        clinicRole: true,
        organizationId: true,
      },
      orderBy: [{ name: "asc" }],
      take: limit,
    });

    // החרגה: משתמש שכבר בעלים של ארגון אחר (Organization.ownerUserId הוא @unique)
    const ownedOrgs = await prisma.organization.findMany({
      where: { ownerUserId: { in: users.map((u) => u.id) } },
      select: { ownerUserId: true, id: true },
    });
    const ownedSet = new Set(
      ownedOrgs
        .filter((o) => !excludeOrgId || o.id !== excludeOrgId)
        .map((o) => o.ownerUserId)
    );

    const filtered = users.filter((u) => !ownedSet.has(u.id));

    return NextResponse.json(filtered);
  } catch (error) {
    logger.error("[admin/clinics/owner-candidates] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בחיפוש מועמדים" },
      { status: 500 }
    );
  }
}
