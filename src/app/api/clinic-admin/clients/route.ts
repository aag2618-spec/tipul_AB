import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET — רשימת מטופלים בקליניקה (לבעל הקליניקה).
// תומך ב-?q=search לפי שם/טלפון/אימייל.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

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
    if (!me.organizationId) {
      return NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || undefined;
    const limit = Math.min(Number(searchParams.get("limit") || "100"), 500);

    const where: Prisma.ClientWhereInput = { organizationId: me.organizationId };
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    const clients = await prisma.client.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        status: true,
        therapistId: true,
        therapist: { select: { id: true, name: true, email: true } },
        createdAt: true,
        _count: { select: { therapySessions: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: limit,
    });

    return NextResponse.json(JSON.parse(JSON.stringify(clients)));
  } catch (error) {
    logger.error("[clinic-admin/clients] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת מטופלים" },
      { status: 500 }
    );
  }
}
