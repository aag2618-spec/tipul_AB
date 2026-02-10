// src/app/api/admin/terms/route.ts
// API לצפייה באישורי תנאים - רק לאדמין
// רשומות אלו הן הוכחה חוקית ולא ניתנות למחיקה

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    // בדיקת הרשאות אדמין
    const admin = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (admin?.role !== "ADMIN") {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    // פרמטרים
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    // בניית query
    const where: Record<string, unknown> = {};
    if (userId) {
      where.userId = userId;
    }

    const [records, total] = await Promise.all([
      prisma.termsAcceptance.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          userEmail: true,
          userName: true,
          termsVersion: true,
          termsType: true,
          acceptedContent: true,
          action: true,
          planSelected: true,
          billingMonths: true,
          amountAgreed: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
        },
      }),
      prisma.termsAcceptance.count({ where }),
    ]);

    return NextResponse.json({
      records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Terms acceptance query error:", error);
    return NextResponse.json(
      { error: "שגיאה בשליפת אישורי תנאים" },
      { status: 500 }
    );
  }
}

// אין DELETE - רשומות אלו לעולם לא נמחקות!
// אין PUT/PATCH - רשומות אלו לא ניתנות לעריכה!
