import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET — חיפוש משתמשים שניתן להוסיף כחברי קליניקה.
// קריטריונים: לא חסום, לא משויך לארגון, role=USER (לא ADMIN/MANAGER/CLINIC_*).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // אימות שהמשתמש הוא בעל קליניקה
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, clinicRole: true, organizationId: true },
    });
    if (!me) {
      return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 });
    }
    const isOwner = me.role === "CLINIC_OWNER" || me.clinicRole === "OWNER";
    if (!isOwner && me.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    if (q.length < 2) {
      return NextResponse.json([]);
    }

    const users = await prisma.user.findMany({
      where: {
        isBlocked: false,
        organizationId: null,
        role: "USER",
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: [{ name: "asc" }],
      take: 20,
    });

    return NextResponse.json(users);
  } catch (error) {
    logger.error("[clinic-admin/members/search] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בחיפוש משתמשים" },
      { status: 500 }
    );
  }
}
