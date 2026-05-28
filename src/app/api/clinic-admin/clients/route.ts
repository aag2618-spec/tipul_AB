import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireClinicAdminAccess } from "@/lib/clinic/require-clinic-owner";

export const dynamic = "force-dynamic";

// GET — רשימת מטופלים בקליניקה לדפי clinic-admin.
// תומך ב-?q=search לפי שם/טלפון/אימייל.
//
// Phase 4 follow-up: פתוח גם למזכיר/ה עם canTransferClient — דף ההעברה צריך
// את הרשימה הזו כדי להציג את המטופלים לבחירה. השדות המוחזרים הם
// אדמיניסטרטיביים בלבד (firstName/lastName/phone/email/status/therapist/_count) —
// אין כאן תוכן קליני, כך שזה תואם לחסימת CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireClinicAdminAccess({
      allowSecretaryWith: "canTransferClient",
    });
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || undefined;
    const limit = Math.min(Number(searchParams.get("limit") || "100"), 500);

    const where: Prisma.ClientWhereInput = { organizationId };
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
